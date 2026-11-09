//! Desktop integration that works without Electron (also from the CLI): open, reveal, trash.
use anyhow::{bail, Result};
use std::path::Path;
use std::process::Command;

/// Open a file/folder/URL with the default app.
pub fn open_path(p: impl AsRef<std::ffi::OsStr>) -> Result<()> {
    let p = p.as_ref();
    let st = if cfg!(target_os = "macos") {
        Command::new("open").arg(p).status()
    } else if cfg!(windows) {
        Command::new("cmd").args(["/C", "start", ""]).arg(p).status()
    } else {
        Command::new("xdg-open").arg(p).status()
    }?;
    if !st.success() {
        bail!("Impossibile aprire {}", p.to_string_lossy());
    }
    Ok(())
}
/// Show a file in Finder / Explorer.
pub fn reveal(p: &Path) -> Result<()> {
    if cfg!(target_os = "macos") {
        Command::new("open").arg("-R").arg(p).status()?;
    } else if cfg!(windows) {
        Command::new("explorer").arg(format!("/select,{}", p.display())).status()?;
    } else {
        open_path(p.parent().unwrap_or(p))?;
    }
    Ok(())
}
/// Move to the system Trash (recoverable).
pub fn trash(p: &Path) -> Result<()> {
    trash::delete(p)?;
    Ok(())
}
