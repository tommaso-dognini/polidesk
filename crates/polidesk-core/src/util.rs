//! Small helpers shared by every module: JSON access, dates (Italian formatting), files, encoding.
use anyhow::Result;
use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveDateTime, SecondsFormat, TimeZone, Timelike, Utc};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde_json::{Map, Value};
use std::cmp::Ordering;
use std::path::Path;

pub type Obj = Map<String, Value>;

// ---------- JSON ----------
pub fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or("")
}
pub fn b(v: &Value, k: &str) -> bool {
    match v.get(k) {
        Some(Value::Bool(x)) => *x,
        Some(Value::Null) | None => false,
        Some(Value::String(x)) => !x.is_empty(),
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0) != 0.0,
        Some(_) => true,
    }
}
/// JS-like truthiness of a value
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(x)) => *x,
        Some(Value::String(x)) => !x.is_empty(),
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0) != 0.0,
        Some(_) => true,
    }
}
pub fn f(v: &Value, k: &str) -> f64 {
    match v.get(k) {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(x)) => x.trim().parse().unwrap_or(0.0),
        _ => 0.0,
    }
}
pub fn obj(v: Value) -> Obj {
    match v {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}
/// `{...a, ...b}`
pub fn merge(a: &Value, b: &Value) -> Value {
    let mut out = a.as_object().cloned().unwrap_or_default();
    if let Some(m) = b.as_object() {
        for (k, v) in m {
            out.insert(k.clone(), v.clone());
        }
    }
    Value::Object(out)
}
pub fn deep_merge(a: &mut Value, b: &Value) {
    if let (Some(am), Some(bm)) = (a.as_object_mut(), b.as_object()) {
        for (k, v) in bm {
            match (am.get_mut(k), v) {
                (Some(av @ Value::Object(_)), Value::Object(_)) => deep_merge(av, v),
                _ => {
                    am.insert(k.clone(), v.clone());
                }
            }
        }
    }
}
pub fn str_list(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

// ---------- dates ----------
pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
pub fn iso(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}
pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}
/// Parses what `new Date(s)` accepts in practice (ISO with/without zone, date only).
pub fn parse_date(s: &str) -> Option<DateTime<Utc>> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if let Ok(d) = DateTime::parse_from_rfc3339(s) {
        return Some(d.with_timezone(&Utc));
    }
    for f in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S"] {
        if let Ok(n) = NaiveDateTime::parse_from_str(s, f) {
            return Local.from_local_datetime(&n).earliest().map(|d| d.with_timezone(&Utc));
        }
    }
    if let Ok(d) = NaiveDate::parse_from_str(&s[..s.len().min(10)], "%Y-%m-%d") {
        return Some(Utc.from_utc_datetime(&d.and_hms_opt(0, 0, 0)?));
    }
    None
}
pub const IT_WEEKDAYS: [&str; 7] = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
pub const IT_MONTHS_SHORT: [&str; 12] = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
/// `toLocaleString('it-IT')` → "9/11/2026, 14:03:05"
pub fn it_datetime(d: DateTime<Local>) -> String {
    format!("{}/{}/{}, {:02}:{:02}:{:02}", d.day(), d.month(), d.year(), d.hour(), d.minute(), d.second())
}
/// weekday short + day + month short + year → "lun 9 nov 2026"
pub fn it_day_short(d: DateTime<Local>) -> String {
    let wd = &IT_WEEKDAYS[d.weekday().num_days_from_monday() as usize][..3];
    format!("{} {} {} {}", wd, d.day(), IT_MONTHS_SHORT[d.month0() as usize], d.year())
}
pub fn it_weekday(d: DateTime<Local>) -> &'static str {
    IT_WEEKDAYS[d.weekday().num_days_from_monday() as usize]
}

// ---------- strings ----------
/// `str.slice(0, n)` on characters
pub fn take(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}
/// last `n` characters
pub fn tail(s: &str, n: usize) -> String {
    let c = s.chars().count();
    s.chars().skip(c.saturating_sub(n)).collect()
}
pub fn short_hash(s: &str) -> String {
    // FNV-1a, enough to name a pipe
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:012x}", h & 0xffff_ffff_ffff)
}
pub fn html_esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            _ => o.push(c),
        }
    }
    o
}
/// encodeURIComponent
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b'!').remove(b'~').remove(b'*').remove(b'\'').remove(b'(').remove(b')');
/// encodeURI
const URI: &AsciiSet = &COMPONENT.remove(b';').remove(b',').remove(b'/').remove(b'?').remove(b':').remove(b'@').remove(b'&').remove(b'=').remove(b'+').remove(b'$').remove(b'#');
pub fn encode_component(s: &str) -> String {
    utf8_percent_encode(s, COMPONENT).to_string()
}
pub fn encode_uri(s: &str) -> String {
    utf8_percent_encode(s, URI).to_string()
}
/// `localeCompare(b, 'it', { numeric: true })`, close enough: case-insensitive, digits compared as numbers.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return a.cmp(b),
            (None, _) => return Ordering::Less,
            (_, None) => return Ordering::Greater,
            (Some(c), Some(d)) if c.is_ascii_digit() && d.is_ascii_digit() => {
                let mut n1 = String::new();
                while let Some(c) = x.peek().copied().filter(char::is_ascii_digit) {
                    n1.push(c);
                    x.next();
                }
                let mut n2 = String::new();
                while let Some(d) = y.peek().copied().filter(char::is_ascii_digit) {
                    n2.push(d);
                    y.next();
                }
                let (t1, t2) = (n1.trim_start_matches('0'), n2.trim_start_matches('0'));
                let o = t1.len().cmp(&t2.len()).then_with(|| t1.cmp(t2));
                if o != Ordering::Equal {
                    return o;
                }
            }
            (Some(c), Some(d)) => {
                let (lc, ld) = (fold(c), fold(d));
                if lc != ld {
                    return lc.cmp(&ld);
                }
                x.next();
                y.next();
            }
        }
    }
}
fn fold(c: char) -> char {
    let c = c.to_lowercase().next().unwrap_or(c);
    match c {
        'à' | 'á' | 'â' | 'ä' => 'a',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ò' | 'ó' | 'ô' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        _ => c,
    }
}

// ---------- files ----------
/// Write through a temp file + rename, so readers never see a half-written file.
pub fn write_atomic(p: &Path, data: impl AsRef<[u8]>) -> Result<()> {
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d)?;
    }
    let mut tmp = p.as_os_str().to_owned();
    tmp.push(".tmp");
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, p)?;
    Ok(())
}
pub fn write_json(p: &Path, v: &Value) -> Result<()> {
    write_atomic(p, serde_json::to_string_pretty(v)?)
}
pub fn read_json(p: &Path) -> Option<Value> {
    std::fs::read(p).ok().and_then(|b| serde_json::from_slice(&b).ok())
}
pub fn is_dir(p: &Path) -> bool {
    p.is_dir()
}
pub fn mtime_ms(m: &std::fs::Metadata) -> f64 {
    m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}
/// path relative to `base`, with forward slashes
pub fn rel_slash(base: &Path, p: &Path) -> String {
    p.strip_prefix(base).unwrap_or(p).components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/")
}
