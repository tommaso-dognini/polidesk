//! Course sync: course → recording sources → recordings → downloads (in parallel) + course material.
use crate::browser::Session;
use crate::downloader::{self, Headers};
use crate::library as lib;
use crate::{enhance, exams, materials, recman, tools, util, webeep, webex, Emit};
use anyhow::{anyhow, bail, Result};
use base64::Engine;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct Opts {
    pub parallel: usize,
    pub dry_run: bool,
    pub limit: Option<usize>,
    pub only_materials: bool,
    pub materials: Option<bool>,
    pub stop: Arc<AtomicBool>,
    pub control: Arc<Control>,
    /// only these recordings (e.g. "Scarica il video" on one lesson); ignores the "ignored" flag
    pub keys: Option<Vec<String>>,
    /// download the full video even when the course is "streamOnly"
    pub full_video: bool,
    /// search past exams now, even if the last search is recent ("Cerca ora")
    pub exams: bool,
}
impl Default for Opts {
    fn default() -> Self {
        Opts { parallel: 3, dry_run: false, limit: None, only_materials: false, materials: None, stop: Arc::new(AtomicBool::new(false)), control: Default::default(), keys: None, full_video: false, exams: false }
    }
}

/// Pause / resume of single downloads ("<course id>:<recording key>") or of all of them.
/// Paused downloads keep their .part file and resume where they stopped (aria2c / range requests).
#[derive(Default)]
pub struct Control {
    all: AtomicBool,
    paused: std::sync::Mutex<std::collections::HashSet<String>>,
    active: std::sync::Mutex<std::collections::HashMap<String, Arc<tokio::sync::Notify>>>,
}
impl Control {
    pub fn id(course: &str, key: &str) -> String {
        format!("{course}:{key}")
    }
    pub fn is_paused(&self, id: &str) -> bool {
        self.all.load(Ordering::Relaxed) || self.paused.lock().unwrap().contains(id)
    }
    pub fn all_paused(&self) -> bool {
        self.all.load(Ordering::Relaxed)
    }
    pub fn paused_ids(&self) -> Vec<String> {
        self.paused.lock().unwrap().iter().cloned().collect()
    }
    /// Pause one download (stops it now if running).
    pub fn pause(&self, id: &str) {
        self.paused.lock().unwrap().insert(id.to_string());
        if let Some(n) = self.active.lock().unwrap().get(id) {
            n.notify_one();
        }
    }
    pub fn resume(&self, id: &str) {
        self.paused.lock().unwrap().remove(id);
    }
    pub fn pause_all(&self) {
        self.all.store(true, Ordering::Relaxed);
        for n in self.active.lock().unwrap().values() {
            n.notify_one();
        }
    }
    pub fn resume_all(&self) {
        self.all.store(false, Ordering::Relaxed);
        self.paused.lock().unwrap().clear();
    }
    pub fn restore(&self, all: bool, ids: Vec<String>) {
        self.all.store(all, Ordering::Relaxed);
        *self.paused.lock().unwrap() = ids.into_iter().collect();
    }
    pub fn is_active(&self, id: &str) -> bool {
        self.active.lock().unwrap().contains_key(id)
    }
}

struct Ctx {
    dir: std::path::PathBuf,
    course_id: String,
    manifest: Mutex<Value>,
    emit: Emit,
}
impl Ctx {
    fn log(&self, msg: impl Into<String>) {
        (self.emit)(json!({ "type": "log", "course": self.course_id, "msg": msg.into() }));
    }
    async fn save(&self) {
        let m = self.manifest.lock().await;
        let _ = lib::save_manifest(&self.dir, &m);
        (self.emit)(json!({ "type": "manifest", "course": self.course_id }));
    }
    async fn set_rec(&self, key: &str, f: impl FnOnce(&mut Value)) {
        let mut m = self.manifest.lock().await;
        if let Some(r) = m["recordings"].get_mut(key) {
            f(r);
        }
    }
    async fn rec(&self, key: &str) -> Value {
        self.manifest.lock().await["recordings"][key].clone()
    }
}

