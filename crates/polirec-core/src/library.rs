//! Per-course folder layout and manifest.
//!
//! ```text
//! <courseDir>/
//!   video/          lesson recordings (.mp4)
//!   trascrizioni/   transcripts (.txt / .srt / .vtt), originals in .orig/
//!   note/           AI generated notes (.md)
//!   appunti/        the student's own notes
//!   materiale/      slides and files from WeBeep
//!   polirec.json    manifest (metadata of every recording)
//!   INDICE.html/.md overview
//! ```
use crate::{indexpage, util};
use anyhow::Result;
use regex::Regex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

pub const DIR_VIDEO: &str = "video";
pub const DIR_TRANSCRIPTS: &str = "trascrizioni";
pub const DIR_NOTES: &str = "note";

#[derive(Clone, Debug)]
pub struct Dirs {
    pub root: PathBuf,
    pub video: PathBuf,
    pub transcripts: PathBuf,
    pub notes: PathBuf,
    pub manifest: PathBuf,
    pub index: PathBuf,
}
pub fn course_dirs(dir: &Path) -> Dirs {
    Dirs {
        root: dir.to_path_buf(),
        video: dir.join(DIR_VIDEO),
        transcripts: dir.join(DIR_TRANSCRIPTS),
        notes: dir.join(DIR_NOTES),
        manifest: dir.join("polirec.json"),
        index: dir.join("INDICE.md"),
    }
}
pub fn dir_of(course: &Value) -> PathBuf {
    PathBuf::from(util::s(course, "dir"))
}

pub fn load_manifest(dir: &Path) -> Value {
    let mut m = util::read_json(&course_dirs(dir).manifest).filter(Value::is_object).unwrap_or_else(|| json!({}));
    if !m["recordings"].is_object() {
        m["recordings"] = json!({});
    }
    m
}
pub fn save_manifest(dir: &Path, m: &Value) -> Result<()> {
    util::write_json(&course_dirs(dir).manifest, m)
}

static RX_COLON: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s*:\s*").unwrap());
static RX_BAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"[/\\?%*|"<>\x00-\x1f]"#).unwrap());
static RX_WS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());

pub fn sanitize(s: &str, max: usize) -> String {
    let s = RX_COLON.replace_all(s, " - ");
    let s = RX_BAD.replace_all(&s, "-");
    let s = RX_WS.replace_all(&s, " ");
    util::take(s.trim(), max).trim_end_matches(['.', ' ']).to_string()
}

/// "054307 - ANN... (MATTEUCCI MATTEO)" -> "Matteucci"
pub fn teacher_from(label: &str) -> String {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(([A-ZÀ-Ü' ]+)\)").unwrap());
    let Some(m) = RX.captures(label) else { return String::new() };
    let surname = m[1].trim().split_whitespace().next().unwrap_or("");
    let mut ch = surname.chars();
    match ch.next() {
        Some(f) => f.to_string() + &ch.as_str().to_lowercase(),
        None => String::new(),
    }
}

/// topics like "2026_11_02_AN2DL_Lez_1_Image_Classification_Matteucci" → "AN2DL Lez 1 Image Classification"
pub fn pretty_topic(rec: &Value) -> String {
    static RX_WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_]+$").unwrap());
    static RX_DATE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d{4}_\d{2}_\d{2}_?").unwrap());
    let mut topic = [util::s(rec, "topic"), util::s(rec, "title"), util::s(rec, "type")].into_iter().find(|x| !x.is_empty()).unwrap_or("Registrazione").to_string();
    if RX_WORD.is_match(&topic) && topic.contains('_') {
        topic = RX_DATE.replace(&topic, "").replace('_', " ");
    }
    let teacher = util::s(rec, "teacher");
    if !teacher.is_empty() {
        if let Ok(rx) = Regex::new(&format!(r"(?i)[\s_-]*{}$", regex::escape(teacher))) {
            let t = rx.replace(&topic, "").trim().to_string();
            if !t.is_empty() {
                topic = t;
            }
        }
    }
    topic
}

pub fn base_name(rec: &Value) -> String {
    let d = util::take(util::s(rec, "isoDate"), 10);
    let date = if d.is_empty() { "senza-data".to_string() } else { d };
    let t = util::s(rec, "teacher");
    let teacher = if t.is_empty() { String::new() } else { format!(" ({t})") };
    sanitize(&format!("{date} - {}{teacher}", pretty_topic(rec)), 120)
}

/// Pick a unique filename for a recording, stable across syncs (stored in the manifest).
pub fn assign_filename(manifest: &Value, key: &str, rec: &Value) -> String {
    let recs = &manifest["recordings"];
    if let Some(f) = recs.get(key).map(|r| util::s(r, "file")).filter(|f| !f.is_empty()) {
        return f.to_string();
    }
    let used: std::collections::HashSet<&str> = recs.as_object().map(|m| m.values().map(|r| util::s(r, "file")).filter(|f| !f.is_empty()).collect()).unwrap_or_default();
    let base = base_name(rec);
    let mut name = format!("{base}.mp4");
    let mut i = 2;
    while used.contains(name.as_str()) {
        name = format!("{base} [{i}].mp4");
        i += 1;
    }
    name
}

pub fn stem(file: &str) -> &str {
    let l = file.len();
    if l >= 4 && file[l - 4..].eq_ignore_ascii_case(".mp4") { &file[..l - 4] } else { file }
}

/// Transcript / notes are derived from the filesystem (never stored), so concurrent jobs can't clobber each other.
pub fn file_status(dir: &Path, rec: &Value) -> Value {
    let d = course_dirs(dir);
    let file = util::s(rec, "file");
    let st = stem(file);
    let mut out = json!({ "videoExists": false, "transcript": null, "subtitles": null, "notes": [] });
    if st.is_empty() {
        return out;
    }
    out["videoExists"] = json!(d.video.join(file).exists());
    for ext in ["txt", "srt", "vtt"] {
        if d.transcripts.join(format!("{st}.{ext}")).exists() {
            if ext == "txt" {
                out["transcript"] = json!(format!("{st}.txt"));
            } else if out["subtitles"].is_null() {
                out["subtitles"] = json!(format!("{st}.{ext}"));
            }
        }
    }
    let pre = format!("{st} - ");
    let mut notes: Vec<String> = std::fs::read_dir(&d.notes)
        .map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).filter(|f| f.starts_with(&pre) && f.ends_with(".md")).collect())
        .unwrap_or_default();
    notes.sort();
    out["notes"] = json!(notes);
    out
}

