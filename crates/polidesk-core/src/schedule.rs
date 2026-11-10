//! Parser of the textual timetable of the Politecnico ("Orario delle lezioni", Servizi Online).
//!
//! Rust port of polimi-schedule-js by bebora — https://github.com/bebora/polimi-schedule-js
//! MIT License, Copyright (c) 2019 bebora. Same logic and regexes as the original, including the
//! stateful behaviour of its global regexes (`lastIndex`), so results match the JavaScript version.
use anyhow::{anyhow, bail, Result};
use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike, Utc};
use chrono_tz::{Europe::Rome, Tz};
use fancy_regex::{Captures, Regex};
use serde_json::{json, Value};
use std::cell::Cell;
use std::sync::LazyLock;

type Dt = DateTime<Tz>;

const WEEKDAYS: [(&str, u32); 14] = [
    ("Domenica", 7), ("Lunedì", 1), ("Martedì", 2), ("Mercoledì", 3), ("Giovedì", 4), ("Venerdì", 5), ("Sabato", 6),
    ("Sunday", 7), ("Monday", 1), ("Tuesday", 2), ("Wednesday", 3), ("Thursday", 4), ("Friday", 5), ("Saturday", 6),
];
fn weekday(s: &str) -> Option<u32> {
    WEEKDAYS.iter().find(|(k, _)| *k == s).map(|(_, v)| *v)
}
fn month(s: &str) -> Option<u32> {
    Some(match s {
        "jan" | "gen" => 1, "feb" => 2, "mar" => 3, "apr" => 4, "may" | "mag" => 5, "jun" | "giu" => 6,
        "jul" | "lug" => 7, "aug" | "ago" => 8, "sep" | "set" => 9, "oct" | "ott" => 10, "nov" => 11, "dec" | "dic" => 12,
        _ => return None,
    })
}
const ACCEPTABLE_START: [u32; 6] = [2, 3, 4, 9, 10, 11];
const ACCEPTABLE_END: [u32; 7] = [4, 5, 6, 10, 11, 12, 1];
fn language(lesson_type: &str) -> &'static str {
    match lesson_type {
        "Lezione" | "Esercitazione" | "Laboratorio informatico" | "Laboratorio" => "it",
        _ => "en",
    }
}

const AUIC_DATE: &str = r"\d{2}-[a-zA-Z]{3}-\d{4}";
fn unacceptable_title_words() -> String {
    let wd: Vec<&str> = WEEKDAYS.iter().map(|(k, _)| *k).collect();
    format!("{}|Virtual classroom|Aula virtuale|Inizio lezioni|Start of lessons|Lectures start|Lessons start|Fine lezioni|End of lessons*|Lectures end|Lessons end|Semester:|Semestre:|Period:|Periodo:|{AUIC_DATE}|\\(|\\)", wd.join("|"))
}
static TITLE_SRC: LazyLock<String> = LazyLock::new(|| {
    format!(r"^(?:\s*(\d{{6}}) - )?((?!{})[^\s].+?)(?:\s*\(\s*(?:Docente|Professor|Lecturer|Teacher):(.*)\)|$)", unacceptable_title_words())
});
fn re(src: &str) -> Regex {
    Regex::new(src).expect("regex")
}