fn b64tail(s: &str) -> String {
    let e = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(s);
    util::tail(&e, 24)
}

/// Sync one course. `course` is the config entry; returns { total, downloaded, failed, materials, webeepId, name }.
pub async fn sync_course(s: &Arc<Session>, course: &Value, opts: &Opts, emit: Emit) -> Result<Value> {
    let course_id = util::s(course, "id").to_string();
    let dir = lib::dir_of(course);
    let dirs = lib::course_dirs(&dir);
    std::fs::create_dir_all(&dirs.video)?;
    let ctx = Arc::new(Ctx { dir: dir.clone(), course_id: course_id.clone(), manifest: Mutex::new(lib::load_manifest(&dir)), emit: emit.clone() });
    let log_fn = {
        let c = ctx.clone();
        move |m: String| c.log(m)
    };
    let stop = opts.stop.clone();
    let should_stop = move || stop.load(Ordering::Relaxed);

    // "Scarica il video" of single lessons: straight from the manifest, no WeBeep / archive scan
    let (wc, name, found) = if let Some(keys) = opts.keys.clone() {
        let m = ctx.manifest.lock().await;
        let found: Vec<(String, Value)> = keys.iter().filter_map(|k| m["recordings"].get(k).map(|r| (k.clone(), r.clone()))).collect();
        let name = Some(util::s(course, "name")).filter(|n| !n.is_empty()).map(String::from).unwrap_or_else(|| util::s(&m["course"], "fullname").to_string());
        (m["course"].clone(), name, found)
    } else {
        // 1. course
        ctx.log("🔎 Cerco il corso su WeBeep...");
        let input = match course["webeepId"].as_i64() {
            Some(id) => format!("webeep:{id}"),
            None => util::s(course, "input").to_string(),
        };
        let wc = webeep::resolve_course(s, &input).await?;
        let wurl = Some(util::s(&wc, "url")).filter(|u| !u.is_empty()).map(String::from).unwrap_or_else(|| format!("{}/course/view.php?id={}", webeep::WEBEEP, wc["id"]));
        ctx.manifest.lock().await["course"] = json!({ "id": wc["id"], "fullname": wc["fullname"], "url": wurl });
        let name = Some(util::s(course, "name")).filter(|n| !n.is_empty()).map(String::from).unwrap_or_else(|| util::s(&wc, "fullname").to_string());
        ctx.log(format!("  ✓ {} (id {})", util::s(&wc, "fullname"), wc["id"]));

        // 2. sources
        ctx.log("🔎 Cerco gli archivi delle registrazioni in tutte le sezioni...");
        let mut sources = webeep::find_recording_sources(s, &wc, &log_fn).await?;
        for u in util::str_list(course.get("extraUrls")) {
            let c = webeep::classify(&u).unwrap_or_else(|| json!({ "type": "unknown" }));
            sources.push(util::merge(&c, &json!({ "url": u, "label": "Aggiunto manualmente" })));
        }
        ctx.manifest.lock().await["sources"] = json!(sources);
        for src in &sources {
            ctx.log(format!("  • [{}] {} → {}", util::s(src, "type"), util::s(src, "label"), util::take(util::s(src, "url"), 110)));
        }
        if sources.is_empty() {
            ctx.log("  ⚠ Nessuna sorgente trovata. Puoi aggiungere manualmente il link dell'archivio nelle impostazioni del corso.");
        }
        ctx.save().await;

        // 3. enumerate recordings
        let mut found: Vec<(String, Value)> = vec![];
        for src in &sources {
            if should_stop() {
                break;
            }
            let (typ, url, label) = (util::s(src, "type"), util::s(src, "url"), util::s(src, "label"));
            let r: Result<()> = async {
                match typ {
                    "recman" => {
                        ctx.log(format!("📚 Archivio: {}", if label.is_empty() { url } else { label }));
                        let recs = recman::list_recordings(s, url, &log_fn).await?;
                        if recs.is_empty() {
                            ctx.log("  ℹ Archivio vuoto: il docente non ha (ancora) pubblicato registrazioni qui");
                        }
                        for r in recs {
                            let key = match r["transferId"].as_str() {
                                Some(t) => format!("recman-{t}"),
                                None => format!("recman-{}-{}", util::s(&r, "isoDate"), lib::sanitize(util::s(&r, "topic"), 40)),
                            };
                            let teacher = lib::teacher_from(util::s(&r, "course"));
                            found.push((key, util::merge(&r, &json!({ "source": "recman", "sourceLabel": label, "teacher": teacher }))));
                        }
                    }
                    "webex" => {
                        // direct WebEx links (RCID / playback): resolved once, then cached in the manifest
                        let cached = ctx.manifest.lock().await["sourceCache"][url].clone();
                        let entry = if cached.is_object() && !util::truthy(cached.get("error")) {
                            cached
                        } else {
                            let playback = webex::resolve_to_playback(s, url).await?;
                            let info = webex::get_stream_info(s, &playback, "").await.unwrap_or_else(|e| json!({ "error": e.to_string() }));
                            let id = webex::extract_recording_id(&playback).unwrap_or_default();
                            let iso = info["createTime"].as_str().and_then(util::parse_date).or_else(|| info["createTime"].as_i64().and_then(|ms| chrono::DateTime::from_timestamp_millis(ms)));
                            let e = json!({
                                "key": format!("webex-{id}"), "webexUrl": playback, "recordName": info["recordName"], "error": info.get("error"),
                                "isoDate": iso.map(|d| d.with_timezone(&chrono::Local).format("%Y-%m-%dT%H:%M").to_string()),
                                "duration": info["duration"].as_f64().map(|d| format!("{} min", (d / 60000.0).round() as i64)).unwrap_or_default(),
                            });
                            let mut m = ctx.manifest.lock().await;
                            if !m["sourceCache"].is_object() {
                                m["sourceCache"] = json!({});
                            }
                            m["sourceCache"][url] = e.clone();
                            drop(m);
                            ctx.log(format!("  🔗 {label} → {}", [util::s(&e, "recordName"), util::s(&e, "error")].into_iter().find(|x| !x.is_empty()).unwrap_or("")));
                            e
                        };
                        // the teacher's link text is usually more meaningful than the WebEx meeting name
                        let topic = if !label.is_empty() && !label.starts_with("http:") && !label.starts_with("https:") { json!(label) } else { entry["recordName"].clone() };
                        found.push((util::s(&entry, "key").to_string(), json!({ "source": "webex", "sourceLabel": label, "webexUrl": entry["webexUrl"], "topic": topic, "webexName": entry["recordName"], "isoDate": entry["isoDate"], "duration": entry["duration"] })));
                    }
                    "direct" => {
                        let base = reqwest::Url::parse(url).ok().and_then(|u| u.path_segments().and_then(|mut s| s.next_back().map(String::from))).unwrap_or_default();
                        found.push((format!("direct-{}", b64tail(url)), json!({ "source": "direct", "directUrl": url, "topic": if label.is_empty() { base } else { label.to_string() } })));
                    }
                    "youtube" if tools::which("yt-dlp").is_some() => {
                        found.push((format!("yt-{}", b64tail(url)), json!({ "source": "youtube", "directUrl": url, "topic": label })));
                    }
                    _ => ctx.log(format!("  ⚠ Sorgente non supportata ({typ}): {url}")),
                }
                Ok(())
            }
            .await;
            if let Err(e) = r {
                ctx.log(format!("  ✗ Errore sulla sorgente {}: {e}", if label.is_empty() { url } else { label }));
            }
        }
        (wc, name, found)
    };

    // merge into the manifest
    {
        let mut m = ctx.manifest.lock().await;
        for (key, rec) in &found {
            let prev = m["recordings"].get(key).cloned().unwrap_or_else(|| json!({}));
            let mut r = util::merge(&prev, rec);
            r["key"] = json!(key);
            if util::truthy(prev.get("webexUrl")) {
                r["webexUrl"] = prev["webexUrl"].clone();
            }
            r["status"] = if util::truthy(prev.get("status")) { prev["status"].clone() } else { json!("new") };
            if r["status"] == json!("paused") && !opts.control.is_paused(&Control::id(&course_id, key)) {
                r["status"] = json!("new");
            }
            m["recordings"][key] = r;
            let file = lib::assign_filename(&m, key, &m["recordings"][key].clone());
            m["recordings"][key]["file"] = json!(file);
            // status follows the files: video → downloaded, audio only → audio; deleted by the student → new again
            let (video, audio) = (dirs.video.join(&file).exists(), dirs.audio.join(lib::audio_name(&file)).exists());
            let st = util::s(&m["recordings"][key], "status").to_string();
            let now = if video { "downloaded" } else if audio { "audio" } else if st == "downloaded" || st == "audio" { "new" } else { "" };
            if !now.is_empty() && now != st {
                m["recordings"][key]["status"] = json!(now);
            }
        }
    }
    ctx.save().await;
    lib::write_index(&dir, &*ctx.manifest.lock().await)?;

    // "streamOnly" courses: lessons are watched online, only the audio of not yet transcribed ones is downloaded
    let audio_only = lib::stream_only(course) && !opts.full_video;
    let mut todo: Vec<Value> = {
        let m = ctx.manifest.lock().await;
        let mut seen = std::collections::HashSet::new();
        found
            .iter()
            .filter(|(k, _)| seen.insert(k.clone()))
            .map(|(k, _)| m["recordings"][k].clone())
            .filter(|r| match &opts.keys {
                Some(keys) => keys.iter().any(|k| k == util::s(r, "key")) && util::s(r, "status") != "downloaded",
                None => util::s(r, "status") != "downloaded" && !util::b(r, "ignored"),
            })
            .filter(|r| !audio_only || (util::s(r, "status") != "audio" && !util::truthy(lib::file_status(&dir, r).get("transcript"))))
            .collect()
    };
    // same course taught by several teachers (parallel tracks): ask which one(s) the student follows
    let teachers = lib::teachers_of(&*ctx.manifest.lock().await);
    if teachers.len() > 1 {
        match course.get("teachers").filter(|t| t.is_array()) {
            None => {
                let before = todo.len();
                todo.retain(|r| util::s(r, "teacher").is_empty());
                let list: Vec<String> = teachers.iter().map(|t| format!("{}: {}", util::s(t, "name"), t["count"])).collect();
                let waiting = before - todo.len();
                ctx.log(format!("👥 Registrazioni di {} docenti ({}): scegli quale segui prima di scaricarle{}", teachers.len(), list.join(", "), if waiting > 0 { format!(" ({waiting} in attesa)") } else { String::new() }));
                emit(json!({ "type": "teacher-choice", "course": course_id, "teachers": teachers }));
            }
            Some(t) => {
                todo.retain(|r| lib::followed(Some(t), r));
                let mut m = ctx.manifest.lock().await;
                if m.get("teachers") != Some(t) {
                    m["teachers"] = t.clone();
                    let _ = lib::save_manifest(&dir, &m);
                    let _ = lib::write_index(&dir, &m);
                }
            }
        }
    }
    // newest first, so a limited/interrupted sync always gets the latest lessons
    todo.sort_by(|a, b| util::s(b, "isoDate").cmp(util::s(a, "isoDate")));
    if let Some(l) = opts.limit {
        todo.truncate(l);
    }
    if opts.only_materials {
        todo.clear();
    }
    ctx.log(format!("📋 {} registrazioni trovate, {} da scaricare{}{}", found.len(), todo.len(), if audio_only { " (solo audio: il video si guarda in streaming)" } else { "" }, opts.limit.map(|l| format!(" (limite {l})")).unwrap_or_default()));
    emit(json!({ "type": "summary", "course": course_id, "total": found.len(), "todo": todo.len() }));
    for r in &todo {
        emit(json!({ "type": "download-queued", "course": course_id, "key": r["key"], "file": r["file"], "title": lib::pretty_topic(r), "date": r["isoDate"], "audio": audio_only }));
    }

    // course material — only when enabled for this course
    let want_materials = opts.materials.unwrap_or_else(|| course["materials"].as_bool() == Some(true));
    let mut materials_result = Value::Null;
    if want_materials && !opts.dry_run && !should_stop() {
        let mut m = ctx.manifest.lock().await.clone();
        match materials::sync_materials(s, &dir, &mut m, &log_fn, &should_stop).await {
            Ok(r) => {
                materials_result = r;
                ctx.manifest.lock().await["materials"] = m["materials"].clone();
                ctx.save().await;
            }
            Err(e) => ctx.log(format!("  ✗ Materiale: {e}")),
        }
    }
    // past exams (TdE) of earlier editions — only when enabled for this course
    if course["pastExams"].as_bool() == Some(true) && opts.keys.is_none() && !opts.dry_run && !should_stop() && (opts.exams || exams::due(&dir)) {
        let m = ctx.manifest.lock().await.clone();
        if let Err(e) = exams::sync_exams(s, course, &dir, &m, &log_fn, &should_stop).await {
            ctx.log(format!("  ✗ Temi d'esame: {e}"));
        }
    }
    let out = |downloaded: usize, failed: usize, mat: Value| json!({ "total": found.len(), "downloaded": downloaded, "failed": failed, "materials": mat, "webeepId": wc["id"], "name": name });
    if opts.dry_run || todo.is_empty() {
        return Ok(out(0, 0, materials_result));
    }

    // 4+5. resolve RecMan previews (serialized: RecMan sessions are stateful) and download in parallel
    let serial = Arc::new(Mutex::new(()));
    let ok = Arc::new(AtomicUsize::new(0));
    let failed = Arc::new(AtomicUsize::new(0));
    let password = util::s(course, "videoPassword").to_string();
    let sem = Arc::new(tokio::sync::Semaphore::new(opts.parallel.max(1)));
    let mut set = tokio::task::JoinSet::new();
    for r0 in todo {
        let permit = sem.clone().acquire_owned().await?;
        if should_stop() {
            break;
        }
        let job = Download { ctx: ctx.clone(), s: s.clone(), serial: serial.clone(), emit: emit.clone(), password: password.clone(), ok: ok.clone(), failed: failed.clone(), control: opts.control.clone(), audio: audio_only, enhance: course["enhanceAudio"].as_bool().unwrap_or_else(|| crate::config::load()["settings"]["download"]["enhanceAudio"].as_bool() == Some(true)) };
        set.spawn(async move {
            let _permit = permit;
            job.run(r0).await;
        });
    }
    while set.join_next().await.is_some() {}
    lib::write_index(&dir, &*ctx.manifest.lock().await)?;
    let (ok, failed) = (ok.load(Ordering::Relaxed), failed.load(Ordering::Relaxed));
    ctx.log(format!("🏁 Completato: {ok} scaricati, {failed} errori"));
    Ok(out(ok, failed, materials_result))
}

