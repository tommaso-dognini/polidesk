//! Per-course workspace: course page (Markdown), todos, pomodoro log.
//! Stored in the course data folder (polirec-workspace.json); the global one in ~/.polirec/workspace.json.
use crate::{paths, util};
use anyhow::Result;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn file_for(dir: Option<&Path>) -> PathBuf {
    match dir {
        Some(d) => d.join("polirec-workspace.json"),
        None => paths::app_dir().join("workspace.json"),
    }
}

pub fn load(dir: Option<&Path>) -> Value {
    let mut w = util::read_json(&file_for(dir)).filter(Value::is_object).unwrap_or_else(|| json!({}));
    if !w["page"].is_string() {
        w["page"] = json!("");
    }
    for k in ["todos", "pomodoro", "pinned"] {
        if !w[k].is_array() {
            w[k] = json!([]);
        }
    }
    w
}
pub fn save(dir: Option<&Path>, w: &Value) -> Result<()> {
    util::write_json(&file_for(dir), w)
}
pub fn update(dir: Option<&Path>, f: impl FnOnce(&mut Value)) -> Result<Value> {
    let mut w = load(dir);
    f(&mut w);
    save(dir, &w)?;
    Ok(w)
}

pub fn todo_add(dir: Option<&Path>, t: &Value) -> Result<Value> {
    update(dir, |w| {
        w["todos"].as_array_mut().unwrap().push(json!({
            "id": uuid::Uuid::new_v4().to_string(), "text": t.get("text").cloned().unwrap_or(Value::Null), "done": false,
            "due": t.get("due").filter(|x| util::truthy(Some(x))).cloned().unwrap_or(Value::Null),
            "lesson": t.get("lesson").filter(|x| util::truthy(Some(x))).cloned().unwrap_or(Value::Null),
            "createdAt": util::now_iso(),
        }))
    })
}
pub fn todo_set(dir: Option<&Path>, id: &str, patch: &Value) -> Result<Value> {
    update(dir, |w| {
        if let Some(x) = w["todos"].as_array_mut().unwrap().iter_mut().find(|t| util::s(t, "id") == id) {
            if let (Some(xm), Some(pm)) = (x.as_object_mut(), patch.as_object()) {
                for (k, v) in pm {
                    xm.insert(k.clone(), v.clone());
                }
                if pm.contains_key("done") {
                    xm.insert("doneAt".into(), if util::truthy(pm.get("done")) { json!(util::now_iso()) } else { Value::Null });
                }
            }
        }
    })
}
pub fn todo_remove(dir: Option<&Path>, id: &str) -> Result<Value> {
    update(dir, |w| w["todos"].as_array_mut().unwrap().retain(|t| util::s(t, "id") != id))
}
pub fn log_pomodoro(dir: Option<&Path>, e: &Value) -> Result<Value> {
    update(dir, |w| {
        let start = if util::s(e, "start").is_empty() { util::now_iso() } else { util::s(e, "start").to_string() };
        let kind = if util::s(e, "kind").is_empty() { "focus" } else { util::s(e, "kind") };
        w["pomodoro"].as_array_mut().unwrap().push(json!({ "start": start, "minutes": e.get("minutes").cloned().unwrap_or(json!(0)), "kind": kind }));
    })
}

pub fn stats(w: &Value) -> Value {
    let focus: Vec<&Value> = w["pomodoro"].as_array().into_iter().flatten().filter(|p| util::s(p, "kind") == "focus").collect();
    let today = util::take(&util::now_iso(), 10);
    let week_ago = chrono::Utc::now() - chrono::Duration::days(7);
    let sum = |it: &mut dyn Iterator<Item = &&Value>| it.map(|p| util::f(p, "minutes")).sum::<f64>();
    json!({
        "total": sum(&mut focus.iter()),
        "today": sum(&mut focus.iter().filter(|p| util::s(p, "start").starts_with(&today))),
        "week": sum(&mut focus.iter().filter(|p| util::parse_date(util::s(p, "start")).map(|d| d > week_ago).unwrap_or(false))),
        "sessions": focus.len(),
    })
}
