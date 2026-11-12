//! Temi d'esame (TdE, past exams) degli anni passati.
//!
//! Quando è attivo per un corso (`pastExams: true`), cerca su WeBeep le edizioni passate dello stesso
//! insegnamento (stesso codice o stesso nome, anno accademico diverso), ne legge il materiale e scarica i
//! file che sembrano temi d'esame o soluzioni. Aggiunge quelli dell'archivio PoliNetwork collegato e quelli
//! già presenti nel materiale di quest'anno. I doppioni (stesso contenuto) si scartano confrontando lo SHA-1.
//!
//! Sul disco: <corso>/materiale/Temi d'esame/<anno accademico>/<file>, più `.temi.json` con:
//!  - `seen`: url già esaminati (non si riscaricano, nemmeno se poi il file viene eliminato)
//!  - `hashes`: contenuto → percorso, per i doppioni
//!  - `list`: l'elenco ordinato per la UI, ogni voce con testo e (se c'è) soluzione
use crate::browser::{self, Session};
use crate::downloader::{self, Headers};
use crate::library as lib;
use crate::webeep::{self, WEBEEP};
use crate::{materials, net, polinetwork as pn, util};
use anyhow::Result;
use regex::Regex;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

pub const LOCAL_DIR: &str = "Temi d'esame";
const SIDECAR: &str = ".temi.json";
/// automatic search at most every 3 days (the button in the app forces it)
const EVERY_MS: i64 = 3 * 24 * 3600 * 1000;
const MAX_EDITIONS: usize = 15;
const EXTS: &[&str] = &["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "tex", "zip", "rar", "7z", "png", "jpg", "jpeg", "ipynb", "m", "py", "c", "cpp", "java", "xlsx", "pptx"];

fn root(course_dir: &Path) -> PathBuf {
    course_dir.join("materiale").join(LOCAL_DIR)
}
fn sidecar(course_dir: &Path) -> Value {
    let mut v = util::read_json(&root(course_dir).join(SIDECAR)).filter(Value::is_object).unwrap_or_else(|| json!({}));
    for k in ["seen", "hashes"] {
        if !v[k].is_object() {
            v[k] = json!({});
        }
    }
    v
}
fn save(course_dir: &Path, v: &Value) -> Result<()> {
    std::fs::create_dir_all(root(course_dir))?;
    util::write_json(&root(course_dir).join(SIDECAR), v)
}

/// Time for the automatic search?
pub fn due(course_dir: &Path) -> bool {
    let v = util::read_json(&root(course_dir).join(SIDECAR)).unwrap_or(Value::Null);
    v["checkedAt"].as_i64().map(|t| util::now_ms() - t > EVERY_MS).unwrap_or(true)
}
/// Forget when the last search ran: the next sync searches again.
pub fn reset(course_dir: &Path) -> Result<()> {
    if !root(course_dir).join(SIDECAR).exists() {
        return Ok(());
    }
    let mut v = sidecar(course_dir);
    v["checkedAt"] = Value::Null;
    save(course_dir, &v)
}

// ───────────────────────── recognizing exams and solutions ─────────────────────────

/// lowercase words: "TdE_2023-02-14Sol.pdf" → "tde 2023 02 14 sol pdf"
fn words(s: &str) -> String {
    let mut out = String::new();
    let mut prev: Option<char> = None;
    for ch in s.to_lowercase().chars() {
        let c = match ch {
            'à' | 'á' => 'a',
            'è' | 'é' => 'e',
            'ì' | 'í' => 'i',
            'ò' | 'ó' => 'o',
            'ù' | 'ú' => 'u',
            c => c,
        };
        if c.is_alphanumeric() {
            if let Some(p) = prev {
                if p.is_alphanumeric() && (p.is_ascii_digit() != c.is_ascii_digit()) {
                    out.push(' ');
                }
            }
            out.push(c);
        } else if !out.ends_with(' ') && !out.is_empty() {
            out.push(' ');
        }
        prev = Some(c);
    }
    out.trim().to_string()
}

static RX_EXAM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(tde|temi|tema|esame|esami|exam|exams|appello|appelli|compito|compiti|compitino|compitini|itinere|midterm|midterms|final|finals|scritto|scritti|past|prova scritta|prove scritte|prova finale|prove finali|prova intermedia|prove intermedie)\b").unwrap()
});
static RX_SOL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(sol|sols|soluz|soluzione|soluzioni|solution|solutions|solved|svolto|svolta|svolti|svolte|svolgimento|risolto|risolta|risolti|risolte|correzione|correzioni|answers)\b").unwrap()
});
/// the text and the solution in the same file
static RX_BOTH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(con|with|e|and|incl|plus|inclusa|incluse)\s+(sol|soluz|soluzione|soluzioni|solution|solutions|svolgimento)\b|\b(svolto|svolta|svolti|svolte|risolto|risolta|risolti|risolte|solved)\b").unwrap()
});
const STOP: &[&str] = &[
    "tde", "temi", "tema", "esame", "esami", "exam", "exams", "appello", "appelli", "compito", "compiti", "compitino", "compitini", "prova", "prove", "scritta", "scritte", "scritto", "scritti",
    "testo", "testi", "text", "traccia", "tracce", "past", "sol", "sols", "soluz", "soluzione", "soluzioni", "solution", "solutions", "solved", "svolto", "svolta", "svolti", "svolte", "svolgimento",
    "risolto", "risolta", "risolti", "risolte", "correzione", "correzioni", "answers", "con", "with", "e", "and", "incl", "plus", "inclusa", "incluse", "di", "del", "della", "dello", "dei", "degli",
    "the", "of", "d", "pdf", "docx", "doc", "zip", "a", "aa", "anno", "accademico",
];
const MONTHS: &[(&str, u32)] = &[
    ("gennaio", 1), ("gen", 1), ("january", 1), ("jan", 1), ("febbraio", 2), ("feb", 2), ("february", 2), ("marzo", 3), ("mar", 3), ("march", 3), ("aprile", 4), ("apr", 4), ("april", 4),
    ("maggio", 5), ("mag", 5), ("may", 5), ("giugno", 6), ("giu", 6), ("june", 6), ("jun", 6), ("luglio", 7), ("lug", 7), ("july", 7), ("jul", 7), ("agosto", 8), ("ago", 8), ("august", 8), ("aug", 8),
    ("settembre", 9), ("set", 9), ("sett", 9), ("september", 9), ("sep", 9), ("sept", 9), ("ottobre", 10), ("ott", 10), ("october", 10), ("oct", 10), ("novembre", 11), ("nov", 11), ("november", 11),
    ("dicembre", 12), ("dic", 12), ("december", 12), ("dec", 12),
];

