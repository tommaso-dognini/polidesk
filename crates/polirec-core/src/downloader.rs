//! Video downloads: aria2c when installed (16 connections), otherwise a built-in parallel range
//! downloader; HLS (.m3u8) streams are remuxed to mp4 with ffmpeg (copy, no re-encode).
//! Everything is written to a .part file and renamed at the end; interrupted downloads resume.
use crate::{net, tools};
use anyhow::{anyhow, bail, Result};
use futures_util::StreamExt;
use regex::Regex;
use serde_json::{json, Value};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

pub type Progress = Arc<dyn Fn(Value) + Send + Sync>;
pub type Headers = Vec<(String, String)>;

fn progress(percent: f64, speed: &str, eta: &str) -> Value {
    json!({ "percent": percent, "speed": speed, "eta": eta })
}
fn part_of(dest: &Path) -> PathBuf {
    let mut s = dest.as_os_str().to_owned();
    s.push(".part");
    PathBuf::from(s)
}

pub async fn download(url: &str, dest: &Path, headers: &Headers, on: Progress, duration_sec: f64) -> Result<PathBuf> {
    let low = url.to_lowercase();
    if low.contains(".m3u8?") || low.ends_with(".m3u8") {
        return ffmpeg_copy(url, dest, headers, on, duration_sec).await;
    }
    if tools::which("aria2c").is_some() && std::env::var_os("POLIREC_NO_ARIA2").is_none() {
        return aria2(url, dest, headers, on).await;
    }
    http_download(url, dest, headers, on, 8).await
}

fn req(url: &str, method: reqwest::Method, headers: &Headers) -> reqwest::RequestBuilder {
    let mut r = net::client().request(method, url);
    for (k, v) in headers {
        if !v.is_empty() {
            r = r.header(k.as_str(), v.as_str());
        }
    }
    r
}