// ---------- JavaScript regex semantics (lastIndex in UTF-16 units) ----------
fn u16_to_byte(s: &str, u: usize) -> Option<usize> {
    let mut n = 0;
    for (i, c) in s.char_indices() {
        if n >= u {
            return Some(i);
        }
        n += c.len_utf16();
    }
    (n >= u).then_some(s.len())
}
fn byte_to_u16(s: &str, b: usize) -> usize {
    s[..b].chars().map(char::len_utf16).sum()
}
/// A regex with the `g` flag: `test()` and `matchAll()` start from `lastIndex` like in JavaScript.
struct GlobalRe {
    re: Regex,
    last: Cell<usize>,
}
impl GlobalRe {
    fn new(src: &str) -> Self {
        GlobalRe { re: re(src), last: Cell::new(0) }
    }
    fn test(&self, s: &str) -> bool {
        let Some(start) = u16_to_byte(s, self.last.get()) else {
            self.last.set(0);
            return false;
        };
        match self.re.captures_from_pos(s, start).ok().flatten() {
            Some(c) => {
                self.last.set(byte_to_u16(s, c.get(0).unwrap().end()));
                true
            }
            None => {
                self.last.set(0);
                false
            }
        }
    }
    /// `[...s.matchAll(re)]`: copies lastIndex, leaves this regex untouched.
    fn match_all<'t>(&self, s: &'t str) -> Vec<Captures<'t>> {
        let Some(mut pos) = u16_to_byte(s, self.last.get()) else { return vec![] };
        let mut out = vec![];
        while pos <= s.len() {
            let Some(c) = self.re.captures_from_pos(s, pos).ok().flatten() else { break };
            let m = c.get(0).unwrap();
            pos = if m.end() == m.start() { m.end() + s[m.end()..].chars().next().map(char::len_utf8).unwrap_or(1) } else { m.end() };
            out.push(c);
        }
        out
    }
    /// `s.replace(re, f)` with the g flag (resets lastIndex to 0).
    fn replace_all(&self, s: &str, f: impl Fn(&Captures) -> String) -> String {
        self.last.set(0);
        replace_all(&self.re, s, f)
    }
}
fn replace_all(r: &Regex, s: &str, f: impl Fn(&Captures) -> String) -> String {
    let mut out = String::new();
    let mut last = 0;
    let mut pos = 0;
    while pos <= s.len() {
        let Some(c) = r.captures_from_pos(s, pos).ok().flatten() else { break };
        let m = c.get(0).unwrap();
        out.push_str(&s[last..m.start()]);
        out.push_str(&f(&c));
        last = m.end();
        pos = if m.end() == m.start() { m.end() + s[m.end()..].chars().next().map(char::len_utf8).unwrap_or(1) } else { m.end() };
    }
    out.push_str(&s[last..]);
    out
}
/// `s.split(re)` with capturing groups (they are spliced into the result, None = undefined).
fn js_split(r: &Regex, s: &str) -> Vec<Option<String>> {
    let mut out = vec![];
    let mut p = 0;
    let mut pos = 0;
    while pos < s.len() {
        let Some(c) = r.captures_from_pos(s, pos).ok().flatten() else { break };
        let m = c.get(0).unwrap();
        if m.end() == p || m.start() >= s.len() {
            pos = m.start() + s[m.start()..].chars().next().map(char::len_utf8).unwrap_or(1);
            continue;
        }
        out.push(Some(s[p..m.start()].to_string()));
        for i in 1..c.len() {
            out.push(c.get(i).map(|x| x.as_str().to_string()));
        }
        p = m.end();
        pos = m.end();
    }
    out.push(Some(s[p..].to_string()));
    out
}
fn g<'a>(c: &'a Captures, i: usize) -> Option<&'a str> {
    c.get(i).map(|m| m.as_str())
}
fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}
fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

