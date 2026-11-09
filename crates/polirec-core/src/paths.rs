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
/// Root of the app sources (python/ scripts, NOTICE.md, …): set by whoever starts the daemon.
pub fn app_root() -> Option<PathBuf> {
    std::env::var_os("POLIREC_APP_ROOT").map(PathBuf::from)
}
