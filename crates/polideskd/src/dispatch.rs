//! Method table. Names match the app's IPC channels, so the Electron bridge forwards them unchanged.
use crate::daemon::Daemon;
use anyhow::{anyhow, bail, Result};
use base64::Engine;
use polidesk_core::rpc::Params;
use polidesk_core::{ai, cloud, config, integrations, library as lib, notes, setup, sys, tools, util, workspace as ws};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub const METHODS: &[&str] = &[
    "state", "course:add", "course:update", "course:teachers", "course:trashUnfollowed", "course:remove", "course:reorder", "course:path",
    "recording", "read-file", "open", "open-path", "reveal", "settings:save",
    "ws:get", "ws:page", "ws:todo:add", "ws:todo:set", "ws:todo:remove", "ws:pomodoro", "ws:all-todos",
    "notes:scopes", "notes:list", "notes:read", "notes:write", "notes:create", "notes:rename", "notes:remove", "notes:asset", "notes:dir",
    "notes:links", "notes:setLinks", "notes:forLesson", "notes:linkCounts", "notes:createLinked", "notes:engines", "notes:installEngine", "notes:compile",
    "notes:exportTo", "notes:path", "integrations:apps", "integrations:testNotion", "integrations:openPdfIn",
    "cloud:detect", "cloud:set", "cloud:pull", "cloud:autopull",
    "daemon:info", "daemon:shutdown", "app:ready",
    "webeep:courses", "sync", "sync:stop", "transcribe", "transcribe:cancel", "notes", "notes:batch", "agent", "lesson:ask", "ai:assist",
    "ai:backfill", "ai:queue", "course:genPage", "search:ready", "search:install", "search:query", "search:ask", "search:index", "search:status",
    "setup:detect", "setup:install", "setup:skip", "hw", "engine:set", "dictate", "transcripts:clean",
    "cal:sync", "cal:importText", "cal:importIcs", "cal:events", "cal:icsPath", "rooms:spaces", "rooms:status", "rooms:photo", "rooms:free",
    "assistant:info", "assistant:addClaude",
    "activity:list", "activity:log", "download:pause", "download:resume", "downloads:pauseAll", "downloads:resumeAll",
    "transcribe:pause", "transcribe:resume", "transcriptions:pauseAll", "transcriptions:resumeAll",
    "drives:status", "drive:wait", "login:done", "login:cancel", "ai:use", "ai:wait", "ai:resume", "ai:models", "ai:rescan", "rec:stream", "rec:streamTarget", "rec:downloadVideo", "course:freeSpace", "deps:status", "deps:install", "deps:terminal",
    "pn:index", "pn:match", "pn:tree", "pn:download", "pn:status", "pn:cancel",
];

/// Run blocking filesystem work off the async workers.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tokio::task::spawn_blocking(f).await.map_err(|e| anyhow!("{e}"))?
}

