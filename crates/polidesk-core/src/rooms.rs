//! Free classrooms, from the public Politecnico "maps_rest" API (no login needed).
//! Building shapes for the map come from the same API (no third-party tiles).
use crate::{net, paths, util};
use anyhow::{bail, Result};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};

const BASE: &str = "https://onlineservices.polimi.it/maps_rest/rest";

async fn get_json(url: &str) -> Result<Value> {
    let r = net::client().get(url).header("Accept", "application/json").send().await?;
    if !r.status().is_success() {
        bail!("HTTP {} {url}", r.status().as_u16());
    }
    Ok(r.json().await?)
}

static MEM: LazyLock<Mutex<Option<Arc<Value>>>> = LazyLock::new(Default::default);

/// Spaces hierarchy + geometry — cached for 7 days.
pub async fn spaces() -> Result<Arc<Value>> {
    if let Some(m) = MEM.lock().unwrap().clone() {
        return Ok(m);
    }
    let cache = paths::cache_dir();
    std::fs::create_dir_all(&cache)?;
    let f = cache.join("spazi-v2.json");
    if let Ok(md) = std::fs::metadata(&f) {
        if (util::now_ms() as f64 - util::mtime_ms(&md)) < 7.0 * 864e5 {
            if let Some(v) = util::read_json(&f) {
                let a = Arc::new(v);
                *MEM.lock().unwrap() = Some(a.clone());
                return Ok(a);
            }
        }
    }
    let d = get_json(&format!("{BASE}/spazi/")).await?;
    let feats = |k: &str| d[k]["features"].as_array().cloned().unwrap_or_default();
    let mut geo = HashMap::new();
    for ft in feats("edificiGeoJsonLoc") {
        geo.insert(id_str(&ft["properties"]["POLIMI_ID_SPAZIO"]), ft["geometry"].clone());
    }
    let mut pts = HashMap::new();
    for ft in feats("edificiGeoJson") {
        pts.insert(id_str(&ft["properties"]["POLIMI_ID_SPAZIO"]), json!([ft["properties"]["LAT"], ft["properties"]["LNG"]]));
    }
    let mut campus_shape = HashMap::new();
    for ft in feats("campiGeoJsonShapes") {
        campus_shape.insert(id_str(&ft["properties"]["POLIMI_ID_SPAZIO"]), ft["geometry"].clone());
    }
    let arr = |k: &str| d[k].as_array().cloned().unwrap_or_default();
    let (sede, polo) = (arr("sede"), arr("polo"));
    let city: HashMap<String, Value> = sede
        .iter()
        .map(|s| {
            let c = polo.iter().find(|p| p["csim"] == s["csim"]).map(|p| p["nome"].clone()).unwrap_or_else(|| s["nome"].clone());
            (id_str(&s["csis"]), c)
        })
        .collect();
    let vis = |x: &Value| util::s(x, "visibile") == "S";
    let nn = |v: Option<&Value>| v.cloned().unwrap_or(Value::Null);
    let mem = json!({
        "sedi": sede.iter().filter(|s| vis(s)).map(|s| json!({ "id": s["csis"], "name": s["nome"], "city": nn(city.get(&id_str(&s["csis"]))) })).collect::<Vec<_>>(),
        "campus": arr("campus").iter().filter(|c| vis(c)).map(|c| json!({ "id": c["csic"], "sede": c["csis"], "name": c["nome"], "city": nn(city.get(&id_str(&c["csis"]))), "shape": nn(campus_shape.get(&id_str(&c["csic"]))) })).collect::<Vec<_>>(),
        "edifici": arr("edificio").iter().map(|e| {
            let addr: Vec<&str> = ["prefissoToponomastico", "indirizzo", "numeroCivico"].iter().map(|k| util::s(e, k)).filter(|x| !x.is_empty()).collect();
            json!({ "id": e["csie"], "campus": e["csic"], "name": e["nome"], "label": util::s(e, "etichettaMappa"), "address": addr.join(" "), "geo": nn(geo.get(&id_str(&e["csie"]))), "point": nn(pts.get(&id_str(&e["csie"]))) })
        }).collect::<Vec<_>>(),
        "aule": arr("aula").iter().filter(|a| util::s(a, "fittizia") != "S" && util::s(a, "uso_test") != "S").map(|a| {
            let cap = util::f(a, "capienza");
            let foto = id_str(&a["idfoto"]);
            json!({
                "id": a["idaula"], "name": first_nonempty(a, &["sigla", "denominazione"]), "edificio": a["csie"], "piano": a["csip"],
                "capienza": if cap > 0.0 { json!(cap as i64) } else { Value::Null },
                "tipo": first_nonempty(a, &["tipologia", "categoria"]), "descrizione": first_nonempty(a, &["descrizione", "denominazione"]),
                "foto": if !foto.is_empty() && foto != "0" { json!(foto) } else { Value::Null },
            })
        }).collect::<Vec<_>>(),
    });
    std::fs::write(&f, serde_json::to_string(&mem)?)?;
    let a = Arc::new(mem);
    *MEM.lock().unwrap() = Some(a.clone());
    Ok(a)
}
fn id_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}
fn first_nonempty(v: &Value, keys: &[&str]) -> Value {
    keys.iter().map(|k| util::s(v, k)).find(|s| !s.is_empty()).map(|s| json!(s)).unwrap_or(json!(""))
}

