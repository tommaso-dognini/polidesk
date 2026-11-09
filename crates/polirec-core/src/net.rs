//! Shared HTTP client (one connection pool for the whole daemon).
use anyhow::{bail, Result};
use futures_util::StreamExt;
use std::path::Path;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::io::AsyncWriteExt;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(concat!("PoliRec/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .pool_idle_timeout(Duration::from_secs(60))
        .gzip(true)
        .build()
        .expect("http client")
});

pub fn client() -> &'static reqwest::Client {
    &CLIENT
}

/// Download `url` to `dest` (through a .part file).
pub async fn download(url: &str, dest: &Path) -> Result<u64> {
    let r = client().get(url).send().await?;
    if !r.status().is_success() {
        bail!("HTTP {} per {url}", r.status().as_u16());
    }
    let part = dest.with_extension(format!("{}.part", dest.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default()));
    if let Some(d) = dest.parent() {
        tokio::fs::create_dir_all(d).await?;
    }
    let mut f = tokio::fs::File::create(&part).await?;
    let mut n = 0u64;
    let mut s = r.bytes_stream();
    while let Some(chunk) = s.next().await {
        let c = chunk?;
        n += c.len() as u64;
        f.write_all(&c).await?;
    }
    f.flush().await?;
    drop(f);
    tokio::fs::rename(&part, dest).await?;
    Ok(n)
}