pub async fn call(d: &Arc<Daemon>, client: &str, method: &str, p: Value) -> Result<Value> {
    let d = d.clone();
    // AI assistants (MCP) are opt-in: checked on every call, so enabling it in the app needs no restart
    if client == "mcp" && !util::b(&config::load()["settings"]["integrations"], "assistant") {
        bail!("Accesso degli assistenti AI disattivato. Attivalo in PoliDesk → Impostazioni → Integrazioni → «Assistenti AI (MCP)».");
    }
    match method {
        "daemon:info" => Ok(json!({ "version": env!("CARGO_PKG_VERSION"), "pid": std::process::id(), "dataDir": polidesk_core::paths::app_dir(), "socket": polidesk_core::paths::socket_path() })),
        "daemon:shutdown" => {
            let n = d.shutdown.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                n.notify_one();
            });
            Ok(json!(true))
        }
        "state" => {
            let mut st = blocking(move || Ok(state())).await?;
            let py = util::s(&st["settings"]["transcription"], "python").to_string();
            let (syncing, queue, current) = d.sync_state();
            st["syncing"] = json!(syncing);
            st["syncQueue"] = json!(queue);
            st["syncCurrent"] = json!(current);
            st["tools"] = util::merge(&tools::check(), &json!({ "whisper": whisper_engine(if py.is_empty() { "python3" } else { &py }).await, "ai": ai::available() }));
            st["templates"] = ai::template_labels();
            st["transcribing"] = json!(d.transcriber.pending());
            st["transcriptionJobs"] = json!(d.transcriber.list());
            Ok(st)
        }
        "app:ready" => {
            d.app_ready();
            Ok(json!(true))
        }

        // ── courses ──
        "course:add" => blocking(move || course_add(&p)).await,
        "course:update" => blocking(move || course_update(&d, p.req("id")?, &p["patch"])).await,
        "course:teachers" => blocking(move || {
            let c = config::course(p.as_str().unwrap_or(""))?;
            Ok(json!(lib::teachers_of(&lib::load_manifest(&lib::dir_of(&c)))))
        })
        .await,
        "course:trashUnfollowed" => blocking(move || trash_unfollowed(&d, p.req("id")?, util::b(&p, "dryRun"))).await,
        "course:remove" => blocking(move || {
            let id = p.as_str().unwrap_or("").to_string();
            let mut c = config::load();
            c["courses"].as_array_mut().unwrap().retain(|x| util::s(x, "id") != id);
            let mut del = util::str_list(c.get("deletedCourses"));
            if !del.contains(&id) {
                del.push(id);
            }
            c["deletedCourses"] = json!(del);
            config::save(&mut c)?;
            Ok(json!(true))
        })
        .await,
        "course:reorder" => blocking(move || {
            let ids = util::str_list(Some(&p));
            let mut c = config::load();
            let pos = |x: &Value| ids.iter().position(|i| i == util::s(x, "id")).map(|i| i as i64).unwrap_or(-1);
            c["courses"].as_array_mut().unwrap().sort_by_key(|x| pos(x));
            config::save(&mut c)?;
            Ok(json!(true))
        })
        .await,
        "course:path" => blocking(move || Ok(json!(course_path(p.req("courseId")?, p.str_of("kind").unwrap_or(""), p.str_of("file"))?))).await,
        "recording" => blocking(move || recording(p.req("courseId")?, p.req("key")?)).await,
        "read-file" => blocking(move || {
            let c = config::course(p.req("courseId")?)?;
            let dd = lib::course_dirs(&lib::dir_of(&c));
            let base = match p.str_of("kind") {
                Some("transcripts") => dd.transcripts,
                Some("notes") => dd.notes,
                _ => bail!("percorso non valido"),
            };
            Ok(json!(std::fs::read_to_string(notes::safe(&base, p.req("file")?)?)?))
        })
        .await,
        "open" => blocking(move || {
            let pth = course_path(p.req("courseId")?, p.str_of("kind").unwrap_or(""), p.str_of("file"))?;
            if !pth.exists() {
                bail!("Non trovato: {}", pth.display());
            }
            sys::open_path(&pth)?;
            Ok(json!(true))
        })
        .await,
        "open-path" => blocking(move || {
            sys::open_path(p.as_str().unwrap_or(""))?;
            Ok(json!(true))
        })
        .await,
        "reveal" => blocking(move || {
            sys::reveal(Path::new(p.as_str().unwrap_or("")))?;
            Ok(json!(true))
        })
        .await,
        "settings:save" => blocking(move || {
            let mut c = config::load();
            let before = c["settings"]["ai"].to_string();
            c["settings"] = util::merge(&c["settings"], &p);
            config::save(&mut c)?;
            d.schedule_auto_sync();
            // newly enabled AI features apply to past lessons too
            if p.get("ai").is_some() && c["settings"]["ai"].to_string() != before {
                d.ai_backfill(None);
            }
            Ok(c["settings"].clone())
        })
        .await,

        // ── workspace (course page, todos, pomodoro) ──
        "ws:get" => blocking(move || {
            let w = ws::load(ws_dir(&p)?.as_deref());
            let st = ws::stats(&w);
            Ok(util::merge(&w, &json!({ "stats": st })))
        })
        .await,
        "ws:page" => blocking(move || {
            let text = p["text"].as_str().unwrap_or("").to_string();
            ws::update(ws_dir(&p["courseId"])?.as_deref(), |w| w["page"] = json!(text))?;
            d.notes_changed(p.str_of("courseId"));
            Ok(json!(true))
        })
        .await,
        "ws:todo:add" => blocking(move || Ok(ws::todo_add(ws_dir(&p["courseId"])?.as_deref(), &p["todo"])?["todos"].clone())).await,
        "ws:todo:set" => blocking(move || Ok(ws::todo_set(ws_dir(&p["courseId"])?.as_deref(), p.req("id")?, &p["patch"])?["todos"].clone())).await,
        "ws:todo:remove" => blocking(move || Ok(ws::todo_remove(ws_dir(&p["courseId"])?.as_deref(), p.req("id")?)?["todos"].clone())).await,
        "ws:pomodoro" => blocking(move || Ok(ws::stats(&ws::log_pomodoro(ws_dir(&p["courseId"])?.as_deref(), &p)?))).await,
        "ws:all-todos" => blocking(move || Ok(all_todos())).await,

        // ── notes (appunti) ──
        "notes:scopes" => blocking(move || {
            let c = config::load();
            let mut out = vec![json!({ "id": null, "name": "Generale", "dir": cloud::general_notes_dir(&c["settings"]) })];
            for x in config::courses(&c) {
                out.push(json!({ "id": util::s(x, "id"), "name": config::course_name(x), "dir": notes::dir_for(&lib::dir_of(x)) }));
            }
            Ok(json!(out))
        })
        .await,
        "notes:list" => blocking(move || Ok(json!(notes::list(&notes_dir(&p)?)))).await,
        "notes:read" => blocking(move || Ok(json!(notes::read(&notes_dir(&p["scope"])?, p.req("file")?)?))).await,
        "notes:write" => blocking(move || {
            let r = notes::write(&notes_dir(&p["scope"])?, p.req("file")?, p["content"].as_str().unwrap_or(""))?;
            d.notes_changed(p.str_of("scope"));
            Ok(json!(r))
        })
        .await,
        "notes:create" => blocking(move || Ok(json!(notes::create(&notes_dir(&p["scope"])?, p["title"].as_str().unwrap_or(""), p.str_of("kind").unwrap_or("markdown"))?))).await,
        "notes:rename" => blocking(move || Ok(json!(notes::rename(&notes_dir(&p["scope"])?, p.req("file")?, p.req("name")?)?))).await,
        "notes:remove" => blocking(move || Ok(json!(notes::remove(&notes_dir(&p["scope"])?, p.req("file")?)?))).await,
        "notes:asset" => blocking(move || {
            let data = bytes_param(&p["data"])?;
            Ok(json!(notes::save_asset(&notes_dir(&p["scope"])?, p.req("file")?, p["name"].as_str().unwrap_or("img.png"), &data)?))
        })
        .await,
        "notes:dir" => blocking(move || Ok(json!(notes_dir(&p)?))).await,
        "notes:path" => blocking(move || Ok(json!(notes::safe(&notes_dir(&p["scope"])?, p.req("file")?)?))).await,
        "notes:links" => blocking(move || Ok(notes::get_links(&notes_dir(&p["scope"])?, p.req("file")?))).await,
        "notes:setLinks" => blocking(move || notes::set_links(&notes_dir(&p["scope"])?, p.req("file")?, &p["links"])).await,
        "notes:forLesson" => blocking(move || notes_for_lesson(p.req("courseId")?, p.req("key")?)).await,
        "notes:linkCounts" => blocking(move || {
            let cid = p.as_str().unwrap_or("").to_string();
            let mut counts = serde_json::Map::new();
            for sc in all_scopes() {
                for ls in notes::get_all_links(&notes_dir(&sc)?).values() {
                    for l in ls.as_array().into_iter().flatten().filter(|l| util::s(l, "c") == cid) {
                        let k = util::s(l, "k").to_string();
                        let n = counts.get(&k).and_then(Value::as_u64).unwrap_or(0) + 1;
                        counts.insert(k, json!(n));
                    }
                }
            }
            Ok(Value::Object(counts))
        })
        .await,
        "notes:createLinked" => blocking(move || {
            let dir = notes_dir(&p["scope"])?;
            let f = notes::create(&dir, p["title"].as_str().unwrap_or(""), p.str_of("kind").unwrap_or("markdown"))?;
            if let Some(c) = p.str_of("content") {
                notes::write(&dir, &f, c)?;
            }
            notes::set_links(&dir, &f, &p["links"])?;
            d.notes_changed(p.str_of("scope"));
            Ok(json!(f))
        })
        .await,
        "notes:engines" => blocking(|| Ok(notes::engine_status())).await,
        "notes:installEngine" => {
            let name = p.as_str().unwrap_or("").to_string();
            let d2 = d.clone();
            notes::install_engine(&name, &move |l| d2.log(format!("🧰 {l}"), None)).await
        }
        "notes:compile" => {
            let dir = notes_dir(&p["scope"])?;
            let d2 = d.clone();
            let mut r = notes::compile(&dir, p.req("file")?, &move |l| d2.send(json!({ "type": "compile-log", "line": l }))).await?;
            if let Some(pdf) = r["pdf"].as_str() {
                r["pdfUrl"] = json!(format!("{}?t={}", file_url(&dir.join(pdf)), util::now_ms()));
            }
            Ok(r)
        }
        "notes:exportTo" => export_to(&p).await,
        "integrations:apps" => Ok(integrations::installed_apps()),
        "integrations:testNotion" => Ok(json!(integrations::test_notion(p["token"].as_str().unwrap_or(""), p["parent"].as_str().unwrap_or("")).await?)),
        "integrations:openPdfIn" => Ok(json!(integrations::open_pdf_in(p.req("app")?, Path::new(p.req("pdf")?)).await?)),

        // ── cloud sync ──
        "cloud:detect" => blocking(|| Ok(json!(cloud::detect()))).await,
        "cloud:set" => blocking(move || {
            let mut c = config::load();
            let enabled = util::b(&p, "enabled");
            c["settings"]["cloud"] = util::merge(&c["settings"]["cloud"], &json!({ "enabled": enabled, "provider": p["provider"].as_str().unwrap_or(""), "path": p["path"].as_str().unwrap_or("") }));
            let (mut copied, mut pulled) = (0, Value::Null);
            if enabled {
                pulled = cloud::import_config(&mut c); // another computer may already have synced
                let d2 = d.clone();
                copied = cloud::migrate_to_cloud(&c, &move |m| d2.log(m, None));
            }
            config::save(&mut c)?; // also writes polidesk-sync.json
            Ok(json!({ "copied": copied, "pulled": pulled, "root": cloud::root(&c["settings"]) }))
        })
        .await,
        "cloud:pull" => blocking(move || {
            let mut c = config::load();
            let r = cloud::import_config(&mut c);
            if util::b(&r, "changed") {
                config::save_opts(&mut c, true)?;
            }
            Ok(r)
        })
        .await,
        "cloud:autopull" => {
            d.cloud_pull(true);
            Ok(json!(true))
        }
        _ => crate::methods::call(&d, method, p).await,
    }
}

