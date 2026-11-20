//! Lesson timetable: Polimi "Orario delle lezioni" (parsed with `schedule`), pasted text, any .ics file/URL.
use crate::{net, paths, schedule, util};
use anyhow::{bail, Result};
use chrono::{DateTime, Datelike, Local, NaiveDate, TimeZone, Timelike, Utc, Weekday};
use regex::Regex;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::LazyLock;

pub const SERVICE: &str = "https://aunicalogin.polimi.it/aunicalogin/getservizio.xml?id_servizio=398";

fn file() -> PathBuf {
    paths::app_dir().join("timetable.json")
}
pub fn ics_path() -> PathBuf {
    paths::app_dir().join("orario.ics")
}
pub fn load() -> Value {
    let mut t = util::read_json(&file()).filter(Value::is_object).unwrap_or_else(|| json!({ "events": [], "extra": [], "updatedAt": null }));
    for k in ["events", "extra"] {
        if !t[k].is_array() {
            t[k] = json!([]);
        }
    }
    t
}
fn save(t: &Value) -> Result<()> {
    util::write_json(&file(), t)
}

/// Import the textual timetable (from the Servizi Online page or pasted by the student).
pub fn import_text(text: &str) -> Result<Value> {
    let (events, err) = schedule::parse_text(text);
    if events.is_empty() {
        if let Some(e) = err {
            bail!("Orario non riconosciuto: {e}");
        }
    }
    std::fs::write(ics_path(), schedule::to_icalendar(&events))?;
    let stamp = schedule::iso_offset(&Local::now());
    let mut t = load();
    t["events"] = json!(events.iter().map(|e| util::merge(&e.to_json(&stamp), &json!({ "source": "polimi" }))).collect::<Vec<_>>());
    t["updatedAt"] = json!(util::now_iso());
    save(&t)?;
    Ok(json!({ "count": events.len(), "ics": ics_path() }))
}

// ---- minimal .ics import (VEVENT with DTSTART/DTEND/SUMMARY/LOCATION/DESCRIPTION/RRULE) ----
fn ics_dt(v: &str) -> Option<String> {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?").unwrap());
    let m = RX.captures(v)?;
    let n = |i: usize| m.get(i).map(|x| x.as_str().parse::<u32>().unwrap_or(0)).unwrap_or(0);
    let d = NaiveDate::from_ymd_opt(n(1) as i32, n(2), n(3))?.and_hms_opt(n(4), n(5), n(6))?;
    let dt = if m.get(7).is_some() { Utc.from_utc_datetime(&d) } else { Local.from_local_datetime(&d).earliest()?.with_timezone(&Utc) };
    Some(util::iso(dt))
}
pub fn parse_ics_text(ics: &str, source: &str) -> Vec<Value> {
    static UNFOLD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\r?\n[ \t]").unwrap());
    let text = UNFOLD.replace_all(ics, "");
    let mut out = vec![];
    let mut cur: Option<Value> = None;
    let mut in_alarm = false;
    for l in text.split('\n').map(|l| l.trim_end_matches('\r')) {
        if l == "BEGIN:VEVENT" {
            cur = Some(json!({}));
        } else if l == "END:VEVENT" {
            if let Some(c) = cur.take() {
                if c.get("start").is_some() {
                    out.push(util::merge(&c, &json!({ "source": source })));
                }
            }
        } else if l == "BEGIN:VALARM" {
            in_alarm = true;
        } else if l == "END:VALARM" {
            in_alarm = false;
        } else if let (Some(c), false) = (cur.as_mut(), in_alarm) {
            let Some(i) = l.find(':') else { continue };
            let key = l[..i].split(';').next().unwrap_or("");
            let params = &l[..i];
            let val = l[i + 1..].replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";");
            match key {
                "DTSTART" => {
                    c["start"] = json!(ics_dt(&val));
                    if params.contains("VALUE=DATE") && !params.contains("VALUE=DATE-TIME") || val.trim().len() == 8 {
                        c["allDay"] = json!(true);
                    }
                }
                "UID" => c["uid"] = json!(val),
                "RECURRENCE-ID" => c["recurrenceId"] = json!(ics_dt(&val)),
                "STATUS" if val.trim().eq_ignore_ascii_case("CANCELLED") => c["cancelled"] = json!(true),
                "DTEND" => c["end"] = json!(ics_dt(&val)),
                "SUMMARY" => c["summary"] = json!(val),
                "LOCATION" => c["location"] = json!(val),
                "DESCRIPTION" => c["description"] = json!(val),
                "RRULE" => c["rrule"] = json!(val),
                "RDATE" => c["rdate"] = json!(val),
                "EXDATE" => {
                    let mut ex = util::str_list(c.get("exdate"));
                    ex.extend(val.split(',').filter_map(ics_dt));
                    c["exdate"] = json!(ex);
                }
                _ => {}
            }
            if c.get("start").map(Value::is_null).unwrap_or(false) {
                c.as_object_mut().unwrap().remove("start");
            }
        }
    }
    out
}