fn to_min(hhmm: &str) -> i64 {
    let mut it = hhmm.split(':').map(|x| x.trim().parse::<i64>().unwrap_or(0));
    it.next().unwrap_or(0) * 60 + it.next().unwrap_or(0)
}

static OCC: LazyLock<Mutex<HashMap<String, Option<Vec<Value>>>>> = LazyLock::new(Default::default);
/// Occupation slots of one room on a date (YYYYMMDD), cached. None = hidden by Polimi; Err = network.
pub async fn occupation(idaula: &str, ymd: &str) -> Result<Option<Vec<Value>>> {
    let k = format!("{idaula}:{ymd}");
    if let Some(v) = OCC.lock().unwrap().get(&k) {
        return Ok(v.clone());
    }
    let r = get_json(&format!("{BASE}/ricerca/aula/occupazione/{idaula}/{ymd}")).await?;
    let v = r.as_array().map(|a| a.iter().map(|s| json!({ "start": s["inizio"], "end": s["fine"], "corso": s.get("corso").filter(|c| util::truthy(Some(c))).cloned().unwrap_or(Value::Null) })).collect());
    OCC.lock().unwrap().insert(k, v.clone());
    Ok(v)
}

fn status_rank(s: &str) -> u8 {
    match s {
        "free" => 0,
        "partial" => 1,
        _ => 2,
    }
}

