//! Where PoliRec keeps its own data (`~/.polirec`, or `POLIREC_HOME` for isolated tests).
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static APP_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let d = std::env::var_os("POLIREC_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".polirec"));
    let _ = std::fs::create_dir_all(&d);
    d
});

pub fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}
pub fn app_dir() -> &'static Path {
    &APP_DIR
}
pub fn config_file() -> PathBuf {
    app_dir().join("config.json")
}
pub fn profile_dir() -> PathBuf {
    app_dir().join("chrome-profile")
}
pub fn cookies_file() -> PathBuf {
    app_dir().join("cookies.json")
}
pub fn debug_dir() -> PathBuf {
    app_dir().join("debug")
}
pub fn bin_dir() -> PathBuf {
    app_dir().join("bin")
}
pub fn cache_dir() -> PathBuf {
    app_dir().join("cache")
}
/// Local socket of the daemon (a named pipe on Windows).
pub fn socket_path() -> PathBuf {
    #[cfg(windows)]
    {
        // one pipe per data dir, so isolated test instances never collide
        let h = crate::util::short_hash(&app_dir().to_string_lossy());
        PathBuf::from(format!(r"\\.\pipe\polirecd-{h}"))
    }
    #[cfg(not(windows))]
    {
        // Unix socket paths are limited to ~104 bytes: fall back to the temp dir for long data paths
        let p = app_dir().join("polirecd.sock");
        if p.as_os_str().len() < 100 {
            return p;
        }
        let name = format!("polirecd-{}.sock", crate::util::short_hash(&app_dir().to_string_lossy()));
        let t = std::env::temp_dir().join(&name);
        if t.as_os_str().len() < 100 { t } else { PathBuf::from("/tmp").join(name) }
    }
}
/// Facts written by the app at every start (app folder, bundled ffmpeg), so a daemon started from the
/// terminal finds them too.
pub fn runtime_file() -> PathBuf {
    app_dir().join("runtime.json")
}
fn runtime(key: &str) -> Option<PathBuf> {
    let v: serde_json::Value = serde_json::from_slice(&std::fs::read(runtime_file()).ok()?).ok()?;
    v.get(key)?.as_str().filter(|s| !s.is_empty()).map(PathBuf::from)
}

/// Root of the app files (python/ scripts, NOTICE.md…): env, then runtime.json, then next to the binary
/// (packaged app: resources/bin/polirecd → resources/app.asar.unpacked; dev: target/<profile>/ → repo).
pub fn app_root() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("POLIREC_APP_ROOT").map(PathBuf::from) {
        return Some(p);
    }
    if let Some(p) = runtime("appRoot").filter(|p| p.join("python").exists()) {
        return Some(p);
    }
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    [dir.join("..").join("app.asar.unpacked"), dir.join("..").join(".."), dir.join("..").join("..").join("..")].into_iter().find(|p| p.join("python").join("transcribe_cli.py").exists())
}
/// ffmpeg bundled with the app (ffmpeg-static), if any.
pub fn bundled_ffmpeg() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("POLIREC_FFMPEG").map(PathBuf::from) {
        return Some(p);
    }
    runtime("ffmpeg").or_else(|| {
        let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
        app_root().map(|r| r.join("node_modules").join("ffmpeg-static").join(name))
    })
}
