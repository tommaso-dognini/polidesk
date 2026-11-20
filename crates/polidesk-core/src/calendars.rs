//! Calendari collegati: iCloud, Google, Microsoft 365 (account istituzionale PoliMi) e qualsiasi calendario .ics,
//! tramite il loro link privato in formato iCal; su macOS anche i calendari dell'app Calendario (EventKit),
//! che comprendono gli account iCloud, Google ed Exchange aggiunti al Mac.
//!
//! PoliDesk non vede mai password o token: il link privato lo copia lo studente dalle impostazioni del suo
//! calendario, i calendari del Mac li legge il sistema (con il permesso dello studente).
//!
//! Sul disco: ~/.polidesk/calendars.json = { feeds: [{ id, name, kind, src, color, enabled, updatedAt, error, count }],
//! events: { <feed id>: [eventi] } }.
use crate::{net, paths, timetable, util};
use anyhow::{anyhow, bail, Result};
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use std::path::PathBuf;

/// URL calendars are fetched again after this long (when the calendar page is opened, or at sync).
const STALE_MS: i64 = 20 * 60 * 1000;
const PALETTE: [&str; 8] = ["#ff9f0a", "#0a84ff", "#30d158", "#bf5af2", "#ff375f", "#64d2ff", "#ffd60a", "#ac8e68"];

fn file() -> PathBuf {
    paths::app_dir().join("calendars.json")
}
fn load() -> Value {
    let mut v = util::read_json(&file()).filter(Value::is_object).unwrap_or_else(|| json!({}));
    if !v["feeds"].is_array() {
        v["feeds"] = json!([]);
    }
    if !v["events"].is_object() {
        v["events"] = json!({});
    }
    v
}
fn save(v: &Value) -> Result<()> {
    util::write_json(&file(), v)
}

/// Linked calendars (without their events).
pub fn list() -> Value {
    json!(load()["feeds"])
}

/// What kind of calendar a link is, from its address.
pub fn kind_of(src: &str) -> &'static str {
    let s = src.to_lowercase();
    if s.contains("icloud.com") {
        "icloud"
    } else if s.contains("google.com") || s.contains("googleusercontent") {
        "google"
    } else if s.contains("outlook.office365.com") || s.contains("outlook.live.com") || s.contains("office.com") || s.contains("polimi.it/owa") {
        "microsoft"
    } else {
        "ics"
    }
}
fn https(src: &str) -> String {
    match src.trim().strip_prefix("webcal://") {
        Some(r) => format!("https://{r}"),
        None => src.trim().to_string(),
    }
}

async fn fetch_ics(src: &str) -> Result<Vec<Value>> {
    let url = https(src);
    if !url.starts_with("https://") && !url.starts_with("http://") {
        bail!("Serve un link che inizia con https:// o webcal://");
    }
    let r = net::client().get(&url).header("Accept", "text/calendar, */*").send().await?;
    if !r.status().is_success() {
        bail!("Il calendario non risponde (HTTP {}): controlla che il link sia ancora valido", r.status().as_u16());
    }
    let text = r.text().await?;
    if !text.contains("BEGIN:VCALENDAR") {
        if url.contains(".html") || text.trim_start().starts_with('<') {
            bail!("Questo è il link HTML del calendario: copia quello in formato ICS (iCal)");
        }
        bail!("Il link non è un calendario in formato ICS (iCal)");
    }
    Ok(timetable::parse_ics_text(&text, ""))
}

/// Link a calendar. `kind`: icloud | google | microsoft | ics | mac. For "mac", `mac_ids` are the calendars to read.
pub async fn add(src: &str, name: &str, kind: &str, color: &str, mac_ids: &[String]) -> Result<Value> {
    let mut v = load();
    let n = v["feeds"].as_array().map(Vec::len).unwrap_or(0);
    let kind = if kind.is_empty() { kind_of(src) } else { kind };
    let src = if kind == "mac" { String::new() } else { https(src) };
    if kind != "mac" && v["feeds"].as_array().into_iter().flatten().any(|f| util::s(f, "src") == src) {
        bail!("Questo calendario è già collegato");
    }
    let id = format!("cal{}", util::short_hash(&format!("{kind}{src}{}{}", mac_ids.join(","), util::now_ms())));
    let default_name = match kind {
        "icloud" => "iCloud",
        "google" => "Google Calendar",
        "microsoft" => "Outlook (PoliMi)",
        "mac" => "Calendari del Mac",
        _ => "Calendario",
    };
    let mut feed = json!({
        "id": id, "kind": kind, "src": src, "macIds": mac_ids,
        "name": if name.trim().is_empty() { default_name } else { name.trim() },
        "color": if color.is_empty() { PALETTE[n % PALETTE.len()] } else { color },
        "enabled": true,
    });
    let events = fetch(&feed).await?;
    feed["updatedAt"] = json!(util::now_ms());
    feed["count"] = json!(events.len());
    v["events"][&id] = json!(events);
    v["feeds"].as_array_mut().unwrap().push(feed.clone());
    save(&v)?;
    Ok(feed)
}

