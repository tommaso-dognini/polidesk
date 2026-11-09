//! App configuration (`~/.polirec/config.json`): settings + course list.
//! Kept as JSON values so fields written by other versions are never lost.
use crate::{cloud, paths, util};
use anyhow::{anyhow, Result};
use serde_json::{json, Value};

pub fn default_settings() -> Value {
    json!({
        "parallelDownloads": 3,
        "transcription": { "auto": true, "clean": true, "engine": "auto", "device": "auto", "model": "small", "language": "auto", "format": "txt", "python": "python3" },
        "editor": { "mode": "markdown", "aiPanel": true, "font": "mono" },
        "pomodoro": { "focus": 25, "short": 5, "long": 15, "every": 4, "sound": true },
        "rooms": { "sede": "MIA", "minutes": 60 },
        "notesRoot": "",
        "ai": { "provider": "agy", "model": "", "autoNotes": false, "autoSummary": true, "autoCoursePage": true },
        "autoSync": { "onStart": true, "intervalHours": 0 },
        "browser": { "show": false },
        "ui": { "theme": "normal", "font": "system", "appearance": "auto" },
        "setupDone": false,
        "cloud": { "enabled": false, "provider": "", "path": "", "lastPulled": "", "lastPushed": "" },
        "integrations": { "notion": false, "notionToken": "", "notionParent": "", "applenotes": false, "goodnotes": false, "notability": false, "obsidian": false, "assistant": false },
        "defaultRoot": "",
        "polimiEmail": "",
    })
}

/// Always re-read from disk: the CLI, another computer (cloud) or the user may have changed it.
pub fn load() -> Value {
    let mut cfg = util::read_json(&paths::config_file()).filter(Value::is_object).unwrap_or_else(|| json!({}));
    let m = cfg.as_object_mut().unwrap();
    if !m.get("courses").map(Value::is_array).unwrap_or(false) {
        m.insert("courses".into(), json!([]));
    }
    let mut settings = default_settings();
    if let Some(s) = m.get("settings") {
        util::deep_merge(&mut settings, s);
    }
    if util::s(&settings, "polimiEmail").is_empty() {
        settings["polimiEmail"] = Value::String(legacy_email());
    }
    m.insert("settings".into(), settings);
    cfg
}

/// Reuse the e-mail saved by PoliWebex (config.json next to poliwebex.js), if any.
fn legacy_email() -> String {
    let mut cands = vec![paths::home().join("Documents").join("PoliWebex").join("config.json")];
    if let Some(r) = paths::app_root() {
        cands.insert(0, r.join("legacy").join("config.json"));
    }
    cands.iter().filter_map(|p| util::read_json(p)).map(|v| util::s(&v, "email").to_string()).find(|e| !e.is_empty()).unwrap_or_default()
}

pub fn save(cfg: &mut Value) -> Result<()> {
    save_opts(cfg, false)
}
pub fn save_opts(cfg: &mut Value, no_export: bool) -> Result<()> {
    // mirror settings + course list to the cloud folder (iCloud/Drive/…) when sync is on
    if !no_export && util::b(&cfg["settings"]["cloud"], "enabled") {
        if let Ok(Some(at)) = cloud::export_config(cfg) {
            cfg["settings"]["cloud"]["lastPushed"] = Value::String(at);
        }
    }
    util::write_json(&paths::config_file(), cfg)
}

pub fn courses(cfg: &Value) -> &[Value] {
    cfg["courses"].as_array().map(Vec::as_slice).unwrap_or(&[])
}
pub fn find_course(cfg: &Value, id: &str) -> Option<Value> {
    courses(cfg).iter().find(|c| util::s(c, "id") == id).cloned()
}
pub fn course(id: &str) -> Result<Value> {
    find_course(&load(), id).ok_or_else(|| anyhow!("Corso non trovato"))
}
/// Re-read config from disk and patch one course: never clobbers changes made by another process.
pub fn patch_course(id: &str, patch: &Value) -> Result<Value> {
    let mut cfg = load();
    if let Some(c) = cfg["courses"].as_array_mut().and_then(|a| a.iter_mut().find(|c| util::s(c, "id") == id)) {
        if let (Some(cm), Some(pm)) = (c.as_object_mut(), patch.as_object()) {
            for (k, v) in pm {
                cm.insert(k.clone(), v.clone());
            }
        }
        save(&mut cfg)?;
    }
    Ok(cfg)
}
pub fn patch_settings(f: impl FnOnce(&mut Value)) -> Result<Value> {
    let mut cfg = load();
    f(&mut cfg["settings"]);
    save(&mut cfg)?;
    Ok(cfg["settings"].clone())
}
pub fn course_name(c: &Value) -> String {
    let n = util::s(c, "name");
    if n.is_empty() { util::s(c, "input").to_string() } else { n.to_string() }
}
