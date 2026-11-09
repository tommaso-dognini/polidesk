'use strict';
// Single long-lived Chrome session with a persistent profile.
// Session cookies (PoliMi SSO, RecMan, WebEx) are not kept by Chrome across restarts,
// so we snapshot ALL cookies to disk and restore them on launch.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { PROFILE_DIR, COOKIES_FILE, DEBUG_DIR } = require('./paths');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const CHROME_CANDIDATES = [
    process.env.POLIREC_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
    const p = CHROME_CANDIDATES.find(c => fs.existsSync(c));
    if (!p) throw new Error('Google Chrome non trovato. Installa Chrome o imposta POLIREC_CHROME.');
    return p;
}

// Pages where the user must act (SSO / SPID / IdP)
const LOGIN_URL_PATTERNS = [
    /webeep\.polimi\.it\/login\//,
    /aunicalogin\.polimi\.it\/aunicalogin\/(aunicalogin\.jsp|federato|login)/,
    /spid\.polimi\.it/,
    /login\.polimi\.it/,
    /idp\.polimi\.it/,
    /posteid\.poste\.it/, /infocert\.it/, /aruba\.it/, /namirial/, /sielte/, /tim\.it/, /lepida/, /intesa\.it/, /register\.it/, /etna/, /teamsystem/,
    /webex\.com\/.*(signin|login)/i, /idbroker(-\w+)?\.webex\.com/,
];

class Session {
    constructor({ log = console.log, onLoginRequired = () => { }, headless = false, email = '' } = {}) {
        this.log = log;
        this.email = email; // PoliMi email, typed into the WebEx/Cisco login page
        this.onLoginRequired = onLoginRequired;
        this.headless = headless;
        this.browser = null;
        this.page = null;
    }

