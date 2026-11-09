//! Shared daemon state and the pipelines: sync queue → downloads → transcription → AI (summaries, notes,
//! course page) → semantic index. Everything emits events to the connected clients.
use anyhow::{anyhow, bail, Result};
use polirec_core::browser::Session;
use polirec_core::library as lib;
use polirec_core::transcriber::Transcriber;
use polirec_core::{ai, cleaner, cloud, config, search, sync, timetable, util, workspace as ws, Emit};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, Notify};

pub const PAGE_VERSION: i64 = 2;

type JobFn = Box<dyn FnOnce(Arc<Daemon>) -> Pin<Box<dyn Future<Output = Result<()>> + Send>> + Send>;
struct AiJob {
    id: String,
    label: String,
    run: JobFn,
}

#[derive(Default)]
struct SyncState {
    queue: Vec<String>,
    current: Option<String>,
    running: bool,
    last_auto: Option<Instant>,
    /// per-course options of the next run (CLI / MCP): limit, materials, dry run
    opts: HashMap<String, Value>,
}

pub struct Daemon {
    pub events: broadcast::Sender<Value>,
    pub shutdown: Arc<Notify>,
    pub transcriber: Arc<Transcriber>,
    session: tokio::sync::Mutex<Option<Arc<Session>>>,
    sync: Mutex<SyncState>,
    pub stop_sync: Arc<AtomicBool>,
    aiq: Mutex<(VecDeque<AiJob>, Option<(String, String)>)>,
    index_timers: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
    search_ok: Mutex<Option<bool>>,
    auto_timer: Mutex<Option<tokio::task::JoinHandle<()>>>,
    pub hw: Mutex<Option<Value>>,
    pub dl_control: Arc<sync::Control>,
    pub activity: Mutex<crate::activity::Activity>,
    /// logins handed to the app's login window, waiting for its cookies
    logins: Mutex<HashMap<String, tokio::sync::oneshot::Sender<Result<Vec<Value>>>>>,
    /// connected app windows (logins go to the app when there is one)
    pub ui_clients: std::sync::atomic::AtomicUsize,
}

impl Daemon {
    pub fn new() -> Arc<Daemon> {
        let (events, _) = broadcast::channel(4096);
        let tx = events.clone();
        let emit: Emit = Arc::new(move |v: Value| {
            let refresh = matches!(v["type"].as_str(), Some("transcribe-done") | Some("transcribe-error"));
            let _ = tx.send(v);
            if refresh {
                let _ = tx.send(json!({ "type": "refresh" }));
            }
        });
        Arc::new(Daemon {
            events,
            shutdown: Arc::new(Notify::new()),
            transcriber: Transcriber::new(emit),
            session: Default::default(),
            sync: Default::default(),
            stop_sync: Arc::new(AtomicBool::new(false)),
            aiq: Mutex::new((VecDeque::new(), None)),
            index_timers: Default::default(),
            search_ok: Default::default(),
            auto_timer: Default::default(),
            hw: Default::default(),
            dl_control: Default::default(),
            activity: Default::default(),
            logins: Default::default(),
            ui_clients: Default::default(),
        })
    }
    pub fn send(&self, v: Value) {
        let _ = self.events.send(v);
    }
    pub fn log(&self, msg: impl Into<String>, course: Option<&str>) {
        self.send(json!({ "type": "log", "msg": msg.into(), "course": course }));
    }
    pub fn refresh(&self) {
        self.send(json!({ "type": "refresh" }));
    }
    /// Desktop notification, shown by the UI.
    pub fn notify(&self, body: impl Into<String>) {
        self.send(json!({ "type": "notify", "body": body.into() }));
    }