// ---------- helpers ----------

pub fn file_url(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    let s = if s.starts_with('/') { s } else { format!("/{s}") };
    format!("file://{}", util::encode_uri(&s).replace('?', "%3F").replace('#', "%23"))
}

/// Binary data from the UI arrives as base64 ({"$b64": "..."}) or as an array of bytes.
pub fn bytes_param(v: &Value) -> Result<Vec<u8>> {
    if let Some(b) = v.get("$b64").and_then(Value::as_str) {
        return Ok(base64::engine::general_purpose::STANDARD.decode(b)?);
    }
    if let Some(a) = v.as_array() {
        return Ok(a.iter().map(|x| x.as_u64().unwrap_or(0) as u8).collect());
    }
    if let Some(m) = v.as_object() {
        // a typed array serialized as {"0": 1, "1": 2, …}
        let mut out = vec![0u8; m.len()];
        for (k, x) in m {
            if let Ok(i) = k.parse::<usize>() {
                if i < out.len() {
                    out[i] = x.as_u64().unwrap_or(0) as u8;
                }
            }
        }
        return Ok(out);
    }
    bail!("dati mancanti")
}

/// Course view sent to the UI: course + manifest summary + recordings with file status.
pub fn course_view(c: &Value) -> Value {
    let dir = lib::dir_of(c);
    let m = lib::load_manifest(&dir);
    let mut mats: Vec<String> = m["materials"].as_object().map(|o| o.values().map(|x| util::s(x, "path").replace('\\', "/")).collect()).unwrap_or_default();
    mats.sort_by(|a, b| util::natural_cmp(a, b));
    mats.dedup();
    let pn_files = polidesk_core::polinetwork::local_files(&dir);
    if !pn_files.is_empty() {
        mats.retain(|f| !f.starts_with("PoliNetwork/"));
        mats.extend(pn_files);
        mats.sort_by(|a, b| util::natural_cmp(a, b));
    }
    if dir.join("materiale").join("LINK.md").exists() {
        mats.push("LINK.md".into());
    }
    util::merge(
        c,
        &json!({
            "manifest": { "course": m.get("course").cloned().unwrap_or(Value::Null), "sources": m.get("sources").cloned().unwrap_or(json!([])) },
            "recordings": lib::with_file_status(&dir, &m),
            "materialsCount": m["materials"].as_object().map(|o| o.len()).unwrap_or(0),
            "dirExists": dir.exists(),
            "drive": polidesk_core::drives::info(&dir),
            "materialFiles": mats,
        }),
    )
}

