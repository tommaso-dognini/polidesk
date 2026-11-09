//! Public API used by the CLI and the MCP server (through polirecd, methods "api:*"), so a student can
//! drive PoliRec from Claude, another assistant or their own scripts.
//! Courses are selected by id, 1-based number or (part of) the name; lessons by key, number (1 = oldest),
//! date (YYYY-MM-DD) or part of the title.
use crate::library as lib;
use crate::{ai, cloud, config, notes, paths, rooms, timetable, tools, util, workspace as ws};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::path::PathBuf;

fn course_list(all: &[Value]) -> String {
    all.iter().enumerate().map(|(i, c)| format!("{}. {}", i + 1, config::course_name(c))).collect::<Vec<_>>().join(", ")
}
/// Course by id, 1-based number, or (part of) its name.
pub fn find_course(sel: Option<&str>) -> Result<Value> {
    let cfg = config::load();
    let all = config::courses(&cfg);
    let s = sel.map(str::trim).unwrap_or("");
    if s.is_empty() {
        bail!("Specifica un corso (id, numero o nome). Corsi: {}", course_list(all));
    }
    let low = s.to_lowercase();
    let by_num = (s.len() < 4 && s.chars().all(|c| c.is_ascii_digit())).then(|| s.parse::<usize>().ok().and_then(|n| n.checked_sub(1)).and_then(|i| all.get(i))).flatten();
    all.iter()
        .find(|x| util::s(x, "id") == s)
        .or(by_num)
        .or_else(|| all.iter().find(|x| util::s(x, "name").to_lowercase() == low))
        .or_else(|| all.iter().find(|x| format!("{} {} {}", util::s(x, "name"), util::s(x, "input"), x.get("webeepId").map(|v| v.to_string()).unwrap_or_default()).to_lowercase().contains(&low)))
        .cloned()
        .ok_or_else(|| anyhow!("Corso «{s}» non trovato. Corsi: {}", course_list(all)))
}
fn cname(c: &Value) -> String {
    let m = lib::load_manifest(&lib::dir_of(c));
    let n = [util::s(c, "name"), util::s(&m["course"], "fullname"), util::s(c, "input")].into_iter().find(|x| !x.is_empty()).unwrap_or("").to_string();
    n
}
fn recs_of(c: &Value, all: bool) -> Vec<Value> {
    let dir = lib::dir_of(c);
    let recs = lib::with_file_status(&dir, &lib::load_manifest(&dir));
    if all { recs } else { recs.into_iter().filter(|r| lib::followed(c.get("teachers"), r)).collect() }
}
/// Lesson by key, number (1 = oldest, "#3" ok), date (YYYY-MM-DD) or part of the title.
pub fn find_lesson(c: &Value, sel: &str) -> Result<Value> {
    let recs = recs_of(c, false);
    let s = sel.trim().trim_start_matches('#');
    if s.is_empty() {
        bail!("Specifica una lezione (numero, data AAAA-MM-GG, titolo o chiave)");
    }
    let is_num = s.len() <= 3 && s.chars().all(|c| c.is_ascii_digit());
    let is_date = s.len() == 10 && chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok();
    let low = s.to_lowercase();
    recs.iter()
        .find(|x| util::s(x, "key") == s)
        .or_else(|| if is_num { s.parse::<usize>().ok().and_then(|n| n.checked_sub(1)).and_then(|i| recs.get(i)) } else { None })
        .or_else(|| if is_date { recs.iter().find(|x| util::s(x, "isoDate").starts_with(s)) } else { None })
        .or_else(|| recs.iter().find(|x| util::s(x, "displayTitle").to_lowercase().contains(&low)))
        .cloned()
        .or_else(|| recs_of(c, true).into_iter().find(|x| util::s(x, "key") == s))
        .ok_or_else(|| anyhow!("Lezione «{sel}» non trovata in {} ({} lezioni)", cname(c), recs.len()))
}

