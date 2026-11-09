//! Cloud sync through the user's own cloud folders (iCloud Drive, Google Drive, Dropbox, OneDrive, any folder).
//!
//! <cloud>/PoliRec/
//!   polirec-sync.json   settings + course list (machine-specific bits excluded)
//!   Appunti/            general notes
//!   Corsi/<Nome>/       per-course notes (appunti/) and workspace
use crate::{paths, util};
use anyhow::Result;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn exists(p: &Path) -> bool {
    p.is_dir()
}

pub fn detect() -> Vec<Value> {
    let h = paths::home();
    let mut out: Vec<Value> = vec![];
    let mut add = |id: &str, name: String, p: PathBuf| {
        let ps = p.to_string_lossy().into_owned();
        if exists(&p) && !out.iter().any(|o| util::s(o, "path") == ps) {
            out.push(json!({ "id": id, "name": name, "path": ps }));
        }
    };
    if cfg!(target_os = "macos") {
        add("icloud", "iCloud Drive".into(), h.join("Library/Mobile Documents/com~apple~CloudDocs"));
    }
    if cfg!(windows) {
        add("icloud", "iCloud Drive".into(), h.join("iCloudDrive"));
    }
    let cs = h.join("Library").join("CloudStorage");
    if let Ok(rd) = std::fs::read_dir(&cs) {
        for e in rd.filter_map(|e| e.ok()) {
            let d = e.file_name().to_string_lossy().into_owned();
            let full = cs.join(&d);
            let low = d.to_lowercase();
            if low.starts_with("googledrive") {
                let my = ["My Drive", "Il mio Drive", "Mon Drive", "Mi unidad"].iter().map(|x| full.join(x)).find(|p| exists(p));
                let acc = d.trim_start_matches("GoogleDrive").trim_start_matches('-');
                add("gdrive", format!("Google Drive ({})", if acc.is_empty() { "account" } else { acc }), my.unwrap_or(full));
            } else if low.starts_with("dropbox") {
                add("dropbox", "Dropbox".into(), full);
            } else if low.starts_with("onedrive") {
                add("onedrive", d.replace('-', " "), full);
            }
        }
    }
    for p in [h.join("Google Drive").join("My Drive"), h.join("Google Drive"), PathBuf::from(r"G:\My Drive"), PathBuf::from(r"G:\Il mio Drive")] {
        add("gdrive", "Google Drive".into(), p);
    }
    add("dropbox", "Dropbox".into(), h.join("Dropbox"));
    if cfg!(windows) {
        if let Some(od) = std::env::var_os("OneDrive") {
            add("onedrive", "OneDrive".into(), PathBuf::from(od));
        }
    }
    add("onedrive", "OneDrive".into(), h.join("OneDrive"));
    out
}

