//! One long-lived Chrome session with a persistent profile (chromiumoxide / CDP).
//! Session cookies (PoliMi SSO, RecMan, WebEx) are not kept by Chrome across restarts, so all cookies are
//! snapshotted to disk and restored on launch. The student logs in in the visible Chrome window when needed.
use crate::{paths, util};
use anyhow::{anyhow, bail, Result};
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::{Cookie, CookieParam, GetCookiesParams};
use chromiumoxide::cdp::browser_protocol::page::{CaptureScreenshotFormat, NavigateParams};
use chromiumoxide::cdp::js_protocol::runtime::EvaluateParams;
use chromiumoxide::page::{Page, ScreenshotParams};
use futures_util::StreamExt;
use regex::Regex;
use serde_json::Value;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub fn find_chrome() -> Result<PathBuf> {
    let mut c: Vec<PathBuf> = vec![];
    if let Some(p) = std::env::var_os("POLIREC_CHROME") {
        c.push(p.into());
    }
    for p in [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ] {
        c.push(p.into());
    }
    if let Some(l) = std::env::var_os("LOCALAPPDATA") {
        c.push(PathBuf::from(l).join("Google").join("Chrome").join("Application").join("chrome.exe"));
    }
    for p in [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
        "/usr/bin/microsoft-edge",
        "/usr/bin/brave-browser",
    ] {
        c.push(p.into());
    }
    c.into_iter().find(|p| p.exists()).ok_or_else(|| anyhow!("Google Chrome non trovato. Installa Chrome o imposta POLIREC_CHROME."))
}

// Pages where the student must act (SSO / SPID / IdP)
static LOGIN: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"webeep\.polimi\.it/login/",
        r"aunicalogin\.polimi\.it/aunicalogin/(aunicalogin\.jsp|federato|login)",
        r"spid\.polimi\.it",
        r"login\.polimi\.it",
        r"idp\.polimi\.it",
        r"posteid\.poste\.it",
        r"infocert\.it",
        r"aruba\.it",
        r"namirial",
        r"sielte",
        r"tim\.it",
        r"lepida",
        r"intesa\.it",
        r"register\.it",
        r"etna",
        r"teamsystem",
        r"(?i)webex\.com/.*(signin|login)",
        r"idbroker(-\w+)?\.webex\.com",
    ]
    .iter()
    .map(|r| Regex::new(r).unwrap())
    .collect()
});
pub fn is_login_url(u: &str) -> bool {
    LOGIN.iter().any(|r| r.is_match(u))
}

pub type Log = Arc<dyn Fn(String) + Send + Sync>;
/// `isDone(url, page)` predicate used while navigating.
pub type DoneFn<'a> = Box<dyn Fn(String, Page) -> Pin<Box<dyn Future<Output = bool> + Send + 'a>> + Send + Sync + 'a>;

/// Build a DoneFn from an async closure.
pub fn done<'a, F, Fut>(f: F) -> DoneFn<'a>
where
    F: Fn(String, Page) -> Fut + Send + Sync + 'a,
    Fut: Future<Output = bool> + Send + 'a,
{
    Box::new(move |u, p| Box::pin(f(u, p)))
}

struct Inner {
    browser: Browser,
    page: Page,
    handler: tokio::task::JoinHandle<()>,
}

pub struct Session {
    inner: Mutex<Option<Inner>>,
    pub email: String,
    log: Log,
    on_login_required: Arc<dyn Fn(String) + Send + Sync>,
}

impl Session {
    pub fn new(email: String, log: Log, on_login_required: Arc<dyn Fn(String) + Send + Sync>) -> Arc<Session> {
        Arc::new(Session { inner: Mutex::new(None), email, log, on_login_required })
    }
    pub fn log(&self, m: impl Into<String>) {
        (self.log)(m.into())
    }