fn is_doc(name: &str) -> bool {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default();
    EXTS.contains(&ext.as_str())
}
/// Does this path (section / folder / file name) look like an exam or a solution?
pub fn looks_like_exam(path: &str) -> bool {
    if RX_EXAM.is_match(&words(path)) {
        return true;
    }
    // "Soluzioni 14-02-2023.pdf" outside an exam section: a dated solution is an exam solution
    let name = path.rsplit('/').next().unwrap_or(path);
    RX_SOL.is_match(&words(name)) && date_of(name).is_some()
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
    Exam,
    Solution,
    Both,
}
fn kind_of(name: &str) -> Kind {
    let w = words(name);
    if RX_BOTH.is_match(&w) {
        Kind::Both
    } else if RX_SOL.is_match(&w) {
        Kind::Solution
    } else {
        Kind::Exam
    }
}

fn year4(y: &str) -> Option<i32> {
    let n: i32 = y.parse().ok()?;
    let n = if y.len() == 2 { 2000 + n } else { n };
    (1990..=2100).contains(&n).then_some(n)
}
fn valid(y: i32, m: u32, d: u32) -> bool {
    (1..=12).contains(&m) && (1..=31).contains(&d) && (1990..=2100).contains(&y)
}

/// Exam date from a file name: "YYYY-MM-DD", or "YYYY-MM" when only month and year are there.
/// Returns the date and the number tokens it used (removed from the pairing key).
fn date_of(name: &str) -> Option<(String, Vec<String>)> {
    static ISO: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|\D)(20\d{2})[-_. ]?(0[1-9]|1[0-2])[-_. ]?(0[1-9]|[12]\d|3[01])(?:\D|$)").unwrap());
    static DMY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|\D)(0?[1-9]|[12]\d|3[01])[-_. /](0?[1-9]|1[0-2])[-_. /](20\d{2}|\d{2})(?:\D|$)").unwrap());
    static DMY_COMPACT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|\D)(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2}|\d{2})(?:\D|$)").unwrap());
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name).to_lowercase();
    if let Some(m) = ISO.captures(&stem) {
        let (y, mo, d) = (m[1].parse().unwrap_or(0), m[2].parse().unwrap_or(0), m[3].parse().unwrap_or(0));
        if valid(y, mo, d) {
            return Some((format!("{y:04}-{mo:02}-{d:02}"), vec![m[1].into(), m[2].into(), m[3].into()]));
        }
    }
    for rx in [&*DMY, &*DMY_COMPACT] {
        if let Some(m) = rx.captures(&stem) {
            if let Some(y) = year4(&m[3]) {
                let (mo, d) = (m[2].parse().unwrap_or(0), m[1].parse().unwrap_or(0));
                if valid(y, mo, d) {
                    return Some((format!("{y:04}-{mo:02}-{d:02}"), vec![m[1].into(), m[2].into(), m[3].into()]));
                }
            }
        }
    }
    // "14 febbraio 2023", "feb 2023", "febbraio23"
    let w: Vec<String> = words(&stem).split(' ').map(String::from).collect();
    for (i, t) in w.iter().enumerate() {
        let Some(&(_, mo)) = MONTHS.iter().find(|(n, _)| n == t) else { continue };
        let Some(ys) = w.get(i + 1).filter(|y| y.len() == 4 || y.len() == 2) else { continue };
        let Some(y) = year4(ys) else { continue };
        let day = i.checked_sub(1).and_then(|j| w.get(j)).and_then(|d| d.parse::<u32>().ok()).filter(|d| (1..=31).contains(d));
        let mut used = vec![ys.clone()];
        return Some(match day {
            Some(d) => {
                used.push(w[i - 1].clone());
                (format!("{y:04}-{mo:02}-{d:02}"), used)
            }
            None => (format!("{y:04}-{mo:02}"), used),
        });
    }
    None
}