/// Status of every room of a campus (or sede) for [from, to) minutes on `date`:
/// 'free' (no overlap), 'partial', 'busy' (busy the whole interval).
pub async fn status(campus: Option<Vec<String>>, sede: Option<&str>, date: &str, from: i64, to: i64, on_progress: &(dyn Fn(f64) + Send + Sync)) -> Result<Value> {
    let sp = spaces().await?;
    let ids: Vec<String> = match campus {
        Some(c) if !c.is_empty() => c,
        _ => sp["campus"].as_array().into_iter().flatten().filter(|c| Some(id_str(&c["sede"]).as_str()) == sede).map(|c| id_str(&c["id"])).collect(),
    };
    let edifici: Vec<&Value> = sp["edifici"].as_array().into_iter().flatten().filter(|e| ids.contains(&id_str(&e["campus"]))).collect();
    let ed_ids: std::collections::HashSet<String> = edifici.iter().map(|e| id_str(&e["id"])).collect();
    let aule: Vec<Value> = sp["aule"].as_array().into_iter().flatten().filter(|a| ed_ids.contains(&id_str(&a["edificio"]))).cloned().collect();
    let day = util::parse_date(date).map(|d| d.with_timezone(&chrono::Local)).unwrap_or_else(chrono::Local::now);
    let ymd = day.format("%Y%m%d").to_string();
    let total = aule.len();
    let done = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let jobs = aule.iter().cloned().map(|a| {
        let (ymd, done) = (ymd.clone(), done.clone());
        async move {
            let occ = occupation(&id_str(&a["id"]), &ymd).await.ok().flatten();
            let n = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            (a, occ, n)
        }
    });
    let mut rows: Vec<Value> = Vec::with_capacity(total);
    let mut st = futures_util::stream::iter(jobs).buffered(8);
    while let Some((a, occ, n)) = st.next().await {
        on_progress(n as f64 / total.max(1) as f64);
        let Some(occ) = occ else {
            rows.push(util::merge(&a, &json!({ "hidden": true })));
            continue;
        };
        let mut busy = 0i64;
        for s in &occ {
            busy += 0.max(to.min(to_min(util::s(s, "end"))) - from.max(to_min(util::s(s, "start"))));
        }
        let len = 1.max(to - from);
        let stt = if busy <= 0 { "free" } else if busy >= len - 1 { "busy" } else { "partial" };
        let mut nexts: Vec<&Value> = occ.iter().filter(|s| to_min(util::s(s, "start")) >= from).collect();
        nexts.sort_by_key(|s| to_min(util::s(s, "start")));
        let free_until = if stt == "free" { nexts.first().map(|s| s["start"].clone()).unwrap_or(Value::Null) } else { Value::Null };
        rows.push(util::merge(&a, &json!({ "occ": occ, "status": stt, "busyFrac": busy as f64 / len as f64, "freeUntil": free_until })));
    }
    let visible: Vec<&Value> = rows.iter().filter(|r| !util::b(r, "hidden")).collect();
    let mut by_b: HashMap<String, Vec<Value>> = HashMap::new();
    for r in &visible {
        by_b.entry(id_str(&r["edificio"])).or_default().push((*r).clone());
    }
    let mut buildings: Vec<Value> = edifici
        .iter()
        .filter_map(|e| {
            let mut rs = by_b.remove(&id_str(&e["id"]))?;
            rs.sort_by(|a, b| status_rank(util::s(a, "status")).cmp(&status_rank(util::s(b, "status"))).then_with(|| util::natural_cmp(util::s(a, "name"), util::s(b, "name"))));
            let free = rs.iter().filter(|r| util::s(r, "status") == "free").count();
            let partial = rs.iter().filter(|r| util::s(r, "status") == "partial").count();
            Some(util::merge(e, &json!({ "rooms": rs, "free": free, "partial": partial })))
        })
        .collect();
    buildings.sort_by(|a, b| {
        (util::f(b, "free") as i64).cmp(&(util::f(a, "free") as i64)).then_with(|| (util::f(b, "partial") as i64).cmp(&(util::f(a, "partial") as i64))).then_with(|| util::natural_cmp(util::s(a, "name"), util::s(b, "name")))
    });
    let shapes: Vec<Value> = sp["campus"].as_array().into_iter().flatten().filter(|c| ids.contains(&id_str(&c["id"]))).map(|c| c["shape"].clone()).filter(|s| !s.is_null()).collect();
    Ok(json!({
        "campus": ids, "shapes": shapes, "buildings": buildings, "total": total, "hidden": rows.len() - visible.len(),
        "free": visible.iter().filter(|r| util::s(r, "status") == "free").count(),
        "partial": visible.iter().filter(|r| util::s(r, "status") == "partial").count(),
    }))
}

/// Local path of a room photo (downloaded once).
pub async fn photo(idfoto: &str) -> Option<PathBuf> {
    if idfoto.is_empty() {
        return None;
    }
    let dir = paths::cache_dir().join("foto-aule");
    std::fs::create_dir_all(&dir).ok()?;
    let f = dir.join(format!("{idfoto}.jpg"));
    if f.exists() {
        return Some(f);
    }
    let url = net::client().get(format!("{BASE}/syncro/rooms/foto/{idfoto}")).send().await.ok()?.text().await.ok()?.trim().to_string();
    if !url.starts_with("https://") {
        return None;
    }
    let r = net::client().get(&url).send().await.ok()?;
    let is_img = r.headers().get("content-type").and_then(|v| v.to_str().ok()).map(|v| v.contains("image")).unwrap_or(false);
    if !r.status().is_success() || !is_img {
        return None;
    }
    std::fs::write(&f, r.bytes().await.ok()?).ok()?;
    Some(f)
}

/// Free rooms right now (or at `when`) for `minutes`: used by the CLI / MCP.
pub async fn free_rooms(sede: &str, when: chrono::DateTime<chrono::Local>, minutes: i64, min_capacity: i64) -> Result<Value> {
    use chrono::Timelike;
    let t = when.hour() as i64 * 60 + when.minute() as i64;
    let r = status(None, Some(sede), &util::iso(when.with_timezone(&chrono::Utc)), t, t + minutes, &|_| {}).await?;
    let mut all = vec![];
    for b in r["buildings"].as_array().into_iter().flatten() {
        for x in b["rooms"].as_array().into_iter().flatten() {
            if util::s(x, "status") == "free" && (min_capacity == 0 || util::f(x, "capienza") as i64 >= min_capacity) {
                all.push(util::merge(x, &json!({ "edificioName": b["name"], "address": b["address"] })));
            }
        }
    }
    Ok(json!({ "total": all.len(), "rooms": all, "hidden": 0, "busy": 0 }))
}
