//! Transcription queue: runs python/transcribe_cli.py (mlx-whisper, faster-whisper, Parakeet) one job at a
//! time — Whisper is CPU/GPU heavy, parallel runs only slow everything down.
use crate::{setup, tools, util, Emit};
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::{oneshot, Notify};

struct Job {
    video: PathBuf,
    out_dir: PathBuf,
    opts: Value,
    done: oneshot::Sender<Result<Value>>,
}
#[derive(Default)]
struct State {
    queue: VecDeque<Job>,
    current: Option<PathBuf>,
    percent: f64,
    /// paused videos stay in the queue and are skipped; "all" holds the whole queue
    paused: std::collections::HashSet<PathBuf>,
    all_paused: bool,
    /// the running job was paused: put it back in the queue instead of failing it
    requeue: bool,
}

pub struct Transcriber {
    st: Mutex<State>,
    wake: Notify,
    cancel: Notify,
    emit: Emit,
}

impl Transcriber {
    pub fn new(emit: Emit) -> Arc<Transcriber> {
        let t = Arc::new(Transcriber { st: Default::default(), wake: Notify::new(), cancel: Notify::new(), emit });
        let w = t.clone();
        tokio::spawn(async move { w.worker().await });
        t
    }

    /// Videos waiting or in progress.
    pub fn pending(&self) -> Vec<String> {
        let s = self.st.lock().unwrap();
        s.queue.iter().map(|j| j.video.to_string_lossy().into_owned()).chain(s.current.iter().map(|c| c.to_string_lossy().into_owned())).collect()
    }

    /// Every job with its state: running | queued | paused.
    pub fn list(&self) -> Vec<Value> {
        let s = self.st.lock().unwrap();
        let mut out = vec![];
        if let Some(c) = &s.current {
            out.push(json!({ "video": c, "status": "running", "percent": s.percent }));
        }
        for j in &s.queue {
            let paused = s.all_paused || s.paused.contains(&j.video);
            out.push(json!({ "video": j.video, "status": if paused { "paused" } else { "queued" }, "percent": 0 }));
        }
        out
    }
    pub fn all_paused(&self) -> bool {
        self.st.lock().unwrap().all_paused
    }
    pub fn paused_videos(&self) -> Vec<PathBuf> {
        self.st.lock().unwrap().paused.iter().cloned().collect()
    }
    pub fn restore(&self, all: bool, videos: Vec<PathBuf>) {
        let mut s = self.st.lock().unwrap();
        s.all_paused = all;
        s.paused = videos.into_iter().collect();
    }
    /// Pause one video: a queued one is skipped, the running one is stopped and goes back in the queue
    /// (Whisper can't resume halfway: it starts again from the beginning).
    pub fn pause(&self, video: &Path) {
        let running = {
            let mut s = self.st.lock().unwrap();
            s.paused.insert(video.to_path_buf());
            let r = s.current.as_deref() == Some(video);
            if r {
                s.requeue = true;
            }
            r
        };
        if running {
            self.cancel.notify_waiters();
        }
        (self.emit)(json!({ "type": "transcribe-paused", "video": video }));
    }
    pub fn resume(&self, video: &Path) {
        self.st.lock().unwrap().paused.remove(video);
        (self.emit)(json!({ "type": "transcribe-resumed", "video": video }));
        self.wake.notify_one();
    }
    pub fn pause_all(&self) {
        let running = {
            let mut s = self.st.lock().unwrap();
            s.all_paused = true;
            let r = s.current.is_some();
            if r {
                s.requeue = true;
            }
            r
        };
        if running {
            self.cancel.notify_waiters();
        }
        (self.emit)(json!({ "type": "transcribe-paused", "all": true }));
    }
    pub fn resume_all(&self) {
        {
            let mut s = self.st.lock().unwrap();
            s.all_paused = false;
            s.paused.clear();
        }
        (self.emit)(json!({ "type": "transcribe-resumed", "all": true }));
        self.wake.notify_one();
    }

    /// Queue a video; None when it is already queued. The receiver gets the script's "done" event.
    pub fn enqueue(&self, video: &Path, out_dir: &Path, opts: Value) -> Option<oneshot::Receiver<Result<Value>>> {
        let vs = video.to_string_lossy().into_owned();
        if self.pending().contains(&vs) {
            return None;
        }
        let (tx, rx) = oneshot::channel();
        self.st.lock().unwrap().queue.push_back(Job { video: video.into(), out_dir: out_dir.into(), opts, done: tx });
        (self.emit)(json!({ "type": "transcribe-queued", "video": vs }));
        self.wake.notify_one();
        Some(rx)
    }

    pub fn cancel_all(&self) {
        let jobs: Vec<Job> = self.st.lock().unwrap().queue.drain(..).collect();
        for j in jobs {
            let _ = j.done.send(Err(anyhow!("annullato")));
        }
        self.cancel.notify_waiters();
    }

