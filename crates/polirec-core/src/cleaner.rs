//! Transcript cleanup: fillers (ehm, mmm, uh…), stutters, Whisper hallucinations on silence.
//! Works on .txt and .srt in place (keeps an untouched copy in .orig/ the first time).
use fancy_regex::Regex as FRegex;
use regex::Regex;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::LazyLock;

static FILLER: LazyLock<FRegex> = LazyLock::new(|| {
    let f = ["e+h+m*", "e+m+", "u+h+m*", "u+m+", "m+h*m+", "h+m+", "a+h+", "o+h+", "e+h+", "u+h+", "mh+", "hm+"].join("|");
    FRegex::new(&format!(r"(?i)(^|[\s,.;:!?…-])(?:{f})(?=[\s,.;:!?…-]|$)[,.…]*")).unwrap()
});
static SP_PUNCT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+([,.;:!?])").unwrap());
static PUNCT_RUN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"([,;:])(?:\s*[,;:])+").unwrap());
static MULTI_SP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s{2,}").unwrap());
static LEAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[\s,;:.]+").unwrap());

// classic Whisper hallucinations on silence / music
static HALLUCINATIONS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)sottotitoli (creati|a cura) (dalla|di).*$",
        r"(?i)sottotitoli e revisione.*$",
        r"(?i)^grazie a tutti( per la visione)?[.!]*$",
        r"(?i)^thank(s| you) (for watching|so much for watching)[.!]*$",
        r"(?i)^(please )?subscribe.*$",
        r"(?i)amara\.org",
        r"(?i)^\s*\[(musica|music|applausi|applause|silenzio|silence|risate|laughter)\]\s*$",
        r"^\s*(♪|\.\.\.)+\s*$",
        r"^[\p{P}\s]+$",
    ]
    .iter()
    .map(|r| Regex::new(r).unwrap())
    .collect()
});

fn freplace(r: &FRegex, s: &str, rep: &str) -> String {
    r.replace_all(s, rep).into_owned()
}