// ---------- dates (luxon semantics, zone Europe/Rome) ----------
fn rome(y: i32, m: u32, d: u32, h: u32, mi: u32) -> Option<Dt> {
    let nd = NaiveDate::from_ymd_opt(y, m, d)?;
    Rome.from_local_datetime(&nd.and_hms_opt(h, mi, 0)?).earliest()
}
/// `dt.set({ day })` with overflow (luxon normalizes like Date.UTC)
fn with_day(dt: &Dt, day: i64) -> Dt {
    let nd = dt.date_naive() + Duration::days(day - dt.day() as i64);
    Rome.from_local_datetime(&nd.and_time(dt.time())).earliest().unwrap_or(*dt)
}
fn with_hm(dt: &Dt, h: i64, m: i64) -> Dt {
    let nd = dt.date_naive().and_hms_opt(0, 0, 0).unwrap() + Duration::minutes(h * 60 + m);
    Rome.from_local_datetime(&nd).earliest().unwrap_or(*dt)
}
fn utc_rule(dt: &Dt) -> String {
    dt.with_timezone(&Utc).format("%Y%m%dT%H%M%SZ").to_string()
}
fn local_rule(dt: &Dt) -> String {
    dt.format("%Y%m%dT%H%M%S").to_string()
}
/// luxon toISO(): 2026-09-15T12:15:00.000+02:00
pub fn iso_offset<T: TimeZone>(dt: &DateTime<T>) -> String
where
    T::Offset: std::fmt::Display,
{
    dt.format("%Y-%m-%dT%H:%M:%S%.3f%:z").to_string()
}
/// "01-ott-2020" → noon of that day in Rome
fn date_from_text(text: Option<&str>) -> Result<Dt> {
    let text = text.ok_or_else(|| anyhow!("Cannot read properties of undefined (reading 'split')"))?;
    let p: Vec<&str> = text.split('-').collect();
    let m = p.get(1).and_then(|x| month(&x.to_lowercase())).ok_or_else(|| anyhow!("Invalid month in: {text}"))?;
    let y = p.get(2).map(|x| leading_int(x)).unwrap_or(0) as i32;
    let d = leading_int(p[0]);
    rome(y, m, d as u32, 12, 0).ok_or_else(|| anyhow!("Invalid date: {text}"))
}
fn leading_int(s: &str) -> i64 {
    let t = s.trim_start();
    let d: String = t.chars().take_while(|c| c.is_ascii_digit()).collect();
    d.parse().unwrap_or(0)
}

#[derive(Clone, Debug)]
pub struct Event {
    pub summary: String,
    pub start: Dt,
    pub end: Dt,
    pub location: Option<String>,
    pub description: String,
    pub rrule: Option<String>,
    pub rdate: Option<String>,
}
impl Event {
    pub fn to_json(&self, dtstamp: &str) -> Value {
        let mut o = json!({ "summary": self.summary, "start": iso_offset(&self.start), "end": iso_offset(&self.end), "dtstamp": dtstamp });
        if let Some(l) = &self.location {
            o["location"] = json!(l);
        }
        if let Some(r) = &self.rrule {
            o["rrule"] = json!(r);
        }
        o["description"] = json!(self.description);
        if let Some(r) = &self.rdate {
            o["rdate"] = json!(r);
        }
        o
    }
}

struct Parser {
    title: GlobalRe,
}

fn professor_string(lesson_type: Option<&str>, names: &[String]) -> &'static str {
    let lang = lesson_type.map(language).unwrap_or("en");
    match (names.len(), lang) {
        (0, _) => "",
        (1, "it") => "Docente:",
        (_, "it") => "Docenti:",
        (1, _) => "Professor:",
        _ => "Professors:",
    }
}
fn description(lesson_type: Option<&str>, names: &[String]) -> String {
    format!("{}{}\n{}", lesson_type.map(|t| format!("{t}\n")).unwrap_or_default(), professor_string(lesson_type, names), names.join("\n"))
}

impl Parser {
    fn professors(&self, course: &str, titles: &[Captures]) -> Vec<String> {
        static VC: LazyLock<Regex> = LazyLock::new(|| re(r"(?m)^\s*(?:Aula virtuale|Virtual classroom)\s*-\s*(.*)$"));
        let mut names: Vec<String> = titles.iter().filter_map(|t| g(t, 3)).map(|s| js_trim(s).to_string()).collect();
        let mut pos = 0;
        while let Some(c) = VC.captures_from_pos(course, pos).ok().flatten() {
            names.push(js_trim(g(&c, 1).unwrap_or("")).to_string());
            pos = c.get(0).unwrap().end().max(pos + 1);
        }
        let mut seen = std::collections::HashSet::new();
        names.retain(|n| seen.insert(n.clone()));
        names
    }

