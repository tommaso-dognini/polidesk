//! Background activity: what is downloading / transcribing / generating, pause state (persisted in
//! ~/.polirec/paused.json), the activity log (kept by the daemon, so it survives closing the window)
//! and external drives that are not connected.
use crate::daemon::Daemon;
use polirec_core::library as lib;
use polirec_core::{config, drives, paths, sync::Control, util};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast::error::RecvError;

const LOG_MAX: usize = 1500;

#[derive(Default)]
pub struct Activity {
    /// "<course>:<key>" → { course, key, file, title, status, percent, speed, eta, error }
    pub downloads: Vec<(String, Value)>,
    pub log: VecDeque<Value>,
    /// mount point → (drive name, course ids waiting for it)
    pub waiting: HashMap<PathBuf, (String, Vec<String>)>,
    pub watching: bool,
}

// ───────── pause state ─────────
fn paused_file() -> PathBuf {
    paths::app_dir().join("paused.json")
}
pub fn restore_pauses(d: &Daemon) {
    let v = util::read_json(&paused_file()).unwrap_or(Value::Null);
    d.dl_control.restore(util::b(&v, "downloadsAll"), util::str_list(v.get("downloads")));
    d.transcriber.restore(util::b(&v, "transcriptionsAll"), util::str_list(v.get("transcriptions")).into_iter().map(PathBuf::from).collect());
}
pub fn save_pauses(d: &Daemon) {
    let v = json!({
        "downloadsAll": d.dl_control.all_paused(), "downloads": d.dl_control.paused_ids(),
        "transcriptionsAll": d.transcriber.all_paused(), "transcriptions": d.transcriber.paused_videos(),
    });
    let _ = util::write_json(&paused_file(), &v);
}

// ───────── tracker ─────────
fn course_name(id: &str) -> String {
    config::find_course(&config::load(), id).map(|c| config::course_name(&c)).unwrap_or_default()
}

fn entry(level: &str, kind: &str, course: Option<&str>, msg: &str) -> Value {
    json!({ "t": util::now_iso(), "level": level, "kind": kind, "course": course, "courseName": course.map(course_name), "msg": msg })
}

fn level_of(msg: &str) -> &'static str {
    let m = msg.trim_start();
    if m.starts_with('✗') {
        "err"
    } else if m.starts_with('⚠') {
        "warn"
    } else if m.starts_with('✓') || m.starts_with('🏁') {
        "ok"
    } else {
        "info"
    }
}
fn kind_of(msg: &str, course: Option<&str>) -> &'static str {
    let m = msg.trim_start();
    if m.starts_with('⬇') || m.starts_with('↻') || m.starts_with('⏸') || m.contains(".mp4") {
        "download"
    } else if m.starts_with('🎙') || m.contains("Whisper") || m.contains("Trascrizione") {
        "transcribe"
    } else if m.starts_with("✗ AI") || m.starts_with('✨') {
        "ai"
    } else if m.starts_with('🔎') && m.contains("Indice") {
        "search"
    } else if course.is_some() {
        "sync"
    } else {
        "system"
    }
}
fn file_name(p: &str) -> String {
    std::path::Path::new(p).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_else(|| p.to_string())
}