/// What remains of the name once exam/solution words and the date are gone: "Parte A", "Prova 2"…
fn residual(name: &str, used: &[String]) -> String {
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
    let norm = |s: &str| s.trim_start_matches('0').to_string();
    let used: HashSet<String> = used.iter().map(|u| norm(u)).collect();
    words(stem)
        .split(' ')
        .filter(|t| !t.is_empty() && !STOP.contains(t) && !MONTHS.iter().any(|(m, _)| m == t) && !used.contains(&norm(t)))
        .collect::<Vec<_>>()
        .join(" ")
}

fn sha1_file(p: &Path) -> Option<String> {
    let data = std::fs::read(p).ok()?;
    Some(Sha1::digest(&data).iter().map(|b| format!("{b:02x}")).collect())
}

// ───────────────────────── past editions on WeBeep ─────────────────────────

static RX_CODE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(\d{6})\b").unwrap());
static RX_YEAR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(20\d{2})\s*[-/]\s*(20\d{2}|\d{2})\b").unwrap());

fn codes(c: &Value) -> HashSet<String> {
    ["fullname", "shortname", "idnumber"].iter().flat_map(|k| RX_CODE.captures_iter(util::s(c, k)).map(|m| m[1].to_string()).collect::<Vec<_>>()).collect()
}
/// "2023-24" from "ANALISI 1 [2023-24]"
pub fn edition_year(name: &str) -> String {
    RX_YEAR.captures(name).map(|m| format!("{}-{}", &m[1], &m[2][m[2].len() - 2..])).unwrap_or_default()
}
/// course title without year, code, teacher and section: "ANALISI MATEMATICA 1 [2023-24] (ROSSI)" → "analisi matematica 1"
fn title(name: &str) -> String {
    static BR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[[^\]]*\]|\([^)]*\)").unwrap());
    static AA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\ba\.?\s?a\.?\b").unwrap());
    let s = BR.replace_all(name, " ");
    let s = RX_YEAR.replace_all(&s, " ");
    let s = RX_CODE.replace_all(&s, " ");
    let s = AA.replace_all(&s, " ");
    words(&s).split(' ').filter(|w| !matches!(*w, "sez" | "sezione" | "section" | "corso" | "course" | "di" | "del" | "della")).collect::<Vec<_>>().join(" ")
}
fn same_course(cur: &Value, other: &Value) -> bool {
    let (a, b) = (codes(cur), codes(other));
    if !a.is_empty() && !a.is_disjoint(&b) {
        return true;
    }
    let (ta, tb) = (title(util::s(cur, "fullname")), title(util::s(other, "fullname")));
    !ta.is_empty() && (ta == tb || pn::score(&ta, &tb) >= 0.92)
}

const SEARCH_JS: &str = r#"async ({ WEBEEP, queries }) => {
    const out = new Map();
    for (const q of queries) {
        try {
            const r = await fetch(`${WEBEEP}/course/search.php?search=${encodeURIComponent(q)}&perpage=all`, { credentials: 'include' });
            const d = new DOMParser().parseFromString(await r.text(), 'text/html');
            const scope = d.querySelector('#region-main') || d;
            for (const a of scope.querySelectorAll('a[href*="/course/view.php?id="]')) {
                const id = Number(new URL(a.href).searchParams.get('id'));
                const name = (a.textContent || '').replace(/\s+/g, ' ').trim();
                if (id > 1 && name && !out.has(id)) out.set(id, { id, fullname: name });
            }
        } catch (e) { }
    }
    return [...out.values()];
}"#;