    fn parse_auic(&self, course: &str, names: &[String], course_name: &str) -> Result<Vec<Event>> {
        static TL: LazyLock<Regex> = LazyLock::new(|| re(r"(?im)^\s*([^\s]*) (?:dalle|from) (\d{2}):(\d{2}) (?:alle|to) (\d{2}):(\d{2})(?:,\s*)?(.+?(?=\sin\s|\sClassroom\s|\sAula\s))?(?: in (?:the)?\s*(?:aula|classroom|lecture theatre))*\s*(.*)$"));
        static VALID: LazyLock<Regex> = LazyLock::new(|| re(AUIC_DATE));
        let mut parts = js_split(&TL, course);
        parts.remove(0); // course heading
        let n = parts.len() / 8;
        let mut events = vec![];
        for i in 0..n {
            let at = |k: usize| parts[i * 8 + k].clone();
            let num = |k: usize| at(k).map(|x| leading_int(&x)).unwrap_or(0);
            let lesson_type = capitalize(&at(5).ok_or_else(|| anyhow!("Cannot read properties of undefined (reading '0')"))?);
            let location = at(6);
            let dates_txt = at(7).unwrap_or_default();
            let mut dates: Vec<&str> = js_trim(dates_txt.split("\n\n").next().unwrap_or("")).split('\n').filter(|l| VALID.is_match(l).unwrap_or(false)).collect();
            let first = if dates.is_empty() { None } else { Some(dates.remove(0)) };
            let partial = date_from_text(first)?;
            let first_day = with_hm(&partial, num(1), num(2));
            let first_end = with_hm(&partial, num(3), num(4));
            let rdate = if dates.is_empty() {
                None
            } else {
                let mut v = vec![];
                for d in dates {
                    let x = date_from_text(Some(d))?;
                    v.push(utc_rule(&with_hm(&x, first_day.hour() as i64, first_day.minute() as i64)));
                }
                Some(v.join(","))
            };
            events.push(Event { summary: course_name.into(), start: first_day, end: first_end, location, description: description(Some(&lesson_type), names), rrule: None, rdate });
        }
        Ok(events)
    }

