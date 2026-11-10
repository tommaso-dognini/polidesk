//! First-run setup: detect hardware, create a private Python env (~/.polidesk/venv), install the best
//! Whisper engine for this machine and pre-download the model.
//!
//!   macOS Apple Silicon → mlx-whisper (Metal GPU)       model by RAM (turbo ≥ 16 GB)
//!   NVIDIA GPU          → faster-whisper (CUDA)         large-v3-turbo
//!   everything else     → faster-whisper (CPU, int8)    small / base by RAM+cores
use crate::{paths, tools, util};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

pub fn venv() -> PathBuf {
    paths::app_dir().join("venv")
}
pub fn venv_python() -> PathBuf {
    if cfg!(windows) { venv().join("Scripts").join("python.exe") } else { venv().join("bin").join("python") }
}
/// Python scripts shipped with the app (transcribe_cli.py, semantic.py).
pub fn script(name: &str) -> Result<PathBuf> {
    let p = paths::app_root().map(|r| r.join("python").join(name)).ok_or_else(|| anyhow!("POLIDESK_APP_ROOT non impostato: impossibile trovare python/{name}"))?;
    // inside a packaged app the scripts live in app.asar.unpacked (Python can't read asar archives)
    let s = p.to_string_lossy().replace(&format!("app.asar{}", std::path::MAIN_SEPARATOR), &format!("app.asar.unpacked{}", std::path::MAIN_SEPARATOR));
    Ok(PathBuf::from(s))
}

fn try_exec(cmd: &std::path::Path, args: &[&str]) -> Option<String> {
    let o = std::process::Command::new(cmd).args(args).env("PATH", tools::path_env()).stdin(Stdio::null()).stderr(Stdio::null()).output().ok()?;
    o.status.success().then(|| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

fn ram_gb() -> u64 {
    let bytes: u64 = if cfg!(target_os = "macos") {
        std::process::Command::new("sysctl").args(["-n", "hw.memsize"]).output().ok().and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok()).unwrap_or(0)
    } else if cfg!(windows) {
        std::process::Command::new("powershell").args(["-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"]).output().ok().and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok()).unwrap_or(0)
    } else {
        std::fs::read_to_string("/proc/meminfo").ok().and_then(|s| s.lines().find(|l| l.starts_with("MemTotal:")).and_then(|l| l.split_whitespace().nth(1)).and_then(|k| k.parse::<u64>().ok())).map(|k| k * 1024).unwrap_or(0)
    };
    (bytes as f64 / 1024f64.powi(3)).round() as u64
}
fn cpu_model() -> String {
    if cfg!(target_os = "macos") {
        try_exec(std::path::Path::new("sysctl"), &["-n", "machdep.cpu.brand_string"]).unwrap_or_default()
    } else if cfg!(windows) {
        std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_default()
    } else {
        std::fs::read_to_string("/proc/cpuinfo").ok().and_then(|s| s.lines().find(|l| l.starts_with("model name")).and_then(|l| l.split(':').nth(1)).map(|x| x.trim().to_string())).unwrap_or_default()
    }
}
fn os_name() -> String {
    if cfg!(windows) {
        format!("Windows_NT {}", try_exec(std::path::Path::new("cmd"), &["/C", "ver"]).unwrap_or_default())
    } else {
        try_exec(std::path::Path::new("uname"), &["-sr"]).unwrap_or_else(|| std::env::consts::OS.into())
    }
}
pub fn platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        o => o,
    }
}
pub fn arch() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        a => a,
    }
}

