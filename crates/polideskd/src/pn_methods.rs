//! Appunti PoliNetwork: find the course's folder in the community archive, list it, download what the student picks.
//! Course config: `polinetwork: [{repo, folder}]` (set by the UI once the student confirms a folder).
use crate::daemon::Daemon;
use anyhow::{bail, Result};
use polidesk_core::rpc::Params;
use polidesk_core::{config, library as lib, polinetwork as pn, util};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

struct Job {
    progress: Value,
    stop: Arc<AtomicBool>,
}
static JOBS: LazyLock<Mutex<HashMap<String, Job>>> = LazyLock::new(Default::default);

fn links(c: &Value) -> Vec<Value> {
    c["polinetwork"].as_array().cloned().unwrap_or_default()
}

pub async fn call(d: &Arc<Daemon>, method: &str, p: Value) -> Result<Value> {
    match method {
        "pn:index" => pn::index(util::b(&p, "force")).await,
        // linked folders + suggestions for the course
        "pn:match" => {
            let c = config::course(p.req("courseId")?)?;
            let m = lib::load_manifest(&lib::dir_of(&c));
            let mut names = vec![util::s(&c, "name").to_string()];
            for k in ["fullname", "shortname"] {
                let n = util::s(&m["course"], k);
                if !n.is_empty() {
                    names.push(n.to_string());
                }
            }
            if let Some(q) = p.str_of("q").filter(|q| !q.trim().is_empty()) {
                names = vec![q.to_string()];
            }
            // repos the student already uses for other courses rank first (same degree and year)
            let all = config::load();
            let prefer: HashSet<String> = config::courses(&all).iter().filter(|o| util::s(o, "id") != util::s(&c, "id")).flat_map(links).map(|l| util::s(&l, "repo").to_string()).collect();
            let idx = pn::index(false).await?;
            let linked: Vec<Value> = links(&c).iter().map(|l| {
                let mut v = pn::describe(util::s(l, "repo"), util::s(l, "folder"));
                v["web"] = json!(pn::web_url(util::s(l, "repo"), "", util::s(l, "folder")));
                v
            }).collect();
            Ok(json!({ "linked": linked, "candidates": pn::candidates(&idx, &names, &prefer, if p.str_of("q").is_some() { 30 } else { 8 }), "site": pn::SITE }))
        }
        "pn:tree" => {
            let c = config::course(p.req("courseId")?)?;
            let l = links(&c);
            if l.is_empty() {
                bail!("Collega prima una cartella PoliNetwork al corso");
            }
            pn::course_tree(&lib::dir_of(&c), &l).await
        }
        "pn:status" => Ok(JOBS.lock().unwrap().get(p.req("courseId")?).map(|j| j.progress.clone()).unwrap_or(Value::Null)),
        "pn:cancel" => {
            if let Some(j) = JOBS.lock().unwrap().get(p.req("courseId")?) {
                j.stop.store(true, Ordering::Relaxed);
            }
            Ok(json!(true))
        }
        "pn:download" => {
            let id = p.req("courseId")?.to_string();
            let c = config::course(&id)?;
            let items = p["files"].as_array().cloned().unwrap_or_default();
            if items.is_empty() {
                bail!("Nessun file selezionato");
            }
            let stop = Arc::new(AtomicBool::new(false));
            {
                let mut jobs = JOBS.lock().unwrap();
                if jobs.contains_key(&id) {
                    bail!("Download già in corso per questo corso");
                }
                jobs.insert(id.clone(), Job { progress: json!({ "done": 0, "total": items.len() }), stop: stop.clone() });
            }
            let d = d.clone();
            tokio::spawn(async move {
                let (d2, id2) = (d.clone(), id.clone());
                let on = move |done: usize, total: usize, file: &str| {
                    let ev = json!({ "type": "pn-progress", "courseId": id2, "done": done, "total": total, "file": file });
                    if let Some(j) = JOBS.lock().unwrap().get_mut(&id2) {
                        j.progress = ev.clone();
                    }
                    d2.send(ev);
                };
                let s2 = stop.clone();
                let r = pn::download(&lib::dir_of(&c), &links(&c), &items, &on, &move || s2.load(Ordering::Relaxed)).await;
                JOBS.lock().unwrap().remove(&id);
                let name = util::s(&c, "name");
                let ev = match r {
                    Ok((ok, failed)) => {
                        d.log(format!("📚 PoliNetwork · {name}: {ok} file scaricati{}", if failed > 0 { format!(", {failed} errori") } else { String::new() }), Some(&id));
                        json!({ "type": "pn-done", "courseId": id, "downloaded": ok, "failed": failed, "stopped": stop.load(Ordering::Relaxed) })
                    }
                    Err(e) => json!({ "type": "pn-done", "courseId": id, "error": e.to_string() }),
                };
                d.send(ev);
                d.refresh();
            });
            Ok(json!({ "started": true }))
        }
        _ => bail!("Metodo sconosciuto: {method}"),
    }
}
