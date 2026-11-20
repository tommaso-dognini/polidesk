//! Semantic search over lesson transcripts (with timestamps), AI notes, the student's notes, course pages
//! and course PDFs. Embeddings run locally in python/semantic.py (fastembed); "ask" = retrieval + AI CLI.
use crate::{ai, cleaner, cloud, config, library as lib, notes, paths, setup, tools, util, workspace};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

// ───────── worker ─────────
type Waiters = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value>>>>>;
struct Worker {
    python: String,
    tx: mpsc::UnboundedSender<String>,
    wait: Waiters,
    child: Arc<tokio::sync::Mutex<tokio::process::Child>>,
}
static WORKER: LazyLock<Mutex<Option<Worker>>> = LazyLock::new(Default::default);
static NEXT: AtomicU64 = AtomicU64::new(1);

fn start(python: &str) -> Result<Worker> {
    let mut c = tools::command(python);
    c.arg(setup::script("semantic.py")?).env("PYTHONUNBUFFERED", "1").env("PYTHONIOENCODING", "utf-8").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = c.spawn()?;
    let (mut stdin, so, mut se) = (child.stdin.take().unwrap(), child.stdout.take().unwrap(), child.stderr.take().unwrap());
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    tokio::spawn(async move {
        while let Some(l) = rx.recv().await {
            if stdin.write_all(l.as_bytes()).await.is_err() || stdin.write_all(b"\n").await.is_err() {
                break;
            }
        }
    });
    let wait: Waiters = Default::default();
    let err = Arc::new(Mutex::new(String::new()));
    let e2 = err.clone();
    tokio::spawn(async move {
        let mut s = String::new();
        let _ = se.read_to_string(&mut s).await;
        *e2.lock().unwrap() = util::tail(&s, 2000);
    });
    let w2 = wait.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(so).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            let Ok(m) = serde_json::from_str::<Value>(&l) else { continue };
            let Some(id) = m["id"].as_u64() else { continue };
            if let Some(tx) = w2.lock().unwrap().remove(&id) {
                let _ = tx.send(if util::b(&m, "ok") { Ok(m) } else { Err(anyhow!("{}", util::s(&m, "error"))) });
            }
        }
        // worker exited
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let e = err.lock().unwrap().clone();
        let msg = if e.contains("No module named") { "Installa la ricerca semantica da Impostazioni → AI.".to_string() } else { e.lines().rev().take(3).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" ") };
        for (_, tx) in w2.lock().unwrap().drain() {
            let _ = tx.send(Err(anyhow!("Motore di ricerca terminato. {msg}")));
        }
        *WORKER.lock().unwrap() = None;
    });
    Ok(Worker { python: python.into(), tx, wait, child: Arc::new(tokio::sync::Mutex::new(child)) })
}

async fn call(python: &str, cmd: &str, args: Value) -> Result<Value> {
    let (tx, rx) = oneshot::channel();
    {
        let mut w = WORKER.lock().unwrap();
        if w.as_ref().map(|w| w.python != python).unwrap_or(false) {
            if let Some(old) = w.take() {
                let c = old.child.clone();
                tokio::spawn(async move { let _ = c.lock().await.kill().await; });
            }
        }
        if w.is_none() {
            *w = Some(start(python)?);
        }
        let wk = w.as_ref().unwrap();
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        wk.wait.lock().unwrap().insert(id, tx);
        let mut msg = json!({ "id": id, "cmd": cmd });
        if let Some(m) = args.as_object() {
            for (k, v) in m {
                msg[k] = v.clone();
            }
        }
        wk.tx.send(msg.to_string()).map_err(|_| anyhow!("Motore di ricerca non disponibile"))?;
    }
    rx.await.map_err(|_| anyhow!("Motore di ricerca terminato"))?
}
pub fn stop() {
    if let Some(w) = WORKER.lock().unwrap().take() {
        tokio::spawn(async move { let _ = w.child.lock().await.kill().await; });
    }
}