/// Other editions of the same course: WeBeep course search (by code and by name) + the student's own courses.
async fn editions(s: &Session, cur: &Value) -> Result<Vec<Value>> {
    let mut queries: Vec<String> = codes(cur).into_iter().collect();
    let t = title(util::s(cur, "fullname"));
    if t.len() >= 4 {
        queries.push(t);
    }
    webeep::ensure_logged_in(s).await?;
    let found = browser::call(&s.page().await?, SEARCH_JS, &json!({ "WEBEEP": WEBEEP, "queries": queries })).await?;
    let mut all: Vec<Value> = found.as_array().cloned().unwrap_or_default();
    let mut my_ids = HashSet::new();
    if let Ok(mine) = webeep::enrolled_courses(s).await {
        my_ids = mine.iter().filter_map(|c| c["id"].as_i64()).collect();
        // first, so the "mine" entry wins the dedupe below
        all.splice(0..0, mine);
    }
    let cur_id = cur["id"].as_i64().unwrap_or(0);
    let mut seen = HashSet::new();
    let mut out: Vec<Value> = all
        .into_iter()
        .filter(|c| {
            let id = c["id"].as_i64().unwrap_or(0);
            id > 1 && id != cur_id && seen.insert(id) && same_course(cur, c)
        })
        .map(|c| json!({ "id": c["id"], "name": c["fullname"], "year": edition_year(util::s(&c, "fullname")), "mine": my_ids.contains(&c["id"].as_i64().unwrap_or(0)) }))
        .collect();
    // newest first; editions of the same or a later year than the current one are other sections, still useful
    out.sort_by(|a, b| util::s(b, "year").cmp(util::s(a, "year")).then(b["id"].as_i64().cmp(&a["id"].as_i64())));
    out.truncate(MAX_EDITIONS);
    Ok(out)
}

// ───────────────────────── temporary self-enrolment ─────────────────────────
// Past editions the student is not enrolled in: if the course offers WeBeep self-enrolment WITHOUT an
// enrolment key, enrol, download the exams and unenrol right after (the same buttons the student would
// press). Courses needing a key are skipped. Temporary enrolments are written to the sidecar before
// anything else, so an interrupted run unenrols on the next one.

const ENROL_JS: &str = r#"async ({ WEBEEP, id }) => {
    const opened = async () => /\/course\/view\.php/.test((await fetch(`${WEBEEP}/course/view.php?id=${id}`, { credentials: 'include' })).url);
    if (await opened()) return { state: 'open' };
    const r = await fetch(`${WEBEEP}/enrol/index.php?id=${id}`, { credentials: 'include' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    const forms = [...d.querySelectorAll('form')].filter(f => f.querySelector('input[name$="_enrol_self_enrol_form"]') && f.querySelector('input[name="instance"]'));
    if (!forms.length) return { state: 'none' };
    let key = false;
    for (const f of forms) {
        if (f.querySelector('input[name="enrolpassword"]')) { key = true; continue; }
        const fd = new FormData();
        for (const i of f.querySelectorAll('input[name]')) if (i.type !== 'submit' && (i.type !== 'checkbox' || i.checked)) fd.append(i.name, i.value);
        fd.append('submitbutton', 'Iscrivimi');
        const action = new URL(f.getAttribute('action') || 'index.php', `${WEBEEP}/enrol/`).href;
        if (!action.startsWith(WEBEEP)) continue;
        await fetch(action, { method: 'POST', body: fd, credentials: 'include' });
        if (await opened()) return { state: 'enrolled', enrolid: Number(fd.get('instance')) };
    }
    return { state: key ? 'key' : 'failed' };
}"#;
const UNENROL_JS: &str = r#"async ({ WEBEEP, id, enrolid }) => {
    await fetch(`${WEBEEP}/enrol/self/unenrolself.php?enrolid=${enrolid}&confirm=1&sesskey=${M.cfg.sesskey}`, { credentials: 'include' });
    const r = await fetch(`${WEBEEP}/course/view.php?id=${id}`, { credentials: 'include' });
    return !/\/course\/view\.php/.test(r.url);
}"#;

/// Try to open a past edition: "open" (already readable), "enrolled" (temporary enrolment, with its id),
/// "key" (needs an enrolment key: skipped), "none" (no self-enrolment), "failed".
async fn self_enrol(s: &Session, id: &Value) -> Result<Value> {
    browser::call(&s.page().await?, ENROL_JS, &json!({ "WEBEEP": WEBEEP, "id": id })).await
}
async fn unenrol(s: &Session, id: &str, enrolid: i64) -> bool {
    let Ok(page) = s.page().await else { return false };
    browser::call(&page, UNENROL_JS, &json!({ "WEBEEP": WEBEEP, "id": id, "enrolid": enrolid })).await.ok().and_then(|v| v.as_bool()).unwrap_or(false)
}
/// Unenrol from every temporary enrolment still recorded (also the ones left by an interrupted run).
async fn unenrol_all(s: &Session, course_dir: &Path, side: &mut Value, log: &(dyn Fn(String) + Send + Sync)) {
    let pending: Vec<(String, Value)> = side["tempEnrolled"].as_object().map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default();
    for (id, v) in pending {
        if unenrol(s, &id, v["enrolid"].as_i64().unwrap_or(0)).await {
            log(format!("  ↩ Disiscritto da {}", util::s(&v, "name")));
            if let Some(o) = side["tempEnrolled"].as_object_mut() {
                o.remove(&id);
            }
            let _ = save(course_dir, side);
        } else {
            log(format!("  ⚠ Non sono riuscito a disiscriverti da {}: riprovo alla prossima ricerca (o fallo da WeBeep)", util::s(&v, "name")));
        }
    }
}

