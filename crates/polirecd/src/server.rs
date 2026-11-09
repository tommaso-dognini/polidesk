//! Local socket server: one task per client, requests handled concurrently, events broadcast.
use crate::daemon::Daemon;
use crate::dispatch;
use anyhow::Result;
use polirec_core::{paths, rpc};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

/// launch time (ms): the app restarts the daemon when its binary is newer
static STARTED: std::sync::LazyLock<i64> = std::sync::LazyLock::new(polirec_core::util::now_ms);

pub async fn run() -> Result<()> {
    let _ = *STARTED;
    // a second instance just exits: the first one already serves this data dir
    if rpc::connect_raw().await.is_ok() {
        eprintln!("polirecd è già attivo ({})", paths::socket_path().display());
        return Ok(());
    }
    let d = Daemon::new();
    eprintln!("polirecd {} · dati {} · socket {}", env!("CARGO_PKG_VERSION"), paths::app_dir().display(), paths::socket_path().display());
    d.start_background();
    let shutdown = d.shutdown.clone();
    let d = d.clone();
    tokio::select! {
        r = listen(d.clone()) => r,
        _ = shutdown.notified() => {
            // close Chrome cleanly: an orphan would keep the profile locked for the next daemon
            let _ = tokio::time::timeout(std::time::Duration::from_secs(8), d.close_session()).await;
            d.transcriber.cancel_all();
            cleanup();
            Ok(())
        }
        _ = tokio::signal::ctrl_c() => { cleanup(); Ok(()) }
    }
}

fn cleanup() {
    #[cfg(unix)]
    let _ = std::fs::remove_file(paths::socket_path());
}

#[cfg(unix)]
async fn listen(d: Arc<Daemon>) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let p = paths::socket_path();
    let _ = std::fs::remove_file(&p); // stale socket from a crashed instance
    let l = tokio::net::UnixListener::bind(&p)?;
    std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600))?; // only this user
    loop {
        let (s, _) = l.accept().await?;
        tokio::spawn(serve(d.clone(), s));
    }
}

#[cfg(windows)]
async fn listen(d: Arc<Daemon>) -> Result<()> {
    use tokio::net::windows::named_pipe::ServerOptions;
    let p = paths::socket_path();
    let mut server = ServerOptions::new().first_pipe_instance(true).reject_remote_clients(true).create(&p)?;
    loop {
        server.connect().await?;
        let connected = server;
        server = ServerOptions::new().reject_remote_clients(true).create(&p)?;
        tokio::spawn(serve(d.clone(), connected));
    }
}

async fn serve<S: AsyncRead + AsyncWrite + Send + 'static>(d: Arc<Daemon>, s: S) {
    let (r, mut w) = tokio::io::split(s);
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let writer = tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            if w.write_all(line.as_bytes()).await.is_err() || w.write_all(b"\n").await.is_err() {
                break;
            }
        }
    });
    let mut client = String::from("?");
    let mut is_ui = false;
    let mut lines = BufReader::new(r).lines();
    while let Ok(Some(l)) = lines.next_line().await {
        let Ok(req) = serde_json::from_str::<Value>(&l) else { continue };
        let id = req.get("id").cloned().unwrap_or(Value::Null);
        let method = req.get("method").and_then(Value::as_str).unwrap_or("").to_string();
        let params = req.get("params").cloned().unwrap_or(Value::Null);
        match method.as_str() {
            "hello" => {
                client = params.get("client").and_then(Value::as_str).unwrap_or("?").to_string();
                if client == "electron" && !is_ui {
                    is_ui = true;
                    d.ui_clients.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                }
                let _ = tx.send(json!({ "id": id, "result": { "protocol": rpc::PROTOCOL, "version": env!("CARGO_PKG_VERSION"), "pid": std::process::id(), "started": *STARTED, "exe": std::env::current_exe().ok(), "methods": dispatch::METHODS } }).to_string());
            }
            "subscribe" => {
                let mut ev = d.events.subscribe();
                let tx2 = tx.clone();
                tokio::spawn(async move {
                    loop {
                        match ev.recv().await {
                            Ok(e) => {
                                if tx2.send(json!({ "event": e }).to_string()).is_err() {
                                    break;
                                }
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(_) => break,
                        }
                    }
                });
                let _ = tx.send(json!({ "id": id, "result": true }).to_string());
            }
            _ => {
                let (d, tx, client) = (d.clone(), tx.clone(), client.clone());
                tokio::spawn(async move {
                    let out = match dispatch::call(&d, &client, &method, params).await {
                        Ok(v) => json!({ "id": id, "result": v }),
                        Err(e) => json!({ "id": id, "error": { "message": e.to_string() } }),
                    };
                    let _ = tx.send(out.to_string());
                });
            }
        }
    }
    if is_ui {
        d.ui_clients.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    }
    drop(tx);
    drop(writer); // ends by itself once the socket is gone
}
