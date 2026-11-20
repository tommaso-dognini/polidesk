//! «Migliora l'audio»: pulizia della voce del docente nei video (e negli audio) scaricati, con ffmpeg.
//!
//! Catena di filtri, tutta locale:
//!  - passa-alto 90 Hz e passa-basso 8 kHz: via rombo, ronzio della rete e fruscio acuto, fuori dalla voce;
//!  - `afftdn` con stima continua del rumore: toglie il rumore di fondo costante (ventole, proiettore, aula);
//!  - un leggero rinforzo a 2,8 kHz: più intelligibilità delle consonanti;
//!  - `dynaudnorm`: volume regolare anche quando il docente si allontana dal microfono;
//!  - limitatore: niente picchi distorti.
//!
//! Il video non si ricodifica (copia). La traccia audio migliorata diventa la prima (quella che usano il
//! player e la trascrizione); l'originale resta come seconda traccia, così «Ripristina» la rimette senza
//! perdere nulla. Quali file sono stati migliorati è scritto in `<corso>/.audio-migliorato.json`.
use crate::{tools, util};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

pub const FILTER: &str = "highpass=f=90,lowpass=f=8000,afftdn=nr=18:nf=-30:tn=1,equalizer=f=2800:t=q:w=1.2:g=3,dynaudnorm=f=200:g=11:p=0.9:m=8,alimiter=limit=0.95:level=disabled";
const SIDECAR: &str = ".audio-migliorato.json";

fn sidecar_path(course_dir: &Path) -> PathBuf {
    course_dir.join(SIDECAR)
}
/// Files already enhanced (name → when).
pub fn enhanced(course_dir: &Path) -> Value {
    util::read_json(&sidecar_path(course_dir)).filter(Value::is_object).unwrap_or_else(|| json!({}))
}
pub fn is_enhanced(course_dir: &Path, file: &Path) -> bool {
    let name = file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    enhanced(course_dir).get(&name).is_some()
}
fn mark(course_dir: &Path, file: &Path, on: bool) -> Result<()> {
    let name = file.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut v = enhanced(course_dir);
    if on {
        v[&name] = json!({ "at": util::now_iso() });
    } else if let Some(o) = v.as_object_mut() {
        o.remove(&name);
    }
    util::write_json(&sidecar_path(course_dir), &v)
}

fn tmp_of(file: &Path) -> PathBuf {
    let ext = file.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "mp4".into());
    file.with_extension(format!("migliora.{ext}"))
}

/// Run ffmpeg with progress (0–100) from `-progress pipe:1`.
async fn run(args: Vec<String>, on: &(dyn Fn(f64) + Send + Sync)) -> Result<()> {
    let ff = tools::ffmpeg().ok_or_else(|| anyhow!("ffmpeg non trovato"))?;
    let mut child = tokio::process::Command::new(ff)
        .args(["-hide_banner", "-nostdin", "-y", "-progress", "pipe:1", "-nostats"])
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let mut err = BufReader::new(child.stderr.take().unwrap()).lines();
    let mut out = BufReader::new(child.stdout.take().unwrap()).lines();
    let mut duration = 0f64;
    let mut tail = Vec::new();
    loop {
        tokio::select! {
            l = err.next_line() => match l? {
                Some(l) => {
                    if duration == 0.0 {
                        if let Some(d) = l.trim().strip_prefix("Duration: ").and_then(|d| d.split(',').next()) {
                            let p: Vec<f64> = d.split(':').filter_map(|x| x.parse().ok()).collect();
                            if p.len() == 3 { duration = p[0] * 3600.0 + p[1] * 60.0 + p[2]; }
                        }
                    }
                    tail.push(l);
                    if tail.len() > 12 { tail.remove(0); }
                }
                None => break,
            },
            l = out.next_line() => if let Some(l) = l? {
                if let Some(us) = l.strip_prefix("out_time_us=").and_then(|x| x.parse::<f64>().ok()) {
                    if duration > 0.0 { on((us / 1e6 / duration * 100.0).clamp(0.0, 100.0)); }
                }
            },
        }
    }
    let st = child.wait().await?;
    if !st.success() {
        bail!("ffmpeg: {}", tail.iter().rev().find(|l| !l.trim().is_empty()).cloned().unwrap_or_default());
    }
    Ok(())
}