// ───────────────────────── the search ─────────────────────────

/// Search, download and index past exams. `course` is the config entry, `manifest` the course manifest.
pub async fn sync_exams(s: &Session, course: &Value, course_dir: &Path, manifest: &Value, log: &(dyn Fn(String) + Send + Sync), stop: &(dyn Fn() -> bool + Send + Sync)) -> Result<Value> {
    lib::ensure_drive(course_dir)?;
    let dir = root(course_dir);
    std::fs::create_dir_all(&dir)?;
    let mut side = sidecar(course_dir);
    let cur = &manifest["course"];
    log("📝 Cerco i temi d'esame degli anni passati...".into());
    if !side["tempEnrolled"].is_object() {
        side["tempEnrolled"] = json!({});
    }
    // left over by an interrupted run
    if side["tempEnrolled"].as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        webeep::ensure_logged_in(s).await?;
        unenrol_all(s, course_dir, &mut side, log).await;
    }
    let may_enrol = course["pastExamsEnrol"].as_bool() != Some(false);
    let eds = editions(s, cur).await?;
    log(format!("  • {} edizioni passate del corso su WeBeep", eds.len()));
    let cookie = s.cookie_header_for(&format!("{WEBEEP}/")).await?;
    let tmp = dir.join(".tmp");
    let (mut downloaded, mut dupes, mut failed) = (0, 0, 0);
    let mut eds_out = Vec::new();
    for ed in &eds {
        if stop() {
            break;
        }
        let id = ed["id"].as_i64().unwrap_or(0).to_string();
        let mut access = if util::b(ed, "mine") { "mine" } else { "none" };
        if !util::b(ed, "mine") && may_enrol {
            match self_enrol(s, &ed["id"]).await {
                Ok(r) => match util::s(&r, "state") {
                    "open" => access = "open",
                    "enrolled" => {
                        access = "temp";
                        side["tempEnrolled"][&id] = json!({ "enrolid": r["enrolid"], "name": ed["name"], "at": util::now_iso() });
                        save(course_dir, &side)?;
                        log(format!("  ↪ Iscrizione temporanea a {}", util::s(ed, "name")));
                    }
                    "key" => access = "key",
                    _ => {}
                },
                Err(e) => log(format!("  ✗ Iscrizione a {}: {e}", util::s(ed, "name"))),
            }
        }
        let inv = match materials::inventory(s, &ed["id"]).await {
            Ok(v) => v,
            Err(e) => {
                log(format!("  ✗ {}: {e}", util::s(ed, "name")));
                if access == "temp" {
                    unenrol_all(s, course_dir, &mut side, log).await;
                }
                continue;
            }
        };
        let files = inv["files"].as_array().cloned().unwrap_or_default();
        let year = Some(util::s(ed, "year")).filter(|y| !y.is_empty()).map(String::from).unwrap_or_else(|| lib::sanitize(util::s(ed, "name"), 60));
        let cands: Vec<&Value> = files.iter().filter(|f| looks_like_exam(&[util::s(f, "section"), util::s(f, "folder"), util::s(f, "rel"), util::s(f, "name")].join("/"))).collect();
        eds_out.push(json!({ "id": ed["id"], "name": ed["name"], "year": year, "accessible": !files.is_empty(), "candidates": cands.len(), "access": access }));
        for f in cands {
            if stop() {
                break;
            }
            let url = util::s(f, "url").to_string();
            if side["seen"].get(&url).is_some() {
                continue;
            }
            let r: Result<Option<bool>> = async {
                let head = net::client().head(&url).header("Cookie", &cookie).send().await?;
                if !head.status().is_success() {
                    anyhow::bail!("HTTP {}", head.status().as_u16());
                }
                let final_url = head.url().clone();
                let cd = head.headers().get("content-disposition").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                let name = materials::file_name_from(&cd, &final_url);
                if !is_doc(&name) {
                    return Ok(None);
                }
                let part = tmp.join(util::short_hash(&url));
                let headers: Headers = vec![("Cookie".into(), cookie.clone())];
                downloader::http_download(final_url.as_str(), &part, &headers, Arc::new(|_| {}), 1).await?;
                let hash = sha1_file(&part).unwrap_or_default();
                let known = side["hashes"].get(&hash).map(|p| util::s(p, "path").to_string()).filter(|p| course_dir.join("materiale").join(p).exists());
                if known.is_some() {
                    let _ = std::fs::remove_file(&part);
                    side["seen"][&url] = json!({ "hash": hash });
                    return Ok(Some(false));
                }
                let mut dest = dir.join(lib::sanitize(&year, 60)).join(lib::sanitize(&name, 150));
                let mut n = 2;
                while dest.exists() {
                    let (stem, ext) = name.rsplit_once('.').unwrap_or((&name, ""));
                    dest = dir.join(lib::sanitize(&year, 60)).join(lib::sanitize(&format!("{stem} ({n}).{ext}"), 150));
                    n += 1;
                }
                std::fs::create_dir_all(dest.parent().unwrap())?;
                std::fs::rename(&part, &dest)?;
                let rel = format!("{LOCAL_DIR}/{}", util::rel_slash(&dir, &dest));
                side["hashes"][&hash] = json!({ "path": rel });
                side["seen"][&url] = json!({ "hash": hash, "path": rel, "edition": year, "section": util::s(f, "section") });
                log(format!("  ✓ {rel}"));
                Ok(Some(true))
            }
            .await;
            match r {
                Ok(Some(true)) => downloaded += 1,
                Ok(Some(false)) => dupes += 1,
                Ok(None) => {
                    side["seen"][&url] = json!({ "skipped": true });
                }
                Err(e) => {
                    failed += 1;
                    log(format!("  ✗ {}: {e}", [util::s(f, "name"), util::s(f, "rel"), &url].into_iter().find(|x| !x.is_empty()).unwrap_or("")));
                }
            }
            save(course_dir, &side)?;
        }
        // exams downloaded: leave the course again
        if access == "temp" {
            unenrol_all(s, course_dir, &mut side, log).await;
        }
    }
    let _ = std::fs::remove_dir_all(&tmp);

    // PoliNetwork: the exam files of the linked folders
    let links = course["polinetwork"].as_array().cloned().unwrap_or_default();
    let mut pn_new = 0;
    if !links.is_empty() && !stop() {
        match pn::course_tree(course_dir, &links).await {
            Ok(tree) => {
                let mut items = Vec::new();
                for src in tree["sources"].as_array().into_iter().flatten() {
                    for f in src["files"].as_array().into_iter().flatten() {
                        let p = util::s(f, "path");
                        if util::s(f, "state") == "new" && is_doc(p) && looks_like_exam(p) {
                            items.push(json!({ "repo": src["repo"], "folder": src["folder"], "path": p, "oid": f["oid"] }));
                        }
                    }
                }
                if !items.is_empty() {
                    log(format!("  • PoliNetwork: {} temi d'esame da scaricare", items.len()));
                    match pn::download(course_dir, &links, &items, &|_: usize, _: usize, _: &str| {}, stop).await {
                        Ok((ok, ko)) => {
                            pn_new = ok;
                            failed += ko;
                        }
                        Err(e) => log(format!("  ✗ PoliNetwork: {e}")),
                    }
                }
            }
            Err(e) => log(format!("  ✗ PoliNetwork: {e}")),
        }
    }

    let list = build_list(course_dir, manifest, &mut side);
    side["checkedAt"] = json!(util::now_ms());
    side["editions"] = json!(eds_out);
    side["list"] = json!(list);
    save(course_dir, &side)?;
    log(format!("📝 Temi d'esame: {} in elenco ({downloaded} nuovi da WeBeep, {pn_new} da PoliNetwork, {dupes} doppioni scartati{})", list.len(), if failed > 0 { format!(", {failed} errori") } else { String::new() }));
    Ok(json!({ "editions": eds.len(), "downloaded": downloaded + pn_new, "duplicates": dupes, "failed": failed, "total": list.len() }))
}