/// Built-in HTTP downloader: parallel byte ranges when supported, resumable single stream otherwise.
pub async fn http_download(url: &str, dest: &Path, headers: &Headers, on: Progress, connections: usize) -> Result<PathBuf> {
    if let Some(d) = dest.parent() {
        tokio::fs::create_dir_all(d).await?;
    }
    let tmp = part_of(dest);
    let head = req(url, reqwest::Method::HEAD, headers).send().await.ok().filter(|r| r.status().is_success());
    let total: u64 = head.as_ref().and_then(|r| r.headers().get("content-length")).and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok()).unwrap_or(0);
    let ranges = head.as_ref().and_then(|r| r.headers().get("accept-ranges")).and_then(|v| v.to_str().ok()).map(|v| v.to_lowercase().contains("bytes")).unwrap_or(false) && total > 8 * 1024 * 1024;
    let final_url = head.as_ref().map(|r| r.url().to_string()).unwrap_or_else(|| url.to_string());
    let done = Arc::new(AtomicU64::new(0));
    let t0 = Instant::now();
    let last = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1)));
    let tick = {
        let (done, last, on) = (done.clone(), last.clone(), on.clone());
        move |n: u64| {
            let d = done.fetch_add(n, Ordering::Relaxed) + n;
            let mut l = last.lock().unwrap();
            if l.elapsed() > Duration::from_millis(500) && total > 0 {
                *l = Instant::now();
                let speed = d as f64 / t0.elapsed().as_secs_f64().max(1.0);
                on(progress(d as f64 / total as f64 * 100.0, &format!("{:.1}MiB/s", speed / 1048576.0), &format!("{}s", ((total - d.min(total)) as f64 / speed.max(1.0)).round())));
            }
        }
    };

    if ranges && connections > 1 {
        let file = std::fs::OpenOptions::new().create(true).write(true).truncate(false).open(&tmp)?;
        file.set_len(total)?;
        let file = Arc::new(Mutex::new(file));
        let chunk = total.div_ceil(connections as u64);
        let mut tasks = vec![];
        for i in 0..connections as u64 {
            let (start, end) = (i * chunk, ((i + 1) * chunk).min(total).saturating_sub(1));
            if start > end {
                continue;
            }
            let (file, url, headers, tick) = (file.clone(), final_url.clone(), headers.clone(), tick.clone());
            tasks.push(tokio::spawn(async move {
                let mut attempt = 0;
                loop {
                    let r: Result<()> = async {
                        let mut pos = start;
                        let r = req(&url, reqwest::Method::GET, &headers).header("Range", format!("bytes={start}-{end}")).send().await?;
                        if r.status().as_u16() != 206 {
                            bail!("range non supportato (HTTP {})", r.status().as_u16());
                        }
                        let mut s = r.bytes_stream();
                        while let Some(b) = s.next().await {
                            let b = b?;
                            {
                                let mut f = file.lock().unwrap();
                                f.seek(SeekFrom::Start(pos))?;
                                f.write_all(&b)?;
                            }
                            pos += b.len() as u64;
                            tick(b.len() as u64);
                        }
                        if pos != end + 1 {
                            bail!("chunk incompleto");
                        }
                        Ok(())
                    }
                    .await;
                    match r {
                        Ok(()) => return Ok::<(), anyhow::Error>(()),
                        Err(e) if attempt >= 4 => return Err(e),
                        Err(_) => {
                            attempt += 1;
                            tokio::time::sleep(Duration::from_secs(2 * attempt)).await;
                        }
                    }
                }
            }));
        }
        for t in tasks {
            t.await.map_err(|e| anyhow!("{e}"))??;
        }
    } else {
        // single stream with resume
        let mut have = std::fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
        let mut rq = req(&final_url, reqwest::Method::GET, headers);
        if have > 0 {
            rq = rq.header("Range", format!("bytes={have}-"));
        }
        let r = rq.send().await?;
        if !r.status().is_success() {
            bail!("HTTP {}", r.status().as_u16());
        }
        if r.status().as_u16() != 206 {
            have = 0;
        }
        done.store(have, Ordering::Relaxed);
        let mut f = std::fs::OpenOptions::new().create(true).write(true).append(have > 0).truncate(have == 0).open(&tmp)?;
        let mut s = r.bytes_stream();
        while let Some(b) = s.next().await {
            let b = b?;
            f.write_all(&b)?;
            tick(b.len() as u64);
        }
        f.flush()?;
    }
    let size = std::fs::metadata(&tmp)?.len();
    if total > 0 && size != total {
        bail!("file incompleto ({size}/{total})");
    }
    std::fs::rename(&tmp, dest)?;
    on(progress(100.0, "", ""));
    Ok(dest.to_path_buf())
}