    /// Start Chrome (once) and return the main page.
    pub async fn start(&self) -> Result<Page> {
        let mut g = self.inner.lock().await;
        if let Some(i) = g.as_ref() {
            return Ok(i.page.clone());
        }
        let profile = paths::profile_dir();
        std::fs::create_dir_all(&profile)?;
        self.wait_profile_free().await?;
        let cfg = BrowserConfig::builder()
            .chrome_executable(find_chrome()?)
            .with_head()
            .user_data_dir(&profile)
            .viewport(None)
            .disable_default_args()
            .args(["--lang=it-IT", "--window-size=1200,850", "--no-first-run", "--no-default-browser-check", "--disable-sync", "--password-store=basic", "--use-mock-keychain", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"])
            .launch_timeout(Duration::from_secs(60))
            .request_timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| anyhow!("{e}"))?;
        let (browser, mut h) = Browser::launch(cfg).await.map_err(|e| anyhow!("Avvio di Chrome non riuscito: {e}"))?;
        let handler = tokio::spawn(async move { while h.next().await.is_some() {} });
        let page = match browser.pages().await?.into_iter().next() {
            Some(p) => p,
            None => browser.new_page("about:blank").await?,
        };
        self.restore_cookies(&browser).await;
        *g = Some(Inner { browser, page: page.clone(), handler });
        Ok(page)
    }
    pub async fn page(&self) -> Result<Page> {
        self.start().await
    }
    pub async fn new_page(&self) -> Result<Page> {
        self.start().await?;
        let g = self.inner.lock().await;
        Ok(g.as_ref().unwrap().browser.new_page("about:blank").await?)
    }
    pub async fn is_open(&self) -> bool {
        self.inner.lock().await.is_some()
    }

    /// Only one Chrome can use the profile: if another PoliRec is syncing wait for it; remove stale locks.
    async fn wait_profile_free(&self) -> Result<()> {
        let dir = paths::profile_dir();
        let lock = dir.join("SingletonLock");
        let t0 = Instant::now();
        let mut told = false;
        loop {
            let target = std::fs::read_link(&lock).ok();
            if target.is_none() && std::fs::symlink_metadata(&lock).is_err() {
                return Ok(());
            }
            let pid: i32 = target.and_then(|t| t.to_string_lossy().rsplit('-').next().and_then(|p| p.parse().ok())).unwrap_or(0);
            if pid == 0 || !process_alive(pid) {
                for f in ["SingletonLock", "SingletonCookie", "SingletonSocket"] {
                    let _ = std::fs::remove_file(dir.join(f));
                }
                return Ok(());
            }
            if !told {
                self.log("⏳ Un'altra sincronizzazione PoliRec sta usando il browser: attendo che finisca…");
                told = true;
            }
            if t0.elapsed() > Duration::from_secs(15 * 60) {
                bail!("Browser occupato da un'altra sincronizzazione PoliRec");
            }
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    }

    async fn restore_cookies(&self, browser: &Browser) {
        let Ok(text) = std::fs::read_to_string(paths::cookies_file()) else { return };
        let r: Result<()> = async {
            let cookies: Vec<Cookie> = serde_json::from_str(&text)?;
            let now = util::now_ms() as f64 / 1000.0;
            let valid: Vec<CookieParam> = cookies
                .into_iter()
                .filter(|c| c.session || c.expires <= 0.0 || c.expires > now)
                .map(|c| {
                    let mut p = CookieParam::new(c.name, c.value);
                    p.domain = Some(c.domain);
                    p.path = Some(c.path);
                    p.secure = Some(c.secure);
                    p.http_only = Some(c.http_only);
                    p.same_site = c.same_site;
                    if !c.session && c.expires > 0.0 {
                        p.expires = Some(chromiumoxide::cdp::browser_protocol::network::TimeSinceEpoch::new(c.expires));
                    }
                    p
                })
                .collect();
            browser.set_cookies(valid).await?;
            Ok(())
        }
        .await;
        if let Err(e) = r {
            self.log(format!("⚠ Impossibile ripristinare i cookie: {e}"));
        }
    }

    pub async fn save_cookies(&self) {
        if !self.is_open().await {
            return;
        }
        let g = self.inner.lock().await;
        if let Some(i) = g.as_ref() {
            if let Ok(cookies) = i.browser.get_cookies().await {
                if let Ok(s) = serde_json::to_string(&cookies) {
                    let f = paths::cookies_file();
                    let _ = std::fs::write(&f, s);
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o600));
                    }
                }
            }
        }
    }

    /// "a=1; b=2" for requests made outside the browser.
    pub async fn cookie_header_for(&self, url: &str) -> Result<String> {
        let p = self.page().await?;
        let r = p.execute(GetCookiesParams::builder().urls(vec![url.to_string()]).build()).await?;
        Ok(r.result.cookies.iter().map(|c| format!("{}={}", c.name, c.value)).collect::<Vec<_>>().join("; "))
    }

    /// Navigate and wait until `is_done(url, page)`. If the flow stops on a login page, tell the
    /// student and wait (up to `login_timeout`) for them to complete it.
    pub async fn goto(&self, page: &Page, url: &str, is_done: &DoneFn<'_>, timeout: Duration) -> Result<String> {
        // don't wait for the load event: SSO pages keep loading; is_done polls the state instead
        let _ = tokio::time::timeout(Duration::from_secs(20), page.execute(NavigateParams::new(url))).await;
        self.wait_for(page, is_done, timeout, Duration::from_secs(15 * 60)).await
    }

    pub async fn wait_for(&self, page: &Page, is_done: &DoneFn<'_>, timeout: Duration, login_timeout: Duration) -> Result<String> {
        let mut deadline = Instant::now() + timeout;
        let mut notified = false;
        let mut login_since: Option<Instant> = None;
        let mut assisted = String::new();
        loop {
            let u = page.url().await.ok().flatten().unwrap_or_default();
            if is_done(u.clone(), page.clone()).await {
                if notified {
                    self.log("✓ Login completato");
                    self.save_cookies().await;
                }
                return Ok(u);
            }
            if is_login_url(&u) {
                // SSO hops often pass through by themselves: only bother the student if stuck for a while
                let since = *login_since.get_or_insert_with(Instant::now);
                let host = u.split('?').next().unwrap_or("").to_string();
                if assisted != host {
                    assisted = host;
                    let _ = self.auto_assist_login(page).await;
                }
                if since.elapsed() > Duration::from_secs(10) && !notified {
                    notified = true;
                    deadline = Instant::now() + login_timeout;
                    self.log("🔐 Login richiesto: completa l'accesso nella finestra di Chrome...");
                    (self.on_login_required)(u.clone());
                    let _ = page.bring_to_front().await;
                }
                if !notified {
                    deadline = deadline.max(Instant::now() + timeout);
                }
            } else {
                login_since = None;
            }
            if Instant::now() > deadline {
                self.debug_snapshot(page, "timeout").await;
                bail!("Timeout in attesa di: {u}");
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    /// Click obvious "go to SSO" buttons and type the e-mail on the WebEx identity broker.
    async fn auto_assist_login(&self, page: &Page) -> Result<()> {
        tokio::time::sleep(Duration::from_millis(800)).await;
        let u = page.url().await?.unwrap_or_default();
        static IDB: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"idbroker(-\w+)?\.webex\.com").unwrap());
        if IDB.is_match(&u) && !self.email.is_empty() {
            let typed = eval(page, &format!(
                r#"(() => {{ const email = {}; const i = document.querySelector('#IDToken1, input[type="email"], input[name="email"]'); if (!i || i.offsetParent === null) return false; i.focus(); i.value = email; i.dispatchEvent(new Event('input', {{ bubbles: true }})); i.dispatchEvent(new Event('change', {{ bubbles: true }})); return true; }})()"#,
                serde_json::to_string(&self.email)?
            ))
            .await?;
            if typed.as_bool() == Some(true) {
                tokio::time::sleep(Duration::from_millis(300)).await;
                eval(page, r#"(() => { const b = document.querySelector('#IDButton2, button[type="submit"], #md-form button'); if (b && !b.disabled) b.click(); else { const f = document.querySelector('#md-form, form'); if (f) f.requestSubmit ? f.requestSubmit() : f.submit(); } })()"#).await?;
                self.log("  ↪ email inserita su WebEx, proseguo con l'SSO PoliMi...");
            }
            return Ok(());
        }
        if u.contains("webeep.polimi.it/login/index.php") {
            eval(page, r#"(() => { const a = [...document.querySelectorAll('a')].find(a => /auth\/(shibboleth|saml|oauth)|auth=/.test(a.href) || /polimi|accedi con/i.test(a.innerText)); if (a) a.click(); })()"#).await?;
        }
        Ok(())
    }

    pub async fn debug_snapshot(&self, page: &Page, name: &str) {
        let dir = paths::debug_dir();
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let base = dir.join(format!("{}_{name}", util::now_iso().replace([':', '.'], "-")));
        if let Ok(png) = page.screenshot(ScreenshotParams::builder().format(CaptureScreenshotFormat::Png).full_page(true).build()).await {
            let _ = std::fs::write(base.with_extension("png"), png);
        }
        if let Ok(html) = page.content().await {
            let _ = std::fs::write(base.with_extension("html"), html);
        }
        self.log(format!("  (debug salvato in {}.png)", base.display()));
    }

    pub async fn close(&self) {
        if !self.is_open().await {
            return;
        }
        self.save_cookies().await;
        if let Some(mut i) = self.inner.lock().await.take() {
            let _ = tokio::time::timeout(Duration::from_secs(5), i.browser.close()).await;
            let _ = tokio::time::timeout(Duration::from_secs(5), i.browser.wait()).await;
            i.handler.abort();
        }
    }
}

fn process_alive(pid: i32) -> bool {
    #[cfg(unix)]
    {
        // signal 0: existence check; EPERM means it exists but belongs to someone else
        let r = unsafe { libc::kill(pid, 0) };
        r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

/// Evaluate a JS expression in the page (promises are awaited) and return its JSON value.
pub async fn eval(page: &Page, js: &str) -> Result<Value> {
    let p = EvaluateParams::builder().expression(js).await_promise(true).return_by_value(true).build().map_err(|e| anyhow!("{e}"))?;
    let r = page.evaluate_expression(p).await?;
    Ok(r.value().cloned().unwrap_or(Value::Null))
}
/// Evaluate `(fn)(arg)` with a JSON argument.
pub async fn call(page: &Page, func: &str, arg: &Value) -> Result<Value> {
    eval(page, &format!("({func})({})", serde_json::to_string(arg)?)).await
}