    pub fn start_background(self: &Arc<Self>) {
        crate::activity::restore_pauses(self);
        crate::activity::restore_log(self);
        crate::activity::start_tracker(self.clone());
        // settings/courses changed on another computer (cloud folder)
        let d = self.clone();
        tokio::spawn(async move {
            d.cloud_pull(false);
            let mut t = tokio::time::interval(Duration::from_secs(120));
            t.tick().await;
            loop {
                t.tick().await;
                d.cloud_pull(true);
            }
        });
        self.schedule_auto_sync();
        // AI output and index for lessons transcribed earlier
        let d = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(8)).await;
            let c = config::load();
            if util::b(&c["settings"], "setupDone") {
                d.ai_backfill(None);
                // a restarted daemon has an empty queue: pick up what is downloaded but not transcribed yet
                if util::b(&c["settings"]["transcription"], "auto") {
                    for x in config::courses(&c) {
                        let dir = lib::dir_of(x);
                        if !dir.exists() {
                            continue;
                        }
                        for r in lib::with_file_status(&dir, &lib::load_manifest(&dir)) {
                            if util::b(&r, "videoExists") && !util::truthy(r.get("transcript")) && lib::followed(x.get("teachers"), &r) {
                                d.queue_transcription(x, &r);
                            }
                        }
                    }
                }
                for x in config::courses(&c) {
                    d.schedule_index(Some(util::s(x, "id")), 15000);
                }
                d.schedule_index(None, 15000);
            }
        });
    }

    pub fn cloud_pull(&self, notify_user: bool) {
        let mut c = config::load();
        let r = cloud::import_config(&mut c);
        if util::b(&r, "changed") && config::save_opts(&mut c, true).is_ok() {
            self.refresh();
            if notify_user {
                let added = util::f(&r, "added") as u64;
                self.log(format!("☁ Impostazioni aggiornate da {}{}", util::s(&r, "from"), if added > 0 { format!(" (+{added} corsi)") } else { String::new() }), None);
            }
        }
    }

    // ───────── browser session ─────────
    pub async fn session(self: &Arc<Self>) -> Arc<Session> {
        let mut g = self.session.lock().await;
        if let Some(s) = g.as_ref() {
            return s.clone();
        }
        let settings = config::load()["settings"].clone();
        let email = util::s(&settings, "polimiEmail").to_string();
        // hidden browser unless the student asked to see it (Impostazioni → Sincronizzazione)
        let headless = !util::b(&settings["browser"], "show") && std::env::var_os("POLIREC_SHOW_BROWSER").is_none();
        let d1 = self.clone();
        let d2 = self.clone();
        let em = email.clone();
        let login: polirec_core::browser::LoginFn = Arc::new(move |target: String, login_url: String| {
            let d = d2.clone();
            let em = em.clone();
            Box::pin(async move { d.login(target, login_url, em).await })
        });
        let s = Session::new(email, Arc::new(move |m| d1.log(m, None)), headless, login);
        *g = Some(s.clone());
        s
    }
    /// Ask the student to log in: in the app's login window when the app is open, otherwise in a
    /// small Chrome window. Returns the cookies to copy into the hidden browser.
    async fn login(self: &Arc<Self>, target: String, login_url: String, email: String) -> Result<Vec<Value>> {
        if let Some(u) = login_url.strip_prefix("visible:") {
            // visible browser mode: the student logs in right there
            self.send(json!({ "type": "login-required", "url": u }));
            self.notify("Login richiesto: completa l'accesso nella finestra di Chrome.");
            return Ok(vec![]);
        }
        if self.ui_clients.load(Ordering::Relaxed) > 0 {
            let id = uuid::Uuid::new_v4().to_string();
            let (tx, rx) = tokio::sync::oneshot::channel();
            self.logins.lock().unwrap().insert(id.clone(), tx);
            self.send(json!({ "type": "login-required", "id": id, "url": target, "loginUrl": login_url, "email": email }));
            self.notify("Accedi al Politecnico nella finestra di PoliRec per continuare.");
            let r = tokio::time::timeout(Duration::from_secs(15 * 60), rx).await;
            self.logins.lock().unwrap().remove(&id);
            return match r {
                Ok(Ok(r)) => r,
                Ok(Err(_)) => bail!("Login annullato"),
                Err(_) => bail!("Login non completato entro 15 minuti"),
            };
        }
        let d = self.clone();
        polirec_core::browser::visible_login(&target, &email, Arc::new(move |m| d.log(m, None))).await
    }
    /// The app's login window finished (cookies) or was closed (None).
    pub fn login_result(&self, id: &str, cookies: Option<Vec<Value>>) -> bool {
        match self.logins.lock().unwrap().remove(id) {
            Some(tx) => tx.send(cookies.ok_or_else(|| anyhow!("Login annullato"))).is_ok(),
            None => false,
        }
    }

    pub async fn close_session(&self) {
        let s = self.session.lock().await.take();
        if let Some(s) = s {
            s.close().await;
        }
    }
    pub fn is_syncing(&self) -> bool {
        self.sync.lock().unwrap().running
    }
    /// Close the browser after a one-off use, unless a sync is using it.
    pub async fn release_session(&self) {
        if !self.is_syncing() {
            self.close_session().await;
        }
    }

    // ───────── transcription ─────────
    pub fn transcription_opts(&self, course: &Value) -> Value {
        let t = config::load()["settings"]["transcription"].clone();
        let lang = util::s(course, "language");
        if lang.is_empty() { t } else { util::merge(&t, &json!({ "language": lang })) }
    }
    pub fn queue_transcription(self: &Arc<Self>, course: &Value, rec: &Value) {
        let dir = lib::dir_of(course);
        let dd = lib::course_dirs(&dir);
        let file = util::s(rec, "file").to_string();
        let video = dd.video.join(&file);
        if !video.exists() {
            return;
        }
        let Some(rx) = self.transcriber.enqueue(&video, &dd.transcripts, self.transcription_opts(course)) else { return };
        let (d, course) = (self.clone(), course.clone());
        tokio::spawn(async move {
            let cid = util::s(&course, "id").to_string();
            match rx.await {
                Ok(Ok(_)) => {
                    // remove fillers and Whisper hallucinations; originals kept in trascrizioni/.orig
                    if config::load()["settings"]["transcription"]["clean"].as_bool() != Some(false) {
                        if let Err(e) = cleaner::clean_transcript_files(&dd.transcripts, lib::stem(&file)) {
                            d.log(format!("⚠ Pulizia trascrizione: {e}"), Some(&cid));
                        }
                    }
                    let _ = lib::write_index(&dir, &lib::load_manifest(&dir));
                    d.refresh();
                    d.ai_backfill(Some(vec![cid.clone()]));
                    d.schedule_index(Some(&cid), 20000);
                }
                Ok(Err(e)) => {
                    if e.to_string() != "annullato" {
                        d.log(format!("✗ Trascrizione {file}: {e}"), Some(&cid));
                    }
                }
                Err(_) => {}
            }
        });
    }

    // ───────── AI queue (sequential, visible in the UI) ─────────
    fn ai_queue_state(&self) {
        let q = self.aiq.lock().unwrap();
        self.send(json!({ "type": "ai-queue", "pending": q.0.len(), "current": q.1.as_ref().map(|c| c.1.clone()), "items": q.0.iter().take(20).map(|j| j.label.clone()).collect::<Vec<_>>() }));
    }
    pub fn ai_queue_info(&self) -> Value {
        let q = self.aiq.lock().unwrap();
        json!({ "pending": q.0.len(), "current": q.1.as_ref().map(|c| c.1.clone()) })
    }
    pub fn enqueue_ai<F, Fut>(self: &Arc<Self>, id: String, label: String, f: F)
    where
        F: FnOnce(Arc<Daemon>) -> Fut + Send + 'static,
        Fut: Future<Output = Result<()>> + Send + 'static,
    {
        let start = {
            let mut q = self.aiq.lock().unwrap();
            if q.0.iter().any(|j| j.id == id) || q.1.as_ref().map(|c| c.0 == id).unwrap_or(false) {
                return;
            }
            q.0.push_back(AiJob { id, label, run: Box::new(move |d| Box::pin(f(d))) });
            q.1.is_none()
        };
        self.ai_queue_state();
        if start {
            let d = self.clone();
            tokio::spawn(async move { d.run_ai_queue().await });
        }
    }
    async fn run_ai_queue(self: Arc<Self>) {
        loop {
            let job = {
                let mut q = self.aiq.lock().unwrap();
                match q.0.pop_front() {
                    Some(j) => {
                        q.1 = Some((j.id.clone(), j.label.clone()));
                        j
                    }
                    None => {
                        q.1 = None;
                        break;
                    }
                }
            };
            self.ai_queue_state();
            let label = job.label.clone();
            if let Err(e) = (job.run)(self.clone()).await {
                self.log(format!("✗ AI · {label}: {e}"), None);
                self.send(json!({ "type": "ai-failed", "label": label, "error": e.to_string() }));
            }
        }
        self.ai_queue_state();
        self.refresh();
    }

    /// Queue whatever AI output is enabled but missing (also for lessons transcribed earlier).
    pub fn ai_backfill(self: &Arc<Self>, course_ids: Option<Vec<String>>) -> usize {
        let c0 = config::load();
        let s = c0["settings"]["ai"].clone();
        if ai::pick(&c0["settings"]).is_err() {
            return 0;
        }
        let mut n = 0;
        for c in config::courses(&c0).iter().filter(|c| course_ids.as_ref().map(|ids| ids.iter().any(|i| i == util::s(c, "id"))).unwrap_or(true)) {
            let dir = lib::dir_of(c);
            if !dir.exists() {
                continue;
            }
            let recs: Vec<Value> = lib::with_file_status(&dir, &lib::load_manifest(&dir)).into_iter().filter(|r| util::truthy(r.get("transcript"))).collect();
            let cid = util::s(c, "id").to_string();
            for r in &recs {
                let has = |t: &str| util::str_list(r.get("notes")).iter().any(|f| f.ends_with(&format!(" - {t}.md")));
                let key = util::s(r, "key").to_string();
                let title = util::s(r, "displayTitle").to_string();
                for (flag, tpl, lab) in [("autoSummary", "sommario", "Sommario"), ("autoNotes", "appunti", "Appunti")] {
                    if util::b(&s, flag) && !has(tpl) {
                        let (cid2, key2) = (cid.clone(), key.clone());
                        self.enqueue_ai(format!("{cid}:{key}:{tpl}"), format!("{lab} · {title}"), move |d| async move { d.generate_notes(&cid2, &key2, tpl, None).await.map(|_| ()) });
                        n += 1;
                    }
                }
            }
            if s["autoCoursePage"].as_bool() != Some(false) && !recs.is_empty() {
                let w = ws::load(Some(&cloud::course_data_dir(&c0["settings"], c)));
                let page = util::s(&w, "page");
                let auto = page.trim().is_empty() || page.starts_with("<!-- polirec:auto");
                let summaries = recs.iter().filter(|r| util::str_list(r.get("notes")).iter().any(|f| f.ends_with(" - sommario.md"))).count();
                let pa = &w["pageAuto"];
                if auto && summaries > 0 && (!pa.is_object() || util::f(pa, "summaries") as usize != summaries || pa["v"].as_i64() != Some(PAGE_VERSION)) {
                    let cid2 = cid.clone();
                    self.enqueue_ai(format!("{cid}:page"), format!("Descrizione corso · {}", config::course_name(c)), move |d| async move { d.generate_course_page(&cid2, false).await });
                    n += 1;
                }
            }
        }
        n
    }

    /// Generate one AI note for a lesson (streamed to the UI). Returns the file name.
    pub async fn generate_notes(self: &Arc<Self>, course_id: &str, key: &str, template: &str, provider: Option<String>) -> Result<String> {
        let c = config::course(course_id)?;
        let dir = lib::dir_of(&c);
        let m = lib::load_manifest(&dir);
        let rec = m["recordings"].get(key).cloned().ok_or_else(|| anyhow!("registrazione non trovata"))?;
        let st = lib::file_status(&dir, &rec);
        let transcript = st["transcript"].as_str().ok_or_else(|| anyhow!("trascrizione mancante: trascrivi prima la lezione"))?.to_string();
        let dd = lib::course_dirs(&dir);
        let settings = config::load()["settings"].clone();
        let prov = match provider.filter(|p| !p.is_empty()) {
            Some(p) => p,
            None => ai::pick(&settings)?,
        };
        let job = uuid::Uuid::new_v4().to_string();
        self.send(json!({ "type": "ai-start", "jobId": job, "course": course_id, "key": key, "template": template, "provider": prov }));
        let title = format!("{} ({})", util::s(&rec, "topic"), util::take(util::s(&rec, "isoDate"), 10));
        let d2 = self.clone();
        let j2 = job.clone();
        let on = move |ch: String| d2.send(json!({ "type": "ai-chunk", "jobId": j2, "chunk": ch }));
        match ai::generate_note(&prov, util::s(&settings["ai"], "model"), template, &dd.transcripts.join(&transcript), &dd.notes, &title, &on).await {
            Ok(name) => {
                self.send(json!({ "type": "ai-done", "jobId": job, "course": course_id, "key": key, "file": name }));
                let _ = lib::write_index(&dir, &lib::load_manifest(&dir));
                self.refresh();
                Ok(name)
            }
            Err(e) => {
                self.send(json!({ "type": "ai-error", "jobId": job, "error": e.to_string() }));
                Err(e)
            }
        }
    }

    /// Course page: SHORT card generated from summaries, teachers, exam passages (semantic search) and timetable.
    pub async fn generate_course_page(self: &Arc<Self>, course_id: &str, force: bool) -> Result<()> {
        let c0 = config::load();
        let c = config::find_course(&c0, course_id).ok_or_else(|| anyhow!("Corso non trovato"))?;
        let data_dir = cloud::course_data_dir(&c0["settings"], &c);
        let w = ws::load(Some(&data_dir));
        let page = util::s(&w, "page");
        if !force && !page.trim().is_empty() && !page.starts_with("<!-- polirec:auto") {
            return Ok(()); // never overwrite the student's own page
        }
        let dir = lib::dir_of(&c);
        let m = lib::load_manifest(&dir);
        let recs = lib::with_file_status(&dir, &m);
        let dd = lib::course_dirs(&dir);
        let fullname = [util::s(&m["course"], "fullname"), util::s(&c, "name"), util::s(&c, "input")].into_iter().find(|s| !s.is_empty()).unwrap_or("").to_string();
        let mut teachers: Vec<String> = vec![];
        for r in &recs {
            let t = util::s(r, "teacher");
            if !t.is_empty() && !teachers.iter().any(|x| x == t) {
                teachers.push(t.into());
            }
        }
        // weekly slots and teachers from the timetable
        let now = chrono::Utc::now();
        let evs: Vec<Value> = timetable::occurrences(now, now + chrono::Duration::days(7)).into_iter().filter(|e| timetable::match_course(util::s(e, "summary"), &timetable::course_fullname(&c, &m))).collect();
        let tre = regex::Regex::new(r"Docente:\s*\n?(.+)").unwrap();
        let mut slots = vec![];
        for e in &evs {
            let (Some(s), Some(en)) = (util::parse_date(util::s(e, "start")), util::parse_date(util::s(e, "end"))) else { continue };
            let (s, en) = (s.with_timezone(&chrono::Local), en.with_timezone(&chrono::Local));
            let room = util::s(e, "location").split('(').next().unwrap_or("").trim().to_string();
            slots.push(format!("{} {}–{}, aula {room}", util::it_weekday(s), s.format("%H:%M"), en.format("%H:%M")));
            if let Some(t) = tre.captures(util::s(e, "description")) {
                let t = t[1].trim().to_string();
                if !teachers.contains(&t) {
                    teachers.push(t);
                }
            }
        }
        let summaries: Vec<String> = recs
            .iter()
            .filter_map(|r| {
                let f = util::str_list(r.get("notes")).into_iter().find(|n| n.ends_with(" - sommario.md"))?;
                let txt = std::fs::read_to_string(dd.notes.join(f)).ok()?;
                let first = txt.split('\n').find(|l| !l.trim().is_empty() && !l.starts_with(['-', '*', '#'])).unwrap_or("").to_string();
                Some(format!("- {}: {first}", util::s(r, "displayTitle")))
            })
            .collect();
        // exam info: the most relevant passages from lessons/slides (semantic search, if installed)
        let mut exam = String::new();
        if self.search_ready().await {
            if let Ok(q) = search::query(&c0, "modalità d'esame, regole dell'esame, scritto, orale, progetto, homework, voto finale, appelli", Some(course_id), 8).await {
                exam = q["results"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|r| util::f(r, "score") > 0.35)
                    .map(|r| {
                        let mm = &r["meta"];
                        let t = if util::s(mm, "type") == "lesson" { util::s(mm, "title") } else { [util::s(mm, "title"), util::s(mm, "file")].into_iter().find(|x| !x.is_empty()).unwrap_or("") };
                        format!("- ({t}) {}", util::take(util::s(r, "text"), 600))
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
            }
        }
        let prompt = format!(
            "Scrivi la scheda del corso universitario \"{fullname}\" in italiano, Markdown, BREVE (massimo ~150 parole). Usa SOLO le informazioni fornite, niente inventato. Formato esatto:\n**In breve** — 2-3 frasi su di cosa tratta il corso.\n\n**Docenti** — nomi (e ruolo se emerge: lezioni, esercitazioni, laboratori).\n\n**Esame** — modalità d'esame in 1-3 punti (scritto/orale/progetto/homework, pesi, regole). Se non emerge dalle fonti scrivi «Non ancora indicata nelle lezioni».\n\n**Orario** — una riga per lezione settimanale, solo se fornito.\nNient'altro: niente titoli #, niente programma dettagliato, niente premesse."
        );
        let input = format!("<corso>{fullname}</corso>\n<docenti>{}</docenti>\n<sommari>\n{}\n</sommari>\n<esame>\n{exam}\n</esame>\n<orario>\n{}\n</orario>", teachers.join(", "), summaries.join("\n"), slots.join("\n"));
        let prov = ai::pick(&c0["settings"])?;
        let md = ai::run_prompt(&prov, &prompt, &input, util::s(&c0["settings"]["ai"], "model"), &std::env::temp_dir(), &|_| {}).await?;
        let n_sum = summaries.len();
        ws::update(Some(&data_dir), |x| {
            x["page"] = json!(format!("<!-- polirec:auto {} — generata dall'AI, modificala liberamente: non verrà più sovrascritta -->\n{}\n", util::take(&util::now_iso(), 10), md.trim()));
            x["pageAuto"] = json!({ "at": util::now_iso(), "summaries": n_sum, "v": PAGE_VERSION });
        })?;
        self.refresh();
        self.schedule_index(Some(course_id), 20000);
        Ok(())
    }

    // ───────── semantic index (debounced, incremental) ─────────
    pub async fn search_ready(&self) -> bool {
        if let Some(v) = *self.search_ok.lock().unwrap() {
            return v;
        }
        let ok = search::ready(&config::load()["settings"]).await;
        *self.search_ok.lock().unwrap() = Some(ok);
        ok
    }
    pub fn reset_search_ready(&self) {
        *self.search_ok.lock().unwrap() = None;
    }
    pub fn schedule_index(self: &Arc<Self>, course_id: Option<&str>, delay_ms: u64) {
        let k = course_id.unwrap_or("g").to_string();
        let cid = course_id.map(String::from);
        let d = self.clone();
        let h = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            if !d.search_ready().await {
                return;
            }
            let c0 = config::load();
            let d2 = d.clone();
            let log = move |m: String| d2.log(m, None);
            let r = match &cid {
                Some(id) => match config::find_course(&c0, id).filter(|c| polirec_core::drives::missing(&lib::dir_of(c)).is_none()) {
                    Some(c) => search::index_course(&c0["settings"], &c, &log).await.map(|_| ()),
                    None => Ok(()),
                },
                None => search::index_general(&c0["settings"]).await.map(|_| ()),
            };
            match r {
                Ok(()) => d.send(json!({ "type": "search-indexed", "course": cid })),
                Err(e) => d.log(format!("✗ Indice di ricerca: {e}"), None),
            }
        });
        if let Some(old) = self.index_timers.lock().unwrap().insert(k, h) {
            old.abort();
        }
    }
    /// Notes or course page changed: refresh the semantic index later.
    pub fn notes_changed(self: &Arc<Self>, scope: Option<&str>) {
        self.schedule_index(scope, 30000);
    }

    // ───────── sync queue (priority = order of courses in the dashboard) ─────────
    /// Queue one course with options and wait for it to finish (CLI / MCP).
    pub async fn sync_and_wait(self: &Arc<Self>, id: &str, opts: Value) -> Result<Value> {
        let mut ev = self.events.subscribe();
        self.sync.lock().unwrap().opts.insert(id.to_string(), opts);
        self.enqueue_sync(Some(vec![id.to_string()]));
        loop {
            match ev.recv().await {
                Ok(e) if util::s(&e, "type") == "sync-course" && util::s(&e, "course") == id => match util::s(&e, "state") {
                    "done" => return Ok(e["result"].clone()),
                    "error" => bail!("{}", util::s(&e, "error")),
                    _ => {}
                },
                Ok(e) if util::s(&e, "type") == "sync-state" && e["syncing"] == json!(false) => bail!("Sincronizzazione interrotta"),
                Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) => {}
                Err(_) => bail!("Sincronizzazione interrotta"),
            }
        }
    }

    pub fn enqueue_sync(self: &Arc<Self>, ids: Option<Vec<String>>) {
        let all: Vec<Value> = config::courses(&config::load()).to_vec();
        let wanted: Vec<String> = match ids.filter(|v| !v.is_empty()) {
            Some(v) => v,
            None => all.iter().filter(|c| c["autoSync"].as_bool() != Some(false)).map(|c| util::s(c, "id").to_string()).collect(),
        };
        let start = {
            let mut s = self.sync.lock().unwrap();
            for c in &all {
                let id = util::s(c, "id").to_string();
                if wanted.contains(&id) && !s.queue.contains(&id) && s.current.as_ref() != Some(&id) {
                    s.queue.push(id);
                }
            }
            self.send(json!({ "type": "sync-queue", "queue": s.queue, "current": s.current }));
            if s.running {
                false
            } else {
                s.running = true;
                true
            }
        };
        if start {
            let d = self.clone();
            tokio::spawn(async move { d.run_sync_queue().await });
        }
    }
    /// Queue a course again even if it is syncing right now (it runs once more afterwards).
    pub fn enqueue_sync_again(self: &Arc<Self>, id: &str) {
        let start = {
            let mut s = self.sync.lock().unwrap();
            if !s.queue.iter().any(|x| x == id) {
                s.queue.push(id.to_string());
            }
            self.send(json!({ "type": "sync-queue", "queue": s.queue, "current": s.current }));
            !std::mem::replace(&mut s.running, true)
        };
        if start {
            let d = self.clone();
            tokio::spawn(async move { d.run_sync_queue().await });
        }
    }

    pub fn stop_sync(&self) {
        self.stop_sync.store(true, Ordering::Relaxed);
        self.sync.lock().unwrap().queue.clear();
    }
    pub fn sync_state(&self) -> (bool, Vec<String>, Option<String>) {
        let s = self.sync.lock().unwrap();
        (s.running, s.queue.clone(), s.current.clone())
    }

    async fn run_sync_queue(self: Arc<Self>) {
        self.stop_sync.store(false, Ordering::Relaxed);
        self.send(json!({ "type": "sync-state", "syncing": true }));
        let mut total = 0u64;
        loop {
            let id = {
                let mut s = self.sync.lock().unwrap();
                if s.queue.is_empty() || self.stop_sync.load(Ordering::Relaxed) {
                    break;
                }
                let id = s.queue.remove(0);
                s.current = Some(id.clone());
                self.send(json!({ "type": "sync-queue", "queue": s.queue, "current": s.current }));
                id
            };
            let Some(c) = config::find_course(&config::load(), &id) else { continue };
            // course folder on an external drive that is not connected: ask for it, sync when it's back
            if let Some(w) = crate::activity::wait_for_drive(&self, &id) {
                self.send(util::merge(&json!({ "type": "drive-missing", "course": id }), &w));
                self.send(json!({ "type": "sync-course", "course": id, "state": "waiting-drive" }));
                continue;
            }
            self.send(json!({ "type": "sync-course", "course": id, "state": "running" }));
            match self.sync_one(&c).await {
                Ok(r) => {
                    let _ = config::patch_course(&id, &json!({ "webeepId": r["webeepId"], "name": r["name"], "lastSync": util::now_iso(), "lastError": null }));
                    total += util::f(&r, "downloaded") as u64;
                    self.send(json!({ "type": "sync-course", "course": id, "state": "done", "result": r }));
                    self.ai_backfill(Some(vec![id.clone()]));
                    self.schedule_index(Some(&id), 3000);
                }
                Err(e) => {
                    let _ = config::patch_course(&id, &json!({ "lastError": e.to_string() }));
                    self.log(format!("✗ {}: {e}", config::course_name(&c)), Some(&id));
                    self.send(json!({ "type": "sync-course", "course": id, "state": "error", "error": e.to_string() }));
                }
            }
            // transcribe what is downloaded but not transcribed yet
            let s = config::load()["settings"].clone();
            if util::b(&s["transcription"], "auto") && util::b(&s, "setupDone") {
                let dir = lib::dir_of(&c);
                for r in lib::with_file_status(&dir, &lib::load_manifest(&dir)) {
                    if util::b(&r, "videoExists") && !util::truthy(r.get("transcript")) {
                        self.queue_transcription(&c, &r);
                    }
                }
            }
        }
        {
            let mut s = self.sync.lock().unwrap();
            s.current = None;
            s.queue.clear();
            s.running = false;
        }
        self.close_session().await;
        self.send(json!({ "type": "sync-state", "syncing": false }));
        self.send(json!({ "type": "sync-queue", "queue": [], "current": null }));
        self.refresh();
        if total > 0 {
            self.notify(format!("Sincronizzazione completata: {total} nuove lezioni"));
        }
    }

    async fn sync_one(self: &Arc<Self>, c: &Value) -> Result<Value> {
        let id = util::s(c, "id").to_string();
        let s = config::load()["settings"].clone();
        let o = self.sync.lock().unwrap().opts.remove(&id).unwrap_or(Value::Null);
        let opts = sync::Opts {
            parallel: (if util::f(&o, "parallel") > 0.0 { util::f(&o, "parallel") } else { util::f(&s, "parallelDownloads") } as usize).max(1),
            stop: self.stop_sync.clone(),
            control: self.dl_control.clone(),
            limit: o["limit"].as_u64().filter(|l| *l > 0).map(|l| l as usize),
            materials: o["materials"].as_bool(),
            only_materials: util::b(&o, "onlyMaterials"),
            dry_run: util::b(&o, "dryRun"),
        };
        let d = self.clone();
        let (cid, course) = (id.clone(), c.clone());
        let emit: Emit = Arc::new(move |evt: Value| {
            let mut e = evt;
            e["course"] = json!(cid);
            if util::s(&e, "type") == "downloaded" {
                let st = config::load()["settings"].clone();
                if util::b(&st["transcription"], "auto") && util::b(&st, "setupDone") {
                    let m = lib::load_manifest(&lib::dir_of(&course));
                    if let Some(r) = m["recordings"].get(util::s(&e, "key")) {
                        d.queue_transcription(&course, r);
                    }
                }
            }
            let _ = d.events.send(e);
        });
        let session = self.session().await;
        match sync::sync_course(&session, c, &opts, emit.clone()).await {
            Ok(r) => Ok(r),
            Err(e) => {
                // browser/page died mid-sync (closed window, crash): restart the session once
                let m = e.to_string();
                let dead = ["detached", "Target closed", "Session closed", "Protocol error", "channel closed", "WebSocket", "receiver is gone"].iter().any(|x| m.contains(x));
                if !dead || self.stop_sync.load(Ordering::Relaxed) {
                    return Err(e);
                }
                self.log("↻ Sessione del browser interrotta, riprovo…", Some(&id));
                self.close_session().await;
                let session = self.session().await;
                sync::sync_course(&session, c, &opts, emit).await
            }
        }
    }

    pub fn schedule_auto_sync(self: &Arc<Self>) {
        let h = util::f(&config::load()["settings"]["autoSync"], "intervalHours");
        let mut t = self.auto_timer.lock().unwrap();
        if let Some(old) = t.take() {
            old.abort();
        }
        if h > 0.0 {
            let d = self.clone();
            *t = Some(tokio::spawn(async move {
                let mut iv = tokio::time::interval(Duration::from_secs_f64(h * 3600.0));
                iv.tick().await;
                loop {
                    iv.tick().await;
                    d.enqueue_sync(None);
                }
            }));
        }
    }

    /// The UI opened: sync on start (at most every 30 minutes, the daemon outlives the window).
    pub fn app_ready(self: &Arc<Self>) {
        let st = config::load();
        let s = &st["settings"];
        if !(util::b(s, "setupDone") && util::b(&s["autoSync"], "onStart") && !config::courses(&st).is_empty()) {
            return;
        }
        {
            let mut g = self.sync.lock().unwrap();
            if g.last_auto.map(|t| t.elapsed() < Duration::from_secs(1800)).unwrap_or(false) {
                return;
            }
            g.last_auto = Some(Instant::now());
        }
        let d = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            d.enqueue_sync(None);
        });
    }

    /// Ask a question about one lesson (transcript as context), streamed.
    pub async fn ask_lesson(self: &Arc<Self>, course_id: &str, key: &str, question: &str, history: &Value) -> Result<String> {
        let c = config::course(course_id)?;
        let dir = lib::dir_of(&c);
        let rec = lib::with_file_status(&dir, &lib::load_manifest(&dir)).into_iter().find(|r| util::s(r, "key") == key).ok_or_else(|| anyhow!("Serve la trascrizione della lezione"))?;
        let Some(tr) = rec["transcript"].as_str() else { bail!("Serve la trascrizione della lezione") };
        let text = std::fs::read_to_string(lib::course_dirs(&dir).transcripts.join(tr))?;
        let settings = config::load()["settings"].clone();
        let prov = ai::pick(&settings)?;
        let h: Vec<String> = history.as_array().map(|a| a[a.len().saturating_sub(6)..].to_vec()).unwrap_or_default().iter().map(|h| format!("{}: {}", if util::s(h, "role") == "user" { "Studente" } else { "Tutor" }, util::s(h, "text"))).collect();
        let title = [util::s(&rec, "displayTitle"), util::s(&rec, "topic")].into_iter().find(|x| !x.is_empty()).unwrap_or("");
        let prompt = format!(
            "Sei un tutor universitario. Rispondi alla domanda dello studente sulla lezione \"{title}\" usando la trascrizione (automatica, può contenere errori di riconoscimento). Rispondi in Markdown, nella lingua della domanda, in modo chiaro e conciso; formule in LaTeX ($...$). Se la lezione non tratta l'argomento dillo, poi rispondi comunque brevemente con le tue conoscenze indicandolo. Quando utile cita il punto della lezione.\n\n{}Domanda: {question}",
            if h.is_empty() { String::new() } else { format!("Conversazione precedente:\n{}\n\n", h.join("\n")) }
        );
        let job = uuid::Uuid::new_v4().to_string();
        self.send(json!({ "type": "ai-start", "jobId": job, "course": course_id, "key": key, "template": "domanda", "provider": prov }));
        let (d2, j2) = (self.clone(), job.clone());
        let on = move |ch: String| d2.send(json!({ "type": "ai-chunk", "jobId": j2, "chunk": ch }));
        match ai::run_prompt(&prov, &prompt, &text, util::s(&settings["ai"], "model"), &std::env::temp_dir(), &on).await {
            Ok(out) => {
                self.send(json!({ "type": "ai-done", "jobId": job, "course": course_id, "key": key }));
                Ok(out)
            }
            Err(e) => {
                self.send(json!({ "type": "ai-error", "jobId": job, "error": e.to_string() }));
                Err(e)
            }
        }
    }

    /// Run a prompt with streaming events (ai-start/chunk/done/error) tagged with `extra`.
    pub async fn stream_prompt(self: &Arc<Self>, provider: &str, prompt: &str, input: &str, extra: Value, cwd: &Path) -> Result<String> {
        let job = uuid::Uuid::new_v4().to_string();
        self.send(util::merge(&json!({ "type": "ai-start", "jobId": job, "provider": provider }), &extra));
        let (d2, j2) = (self.clone(), job.clone());
        let on = move |ch: String| d2.send(json!({ "type": "ai-chunk", "jobId": j2, "chunk": ch }));
        let model = util::s(&config::load()["settings"]["ai"], "model").to_string();
        match ai::run_prompt(provider, prompt, input, &model, cwd, &on).await {
            Ok(o) => {
                self.send(util::merge(&json!({ "type": "ai-done", "jobId": job }), &extra));
                Ok(o)
            }
            Err(e) => {
                self.send(json!({ "type": "ai-error", "jobId": job, "error": e.to_string() }));
                Err(e)
            }
        }
    }
}
