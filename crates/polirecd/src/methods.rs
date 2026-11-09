//! Methods that drive the pipelines: sync, transcription, AI, search, setup, calendar, rooms, assistants.
use crate::daemon::Daemon;
use crate::dispatch::{bytes_param, file_url};
use anyhow::{anyhow, bail, Result};
use polirec_core::rpc::Params;
use polirec_core::library as lib;
use polirec_core::{ai, cleaner, config, rooms, search, setup, timetable, tools, transcriber, util, webeep};
use serde_json::{json, Value};
use std::sync::Arc;

pub async fn call(d: &Arc<Daemon>, method: &str, p: Value) -> Result<Value> {
    match method {
        // ── sync ──
        "webeep:courses" => {
            let s = d.session().await;
            let r = webeep::enrolled_courses(&s).await;
            d.release_session().await;
            Ok(json!(r?))
        }
        "sync" => {
            d.enqueue_sync(Some(util::str_list(Some(&p))));
            Ok(json!(true))
        }
        "sync:stop" => {
            d.stop_sync();
            Ok(json!(true))
        }

        // ── transcription ──
        "transcribe" => {
            if !util::b(&config::load()["settings"], "setupDone") {
                bail!("Completa prima il setup (Impostazioni → Trascrizione)");
            }
            let c = config::course(p.req("courseId")?)?;
            let keys = p.get("keys").filter(|k| k.is_array()).map(|k| util::str_list(Some(k)));
            let dir = lib::dir_of(&c);
            let sel: Vec<Value> = lib::with_file_status(&dir, &lib::load_manifest(&dir)).into_iter().filter(|r| util::b(r, "videoExists") && keys.as_ref().map(|k| k.iter().any(|x| x == util::s(r, "key"))).unwrap_or(!util::truthy(r.get("transcript")))).collect();
            for r in &sel {
                d.queue_transcription(&c, r);
            }
            Ok(json!(sel.len()))
        }
        "transcribe:cancel" => {
            d.transcriber.cancel_all();
            Ok(json!(true))
        }
        "transcripts:clean" => {
            let c = config::course(p.req("courseId")?)?;
            let dir = lib::dir_of(&c);
            let dd = lib::course_dirs(&dir);
            let keys = p.get("keys").filter(|k| k.is_array()).map(|k| util::str_list(Some(k)));
            let recs: Vec<Value> = lib::with_file_status(&dir, &lib::load_manifest(&dir)).into_iter().filter(|r| util::truthy(r.get("transcript")) && keys.as_ref().map(|k| k.iter().any(|x| x == util::s(r, "key"))).unwrap_or(true)).collect();
            let mut removed = 0;
            for r in &recs {
                let stem = lib::stem(util::s(r, "file"));
                if util::b(&p, "restore") {
                    cleaner::restore_original(&dd.transcripts, stem);
                } else {
                    removed += util::f(&cleaner::clean_transcript_files(&dd.transcripts, stem)?, "removedSegments") as u64;
                }
            }
            Ok(json!({ "files": recs.len(), "removed": removed }))
        }
        "dictate" => {
            let s = config::load()["settings"].clone();
            if !util::b(&s, "setupDone") {
                bail!("Completa prima il setup della trascrizione");
            }
            let audio = bytes_param(&p["data"])?;
            let text = transcriber::transcribe_clip(&s, &audio, p["language"].as_str().unwrap_or("")).await?;
            Ok(json!(cleaner::clean_dictation(text.trim())))
        }

        // ── AI ──
        "notes" => Ok(json!(d.generate_notes(p.req("courseId")?, p.req("key")?, p.str_of("template").unwrap_or("appunti"), p.str_of("provider").map(String::from)).await?)),
        "notes:batch" => {
            let cid = p.req("courseId")?.to_string();
            let c = config::course(&cid)?;
            let template = p.str_of("template").unwrap_or("appunti").to_string();
            let suffix = ai::template(&template).suffix;
            let dir = lib::dir_of(&c);
            let keys: Vec<String> = lib::with_file_status(&dir, &lib::load_manifest(&dir))
                .into_iter()
                .filter(|r| util::truthy(r.get("transcript")) && !util::str_list(r.get("notes")).iter().any(|n| n.ends_with(&format!(" - {suffix}.md"))))
                .map(|r| util::s(&r, "key").to_string())
                .collect();
            let n = keys.len();
            let (d2, prov) = (d.clone(), p.str_of("provider").map(String::from));
            tokio::spawn(async move {
                for k in keys {
                    if let Err(e) = d2.generate_notes(&cid, &k, &template, prov.clone()).await {
                        d2.log(format!("✗ {e}"), Some(&cid));
                    }
                }
            });
            Ok(json!(n))
        }
        "agent" => {
            let c = config::course(p.req("courseId")?)?;
            let s = config::load()["settings"].clone();
            let prov = match p.str_of("provider") {
                Some(x) => x.to_string(),
                None => ai::pick(&s)?,
            };
            let preamble = format!("Stai lavorando nella cartella di un corso universitario ({}). Struttura: video/ (registrazioni), trascrizioni/ (trascrizioni Whisper .txt/.srt, possono contenere errori), materiale/ (slide e PDF del corso), note/ (appunti in Markdown), INDICE.md. Salva sempre i file che produci dentro note/ in formato Markdown. Non modificare né cancellare video, trascrizioni e materiale.\n\nRichiesta: ", util::s(&c, "name"));
            let job = uuid::Uuid::new_v4().to_string();
            let cid = util::s(&c, "id").to_string();
            d.send(json!({ "type": "ai-start", "jobId": job, "course": cid, "agent": true, "provider": prov }));
            let (d2, j2) = (d.clone(), job.clone());
            let on = move |ch: String| d2.send(json!({ "type": "ai-chunk", "jobId": j2, "chunk": ch }));
            match ai::run_agent(&prov, &format!("{preamble}{}", p["prompt"].as_str().unwrap_or("")), &lib::dir_of(&c), util::s(&s["ai"], "model"), &on).await {
                Ok(out) => {
                    d.send(json!({ "type": "ai-done", "jobId": job, "course": cid, "output": out }));
                    d.refresh();
                    Ok(json!(out))
                }
                Err(e) => {
                    d.send(json!({ "type": "ai-error", "jobId": job, "error": e.to_string() }));
                    Err(e)
                }
            }
        }
        "lesson:ask" => Ok(json!(d.ask_lesson(p.req("courseId")?, p.req("key")?, p["question"].as_str().unwrap_or(""), &p["history"]).await?)),
        "ai:assist" => assist(d, &p).await,
        "ai:backfill" => Ok(json!(d.ai_backfill(p.as_array().map(|_| util::str_list(Some(&p)))))),
        "ai:queue" => Ok(d.ai_queue_info()),
        "course:genPage" => {
            let id = p.as_str().unwrap_or("").to_string();
            let c = config::course(&id)?;
            let id2 = id.clone();
            d.enqueue_ai(format!("{id}:page"), format!("Descrizione corso · {}", config::course_name(&c)), move |d| async move { d.generate_course_page(&id2, true).await });
            Ok(json!(true))
        }

        // ── semantic search ──
        "search:ready" => {
            d.reset_search_ready();
            Ok(json!(d.search_ready().await))
        }
        "search:install" => {
            let d2 = d.clone();
            setup::add_package(&["fastembed", "pypdf"], &move |l| d2.log(l, None)).await?;
            d.reset_search_ready();
            let ok = d.search_ready().await;
            if ok {
                for c in config::courses(&config::load()) {
                    d.schedule_index(Some(util::s(c, "id")), 500);
                }
            }
            Ok(json!(ok))
        }
        "search:query" => search::query(&config::load(), p["text"].as_str().unwrap_or(""), p.str_of("courseId"), p["k"].as_u64().unwrap_or(20)).await,
        "search:ask" => {
            let c0 = config::load();
            let prov = ai::pick(&c0["settings"])?;
            let job = uuid::Uuid::new_v4().to_string();
            d.send(json!({ "type": "ai-start", "jobId": job, "provider": prov, "ask": true }));
            let (d2, j2) = (d.clone(), job.clone());
            let on = move |ch: String| d2.send(json!({ "type": "ai-chunk", "jobId": j2, "chunk": ch }));
            let r = search::ask(&c0, &prov, p["question"].as_str().unwrap_or(""), p.str_of("courseId"), &on).await;
            match &r {
                Ok(_) => d.send(json!({ "type": "ai-done", "jobId": job, "ask": true })),
                Err(e) => d.send(json!({ "type": "ai-error", "jobId": job, "error": e.to_string() })),
            }
            r
        }
        "search:index" => {
            if !d.search_ready().await {
                bail!("Ricerca semantica non installata");
            }
            let c0 = config::load();
            let d2 = d.clone();
            let log = move |m: String| d2.log(m, None);
            match p.as_str().filter(|s| !s.is_empty()) {
                Some(id) => search::index_course(&c0["settings"], &config::find_course(&c0, id).ok_or_else(|| anyhow!("Corso non trovato"))?, &log).await,
                None => Ok(search::index_all(&c0, &log).await),
            }
        }
        "search:status" => Ok(json!({ "ready": d.search_ready().await, "counts": search::status(&config::load()) })),

        // ── setup & hardware ──
        "setup:detect" => {
            let hw = tokio::task::spawn_blocking(setup::detect).await?;
            let rec = setup::recommend(&hw);
            Ok(json!({ "hw": hw, "rec": rec }))
        }
        "setup:install" => {
            let (d1, d2) = (d.clone(), d.clone());
            let r = setup::install(&p, &move |e| d1.send(util::merge(&json!({ "type": "setup-step" }), &e)), &move |l| d2.send(json!({ "type": "setup-log", "line": l }))).await?;
            config::patch_settings(|s| {
                s["transcription"] = util::merge(&s["transcription"], &r);
                s["setupDone"] = json!(true);
            })?;
            Ok(r)
        }
        "setup:skip" => {
            config::patch_settings(|s| {
                s["setupDone"] = json!(true);
                s["transcription"]["auto"] = json!(false);
            })?;
            Ok(json!(true))
        }
        "hw" => {
            if let Some(h) = d.hw.lock().unwrap().clone() {
                return Ok(h);
            }
            let hw = tokio::task::spawn_blocking(setup::detect).await?;
            let rec = setup::recommend(&hw);
            let cores = util::f(&hw, "cores");
            let h = json!({ "hw": hw, "rec": rec, "parallel": ((cores / 3.0).round() as i64).clamp(2, 6), "pomodoro": { "focus": 25, "short": 5, "long": 15 } });
            *d.hw.lock().unwrap() = Some(h.clone());
            Ok(h)
        }
        "engine:set" => {
            let engine = p.req("engine")?.to_string();
            if engine == "parakeet" {
                let py = util::s(&config::load()["settings"]["transcription"], "python").to_string();
                if !setup::python_has(&py, "parakeet_mlx").await {
                    d.log("🧰 Installo parakeet-mlx…", None);
                    let d2 = d.clone();
                    setup::add_package(&["parakeet-mlx"], &move |l| d2.log(l, None)).await?;
                }
            }
            let s = config::patch_settings(|s| {
                s["transcription"]["engine"] = json!(engine);
                s["transcription"]["model"] = p["model"].clone();
            })?;
            Ok(s["transcription"].clone())
        }

        // ── calendar ──
        "cal:sync" => {
            let s = d.session().await;
            let r: Result<Value> = async {
                let page = s.start().await?;
                d.log("📅 Apro l'orario delle lezioni nei Servizi Online…", None);
                let is_done = polirec_core::browser::done(|u: String, pg| async move {
                    u.contains("oralez") && polirec_core::browser::eval(&pg, "!!document.getElementById('orarioTestuale')").await.ok().and_then(|v| v.as_bool()).unwrap_or(false)
                });
                s.goto(&page, timetable::SERVICE, &is_done, std::time::Duration::from_secs(60)).await?;
                tokio::time::sleep(std::time::Duration::from_millis(800)).await;
                // same trick as polimi-schedule-js: innerText of a visible copy has clean line breaks
                let text = polirec_core::browser::eval(&page, r#"(() => { const d = document.createElement('div'); d.innerHTML = document.getElementById('orarioTestuale').innerHTML; Object.assign(d.style, { display: 'block', height: '0', width: '0', overflow: 'hidden' }); document.body.appendChild(d); const t = d.innerText; d.remove(); return t; })()"#).await?;
                let r = timetable::import_text(text.as_str().unwrap_or(""))?;
                d.log(format!("  ✓ {} serie di lezioni importate", r["count"]), None);
                Ok(r)
            }
            .await;
            d.release_session().await;
            r
        }
        "cal:importText" => timetable::import_text(p.as_str().unwrap_or("")),
        "cal:importIcs" => {
            let src = p.as_str().or_else(|| p.str_of("src")).ok_or_else(|| anyhow!("Calendario mancante"))?.to_string();
            let name = if src.starts_with("http") || src.starts_with("webcal:") { Some("Calendario web") } else { None };
            Ok(json!(timetable::import_ics(&src, p.str_of("name").or(name)).await?))
        }
        "cal:events" => {
            let from = util::parse_date(p["from"].as_str().unwrap_or("")).ok_or_else(|| anyhow!("data non valida"))?;
            let to = util::parse_date(p["to"].as_str().unwrap_or("")).ok_or_else(|| anyhow!("data non valida"))?;
            let mut evs = timetable::occurrences(from, to);
            let courses: Vec<(Value, String)> = config::courses(&config::load()).iter().map(|c| (c.clone(), timetable::course_fullname(c, &lib::load_manifest(&lib::dir_of(c))))).collect();
            for e in &mut evs {
                if let Some((c, _)) = courses.iter().find(|(_, n)| timetable::match_course(util::s(e, "summary"), n)) {
                    e["courseId"] = c["id"].clone();
                    e["course"] = c["name"].clone();
                }
            }
            let t = timetable::load();
            Ok(json!({ "events": evs, "meta": { "updatedAt": t["updatedAt"], "feeds": t.get("feeds") } }))
        }
        "cal:icsPath" => {
            let p = timetable::ics_path();
            if !p.exists() {
                bail!("Importa prima l'orario");
            }
            Ok(json!(p))
        }

        // ── free rooms ──
        "rooms:spaces" => {
            let sp = rooms::spaces().await?;
            let sedi: Vec<Value> = sp["sedi"].as_array().into_iter().flatten().filter(|s| util::s(s, "id") != "MIC").cloned().collect();
            let campus: Vec<Value> = sp["campus"].as_array().into_iter().flatten().filter(|c| util::s(c, "sede") != "MIC").map(|c| {
                let mut c = c.clone();
                c.as_object_mut().map(|o| o.remove("shape"));
                c
            }).collect();
            Ok(json!({ "sedi": sedi, "campus": campus }))
        }
        "rooms:status" => {
            let campus = p.get("campus").filter(|c| !c.is_null()).map(|c| if c.is_array() { c.as_array().unwrap().iter().map(|x| x.as_str().map(String::from).unwrap_or_else(|| x.to_string())).collect() } else { vec![c.as_str().map(String::from).unwrap_or_else(|| c.to_string())] });
            let d2 = d.clone();
            rooms::status(campus, p.str_of("sede"), p["date"].as_str().unwrap_or(""), util::f(&p, "from") as i64, util::f(&p, "to") as i64, &move |x| d2.send(json!({ "type": "rooms-progress", "p": x }))).await
        }
        "rooms:photo" => Ok(match rooms::photo(p.as_str().unwrap_or("")).await {
            Some(f) => json!(file_url(&f)),
            None => Value::Null,
        }),
        "rooms:free" => {
            let when = util::parse_date(p["when"].as_str().unwrap_or("")).map(|d| d.with_timezone(&chrono::Local)).unwrap_or_else(chrono::Local::now);
            rooms::free_rooms(p.str_of("sede").unwrap_or("MIA"), when, p["minutes"].as_i64().unwrap_or(60), p["minCapacity"].as_i64().unwrap_or(0)).await
        }

        // ── AI assistants (MCP / CLI) ──
        "assistant:info" => {
            let cli = cli_exe();
            let q = |s: &str| if s.contains([' ', '&', '(', ')', '\'', '"']) { format!("\"{s}\"") } else { s.to_string() };
            let exe = cli.to_string_lossy().into_owned();
            let claude = tools::which("claude");
            Ok(json!({
                "enabled": util::b(&config::load()["settings"]["integrations"], "assistant"), "claudeInstalled": claude.is_some(),
                "claudeCode": format!("claude mcp add polirec --scope user -- {} mcp", q(&exe)),
                "json": serde_json::to_string_pretty(&json!({ "mcpServers": { "polirec": { "command": exe, "args": ["mcp"] } } }))?,
                "cli": if cfg!(windows) { format!("doskey polirec={} $*", q(&exe)) } else { format!("alias polirec={}", q(&exe)) },
                "bin": exe, "tools": 23,
            }))
        }
        "assistant:addClaude" => {
            let bin = tools::which("claude").ok_or_else(|| anyhow!("Claude Code non è installato"))?;
            let out = tools::command(bin).args(["mcp", "add", "polirec", "--scope", "user", "--"]).arg(cli_exe()).arg("mcp").output().await?;
            if !out.status.success() {
                let e = String::from_utf8_lossy(&out.stderr).trim().to_string();
                bail!("{}", util::tail(if e.is_empty() { "claude mcp add non riuscito" } else { &e }, 300));
            }
            Ok(json!(String::from_utf8_lossy(&out.stdout).trim()))
        }
        m if m.starts_with("api:") => crate::api_methods::call(d, &m[4..], p).await,
        _ => Err(anyhow!("Metodo sconosciuto: {method}")),
    }
}

/// The `polirec` CLI/MCP binary installed next to polirecd.
pub fn cli_exe() -> std::path::PathBuf {
    let name = if cfg!(windows) { "polirec.exe" } else { "polirec" };
    std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join(name))).filter(|p| p.exists()).unwrap_or_else(|| std::path::PathBuf::from(name))
}

