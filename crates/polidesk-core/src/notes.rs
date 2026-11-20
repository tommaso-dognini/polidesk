//! "Appunti": the student's own notes in Markdown, LaTeX (Tectonic) or Typst.
//! Files live in <course>/appunti/ or, for general notes, in the notes root.
//! Engines are downloaded on demand into ~/.polidesk/bin:
//!   Typst    — Apache-2.0 — https://github.com/typst/typst
//!   Tectonic — MIT        — https://github.com/tectonic-typesetting/tectonic
use crate::{net, paths, util};
use anyhow::{anyhow, bail, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;

pub fn ext_of(kind: &str) -> &'static str {
    match kind {
        "latex" => ".tex",
        "typst" => ".typ",
        _ => ".md",
    }
}
pub fn kind_by_ext(name: &str) -> Option<&'static str> {
    match Path::new(name).extension().and_then(|e| e.to_str()) {
        Some("md") => Some("markdown"),
        Some("tex") => Some("latex"),
        Some("typ") => Some("typst"),
        _ => None,
    }
}
/// Files the student uploads among the notes (handwritten scans, PDFs, slides…): not edited in the app.
/// Returns the type shown in the UI, or None for files that are never listed (LaTeX byproducts…).
pub fn file_type(name: &str) -> Option<&'static str> {
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    Some(match ext.as_str() {
        "pdf" => "pdf",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "heic" | "heif" | "svg" | "bmp" | "tif" | "tiff" => "image",
        "doc" | "docx" | "odt" | "rtf" | "pages" => "doc",
        "ppt" | "pptx" | "odp" | "key" => "slides",
        "xls" | "xlsx" | "ods" | "numbers" | "csv" => "sheet",
        "txt" | "text" | "rst" | "org" => "text",
        "ipynb" | "py" | "m" | "c" | "cpp" | "h" | "java" | "js" | "ts" | "rs" | "r" | "jl" | "sql" | "json" | "xml" | "html" | "css" => "code",
        "goodnotes" | "note" | "notability" | "xopp" | "one" => "handwritten",
        "zip" | "rar" | "7z" | "tar" | "gz" => "archive",
        "mp3" | "m4a" | "wav" | "aac" | "ogg" | "flac" => "audio",
        "mp4" | "mov" | "mkv" | "webm" | "avi" => "video",
        "aux" | "log" | "out" | "toc" | "synctex" | "fls" | "fdb_latexmk" | "bbl" | "blg" | "ds_store" | "tmp" | "part" | "crdownload" => return None,
        "" => return None,
        _ => "other",
    })
}
/// Types whose text can be read directly (search, AI).
pub fn is_text_type(t: &str) -> bool {
    matches!(t, "text" | "code")
}

fn template(kind: &str, t: &str) -> String {
    match kind {
        "latex" => format!("\\documentclass[11pt,a4paper]{{article}}\n\\usepackage[utf8]{{inputenc}}\n\\usepackage[italian,english]{{babel}}\n\\usepackage{{amsmath,amssymb,amsthm}}\n\\usepackage{{graphicx}}\n\\usepackage[margin=2.2cm]{{geometry}}\n\\usepackage{{hyperref}}\n\n\\title{{{t}}}\n\\author{{}}\n\\date{{\\today}}\n\n\\begin{{document}}\n\\maketitle\n\n\\section{{Introduzione}}\n\nScrivi qui. Formula: $E = mc^2$\n\n\\end{{document}}\n"),
        "typst" => format!("#set page(paper: \"a4\", margin: 2.2cm)\n#set text(font: \"New Computer Modern\", size: 11pt, lang: \"it\")\n#set heading(numbering: \"1.1\")\n\n#align(center, text(18pt, weight: \"bold\")[{t}])\n\n= Introduzione\n\nScrivi qui. Formula: $E = m c^2$\n"),
        _ => format!("# {t}\n\n"),
    }
}