struct Download {
    ctx: Arc<Ctx>,
    s: Arc<Session>,
    serial: Arc<Mutex<()>>,
    emit: Emit,
    password: String,
    ok: Arc<AtomicUsize>,
    failed: Arc<AtomicUsize>,
    control: Arc<Control>,
    /// audio track only (streamOnly courses)
    audio: bool,
    /// «Migliora l'audio» right after the download
    enhance: bool,
}
impl Download {
    async fn paused(&self, key: &str) {
        self.ctx.set_rec(key, |x| x["status"] = json!("paused")).await;
        self.ctx.save().await;
        (self.emit)(json!({ "type": "download-paused", "course": self.ctx.course_id, "key": key }));
        self.ctx.log(format!("⏸ In pausa: {}", util::s(&self.ctx.rec(key).await, "file")));
    }
    async fn run(self, r0: Value) {
        let ctx = &self.ctx;
        let key = util::s(&r0, "key").to_string();
        let file = util::s(&r0, "file").to_string();
        let dest = if self.audio { ctx.dir.join(lib::DIR_AUDIO).join(lib::audio_name(&file)) } else { ctx.dir.join(lib::DIR_VIDEO).join(&file) };
        let id = Control::id(&ctx.course_id, &key);
        if self.control.is_paused(&id) {
            return self.paused(&key).await;
        }
        let stop = Arc::new(tokio::sync::Notify::new());
        self.control.active.lock().unwrap().insert(id.clone(), stop.clone());
        ctx.set_rec(&key, |r| {
            r["status"] = json!("downloading");
            r.as_object_mut().map(|o| o.remove("error"));
        })
        .await;
        ctx.save().await;
        (self.emit)(json!({ "type": "download-start", "course": ctx.course_id, "key": key, "file": file, "title": lib::pretty_topic(&r0), "audio": self.audio }));
        // pausing drops the download future: aria2c / ffmpeg are killed, the .part file stays for resuming
        let res = tokio::select! {
            r = self.fetch(&key, &file, &dest) => Some(r),
            _ = stop.notified() => None,
        };
        self.control.active.lock().unwrap().remove(&id);
        let Some(res) = res else { return self.paused(&key).await };
        match res {
            Ok(()) => {
                // voice enhancement before the lesson is marked downloaded (transcription then uses the clean audio)
                if self.enhance {
                    ctx.log(format!("  🎚 Miglioro l'audio: {file}"));
                    let (emit, cid, k) = (self.emit.clone(), ctx.course_id.clone(), key.clone());
                    let on = move |p: f64| emit(json!({ "type": "enhance-progress", "course": cid, "key": k, "percent": p.round() }));
                    match enhance::enhance(&ctx.dir, &dest, &on).await {
                        Ok(()) => (self.emit)(json!({ "type": "enhance-done", "course": ctx.course_id, "key": key })),
                        Err(e) => {
                            ctx.log(format!("  ⚠ Audio non migliorato ({file}): {e}"));
                            (self.emit)(json!({ "type": "enhance-done", "course": ctx.course_id, "key": key, "error": e.to_string() }));
                        }
                    }
                }
                let audio = self.audio;
                ctx.set_rec(&key, |x| {
                    x["status"] = json!(if audio { "audio" } else { "downloaded" });
                    x["downloadedAt"] = json!(util::now_iso());
                })
                .await;
                self.ok.fetch_add(1, Ordering::Relaxed);
                ctx.log(format!("  ✓ {}{file}", if audio { "🎧 " } else { "" }));
                (self.emit)(json!({ "type": "downloaded", "course": ctx.course_id, "key": key, "path": dest, "audio": audio }));
            }
            Err(e) => {
                let msg = e.to_string();
                ctx.set_rec(&key, |x| {
                    x["status"] = json!("error");
                    x["error"] = json!(msg);
                })
                .await;
                self.failed.fetch_add(1, Ordering::Relaxed);
                ctx.log(format!("  ✗ {file}: {msg}"));
                (self.emit)(json!({ "type": "download-error", "course": ctx.course_id, "key": key, "error": msg }));
            }
        }
        ctx.save().await;
    }

