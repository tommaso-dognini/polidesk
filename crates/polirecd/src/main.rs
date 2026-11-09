//! polirecd — PoliRec's always-on local server.
//!
//! Owns everything that is not UI: course library, notes, AI queue, transcription queue, sync with
//! WeBeep/RecMan/WebEx, semantic index. The Electron app, the `polirec` CLI and the MCP server are
//! thin clients that talk to it over a local socket (see `polirec_core::rpc`), so downloads and
//! transcriptions keep running when the window is closed and every client sees the same state.
mod daemon;
mod dispatch;
mod methods;
mod server;

use anyhow::Result;
use polirec_core::paths;

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("polirecd {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!(
            "polirecd {} — server locale di PoliRec\n\nUso: polirecd [--version]\n\nDati:   {}\nSocket: {}\nVariabili: POLIREC_HOME (cartella dati), POLIREC_APP_ROOT (cartella dell'app, per gli script python/)",
            env!("CARGO_PKG_VERSION"),
            paths::app_dir().display(),
            paths::socket_path().display()
        );
        return Ok(());
    }
    let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(4).enable_all().thread_name("polirecd").build()?;
    rt.block_on(server::run())
}