async fn fetch(feed: &Value) -> Result<Vec<Value>> {
    match util::s(feed, "kind") {
        "mac" => {
            let now = Utc::now();
            mac_events(&util::str_list(feed.get("macIds")), now - chrono::Duration::days(60), now + chrono::Duration::days(400)).await
        }
        _ => fetch_ics(util::s(feed, "src")).await,
    }
}

/// Name, colour, visibility.
pub fn update(id: &str, patch: &Value) -> Result<Value> {
    let mut v = load();
    let f = v["feeds"].as_array_mut().and_then(|a| a.iter_mut().find(|f| util::s(f, "id") == id)).ok_or_else(|| anyhow!("Calendario non trovato"))?;
    for k in ["name", "color", "enabled", "macIds"] {
        if let Some(x) = patch.get(k) {
            f[k] = x.clone();
        }
    }
    let out = f.clone();
    save(&v)?;
    Ok(out)
}
pub fn remove(id: &str) -> Result<()> {
    let mut v = load();
    if let Some(a) = v["feeds"].as_array_mut() {
        a.retain(|f| util::s(f, "id") != id);
    }
    if let Some(o) = v["events"].as_object_mut() {
        o.remove(id);
    }
    save(&v)
}

/// Fetch again the calendars that are stale (all of them with `force`). Errors stay on each calendar.
pub async fn refresh(force: bool) -> Result<Value> {
    migrate_legacy();
    let mut v = load();
    let feeds: Vec<Value> = v["feeds"].as_array().cloned().unwrap_or_default();
    let mut changed = 0;
    for f in feeds.iter().filter(|f| f["enabled"].as_bool() != Some(false)) {
        let age = util::now_ms() - f["updatedAt"].as_i64().unwrap_or(0);
        if !force && age < STALE_MS {
            continue;
        }
        let id = util::s(f, "id").to_string();
        let r = fetch(f).await;
        let ff = v["feeds"].as_array_mut().and_then(|a| a.iter_mut().find(|x| util::s(x, "id") == id)).unwrap();
        match r {
            Ok(evs) => {
                ff["updatedAt"] = json!(util::now_ms());
                ff["count"] = json!(evs.len());
                ff["error"] = Value::Null;
                v["events"][&id] = json!(evs);
                changed += 1;
            }
            Err(e) => {
                ff["error"] = json!(e.to_string());
                ff["updatedAt"] = json!(util::now_ms());
            }
        }
    }
    save(&v)?;
    Ok(json!({ "refreshed": changed, "feeds": v["feeds"] }))
}

/// Web calendars added before (stored in the timetable as "extra" events): linked calendars now.
fn migrate_legacy() {
    let mut t = timetable::load();
    let old: Vec<Value> = t["feeds"].as_array().cloned().unwrap_or_default();
    if old.is_empty() {
        return;
    }
    let mut v = load();
    for (i, f) in old.iter().enumerate() {
        let src = https(util::s(f, "src"));
        if src.is_empty() || v["feeds"].as_array().into_iter().flatten().any(|x| util::s(x, "src") == src) {
            continue;
        }
        let id = format!("cal{}", util::short_hash(&src));
        v["feeds"].as_array_mut().unwrap().push(json!({ "id": id, "kind": kind_of(&src), "src": src, "name": util::s(f, "name"), "color": PALETTE[i % PALETTE.len()], "enabled": true, "updatedAt": 0 }));
    }
    let names: Vec<String> = old.iter().map(|f| util::s(f, "name").to_string()).collect();
    if let Some(a) = t["extra"].as_array_mut() {
        a.retain(|e| !names.iter().any(|n| n == util::s(e, "source")));
    }
    t["feeds"] = json!([]);
    if save(&v).is_ok() {
        let _ = util::write_json(&paths::app_dir().join("timetable.json"), &t);
    }
}

