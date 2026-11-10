//! External components the app relies on, in one place: what is there, what is missing, and how to get it —
//! automatically when possible (private Chromium, yt-dlp in the private Python env, AI CLIs via their official
//! installers), otherwise with the exact command / download page.
//!
//!   browser      Chrome / Edge / Brave / Chromium — WeBeep, RecMan and WebEx login. Missing → "Chrome for
//!                Testing" (Google's official build) downloaded into ~/.polidesk/chrome, nothing installed system-wide
//!   whisper      private Python env + Whisper engine + model (see setup.rs)
//!   ffmpeg       bundled with the app
//!   ai:<id>      Antigravity CLI / Claude Code / Copilot CLI (official install scripts, then login in a terminal)
//!   ytdlp        lessons published on YouTube (optional) → pip into the private env
//!   aria2        faster downloads (optional) → Homebrew / winget
use crate::{ai, net, paths, setup, tools, util};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const CFT: &str = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

/// Where the private Chromium lives.
pub fn chrome_dir() -> PathBuf {
    paths::app_dir().join("chrome")
}
fn cft_platform() -> Option<&'static str> {
    Some(match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "mac-arm64",
        ("macos", _) => "mac-x64",
        ("windows", "x86") => "win32",
        ("windows", _) => "win64",
        ("linux", "x86_64") => "linux64",
        ("linux", "aarch64") => "linux-arm64",
        _ => return None,
    })
}
/// Executable of the private Chromium, if downloaded.
pub fn private_chrome() -> Option<PathBuf> {
    let p = cft_platform()?;
    let base = chrome_dir().join(format!("chrome-{p}"));
    let exe = if p.starts_with("mac") {
        base.join("Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
    } else if p.starts_with("win") {
        base.join("chrome.exe")
    } else {
        base.join("chrome")
    };
    exe.is_file().then_some(exe)
}

fn which_label(p: &Path) -> String {
    let s = p.to_string_lossy();
    if s.starts_with(&*chrome_dir().to_string_lossy()) {
        return "Chromium privato di PoliDesk".into();
    }
    for (k, l) in [("Chrome for Testing", "Chrome for Testing"), ("Google Chrome", "Google Chrome"), ("chrome", "Google Chrome"), ("Edge", "Microsoft Edge"), ("msedge", "Microsoft Edge"), ("edge", "Microsoft Edge"), ("Brave", "Brave"), ("brave", "Brave"), ("hromium", "Chromium")] {
        if s.contains(k) {
            return l.into();
        }
    }
    p.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default()
}

fn os_cmd(unix_brew: &str, win: &str) -> Value {
    json!(if cfg!(windows) { win } else { unix_brew })
}

/// Every component with its state: ok | missing | optional (missing but not needed).
pub async fn status(settings: &Value) -> Value {
    let mut out = vec![];
    // browser
    let chrome = crate::browser::find_chrome().ok();
    out.push(json!({
        "id": "browser", "label": "Browser per il login", "need": "required", "group": "base",
        "what": "Serve per entrare in WeBeep, RecMan e WebEx con il tuo account PoliMi. Lavora in background, senza finestre.",
        "ok": chrome.is_some(), "detail": chrome.as_ref().map(|p| which_label(p)),
        "auto": cft_platform().is_some(), "autoLabel": "Scarica Chromium (~170 MB)",
        "url": "https://www.google.com/chrome/",
    }));
    // transcription
    let t = &settings["transcription"];
    let py = util::s(t, "python");
    let engine = if !py.is_empty() && Path::new(py).exists() { setup::check_whisper(py).await } else if setup::venv_python().exists() { setup::check_whisper(&setup::venv_python().to_string_lossy()).await } else { "none".into() };
    out.push(json!({
        "id": "whisper", "label": "Trascrizione (Whisper)", "need": "recommended", "group": "base",
        "what": "Trasforma le lezioni in testo sul tuo computer, senza inviare l'audio a nessuno. Installa un ambiente Python privato in ~/.polidesk.",
        "ok": engine != "none", "detail": if engine == "none" { Value::Null } else { json!(format!("{} · modello {}", match engine.as_str() { "mlx" => "mlx-whisper (Apple GPU)", "faster" => "faster-whisper", e => e }, util::s(t, "model"))) },
        "auto": true, "autoLabel": "Configura…", "setup": true,
    }));
    // ffmpeg
    let ff = tools::ffmpeg();
    out.push(json!({
        "id": "ffmpeg", "label": "ffmpeg", "need": "required", "group": "base",
        "what": "Converte video e audio (incluso nell'app).",
        "ok": ff.is_some(), "detail": ff.as_ref().map(|p| if paths::bundled_ffmpeg().as_deref() == Some(p.as_path()) { "incluso nell'app".to_string() } else { p.to_string_lossy().into_owned() }),
        "cmd": os_cmd("brew install ffmpeg", "winget install Gyan.FFmpeg"),
    }));
    // AI CLIs
    let av = ai::available();
    for id in ai::ORDER {
        let a = &av[id];
        let path = a["path"].as_str();
        out.push(json!({
            "id": format!("ai:{id}"), "label": a["label"], "need": "ai", "group": "ai",
            "what": match id { "agy" => "Google Antigravity CLI: quota gratuita con l'account Google, modelli Gemini e Claude.", "claude" => "Claude Code di Anthropic: serve un piano Claude (Pro o superiore).", _ => "GitHub Copilot CLI: anche con il piano Copilot Free." },
            "ok": path.is_some(), "detail": path,
            "auto": true, "autoLabel": "Installa", "cmd": a["install"]["cmd"], "login": a["install"]["login"], "loginCmd": id, "url": a["install"]["url"],
        }));
    }
    // optional
    let yt = tools::which("yt-dlp");
    out.push(json!({
        "id": "ytdlp", "label": "yt-dlp", "need": "optional", "group": "extra",
        "what": "Solo per i corsi che pubblicano le lezioni su YouTube.",
        "ok": yt.is_some(), "detail": yt.map(|p| p.to_string_lossy().into_owned()),
        "auto": setup::venv_python().exists(), "autoLabel": "Installa", "cmd": os_cmd("brew install yt-dlp", "winget install yt-dlp.yt-dlp"),
    }));
    let a2 = tools::which("aria2c");
    let brew = tools::which("brew");
    out.push(json!({
        "id": "aria2", "label": "aria2", "need": "optional", "group": "extra",
        "what": "Scarica i video più velocemente (16 connessioni). Senza, PoliDesk usa il suo downloader interno.",
        "ok": a2.is_some(), "detail": a2.map(|p| p.to_string_lossy().into_owned()),
        "auto": cfg!(windows) && tools::which("winget").is_some() || brew.is_some(), "autoLabel": "Installa", "cmd": os_cmd("brew install aria2", "winget install aria2.aria2"),
    }));
    json!(out)
}

/// Install a component; `on_log` gets progress lines.
pub async fn install(id: &str, on_log: &(dyn Fn(String) + Send + Sync)) -> Result<Value> {
    let r = match id {
        "browser" => install_chromium(on_log).await.map(|p| json!({ "path": p })),
        "ytdlp" => setup::add_package(&["yt-dlp"], on_log).await.map(|_| json!(true)),
        "aria2" => {
            if cfg!(windows) {
                setup::run(Path::new("winget"), &sv(&["install", "-e", "--id", "aria2.aria2", "--accept-source-agreements", "--accept-package-agreements"]), on_log).await.map(|_| json!(true))
            } else {
                let brew = tools::which("brew").ok_or_else(|| anyhow!("Homebrew non trovato: installa aria2 dal terminale"))?;
                setup::run(&brew, &sv(&["install", "aria2"]), on_log).await.map(|_| json!(true))
            }
        }
        a if a.starts_with("ai:") => {
            let cmd = util::s(&ai::install_hint(&a[3..]), "cmd").to_string();
            if cmd.is_empty() {
                bail!("Strumento sconosciuto: {a}");
            }
            if cfg!(windows) {
                if cmd.starts_with("winget ") {
                    let mut args: Vec<String> = cmd.split_whitespace().skip(1).map(String::from).collect();
                    args.extend(sv(&["--accept-source-agreements", "--accept-package-agreements"]));
                    setup::run(Path::new("winget"), &args, on_log).await
                } else {
                    setup::run(Path::new("powershell"), &sv(&["-NoProfile", "-ExecutionPolicy", "ByPass", "-Command", &cmd]), on_log).await
                }
            } else {
                setup::run(Path::new("/bin/bash"), &sv(&["-lc", &cmd]), on_log).await
            }
            .map(|_| json!(true))
        }
        _ => bail!("Componente non installabile automaticamente: {id}"),
    };
    tools::rescan();
    r
}

fn sv(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

/// Google's "Chrome for Testing" (stable channel) → ~/.polidesk/chrome. Private to PoliDesk, no admin rights.
async fn install_chromium(on_log: &(dyn Fn(String) + Send + Sync)) -> Result<PathBuf> {
    let plat = cft_platform().ok_or_else(|| anyhow!("Sistema non supportato: installa Google Chrome"))?;
    on_log("Cerco l'ultima versione stabile di Chromium…".into());
    let idx: Value = net::client().get(CFT).send().await?.error_for_status()?.json().await?;
    let st = &idx["channels"]["Stable"];
    let url = st["downloads"]["chrome"].as_array().into_iter().flatten().find(|d| util::s(d, "platform") == plat).map(|d| util::s(d, "url").to_string()).ok_or_else(|| anyhow!("Nessun Chromium per {plat}"))?;
    let dir = chrome_dir();
    let tmp = dir.with_extension("part");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp)?;
    let zip = tmp.join("chrome.zip");
    on_log(format!("Scarico Chromium {}…", util::s(st, "version")));
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let step = std::sync::atomic::AtomicI64::new(-1);
    let on: crate::downloader::Progress = std::sync::Arc::new(move |p: Value| {
        let pc = (util::f(&p, "percent") / 10.0).floor() as i64;
        if pc > step.swap(pc, std::sync::atomic::Ordering::Relaxed) {
            let _ = tx.send(format!("Chromium: {}%", pc * 10));
        }
    });
    let no_headers: crate::downloader::Headers = vec![];
    let dl = crate::downloader::http_download(&url, &zip, &no_headers, on, 4);
    tokio::pin!(dl);
    loop {
        tokio::select! {
            r = &mut dl => { r?; break; }
            Some(l) = rx.recv() => on_log(l),
        }
    }
    on_log("Estraggo…".into());
    // bsdtar (macOS, Windows 10+) and GNU tar (with unzip fallback on Linux) read .zip
    let ok = tokio::process::Command::new("tar").arg("-xf").arg(&zip).arg("-C").arg(&tmp).status().await.map(|s| s.success()).unwrap_or(false);
    if !ok {
        let st = tokio::process::Command::new("unzip").arg("-q").arg(&zip).arg("-d").arg(&tmp).status().await?;
        if !st.success() {
            bail!("Estrazione di Chromium non riuscita");
        }
    }
    let _ = std::fs::remove_file(&zip);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::rename(&tmp, &dir)?;
    #[cfg(target_os = "macos")]
    {
        let _ = tokio::process::Command::new("xattr").args(["-dr", "com.apple.quarantine"]).arg(&dir).status().await;
    }
    let exe = private_chrome().ok_or_else(|| anyhow!("Chromium estratto ma l'eseguibile non si trova"))?;
    on_log(format!("Chromium pronto: {}", exe.display()));
    Ok(exe)
}

/// Open a terminal running `cmd` (interactive logins of the AI CLIs).
pub fn open_terminal(cmd: &str) -> Result<()> {
    if !cmd.chars().all(|c| c.is_ascii_alphanumeric() || " -_./".contains(c)) {
        bail!("Comando non valido");
    }
    #[cfg(target_os = "macos")]
    {
        let script = format!("tell application \"Terminal\"\nactivate\ndo script \"{cmd}\"\nend tell");
        std::process::Command::new("osascript").args(["-e", &script]).spawn()?;
    }
    #[cfg(windows)]
    {
        std::process::Command::new("cmd").args(["/C", "start", "PoliDesk", "cmd", "/K", cmd]).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let term = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"].into_iter().find(|t| tools::which(t).is_some()).ok_or_else(|| anyhow!("Nessun terminale trovato: esegui «{cmd}» a mano"))?;
        let mut c = std::process::Command::new(term);
        if term == "gnome-terminal" {
            c.args(["--", "bash", "-lc", &format!("{cmd}; exec bash")]);
        } else {
            c.args(["-e", &format!("bash -lc '{cmd}; exec bash'")]);
        }
        c.spawn()?;
    }
    Ok(())
}