struct Item {
    rel: String,
    name: String,
    kind: Kind,
    date: Option<String>,
    key: String,
    edition: String,
    source: &'static str,
}

/// All exam-like files of the course (past editions, this year's material, PoliNetwork), without duplicates,
/// paired text ↔ solution and sorted (newest first).
fn build_list(course_dir: &Path, manifest: &Value, side: &mut Value) -> Vec<Value> {
    let mat = course_dir.join("materiale");
    let this_year = edition_year(util::s(&manifest["course"], "fullname"));
    let mut files: Vec<(String, String, &'static str)> = Vec::new(); // (rel to materiale/, edition, source)
    // this year's WeBeep material first: those files stay where they are
    let mut cur: Vec<String> = manifest["materials"].as_object().map(|o| o.values().filter(|x| !util::b(x, "deleted")).map(|x| util::s(x, "path").replace('\\', "/")).collect()).unwrap_or_default();
    cur.sort();
    cur.dedup();
    for p in cur {
        if is_doc(&p) && looks_like_exam(&p) {
            files.push((p, this_year.clone(), "webeep"));
        }
    }
    for p in local_files(course_dir) {
        let ed = p.split('/').nth(1).unwrap_or("").to_string();
        files.push((p, ed, "past"));
    }
    for p in pn::local_files(course_dir) {
        if is_doc(&p) && looks_like_exam(&p) {
            files.push((p, String::new(), "polinetwork"));
        }
    }
    // dedupe by content (hashes cached by size + mtime)
    if !side["hcache"].is_object() {
        side["hcache"] = json!({});
    }
    let mut by_hash: HashSet<String> = HashSet::new();
    let mut items = Vec::new();
    for (rel, edition, source) in files {
        let abs = mat.join(&rel);
        let Ok(meta) = std::fs::metadata(&abs) else { continue };
        let stamp = format!("{}:{}", meta.len(), util::mtime_ms(&meta) as i64);
        let hash = match side["hcache"].get(&rel).filter(|c| util::s(c, "stamp") == stamp) {
            Some(c) => util::s(c, "hash").to_string(),
            None => {
                let h = sha1_file(&abs).unwrap_or_default();
                side["hcache"][&rel] = json!({ "stamp": stamp, "hash": h });
                h
            }
        };
        if !by_hash.insert(hash.clone()) {
            continue;
        }
        if side["hashes"].get(&hash).is_none() {
            side["hashes"][&hash] = json!({ "path": rel });
        }
        let name = rel.rsplit('/').next().unwrap_or(&rel).to_string();
        let (date, used) = date_of(&name).map(|(d, u)| (Some(d), u)).unwrap_or((None, vec![]));
        items.push(Item { key: residual(&name, &used), kind: kind_of(&name), date, edition, source, name, rel });
    }
    pair(items)
}

fn pair(items: Vec<Item>) -> Vec<Value> {
    struct Entry {
        exam: Option<usize>,
        sol: Option<usize>,
        both: bool,
    }
    let mut entries: Vec<Entry> = Vec::new();
    for (i, it) in items.iter().enumerate() {
        if it.kind != Kind::Solution {
            entries.push(Entry { exam: Some(i), sol: None, both: it.kind == Kind::Both });
        }
    }
    let folder = |it: &Item| it.rel.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or_default();
    for (i, it) in items.iter().enumerate() {
        if it.kind != Kind::Solution {
            continue;
        }
        let free = |e: &Entry| e.sol.is_none() && !e.both;
        // 1. same date and same remaining name ("Parte A" ↔ "Parte A soluzioni")
        let mut hit = entries.iter().position(|e| free(e) && e.exam.map(|x| &items[x]).map(|x| x.date == it.date && x.key == it.key && (it.date.is_some() || !it.key.is_empty() || folder(x) == folder(it))).unwrap_or(false));
        // 2. same date, only one text that day
        if hit.is_none() && it.date.is_some() {
            let same: Vec<usize> = entries.iter().enumerate().filter(|(_, e)| free(e) && e.exam.map(|x| items[x].date == it.date).unwrap_or(false)).map(|(j, _)| j).collect();
            if same.len() == 1 {
                hit = Some(same[0]);
            }
        }
        match hit {
            Some(j) => entries[j].sol = Some(i),
            None => entries.push(Entry { exam: None, sol: Some(i), both: false }),
        }
    }
    let mut out: Vec<(String, String, Value)> = entries
        .into_iter()
        .map(|e| {
            let main = &items[e.exam.or(e.sol).unwrap()];
            let date = main.date.clone().or_else(|| e.sol.and_then(|s| items[s].date.clone()));
            let edition = if !main.edition.is_empty() { main.edition.clone() } else { date.as_deref().map(academic_year).unwrap_or_default() };
            let v = json!({
                "title": main.name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&main.name),
                "date": date, "edition": edition, "source": main.source,
                "exam": e.exam.map(|x| items[x].rel.clone()),
                "solution": if e.both { e.exam.map(|x| items[x].rel.clone()) } else { e.sol.map(|x| items[x].rel.clone()) },
                "withSolution": e.both,
            });
            (date.unwrap_or_default(), edition, v)
        })
        .collect();
    out.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)).then_with(|| util::natural_cmp(util::s(&a.2, "title"), util::s(&b.2, "title"))));
    out.into_iter().map(|x| x.2).collect()
}