    fn parse_iii(&self, course: &str, dates_re: &GlobalRe, names: &[String], course_name: &str) -> Result<Vec<Event>> {
        dates_re.last.set(0);
        let groups = dates_re.match_all(course);
        if groups.len() > 1 {
            let mut dates_defined = false;
            let mut subs: Vec<String> = vec![];
            let mut temp = String::new();
            for row in course.split('\n') {
                if self.title.test(row) {
                    let t = js_trim(&temp).to_string();
                    if !t.is_empty() {
                        subs.push(t);
                    }
                    temp = row.to_string();
                    dates_defined = false;
                } else if dates_re.test(row) {
                    if !dates_defined {
                        dates_defined = true;
                        temp += &format!("\n{row}");
                    }
                } else {
                    temp += &format!("\n{row}");
                }
            }
            let t = js_trim(&temp).to_string();
            if !t.is_empty() {
                subs.push(t);
            }
            let head = self.parse_course(subs.first().map(String::as_str).unwrap_or(""), Some(names.to_vec()), None);
            let follow = self.parse_course(&subs.get(1..).map(|s| s.join("\n")).unwrap_or_default(), Some(names.to_vec()), None);
            let mut data = head.0;
            data.extend(follow.0);
            let err = head.1.or(follow.1);
            return match err {
                Some(e) => Err(ParseErr(data, e).into()),
                None => Ok(data),
            };
        }
        let Some(m) = groups.first() else { return Ok(vec![]) };
        static COMP: LazyLock<Regex> = LazyLock::new(|| re(r"(\d{2})/(\d{2})/(\d{4})"));
        let comps = |s: &str| -> Option<(u32, u32, i32)> {
            let c = COMP.captures(s).ok().flatten()?;
            Some((g(&c, 1)?.parse().ok()?, g(&c, 2)?.parse().ok()?, g(&c, 3)?.parse().ok()?))
        };
        let (s2, s3) = (g(m, 2).unwrap_or(""), g(m, 3).unwrap_or(""));
        let (Some(sc), Some(ec)) = (comps(s2), comps(s3)) else { bail!("unparsable") };
        let num = |c: (u32, u32, i32)| format!("{:04}{:02}{:02}", c.2, c.1, c.0).parse::<i64>().unwrap_or(0);
        let dd_mm = !(!ACCEPTABLE_START.contains(&sc.1) || !ACCEPTABLE_END.contains(&ec.1) || sc.1 > 12 || ec.1 > 12 || num(sc) > num(ec));
        let mk = |c: (u32, u32, i32)| if dd_mm { rome(c.2, c.1, c.0, 0, 0) } else { rome(c.2, c.0, c.1, 0, 0) };
        let (Some(start), Some(end)) = (mk(sc), mk(ec)) else { bail!("unparsable") };
        if start > end {
            bail!("Start is unexpectedly greater than End ({} > {})", iso_offset(&start), iso_offset(&end));
        }
        static DAYS: LazyLock<Regex> = LazyLock::new(|| re(r"\n[^\n]+\n?([\s\S]*)"));
        static TIME: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)([^\s]*) (?:dalle|from) (\d+)[:.](\d+)\s?(?P<startMidday>(?:[ap])\.?m\.?)? (?:alle|to) (\d+)[:.](\d+)\s?(?P<endMidday>(?:[ap])\.?m\.?)?"));
        static NOROOM: LazyLock<Regex> = LazyLock::new(|| re(r".*? (?:Aula al momento non disponibile|Classroom not available yet).*"));
        static ROOM: LazyLock<Regex> = LazyLock::new(|| re(r"\d(?:\s*(?:am|pm))?(,\s*(.+))?\s+in\s+(?:aula|classroom|lecture theatre|the classroom|the|room) (.*)"));
        static INACC: LazyLock<Regex> = LazyLock::new(|| re(r",\s*(?:classroom lesson)?\s*(.*)"));
        let mut events = vec![];
        let Some(cd) = DAYS.captures(course).ok().flatten() else { return Ok(events) };
        let rest = g(&cd, 1).unwrap_or("");
        if rest.is_empty() {
            return Ok(events);
        }
        let block = js_trim(rest).split("\n\n").next().unwrap_or("").to_string();
        for j in block.split('\n') {
            let Some(t) = TIME.captures(j).ok().flatten() else { continue };
            let Some(wd) = weekday(g(&t, 1).unwrap_or("")) else { continue };
            let sw = start.weekday().number_from_monday();
            let mut first_day = if wd < sw { with_day(&start, start.day() as i64 - sw as i64 + 7 + wd as i64) } else { with_day(&start, start.day() as i64 - sw as i64 + wd as i64) };
            let pm = |name: &str| t.name(name).map(|m| m.as_str().starts_with('p')).unwrap_or(false);
            first_day = with_hm(&first_day, leading_int(g(&t, 2).unwrap_or("0")) + if pm("startMidday") { 12 } else { 0 }, leading_int(g(&t, 3).unwrap_or("0")));
            let ew = end.weekday().number_from_monday();
            let mut last_day = if wd <= ew { with_day(&end, end.day() as i64 - ew as i64 + wd as i64) } else { with_day(&end, end.day() as i64 - ew as i64 - 7 + wd as i64) };
            last_day = with_hm(&last_day, first_day.hour() as i64, first_day.minute() as i64);
            if first_day > last_day {
                return Err(ParseErr(events, format!("First day is unexpectedly greater than Last day ({} > {})", iso_offset(&first_day), iso_offset(&last_day))).into());
            }
            let first_end = with_hm(&first_day, leading_int(g(&t, 5).unwrap_or("0")) + if pm("endMidday") { 12 } else { 0 }, leading_int(g(&t, 6).unwrap_or("0")));
            let (mut location, mut lesson_type): (Option<String>, Option<String>) = (None, None);
            if !NOROOM.is_match(j).unwrap_or(false) {
                match ROOM.captures(j).ok().flatten() {
                    None => {
                        if let Some(r) = INACC.captures(j).ok().flatten() {
                            lesson_type = Some("Lesson".into());
                            location = g(&r, 1).map(String::from);
                        }
                    }
                    Some(r) => {
                        if let Some(lt) = g(&r, 2) {
                            lesson_type = Some(capitalize(lt));
                        }
                        location = g(&r, 3).map(String::from);
                    }
                }
            }
            events.push(Event {
                summary: course_name.into(),
                start: first_day,
                end: first_end,
                location,
                description: description(lesson_type.as_deref(), names),
                rrule: Some(format!("FREQ=WEEKLY;UNTIL={}", utc_rule(&last_day))),
                rdate: None,
            });
        }
        Ok(events)
    }

    /// Returns (events, error)
    fn parse_course(&self, course: &str, upper: Option<Vec<String>>, sub_sep: Option<&str>) -> (Vec<Event>, Option<String>) {
        let titles = self.title.match_all(course);
        if titles.is_empty() {
            return (vec![], None);
        }
        let mut names = self.professors(course, &titles);
        if names.is_empty() {
            if let Some(u) = upper {
                names = u;
            }
        }
        if let Some(sep) = sub_sep {
            if titles.len() > 1 && course.contains(sep) {
                let mut inner = vec![];
                for whole in course.split(sep) {
                    let (d, e) = self.parse_course(js_trim(whole), Some(names.clone()), None);
                    inner.extend(d);
                    if e.is_some() {
                        return (inner, e);
                    }
                }
                return (inner, None);
            }
        }
        static NOLESSON: LazyLock<Regex> = LazyLock::new(|| re(r"\s*(?:L'orario non è stato definito|The schedule has not been defined)"));
        static NOSCHED: LazyLock<Regex> = LazyLock::new(|| re(r"\s*(?:Nessun orario definito|No timetable defined)"));
        if NOLESSON.is_match(course).unwrap_or(false) || NOSCHED.is_match(course).unwrap_or(false) {
            return (vec![], None);
        }
        let course_name = g(titles.last().unwrap(), 2).unwrap_or("").to_string();
        drop(titles);
        let dates_re = GlobalRe::new(r"(1|2|A|Annual(?:e*))?\s*(?:Inizio lezioni|Start of lessons|Lectures start|Lessons start): (\d{2}/\d{2}/\d{4})\s*(?:Fine lezioni|End of lessons*|Lectures end|Lessons end): (\d{2}/\d{2}/\d{4})");
        let r = if !dates_re.test(course) { self.parse_auic(course, &names, &course_name) } else { self.parse_iii(course, &dates_re, &names, &course_name) };
        match r {
            Ok(d) => (d, None),
            Err(e) => match e.downcast::<ParseErr>() {
                Ok(pe) => (pe.0, Some(pe.1)),
                Err(e) => (vec![], Some(format!("__throw__{e}"))),
            },
        }
    }

    fn guess_newlines(&self, text: &str, sep: &str) -> String {
        if !text.contains(sep) {
            self.title.replace_all(text, |c| format!("\n{}", c.get(0).unwrap().as_str()))
        } else {
            text.to_string()
        }
    }

    fn preprocess(&self, input: &str) -> String {
        static COLLAPSED: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(?P<pre>\S)(?P<auicDate>({AUIC_DATE})+)")));
        static WDAYS: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(\S)({})", WEEKDAYS.iter().map(|(k, _)| *k).collect::<Vec<_>>().join("|"))));
        static SEM: LazyLock<Regex> = LazyLock::new(|| re(&format!(r"(?m)(?P<titlePart>{})(?P<doubleNewline>\n\n)(?P<semester>Semester|Semestre)", TITLE_SRC.as_str())));
        let t = input.replace("\n)", ")").replace('\u{00A0}', " ");
        let t = replace_all(&COLLAPSED, &t, |c| {
            let d: Vec<char> = c.name("auicDate").unwrap().as_str().chars().collect();
            let parts: Vec<String> = d.chunks(11).filter(|x| x.len() == 11).map(|x| x.iter().collect()).collect();
            format!("{}\n{}", c.name("pre").unwrap().as_str(), parts.join("\n"))
        });
        let t = replace_all(&WDAYS, &t, |c| format!("{}\n{}", g(c, 1).unwrap(), g(c, 2).unwrap()));
        let t = replace_all(&SEM, &t, |c| format!("{}\n{}", c.name("titlePart").unwrap().as_str(), c.name("semester").unwrap().as_str()));
        let adjusted = adjust_parentheses(js_trim(&t));
        js_trim(&self.guess_newlines(&adjusted, "\n\n")).to_string()
    }

    fn parse_text(&self, all: &str, first_try: bool) -> (Vec<Event>, Option<String>) {
        let pre = self.preprocess(all);
        let sep = if pre.contains("\n\n\n\n") { "\n\n\n\n" } else { "\n\n\n" };
        let mut events = vec![];
        for whole in pre.split(sep) {
            let (d, e) = self.parse_course(js_trim(whole), None, Some(&sep[..sep.len() - 1]));
            events.extend(d);
            if let Some(e) = e {
                if let Some(msg) = e.strip_prefix("__throw__") {
                    return (vec![], Some(msg.to_string())); // an exception: JS catches it in parseText
                }
                return (events, Some(e));
            }
        }
        if events.is_empty() && !pre.is_empty() {
            if first_try {
                let again = self.guess_newlines(&pre, "\n\n\n");
                return self.parse_text(&again, false);
            }
            return (vec![], Some("No courses detected".into()));
        }
        (events, None)
    }
}