/// Consumes every event: keeps the download list and the log, and tells the UI when they change.
pub fn start_tracker(d: Arc<Daemon>) {
    let mut rx = d.events.subscribe();
    tokio::spawn(async move {
        let mut dirty = false;
        let mut tick = tokio::time::interval(Duration::from_millis(400));
        loop {
            tokio::select! {
                r = rx.recv() => {
                    let e = match r {
                        Ok(e) => e,
                        Err(RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    };
                    if let Some(changed) = track(&d, &e) {
                        dirty |= changed;
                    }
                }
                _ = tick.tick() => {
                    if dirty {
                        dirty = false;
                        let _ = d.events.send(json!({ "type": "activity" }));
                    }
                }
            }
        }
    });
}

/// Returns Some(true) when the activity list changed.
fn track(d: &Daemon, e: &Value) -> Option<bool> {
    let t = e["type"].as_str()?;
    let course = e["course"].as_str().filter(|s| !s.is_empty());
    let mut log: Option<Value> = None;
    let mut changed = false;
    {
        let mut a = d.activity.lock().unwrap();
        let id = course.map(|c| Control::id(c, util::s(e, "key")));
        let find = |a: &mut Activity, id: &str| a.downloads.iter().position(|(k, _)| k == id);
        match t {
            "log" => log = Some(entry(level_of(util::s(e, "msg")), kind_of(util::s(e, "msg"), course), course, util::s(e, "msg"))),
            "download-queued" | "download-start" | "download-paused" | "download-error" => {
                let id = id?;
                let status = match t {
                    "download-queued" => "queued",
                    "download-start" => "downloading",
                    "download-paused" => "paused",
                    _ => "error",
                };
                let i = match find(&mut a, &id) {
                    Some(i) => i,
                    None => {
                        a.downloads.push((id.clone(), json!({ "id": id, "course": course, "courseName": course.map(course_name), "key": e["key"], "percent": 0 })));
                        a.downloads.len() - 1
                    }
                };
                let v = &mut a.downloads[i].1;
                for k in ["file", "title", "date", "error"] {
                    if e.get(k).is_some() {
                        v[k] = e[k].clone();
                    }
                }
                v["status"] = json!(status);
                if status == "error" {
                    log = Some(entry("err", "download", course, &format!("✗ Download non riuscito: {} — {}", util::s(v, "title"), util::s(e, "error"))));
                }
                changed = true;
            }
            "progress" => {
                let id = id?;
                if let Some(i) = find(&mut a, &id) {
                    let v = &mut a.downloads[i].1;
                    v["status"] = json!("downloading");
                    for k in ["percent", "speed", "eta"] {
                        v[k] = e[k].clone();
                    }
                }
            }
            "downloaded" => {
                let id = id?;
                if let Some(i) = find(&mut a, &id) {
                    let (_, v) = a.downloads.remove(i);
                    log = Some(entry("ok", "download", course, &format!("✓ Scaricata: {}", util::s(&v, "title"))));
                }
                changed = true;
            }
            "sync-course" if util::s(e, "state") != "running" => {
                // whatever is still "queued" for this course was not reached (stop / error)
                let pre = format!("{}:", course.unwrap_or(""));
                a.downloads.retain(|(k, v)| !(k.starts_with(&pre) && util::s(v, "status") == "queued"));
                changed = true;
                if util::s(e, "state") == "done" {
                    let n = util::f(&e["result"], "downloaded") as u64;
                    log = Some(entry("ok", "sync", course, &format!("✓ Sincronizzato{}", if n > 0 { format!(": {n} nuove lezioni") } else { String::new() })));
                }
            }
            "transcribe-start" => log = Some(entry("info", "transcribe", None, &format!("🎙 Trascrivo {}", file_name(util::s(e, "video"))))),
            "transcribe-done" => log = Some(entry("ok", "transcribe", None, &format!("✓ Trascritta {}", file_name(util::s(e, "video"))))),
            "transcribe-error" => {
                if !util::s(e, "error").contains("annullato") {
                    log = Some(entry("err", "transcribe", None, &format!("✗ Trascrizione {}: {}", file_name(util::s(e, "video")), util::s(e, "error"))));
                }
            }
            "transcribe-queued" | "transcribe-paused" | "transcribe-resumed" | "ai-queue" | "sync-queue" | "sync-state" => changed = true,
            "ai-start" => log = Some(entry("info", "ai", course, &format!("✨ AI al lavoro{}", e["template"].as_str().map(|t| format!(" ({t})")).unwrap_or_default()))),
            "ai-done" => log = Some(entry("ok", "ai", course, &format!("✓ AI completato{}", e["file"].as_str().map(|f| format!(": {f}")).unwrap_or_default()))),
            "ai-error" | "ai-failed" => log = Some(entry("err", "ai", course, &format!("✗ AI: {}", util::s(e, "error")))),
            "drive-missing" => log = Some(entry("warn", "system", None, &format!("⚠ Disco «{}» non collegato: {}", util::s(e, "name"), util::str_list(e.get("courseNames")).join(", ")))),
            "drive-connected" => log = Some(entry("ok", "system", None, &format!("✓ Disco «{}» collegato: risincronizzo", util::s(e, "name")))),
            _ => {}
        }
        if let Some(l) = &log {
            persist(l);
            a.log.push_back(l.clone());
            while a.log.len() > LOG_MAX {
                a.log.pop_front();
            }
        }
    }
    if let Some(l) = log {
        let _ = d.events.send(json!({ "type": "activity-log", "entry": l }));
    }
    Some(changed)
}

// ───────── log on disk (survives daemon restarts and updates) ─────────
fn log_file() -> PathBuf {
    paths::app_dir().join("activity-log.jsonl")
}
fn persist(e: &Value) {
    use std::io::Write;
    let f = log_file();
    // keep it small: rotate at ~1 MB, keeping the last lines
    if std::fs::metadata(&f).map(|m| m.len() > 1_000_000).unwrap_or(false) {
        if let Ok(t) = std::fs::read_to_string(&f) {
            let lines: Vec<&str> = t.lines().collect();
            let _ = std::fs::write(&f, lines[lines.len().saturating_sub(LOG_MAX)..].join("\n") + "\n");
        }
    }
    if let Ok(mut h) = std::fs::OpenOptions::new().create(true).append(true).open(&f) {
        let _ = writeln!(h, "{e}");
    }
}
pub fn restore_log(d: &Daemon) {
    let Ok(t) = std::fs::read_to_string(log_file()) else { return };
    let lines: Vec<&str> = t.lines().collect();
    let mut a = d.activity.lock().unwrap();
    for l in &lines[lines.len().saturating_sub(LOG_MAX)..] {
        if let Ok(v) = serde_json::from_str::<Value>(l) {
            a.log.push_back(v);
        }
    }
}

/// Snapshot for the activity panel.
pub fn snapshot(d: &Daemon) -> Value {
    let cfg = config::load();
    let courses: Vec<Value> = config::courses(&cfg).to_vec();
    let mut downloads: Vec<Value> = d.activity.lock().unwrap().downloads.iter().map(|(_, v)| v.clone()).collect();
    // entries created by a bare pause/resume event: complete them from the manifest
    for v in downloads.iter_mut().filter(|v| util::s(v, "title").is_empty()) {
        let Some(c) = courses.iter().find(|c| c["id"] == v["course"]) else { continue };
        let m = lib::load_manifest(&lib::dir_of(c));
        if let Some(r) = m["recordings"].get(util::s(v, "key")) {
            v["title"] = json!(lib::pretty_topic(r));
            v["file"] = r["file"].clone();
            v["date"] = r["isoDate"].clone();
        }
    }
    // paused downloads from earlier sessions (persisted) that this session hasn't seen yet
    for id in d.dl_control.paused_ids() {
        if downloads.iter().any(|v| util::s(v, "id") == id) {
            continue;
        }
        let Some((cid, key)) = id.split_once(':') else { continue };
        let Some(c) = courses.iter().find(|c| util::s(c, "id") == cid) else { continue };
        let m = lib::load_manifest(&lib::dir_of(c));
        let Some(r) = m["recordings"].get(key) else { continue };
        if lib::course_dirs(&lib::dir_of(c)).video.join(util::s(r, "file")).exists() {
            continue;
        }
        downloads.push(json!({ "id": id, "course": cid, "courseName": config::course_name(c), "key": key, "file": r["file"], "title": lib::pretty_topic(r), "date": r["isoDate"], "status": "paused", "percent": 0 }));
    }
    // transcriptions: map each video back to its course and lesson
    let transcriptions: Vec<Value> = d
        .transcriber
        .list()
        .into_iter()
        .map(|mut t| {
            let video = PathBuf::from(util::s(&t, "video"));
            if let Some(c) = courses.iter().find(|c| video.starts_with(lib::dir_of(c))) {
                t["course"] = c["id"].clone();
                t["courseName"] = json!(config::course_name(c));
                let file = video.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
                let m = lib::load_manifest(&lib::dir_of(c));
                if let Some(r) = m["recordings"].as_object().and_then(|o| o.values().find(|r| util::s(r, "file") == file)) {
                    t["key"] = r["key"].clone();
                    t["title"] = json!(lib::pretty_topic(r));
                    t["date"] = r["isoDate"].clone();
                }
            }
            if t["title"].is_null() {
                t["title"] = json!(file_name(util::s(&t, "video")));
            }
            t
        })
        .collect();
    let (syncing, queue, current) = d.sync_state();
    let ai = d.ai_queue_info();
    json!({
        "downloads": downloads, "downloadsPaused": d.dl_control.all_paused(),
        "transcriptions": transcriptions, "transcriptionsPaused": d.transcriber.all_paused(),
        "ai": ai, "sync": { "running": syncing, "queue": queue, "current": current, "currentName": current.as_deref().map(course_name) },
        "drives": missing_drives(&courses),
    })
}

pub fn log(d: &Daemon) -> Value {
    json!(d.activity.lock().unwrap().log.iter().cloned().collect::<Vec<_>>())
}

// ───────── external drives ─────────
/// Drives that hold course folders but are not connected: [{ name, path, courses: [{id, name}] }]
pub fn missing_drives(courses: &[Value]) -> Vec<Value> {
    let mut by: Vec<(String, PathBuf, Vec<Value>)> = vec![];
    for c in courses {
        if let Some((name, root)) = drives::missing(&lib::dir_of(c)) {
            let cv = json!({ "id": c["id"], "name": config::course_name(c) });
            match by.iter_mut().find(|x| x.1 == root) {
                Some(x) => x.2.push(cv),
                None => by.push((name, root, vec![cv])),
            }
        }
    }
    by.into_iter().map(|(name, path, courses)| json!({ "name": name, "path": path, "courses": courses })).collect()
}

/// Remember that `course_id` must be synced again when its drive comes back; watch for it.
pub fn wait_for_drive(d: &Arc<Daemon>, course_id: &str) -> Option<Value> {
    let c = config::find_course(&config::load(), course_id)?;
    let (name, root) = drives::missing(&lib::dir_of(&c))?;
    let start = {
        let mut a = d.activity.lock().unwrap();
        let e = a.waiting.entry(root.clone()).or_insert_with(|| (name.clone(), vec![]));
        if !e.1.iter().any(|x| x == course_id) {
            e.1.push(course_id.to_string());
        }
        !std::mem::replace(&mut a.watching, true)
    };
    if start {
        let d2 = d.clone();
        tokio::spawn(async move { watch(d2).await });
    }
    let waiting = d.activity.lock().unwrap().waiting.get(&root).map(|w| w.1.clone()).unwrap_or_default();
    Some(json!({ "name": name, "path": root, "courses": waiting, "courseNames": waiting.iter().map(|i| course_name(i)).collect::<Vec<_>>() }))
}

/// Poll the waiting mount points; when one appears, sync its courses again.
async fn watch(d: Arc<Daemon>) {
    loop {
        tokio::time::sleep(Duration::from_secs(3)).await;
        let back: Vec<(PathBuf, String, Vec<String>)> = {
            let mut a = d.activity.lock().unwrap();
            let roots: Vec<PathBuf> = a.waiting.keys().filter(|r| r.exists()).cloned().collect();
            let out = roots.into_iter().filter_map(|r| a.waiting.remove(&r).map(|(n, c)| (r, n, c))).collect();
            if a.waiting.is_empty() {
                a.watching = false;
            }
            out
        };
        for (root, name, ids) in back {
            // give the OS a moment to finish mounting
            tokio::time::sleep(Duration::from_secs(2)).await;
            d.send(json!({ "type": "drive-connected", "name": name, "path": root, "courses": ids }));
            d.notify(format!("Disco «{name}» collegato: risincronizzo {} cors{}", ids.len(), if ids.len() == 1 { "o" } else { "i" }));
            d.refresh();
            d.enqueue_sync(Some(ids));
        }
        if !d.activity.lock().unwrap().watching {
            break;
        }
    }
}