/// Import a calendar from a .ics file or an http(s)/webcal URL (e.g. a teacher's Google Calendar).
pub async fn import_ics(src: &str, name: Option<&str>) -> Result<usize> {
    let is_url = src.starts_with("http://") || src.starts_with("https://") || src.starts_with("webcal:");
    let name = name.map(String::from).unwrap_or_else(|| std::path::Path::new(src).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_else(|| src.to_string()));
    let text = if is_url {
        let url = if let Some(r) = src.strip_prefix("webcal:") { format!("https:{r}") } else { src.to_string() };
        net::client().get(url).send().await?.error_for_status()?.text().await?
    } else {
        std::fs::read_to_string(src)?
    };
    let evs = parse_ics_text(&text, &name);
    if evs.is_empty() {
        bail!("Nessun evento trovato nel calendario");
    }
    let n = evs.len();
    let mut t = load();
    let mut extra: Vec<Value> = t["extra"].as_array().cloned().unwrap_or_default().into_iter().filter(|e| util::s(e, "source") != name).collect();
    extra.extend(evs);
    t["extra"] = json!(extra);
    let mut feeds: Vec<Value> = t["feeds"].as_array().cloned().unwrap_or_default().into_iter().filter(|f| util::s(f, "src") != src).collect();
    if is_url {
        feeds.push(json!({ "src": src, "name": name }));
    }
    t["feeds"] = json!(feeds);
    save(&t)?;
    Ok(n)
}

fn rule_dates(s: &str) -> Vec<DateTime<Utc>> {
    s.split(',').filter_map(|x| ics_dt(x.trim()).and_then(|i| util::parse_date(&i))).collect()
}