/// Number of audio tracks in the file (from ffmpeg's own listing).
async fn audio_tracks(file: &Path) -> usize {
    let Some(ff) = tools::ffmpeg() else { return 0 };
    let out = tokio::process::Command::new(ff).args(["-hide_banner", "-i"]).arg(file).output().await;
    out.map(|o| String::from_utf8_lossy(&o.stderr).lines().filter(|l| l.contains("Stream #") && l.contains("Audio:")).count()).unwrap_or(0)
}

/// Enhance the voice in `file` (video or audio), in place. `course_dir` records it.
pub async fn enhance(course_dir: &Path, file: &Path, on: &(dyn Fn(f64) + Send + Sync)) -> Result<()> {
    if is_enhanced(course_dir, file) {
        return Ok(());
    }
    if audio_tracks(file).await == 0 {
        bail!("il file non ha una traccia audio");
    }
    let tmp = tmp_of(file);
    let video = !matches!(file.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(), Some("m4a" | "mp3" | "aac" | "wav" | "opus" | "ogg"));
    let mut args: Vec<String> = vec!["-i".into(), file.to_string_lossy().into(), "-filter_complex".into(), format!("[0:a:0]{FILTER}[voce]")];
    if video {
        args.extend(["-map", "0:v?", "-c:v", "copy"].map(String::from));
    }
    args.extend(["-map", "[voce]", "-map", "0:a:0", "-c:a:0", "aac", "-b:a:0", "128k", "-c:a:1", "copy"].map(String::from));
    args.extend(["-disposition:a:0", "default", "-disposition:a:1", "0", "-metadata:s:a:0", "title=Voce migliorata (PoliDesk)", "-metadata:s:a:1", "title=Originale"].map(String::from));
    args.extend(["-map_metadata", "0", "-movflags", "+faststart"].map(String::from));
    args.push(tmp.to_string_lossy().into());
    if let Err(e) = run(args, on).await {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    std::fs::rename(&tmp, file)?;
    mark(course_dir, file, true)
}

/// Put the original audio back (the second track kept by `enhance`).
pub async fn restore(course_dir: &Path, file: &Path) -> Result<()> {
    if !is_enhanced(course_dir, file) {
        return Ok(());
    }
    if audio_tracks(file).await < 2 {
        bail!("traccia originale non trovata nel file");
    }
    let tmp = tmp_of(file);
    let args: Vec<String> = ["-i", &file.to_string_lossy(), "-map", "0:v?", "-map", "0:a:1", "-c", "copy", "-disposition:a:0", "default", "-metadata:s:a:0", "title=", "-map_metadata", "0", "-movflags", "+faststart", &tmp.to_string_lossy()]
        .iter()
        .map(|s| s.to_string())
        .collect();
    if let Err(e) = run(args, &|_| {}).await {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    std::fs::rename(&tmp, file)?;
    mark(course_dir, file, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Needs ffmpeg on the PATH: `cargo test -p polidesk-core enhance -- --ignored`
    #[tokio::test]
    #[ignore]
    async fn roundtrip() {
        let dir = std::env::temp_dir().join(format!("polidesk-enhance-{}", util::now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("lez.mp4");
        let ff = tools::ffmpeg().expect("ffmpeg");
        let ok = std::process::Command::new(ff)
            .args(["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=5", "-f", "lavfi", "-i", "anoisesrc=c=pink:a=0.05", "-t", "4", "-pix_fmt", "yuv420p", "-c:a", "aac"])
            .arg(&f)
            .status()
            .unwrap();
        assert!(ok.success());
        enhance(&dir, &f, &|_| {}).await.unwrap();
        assert!(is_enhanced(&dir, &f));
        assert_eq!(audio_tracks(&f).await, 2);
        restore(&dir, &f).await.unwrap();
        assert!(!is_enhanced(&dir, &f));
        assert_eq!(audio_tracks(&f).await, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