/// Detect hardware and tools.
pub fn detect() -> Value {
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let ram = ram_gb();
    let apple_silicon = cfg!(all(target_os = "macos", target_arch = "aarch64"));
    let nvidia = tools::which("nvidia-smi").and_then(|smi| try_exec(&smi, &["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])).and_then(|out| {
        let first = out.lines().next()?.to_string();
        let mut it = first.split(',').map(|s| s.trim().to_string());
        let name = it.next()?;
        let mem: f64 = it.next()?.parse().ok()?;
        Some(json!({ "name": name, "vramGB": (mem / 1024.0).round() as u64 }))
    });
    // python candidates (3.9–3.13 have wheels for all engines)
    let cands: &[&str] = if cfg!(windows) { &["py", "python", "python3"] } else { &["python3.12", "python3.11", "python3.13", "python3.10", "python3"] };
    let mut pythons = vec![];
    for c in cands {
        let Some(bin) = tools::which(c) else { continue };
        let v = if *c == "py" { try_exec(&bin, &["-3", "-c", "import sys;print(\"%d.%d\"%sys.version_info[:2])"]) } else { try_exec(&bin, &["-c", "import sys;print(\"%d.%d\"%sys.version_info[:2])"]) };
        if let Some(v) = v.filter(|v| v.split('.').count() == 2) {
            pythons.push(json!({ "bin": bin, "version": v, "launcher": *c == "py" }));
        }
    }
    json!({
        "platform": platform(), "arch": arch(), "os": os_name(), "cpu": cpu_model(), "cores": cores, "ramGB": ram,
        "appleSilicon": apple_silicon, "nvidia": nvidia, "uv": tools::which("uv"), "pythons": pythons,
        "venv": if venv_python().exists() { json!(venv()) } else { Value::Null },
        "aria2c": tools::which("aria2c"), "ffmpeg": tools::ffmpeg(), "chrome": crate::browser::find_chrome().ok(),
        "ai": { "agy": tools::which("agy"), "claude": tools::which("claude"), "copilot": tools::which("copilot") },
    })
}

/// Pick engine + model for this machine.
pub fn recommend(hw: &Value) -> Value {
    let ram = util::f(hw, "ramGB");
    if util::b(hw, "appleSilicon") {
        return json!({ "engine": "mlx", "model": if ram >= 16.0 { "large-v3-turbo" } else if ram >= 8.0 { "small" } else { "base" }, "device": "Apple GPU (Metal)", "packages": ["mlx-whisper", "fastembed", "pypdf"] });
    }
    if let Some(nv) = hw.get("nvidia").filter(|v| v.is_object()) {
        let big = util::f(nv, "vramGB") >= 6.0;
        let mut pk = vec!["faster-whisper", "fastembed", "pypdf"];
        if !cfg!(target_os = "macos") {
            pk.extend(["nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*"]);
        }
        return json!({ "engine": "faster", "model": if big { "large-v3-turbo" } else { "small" }, "device": format!("NVIDIA {} (CUDA)", util::s(nv, "name")), "packages": pk, "cuda": true });
    }
    let cores = util::f(hw, "cores");
    let strong = cores >= 8.0 && ram >= 16.0;
    json!({ "engine": "faster", "model": if strong { "small" } else if ram >= 8.0 { "base" } else { "tiny" }, "device": format!("CPU ({} core, int8)", cores as u64), "packages": ["faster-whisper", "fastembed", "pypdf"] })
}

/// Run a command, streaming its output lines.
pub async fn run(cmd: &std::path::Path, args: &[String], on_line: &(dyn Fn(String) + Send + Sync)) -> Result<String> {
    let mut c = tools::command(cmd);
    c.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut p = c.spawn().map_err(|e| anyhow!("{}: {e}", cmd.display()))?;
    let (so, se) = (p.stdout.take().unwrap(), p.stderr.take().unwrap());
    let tail = std::sync::Mutex::new(String::new());
    let pump = |r: Box<dyn tokio::io::AsyncRead + Unpin + Send>| {
        let tail = &tail;
        async move {
            let mut rd = BufReader::new(r);
            let mut buf = Vec::new();
            // pip/uv redraw progress with \r: split on both
            loop {
                buf.clear();
                let n = rd.read_until(b'\n', &mut buf).await.unwrap_or(0);
                if n == 0 {
                    break;
                }
                let s = String::from_utf8_lossy(&buf).to_string();
                {
                    let mut t = tail.lock().unwrap();
                    t.push_str(&s);
                    if t.len() > 6000 {
                        *t = util::tail(&t, 3000);
                    }
                }
                for l in s.split(['\r', '\n']).map(str::trim).filter(|l| !l.is_empty()) {
                    on_line(l.to_string());
                }
            }
        }
    };
    tokio::join!(pump(Box::new(so)), pump(Box::new(se)));
    let st = p.wait().await?;
    let t = tail.into_inner().unwrap();
    if !st.success() {
        bail!("{} {} → exit {}\n{}", cmd.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default(), args.first().cloned().unwrap_or_default(), st.code().unwrap_or(-1), util::tail(&t, 800));
    }
    Ok(t)
}
fn sv(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

/// Install everything; on_step({step, status, detail}). Returns the transcription settings to save.
pub async fn install(rec: &Value, on_step: &(dyn Fn(Value) + Send + Sync), on_log: &(dyn Fn(String) + Send + Sync)) -> Result<Value> {
    let hw = detect();
    let step = |s: &str, status: &str, detail: String| on_step(json!({ "step": s, "status": status, "detail": detail }));
    step("python", "running", "Creo l'ambiente Python privato…".into());
    let venv_s = venv().to_string_lossy().into_owned();
    if !venv_python().exists() {
        let mut uv = tools::which("uv");
        let good = hw["pythons"].as_array().into_iter().flatten().find(|p| matches!(util::s(p, "version"), "3.9" | "3.10" | "3.11" | "3.12" | "3.13")).cloned();
        if uv.is_none() && good.is_none() {
            // no usable Python: install uv (single binary, it downloads Python by itself)
            step("python", "running", "Installo uv (gestore Python)…".into());
            if cfg!(windows) {
                run(std::path::Path::new("powershell"), &sv(&["-ExecutionPolicy", "ByPass", "-c", "irm https://astral.sh/uv/install.ps1 | iex"]), on_log).await?;
            } else {
                run(std::path::Path::new("/bin/sh"), &sv(&["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"]), on_log).await?;
            }
            tools::rescan();
            let exe = if cfg!(windows) { "uv.exe" } else { "uv" };
            uv = tools::which("uv").or_else(|| [paths::home().join(".local").join("bin").join(exe), paths::home().join(".cargo").join("bin").join(exe)].into_iter().find(|p| p.exists()));
            if uv.is_none() {
                bail!("Installazione di uv non riuscita. Installa Python 3.12 da python.org e riprova.");
            }
        }
        if let Some(uv) = &uv {
            run(uv, &sv(&["venv", "--python", "3.12", "--seed", &venv_s]), on_log).await?;
        } else if let Some(g) = good {
            let bin = PathBuf::from(util::s(&g, "bin"));
            if util::b(&g, "launcher") {
                run(&bin, &sv(&[&format!("-{}", util::s(&g, "version")), "-m", "venv", &venv_s]), on_log).await?;
            } else {
                run(&bin, &sv(&["-m", "venv", &venv_s]), on_log).await?;
            }
        }
    }
    step("python", "done", venv_s.clone());

    let pkgs = util::str_list(rec.get("packages"));
    step("engine", "running", format!("Installo {}…", pkgs.join(", ")));
    add_packages_raw(&pkgs, true, on_log).await?;
    step("engine", "done", if util::s(rec, "engine") == "mlx" { "mlx-whisper".into() } else { "faster-whisper".into() });

    step("model", "running", format!("Scarico il modello {}…", util::s(rec, "model")));
    let py = venv_python();
    let mut a = vec![script("transcribe_cli.py")?.to_string_lossy().into_owned(), "--warmup".into(), "--engine".into(), util::s(rec, "engine").into(), "--model".into(), util::s(rec, "model").into()];
    if util::b(rec, "cuda") {
        a.extend(["--device".into(), "cuda".into()]);
    }
    run(&py, &a, on_log).await?;
    step("model", "done", util::s(rec, "model").into());
    Ok(json!({ "engine": rec["engine"], "model": rec["model"], "python": py, "device": if util::b(rec, "cuda") { "cuda" } else { "auto" } }))
}

async fn add_packages_raw(pkgs: &[String], upgrade: bool, on_log: &(dyn Fn(String) + Send + Sync)) -> Result<()> {
    let py = venv_python();
    if !py.exists() {
        bail!("Esegui prima il setup");
    }
    let up: Vec<String> = if upgrade { vec!["-U".into()] } else { vec![] };
    if let Some(uv) = tools::which("uv") {
        let mut a = sv(&["pip", "install", "--python"]);
        a.push(py.to_string_lossy().into_owned());
        a.extend(up);
        a.extend(pkgs.iter().cloned());
        run(&uv, &a, on_log).await?;
    } else {
        let mut a = sv(&["-m", "pip", "install"]);
        a.extend(up);
        a.extend(pkgs.iter().cloned());
        run(&py, &a, on_log).await?;
    }
    Ok(())
}
/// Add extra packages to the private env (e.g. parakeet-mlx, fastembed).
pub async fn add_package(pkgs: &[&str], on_log: &(dyn Fn(String) + Send + Sync)) -> Result<()> {
    add_packages_raw(&pkgs.iter().map(|s| s.to_string()).collect::<Vec<_>>(), false, on_log).await
}

/// Can `python` import these modules?
pub async fn python_has(python: &str, modules: &str) -> bool {
    tools::command(python).args(["-c", &format!("import {modules}")]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().await.map(|s| s.success()).unwrap_or(false)
}
/// Which Whisper engine is installed for `python`: mlx | faster | whisper | none.
pub async fn check_whisper(python: &str) -> String {
    let code = "import importlib.util as u;print(\"mlx\" if u.find_spec(\"mlx_whisper\") else \"faster\" if u.find_spec(\"faster_whisper\") else \"whisper\" if u.find_spec(\"whisper\") else \"none\")";
    match tools::command(python).args(["-c", code]).stdin(Stdio::null()).stderr(Stdio::null()).output().await {
        Ok(o) => Some(String::from_utf8_lossy(&o.stdout).trim().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "none".into()),
        Err(_) => "none".into(),
    }
}
