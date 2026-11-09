//! Lesson timetable: Polimi "Orario delle lezioni" (parsed with `schedule`), pasted text, any .ics file/URL.
use crate::{net, paths, schedule, util};
use anyhow::{bail, Result};
use chrono::{DateTime, Local, NaiveDate, TimeZone, Timelike, Utc};
use regex::Regex;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::LazyLock;

pub const SERVICE: &str = "https://aunicalogin.polimi.it/aunicalogin/getservizio.xml?id_servizio=398";

fn file() -> PathBuf {
    paths::app_dir().join("timetable.json")
}
pub fn ics_path() -> PathBuf {
    paths::app_dir().join("orario.ics")
}
pub fn load() -> Value {
    let mut t = util::read_json(&file()).filter(Value::is_object).unwrap_or_else(|| json!({ "events": [], "extra": [], "updatedAt": null }));
    for k in ["events", "extra"] {
        if !t[k].is_array() {
            t[k] = json!([]);
        }
    }
    t
}
fn save(t: &Value) -> Result<()> {
    util::write_json(&file(), t)
}

/// Import the textual timetable (from the Servizi Online page or pasted by the student).
pub fn import_text(text: &str) -> Result<Value> {
    let (events, err) = schedule::parse_text(text);
    if events.is_empty() {
        if let Some(e) = err {
            bail!("Orario non riconosciuto: {e}");
        }
    }
    std::fs::write(ics_path(), schedule::to_icalendar(&events))?;
    let stamp = schedule::iso_offset(&Local::now());
    let mut t = load();
    t["events"] = json!(events.iter().map(|e| util::merge(&e.to_json(&stamp), &json!({ "source": "polimi" }))).collect::<Vec<_>>());
    t["updatedAt"] = json!(util::now_iso());
    save(&t)?;
    Ok(json!({ "count": events.len(), "ics": ics_path() }))
}

// ---- minimal .ics import (VEVENT with DTSTART/DTEND/SUMMARY/LOCATION/DESCRIPTION/RRULE) ----
fn ics_dt(v: &str) -> Option<String> {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?").unwrap());
    let m = RX.captures(v)?;
    let n = |i: usize| m.get(i).map(|x| x.as_str().parse::<u32>().unwrap_or(0)).unwrap_or(0);
    let d = NaiveDate::from_ymd_opt(n(1) as i32, n(2), n(3))?.and_hms_opt(n(4), n(5), n(6))?;
    let dt = if m.get(7).is_some() { Utc.from_utc_datetime(&d) } else { Local.from_local_datetime(&d).earliest()?.with_timezone(&Utc) };
    Some(util::iso(dt))
}
pub fn parse_ics_text(ics: &str, source: &str) -> Vec<Value> {
    static UNFOLD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\r?\n[ \t]").unwrap());
    let text = UNFOLD.replace_all(ics, "");
    let mut out = vec![];
    let mut cur: Option<Value> = None;
    for l in text.split('\n').map(|l| l.trim_end_matches('\r')) {
        if l == "BEGIN:VEVENT" {
            cur = Some(json!({}));
        } else if l == "END:VEVENT" {
            if let Some(c) = cur.take() {
                if c.get("start").is_some() {
                    out.push(util::merge(&c, &json!({ "source": source })));
                }
            }
        } else if let Some(c) = cur.as_mut() {
            let Some(i) = l.find(':') else { continue };
            let key = l[..i].split(';').next().unwrap_or("");
            let val = l[i + 1..].replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";");
            match key {
                "DTSTART" => c["start"] = json!(ics_dt(&val)),
                "DTEND" => c["end"] = json!(ics_dt(&val)),
                "SUMMARY" => c["summary"] = json!(val),
                "LOCATION" => c["location"] = json!(val),
                "DESCRIPTION" => c["description"] = json!(val),
                "RRULE" => c["rrule"] = json!(val),
                "RDATE" => c["rdate"] = json!(val),
                "EXDATE" => {
                    let mut ex = util::str_list(c.get("exdate"));
                    ex.extend(val.split(',').filter_map(ics_dt));
                    c["exdate"] = json!(ex);
                }
                _ => {}
            }
            if c.get("start").map(Value::is_null).unwrap_or(false) {
                c.as_object_mut().unwrap().remove("start");
            }
        }
    }
    out
}