#[derive(Debug)]
struct ParseErr(Vec<Event>, String);
impl std::fmt::Display for ParseErr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.1)
    }
}
impl std::error::Error for ParseErr {}

fn adjust_parentheses(text: &str) -> String {
    let mut out: Vec<String> = vec![];
    let mut builder = String::new();
    let mut extra: i64 = 0;
    for line in text.split('\n') {
        let open = line.matches('(').count() as i64;
        let close = line.matches(')').count() as i64;
        if extra > 0 {
            extra += open - close;
            builder += &format!(" {line}");
            if extra == 0 {
                out.push(std::mem::take(&mut builder));
            }
        } else {
            extra += open - close;
            if extra == 0 {
                out.push(line.to_string());
            } else {
                builder = line.to_string();
            }
        }
    }
    if !builder.is_empty() {
        out.push(format!("{builder}{}", ")".repeat(extra.max(0) as usize)));
    }
    out.join("\n")
}

/// Parse the whole textual timetable → (events, error)
pub fn parse_text(text: &str) -> (Vec<Event>, Option<String>) {
    let p = Parser { title: GlobalRe::new(&format!("(?m){}", TITLE_SRC.as_str())) };
    p.parse_text(text, true)
}

const VTIMEZONE: &str = "\r\nX-WR-TIMEZONE:Europe/Rome\r\nBEGIN:VTIMEZONE\r\nTZID:Europe/Rome\r\nX-LIC-LOCATION:Europe/Rome\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nTZNAME:CEST\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nTZNAME:CET\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n";