// ───────── sources → chunks ─────────
fn paragraphs(txt: &str) -> Vec<String> {
    if txt.is_empty() {
        return vec![];
    }
    // split before Markdown headings and on blank lines
    let t = txt.replace('\r', "");
    let mut parts: Vec<String> = vec![];
    let mut cur = String::new();
    let lines: Vec<&str> = t.split('\n').collect();
    for (i, l) in lines.iter().enumerate() {
        let heading = {
            let h = l.trim_start_matches('#');
            let n = l.len() - h.len();
            // JS: \n(?=#{1,4}\s) — the whitespace may be the line break itself
            (1..=4).contains(&n) && (h.starts_with(char::is_whitespace) || (h.is_empty() && i + 1 < lines.len()))
        };
        if i > 0 && (heading || l.trim().is_empty()) {
            parts.push(std::mem::take(&mut cur));
            if l.trim().is_empty() {
                continue;
            }
        }
        if !cur.is_empty() {
            cur.push('\n');
        }
        cur.push_str(l);
    }
    parts.push(cur);
    let mut out = vec![];
    for p in parts.iter().map(|s| s.trim()).filter(|s| s.encode_utf16().count() > 25) {
        let c: Vec<char> = p.chars().collect();
        let mut i = 0;
        while i < c.len() {
            out.push(c[i..(i + 1100).min(c.len())].iter().collect());
            i += 1000;
        }
    }
    out
}
fn safe_read(p: &Path) -> String {
    std::fs::read_to_string(p).unwrap_or_default()
}
fn strip_note_ext(f: &str) -> String {
    for e in [".md", ".tex", ".typ"] {
        if let Some(s) = f.strip_suffix(e) {
            return s.to_string();
        }
    }
    f.to_string()
}