pub fn dir_for(course_data_dir: &Path) -> PathBuf {
    course_data_dir.join("appunti")
}

/// Files listed per linked folder at most (a folder can be large: never walk a whole disk).
const LINKED_MAX: usize = 4000;
pub fn list(dir: &Path) -> Vec<Value> {
    fn walk(d: &Path, rel: &str, out: &mut Vec<Value>, max: usize) {
        let Ok(rd) = std::fs::read_dir(d) else { return };
        for e in rd.filter_map(|e| e.ok()) {
            if out.len() >= max {
                return;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            let r = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let p = e.path();
            if p.is_dir() {
                // images pasted into notes live in assets/: they belong to their note, not to the list
                if name != "assets" {
                    walk(&p, &r, out, max);
                }
            } else if let Some(kind) = kind_by_ext(&name) {
                let Ok(st) = std::fs::metadata(&p) else { continue };
                let pdf = p.with_extension("pdf");
                let pdf_rel = Path::new(&r).with_extension("pdf").to_string_lossy().replace('\\', "/");
                out.push(json!({ "file": r, "kind": kind, "mtime": util::mtime_ms(&st), "size": st.len(), "pdf": if pdf.exists() { json!(pdf_rel) } else { Value::Null } }));
            } else if let Some(t) = file_type(&name) {
                // the PDF compiled from a .tex / .typ note is shown with its note
                if t == "pdf" && ["tex", "typ"].iter().any(|x| p.with_extension(x).exists()) {
                    continue;
                }
                let Ok(st) = std::fs::metadata(&p) else { continue };
                out.push(json!({ "file": r, "kind": "file", "type": t, "mtime": util::mtime_ms(&st), "size": st.len() }));
            }
        }
    }
    let mut out = vec![];
    walk(dir, "", &mut out, usize::MAX);
    // folders linked from elsewhere on disk (not copied): listed as "@name/…", always up to date
    for (name, base) in linked_folders(dir) {
        let mut sub = vec![];
        walk(&base, &format!("@{name}"), &mut sub, LINKED_MAX);
        for v in sub.iter_mut() {
            v["linked"] = json!(true);
        }
        out.extend(sub);
    }
    out.sort_by(|a, b| util::f(b, "mtime").partial_cmp(&util::f(a, "mtime")).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// Resolve `rel` inside `dir`, refusing anything that escapes it.
pub fn safe(dir: &Path, rel: &str) -> Result<PathBuf> {
    let mut p = dir.to_path_buf();
    let mut depth = 0i32;
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(x) => {
                p.push(x);
                depth += 1;
            }
            Component::CurDir => {}
            Component::ParentDir if depth > 0 => {
                p.pop();
                depth -= 1;
            }
            _ => bail!("percorso non valido"),
        }
    }
    if depth == 0 {
        bail!("percorso non valido");
    }
    Ok(p)
}
/// Folders never walked inside a linked folder (build output, VCS, dependencies).
const SKIP_DIRS: &[&str] = &["node_modules", "__pycache__", "target", "venv", ".venv"];

// ---------- linked folders (sidecar .polidesk-folders.json): [{ "name": "Analisi", "path": "/abs/path" }] ----------
// Uploading a folder saves only its path: its files show up among the notes and stay in sync with the disk.
const FOLDERS: &str = ".polidesk-folders.json";
fn load_folders(dir: &Path) -> Vec<Value> {
    util::read_json(&dir.join(FOLDERS)).and_then(|v| v.as_array().cloned()).unwrap_or_default()
}
/// (name, absolute path) of each linked folder of this notes folder.
pub fn linked_folders(dir: &Path) -> Vec<(String, PathBuf)> {
    load_folders(dir).iter().map(|f| (util::s(f, "name").to_string(), PathBuf::from(util::s(f, "path")))).filter(|(n, p)| !n.is_empty() && !p.as_os_str().is_empty()).collect()
}
/// Link a folder (no copy). Returns its name in the list ("@name"); linking the same folder again returns the existing one.
pub fn link_folder(dir: &Path, src: &Path) -> Result<String> {
    let src = std::fs::canonicalize(src).map_err(|e| anyhow!("{}: {e}", src.display()))?;
    if !src.is_dir() {
        bail!("{} non è una cartella", src.display());
    }
    if src.starts_with(dir) || dir.starts_with(&src) {
        bail!("Questa cartella contiene (o è dentro) la cartella degli appunti: non serve collegarla");
    }
    let mut all = load_folders(dir);
    if let Some(f) = all.iter().find(|f| Path::new(util::s(f, "path")) == src) {
        return Ok(format!("@{}", util::s(f, "name")));
    }
    let base = clean_name(&src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Cartella".into())).replace('@', "");
    let base = if base.is_empty() { "Cartella".to_string() } else { base };
    let taken = |n: &str| all.iter().any(|f| util::s(f, "name").eq_ignore_ascii_case(n));
    let mut name = base.clone();
    let mut i = 2;
    while taken(&name) {
        name = format!("{base} {i}");
        i += 1;
    }
    all.push(json!({ "name": name, "path": src }));
    std::fs::create_dir_all(dir)?;
    util::write_atomic(&dir.join(FOLDERS), serde_json::to_string_pretty(&all)?)?;
    Ok(format!("@{name}"))
}
/// Forget a linked folder ("@name" or "name"); its files on disk are not touched.
pub fn unlink_folder(dir: &Path, name: &str) -> Result<bool> {
    let name = name.trim_start_matches('@');
    let mut all = load_folders(dir);
    let n = all.len();
    all.retain(|f| util::s(f, "name") != name);
    if all.len() == n {
        bail!("cartella collegata non trovata");
    }
    util::write_atomic(&dir.join(FOLDERS), serde_json::to_string_pretty(&all)?)?;
    // lesson links of its files go too
    let mut links = get_all_links(dir);
    links.retain(|k, _| !k.starts_with(&format!("@{name}/")));
    save_all_links(dir, links)?;
    Ok(true)
}
/// For a path in the list: (root it is relative to, "@name/" prefix or "", path inside that root).
fn split_linked<'a>(dir: &Path, rel: &'a str) -> Option<(PathBuf, String, &'a str)> {
    let first = rel.split('/').next()?;
    let name = first.strip_prefix('@')?;
    let (_, base) = linked_folders(dir).into_iter().find(|(n, _)| n == name)?;
    Some((base, format!("{first}/"), rel[first.len()..].trim_start_matches('/')))
}
/// Absolute path of an entry of the list: inside the notes folder, or inside a linked folder ("@name/…").
pub fn resolve(dir: &Path, rel: &str) -> Result<PathBuf> {
    match split_linked(dir, rel) {
        Some((base, _, "")) => Ok(base),
        Some((base, _, rest)) => safe(&base, rest),
        None => safe(dir, rel),
    }
}
/// Is this entry in a linked folder?
pub fn is_linked(dir: &Path, rel: &str) -> bool {
    split_linked(dir, rel).is_some()
}
fn clean_name(s: &str) -> String {
    s.chars().map(|c| if r#"\/:*?"<>|"#.contains(c) { '-' } else { c }).collect::<String>().trim().to_string()
}

pub fn create(dir: &Path, title: &str, kind: &str) -> Result<String> {
    create_in(dir, None, title, kind)
}
/// New note in `folder` (a folder of the list, also in a linked folder) or at the top of the notes folder.
pub fn create_in(dir: &Path, folder: Option<&str>, title: &str, kind: &str) -> Result<String> {
    let folder = folder.map(|f| f.trim_matches('/')).filter(|f| !f.is_empty());
    let target = match folder {
        Some(f) => resolve(dir, f)?,
        None => dir.to_path_buf(),
    };
    std::fs::create_dir_all(&target)?;
    let title = if title.trim().is_empty() { "Senza titolo" } else { title };
    let base = clean_name(title);
    let ext = ext_of(kind);
    let mut name = format!("{base}{ext}");
    let mut i = 2;
    while target.join(&name).exists() {
        name = format!("{base} {i}{ext}");
        i += 1;
    }
    std::fs::write(target.join(&name), template(kind, title))?;
    Ok(match folder {
        Some(f) => format!("{f}/{name}"),
        None => name,
    })
}
pub fn read(dir: &Path, rel: &str) -> Result<String> {
    Ok(std::fs::read_to_string(resolve(dir, rel)?)?)
}
pub fn write(dir: &Path, rel: &str, content: &str) -> Result<bool> {
    util::write_atomic(&resolve(dir, rel)?, content)?;
    Ok(true)
}
pub fn rename(dir: &Path, rel: &str, new_name: &str) -> Result<String> {
    let from = resolve(dir, rel)?;
    if split_linked(dir, rel).is_some_and(|(_, _, rest)| rest.is_empty()) {
        bail!("Per rinominare una cartella collegata, rinominala nel Finder e collegala di nuovo");
    }
    let ext = Path::new(rel).extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = rel.rsplit_once('/').map(|(p, _)| p.to_string()).unwrap_or_default();
    let nrel = if parent.is_empty() { format!("{}{ext}", clean_name(new_name)) } else { format!("{parent}/{}{ext}", clean_name(new_name)) };
    let to = resolve(dir, &nrel)?;
    if to.exists() {
        bail!("esiste già un appunto con questo nome");
    }
    std::fs::rename(&from, &to)?;
    move_links(dir, rel, Some(&nrel))?;
    Ok(nrel)
}
/// Moves the note into .cestino/ (recoverable).
/// Files of a linked folder go to the system Trash (they are the student's originals); a linked folder
/// itself is only unlinked.
pub fn remove(dir: &Path, rel: &str) -> Result<bool> {
    if let Some((base, _, rest)) = split_linked(dir, rel) {
        if rest.is_empty() {
            return unlink_folder(dir, rel);
        }
        crate::sys::trash(&safe(&base, rest)?)?;
        move_links(dir, rel, None)?;
        return Ok(true);
    }
    let p = safe(dir, rel)?;
    let trash = dir.join(".cestino");
    std::fs::create_dir_all(&trash)?;
    let base = p.file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default();
    std::fs::rename(&p, trash.join(format!("{}-{base}", util::now_ms())))?;
    move_links(dir, rel, None)?;
    Ok(true)
}
/// Copy a file of the student (PDF, photos of handwritten notes, slides…) into the notes folder.
/// Keeps its name; "name 2.pdf"… when taken. Returns the path relative to `dir`.
pub fn import(dir: &Path, src: &Path, sub: Option<&str>) -> Result<String> {
    let meta = std::fs::metadata(src).map_err(|e| anyhow!("{}: {e}", src.display()))?;
    if !meta.is_file() {
        bail!("{} non è un file", src.display());
    }
    let name = src.file_name().map(|n| n.to_string_lossy().into_owned()).ok_or_else(|| anyhow!("nome del file non valido"))?;
    let base = match sub.map(clean_name).filter(|s| !s.is_empty()) {
        Some(s) => dir.join(s),
        None => dir.to_path_buf(),
    };
    std::fs::create_dir_all(&base)?;
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (clean_name(s), format!(".{e}")),
        _ => (clean_name(&name), String::new()),
    };
    let mut dest = base.join(format!("{stem}{ext}"));
    let mut i = 2;
    while dest.exists() {
        dest = base.join(format!("{stem} {i}{ext}"));
        i += 1;
    }
    // hidden while copying (dotfiles are not listed), so a half-copied file never shows up
    let tmp = dest.with_file_name(format!(".{}.part", dest.file_name().unwrap_or_default().to_string_lossy()));
    std::fs::copy(src, &tmp)?;
    std::fs::rename(&tmp, &dest)?;
    Ok(util::rel_slash(dir, &dest))
}

/// Save a pasted/dropped image next to the note (assets/) and return its relative path.
pub fn save_asset(dir: &Path, rel: &str, name: &str, data: &[u8]) -> Result<String> {
    let assets = resolve(dir, rel)?.parent().ok_or_else(|| anyhow!("percorso non valido"))?.join("assets");
    std::fs::create_dir_all(&assets)?;
    let clean: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' { c } else { '_' }).collect();
    let fname = format!("{}-{clean}", util::now_ms());
    std::fs::write(assets.join(&fname), data)?;
    Ok(format!("assets/{fname}"))
}

// ---------- links note ↔ lessons (sidecar .polidesk-links.json in each notes folder) ----------
// { "<file>": [{ "c": courseId, "k": recordingKey }, ...] }
const LINKS: &str = ".polidesk-links.json";
pub fn get_all_links(dir: &Path) -> serde_json::Map<String, Value> {
    util::read_json(&crate::paths::renamed(dir.join(LINKS), ".polirec-links.json")).and_then(|v| v.as_object().cloned()).unwrap_or_default()
}
fn save_all_links(dir: &Path, mut all: serde_json::Map<String, Value>) -> Result<()> {
    all.retain(|_, v| v.as_array().map(|a| !a.is_empty()).unwrap_or(false));
    std::fs::create_dir_all(dir)?;
    util::write_atomic(&dir.join(LINKS), serde_json::to_string(&Value::Object(all))?)
}
pub fn get_links(dir: &Path, file: &str) -> Value {
    get_all_links(dir).get(file).cloned().unwrap_or_else(|| json!([]))
}
pub fn set_links(dir: &Path, file: &str, links: &Value) -> Result<Value> {
    let mut all = get_all_links(dir);
    let mut seen = std::collections::HashSet::new();
    let clean: Vec<Value> = links
        .as_array()
        .into_iter()
        .flatten()
        .filter(|l| {
            let (c, k) = (util::s(l, "c"), util::s(l, "k"));
            !c.is_empty() && !k.is_empty() && seen.insert(format!("{c}|{k}"))
        })
        .map(|l| json!({ "c": util::s(l, "c"), "k": util::s(l, "k") }))
        .collect();
    all.insert(file.to_string(), json!(clean));
    save_all_links(dir, all)?;
    Ok(json!(clean))
}
pub fn move_links(dir: &Path, from: &str, to: Option<&str>) -> Result<()> {
    let mut all = get_all_links(dir);
    let Some(v) = all.remove(from) else { return Ok(()) };
    if let Some(t) = to {
        all.insert(t.to_string(), v);
    }
    save_all_links(dir, all)
}

// ---------- engines ----------
fn engine_bin(name: &str) -> PathBuf {
    paths::bin_dir().join(if cfg!(windows) { format!("{name}.exe") } else { name.to_string() })
}
fn engine_version(name: &str) -> Option<String> {
    let b = engine_bin(name);
    if !b.exists() {
        return None;
    }
    let v = std::process::Command::new(&b).arg("--version").output().ok().map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").trim().to_string());
    Some(v.filter(|s| !s.is_empty()).unwrap_or_else(|| "installato".into()))
}
pub fn engine_status() -> Value {
    json!({ "typst": engine_version("typst"), "tectonic": engine_version("tectonic") })
}
fn target_triple(name: &str) -> String {
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
    if cfg!(target_os = "macos") {
        format!("{arch}-apple-darwin")
    } else if cfg!(windows) {
        if name == "tectonic" { "x86_64-pc-windows-msvc".into() } else { format!("{arch}-pc-windows-msvc") }
    } else if name == "tectonic" && arch != "aarch64" {
        "x86_64-unknown-linux-musl".into()
    } else {
        format!("{arch}-unknown-linux-musl")
    }
}

pub async fn install_engine(name: &str, on_log: &(dyn Fn(String) + Send + Sync)) -> Result<Value> {
    let repo = if name == "typst" { "typst/typst" } else { "tectonic-typesetting/tectonic" };
    let rel: Value = net::client().get(format!("https://api.github.com/repos/{repo}/releases/latest")).send().await?.json().await?;
    let triple = target_triple(name);
    let asset = rel["assets"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|a| {
            let n = util::s(a, "name");
            n.contains(&triple) && (n.ends_with(".tar.xz") || n.ends_with(".tar.gz") || n.ends_with(".zip"))
        })
        .ok_or_else(|| anyhow!("Nessun binario {name} per {triple} nella release {}", util::s(&rel, "tag_name")))?;
    on_log(format!("Scarico {} ({})…", util::s(asset, "name"), util::s(&rel, "tag_name")));
    let tmp = std::env::temp_dir().join(format!("polidesk-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp)?;
    let archive = tmp.join(util::s(asset, "name"));
    net::download(util::s(asset, "browser_download_url"), &archive).await?;
    on_log("Estraggo…".into());
    // bsdtar (macOS, Windows 10+) and GNU tar handle .tar.xz/.tar.gz/.zip
    let st = tokio::process::Command::new("tar").arg("-xf").arg(&archive).arg("-C").arg(&tmp).status().await?;
    if !st.success() {
        bail!("tar exit {}", st.code().unwrap_or(-1));
    }
    let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let found = find_file(&tmp, &exe).ok_or_else(|| anyhow!("binario non trovato nell'archivio"))?;
    std::fs::create_dir_all(paths::bin_dir())?;
    std::fs::copy(&found, engine_bin(name))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(engine_bin(name), std::fs::Permissions::from_mode(0o755))?;
    }
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("xattr").args(["-d", "com.apple.quarantine"]).arg(engine_bin(name)).output();
    let _ = std::fs::remove_dir_all(&tmp);
    let v = engine_status()[name].clone();
    on_log(format!("{name} installato: {}", v.as_str().unwrap_or("")));
    Ok(v)
}
fn find_file(dir: &Path, name: &str) -> Option<PathBuf> {
    for e in std::fs::read_dir(dir).ok()?.filter_map(|e| e.ok()) {
        let p = e.path();
        if p.is_dir() {
            if let Some(f) = find_file(&p, name) {
                return Some(f);
            }
        } else if e.file_name() == name {
            return Some(p);
        }
    }
    None
}

/// Compile .typ / .tex to PDF next to the source. Returns {ok, pdf, log, errors}.
pub async fn compile(dir: &Path, rel: &str, on_log: &(dyn Fn(String) + Send + Sync)) -> Result<Value> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let src = resolve(dir, rel)?;
    // a note in a linked folder: Typst's root (and the returned PDF path) are that folder
    let (root, prefix) = match split_linked(dir, rel) {
        Some((base, prefix, _)) => (base, prefix),
        None => (dir.to_path_buf(), String::new()),
    };
    let kind = kind_by_ext(rel).unwrap_or("markdown");
    let out_dir = src.parent().unwrap().to_path_buf();
    let (bin, args): (PathBuf, Vec<std::ffi::OsString>) = match kind {
        "typst" => (engine_bin("typst"), vec!["compile".into(), "--root".into(), root.clone().into(), src.clone().into(), src.with_extension("pdf").into()]),
        "latex" => (engine_bin("tectonic"), vec!["-X".into(), "compile".into(), "--outdir".into(), out_dir.clone().into(), "--keep-logs".into(), src.clone().into()]),
        _ => bail!("Solo Typst e LaTeX vanno compilati"),
    };
    if !bin.exists() {
        bail!("Motore {} non installato", if kind == "typst" { "Typst" } else { "LaTeX (Tectonic)" });
    }
    let mut child = match tokio::process::Command::new(&bin).args(&args).current_dir(&out_dir).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).spawn() {
        Ok(c) => c,
        Err(e) => return Ok(json!({ "ok": false, "log": e.to_string() })),
    };
    let (so, se) = (child.stdout.take().unwrap(), child.stderr.take().unwrap());
    let log = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let pump = |r: Box<dyn tokio::io::AsyncRead + Unpin + Send>| {
        let log = log.clone();
        async move {
            let mut lines = BufReader::new(r).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                log.lock().unwrap().push_str(&format!("{l}\n"));
                if !l.is_empty() {
                    on_log(l);
                }
            }
        }
    };
    tokio::join!(pump(Box::new(so)), pump(Box::new(se)));
    let code = child.wait().await?;
    let pdf = src.with_extension("pdf");
    let log = log.lock().unwrap().clone();
    Ok(json!({
        "ok": code.success() && pdf.exists(),
        "pdf": if pdf.exists() { json!(format!("{prefix}{}", util::rel_slash(&root, &pdf))) } else { Value::Null },
        "errors": parse_errors(kind, &log),
        "log": log,
    }))
}

