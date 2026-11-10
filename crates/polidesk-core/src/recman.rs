//! RecMan ("Archivio registrazioni") — onlineservices.polimi.it/recman_frontend
use crate::browser::{self, done, Session};
use anyhow::{bail, Result};
use chromiumoxide::cdp::browser_protocol::network::EventRequestWillBeSent;
use futures_util::StreamExt;
use regex::Regex;
use serde_json::{json, Value};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

fn is_recman(u: &str) -> bool {
    u.contains("onlineservices.polimi.it/recman_frontend")
}

/// "04/11/2026 16:30" → "2026-11-04T16:30" (local wall time, as stored in the manifest)
pub fn iso_date(s: &str) -> Option<String> {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?").unwrap());
    let m = RX.captures(s)?;
    let n = |i: usize| m.get(i).map(|x| x.as_str().parse::<u32>().unwrap_or(0)).unwrap_or(0);
    let d = chrono::NaiveDate::from_ymd_opt(n(3) as i32, n(2), n(1))?.and_hms_opt(n(4), n(5), 0)?;
    Some(d.format("%Y-%m-%dT%H:%M").to_string())
}

const TABLE_JS: &str = r#"(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const tables = [...document.querySelectorAll('table')];
    let best = null;
    for (const t of tables) {
        const rows = [...t.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')];
        const headerIdx = rows.findIndex(r => /data registrazione|recording date|argomento|topic/i.test(r.innerText) && r.querySelectorAll('th,td').length >= 5);
        if (headerIdx === -1) continue;
        if (!best || rows.length > best.rows.length) best = { t, rows, headerIdx };
    }
    if (!best) return { error: 'tabella non trovata', title: document.title };
    const headers = [...best.rows[best.headerIdx].querySelectorAll('th,td')].map(c => norm(c.innerText).toLowerCase());
    const col = (...names) => headers.findIndex(h => names.some(n => h.includes(n)));
    const ix = {
        date: col('data registrazione', 'recording date', 'data'), course: col('corso', 'course'), type: col('forma didattica', 'teaching', 'tipo'),
        topic: col('argomento', 'topic', 'subject'), guests: col('ospiti', 'guests'), duration: col('durata', 'duration'), size: col('dimensione', 'size'),
    };
    const recs = [];
    for (const r of best.rows.slice(best.headerIdx + 1)) {
        const cells = [...r.querySelectorAll('td')];
        if (cells.length < 5) continue;
        const links = [...r.querySelectorAll('a')].map(a => a.href);
        const preview = links.find(h => /evn_preview_link|evn_play|preview|play/i.test(h)) || links[0];
        const get = i => (i >= 0 && cells[i]) ? norm(cells[i].innerText) : '';
        if (!get(ix.date)) continue;
        const tid = (preview || '').match(/transfer_id=(\d+)/);
        recs.push({ transferId: tid ? tid[1] : null, previewUrl: preview || null, date: get(ix.date), course: get(ix.course), type: get(ix.type), topic: get(ix.topic), guests: get(ix.guests), duration: get(ix.duration), size: get(ix.size) });
    }
    return { recs, headers };
})()"#;