/// Import a calendar from a .ics file or an http(s)/webcal URL (e.g. a teacher's Google Calendar).
pub async fn import_ics(src: &str, name: Option<&str>) -> Result<usize> {
    let is_url = src.starts_with("http://") || src.starts_with("https://") || src.starts_with("webcal:");
    let name = name.map(String::from).unwrap_or_else(|| std::path::Path::new(src).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_else(|| src.to_string()));
    let text = if is_url {
        let url = if let Some(r) = src.strip_prefix("webcal:") { format!("https:{r}") } else { src.to_string() };
        net::client().get(url).send().await?.error_for_status()?.text().await?
    } else {
        std::fs::read_to_string(src)?
    };
    let evs = parse_ics_text(&text, &name);
    if evs.is_empty() {
        bail!("Nessun evento trovato nel calendario");
    }
    let n = evs.len();
    let mut t = load();
    let mut extra: Vec<Value> = t["extra"].as_array().cloned().unwrap_or_default().into_iter().filter(|e| util::s(e, "source") != name).collect();
    extra.extend(evs);
    t["extra"] = json!(extra);
    let mut feeds: Vec<Value> = t["feeds"].as_array().cloned().unwrap_or_default().into_iter().filter(|f| util::s(f, "src") != src).collect();
    if is_url {
        feeds.push(json!({ "src": src, "name": name }));
    }
    t["feeds"] = json!(feeds);
    save(&t)?;
    Ok(n)
}

fn rule_dates(s: &str) -> Vec<DateTime<Utc>> {
    s.split(',').filter_map(|x| ics_dt(x.trim()).and_then(|i| util::parse_date(&i))).collect()
}

/// Expand weekly recurrences into concrete occurrences within [from, to).
pub fn occurrences(from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<Value> {
    static UNTIL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"UNTIL=(\d{8})(T\d{6}Z?)?").unwrap());
    static IV: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"INTERVAL=(\d+)").unwrap());
    let t = load();
    let mut out = vec![];
    let occ = |e: &Value, s: DateTime<Utc>, dur: chrono::Duration| {
        json!({ "summary": e["summary"], "location": util::s(e, "location"), "description": util::s(e, "description"), "source": e["source"], "start": util::iso(s), "end": util::iso(s + dur) })
    };
    for e in t["events"].as_array().into_iter().flatten().chain(t["extra"].as_array().into_iter().flatten()) {
        let Some(s0) = util::parse_date(util::s(e, "start")) else { continue };
        let e0 = util::parse_date(util::s(e, "end")).unwrap_or(s0);
        let dur = e0 - s0;
        let (mut until, mut interval, mut weekly) = (to, chrono::Duration::days(7), false);
        if let Some(r) = e["rrule"].as_str() {
            if let Some(m) = UNTIL.captures(r) {
                let d = &m[1];
                if let Some(u) = NaiveDate::parse_from_str(d, "%Y%m%d").ok().and_then(|n| n.and_hms_opt(23, 59, 59)).and_then(|n| Local.from_local_datetime(&n).earliest()) {
                    until = until.min(u.with_timezone(&Utc));
                }
            }
            weekly = r.contains("FREQ=WEEKLY");
            if let Some(m) = IV.captures(r) {
                interval = interval * m[1].parse::<i32>().unwrap_or(1).max(1);
            }
        }
        let exdates: std::collections::HashSet<NaiveDate> = util::str_list(e.get("exdate")).iter().filter_map(|d| util::parse_date(d)).map(|d| d.with_timezone(&Local).date_naive()).collect();
        let s0l = s0.with_timezone(&Local);
        if weekly {
            let mut s = s0;
            while s < until {
                // keep wall-clock time across DST changes
                let sl = s.with_timezone(&Local);
                let fixed = sl.date_naive().and_hms_opt(s0l.hour(), s0l.minute(), 0).and_then(|n| Local.from_local_datetime(&n).earliest()).map(|d| d.with_timezone(&Utc)).unwrap_or(s);
                if fixed >= from && !exdates.contains(&fixed.with_timezone(&Local).date_naive()) {
                    out.push(occ(e, fixed, dur));
                }
                s += interval;
            }
        } else if s0 >= from && s0 < to {
            out.push(occ(e, s0, dur));
        }
        // extra single dates (AUIC timetables, RDATE in .ics)
        if let Some(rd) = e["rdate"].as_str() {
            for d in rule_dates(rd) {
                if d >= from && d < to {
                    out.push(occ(e, d, dur));
                }
            }
        }
    }
    out.sort_by(|a, b| util::s(a, "start").cmp(util::s(b, "start")));
    out
}

/// Does a timetable event belong to this course? (fuzzy match on course name words)
pub fn match_course(summary: &str, course_fullname: &str) -> bool {
    static STRIP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(.*?\)|\[.*?\]|^\d+\s*-\s*").unwrap());
    let name = STRIP.replace_all(&course_fullname.to_uppercase(), "").trim().to_string();
    let s = summary.to_uppercase();
    if name.is_empty() || s.is_empty() {
        return false;
    }
    let words: Vec<&str> = name.split_whitespace().filter(|w| w.chars().count() > 3).collect();
    if words.is_empty() {
        return false;
    }
    let hit = words.iter().filter(|w| s.contains(*w)).count();
    hit as f64 / words.len() as f64 >= 0.6
}
/// Name used to match a course with the timetable.
pub fn course_fullname(course: &Value, manifest: &Value) -> String {
    let f = util::s(&manifest["course"], "fullname");
    if f.is_empty() { util::s(course, "name").to_string() } else { f.to_string() }
}