pub fn clean_text(t: &str) -> String {
    let mut s = format!(" {t} ");
    for _ in 0..2 {
        s = freplace(&FILLER, &s, "$1");
    }
    s = remove_stutters(&s);
    s = SP_PUNCT.replace_all(&s, "$1").into_owned();
    s = PUNCT_RUN.replace_all(&s, "$1").into_owned();
    s = MULTI_SP.replace_all(&s, " ").into_owned();
    s = LEAD.replace(&s, "").trim().to_string();
    // capitalize first letter if we removed a leading filler
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// Stutters: "il il il modello" → "il modello". Same as the JS regex
/// `(?<!\p{L})(\p{L}{1,5})(?:[\s,]+\1)+(?!\p{L})` with the `iu` flags (case-insensitive backreference).
fn remove_stutters(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let is_l = |x: char| x.is_alphabetic();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < c.len() {
        if is_l(c[i]) && (i == 0 || !is_l(c[i - 1])) {
            let mut j = i;
            while j < c.len() && is_l(c[j]) {
                j += 1;
            }
            let word: String = c[i..j].iter().collect();
            if j - i <= 5 {
                let lw = word.to_lowercase();
                let mut end = j; // end of the last accepted repetition
                let mut k = j;
                loop {
                    let mut p = k;
                    while p < c.len() && (c[p].is_whitespace() || c[p] == ',') {
                        p += 1;
                    }
                    if p == k || p + (j - i) > c.len() {
                        break;
                    }
                    let cand: String = c[p..p + (j - i)].iter().collect();
                    let q = p + (j - i);
                    if cand.to_lowercase() != lw || (q < c.len() && is_l(c[q])) {
                        break;
                    }
                    end = q;
                    k = q;
                }
                if end > j {
                    out.push_str(&word);
                    i = end;
                    continue;
                }
            }
            out.push_str(&word);
            i = j;
            continue;
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

pub fn is_hallucination(line: &str) -> bool {
    let t = line.trim();
    t.is_empty() || HALLUCINATIONS.iter().any(|r| r.is_match(t))
}

#[derive(Clone, Debug)]
pub struct Seg {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

fn word_count(s: &str) -> usize {
    s.split_whitespace().count()
}

pub fn clean_segments(segs: Vec<Seg>) -> Vec<Seg> {
    // isolated 1–2 word fragments surrounded by silence are almost always hallucinations
    let n = segs.len();
    let mut kept: Vec<Seg> = vec![];
    for (i, sg) in segs.iter().enumerate() {
        if word_count(&sg.text) > 2 {
            kept.push(sg.clone());
            continue;
        }
        let gap_before = if i > 0 { sg.start - segs[i - 1].end } else { sg.start };
        let gap_after = if i + 1 < n { segs[i + 1].start - sg.end } else { 99.0 };
        if !(gap_before > 3.0 && gap_after > 3.0) && !(i < 3 && gap_after > 8.0) {
            kept.push(sg.clone());
        }
    }
    // short fragments before the lecture actually starts (mic noise, room chatter)
    let mut segs = kept;
    // JS: text.trim().split(/\s+/).length (an empty string counts as 1)
    if let Some(first_long) = segs.iter().position(|s| word_count(&s.text).max(1) > 2) {
        if first_long > 0 {
            let fs = segs[first_long].start;
            segs = segs.into_iter().enumerate().filter(|(i, s)| *i >= first_long || fs - s.end <= 5.0).map(|(_, s)| s).collect();
        }
    }
    let mut out = vec![];
    let mut prev = String::new();
    for sg in segs {
        let text = clean_text(&sg.text);
        if text.is_empty() || is_hallucination(&text) {
            continue;
        }
        // drop Whisper loops (same line repeated many times)
        if text.to_lowercase() == prev.to_lowercase() && word_count(&text) < 8 {
            continue;
        }
        prev = text.clone();
        out.push(Seg { text, ..sg });
    }
    out
}

// ---- SRT ----
pub fn parse_srt(text: &str) -> Vec<Seg> {
    crate::library::parse_srt_all(text).into_iter().map(|(start, end, text)| Seg { start, end, text }).collect()
}
fn to_ts(s: f64) -> String {
    let h = (s / 3600.0).floor();
    let m = (s % 3600.0 / 60.0).floor();
    let x = (s % 60.0).floor();
    let ms = ((s % 1.0) * 1000.0).round();
    format!("{:02}:{:02}:{:02},{:03}", h as i64, m as i64, x as i64, ms as i64)
}
pub fn write_srt(segs: &[Seg]) -> String {
    segs.iter().enumerate().map(|(i, s)| format!("{}\n{} --> {}\n{}\n", i + 1, to_ts(s.start), to_ts(s.end), s.text)).collect::<Vec<_>>().join("\n")
}
/// Readable text with paragraph breaks on long pauses (> 2.5 s).
pub fn paragraphs(segs: &[Seg]) -> String {
    let mut out = String::new();
    let mut prev_end = 0.0;
    for s in segs {
        if !out.is_empty() {
            out.push_str(if s.start - prev_end > 2.5 { "\n\n" } else { " " });
        }
        out.push_str(&s.text);
        prev_end = s.end;
    }
    out
}
/// `text.split(/(?<=[.!?])\s+/)`
pub fn split_sentences(t: &str) -> Vec<&str> {
    let mut out = vec![];
    let mut start = 0;
    let b = t.as_bytes();
    let mut i = 0;
    while i < t.len() {
        if i > 0 && matches!(b[i - 1], b'.' | b'!' | b'?') {
            let rest = &t[i..];
            let ws: usize = rest.chars().take_while(|c| c.is_whitespace()).map(char::len_utf8).sum();
            if ws > 0 {
                out.push(&t[start..i]);
                i += ws;
                start = i;
                continue;
            }
        }
        i += t[i..].chars().next().map(char::len_utf8).unwrap_or(1);
    }
    out.push(&t[start..]);
    out
}

/// Clean <stem>.srt / <stem>.txt in a transcripts folder. Returns {removedSegments, before, after}.
pub fn clean_transcript_files(dir: &Path, stem: &str) -> anyhow::Result<Value> {
    let srt = dir.join(format!("{stem}.srt"));
    let txt = dir.join(format!("{stem}.txt"));
    let orig = dir.join(".orig");
    let backup = |f: &Path| -> anyhow::Result<()> {
        if !f.exists() {
            return Ok(());
        }
        std::fs::create_dir_all(&orig)?;
        let b = orig.join(f.file_name().unwrap());
        if !b.exists() {
            std::fs::copy(f, b)?;
        }
        Ok(())
    };
    let chars = |s: &[Seg]| s.iter().map(|x| x.text.as_str()).collect::<Vec<_>>().join(" ").encode_utf16().count();
    if srt.exists() {
        backup(&srt)?;
        let segs = parse_srt(&std::fs::read_to_string(&srt)?);
        let before = chars(&segs);
        let n = segs.len();
        let cleaned = clean_segments(segs);
        std::fs::write(&srt, write_srt(&cleaned))?;
        if txt.exists() {
            backup(&txt)?;
            std::fs::write(&txt, paragraphs(&cleaned) + "\n")?;
        }
        Ok(json!({ "removedSegments": n - cleaned.len(), "before": before, "after": chars(&cleaned) }))
    } else if txt.exists() {
        backup(&txt)?;
        let t = std::fs::read_to_string(&txt)?;
        let c: Vec<String> = split_sentences(&t).into_iter().map(clean_text).filter(|x| !x.is_empty() && !is_hallucination(x)).collect();
        let c = c.join(" ");
        std::fs::write(&txt, format!("{c}\n"))?;
        Ok(json!({ "removedSegments": 0, "before": t.encode_utf16().count(), "after": c.encode_utf16().count() }))
    } else {
        Ok(json!({ "removedSegments": 0, "before": 0, "after": 0 }))
    }
}

/// Restore the original (uncleaned) files.
pub fn restore_original(dir: &Path, stem: &str) {
    for ext in ["srt", "txt"] {
        let b = dir.join(".orig").join(format!("{stem}.{ext}"));
        if b.exists() {
            let _ = std::fs::copy(&b, dir.join(format!("{stem}.{ext}")));
        }
    }
}

/// Dictation: also drops repeated short sentences and trailing "thank you"/"grazie" hallucinations.
pub fn clean_dictation(text: &str) -> String {
    static NONLETTER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^\p{L}\s]").unwrap());
    static BYE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(thank you|thanks|grazie( a tutti)?|bye|ciao)[.!]*$").unwrap());
    let ct = clean_text(text);
    let key = |s: &str| NONLETTER.replace_all(&s.to_lowercase(), "").trim().to_string();
    let mut out: Vec<String> = vec![];
    for s in split_sentences(&ct).into_iter().filter(|s| !s.is_empty()) {
        let k = key(s);
        if let Some(last) = out.last() {
            if !k.is_empty() && k == key(last) && k.split(' ').count() <= 5 {
                continue;
            }
        }
        out.push(s.to_string());
    }
    while out.len() > 1 && BYE.is_match(out.last().unwrap().trim()) {
        out.pop();
    }
    out.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fillers_and_stutters() {
        assert_eq!(clean_text("ehm allora il il modello, mmm, funziona"), "Allora il modello, funziona");
        assert_eq!(clean_text("Il il modello"), "Il modello");
        assert!(is_hallucination("Sottotitoli creati dalla comunità Amara.org"));
        assert_eq!(clean_dictation("Ciao. Ciao. Grazie."), "Ciao.");
    }
}