fn parse_errors(kind: &str, log: &str) -> Vec<Value> {
    static TYP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"error: (.+)\n\s+┌─ ([^:\n]+):(\d+):(\d+)").unwrap());
    static TEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"error: ([^:\n]+):(\d+): (.+)").unwrap());
    if kind == "typst" {
        TYP.captures_iter(log).map(|m| json!({ "line": m[3].parse::<u32>().unwrap_or(0), "col": m[4].parse::<u32>().unwrap_or(0), "msg": &m[1] })).collect()
    } else {
        TEX.captures_iter(log).map(|m| json!({ "line": m[2].parse::<u32>().unwrap_or(0), "msg": &m[3] })).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linked_folder_is_listed_resolved_and_unlinked() {
        let root = std::env::temp_dir().join(format!("polidesk-notes-test-{}", uuid::Uuid::new_v4()));
        let (dir, ext) = (root.join("appunti"), root.join("Analisi 1"));
        std::fs::create_dir_all(ext.join("esercizi/node_modules")).unwrap();
        std::fs::write(ext.join("teoria.md"), "# Limiti").unwrap();
        std::fs::write(ext.join("esercizi/foglio.pdf"), "%PDF").unwrap();
        std::fs::write(ext.join("esercizi/node_modules/x.js"), "").unwrap();
        let name = link_folder(&dir, &ext).unwrap();
        assert_eq!(name, "@Analisi 1");
        assert_eq!(link_folder(&dir, &ext).unwrap(), name, "linking twice keeps one entry");
        let mut files: Vec<String> = list(&dir).iter().map(|f| util::s(f, "file").to_string()).collect();
        files.sort();
        assert_eq!(files, ["@Analisi 1/esercizi/foglio.pdf", "@Analisi 1/teoria.md"]);
        // edits go to the original file (no copy)
        write(&dir, "@Analisi 1/teoria.md", "# Derivate").unwrap();
        assert_eq!(std::fs::read_to_string(ext.join("teoria.md")).unwrap(), "# Derivate");
        let n = create_in(&dir, Some("@Analisi 1/esercizi"), "Nuovo", "typst").unwrap();
        assert_eq!(n, "@Analisi 1/esercizi/Nuovo.typ");
        assert!(ext.join("esercizi/Nuovo.typ").exists());
        assert_eq!(rename(&dir, &n, "Rinominato").unwrap(), "@Analisi 1/esercizi/Rinominato.typ");
        assert!(resolve(&dir, "@Analisi 1/../../etc").is_err());
        unlink_folder(&dir, &name).unwrap();
        assert!(list(&dir).is_empty());
        assert!(ext.join("teoria.md").exists(), "unlinking never deletes");
        let _ = std::fs::remove_dir_all(&root);
    }
}