    async fn worker(self: Arc<Self>) {
        loop {
            let job = loop {
                {
                    let mut s = self.st.lock().unwrap();
                    if !s.all_paused {
                        if let Some(i) = s.queue.iter().position(|j| !s.paused.contains(&j.video)) {
                            break s.queue.remove(i).unwrap();
                        }
                    }
                }
                self.wake.notified().await;
            };
            {
                let mut s = self.st.lock().unwrap();
                s.current = Some(job.video.clone());
                s.percent = 0.0;
                s.requeue = false;
            }
            let r = self.run(&job).await;
            let requeue = std::mem::take(&mut self.st.lock().unwrap().requeue);
            if requeue && r.is_err() {
                // paused while running: back to the front of the queue, keeps its receiver
                let mut s = self.st.lock().unwrap();
                s.current = None;
                s.queue.push_front(job);
                continue;
            }
            let vs = job.video.to_string_lossy().into_owned();
            match &r {
                Ok(res) => (self.emit)(json!({ "type": "transcribe-done", "video": vs, "files": res["files"] })),
                Err(e) => (self.emit)(json!({ "type": "transcribe-error", "video": vs, "error": e.to_string() })),
            }
            let _ = job.done.send(r);
            self.st.lock().unwrap().current = None;
        }
    }

    async fn run(&self, job: &Job) -> Result<Value> {
        let o = &job.opts;
        let or = |k: &str, d: &str| -> String { Some(util::s(o, k)).filter(|s| !s.is_empty()).unwrap_or(d).to_string() };
        let mut formats: Vec<String> = or("format", "txt").split(',').map(String::from).collect();
        if !formats.iter().any(|f| f == "srt") {
            formats.push("srt".into());
        }
        let vs = job.video.to_string_lossy().into_owned();
        let mut c = tools::command(or("python", "python3"));
        c.arg(setup::script("transcribe_cli.py")?)
            .args(["--engine", &or("engine", "auto"), "--device", &or("device", "auto"), "--model", &or("model", "small"), "--language", &or("language", "auto"), "--formats", &formats.join(",")])
            .arg("--out-dir")
            .arg(&job.out_dir)
            .arg(&job.video)
            .env("PYTHONUNBUFFERED", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut p = c.spawn()?;
        let (so, mut se) = (p.stdout.take().unwrap(), p.stderr.take().unwrap());
        let emit = self.emit.clone();
        let out = async move {
            let (mut result, mut err) = (None, String::new());
            let mut lines = BufReader::new(so).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                let Ok(ev) = serde_json::from_str::<Value>(&l) else { continue };
                match util::s(&ev, "event") {
                    "progress" => {
                        self.st.lock().unwrap().percent = ev["percent"].as_f64().unwrap_or(0.0);
                        emit(json!({ "type": "transcribe-progress", "video": vs, "percent": ev["percent"] }))
                    }
                    "start" => emit(json!({ "type": "transcribe-start", "video": vs })),
                    "loaded" => emit(json!({ "type": "log", "msg": format!("🎙  Whisper ({}, {}) pronto", util::s(&ev, "engine"), util::s(&ev, "model")) })),
                    "done" => result = Some(ev),
                    "error" | "fatal" => err = util::s(&ev, "error").to_string(),
                    _ => {}
                }
            }
            (result, err)
        };
        let errs = async move {
            let mut s = String::new();
            let _ = se.read_to_string(&mut s).await;
            s
        };
        let work = async { tokio::join!(out, errs) };
        let ((result, err1), err2) = tokio::select! {
            r = work => r,
            _ = self.cancel.notified() => {
                let _ = p.kill().await;
                return Err(anyhow!("annullato"));
            }
        };
        let st = p.wait().await?;
        match result {
            Some(r) => Ok(r),
            None => {
                let e = format!("{err1}{err2}");
                let last: Vec<&str> = e.trim().lines().collect();
                Err(anyhow!("Trascrizione fallita (exit {}): {}", st.code().unwrap_or(-1), last[last.len().saturating_sub(3)..].join(" ")))
            }
        }
    }
}

/// One-shot transcription of a short audio clip (dictation). Returns the text.
pub async fn transcribe_clip(settings: &Value, audio: &[u8], language: &str) -> Result<String> {
    let t = &settings["transcription"];
    let tmp = std::env::temp_dir().join(format!("polirec-dict-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp)?;
    let f = tmp.join("dettato.webm");
    std::fs::write(&f, audio)?;
    let or = |k: &str, d: &str| -> String { Some(util::s(t, k)).filter(|s| !s.is_empty()).unwrap_or(d).to_string() };
    let lang = if language.is_empty() { or("language", "auto") } else { language.to_string() };
    let out = tools::command(or("python", "python3"))
        .arg(setup::script("transcribe_cli.py")?)
        .args(["--engine", &or("engine", "auto"), "--model", &or("model", "small"), "--language", &lang, "--formats", "txt", "--out-dir"])
        .arg(&tmp)
        .arg(&f)
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::null())
        .output()
        .await?;
    let txt = tmp.join("dettato.txt");
    let r = if out.status.success() && txt.exists() { Ok(std::fs::read_to_string(&txt)?) } else { Err(anyhow!("Dettatura fallita: {}", util::tail(&String::from_utf8_lossy(&out.stderr), 300))) };
    let _ = std::fs::remove_dir_all(&tmp);
    r
}
