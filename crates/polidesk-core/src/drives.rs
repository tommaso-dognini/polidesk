//! External drives: course folders on a USB / external disk that may not be connected.
//! We never create course folders on a missing drive (on Linux that would silently write to the
//! internal disk under /media); the UI asks to connect it and the daemon resyncs when it appears.
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};

/// Mount point of the removable volume holding `dir`, if it is on one:
/// /Volumes/<name> (macOS), E:\ (Windows, not C:), /media/<user>/<name>, /run/media/<user>/<name>, /mnt/<name>.
pub fn mount_root(dir: &Path) -> Option<PathBuf> {
    let parts: Vec<String> = dir.components().map(|c| match c {
        Component::Prefix(p) => p.as_os_str().to_string_lossy().into_owned(),
        Component::RootDir => "/".into(),
        c => c.as_os_str().to_string_lossy().into_owned(),
    }).collect();
    let take = |n: usize| -> Option<PathBuf> { (parts.len() >= n).then(|| parts[..n].iter().collect()) };
    if cfg!(windows) {
        let drive = parts.first()?;
        if drive.len() >= 2 && !drive.to_uppercase().starts_with("C:") && drive.ends_with(':') {
            return Some(PathBuf::from(format!("{drive}\\")));
        }
        return None;
    }
    match parts.get(1).map(String::as_str) {
        Some("Volumes") if parts.len() > 2 && parts[2] != "Macintosh HD" => take(3),
        Some("media") => take(if parts.len() > 3 { 4 } else { 3 }),
        Some("run") if parts.get(2).map(String::as_str) == Some("media") => take(5),
        Some("mnt") => take(3),
        _ => None,
    }
}

/// Drive name and mount point when `dir` lives on a drive that is not connected.
pub fn missing(dir: &Path) -> Option<(String, PathBuf)> {
    if dir.as_os_str().is_empty() || dir.exists() {
        return None;
    }
    let root = mount_root(dir)?;
    if root.exists() {
        return None;
    }
    let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| root.to_string_lossy().into_owned());
    Some((name, root))
}

/// `{ name, path, missing }` for the course view (null when the course is on the internal disk).
pub fn info(dir: &Path) -> Value {
    match mount_root(dir) {
        None => Value::Null,
        Some(root) => {
            let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| root.to_string_lossy().into_owned());
            json!({ "name": name, "path": root, "missing": !root.exists() })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roots() {
        if cfg!(windows) {
            return;
        }
        assert_eq!(mount_root(Path::new("/Volumes/Extreme SSD/polimi/ANN")), Some(PathBuf::from("/Volumes/Extreme SSD")));
        assert_eq!(mount_root(Path::new("/media/tom/USB/corsi")), Some(PathBuf::from("/media/tom/USB")));
        assert_eq!(mount_root(Path::new("/run/media/tom/USB/x")), Some(PathBuf::from("/run/media/tom/USB")));
        assert_eq!(mount_root(Path::new("/Users/tom/Documents")), None);
        assert!(missing(Path::new("/Volumes/__polidesk_test_nope__/x")).is_some());
        assert!(missing(Path::new("/Users/nope/x")).is_none());
    }
}
