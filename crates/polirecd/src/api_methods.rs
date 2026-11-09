//! "api:*" methods for the CLI and the MCP server (see polirec_core::api).
use crate::daemon::Daemon;
use anyhow::{anyhow, bail, Result};
use polirec_core::rpc::Params;
use polirec_core::{api, config, library as lib, search, util};
use serde_json::{json, Value};
use std::sync::Arc;

fn sv<'a>(p: &'a Value, k: &str) -> Option<&'a str> {
    p.str_of(k)
}
fn list(p: &Value, k: &str) -> Vec<String> {
    util::str_list(p.get(k))
}

pub async fn call(d: &Arc<Daemon>, f: &str, p: Value) -> Result<Value> {
    let course = sv(&p, "course").map(String::from);
    let c = course.as_deref();
    match f {
        "status" => Ok(api::status()),
        "courses" => Ok(api::courses()),
        "lessons" => api::lessons(c, util::b(&p, "all")),
        "lesson" => api::lesson(c, p.req("lesson")?),
        "transcript" => api::transcript(c, p.req("lesson")?, util::b(&p, "timestamps"), util::f(&p, "offset") as usize, util::f(&p, "maxChars") as usize),
        "aiNote" => api::ai_note(c, p.req("lesson")?, p.req("kind")?),
        "coursePage" => api::course_page(c),
        "templates" => Ok(json!(api::templates())),
        "generateAiNote" => {
            let kind = p.req("kind")?;
            if !api::templates().contains(&kind) {
                bail!("Tipo sconosciuto: {kind}. Disponibili: {}", api::templates().join(", "));
            }
            let course = api::find_course(c)?;
            let r = api::find_lesson(&course, p.req("lesson")?)?;
            if !util::truthy(r.get("transcript")) {
                bail!("Serve la trascrizione della lezione");
            }
            let name = d.generate_notes(util::s(&course, "id"), util::s(&r, "key"), kind, None).await?;
            let file = lib::course_dirs(&lib::dir_of(&course)).notes.join(&name);
            Ok(json!({ "file": file, "content": std::fs::read_to_string(&file)? }))
        }
        "search" => {
            let cid = match c {
                Some(x) => Some(util::s(&api::find_course(Some(x))?, "id").to_string()),
                None => None,
            };
            let r = search::query(&config::load(), p.req("query")?, cid.as_deref(), p["k"].as_u64().unwrap_or(10)).await?;
            if util::b(&r, "needIndex") {
                bail!("Indice di ricerca vuoto: installa la ricerca semantica (Impostazioni → AI) e aggiorna l'indice");
            }
            Ok(json!(r["results"].as_array().into_iter().flatten().map(|x| {
                let m = &x["meta"];
                json!({
                    "score": (util::f(x, "score") * 1000.0).round() / 1000.0, "type": m["type"], "course": m["courseName"],
                    "title": if util::truthy(m.get("title")) { m["title"].clone() } else { m["file"].clone() },
                    "date": m.get("date").cloned().unwrap_or(Value::Null), "minute": m["t"].as_f64().map(|t| (t / 60.0).floor() as i64),
                    "page": m.get("page").cloned().unwrap_or(Value::Null), "text": x["text"],
                })
            }).collect::<Vec<_>>()))
        }
        "ask" => {
            let c0 = config::load();
            let cid = match c {
                Some(x) => Some(util::s(&api::find_course(Some(x))?, "id").to_string()),
                None => None,
            };
            let prov = d.provider()?;
            let r = match search::ask(&c0, &prov, p.req("question")?, cid.as_deref(), &|_| {}).await {
                Ok(r) => r,
                Err(e) => {
                    d.ai_problem(&prov, &e);
                    return Err(e);
                }
            };
            let sources: Vec<String> = r["sources"].as_array().into_iter().flatten().enumerate().map(|(i, x)| {
                let m = &x["meta"];
                let t = if util::truthy(m.get("title")) { util::s(m, "title") } else { util::s(m, "file") };
                format!("[{}] {t}{}", i + 1, m["t"].as_f64().map(|t| format!(" min {}", (t / 60.0).floor())).unwrap_or_default())
            }).collect();
            Ok(json!({ "answer": util::s(&r, "answer").trim(), "sources": sources }))
        }
        "notes.list" => api::notes_list(c),
        "notes.read" => api::notes_read(c, p.req("file")?),
        "notes.write" => api::notes_write(c, p.req("file")?, p["content"].as_str().unwrap_or(""), sv(&p, "mode") == Some("append")),
        "notes.create" => {
            let lessons: Vec<(Option<String>, String)> = p["lessons"].as_array().into_iter().flatten().map(|l| match l.as_str() {
                Some(s) => (None, s.to_string()),
                None => (l.str_of("course").map(String::from), util::s(l, "lesson").to_string()),
            }).collect();
            api::notes_create(c, p.req("title")?, sv(&p, "kind").unwrap_or("markdown"), sv(&p, "content"), &lessons)
        }
        "notes.link" => api::notes_link(c, p.req("file")?, &list(&p, "lessons"), sv(&p, "lessonCourse")),
        "todos.list" => api::todos_list(c, util::b(&p, "done")),
        "todos.add" => api::todos_add(c, p.req("text")?, sv(&p, "due")),
        "todos.done" => api::todos_done(c, p.req("todo")?, p["done"].as_bool() != Some(false)),
        "events" => api::events(sv(&p, "from"), p["days"].as_i64().unwrap_or(7), c),
        "freeRooms" => api::free_rooms(sv(&p, "sede").unwrap_or("MIA"), sv(&p, "date"), sv(&p, "from"), p["hours"].as_f64().unwrap_or(2.0)).await,
        "sedi" => api::sedi().await,
        "addCourse" => {
            let input = p.req("input")?.trim().to_string();
            let dir = std::path::absolute(p.req("dir")?)?;
            let mut nc = json!({ "id": uuid::Uuid::new_v4().to_string(), "input": input, "dir": dir, "name": sv(&p, "name").unwrap_or(""), "extraUrls": [], "materials": util::b(&p, "materials"), "language": sv(&p, "language").unwrap_or(""), "autoSync": true, "addedAt": util::now_iso() });
            if let Some(id) = input.strip_prefix("webeep:").and_then(|x| x.parse::<u64>().ok()) {
                nc["webeepId"] = json!(id);
            }
            let mut cfg = config::load();
            cfg["courses"].as_array_mut().unwrap().push(nc.clone());
            config::save(&mut cfg)?;
            Ok(nc)
        }
        "sync" => {
            let course = api::find_course(c)?;
            d.sync_and_wait(util::s(&course, "id"), json!({ "limit": p["limit"], "materials": p["materials"], "onlyMaterials": p["onlyMaterials"], "dryRun": p["dryRun"], "parallel": p["parallel"] })).await
        }
        "transcribe" => {
            let s = config::load()["settings"].clone();
            if !util::b(&s, "setupDone") {
                bail!("Completa prima il setup della trascrizione nell'app");
            }
            let course = api::find_course(c)?;
            let dir = lib::dir_of(&course);
            let dd = lib::course_dirs(&dir);
            let list: Vec<Value> = match sv(&p, "lesson") {
                Some(l) => vec![api::find_lesson(&course, l)?],
                None => lib::with_file_status(&dir, &lib::load_manifest(&dir)).into_iter().filter(|r| lib::followed(course.get("teachers"), r) && !util::truthy(r.get("transcript"))).collect(),
            };
            let mut waits = vec![];
            for r in list.iter().filter(|r| util::b(r, "videoExists")) {
                if let Some(rx) = d.transcriber.enqueue(&dd.video.join(util::s(r, "file")), &dd.transcripts, d.transcription_opts(&course)) {
                    waits.push(rx);
                }
            }
            let n = waits.len();
            let mut failed = 0;
            for w in waits {
                if !matches!(w.await, Ok(Ok(_))) {
                    failed += 1;
                }
            }
            // the same post-processing as the app (cleanup, index, AI)
            for r in list.iter().filter(|r| util::b(r, "videoExists")) {
                let stem = lib::stem(util::s(r, "file"));
                if s["transcription"]["clean"].as_bool() != Some(false) && dd.transcripts.join(format!("{stem}.srt")).exists() && !dd.transcripts.join(".orig").join(format!("{stem}.srt")).exists() {
                    let _ = polirec_core::cleaner::clean_transcript_files(&dd.transcripts, stem);
                }
            }
            let _ = lib::write_index(&dir, &lib::load_manifest(&dir));
            d.ai_backfill(Some(vec![util::s(&course, "id").to_string()]));
            d.schedule_index(Some(util::s(&course, "id")), 5000);
            d.refresh();
            Ok(json!({ "transcribed": n - failed, "failed": failed }))
        }
        _ => Err(anyhow!("Metodo sconosciuto: api:{f}")),
    }
}