    async fn fetch(&self, key: &str, file: &str, dest: &Path) -> Result<()> {
        let ctx = &self.ctx;
        let r = ctx.rec(key).await;
        let src = resolve_source(&self.s, &r, &self.password, Some(&self.serial)).await?;
        if src.patch.as_object().is_some_and(|o| !o.is_empty()) {
            let patch = src.patch.clone();
            ctx.set_rec(key, |x| *x = util::merge(x, &patch)).await;
            ctx.save().await;
        }
        let progress: downloader::Progress = {
            let (emit, cid, key, file) = (self.emit.clone(), ctx.course_id.clone(), key.to_string(), file.to_string());
            Arc::new(move |p: Value| emit(util::merge(&json!({ "type": "progress", "course": cid, "key": key, "file": file }), &p)))
        };
        if let Some(yt) = &src.youtube {
            return ytdlp(yt, dest, progress, self.audio).await;
        }
        let dur = util::f(&ctx.rec(key).await, "durationSec");
        let mut last: Option<anyhow::Error> = None;
        for url in &src.urls {
            ctx.log(format!("  ⬇ {}{file}", if self.audio { "🎧 " } else { "" }));
            let r = if self.audio { downloader::ffmpeg_audio(url, dest, &src.headers, progress.clone(), dur).await.map(|_| ()) } else { downloader::download(url, dest, &src.headers, progress.clone(), dur).await.map(|_| ()) };
            match r {
                Ok(()) => return Ok(()),
                Err(e) => {
                    ctx.log(format!("  ↻ tentativo fallito ({}), provo l'URL alternativo...", util::take(&e.to_string(), 120)));
                    last = Some(e);
                }
            }
        }
        Err(last.unwrap_or_else(|| anyhow!("download non riuscito")))
    }
}