/// Lessons (Servizi Online / pasted timetable) and imported .ics files within [from, to).
pub fn occurrences(from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<Value> {
    let t = load();
    let all: Vec<Value> = t["events"].as_array().into_iter().flatten().chain(t["extra"].as_array().into_iter().flatten()).cloned().collect();
    expand(&all, from, to)
}

fn weekday(code: &str) -> Option<Weekday> {
    Some(match code {
        "MO" => Weekday::Mon,
        "TU" => Weekday::Tue,
        "WE" => Weekday::Wed,
        "TH" => Weekday::Thu,
        "FR" => Weekday::Fri,
        "SA" => Weekday::Sat,
        "SU" => Weekday::Sun,
        _ => return None,
    })
}
fn days_in_month(d: NaiveDate) -> u32 {
    let (y, m) = if d.month() == 12 { (d.year() + 1, 1) } else { (d.year(), d.month() + 1) };
    NaiveDate::from_ymd_opt(y, m, 1).and_then(|n| n.pred_opt()).map(|n| n.day()).unwrap_or(28)
}

/// Expand recurring events (RRULE: DAILY, WEEKLY with BYDAY, MONTHLY by day or «2nd Monday», YEARLY;
/// INTERVAL, COUNT, UNTIL; EXDATE, RDATE; single occurrences moved or cancelled through RECURRENCE-ID)
/// into concrete occurrences overlapping [from, to). Wall-clock time is kept across DST changes.
pub fn expand(events: &[Value], from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<Value> {
    use std::collections::{HashMap, HashSet};
    static UNTIL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"UNTIL=(\d{8}(?:T\d{6}Z?)?)").unwrap());
    // occurrences replaced (moved or cancelled) by an override with the same UID
    let overridden: HashSet<(String, NaiveDate)> = events
        .iter()
        .filter_map(|e| Some((util::s(e, "uid").to_string(), util::parse_date(e["recurrenceId"].as_str()?)?.with_timezone(&Local).date_naive())))
        .filter(|(u, _)| !u.is_empty())
        .collect();
    let mut out = vec![];
    for e in events {
        if util::b(e, "cancelled") {
            continue;
        }
        let Some(s0) = util::parse_date(util::s(e, "start")) else { continue };
        let all_day = util::b(e, "allDay");
        let e0 = util::parse_date(util::s(e, "end")).unwrap_or(if all_day { s0 + chrono::Duration::days(1) } else { s0 });
        let dur = e0 - s0;
        let occ = |s: DateTime<Utc>| {
            json!({ "summary": e["summary"], "location": util::s(e, "location"), "description": util::s(e, "description"), "source": e["source"], "start": util::iso(s), "end": util::iso(s + dur), "allDay": all_day })
        };
        let overlaps = |s: DateTime<Utc>| s < to && s + dur.max(chrono::Duration::minutes(1)) > from;
        let rrule = e["rrule"].as_str().filter(|_| e.get("recurrenceId").is_none());
        if let Some(r) = rrule {
            let parts: HashMap<&str, &str> = r.split(';').filter_map(|kv| kv.split_once('=')).collect();
            let freq = parts.get("FREQ").copied().unwrap_or("WEEKLY");
            let interval = parts.get("INTERVAL").and_then(|x| x.parse::<i64>().ok()).unwrap_or(1).max(1);
            let count = parts.get("COUNT").and_then(|x| x.parse::<usize>().ok());
            let until = UNTIL.captures(r).and_then(|m| ics_dt(&m[1])).and_then(|u| util::parse_date(&u)).map(|u| if m_is_date(r) { u + chrono::Duration::days(1) } else { u + chrono::Duration::seconds(1) });
            let s0l = s0.with_timezone(&Local);
            let d0 = s0l.date_naive();
            // BYDAY: "MO,WE" (weekly) or "2MO", "-1FR" (monthly)
            let byday: Vec<(i32, Weekday)> = parts
                .get("BYDAY")
                .map(|b| {
                    b.split(',')
                        .filter_map(|x| {
                            let x = x.trim();
                            let (n, code) = x.split_at(x.len().saturating_sub(2));
                            Some((n.parse::<i32>().unwrap_or(0), weekday(code)?))
                        })
                        .collect()
                })
                .unwrap_or_default();
            let bymonthday: Vec<i32> = parts.get("BYMONTHDAY").map(|b| b.split(',').filter_map(|x| x.trim().parse().ok()).collect()).unwrap_or_default();
            let exdates: HashSet<NaiveDate> = util::str_list(e.get("exdate")).iter().filter_map(|d| util::parse_date(d)).map(|d| d.with_timezone(&Local).date_naive()).collect();
            let uid = util::s(e, "uid").to_string();
            let monday = |d: NaiveDate| d - chrono::Duration::days(d.weekday().num_days_from_monday() as i64);
            let matches = |d: NaiveDate| -> bool {
                match freq {
                    "DAILY" => (d - d0).num_days() % interval == 0,
                    "WEEKLY" => {
                        let days = if byday.is_empty() { vec![d0.weekday()] } else { byday.iter().map(|(_, w)| *w).collect() };
                        days.contains(&d.weekday()) && ((monday(d) - monday(d0)).num_days() / 7) % interval == 0
                    }
                    "MONTHLY" => {
                        let months = (d.year() - d0.year()) as i64 * 12 + d.month() as i64 - d0.month() as i64;
                        if months % interval != 0 {
                            return false;
                        }
                        if !byday.is_empty() {
                            byday.iter().any(|(n, w)| {
                                d.weekday() == *w && match *n {
                                    0 => true,
                                    n if n > 0 => ((d.day() - 1) / 7 + 1) as i32 == n,
                                    n => ((days_in_month(d) - d.day()) / 7 + 1) as i32 == -n,
                                }
                            })
                        } else if !bymonthday.is_empty() {
                            bymonthday.iter().any(|&m| if m > 0 { d.day() as i32 == m } else { (days_in_month(d) as i32 + m + 1) == d.day() as i32 })
                        } else {
                            d.day() == d0.day()
                        }
                    }
                    "YEARLY" => (d.year() - d0.year()) as i64 % interval == 0 && d.month() == d0.month() && d.day() == d0.day(),
                    _ => false,
                }
            };
            let last = until.map(|u| u.min(to)).unwrap_or(to).with_timezone(&Local).date_naive();
            let (mut d, mut n) = (d0, 0usize);
            for _ in 0..40_000 {
                if d > last {
                    break;
                }
                if d >= d0 && matches(d) {
                    n += 1;
                    if count.map(|c| n > c).unwrap_or(false) {
                        break;
                    }
                    let start = d.and_hms_opt(s0l.hour(), s0l.minute(), s0l.second()).and_then(|x| Local.from_local_datetime(&x).earliest()).map(|x| x.with_timezone(&Utc));
                    if let Some(st) = start {
                        if until.map(|u| st < u).unwrap_or(true) && overlaps(st) && !exdates.contains(&d) && !overridden.contains(&(uid.clone(), d)) {
                            out.push(occ(st));
                        }
                    }
                }
                d = match d.succ_opt() {
                    Some(x) => x,
                    None => break,
                };
            }
        } else if overlaps(s0) {
            out.push(occ(s0));
        }
        // extra single dates (AUIC timetables, RDATE in .ics)
        if let Some(rd) = e["rdate"].as_str() {
            for d in rule_dates(rd) {
                if overlaps(d) {
                    out.push(occ(d));
                }
            }
        }
    }
    out.sort_by(|a, b| util::s(a, "start").cmp(util::s(b, "start")));
    out
}
/// UNTIL given as a date (all-day series): it includes that whole day.
fn m_is_date(r: &str) -> bool {
    r.split(';').any(|kv| kv.strip_prefix("UNTIL=").map(|u| u.len() == 8).unwrap_or(false))
}

