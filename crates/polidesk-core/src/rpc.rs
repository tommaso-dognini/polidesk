//! Wire protocol between polideskd and its clients (Electron UI, CLI, MCP server).
//!
//! One JSON object per line, over a local socket (Unix socket / Windows named pipe):
//!   client → daemon   {"id": 7, "method": "notes:list", "params": …}
//!   daemon → client   {"id": 7, "result": …}  or  {"id": 7, "error": {"message": "…"}}
//!   daemon → client   {"event": {"type": "log", …}}     (only after "subscribe")
//!
//! Method names are the same as the app's IPC channels ("course:add", "notes:read", …).
use crate::paths;
use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

pub const PROTOCOL: u32 = 1;

#[cfg(unix)]
pub type Stream = tokio::net::UnixStream;
#[cfg(windows)]
pub type Stream = tokio::net::windows::named_pipe::NamedPipeClient;

pub async fn connect_raw() -> std::io::Result<Stream> {
    #[cfg(unix)]
    {
        tokio::net::UnixStream::connect(paths::socket_path()).await
    }
    #[cfg(windows)]
    {
        tokio::net::windows::named_pipe::ClientOptions::new().open(paths::socket_path())
    }
}

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value>>>>>;

/// A connection to polideskd. Cheap to clone; calls can run concurrently.
#[derive(Clone)]
pub struct Client {
    tx: mpsc::UnboundedSender<String>,
    pending: Pending,
    next: Arc<AtomicU64>,
    events: Arc<Mutex<Option<mpsc::UnboundedSender<Value>>>>,
}

impl Client {
    /// Connect, starting the daemon first if it is not running.
    pub async fn connect(client_name: &str) -> Result<Client> {
        let stream = match connect_raw().await {
            Ok(s) => s,
            Err(_) => {
                spawn_daemon()?;
                let mut last = None;
                let mut got = None;
                for _ in 0..100 {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    match connect_raw().await {
                        Ok(s) => {
                            got = Some(s);
                            break;
                        }
                        Err(e) => last = Some(e),
                    }
                }
                got.ok_or_else(|| anyhow!("polideskd non risponde: {}", last.map(|e| e.to_string()).unwrap_or_default()))?
            }
        };
        let c = Client::over(stream);
        c.call("hello", json!({ "client": client_name, "protocol": PROTOCOL })).await?;
        Ok(c)
    }

    fn over(stream: Stream) -> Client {
        let (r, mut w) = tokio::io::split(stream);
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        let pending: Pending = Default::default();
        let events: Arc<Mutex<Option<mpsc::UnboundedSender<Value>>>> = Default::default();
        tokio::spawn(async move {
            while let Some(line) = rx.recv().await {
                if w.write_all(line.as_bytes()).await.is_err() || w.write_all(b"\n").await.is_err() {
                    break;
                }
            }
        });
        let (p2, e2) = (pending.clone(), events.clone());
        tokio::spawn(async move {
            let mut lines = BufReader::new(r).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                let Ok(v) = serde_json::from_str::<Value>(&l) else { continue };
                if let Some(ev) = v.get("event") {
                    if let Some(tx) = e2.lock().unwrap().as_ref() {
                        let _ = tx.send(ev.clone());
                    }
                    continue;
                }
                let Some(id) = v.get("id").and_then(Value::as_u64) else { continue };
                if let Some(tx) = p2.lock().unwrap().remove(&id) {
                    let r = match v.get("error") {
                        Some(e) => Err(anyhow!("{}", e.get("message").and_then(Value::as_str).unwrap_or("errore"))),
                        None => Ok(v.get("result").cloned().unwrap_or(Value::Null)),
                    };
                    let _ = tx.send(r);
                }
            }
            // connection closed: fail whatever is still waiting
            for (_, tx) in p2.lock().unwrap().drain() {
                let _ = tx.send(Err(anyhow!("Connessione a polideskd interrotta")));
            }
        });
        Client { tx, pending, next: Arc::new(AtomicU64::new(1)), events }
    }

    pub async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        let line = serde_json::to_string(&json!({ "id": id, "method": method, "params": params }))?;
        self.tx.send(line).map_err(|_| anyhow!("Connessione a polideskd interrotta"))?;
        rx.await.map_err(|_| anyhow!("Connessione a polideskd interrotta"))?
    }

    /// Receive the daemon's events (log, progress, AI streaming…) from now on.
    pub async fn subscribe(&self) -> Result<mpsc::UnboundedReceiver<Value>> {
        let (tx, rx) = mpsc::unbounded_channel();
        *self.events.lock().unwrap() = Some(tx);
        self.call("subscribe", Value::Null).await?;
        Ok(rx)
    }
}

/// polideskd next to the current executable (installed app / cargo target dir), else on PATH.
pub fn daemon_exe() -> PathBuf {
    let name = if cfg!(windows) { "polideskd.exe" } else { "polideskd" };
    if let Some(p) = std::env::var_os("POLIDESKD").map(PathBuf::from) {
        return p;
    }
    if let Ok(me) = std::env::current_exe() {
        if let Some(d) = me.parent() {
            let p = d.join(name);
            if p.exists() {
                return p;
            }
        }
    }
    PathBuf::from(name)
}

/// Start polideskd in the background, detached from the caller (it keeps running after it exits).
pub fn spawn_daemon() -> Result<()> {
    let exe = daemon_exe();
    let mut cmd = std::process::Command::new(&exe);
    cmd.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
    }
    cmd.spawn().with_context(|| format!("Impossibile avviare {}", exe.display()))?;
    Ok(())
}

/// Read a JSON param: `p.str("scope")`, …
pub trait Params {
    fn str_of(&self, k: &str) -> Option<&str>;
    fn req(&self, k: &str) -> Result<&str>;
}
impl Params for Value {
    fn str_of(&self, k: &str) -> Option<&str> {
        self.get(k).and_then(Value::as_str).filter(|s| !s.is_empty())
    }
    fn req(&self, k: &str) -> Result<&str> {
        match self.str_of(k) {
            Some(s) => Ok(s),
            None => bail!("parametro mancante: {k}"),
        }
    }
}