pub fn safe_name(s: &str) -> String {
    let s = if s.is_empty() { "Corso" } else { s };
    let c: String = s.chars().map(|c| if r#"\/:*?"<>|"#.contains(c) { '-' } else { c }).collect();
    util::take(c.trim(), 80)
}

/// Root of PoliRec data in the cloud, or None when sync is off.
pub fn root(settings: &Value) -> Option<PathBuf> {
    let c = &settings["cloud"];
    (util::b(c, "enabled") && !util::s(c, "path").is_empty()).then(|| Path::new(util::s(c, "path")).join("PoliRec"))
}
/// Where a course keeps notes/workspace: cloud folder when sync is on, else the course folder.
pub fn course_data_dir(settings: &Value, course: &Value) -> PathBuf {
    match root(settings) {
        Some(r) => r.join("Corsi").join(safe_name(&crate::config::course_name(course))),
        None => PathBuf::from(util::s(course, "dir")),
    }
}
pub fn general_notes_dir(settings: &Value) -> PathBuf {
    match root(settings) {
        Some(r) => r.join("Appunti"),
        None => {
            let nr = util::s(settings, "notesRoot");
            if nr.is_empty() { paths::home().join("Documents").join("PoliRec Appunti") } else { PathBuf::from(nr) }
        }
    }
}

const LOCAL_ONLY_SETTINGS: [&str; 3] = ["cloud", "notesRoot", "setupDone"];
const LOCAL_ONLY_TRANSCRIPTION: [&str; 3] = ["python", "engine", "device"];
fn sync_file(r: &Path) -> PathBuf {
    r.join("polirec-sync.json")
}
fn hostname() -> String {
    gethostname::gethostname().to_string_lossy().into_owned()
}

pub fn export_config(cfg: &Value) -> Result<Option<String>> {
    let Some(r) = root(&cfg["settings"]) else { return Ok(None) };
    std::fs::create_dir_all(&r)?;
    let mut settings = cfg["settings"].clone();
    for k in LOCAL_ONLY_SETTINGS {
        settings.as_object_mut().map(|m| m.remove(k));
    }
    for k in LOCAL_ONLY_TRANSCRIPTION {
        settings["transcription"].as_object_mut().map(|m| m.remove(k));
    }
    let courses: Vec<Value> = crate::config::courses(cfg)
        .iter()
        .map(|c| {
            let mut o = serde_json::Map::new();
            for k in ["id", "input", "name", "webeepId", "language", "materials", "autoSync", "extraUrls", "videoPassword", "teachers"] {
                if let Some(v) = c.get(k) {
                    o.insert(k.into(), v.clone());
                }
            }
            o.insert("dirHint".into(), c.get("dir").cloned().unwrap_or(Value::Null));
            Value::Object(o)
        })
        .collect();
    let at = util::now_iso();
    let data = json!({ "app": "PoliRec", "updatedAt": at, "host": hostname(), "settings": settings, "courses": courses, "deletedCourses": cfg.get("deletedCourses").cloned().unwrap_or(json!([])) });
    util::write_json(&sync_file(&r), &data)?;
    Ok(Some(at))
}

/// Merge the cloud copy into the local config when it's newer than what we last saw.
/// Courses are matched by id; local folders are kept; new courses get a folder under defaultRoot.
pub fn import_config(cfg: &mut Value) -> Value {
    let Some(r) = root(&cfg["settings"]) else { return json!({ "changed": false }) };
    let Some(data) = util::read_json(&sync_file(&r)) else { return json!({ "changed": false }) };
    let updated = util::s(&data, "updatedAt").to_string();
    let last = util::s(&cfg["settings"]["cloud"], "lastPulled").to_string();
    let pushed = util::s(&cfg["settings"]["cloud"], "lastPushed").to_string();
    if updated.is_empty() || updated <= last || (util::s(&data, "host") == hostname() && updated <= pushed) {
        return json!({ "changed": false });
    }
    // settings (keep machine-specific values)
    let keep_t: Vec<(String, Value)> = LOCAL_ONLY_TRANSCRIPTION.iter().map(|k| (k.to_string(), cfg["settings"]["transcription"][*k].clone())).collect();
    let keep: Vec<(String, Value)> = LOCAL_ONLY_SETTINGS.iter().map(|k| (k.to_string(), cfg["settings"][*k].clone())).collect();
    let mut settings = util::merge(&cfg["settings"], &data["settings"]);
    for (k, v) in keep {
        settings[k] = v;
    }
    settings["transcription"] = util::merge(&cfg["settings"]["transcription"], &settings["transcription"]);
    for (k, v) in keep_t {
        settings["transcription"][k] = v;
    }
    cfg["settings"] = settings;
    // courses
    let deleted: std::collections::HashSet<String> = util::str_list(data.get("deletedCourses")).into_iter().collect();
    let mut courses: Vec<Value> = crate::config::courses(cfg).iter().filter(|c| !deleted.contains(util::s(c, "id"))).cloned().collect();
    let mut added = 0;
    for rc in data["courses"].as_array().into_iter().flatten() {
        let id = util::s(rc, "id");
        if deleted.contains(id) {
            continue;
        }
        let mut rest = rc.clone();
        let dir_hint = rest.as_object_mut().and_then(|m| m.remove("dirHint")).and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
        if let Some(local) = courses.iter_mut().find(|c| util::s(c, "id") == id) {
            *local = util::merge(local, &rest);
        } else {
            let base = match util::s(&cfg["settings"], "defaultRoot") {
                "" => paths::home().join("Documents").join("PoliRec"),
                d => PathBuf::from(d),
            };
            let hint = Path::new(&dir_hint);
            let dir = if !dir_hint.is_empty() && hint.parent().map(exists).unwrap_or(false) { hint.to_path_buf() } else { base.join(safe_name(&crate::config::course_name(rc))) };
            let mut c = rest;
            c["dir"] = json!(dir.to_string_lossy());
            c["addedAt"] = json!(util::now_iso());
            c["fromCloud"] = json!(true);
            courses.push(c);
            added += 1;
        }
    }
    // keep the remote order
    let order: Vec<&str> = data["courses"].as_array().into_iter().flatten().map(|c| util::s(c, "id")).collect();
    let pos = |c: &Value| order.iter().position(|x| *x == util::s(c, "id")).unwrap_or(usize::MAX);
    courses.sort_by_key(|c| pos(c));
    cfg["courses"] = json!(courses);
    let mut del: Vec<String> = util::str_list(cfg.get("deletedCourses"));
    for d in deleted {
        if !del.contains(&d) {
            del.push(d);
        }
    }
    cfg["deletedCourses"] = json!(del);
    cfg["settings"]["cloud"]["lastPulled"] = json!(updated);
    json!({ "changed": true, "added": added, "from": util::s(&data, "host"), "at": updated })
}

/// Copy existing notes/workspaces into the cloud folder (never deletes the originals).
pub fn migrate_to_cloud(cfg: &Value, log: &dyn Fn(String)) -> u32 {
    let Some(r) = root(&cfg["settings"]) else { return 0 };
    let mut n = 0;
    fn copy_dir(from: &Path, to: &Path, n: &mut u32) {
        if !from.is_dir() {
            return;
        }
        let _ = std::fs::create_dir_all(to);
        for e in std::fs::read_dir(from).into_iter().flatten().filter_map(|e| e.ok()) {
            let (a, b) = (e.path(), to.join(e.file_name()));
            if a.is_dir() {
                copy_dir(&a, &b, n);
            } else {
                let newer = match (std::fs::metadata(&a), std::fs::metadata(&b)) {
                    (Ok(ma), Ok(mb)) => util::mtime_ms(&ma) > util::mtime_ms(&mb),
                    (Ok(_), Err(_)) => true,
                    _ => false,
                };
                if newer && std::fs::copy(&a, &b).is_ok() {
                    *n += 1;
                }
            }
        }
    }
    let nr = util::s(&cfg["settings"], "notesRoot");
    let local_general = if nr.is_empty() { paths::home().join("Documents").join("PoliRec Appunti") } else { PathBuf::from(nr) };
    copy_dir(&local_general, &r.join("Appunti"), &mut n);
    for c in crate::config::courses(cfg) {
        let dst = r.join("Corsi").join(safe_name(&crate::config::course_name(c)));
        let dir = Path::new(util::s(c, "dir"));
        copy_dir(&dir.join("appunti"), &dst.join("appunti"), &mut n);
        let ws = dir.join("polirec-workspace.json");
        if ws.exists() && !dst.join("polirec-workspace.json").exists() {
            let _ = std::fs::create_dir_all(&dst);
            if std::fs::copy(&ws, dst.join("polirec-workspace.json")).is_ok() {
                n += 1;
            }
        }
    }
    let gws = paths::app_dir().join("workspace.json");
    if gws.exists() && !r.join("polirec-workspace.json").exists() && std::fs::copy(&gws, r.join("polirec-workspace.json")).is_ok() {
        n += 1;
    }
    log(format!("☁ {n} file copiati nella cartella cloud"));
    n
}