pub fn course_chunks(settings: &Value, c: &Value) -> Vec<Value> {
    let mut out = vec![];
    let dir = lib::dir_of(c);
    let d = lib::course_dirs(&dir);
    let m = lib::load_manifest(&dir);
    let id = util::s(c, "id");
    let cname = [util::s(c, "name"), util::s(&m["course"], "fullname"), util::s(c, "input")].into_iter().find(|s| !s.is_empty()).unwrap_or("").to_string();
    for r in lib::with_file_status(&dir, &m) {
        let base = json!({ "course": id, "courseName": cname, "lesson": r["key"], "title": r["displayTitle"], "date": util::take(util::s(&r, "isoDate"), 10) });
        let stem = lib::stem(util::s(&r, "file")).to_string();
        // transcript windows (~60 s) keep their start time → open the video right there
        let srt = d.transcripts.join(format!("{stem}.srt"));
        if srt.exists() {
            let mut cur: Option<(f64, String)> = None;
            for s in cleaner::parse_srt(&safe_read(&srt)) {
                let c0 = cur.get_or_insert((s.start, String::new()));
                if !c0.1.is_empty() {
                    c0.1.push(' ');
                }
                c0.1.push_str(&s.text);
                if s.end - c0.0 >= 60.0 || c0.1.encode_utf16().count() > 900 {
                    let (st, text) = cur.take().unwrap();
                    out.push(json!({ "text": text, "meta": util::merge(&base, &json!({ "type": "lesson", "t": st.floor() as i64 })) }));
                }
            }
            if let Some((st, text)) = cur.filter(|c| !c.1.is_empty()) {
                out.push(json!({ "text": text, "meta": util::merge(&base, &json!({ "type": "lesson", "t": st.floor() as i64 })) }));
            }
        }
        for n in util::str_list(r.get("notes")) {
            let kind = n.rsplit(" - ").next().unwrap_or(&n).trim_end_matches(".md").to_string();
            for p in paragraphs(&safe_read(&d.notes.join(&n))) {
                out.push(json!({ "text": p, "meta": util::merge(&base, &json!({ "type": if kind == "sommario" { "summary" } else { "ainote" }, "file": n })) }));
            }
        }
    }
    // user notes + course page (cloud-aware)
    let data_dir = cloud::course_data_dir(settings, c);
    let ndir = notes::dir_for(&data_dir);
    for f in notes::list(&ndir) {
        let file = util::s(&f, "file");
        let meta = json!({ "type": "note", "course": id, "courseName": cname, "file": file, "kind": f["kind"], "title": strip_note_ext(file) });
        // uploaded PDFs: text extracted in python, like the course material
        if util::s(&f, "type") == "pdf" {
            out.push(json!({ "pdf": notes::resolve(&ndir, file).unwrap_or_default(), "meta": meta }));
            continue;
        }
        if util::s(&f, "kind") == "file" && !notes::is_text_type(util::s(&f, "type")) {
            continue;
        }
        for p in paragraphs(&safe_read(&notes::resolve(&ndir, file).unwrap_or_default())) {
            out.push(json!({ "text": p, "meta": meta.clone() }));
        }
    }
    let page = workspace::load(Some(&data_dir))["page"].as_str().unwrap_or("").to_string();
    for p in paragraphs(&page) {
        out.push(json!({ "text": p, "meta": { "type": "page", "course": id, "courseName": cname, "title": "Pagina del corso" } }));
    }
    // course material PDFs (text extracted in python)
    for v in m["materials"].as_object().into_iter().flat_map(|o| o.values()) {
        let rel = util::s(v, "path");
        let abs = dir.join("materiale").join(rel);
        if rel.to_lowercase().ends_with(".pdf") && abs.exists() {
            out.push(json!({ "pdf": abs, "meta": { "type": "material", "course": id, "courseName": cname, "file": rel, "title": Path::new(rel).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default() } }));
        }
    }
    out
}
fn general_chunks(settings: &Value) -> Vec<Value> {
    let dir = cloud::general_notes_dir(settings);
    let mut out = vec![];
    for f in notes::list(&dir) {
        let file = util::s(&f, "file");
        let meta = json!({ "type": "note", "course": null, "courseName": "Generale", "file": file, "kind": f["kind"], "title": strip_note_ext(file) });
        if util::s(&f, "type") == "pdf" {
            out.push(json!({ "pdf": notes::resolve(&dir, file).unwrap_or_default(), "meta": meta }));
            continue;
        }
        if util::s(&f, "kind") == "file" && !notes::is_text_type(util::s(&f, "type")) {
            continue;
        }
        for p in paragraphs(&safe_read(&notes::resolve(&dir, file).unwrap_or_default())) {
            out.push(json!({ "text": p, "meta": meta.clone() }));
        }
    }
    out
}

// ───────── public API ─────────
pub fn scope_dir(id: Option<&str>) -> PathBuf {
    paths::app_dir().join("index").join(id.unwrap_or("generale"))
}
fn python(settings: &Value) -> String {
    Some(util::s(&settings["transcription"], "python")).filter(|s| !s.is_empty()).unwrap_or("python3").to_string()
}

pub async fn ready(settings: &Value) -> bool {
    setup::python_has(&python(settings), "fastembed, pypdf").await
}

pub async fn index_course(settings: &Value, c: &Value, log: &(dyn Fn(String) + Send + Sync)) -> Result<Value> {
    let id = util::s(c, "id");
    let chunks = course_chunks(settings, c);
    let r = call(&python(settings), "index", json!({ "scope": id, "dir": scope_dir(Some(id)), "chunks": chunks })).await?;
    log(format!("🔎 Indice {}: {} frammenti ({} nuovi)", config::course_name(c), r["total"], r["added"]));
    Ok(r)
}
pub async fn index_general(settings: &Value) -> Result<Value> {
    call(&python(settings), "index", json!({ "scope": "generale", "dir": scope_dir(None), "chunks": general_chunks(settings) })).await
}
pub async fn index_all(cfg: &Value, log: &(dyn Fn(String) + Send + Sync)) -> Value {
    let mut res = serde_json::Map::new();
    for c in config::courses(cfg) {
        let r = match index_course(&cfg["settings"], c, log).await {
            Ok(r) => r,
            Err(e) => {
                log(format!("✗ Indice: {e}"));
                json!({ "error": e.to_string() })
            }
        };
        res.insert(util::s(c, "id").into(), r);
    }
    if let Ok(r) = index_general(&cfg["settings"]).await {
        res.insert("generale".into(), r);
    }
    Value::Object(res)
}