fn state() -> Value {
    let c = config::load();
    json!({
        "settings": c["settings"],
        "courses": config::courses(&c).iter().map(course_view).collect::<Vec<_>>(),
        "platform": std::env::consts::OS.replace("macos", "darwin").replace("windows", "win32"),
    })
}

fn course_add(p: &Value) -> Result<Value> {
    let input = p["input"].as_str().unwrap_or("").trim().to_string();
    let dir = p["dir"].as_str().unwrap_or("");
    if input.is_empty() || dir.is_empty() {
        bail!("Serve il corso e la cartella di destinazione");
    }
    let mut c = json!({
        "id": uuid::Uuid::new_v4().to_string(), "input": input, "dir": dir, "name": p["name"].as_str().unwrap_or(""), "extraUrls": [],
        "materials": util::b(p, "materials"), "language": p["language"].as_str().unwrap_or(""), "autoSync": true, "addedAt": util::now_iso(),
    });
    if let Some(id) = input.strip_prefix("webeep:").and_then(|x| x.parse::<u64>().ok()) {
        c["webeepId"] = json!(id);
    }
    let mut all = config::load();
    all["courses"].as_array_mut().unwrap().push(c.clone());
    config::save(&mut all)?;
    Ok(course_view(&c))
}

fn course_update(d: &Arc<Daemon>, id: &str, patch: &Value) -> Result<Value> {
    config::patch_course(id, patch)?;
    let c = config::course(id)?;
    if patch.get("teachers").is_some() {
        let dir = lib::dir_of(&c);
        let mut m = lib::load_manifest(&dir);
        m["teachers"] = patch["teachers"].clone();
        if lib::save_manifest(&dir, &m).is_ok() {
            let _ = lib::write_index(&dir, &m);
        }
        d.notes_changed(Some(id));
    }
    Ok(course_view(&c))
}