/// AI chat for a note. Edits come back as a full revised document → shown inline as accept/reject changes.
async fn assist(d: &Arc<Daemon>, p: &Value) -> Result<Value> {
    let s = config::load()["settings"].clone();
    let prov = ai::pick(&s)?;
    let kind = p["kind"].as_str().unwrap_or("markdown");
    let lang = match kind {
        "latex" => "LaTeX",
        "typst" => "Typst",
        _ => "Markdown (formule LaTeX tra $…$)",
    };
    let course_ctx = match p.str_of("courseId").and_then(|id| config::find_course(&config::load(), id)) {
        Some(c) => format!("Gli appunti sono del corso universitario \"{}\".\n", util::s(&c, "name")),
        None => String::new(),
    };
    let selection = p["selection"].as_str().unwrap_or("");
    let hist: Vec<String> = p["history"].as_array().map(|a| a[a.len().saturating_sub(6)..].to_vec()).unwrap_or_default().iter().map(|h| format!("Studente: {}\nAssistente: {}", util::s(h, "q"), util::s(h, "a"))).collect();
    let prompt = format!(
        "Sei l'assistente di scrittura di un editor di appunti universitari in {lang}. {course_ctx}Hai il documento completo{}.\nSe la richiesta comporta MODIFICARE o AGGIUNGERE testo nel documento, rispondi ESATTAMENTE in questo formato:\n@@NOTA@@ una frase che riassume le modifiche\n@@DOCUMENTO@@\n<il documento COMPLETO aggiornato, in {lang}>\n{}Se invece è una DOMANDA o una richiesta di spiegazione, rispondi normalmente in italiano, in Markdown, in modo conciso.\n{}\nRichiesta: {}",
        if selection.is_empty() { "" } else { " e la porzione selezionata dallo studente" },
        if selection.is_empty() { "Lascia identiche le parti che non devi cambiare.\n" } else { "Modifica solo la parte selezionata (e ciò che serve per coerenza), lascia il resto identico.\n" },
        if hist.is_empty() { String::new() } else { format!("\nConversazione precedente:\n{}\n", hist.join("\n\n")) },
        p["instruction"].as_str().unwrap_or("")
    );
    let input = format!("<documento>\n{}\n</documento>{}", p["document"].as_str().unwrap_or(""), if selection.is_empty() { String::new() } else { format!("\n<selezione>\n{selection}\n</selezione>") });
    let out = d.stream_prompt(&prov, &prompt, &input, json!({ "assist": true }), &std::env::temp_dir()).await?;
    let doc_re = regex::Regex::new(r"@@DOCUMENTO@@\s*\n([\s\S]*)$").unwrap();
    if let Some(m) = doc_re.captures(&out) {
        let note = regex::Regex::new(r"@@NOTA@@\s*(.*)").unwrap().captures(&out).map(|c| c[1].trim().to_string()).unwrap_or_else(|| "Modifiche proposte".into());
        let fence = regex::Regex::new(r"^```\w*\n([\s\S]*?)\n```\s*$").unwrap();
        let body = fence.replace(&m[1], "$1").trim_end().to_string();
        return Ok(json!({ "mode": "edit", "note": note, "document": format!("{body}\n") }));
    }
    Ok(json!({ "mode": "answer", "text": out.trim() }))
}

