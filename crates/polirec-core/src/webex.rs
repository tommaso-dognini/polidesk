//! WebEx recordings (politecnicomilano.webex.com): playback page → stream info → download URLs.
use crate::browser::{done, Session};
use crate::{net, util};
use anyhow::{anyhow, bail, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::sync::LazyLock;
use std::time::Duration;
use tokio::sync::Mutex;

pub const SITE: &str = "https://politecnicomilano.webex.com";
pub const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

pub fn extract_recording_id(url: &str) -> Option<String> {
    let u = reqwest::Url::parse(url).ok()?;
    u.path().split('/').find(|p| p.len() >= 32 && p[..32].chars().all(|c| c.is_ascii_hexdigit())).map(|p| p[..32].to_string())
}
pub fn is_playback(u: &str) -> bool {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"webex\.com/(recordingservice|webappng/sites/[^/]+/recording)").unwrap());
    RX.is_match(u) && extract_recording_id(u).is_some()
}

/// RCID / ldr.php / lsr.php links → playback URL (needs the browser for redirects + SSO).
pub async fn resolve_to_playback(s: &Session, url: &str) -> Result<String> {
    if is_playback(url) {
        return Ok(url.to_string());
    }
    let page = s.new_page().await?;
    let r = s.goto(&page, url, &done(|u: String, _| async move { is_playback(&u) }), Duration::from_secs(45)).await;
    let _ = page.close().await;
    r
}

// one WebEx SSO at a time; parallel downloads wait for it and reuse the ticket
static AUTH: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

async fn has_ticket(s: &Session) -> bool {
    s.cookie_header_for(&format!("{SITE}/")).await.map(|c| c.split("; ").any(|x| x.starts_with("ticket="))).unwrap_or(false)
}

async fn authenticate(s: &Session, playback_url: &str) -> Result<()> {
    let _g = AUTH.lock().await;
    if has_ticket(s).await {
        return Ok(()); // another download just authenticated
    }
    let page = s.new_page().await?;
    let is_done = done(move |u: String, _| async move { is_playback(&u) && has_ticket(s).await });
    let r = s.goto(&page, playback_url, &is_done, Duration::from_secs(60)).await;
    tokio::time::sleep(Duration::from_secs(1)).await;
    s.save_cookies().await;
    let _ = page.close().await;
    r.map(|_| ())
}

#[derive(Debug)]
pub struct PasswordRequired(pub String);
impl std::fmt::Display for PasswordRequired {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Registrazione protetta da password")
    }
}
impl std::error::Error for PasswordRequired {}

/// Stream info from the WebEx API, with the browser's WebEx cookies (SSO in the browser if needed).
pub async fn get_stream_info(s: &Session, playback_url: &str, password: &str) -> Result<Value> {
    let id = extract_recording_id(playback_url).ok_or_else(|| anyhow!("ID registrazione WebEx non trovato in {playback_url}"))?;
    let api = format!("{SITE}/webappng/api/v1/recordings/{id}/stream?siteurl=politecnicomilano");
    for attempt in 0..2 {
        let cookie = s.cookie_header_for(&format!("{SITE}/")).await?;
        let r = net::client().get(&api).header("User-Agent", UA).header("Cookie", cookie).header("Accept", "application/json, text/plain, */*").header("accessPwd", password).send().await?;
        let status = r.status().as_u16();
        let text = r.text().await?;
        let obj: Option<Value> = serde_json::from_str(&text).ok();
        if let Some(o) = &obj {
            if util::truthy(o.get("fallbackPlaySrc")) || util::truthy(o.get("downloadRecordingInfo")) || util::truthy(o.get("mp4StreamOption")) {
                return Ok(util::merge(&json!({ "id": id }), o));
            }
            match o["code"].as_i64() {
                Some(53005) => return Err(PasswordRequired(util::s(o, "recordName").into()).into()),
                Some(54001) => bail!("Registrazione WebEx non esistente o rimossa"),
                _ => {}
            }
        }
        if attempt == 0 {
            // authenticate WebEx via SSO by opening the recording page in the browser
            authenticate(s, playback_url).await?;
            continue;
        }
        bail!("Risposta WebEx inattesa (HTTP {status}): {}", util::take(&text, 200));
    }
    unreachable!()
}

/// Candidate download URLs, fastest first.
pub fn download_candidates(info: &Value) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    if let Some(u) = info["fallbackPlaySrc"].as_str().filter(|s| !s.is_empty()) {
        out.push(u.into());
    }
    let di = &info["downloadRecordingInfo"]["downloadInfo"];
    for k in ["mp4URL", "hlsURL"] {
        if let Some(u) = di[k].as_str().filter(|s| !s.is_empty()) {
            out.push(u.into());
        }
    }
    let o = &info["mp4StreamOption"];
    if !util::s(o, "recordingDir").is_empty() {
        let name = format!("{}.mp4", Some(util::s(info, "recordName")).filter(|s| !s.is_empty()).unwrap_or("recording"));
        out.push(format!("https://nfg1vss.webex.com/apis/download.do?recordingDir={}&timestamp={}&token={}&fileName={}", util::s(o, "recordingDir"), o["timestamp"].as_str().map(String::from).unwrap_or_else(|| o["timestamp"].to_string()), util::s(o, "token"), util::encode_component(&name)));
    }
    let mut seen = std::collections::HashSet::new();
    out.retain(|u| seen.insert(u.clone()));
    out
}