fn ics_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace(';', "\\;").replace(',', "\\,").replace('\n', "\\n")
}
fn fold(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    if chars.len() <= 75 {
        return line.to_string();
    }
    let mut out: String = chars[..75].iter().collect();
    for c in chars[75..].chunks(74) {
        out.push_str("\r\n ");
        out.extend(c);
    }
    out
}
/// iCalendar text for the events (Europe/Rome times, with VTIMEZONE).
pub fn to_icalendar(events: &[Event]) -> String {
    let now = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let mut s = String::from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:bebora@github");
    s.push_str(VTIMEZONE);
    for e in events {
        let mut lines = vec![
            "BEGIN:VEVENT".to_string(),
            format!("SUMMARY:{}", ics_escape(&e.summary)),
            format!("DTSTART;TZID=Europe/Rome:{}", local_rule(&e.start)),
            format!("DTEND;TZID=Europe/Rome:{}", local_rule(&e.end)),
            format!("DTSTAMP:{now}"),
            format!("UID:{}", uuid::Uuid::new_v4()),
        ];
        if let Some(l) = &e.location {
            lines.push(format!("LOCATION:{}", ics_escape(l)));
        }
        lines.push(format!("DESCRIPTION:{}", ics_escape(&e.description)));
        if let Some(r) = &e.rrule {
            lines.push(format!("RRULE:{r}"));
        }
        if let Some(r) = &e.rdate {
            lines.push(format!("RDATE:{r}"));
        }
        lines.push("END:VEVENT".into());
        for l in lines {
            s.push_str(&fold(&l));
            s.push_str("\r\n");
        }
    }
    s.push_str("END:VCALENDAR\r\n");
    s
}