#[cfg(test)]
mod expand_tests {
    use super::*;
    fn at(s: &str) -> DateTime<Utc> {
        util::parse_date(s).unwrap()
    }
    fn evs(ics: &str) -> Vec<Value> {
        parse_ics_text(&format!("BEGIN:VCALENDAR\n{ics}\nEND:VCALENDAR"), "t")
    }
    #[test]
    fn rules() {
        // weekly on Mon and Wed, 4 times
        let e = evs("BEGIN:VEVENT\nUID:a\nDTSTART:20251103T090000Z\nDTEND:20251103T100000Z\nSUMMARY:Studio\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4\nBEGIN:VALARM\nDESCRIPTION:Reminder\nEND:VALARM\nEND:VEVENT");
        let o = expand(&e, at("2025-11-01T00:00:00Z"), at("2025-12-31T00:00:00Z"));
        assert_eq!(o.len(), 4);
        assert_eq!(util::s(&o[1], "start"), "2025-11-05T09:00:00.000Z");
        assert_eq!(util::s(&o[0], "description"), "");
        // daily every 2 days until a date, one exception moved
        let e = evs("BEGIN:VEVENT\nUID:b\nDTSTART:20251110T080000Z\nDTEND:20251110T083000Z\nSUMMARY:Corsa\nRRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20251116T235959Z\nEND:VEVENT\nBEGIN:VEVENT\nUID:b\nRECURRENCE-ID:20251112T080000Z\nDTSTART:20251112T180000Z\nDTEND:20251112T183000Z\nSUMMARY:Corsa spostata\nEND:VEVENT");
        let o = expand(&e, at("2025-11-01T00:00:00Z"), at("2025-12-01T00:00:00Z"));
        let starts: Vec<&str> = o.iter().map(|x| util::s(x, "start")).collect();
        assert_eq!(starts, ["2025-11-10T08:00:00.000Z", "2025-11-12T18:00:00.000Z", "2025-11-14T08:00:00.000Z", "2025-11-16T08:00:00.000Z"]);
        // monthly on the 2nd Tuesday, all-day
        let e = evs("BEGIN:VEVENT\nUID:c\nDTSTART;VALUE=DATE:20250909\nDTEND;VALUE=DATE:20250910\nSUMMARY:Consiglio\nRRULE:FREQ=MONTHLY;BYDAY=2TU\nEND:VEVENT");
        let o = expand(&e, at("2025-10-01T00:00:00Z"), at("2025-12-31T00:00:00Z"));
        assert_eq!(o.len(), 3);
        assert!(util::b(&o[0], "allDay"));
        assert!(util::s(&o[0], "start").starts_with("2025-10-1"));
        // cancelled event is skipped
        let e = evs("BEGIN:VEVENT\nUID:d\nDTSTART:20251120T100000Z\nSTATUS:CANCELLED\nSUMMARY:X\nEND:VEVENT");
        assert!(expand(&e, at("2025-11-01T00:00:00Z"), at("2025-12-01T00:00:00Z")).is_empty());
    }
}

/// Does a timetable event belong to this course? (fuzzy match on course name words)
pub fn match_course(summary: &str, course_fullname: &str) -> bool {
    static STRIP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(.*?\)|\[.*?\]|^\d+\s*-\s*").unwrap());
    let name = STRIP.replace_all(&course_fullname.to_uppercase(), "").trim().to_string();
    let s = summary.to_uppercase();
    if name.is_empty() || s.is_empty() {
        return false;
    }
    let words: Vec<&str> = name.split_whitespace().filter(|w| w.chars().count() > 3).collect();
    if words.is_empty() {
        return false;
    }
    let hit = words.iter().filter(|w| s.contains(*w)).count();
    hit as f64 / words.len() as f64 >= 0.6
}
/// Name used to match a course with the timetable.
pub fn course_fullname(course: &Value, manifest: &Value) -> String {
    let f = util::s(&manifest["course"], "fullname");
    if f.is_empty() { util::s(course, "name").to_string() } else { f.to_string() }
}
