//! polideskd — PoliDesk's always-on local server.
//!
//! Owns everything that is not UI: course library, notes, AI queue, transcription queue, sync with
//! WeBeep/RecMan/WebEx, semantic index. The Electron app, the `polidesk` CLI and the MCP server are
//! thin clients that talk to it over a local socket (see `polidesk_core::rpc`), so downloads and
//! transcriptions keep running when the window is closed and every client sees the same state.
mod activity;
mod api_methods;
mod pn_methods;
mod stream_methods;
mod daemon;
mod dispatch;
mod methods;
mod server;

use anyhow::Result;
use polidesk_core::paths;

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("polideskd {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!(
            "polideskd {} — server locale di PoliDesk\n\nUso: polideskd [--version]\n\nDati:   {}\nSocket: {}\nVariabili: POLIDESK_HOME (cartella dati), POLIDESK_APP_ROOT (cartella dell'app, per gli script python/)",
            env!("CARGO_PKG_VERSION"),
            paths::app_dir().display(),
            paths::socket_path().display()
        );
        return Ok(());
    }
    let rt = tokio::runtime::Builder::new_multi_thread().worker_threads(4).enable_all().thread_name("polideskd").build()?;
    rt.block_on(server::run())
}
