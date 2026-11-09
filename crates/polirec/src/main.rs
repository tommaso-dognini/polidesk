//! `polirec` — command line client of polirecd (and MCP server with `polirec mcp`).
use anyhow::Result;
use polirec_core::rpc::Client;
use serde_json::Value;

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("call") => {
            let c = Client::connect("cli").await?;
            let params: Value = args.get(2).map(|s| serde_json::from_str(s)).transpose()?.unwrap_or(Value::Null);
            let r = c.call(&args[1], params).await?;
            println!("{}", serde_json::to_string_pretty(&r)?);
        }
        _ => eprintln!("uso: polirec call <metodo> [json]"),
    }
    Ok(())
}
