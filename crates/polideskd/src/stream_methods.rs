//! Lessons watched without downloading them (course option "streamOnly", or any lesson not downloaded yet),
//! "Scarica il video" for one lesson, and "Libera spazio" (videos to the Trash, streaming from then on).
//!
//! The app plays `media://stream/<token>/…`: Electron's main process asks `rec:streamTarget` for the real
//! URL + headers and proxies the request (Range for mp4, playlists rewritten for HLS), so WebEx tokens and
//! cookies never reach the page.
use crate::daemon::Daemon;
use anyhow::{anyhow, bail, Result};
use polidesk_core::rpc::Params;
use polidesk_core::{config, downloader::Headers, library as lib, sync, sys, util};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};

/// WebEx signed URLs last a few hours: resolved sources are reused for a while
const TTL: Duration = Duration::from_secs(50 * 60);

struct Target {
    url: String,
    headers: Headers,
    at: Instant,
}
/// token → URL; (course, key) → tokens + youtube page
static TARGETS: LazyLock<Mutex<HashMap<String, Target>>> = LazyLock::new(Default::default);
static BY_REC: LazyLock<Mutex<HashMap<String, (Value, Instant)>>> = LazyLock::new(Default::default);

fn is_hls(u: &str) -> bool {
    let l = u.to_ascii_lowercase();
    l.contains(".m3u8")
}

pub async fn call(d: &Arc<Daemon>, method: &str, p: Value) -> Result<Value> {
    match method {
        // candidate streams for a lesson, best for playback first (mp4 seeks with Range; HLS needs hls.js)
        "rec:stream" => {
            let (cid, key) = (p.req("courseId")?.to_string(), p.req("key")?.to_string());
            let id = format!("{cid}\u{1f}{key}");
            if !util::b(&p, "refresh") {
                if let Some((v, at)) = BY_REC.lock().unwrap().get(&id) {
                    if at.elapsed() < TTL {
                        return Ok(v.clone());
                    }
                }
            }
            let c = config::course(&cid)?;
            let dir = lib::dir_of(&c);
            let m = lib::load_manifest(&dir);
            let rec = m["recordings"].get(&key).cloned().ok_or_else(|| anyhow!("registrazione non trovata"))?;
            let session = d.session().await;
            let src = sync::resolve_source(&session, &rec, util::s(&c, "videoPassword"), None).await?;
            // remember what was learned (RecMan → WebEx link, duration) so the next resolve is faster
            if src.patch.as_object().is_some_and(|o| !o.is_empty()) {
                let mut m = lib::load_manifest(&dir);
                if m["recordings"].get(&key).is_some() {
                    m["recordings"][&key] = util::merge(&m["recordings"][&key], &src.patch);
                    let _ = lib::save_manifest(&dir, &m);
                }
            }
            let mut urls = src.urls.clone();
            urls.sort_by_key(|u| is_hls(u)); // stable: mp4 first, original order otherwise
            let now = Instant::now();
            let mut t = TARGETS.lock().unwrap();
            t.retain(|_, x| x.at.elapsed() < TTL * 2);
            let list: Vec<Value> = urls
                .into_iter()
                .map(|u| {
                    let token = uuid::Uuid::new_v4().simple().to_string();
                    let hls = is_hls(&u);
                    t.insert(token.clone(), Target { url: u, headers: src.headers.clone(), at: now });
                    json!({ "url": format!("media://stream/{token}/{}", if hls { "index.m3u8" } else { "video.mp4" }), "hls": hls })
                })
                .collect();
            let v = json!({ "sources": list, "youtube": src.youtube, "duration": src.patch.get("durationSec").cloned().unwrap_or(rec["durationSec"].clone()) });
            BY_REC.lock().unwrap().insert(id, (v.clone(), now));
            Ok(v)
        }
        // for Electron's media:// proxy only
        "rec:streamTarget" => {
            let t = TARGETS.lock().unwrap();
            let x = t.get(p.req("token")?).ok_or_else(|| anyhow!("stream scaduto: riapri la lezione"))?;
            Ok(json!({ "url": x.url, "headers": x.headers.iter().filter(|(_, v)| !v.is_empty()).map(|(k, v)| (k.clone(), json!(v))).collect::<serde_json::Map<_, _>>() }))
        }
        "rec:downloadVideo" => {
            let cid = p.req("courseId")?.to_string();
            config::course(&cid)?;
            let keys = match p.get("keys").filter(|k| k.is_array()) {
                Some(k) => util::str_list(Some(k)),
                None => vec![p.req("key")?.to_string()],
            };
            d.download_videos(&cid, keys);
            Ok(json!(true))
        }
        // "Libera spazio": downloaded videos to the Trash (recoverable); transcripts, notes and audio stay
        "course:freeSpace" => {
            let cid = p.req("courseId")?.to_string();
            let c = config::course(&cid)?;
            if !lib::stream_only(&c) {
                bail!("Attiva prima «Guarda in streaming» per questo corso");
            }
            let (running, queue, current) = d.sync_state();
            if running && (current.as_deref() == Some(&cid) || queue.contains(&cid)) {
                bail!("Il corso si sta sincronizzando: riprova al termine");
            }
            let dir = lib::dir_of(&c);
            let dd = lib::course_dirs(&dir);
            let mut m = lib::load_manifest(&dir);
            let recs = lib::with_file_status(&dir, &m);
            let files: Vec<(String, std::path::PathBuf)> = recs.iter().filter(|r| util::b(r, "videoExists")).map(|r| (util::s(r, "key").to_string(), dd.video.join(util::s(r, "file")))).collect();
            let bytes: u64 = files.iter().filter_map(|(_, f)| std::fs::metadata(f).ok()).map(|m| m.len()).sum();
            if util::b(&p, "dryRun") {
                let untranscribed = recs.iter().filter(|r| util::b(r, "videoExists") && !util::truthy(r.get("transcript"))).count();
                return Ok(json!({ "files": files.len(), "bytes": bytes, "untranscribed": untranscribed }));
            }
            let (mut n, mut freed) = (0, 0u64);
            for (key, f) in &files {
                let len = std::fs::metadata(f).map(|m| m.len()).unwrap_or(0);
                match sys::trash(f) {
                    Ok(_) => {
                        n += 1;
                        freed += len;
                        let audio = dd.audio.join(lib::audio_name(util::s(&m["recordings"][key], "file"))).exists();
                        m["recordings"][key]["status"] = json!(if audio { "audio" } else { "new" });
                    }
                    Err(e) => d.log(format!("✗ cestino: {e}"), Some(&cid)),
                }
            }
            lib::save_manifest(&dir, &m)?;
            lib::write_index(&dir, &m)?;
            let size = if freed >= 1_000_000_000 { format!("{:.1} GB", freed as f64 / 1e9) } else { format!("{} MB", freed / 1_000_000) };
            d.log(format!("🧹 {}: {n} video nel Cestino ({size} liberati), le lezioni si guardano in streaming", config::course_name(&c)), Some(&cid));
            d.refresh();
            Ok(json!({ "trashed": n, "bytes": freed }))
        }
        _ => bail!("Metodo sconosciuto: {method}"),
    }
}