pub async fn query(cfg: &Value, text: &str, course_id: Option<&str>, k: u64) -> Result<Value> {
    let dirs: Vec<PathBuf> = match course_id {
        Some(id) => vec![scope_dir(Some(id))],
        None => config::courses(cfg).iter().map(|c| scope_dir(Some(util::s(c, "id")))).chain(std::iter::once(scope_dir(None))).collect(),
    };
    let existing: Vec<PathBuf> = dirs.into_iter().filter(|d| d.join("vectors.npy").exists()).collect();
    if existing.is_empty() {
        return Ok(json!({ "results": [], "needIndex": true }));
    }
    let r = call(&python(&cfg["settings"]), "query", json!({ "dirs": existing, "text": text, "k": k })).await?;
    Ok(json!({ "results": r["results"] }))
}

fn fmt_t(s: i64) -> String {
    format!("{}:{:02}", s / 60, s % 60)
}
fn label(m: &Value) -> String {
    match util::s(m, "type") {
        "lesson" => format!("Lezione «{}» {} al minuto {}", util::s(m, "title"), util::s(m, "date"), fmt_t(util::f(m, "t") as i64)),
        "material" => format!("Materiale {}{}", util::s(m, "file"), if util::truthy(m.get("page")) { format!(" p. {}", m["page"]) } else { String::new() }),
        "summary" => format!("Sommario lezione «{}»", util::s(m, "title")),
        "page" => format!("Pagina del corso {}", util::s(m, "courseName")),
        _ => format!("Appunto «{}»", util::s(m, "title")),
    }
}

/// Retrieval-augmented answer with numbered citations.
pub async fn ask(cfg: &Value, provider: &str, model: &str, question: &str, course_id: Option<&str>, on_chunk: ai::OnChunk<'_>) -> Result<Value> {
    let q = query(cfg, question, course_id, 10).await?;
    let results = q["results"].as_array().cloned().unwrap_or_default();
    if results.is_empty() {
        bail!("Indice vuoto: premi «Aggiorna indice» nella ricerca");
    }
    let ctx: Vec<String> = results.iter().enumerate().map(|(i, r)| format!("[{}] ({})\n{}", i + 1, label(&r["meta"]), util::s(r, "text"))).collect();
    let prompt = format!("Sei un tutor universitario. Rispondi alla domanda dello studente usando SOLO le fonti numerate qui sotto (trascrizioni di lezioni, appunti, slide). Cita le fonti tra parentesi quadre come [1], [2]. Se le fonti non bastano, dillo chiaramente. Rispondi in italiano, in Markdown, in modo conciso.\n\nDomanda: {question}");
    let answer = ai::run_prompt(provider, &prompt, &format!("<fonti>\n{}\n</fonti>", ctx.join("\n\n")), model, &std::env::temp_dir(), on_chunk).await?;
    Ok(json!({ "answer": answer, "sources": results }))
}

/// Number of indexed chunks per course (+ "generale").
pub fn status(cfg: &Value) -> Value {
    let one = |id: Option<&str>| util::read_json(&scope_dir(id).join("chunks.json")).and_then(|v| v.as_array().map(|a| a.len())).unwrap_or(0);
    let mut m = serde_json::Map::new();
    for c in config::courses(cfg) {
        let id = util::s(c, "id");
        m.insert(id.into(), json!(one(Some(id))));
    }
    m.insert("generale".into(), json!(one(None)));
    Value::Object(m)
}