/// Recordings + file status + display title + summary (from "<stem> - sommario.md"), oldest first.
pub fn with_file_status(dir: &Path, manifest: &Value) -> Vec<Value> {
    let d = course_dirs(dir);
    let mut recs: Vec<Value> = manifest["recordings"]
        .as_object()
        .map(|m| m.values().cloned().collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .map(|r| {
            let st = file_status(dir, &r);
            let (mut summary, mut bullets) = (Value::Null, Vec::<String>::new());
            if let Some(sf) = st["notes"].as_array().and_then(|a| a.iter().filter_map(Value::as_str).find(|n| n.ends_with(" - sommario.md"))) {
                if let Ok(txt) = std::fs::read_to_string(d.notes.join(sf)) {
                    let lines: Vec<&str> = txt.split('\n').map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')).collect();
                    let is_b = |l: &str| l.starts_with(['-', '*', '•']);
                    let first = lines.iter().find(|l| !is_b(l)).map(|l| l.replace("**", "")).unwrap_or_default();
                    summary = if first.is_empty() { Value::Null } else { json!(first) };
                    bullets = lines.iter().filter_map(|l| strip_bullet(l)).map(|l| l.replace("**", "")).take(8).collect();
                }
            }
            let mut o = util::merge(&r, &st);
            o["displayTitle"] = json!(pretty_topic(&r));
            o["summary"] = summary;
            o["bullets"] = json!(bullets);
            o
        })
        .collect();
    recs.sort_by(|a, b| util::s(a, "isoDate").cmp(util::s(b, "isoDate")));
    recs
}
/// "- text" / "* text" / "• text" → "text"
pub fn strip_bullet(l: &str) -> Option<&str> {
    let mut it = l.char_indices();
    let (_, c) = it.next()?;
    if !matches!(c, '-' | '*' | '•') {
        return None;
    }
    let rest = &l[c.len_utf8()..];
    let t = rest.trim_start();
    if t.len() == rest.len() || t.is_empty() && rest.is_empty() {
        return None; // needs at least one whitespace after the marker
    }
    Some(t)
}

/// Distinct teachers of a course's recordings: [{ name, count }] (more than one = parallel lecture tracks).
pub fn teachers_of(manifest: &Value) -> Vec<Value> {
    let mut by: std::collections::BTreeMap<String, u32> = Default::default();
    for r in manifest["recordings"].as_object().into_iter().flat_map(|m| m.values()) {
        let t = util::s(r, "teacher");
        if !t.is_empty() {
            *by.entry(t.to_string()).or_default() += 1;
        }
    }
    let mut v: Vec<_> = by.into_iter().collect();
    v.sort_by(|a, b| util::natural_cmp(&a.0, &b.0));
    v.into_iter().map(|(name, count)| json!({ "name": name, "count": count })).collect()
}
/// Is this recording wanted given the followed teachers? (no choice / no teacher info → yes)
pub fn followed(teachers: Option<&Value>, r: &Value) -> bool {
    let list = util::str_list(teachers);
    let t = util::s(r, "teacher");
    list.is_empty() || t.is_empty() || list.iter().any(|x| x == t)
}

/// Files (video, transcripts incl. originals, AI notes) of lessons by teachers NOT followed.
pub fn unfollowed_files(dir: &Path, manifest: &Value, teachers: &Value) -> Vec<PathBuf> {
    let d = course_dirs(dir);
    let mut out = vec![];
    for r in with_file_status(dir, manifest) {
        let file = util::s(&r, "file");
        if followed(Some(teachers), &r) || file.is_empty() {
            continue;
        }
        let st = stem(file);
        let mut c = vec![d.video.join(file), d.video.join(format!("{file}.part"))];
        for ext in ["txt", "srt", "vtt", "json"] {
            c.push(d.transcripts.join(format!("{st}.{ext}")));
            c.push(d.transcripts.join(".orig").join(format!("{st}.{ext}")));
        }
        for n in util::str_list(r.get("notes")) {
            c.push(d.notes.join(n));
        }
        out.extend(c.into_iter().filter(|p| p.exists()));
    }
    out
}

/// INDICE.html (cards) + INDICE.md (Obsidian / VS Code friendly)
pub fn write_index(dir: &Path, manifest: &Value) -> Result<()> {
    let d = course_dirs(dir);
    let recs: Vec<Value> = with_file_status(dir, manifest).into_iter().filter(|r| followed(manifest.get("teachers"), r)).collect();
    std::fs::create_dir_all(&d.root)?;
    std::fs::write(d.root.join("INDICE.html"), indexpage::render(manifest.get("course"), &recs, &d))?;
    let rel = |p: &str| util::encode_uri(p).replace('(', "%28").replace(')', "%29");
    let title = manifest.get("course").map(|c| util::s(c, "fullname")).filter(|s| !s.is_empty()).unwrap_or("Registrazioni");
    let mut md = format!("# {title}\n\n");
    md += &format!("Aggiornato: {} · {} registrazioni · [versione HTML](INDICE.html)\n\n", util::it_datetime(chrono::Local::now()), recs.len());
    for r in recs.iter().rev() {
        let t = util::s(r, "teacher");
        md += &format!("## {} — {}{}\n\n", util::take(util::s(r, "isoDate"), 10), util::s(r, "displayTitle"), if t.is_empty() { String::new() } else { format!(" ({t})") });
        let meta: Vec<&str> = [util::s(r, "type"), util::s(r, "duration")].into_iter().filter(|x| !x.is_empty()).collect();
        if !meta.is_empty() {
            md += &format!("*{}*\n\n", meta.join(" · "));
        }
        if let Some(sum) = indexpage::read_summary(&d, r) {
            if !sum.text.is_empty() {
                md += &format!("{}\n\n", sum.text);
            }
            for b in &sum.bullets {
                md += &format!("- {b}\n");
            }
            if !sum.bullets.is_empty() {
                md += "\n";
            }
        }
        let mut links = vec![];
        if util::b(r, "videoExists") {
            links.push(format!("[▶ Video]({})", rel(&format!("{DIR_VIDEO}/{}", util::s(r, "file")))));
        }
        if !util::s(r, "webexUrl").is_empty() {
            links.push(format!("[WebEx]({})", util::s(r, "webexUrl")));
        }
        if !util::s(r, "transcript").is_empty() {
            links.push(format!("[Trascrizione]({})", rel(&format!("{DIR_TRANSCRIPTS}/{}", util::s(r, "transcript")))));
        }
        for n in util::str_list(r.get("notes")) {
            if !n.ends_with(" - sommario.md") {
                let label = n.rsplit(" - ").next().unwrap_or(&n).replace(".md", "");
                links.push(format!("[{label}]({})", rel(&format!("{DIR_NOTES}/{n}"))));
            }
        }
        md += &format!("{}\n\n", if links.is_empty() { "_non scaricato_".to_string() } else { links.join(" · ") });
    }
    std::fs::write(&d.index, md)?;
    Ok(())
}

/// One SRT file → [{start, end, text}]
pub fn parse_srt(text: &str) -> Vec<Value> {
    parse_srt_all(text).into_iter().map(|(start, end, text)| json!({ "start": start, "end": end, "text": text })).collect()
}
/// SRT → (start, end, text) in seconds
pub fn parse_srt_all(text: &str) -> Vec<(f64, f64, String)> {
    static RX_BLOCK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\n\n+").unwrap());
    static RX_T: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d+):(\d+):(\d+)[,.](\d+)").unwrap());
    let to_sec = |t: &str| {
        RX_T.captures(t)
            .map(|m| m[1].parse::<f64>().unwrap_or(0.0) * 3600.0 + m[2].parse::<f64>().unwrap_or(0.0) * 60.0 + m[3].parse::<f64>().unwrap_or(0.0) + m[4].parse::<f64>().unwrap_or(0.0) / 1000.0)
            .unwrap_or(0.0)
    };
    let t = text.replace('\r', "");
    RX_BLOCK
        .split(&t)
        .filter_map(|b| {
            let lines: Vec<&str> = b.trim().split('\n').collect();
            let i = lines.iter().position(|l| l.contains("-->"))?;
            let (a, z) = lines[i].split_once("-->")?;
            Some((to_sec(a), to_sec(z), lines[i + 1..].join(" ").trim().to_string()))
        })
        .collect()
}