/// Move to the Trash (recoverable) video, transcripts and AI notes of lessons by teachers the student does not follow.
fn trash_unfollowed(d: &Daemon, id: &str, dry_run: bool) -> Result<Value> {
    let c = config::course(id)?;
    let teachers = c.get("teachers").cloned().unwrap_or(Value::Null);
    if util::str_list(Some(&teachers)).is_empty() {
        bail!("Scegli prima quali docenti segui");
    }
    let dir = lib::dir_of(&c);
    let files = lib::unfollowed_files(&dir, &lib::load_manifest(&dir), &teachers);
    if dry_run {
        let bytes: u64 = files.iter().filter_map(|f| std::fs::metadata(f).ok()).map(|m| m.len()).sum();
        return Ok(json!({ "files": files.len(), "bytes": bytes }));
    }
    let mut n = 0;
    for f in &files {
        match sys::trash(f) {
            Ok(_) => n += 1,
            Err(e) => d.log(format!("✗ cestino: {e}"), Some(id)),
        }
    }
    lib::write_index(&dir, &lib::load_manifest(&dir))?;
    d.refresh();
    Ok(json!({ "trashed": n }))
}

fn course_path(course_id: &str, kind: &str, file: Option<&str>) -> Result<PathBuf> {
    let c = config::course(course_id)?;
    let dd = lib::course_dirs(&lib::dir_of(&c));
    let base = match kind {
        "video" => dd.video,
        "transcripts" => dd.transcripts,
        "notes" => dd.notes,
        "materials" => dd.root.join("materiale"),
        _ => dd.root,
    };
    match file {
        Some(f) => notes::safe(&base, f),
        None => Ok(base),
    }
}