/// Open an archive (aunicalogin getservizio URL or a recman URL) and list all recordings.
pub async fn list_recordings(s: &Session, archive_url: &str, log: &(dyn Fn(String) + Send + Sync)) -> Result<Vec<Value>> {
    let page = s.start().await?;
    let in_recman = done(|u: String, _| async move { is_recman(&u) });
    // aunicalogin -> (SSO) -> recman_frontend
    s.goto(&page, archive_url, &in_recman, Duration::from_secs(60)).await?;
    s.save_cookies().await;
    // "Mostra tutti" (action=plen_0) removes pagination
    let show_all = browser::eval(&page, "[...document.links].map(a => a.href).find(h => h.includes('action=plen_0'))").await?;
    if let Some(u) = show_all.as_str() {
        s.goto(&page, u, &in_recman, Duration::from_secs(45)).await?;
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    let result = browser::eval(&page, TABLE_JS).await?;
    if let Some(e) = result.get("error").and_then(Value::as_str) {
        s.debug_snapshot(&page, "recman_table").await;
        bail!("RecMan: {e}");
    }
    let mut recs: Vec<Value> = result["recs"].as_array().cloned().unwrap_or_default();
    for r in &mut recs {
        r["isoDate"] = json!(iso_date(crate::util::s(r, "date")));
        r["recmanArchive"] = json!(archive_url);
    }
    log(format!("  • RecMan: {} registrazioni", recs.len()));
    Ok(recs)
}

static WEBEX_PLAY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"webex\.com/(recordingservice|webappng/sites/[^/]+/recording)").unwrap());
static MEDIA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\.(mp4|m3u8|m4s|mpd)(\?|$)|/apis/download\.do|fallbackPlaySrc|/hls/").unwrap());

/// Follow a RecMan preview link in a separate tab and find where the video is.
/// Returns { webexUrl, mediaUrls[], finalUrl }.
pub async fn resolve_preview(s: &Session, preview_url: &str) -> Result<Value> {
    let page = s.new_page().await?;
    let media = Arc::new(Mutex::new(Vec::<String>::new()));
    let webex = Arc::new(Mutex::new(Vec::<String>::new()));
    let listener = {
        let (media, webex) = (media.clone(), webex.clone());
        let mut ev = page.event_listener::<EventRequestWillBeSent>().await?;
        tokio::spawn(async move {
            while let Some(e) = ev.next().await {
                let u = e.request.url.clone();
                if MEDIA.is_match(&u) {
                    media.lock().unwrap().push(u.clone());
                }
                if WEBEX_PLAY.is_match(&u) {
                    webex.lock().unwrap().push(u);
                }
            }
        })
    };
    let r: Result<Value> = async {
        let (m2, w2) = (media.clone(), webex.clone());
        let is_done = done(move |u: String, _| {
            let found = WEBEX_PLAY.is_match(&u) || !m2.lock().unwrap().is_empty() || !w2.lock().unwrap().is_empty();
            async move { found }
        });
        if let Err(e) = s.goto(&page, preview_url, &is_done, Duration::from_secs(60)).await {
            if media.lock().unwrap().is_empty() && webex.lock().unwrap().is_empty() {
                return Err(e);
            }
        }
        tokio::time::sleep(Duration::from_millis(1500)).await;
        let final_url = page.url().await?.unwrap_or_default();
        // embedded players / links in the DOM
        let dom = browser::eval(&page, r#"(() => {
            const urls = [];
            document.querySelectorAll('video[src], source[src], iframe[src], a[href], embed[src]').forEach(e => urls.push(e.src || e.href));
            const m = document.documentElement.innerHTML.match(/https?:\/\/[^"'\s<>]*webex\.com\/(recordingservice|webappng)[^"'\s<>]*/g);
            return urls.concat(m || []);
        })()"#).await.unwrap_or(json!([]));
        static MP4: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\.(mp4|m3u8)(\?|$)").unwrap());
        for u in dom.as_array().into_iter().flatten().filter_map(Value::as_str) {
            if WEBEX_PLAY.is_match(u) {
                webex.lock().unwrap().push(u.replace("&amp;", "&"));
            } else if MP4.is_match(u) {
                media.lock().unwrap().push(u.to_string());
            }
        }
        if WEBEX_PLAY.is_match(&final_url) {
            webex.lock().unwrap().insert(0, final_url.clone());
        }
        let mut mu: Vec<String> = vec![];
        for m in media.lock().unwrap().iter() {
            if !mu.contains(m) {
                mu.push(m.clone());
            }
        }
        Ok(json!({ "webexUrl": webex.lock().unwrap().first(), "mediaUrls": mu, "finalUrl": final_url }))
    }
    .await;
    listener.abort();
    let _ = page.close().await;
    r
}
