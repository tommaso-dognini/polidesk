// Starts the hidden browser on a public page and prints what the site sees (user agent, webdriver flag).
use std::sync::Arc;
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let login: polidesk_core::browser::LoginFn = Arc::new(|_, _| Box::pin(async { anyhow::bail!("nessun login in questo test") }));
    let s = polidesk_core::browser::Session::new(String::new(), Arc::new(|m| println!("{m}")), true, login);
    let page = s.start().await?;
    let ok = polidesk_core::browser::done(|u: String, _| async move { u.starts_with("https://www.polimi.it") });
    s.goto(&page, "https://www.polimi.it/", &ok, std::time::Duration::from_secs(30)).await?;
    let v = polidesk_core::browser::eval(&page, "({ ua: navigator.userAgent, webdriver: navigator.webdriver, title: document.title })").await?;
    println!("{v}");
    s.close().await;
    Ok(())
}
