//! `polidesk` — command line of PoliDesk and MCP server (`polidesk mcp`). A thin client of polideskd:
//! the daemon is started automatically when needed, and the app can stay open meanwhile.
mod cli;
mod mcp;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let r = if args.first().map(String::as_str) == Some("mcp") { mcp::run().await } else { cli::run(args).await };
    if let Err(e) = r {
        eprintln!("✗ {e}");
        std::process::exit(1);
    }
}