/// One recording: metadata, transcript segments (from .srt) or text, AI notes.
fn recording(course_id: &str, key: &str) -> Result<Value> {
    let c = config::course(course_id)?;
    let dir = lib::dir_of(&c);
    let dd = lib::course_dirs(&dir);
    let rec = lib::with_file_status(&dir, &lib::load_manifest(&dir)).into_iter().find(|r| util::s(r, "key") == key).ok_or_else(|| anyhow!("registrazione non trovata"))?;
    let stem = lib::stem(util::s(&rec, "file")).to_string();
    let srt = dd.transcripts.join(format!("{stem}.srt"));
    let (mut segments, mut text) = (Value::Null, Value::Null);
    if srt.exists() {
        segments = json!(lib::parse_srt(&std::fs::read_to_string(&srt)?));
    } else if let Some(t) = rec["transcript"].as_str() {
        text = json!(std::fs::read_to_string(dd.transcripts.join(t))?);
    }
    let notes_v: Vec<Value> = util::str_list(rec.get("notes"))
        .into_iter()
        .map(|n| {
            let kind = n.rsplit(" - ").next().unwrap_or(&n).trim_end_matches(".md").to_string();
            let content = std::fs::read_to_string(dd.notes.join(&n)).unwrap_or_default();
            json!({ "file": n, "kind": kind, "content": content })
        })
        .collect();
    let video = dd.video.join(util::s(&rec, "file"));
    let url = if util::b(&rec, "videoExists") { json!(format!("media://local/{}", util::encode_component(&video.to_string_lossy()))) } else { Value::Null };
    // not downloaded: the player streams it (rec:stream); "streamOnly" = the course never downloads videos
    Ok(json!({ "rec": rec, "segments": segments, "text": text, "notes": notes_v, "videoPath": video, "videoUrl": url, "streamOnly": lib::stream_only(&c) }))
}

/// Workspace folder: course data dir (cloud or course folder); none = global (cloud root or ~/.polidesk).
fn ws_dir(course_id: &Value) -> Result<Option<PathBuf>> {
    let c = config::load();
    match course_id.as_str().filter(|s| !s.is_empty()) {
        None => Ok(cloud::root(&c["settings"])),
        Some(id) => {
            let course = config::find_course(&c, id).ok_or_else(|| anyhow!("Corso non trovato"))?;
            Ok(Some(cloud::course_data_dir(&c["settings"], &course)))
        }
    }
}
/// Notes folder of a scope (course id, or null for general notes).
pub fn notes_dir(scope: &Value) -> Result<PathBuf> {
    let c = config::load();
    match scope.as_str().filter(|s| !s.is_empty()) {
        None => Ok(cloud::general_notes_dir(&c["settings"])),
        Some(id) => {
            let course = config::find_course(&c, id).ok_or_else(|| anyhow!("Corso non trovato"))?;
            Ok(notes::dir_for(&cloud::course_data_dir(&c["settings"], &course)))
        }
    }
}
fn all_scopes() -> Vec<Value> {
    let c = config::load();
    std::iter::once(Value::Null).chain(config::courses(&c).iter().map(|x| json!(util::s(x, "id")))).collect()
}

fn all_todos() -> Value {
    let c = config::load();
    let mut all = vec![];
    for t in ws::load(cloud::root(&c["settings"]).as_deref())["todos"].as_array().into_iter().flatten() {
        all.push(util::merge(t, &json!({ "courseId": null, "course": "Generale" })));
    }
    for x in config::courses(&c) {
        let w = ws::load(Some(&cloud::course_data_dir(&c["settings"], x)));
        for t in w["todos"].as_array().into_iter().flatten() {
            all.push(util::merge(t, &json!({ "courseId": util::s(x, "id"), "course": config::course_name(x) })));
        }
    }
    json!(all)
}

