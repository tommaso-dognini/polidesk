//! External programs: lookup on PATH (+ Homebrew / ~/.local dirs that GUI apps don't inherit), ffmpeg, env.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

static CACHE: LazyLock<Mutex<HashMap<String, Option<PathBuf>>>> = LazyLock::new(Default::default);

fn extra_paths() -> Vec<PathBuf> {
    if cfg!(windows) {
        return vec![];
    }
    vec!["/opt/homebrew/bin".into(), "/usr/local/bin".into(), "/usr/bin".into(), "/bin".into(), crate::paths::home().join(".local/bin")]
}

/// Cross-platform `which`, cached.
pub fn which(bin: &str) -> Option<PathBuf> {
    if let Some(v) = CACHE.lock().unwrap().get(bin) {
        return v.clone();
    }
    let exts: &[&str] = if cfg!(windows) { &[".exe", ".cmd", ".bat", ""] } else { &[""] };
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    dirs.extend(extra_paths());
    // tools installed into PoliDesk's private Python env (yt-dlp…); never its python, which detect() must not mistake for a system one
    if !bin.starts_with("python") {
        let venv = crate::setup::venv();
        dirs.push(if cfg!(windows) { venv.join("Scripts") } else { venv.join("bin") });
    }
    let found = dirs.iter().flat_map(|d| exts.iter().map(move |e| d.join(format!("{bin}{e}")))).find(|p| p.is_file());
    CACHE.lock().unwrap().insert(bin.to_string(), found.clone());
    found
}
/// Forget cached lookups (after installing a tool).
pub fn rescan() {
    CACHE.lock().unwrap().clear();
}

/// ffmpeg: system one, else the one bundled with the app.
pub fn ffmpeg() -> Option<PathBuf> {
    which("ffmpeg").or_else(|| crate::paths::bundled_ffmpeg().filter(|p| p.is_file()))
}

/// PATH for child processes (Whisper needs ffmpeg; AI CLIs often live in Homebrew/~/.local).
pub fn path_env() -> std::ffi::OsString {
    let mut v: Vec<PathBuf> = extra_paths();
    if let Some(ff) = ffmpeg().and_then(|p| p.parent().map(PathBuf::from)) {
        v.insert(0, ff);
    }
    if let Some(p) = std::env::var_os("PATH") {
        v.extend(std::env::split_paths(&p));
    }
    std::env::join_paths(v).unwrap_or_default()
}
pub fn command(bin: impl AsRef<std::ffi::OsStr>) -> tokio::process::Command {
    let mut c = tokio::process::Command::new(bin);
    c.env("PATH", path_env()).kill_on_drop(true);
    #[cfg(windows)]
    {
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

pub fn check() -> serde_json::Value {
    serde_json::json!({ "aria2c": which("aria2c"), "ffmpeg": ffmpeg() })
}