// ── read ──
pub fn status() -> Value {
    let c = config::load();
    let av = ai::available();
    let installed: Vec<&String> = av.as_object().map(|m| m.iter().filter(|(_, v)| !v["path"].is_null()).map(|(k, _)| k).collect()).unwrap_or_default();
    let s = &c["settings"];
    json!({
        "app": "PoliRec", "version": env!("CARGO_PKG_VERSION"), "home": paths::app_dir(), "courses": config::courses(&c).len(),
        "ai": { "provider": s["ai"]["provider"], "installed": installed },
        "transcription": { "engine": s["transcription"]["engine"], "model": s["transcription"]["model"], "setupDone": util::b(s, "setupDone") },
        "cloudSync": util::b(&s["cloud"], "enabled"),
        "tools": tools::check(),
    })
}
pub fn courses() -> Value {
    let c = config::load();
    json!(config::courses(&c)
        .iter()
        .enumerate()
        .map(|(i, x)| {
            let dir = lib::dir_of(x);
            let m = lib::load_manifest(&dir);
            let recs: Vec<Value> = lib::with_file_status(&dir, &m).into_iter().filter(|r| lib::followed(x.get("teachers"), r)).collect();
            json!({
                "n": i + 1, "id": x["id"], "name": config::course_name(x), "fullname": m["course"]["fullname"], "dir": x["dir"],
                "lessons": recs.len(), "downloaded": recs.iter().filter(|r| util::b(r, "videoExists")).count(), "transcribed": recs.iter().filter(|r| util::truthy(r.get("transcript"))).count(),
                "teachers": lib::teachers_of(&m).iter().map(|t| t["name"].clone()).collect::<Vec<_>>(),
                "followedTeachers": x.get("teachers").filter(|t| t.is_array()).cloned().unwrap_or(Value::Null),
                "materials": m["materials"].as_object().map(|o| o.len()).unwrap_or(0), "lastSync": x.get("lastSync").cloned().unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>())
}
fn lesson_view(r: &Value, i: usize) -> Value {
    let nn = |k: &str| r.get(k).filter(|v| util::truthy(Some(v))).cloned().unwrap_or(Value::Null);
    json!({
        "n": i + 1, "key": r["key"], "date": nn("isoDate"), "title": ([util::s(r, "displayTitle"), util::s(r, "file")].into_iter().find(|x| !x.is_empty()).unwrap_or("")),
        "teacher": nn("teacher"), "type": nn("type"), "duration": nn("duration"), "downloaded": util::b(r, "videoExists"), "transcribed": util::truthy(r.get("transcript")),
        "summary": nn("summary"), "topics": r.get("bullets").cloned().unwrap_or(json!([])),
        "aiNotes": util::str_list(r.get("notes")).iter().map(|f| f.rsplit(" - ").next().unwrap_or(f).trim_end_matches(".md").to_string()).filter(|k| k != "sommario").collect::<Vec<_>>(),
    })
}
pub fn lessons(course: Option<&str>, all: bool) -> Result<Value> {
    let c = find_course(course)?;
    Ok(json!(recs_of(&c, all).iter().enumerate().map(|(i, r)| lesson_view(r, i)).collect::<Vec<_>>()))
}
pub fn lesson(course: Option<&str>, sel: &str) -> Result<Value> {
    let c = find_course(course)?;
    let r = find_lesson(&c, sel)?;
    let recs = recs_of(&c, false);
    let i = recs.iter().position(|x| x["key"] == r["key"]).unwrap_or(usize::MAX);
    let d = lib::course_dirs(&lib::dir_of(&c));
    let mut v = json!({ "course": cname(&c) });
    v = util::merge(&v, &lesson_view(&r, i));
    if i == usize::MAX {
        v["n"] = Value::Null;
    }
    v["video"] = if util::b(&r, "videoExists") { json!(d.video.join(util::s(&r, "file"))) } else { Value::Null };
    v["webexUrl"] = r.get("webexUrl").cloned().unwrap_or(Value::Null);
    v["linkedNotes"] = linked_notes(util::s(&c, "id"), util::s(&r, "key"));
    Ok(v)
}
/// Transcript text. timestamps=false → clean prose; offset/max_chars to page through long lessons.
pub fn transcript(course: Option<&str>, sel: &str, timestamps: bool, offset: usize, max_chars: usize) -> Result<Value> {
    let c = find_course(course)?;
    let r = find_lesson(&c, sel)?;
    let Some(tr) = r["transcript"].as_str() else { bail!("«{}» non è ancora trascritta", util::s(&r, "displayTitle")) };
    let d = lib::course_dirs(&lib::dir_of(&c));
    let srt = d.transcripts.join(format!("{}.srt", lib::stem(util::s(&r, "file"))));
    let text = if timestamps && srt.exists() {
        lib::parse_srt_all(&std::fs::read_to_string(&srt)?)
            .into_iter()
            .map(|(s, _, t)| format!("[{:02}:{:02}:{:02}] {t}", (s / 3600.0) as u64, (s % 3600.0 / 60.0) as u64, (s % 60.0) as u64))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        std::fs::read_to_string(d.transcripts.join(tr))?
    };
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();
    let slice: String = if offset > 0 || max_chars > 0 { chars[offset.min(total)..if max_chars > 0 { (offset + max_chars).min(total) } else { total }].iter().collect() } else { text };
    Ok(json!({ "course": cname(&c), "lesson": r["displayTitle"], "date": r["isoDate"], "chars": total, "offset": offset, "text": slice, "more": max_chars > 0 && offset + max_chars < total }))
}
pub fn ai_note(course: Option<&str>, sel: &str, kind: &str) -> Result<Value> {
    let c = find_course(course)?;
    let r = find_lesson(&c, sel)?;
    let notes_l = util::str_list(r.get("notes"));
    match notes_l.iter().find(|n| n.ends_with(&format!(" - {kind}.md"))) {
        None => Ok(json!({ "lesson": r["displayTitle"], "kind": kind, "exists": false, "available": notes_l.iter().map(|n| n.rsplit(" - ").next().unwrap_or(n).trim_end_matches(".md").to_string()).collect::<Vec<_>>() })),
        Some(f) => Ok(json!({ "lesson": r["displayTitle"], "kind": kind, "exists": true, "content": std::fs::read_to_string(lib::course_dirs(&lib::dir_of(&c)).notes.join(f))? })),
    }
}
pub fn course_page(course: Option<&str>) -> Result<Value> {
    let c = find_course(course)?;
    let w = ws::load(Some(&cloud::course_data_dir(&config::load()["settings"], &c)));
    let page = util::s(&w, "page");
    let page = if page.starts_with("<!--") { page.split_once("-->").map(|(_, r)| r.trim_start_matches('\n')).unwrap_or(page) } else { page };
    let open = w["todos"].as_array().map(|a| a.iter().filter(|t| !util::b(t, "done")).count()).unwrap_or(0);
    Ok(json!({ "course": cname(&c), "page": page, "todos": open }))
}

// ── student notes ──
fn notes_dir(scope: Option<&str>) -> Result<PathBuf> {
    let s = config::load()["settings"].clone();
    Ok(match scope.filter(|x| !x.is_empty()) {
        Some(sc) => notes::dir_for(&cloud::course_data_dir(&s, &find_course(Some(sc))?)),
        None => cloud::general_notes_dir(&s),
    })
}
fn linked_notes(course_id: &str, key: &str) -> Value {
    let cfg = config::load();
    let mut out = vec![];
    let scopes: Vec<Option<Value>> = std::iter::once(None).chain(config::courses(&cfg).iter().cloned().map(Some)).collect();
    for sc in scopes {
        let dir = match &sc {
            Some(c) => notes::dir_for(&cloud::course_data_dir(&cfg["settings"], c)),
            None => cloud::general_notes_dir(&cfg["settings"]),
        };
        for (f, ls) in notes::get_all_links(&dir) {
            if ls.as_array().into_iter().flatten().any(|l| util::s(l, "c") == course_id && util::s(l, "k") == key) {
                out.push(json!({ "scope": sc.as_ref().map(config::course_name).unwrap_or_else(|| "Generale".into()), "file": f }));
            }
        }
    }
    json!(out)
}
pub fn notes_list(scope: Option<&str>) -> Result<Value> {
    let dir = notes_dir(scope)?;
    Ok(json!(notes::list(&dir)
        .iter()
        .map(|f| {
            let file = util::s(f, "file");
            let modified = chrono::DateTime::from_timestamp_millis(util::f(f, "mtime") as i64).map(util::iso);
            json!({ "file": file, "kind": f["kind"], "modified": modified, "lessons": notes::get_links(&dir, file).as_array().map(|a| a.len()).unwrap_or(0) })
        })
        .collect::<Vec<_>>()))
}
pub fn notes_read(scope: Option<&str>, file: &str) -> Result<Value> {
    let dir = notes_dir(scope)?;
    Ok(json!({ "file": file, "content": notes::read(&dir, file)?, "lessons": notes::get_links(&dir, file) }))
}
pub fn notes_write(scope: Option<&str>, file: &str, content: &str, append: bool) -> Result<Value> {
    let dir = notes_dir(scope)?;
    let text = if append { format!("{}\n\n{content}\n", notes::read(&dir, file)?.trim_end()) } else { content.to_string() };
    notes::write(&dir, file, &text)?;
    Ok(json!({ "file": file, "saved": true }))
}
/// lessons: [{course?, lesson}] — resolved first, so a wrong lesson never leaves a half-created note.
pub fn notes_create(scope: Option<&str>, title: &str, kind: &str, content: Option<&str>, lessons: &[(Option<String>, String)]) -> Result<Value> {
    let dir = notes_dir(scope)?;
    let mut links = vec![];
    for (course, l) in lessons {
        let c = find_course(course.as_deref().or(scope))?;
        links.push(json!({ "c": c["id"], "k": find_lesson(&c, l)?["key"] }));
    }
    let f = notes::create(&dir, title, kind)?;
    if let Some(t) = content.filter(|t| !t.is_empty()) {
        notes::write(&dir, &f, t)?;
    }
    if !links.is_empty() {
        notes::set_links(&dir, &f, &json!(links))?;
    }
    Ok(json!({ "file": f, "path": dir.join(&f), "lessons": links.len() }))
}
pub fn notes_link(scope: Option<&str>, file: &str, lessons: &[String], lesson_course: Option<&str>) -> Result<Value> {
    let dir = notes_dir(scope)?;
    let c = find_course(lesson_course.or(scope))?;
    let mut cur = notes::get_links(&dir, file).as_array().cloned().unwrap_or_default();
    for l in lessons {
        cur.push(json!({ "c": c["id"], "k": find_lesson(&c, l)?["key"] }));
    }
    Ok(json!({ "file": file, "lessons": notes::set_links(&dir, file, &json!(cur))? }))
}

// ── todos, timetable, rooms ──
fn ws_dir(scope: Option<&str>) -> Result<Option<PathBuf>> {
    let s = config::load()["settings"].clone();
    Ok(match scope.filter(|x| !x.is_empty()) {
        Some(sc) => Some(cloud::course_data_dir(&s, &find_course(Some(sc))?)),
        None => cloud::root(&s),
    })
}
pub fn todos_list(scope: Option<&str>, done: bool) -> Result<Value> {
    Ok(json!(ws::load(ws_dir(scope)?.as_deref())["todos"].as_array().into_iter().flatten().filter(|t| done || !util::b(t, "done")).cloned().collect::<Vec<_>>()))
}
pub fn todos_add(scope: Option<&str>, text: &str, due: Option<&str>) -> Result<Value> {
    let w = ws::todo_add(ws_dir(scope)?.as_deref(), &json!({ "text": text, "due": due }))?;
    Ok(w["todos"].as_array().and_then(|a| a.last()).cloned().unwrap_or(Value::Null))
}
pub fn todos_done(scope: Option<&str>, id_or_text: &str, done: bool) -> Result<Value> {
    let dir = ws_dir(scope)?;
    let w = ws::load(dir.as_deref());
    let low = id_or_text.to_lowercase();
    let t = w["todos"].as_array().into_iter().flatten().find(|x| util::s(x, "id") == id_or_text).or_else(|| w["todos"].as_array().into_iter().flatten().find(|x| util::s(x, "text").to_lowercase().contains(&low))).cloned().ok_or_else(|| anyhow!("Attività non trovata"))?;
    ws::todo_set(dir.as_deref(), util::s(&t, "id"), &json!({ "done": done }))?;
    Ok(util::merge(&t, &json!({ "done": done })))
}
pub fn events(from: Option<&str>, days: i64, course: Option<&str>) -> Result<Value> {
    let f = match from.and_then(util::parse_date) {
        Some(d) => d,
        None => {
            let today = chrono::Local::now().date_naive().and_hms_opt(0, 0, 0).unwrap();
            chrono::TimeZone::from_local_datetime(&chrono::Local, &today).earliest().unwrap().with_timezone(&chrono::Utc)
        }
    };
    let mut ev = timetable::occurrences(f, f + chrono::Duration::days(days));
    if let Some(cs) = course.filter(|x| !x.is_empty()) {
        let c = find_course(Some(cs))?;
        let name = timetable::course_fullname(&c, &lib::load_manifest(&lib::dir_of(&c)));
        ev.retain(|e| timetable::match_course(util::s(e, "summary"), &name));
    }
    Ok(json!(ev.iter().map(|e| json!({ "start": e["start"], "end": e["end"], "title": e["summary"], "room": util::s(e, "location").split('(').next().unwrap_or("").trim(), "source": e["source"] })).collect::<Vec<_>>()))
}
pub async fn free_rooms(sede: &str, date: Option<&str>, from: Option<&str>, hours: f64) -> Result<Value> {
    use chrono::Timelike;
    let now = chrono::Local::now();
    let day = date.and_then(util::parse_date).map(|d| d.with_timezone(&chrono::Local)).unwrap_or(now);
    let start = match from {
        Some(f) => {
            let mut it = f.split(':').map(|x| x.trim().parse::<i64>().unwrap_or(0));
            it.next().unwrap_or(0) * 60 + it.next().unwrap_or(0)
        }
        None => now.hour() as i64 * 60 + now.minute() as i64,
    };
    let to = (20 * 60).min(start + (hours * 60.0) as i64);
    let r = rooms::status(None, Some(sede), &util::iso(day.with_timezone(&chrono::Utc)), start, to, &|_| {}).await?;
    let free: Vec<Value> = r["buildings"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|b| {
            b["rooms"].as_array().cloned().unwrap_or_default().into_iter().filter(|x| util::s(x, "status") == "free").map(move |x| {
                json!({ "room": x["name"], "building": b["name"], "address": b["address"], "seats": x["capienza"], "freeUntil": if util::truthy(x.get("freeUntil")) { x["freeUntil"].clone() } else { json!("fine giornata") } })
            })
        })
        .collect();
    Ok(json!({ "sede": sede, "date": day.format("%Y-%m-%d").to_string(), "from": format!("{:02}:{:02}", start / 60, start % 60), "hours": hours, "free": free, "partial": r["partial"] }))
}
pub async fn sedi() -> Result<Value> {
    let sp = rooms::spaces().await?;
    Ok(json!(sp["sedi"].as_array().into_iter().flatten().map(|s| json!({ "id": s["id"], "name": s["name"], "city": s["city"] })).collect::<Vec<_>>()))
}
pub fn templates() -> Vec<&'static str> {
    ai::TEMPLATES.iter().map(|t| t.id).collect()
}