fn notes_for_lesson(course_id: &str, key: &str) -> Result<Value> {
    let mut out = vec![];
    for sc in all_scopes() {
        let dir = notes_dir(&sc)?;
        let all = notes::get_all_links(&dir);
        let files: Vec<&String> = all.iter().filter(|(_, ls)| ls.as_array().into_iter().flatten().any(|l| util::s(l, "c") == course_id && util::s(l, "k") == key)).map(|(f, _)| f).collect();
        if files.is_empty() {
            continue;
        }
        let meta = notes::list(&dir);
        for f in files {
            if let Some(m) = meta.iter().find(|x| util::s(x, "file") == f) {
                let mut o = json!({ "scope": sc });
                o = util::merge(&o, m);
                o["links"] = all[f].clone();
                out.push(o);
            }
        }
    }
    Ok(json!(out))
}

/// Send a note to another app: notion | applenotes | obsidian | goodnotes | notability | pdf.
/// Markdown → PDF needs a browser engine, so the UI does that part and passes `pdf`.
async fn export_to(p: &Value) -> Result<Value> {
    let dir = notes_dir(&p["scope"])?;
    let file = p.req("file")?;
    let abs = notes::safe(&dir, file)?;
    let kind = notes::kind_by_ext(file).unwrap_or("markdown");
    let title = Path::new(file).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let content = std::fs::read_to_string(&abs)?;
    let target = p.req("target")?;
    let s = config::load()["settings"].clone();
    let en = &s["integrations"];
    if target != "pdf" && !util::b(en, target) {
        bail!("Integrazione non attiva: attivala in Impostazioni → Integrazioni");
    }
    match target {
        "notion" => Ok(json!({ "url": integrations::export_to_notion(util::s(en, "notionToken"), util::s(en, "notionParent"), &title, &content, kind).await? })),
        "applenotes" => {
            let html = p.str_of("html").map(String::from).unwrap_or_else(|| format!("<pre>{}</pre>", content.replace('<', "&lt;")));
            integrations::export_to_apple_notes(&title, &html).await?;
            Ok(json!({ "ok": true }))
        }
        "goodnotes" | "notability" => {
            let pdf = pdf_for(p, &dir, file, kind).await?;
            Ok(json!({ "app": integrations::open_pdf_in(target, &pdf).await?, "pdf": pdf }))
        }
        "pdf" => {
            let pdf = pdf_for(p, &dir, file, kind).await?;
            let _ = sys::reveal(&pdf);
            Ok(json!({ "pdf": pdf }))
        }
        "obsidian" => match integrations::obsidian_vault(&abs) {
            None => Ok(json!({ "needVault": true, "dir": dir })),
            Some(v) => {
                sys::open_path(integrations::obsidian_url(&abs))?;
                Ok(json!({ "ok": true, "vault": v }))
            }
        },
        _ => bail!("destinazione sconosciuta"),
    }
}

/// PDF of a note: given by the UI (Markdown, rendered there) or compiled (LaTeX/Typst).
async fn pdf_for(p: &Value, dir: &Path, file: &str, kind: &str) -> Result<PathBuf> {
    if let Some(pdf) = p.str_of("pdf") {
        return Ok(PathBuf::from(pdf));
    }
    if kind == "markdown" {
        bail!("PDF non disponibile");
    }
    let r = notes::compile(dir, file, &|_| {}).await?;
    if !util::b(&r, "ok") {
        bail!("Compilazione non riuscita: correggi gli errori prima di esportare");
    }
    Ok(dir.join(util::s(&r, "pdf")))
}

/// Installed Whisper engine, cached for a minute (spawning Python costs ~0.3 s).
async fn whisper_engine(python: &str) -> String {
    use std::sync::{LazyLock, Mutex};
    static CACHE: LazyLock<Mutex<Option<(std::time::Instant, String, String)>>> = LazyLock::new(Default::default);
    if let Some((t, py, v)) = CACHE.lock().unwrap().clone() {
        if py == python && t.elapsed() < std::time::Duration::from_secs(60) {
            return v;
        }
    }
    let v = setup::check_whisper(python).await;
    *CACHE.lock().unwrap() = Some((std::time::Instant::now(), python.to_string(), v.clone()));
    v
}