/// "2023-02-14" → "2022-23" (the academic year starts in September)
fn academic_year(date: &str) -> String {
    let y: i32 = date.get(0..4).and_then(|y| y.parse().ok()).unwrap_or(0);
    let m: u32 = date.get(5..7).and_then(|m| m.parse().ok()).unwrap_or(1);
    if y == 0 {
        return String::new();
    }
    let start = if m >= 9 { y } else { y - 1 };
    format!("{start}-{:02}", (start + 1) % 100)
}

/// Downloaded past-exam files, relative to materiale/ (for the Materiale tab).
pub fn local_files(course_dir: &Path) -> Vec<String> {
    let dir = root(course_dir);
    let mut out = Vec::new();
    let mut stack = vec![dir.clone()];
    while let Some(d) = stack.pop() {
        for e in std::fs::read_dir(&d).into_iter().flatten().flatten() {
            let p = e.path();
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with('.') {
                continue;
            }
            if p.is_dir() {
                stack.push(p);
            } else {
                out.push(format!("{LOCAL_DIR}/{}", util::rel_slash(&dir, &p)));
            }
        }
    }
    out.sort_by(|a, b| util::natural_cmp(a, b));
    out
}

/// The list for the UI (entries whose files were deleted in the meantime are dropped).
pub fn view(course_dir: &Path) -> Value {
    let Some(v) = util::read_json(&root(course_dir).join(SIDECAR)) else { return Value::Null };
    let mat = course_dir.join("materiale");
    let exists = |x: &Value| x.as_str().map(|p| mat.join(p).exists()).unwrap_or(false);
    let list: Vec<Value> = v["list"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|e| {
            let mut e = e.clone();
            for k in ["exam", "solution"] {
                if !exists(&e[k]) {
                    e[k] = Value::Null;
                }
            }
            (!e["exam"].is_null() || !e["solution"].is_null()).then_some(e)
        })
        .collect();
    json!({ "checkedAt": v["checkedAt"], "editions": v["editions"], "list": list })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognize() {
        assert!(looks_like_exam("05 - Temi d'esame/TdE_2023-02-14.pdf"));
        assert!(looks_like_exam("Generale/Esame 14-02-2023 soluzioni.pdf"));
        assert!(looks_like_exam("Past exams/2022_06_30.pdf"));
        assert!(!looks_like_exam("01 - Lezioni/Lezione 3 - integrali.pdf"));
        assert_eq!(kind_of("TdE 2023-02-14 Soluzioni.pdf"), Kind::Solution);
        assert_eq!(kind_of("Sol_TdE_20230214.pdf"), Kind::Solution);
        assert_eq!(kind_of("Tema d'esame con soluzioni 14-02-2023.pdf"), Kind::Both);
        assert_eq!(kind_of("Appello 14-02-2023.pdf"), Kind::Exam);
    }

    #[test]
    fn dates() {
        assert_eq!(date_of("TdE_2023-02-14.pdf").unwrap().0, "2023-02-14");
        assert_eq!(date_of("Esame 14.02.2023.pdf").unwrap().0, "2023-02-14");
        assert_eq!(date_of("esame_140223_sol.pdf").unwrap().0, "2023-02-14");
        assert_eq!(date_of("Appello 14 febbraio 2023.pdf").unwrap().0, "2023-02-14");
        assert_eq!(date_of("Compito luglio 2021.pdf").unwrap().0, "2021-07");
        assert!(date_of("Lezione 3.pdf").is_none());
        assert_eq!(academic_year("2023-02-14"), "2022-23");
        assert_eq!(academic_year("2023-09-14"), "2023-24");
        assert_eq!(edition_year("ANALISI MATEMATICA 1 [2023-24]"), "2023-24");
        assert_eq!(title("ANALISI MATEMATICA 1 [2023-24] (ROSSI MARIO)"), "analisi matematica 1");
    }

    #[test]
    fn pairs() {
        let mk = |rel: &str, ed: &str| {
            let name = rel.rsplit('/').next().unwrap().to_string();
            let (date, used) = date_of(&name).map(|(d, u)| (Some(d), u)).unwrap_or((None, vec![]));
            Item { key: residual(&name, &used), kind: kind_of(&name), date, edition: ed.into(), source: "past", name, rel: rel.into() }
        };
        let list = pair(vec![
            mk("T/2022-23/TdE_2023-02-14.pdf", "2022-23"),
            mk("T/2022-23/TdE_2023-02-14_sol.pdf", "2022-23"),
            mk("T/2022-23/Esame 2023-07-10 parte A.pdf", "2022-23"),
            mk("T/2022-23/Esame 2023-07-10 parte B.pdf", "2022-23"),
            mk("T/2022-23/Soluzioni Esame 2023-07-10 parte B.pdf", "2022-23"),
            mk("T/2021-22/Appello 14 febbraio 2022 con soluzioni.pdf", "2021-22"),
            mk("T/2021-22/Soluzione compito luglio 2021.pdf", "2021-22"),
        ]);
        let find = |t: &str| list.iter().find(|e| util::s(e, "title") == t).unwrap().clone();
        assert_eq!(util::s(&find("TdE_2023-02-14"), "solution"), "T/2022-23/TdE_2023-02-14_sol.pdf");
        assert!(find("Esame 2023-07-10 parte A")["solution"].is_null());
        assert_eq!(util::s(&find("Esame 2023-07-10 parte B"), "solution"), "T/2022-23/Soluzioni Esame 2023-07-10 parte B.pdf");
        assert!(util::b(&find("Appello 14 febbraio 2022 con soluzioni"), "withSolution"));
        assert!(find("Soluzione compito luglio 2021")["exam"].is_null());
        // newest first
        assert_eq!(util::s(&list[0], "date"), "2023-07-10");
        assert_eq!(list.len(), 5);
    }
}