/// Events of the visible calendars within [from, to), with their calendar's id, name and colour.
pub fn occurrences(from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<Value> {
    let v = load();
    let mut out = vec![];
    for f in v["feeds"].as_array().into_iter().flatten().filter(|f| f["enabled"].as_bool() != Some(false)) {
        let id = util::s(f, "id");
        let evs = v["events"][id].as_array().cloned().unwrap_or_default();
        for mut e in timetable::expand(&evs, from, to) {
            e["feed"] = json!(id);
            e["feedName"] = f["name"].clone();
            e["color"] = f["color"].clone();
            out.push(e);
        }
    }
    out
}

// ───────────────────────── macOS: the Calendar app (EventKit) ─────────────────────────

/// JXA bridge to EventKit. Modes: status (never asks), list, events <ids json> <from s> <to s>.
const MAC_JS: &str = r#"
ObjC.import('EventKit'); ObjC.import('AppKit');
function hex(c) {
  try { const s = c.colorUsingColorSpace($.NSColorSpace.sRGBColorSpace); const h = x => ('0' + Math.round(x * 255).toString(16)).slice(-2); return '#' + h(s.redComponent) + h(s.greenComponent) + h(s.blueComponent); } catch (e) { return ''; }
}
function run(argv) {
  const mode = argv[0];
  const status = () => Number($.EKEventStore.authorizationStatusForEntityType(0));
  let st = status();
  if (mode === 'status') return JSON.stringify({ status: st });
  const store = $.EKEventStore.alloc.init;
  if (st === 0) {
    let done = false;
    const cb = (g, e) => { done = true; };
    if (store.respondsToSelector('requestFullAccessToEventsWithCompletion:')) store.requestFullAccessToEventsWithCompletion(cb);
    else store.requestAccessToEntityTypeCompletion(0, cb);
    const until = $.NSDate.dateWithTimeIntervalSinceNow(120);
    while (!done && $.NSDate.date.compare(until) < 0) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2));
    st = status();
  }
  if (st !== 3) return JSON.stringify({ error: 'denied', status: st });
  store.reset;
  const cals = ObjC.unwrap(store.calendarsForEntityType(0));
  if (mode === 'list') return JSON.stringify({ calendars: cals.map(c => ({ id: ObjC.unwrap(c.calendarIdentifier), title: ObjC.unwrap(c.title), account: ObjC.unwrap(c.source.title), color: hex(c.color) })) });
  const ids = JSON.parse(argv[1]);
  const sel = cals.filter(c => ids.includes(ObjC.unwrap(c.calendarIdentifier)));
  if (!sel.length) return JSON.stringify({ events: [] });
  const from = $.NSDate.dateWithTimeIntervalSince1970(Number(argv[2])), to = $.NSDate.dateWithTimeIntervalSince1970(Number(argv[3]));
  const evs = ObjC.unwrap(store.eventsMatchingPredicate(store.predicateForEventsWithStartDateEndDateCalendars(from, to, $(sel))));
  return JSON.stringify({ events: evs.map(e => ({ summary: ObjC.unwrap(e.title) || '', location: ObjC.unwrap(e.location) || '', start: e.startDate.timeIntervalSince1970, end: e.endDate.timeIntervalSince1970, allDay: !!e.allDay, cal: ObjC.unwrap(e.calendar.title) })) });
}
"#;

async fn mac(args: &[String]) -> Result<Value> {
    if !cfg!(target_os = "macos") {
        bail!("I calendari del Mac sono disponibili solo su macOS");
    }
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(150),
        tokio::process::Command::new("/usr/bin/osascript").args(["-l", "JavaScript", "-e", MAC_JS]).args(args).kill_on_drop(true).output(),
    )
    .await
    .map_err(|_| anyhow!("Il Calendario del Mac non risponde"))??;
    let text = String::from_utf8_lossy(&out.stdout);
    let v: Value = serde_json::from_str(text.trim()).map_err(|_| anyhow!("Calendario del Mac: {}", util::tail(&String::from_utf8_lossy(&out.stderr), 300)))?;
    if util::s(&v, "error") == "denied" {
        bail!("PoliDesk non ha il permesso di leggere i calendari: consentilo in Impostazioni di Sistema → Privacy e sicurezza → Calendari");
    }
    Ok(v)
}
/// Permission state without asking: 0 = not asked yet, 2 = denied, 3 = allowed.
pub async fn mac_status() -> Value {
    mac(&["status".into()]).await.unwrap_or_else(|e| json!({ "error": e.to_string() }))
}
/// Calendars of the Mac (asks for permission the first time).
pub async fn mac_calendars() -> Result<Value> {
    Ok(mac(&["list".into()]).await?["calendars"].clone())
}
async fn mac_events(ids: &[String], from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<Value>> {
    let v = mac(&["events".into(), json!(ids).to_string(), from.timestamp().to_string(), to.timestamp().to_string()]).await?;
    let iso = |s: f64| DateTime::from_timestamp(s as i64, 0).map(util::iso).unwrap_or_default();
    Ok(v["events"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|e| json!({ "summary": e["summary"], "location": e["location"], "start": iso(util::f(e, "start")), "end": iso(util::f(e, "end")), "allDay": e["allDay"], "description": util::s(e, "cal") }))
        .collect())
}