    async start() {
        if (this.browser) return this.page;
        fs.mkdirSync(PROFILE_DIR, { recursive: true });
        // Remove stale lock left by a crashed Chrome
        for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
            try { fs.unlinkSync(path.join(PROFILE_DIR, f)); } catch (e) { }
        }
        this.browser = await puppeteer.launch({
            executablePath: findChrome(),
            headless: this.headless,
            userDataDir: PROFILE_DIR,
            defaultViewport: null,
            args: ['--lang=it-IT', '--window-size=1200,850', '--no-first-run', '--no-default-browser-check'],
        });
        this.page = (await this.browser.pages())[0] || await this.browser.newPage();
        await this.restoreCookies();
        return this.page;
    }

    async cdp() {
        if (!this._cdp) this._cdp = await this.page.target().createCDPSession();
        return this._cdp;
    }

    async restoreCookies() {
        if (!fs.existsSync(COOKIES_FILE)) return;
        try {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
            const now = Date.now() / 1000;
            const valid = cookies.filter(c => c.session || !c.expires || c.expires < 0 || c.expires > now)
                .map(c => {
                    const o = { name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly };
                    if (c.sameSite) o.sameSite = c.sameSite;
                    if (!c.session && c.expires > 0) o.expires = c.expires;
                    return o;
                });
            await (await this.cdp()).send('Network.setCookies', { cookies: valid });
        } catch (e) {
            this.log(`⚠ Impossibile ripristinare i cookie: ${e.message}`);
        }
    }

    async saveCookies() {
        if (!this.browser) return;
        try {
            const { cookies } = await (await this.cdp()).send('Network.getAllCookies');
            fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies), { mode: 0o600 });
        } catch (e) { }
    }

    async allCookies() {
        const { cookies } = await (await this.cdp()).send('Network.getAllCookies');
        return cookies;
    }

    async cookieHeaderFor(url) {
        const { cookies } = await (await this.cdp()).send('Network.getCookies', { urls: [url] });
        return cookies.map(c => `${c.name}=${c.value}`).join('; ');
    }

    isLoginUrl(url) {
        return LOGIN_URL_PATTERNS.some(re => re.test(url));
    }

    /**
     * Navigate and wait until `isDone(url, page)` is true. If the flow stops on a login
     * page, notify the user and wait (up to `loginTimeout`) for them to complete it.
     */
    async goto(url, isDone, { timeout = 45000, loginTimeout = 15 * 60000, page = this.page } = {}) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout });
        } catch (e) {
            if (!/timeout|net::ERR_ABORTED/i.test(e.message)) throw e;
        }
        return this.waitFor(isDone, { timeout, loginTimeout, page });
    }

    async waitFor(isDone, { timeout = 45000, loginTimeout = 15 * 60000, page = this.page } = {}) {
        let deadline = Date.now() + timeout;
        let notified = false;
        let loginSince = 0;
        let assisted = '';
        while (true) {
            const u = page.url();
            let done = false;
            try { done = await isDone(u, page); } catch (e) { }
            if (done) {
                if (notified) { this.log('✓ Login completato'); await this.saveCookies(); }
                return u;
            }
            if (this.isLoginUrl(u)) {
                // SSO hops (aunicalogin.jsp, idbroker…) often pass through by themselves: only bother
                // the user if we're stuck on a login page for a few seconds.
                if (!loginSince) loginSince = Date.now();
                const host = u.split('?')[0];
                if (assisted !== host) { assisted = host; await this.autoAssistLogin(page).catch(() => { }); }
                if (Date.now() - loginSince > 10000 && !notified) {
                    notified = true;
                    deadline = Date.now() + loginTimeout;
                    this.log('🔐 Login richiesto: completa l\'accesso nella finestra di Chrome...');
                    this.onLoginRequired(u);
                    try { await page.bringToFront(); } catch (e) { }
                }
                if (!notified) deadline = Math.max(deadline, Date.now() + timeout);
            } else loginSince = 0;
            if (Date.now() > deadline) {
                await this.debugSnapshot(page, 'timeout');
                throw new Error(`Timeout in attesa di: ${u}`);
            }
            await sleep(1000);
        }
    }

    // Click obvious "go to SSO" buttons so the user lands straight on the PoliMi login.
    async autoAssistLogin(page) {
        await sleep(800);
        const u = page.url();
        // Cisco WebEx identity broker asks for the e-mail, then federates to the PoliMi SSO
        if (/idbroker(-\w+)?\.webex\.com/.test(u) && this.email) {
            const typed = await page.evaluate(email => {
                const i = document.querySelector('#IDToken1, input[type="email"], input[name="email"]');
                if (!i || i.offsetParent === null) return false;
                i.focus(); i.value = email;
                i.dispatchEvent(new Event('input', { bubbles: true }));
                i.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }, this.email);
            if (typed) {
                await sleep(300);
                await page.evaluate(() => {
                    const b = document.querySelector('#IDButton2, button[type="submit"], #md-form button');
                    if (b && !b.disabled) b.click(); else { const f = document.querySelector('#md-form, form'); if (f) f.requestSubmit ? f.requestSubmit() : f.submit(); }
                });
                this.log('  ↪ email inserita su WebEx, proseguo con l\'SSO PoliMi...');
            }
            return;
        }
        if (/webeep\.polimi\.it\/login\/index\.php/.test(u)) {
            await page.evaluate(() => {
                const a = [...document.querySelectorAll('a')].find(a => /auth\/(shibboleth|saml|oauth)|auth=/.test(a.href) || /polimi|accedi con/i.test(a.innerText));
                if (a) a.click();
            });
        }
    }

    async debugSnapshot(page, name) {
        try {
            fs.mkdirSync(DEBUG_DIR, { recursive: true });
            const base = path.join(DEBUG_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}_${name}`);
            await page.screenshot({ path: base + '.png', fullPage: true });
            fs.writeFileSync(base + '.html', await page.content());
            this.log(`  (debug salvato in ${base}.png)`);
        } catch (e) { }
    }

    async close() {
        if (!this.browser) return;
        await this.saveCookies();
        await this.browser.close().catch(() => { });
        this.browser = null; this.page = null; this._cdp = null;
    }
}

module.exports = { Session, sleep };