/// Where a recording's video can be fetched from right now (WebEx URLs are signed and expire).
pub struct Source {
    /// candidate URLs, fastest download first
    pub urls: Vec<String>,
    pub headers: Headers,
    /// YouTube page (played / downloaded with yt-dlp)
    pub youtube: Option<String>,
    /// fields learned on the way (webexUrl, directUrl, durationSec) to save in the manifest
    pub patch: Value,
}

/// RecMan preview → WebEx / media URL → stream info. `serial`: RecMan sessions are stateful, one resolve at a time.
pub async fn resolve_source(s: &Session, rec: &Value, password: &str, serial: Option<&Mutex<()>>) -> Result<Source> {
    let mut r = rec.clone();
    let mut patch = json!({});
    if util::s(&r, "source") == "recman" && !util::truthy(r.get("webexUrl")) && !util::truthy(r.get("directUrl")) {
        let res = {
            let _g = match serial {
                Some(m) => Some(m.lock().await),
                None => None,
            };
            recman::resolve_preview(s, util::s(&r, "previewUrl")).await?
        };
        if let Some(w) = res["webexUrl"].as_str() {
            patch["webexUrl"] = json!(w);
        } else if let Some(m) = res["mediaUrls"][0].as_str() {
            patch["directUrl"] = json!(m);
        } else {
            bail!("Anteprima RecMan: link video non trovato (finale: {})", util::s(&res, "finalUrl"));
        }
        r = util::merge(&r, &patch);
    }
    let mut headers: Headers = vec![("User-Agent".into(), webex::UA.into())];
    let mut youtube = None;
    let urls: Vec<String> = if let Some(w) = r["webexUrl"].as_str().filter(|w| !w.is_empty()) {
        let info = webex::get_stream_info(s, w, password).await?;
        if !util::truthy(r.get("durationSec")) {
            if let Some(d) = info["duration"].as_f64() {
                patch["durationSec"] = json!((d / 1000.0).round() as i64);
            }
        }
        webex::download_candidates(&info)
    } else if util::s(&r, "source") == "youtube" {
        youtube = Some(util::s(&r, "directUrl").to_string());
        vec![]
    } else if let Some(d) = r["directUrl"].as_str() {
        headers.push(("Cookie".into(), s.cookie_header_for(d).await.unwrap_or_default()));
        vec![d.to_string()]
    } else {
        bail!("nessuna sorgente video");
    };
    if urls.is_empty() && youtube.is_none() {
        bail!("nessun URL video nella risposta WebEx");
    }
    Ok(Source { urls, headers, youtube, patch })
}

async fn ytdlp(url: &str, dest: &Path, on: downloader::Progress, audio: bool) -> Result<()> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let bin = tools::which("yt-dlp").ok_or_else(|| anyhow!("yt-dlp non trovato"))?;
    let mut p = tools::command(bin).args(["-f", if audio { "bestaudio[ext=m4a]/bestaudio" } else { "mp4/best" }, "--newline", "-o"]).arg(dest).arg(url).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).spawn()?;
    let mut lines = BufReader::new(p.stdout.take().unwrap()).lines();
    let rx = regex::Regex::new(r"([\d.]+)%").unwrap();
    while let Ok(Some(l)) = lines.next_line().await {
        if let Some(m) = rx.captures(&l) {
            on(json!({ "percent": m[1].parse::<f64>().unwrap_or(0.0) }));
        }
    }
    let st = p.wait().await?;
    if !st.success() {
        bail!("yt-dlp exit {}", st.code().unwrap_or(-1));
    }
    Ok(())
}