pub async fn aria2(url: &str, dest: &Path, headers: &Headers, on: Progress) -> Result<PathBuf> {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(([\d.]+)%\).*?DL:([\d.]+\w+)(?:.*?ETA:(\w+))?").unwrap());
    let bin = tools::which("aria2c").ok_or_else(|| anyhow!("aria2c non trovato (brew install aria2)"))?;
    let dir = dest.parent().unwrap_or(Path::new("."));
    let tmp_name = format!("{}.part", dest.file_name().unwrap().to_string_lossy());
    std::fs::create_dir_all(dir)?;
    let mut c = tools::command(bin);
    c.args(["-x", "16", "-s", "16", "-k", "1M", "-c", "--auto-file-renaming=false", "--allow-overwrite=true", "--max-tries=5", "--retry-wait=3", "--timeout=60", "--summary-interval=1", "--console-log-level=warn", "--download-result=hide", "-d"])
        .arg(dir)
        .arg("-o")
        .arg(&tmp_name);
    for (k, v) in headers {
        if !v.is_empty() {
            c.arg("--header").arg(format!("{k}: {v}"));
        }
    }
    c.arg(url).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    let mut p = c.spawn()?;
    let (so, mut se) = (p.stdout.take().unwrap(), p.stderr.take().unwrap());
    let err = Arc::new(Mutex::new(String::new()));
    let e2 = err.clone();
    let out_task = async move {
        // aria2 redraws its status line with \r: read raw chunks
        let mut r = BufReader::new(so);
        let mut buf = vec![0u8; 4096];
        while let Ok(n) = r.read(&mut buf).await {
            if n == 0 {
                break;
            }
            let s = String::from_utf8_lossy(&buf[..n]).to_string();
            if let Some(m) = RX.captures(&s) {
                on(progress(m[1].parse().unwrap_or(0.0), &format!("{}/s", &m[2]), m.get(3).map(|x| x.as_str()).unwrap_or("")));
            }
            if s.to_lowercase().contains("error") || s.to_lowercase().contains("exception") {
                e2.lock().unwrap().push_str(&s);
            }
        }
        on
    };
    let err_task = async {
        let mut s = String::new();
        let _ = se.read_to_string(&mut s).await;
        s
    };
    let (on, e) = tokio::join!(out_task, err_task);
    err.lock().unwrap().push_str(&e);
    let st = p.wait().await?;
    let tmp = dir.join(&tmp_name);
    if st.success() && tmp.exists() {
        std::fs::rename(&tmp, dest)?;
        on(progress(100.0, "", ""));
        Ok(dest.to_path_buf())
    } else {
        bail!("aria2c exit {}: {}", st.code().unwrap_or(-1), crate::util::tail(&err.lock().unwrap(), 400))
    }
}

/// HLS / generic stream → mp4 via ffmpeg (copy, no re-encode).
pub async fn ffmpeg_copy(url: &str, dest: &Path, headers: &Headers, on: Progress, duration_sec: f64) -> Result<PathBuf> {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"time=(\d+):(\d+):([\d.]+)").unwrap());
    let bin = tools::ffmpeg().ok_or_else(|| anyhow!("ffmpeg non trovato"))?;
    if let Some(d) = dest.parent() {
        std::fs::create_dir_all(d)?;
    }
    let mut tmp = dest.as_os_str().to_owned();
    tmp.push(".part.mp4");
    let hdr: String = headers.iter().filter(|(_, v)| !v.is_empty()).map(|(k, v)| format!("{k}: {v}\r\n")).collect();
    let mut c = tools::command(bin);
    c.args(["-y", "-loglevel", "error", "-stats"]);
    if !hdr.is_empty() {
        c.arg("-headers").arg(hdr);
    }
    c.args(["-i", url, "-c", "copy", "-bsf:a", "aac_adtstoasc"]).arg(&tmp).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped());
    let mut p = c.spawn()?;
    let se = p.stderr.take().unwrap();
    let mut err = String::new();
    let mut r = BufReader::new(se);
    let mut buf = Vec::new();
    // ffmpeg -stats ends lines with \r
    while let Ok(n) = r.read_until(b'\r', &mut buf).await {
        if n == 0 {
            break;
        }
        let s = String::from_utf8_lossy(&buf).to_string();
        buf.clear();
        if let Some(m) = RX.captures(&s) {
            if duration_sec > 0.0 {
                let t = m[1].parse::<f64>().unwrap_or(0.0) * 3600.0 + m[2].parse::<f64>().unwrap_or(0.0) * 60.0 + m[3].parse::<f64>().unwrap_or(0.0);
                on(progress((t / duration_sec * 100.0).min(99.0), "", ""));
            }
        }
        err.push_str(&s);
        if err.len() > 8000 {
            err = crate::util::tail(&err, 2000);
        }
    }
    let st = p.wait().await?;
    if st.success() {
        std::fs::rename(&tmp, dest)?;
        Ok(dest.to_path_buf())
    } else {
        bail!("ffmpeg exit {}: {}", st.code().unwrap_or(-1), crate::util::tail(&err, 400))
    }
}
