'use strict';
// Electron main process: the window and what only a desktop UI can do (dialogs, theme, clipboard,
// notifications, PDF rendering, the media:// video protocol). Everything else lives in polideskd, the
// Rust backend (crates/): this file forwards the renderer's IPC calls to it and relays its events.
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, nativeTheme, protocol, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { DaemonClient, APP_DIR, migrateLegacy } = require('./daemon-client');
const pkg = require('../package.json');

// renamed from PoliRec: keep the app's own browser data (login window session, page preferences)
try {
    const ud = app.getPath('userData');
    if (!fs.existsSync(ud)) for (const n of ['PoliRec', 'polirec']) {
        const o = path.join(app.getPath('appData'), n);
        if (fs.existsSync(o)) { fs.renameSync(o, ud); break; }
    }
} catch (e) { }

let win = null;
let lessonWin = null;                           // "Modalità appunti": the lesson in its own window
const alive = w => w && !w.isDestroyed();
const send = evt => { for (const w of [win, lessonWin]) if (alive(w)) w.webContents.send('evt', evt); };
const sendMain = evt => { if (alive(win)) win.webContents.send('evt', evt); };
const notify = body => { if (Notification.isSupported()) new Notification({ title: 'PoliDesk', body }).show(); };

// ---------- polideskd ----------
const unpacked = p => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep).replace(/app\.asar$/, 'app.asar.unpacked');
const exe = n => n + (process.platform === 'win32' ? '.exe' : '');
function daemonBin() {
    if (process.env.POLIDESKD) return process.env.POLIDESKD;
    if (app.isPackaged) return path.join(process.resourcesPath, 'bin', exe('polideskd'));
    // development: the newest local build
    const root = path.join(__dirname, '..');
    const c = ['release', 'debug'].map(p => path.join(root, 'target', p, exe('polideskd'))).filter(f => fs.existsSync(f));
    if (!c.length) throw new Error('polideskd non compilato: esegui «npm run build:rust»');
    return c.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
function ffmpegStatic() {
    try { const p = unpacked(require('ffmpeg-static')); return p && fs.existsSync(p) ? p : ''; } catch (e) { return ''; }
}
const appRoot = () => unpacked(app.getAppPath());
/** Tell the daemon (also one started later from the terminal) where the app files are. */
function writeRuntime() {
    try {
        fs.mkdirSync(APP_DIR, { recursive: true });
        fs.writeFileSync(path.join(APP_DIR, 'runtime.json'), JSON.stringify({ appRoot: appRoot(), ffmpeg: ffmpegStatic(), app: app.getVersion(), bin: path.dirname(daemonBin()) }, null, 2));
    } catch (e) { }
}

const daemon = new DaemonClient({
    bin: (() => { try { return daemonBin(); } catch (e) { return ''; } })(),
    env: { POLIDESK_APP_ROOT: appRoot(), POLIDESK_FFMPEG: ffmpegStatic() },
    log: m => console.log('[polideskd]', m),
    onEvent: e => {
        if (e.type === 'notify') return notify(e.body);
        if (e.type === 'login-required' && e.id) openLogin(e);
        send(e);
    },
});

// ---------- login window ----------
// Sync runs in a hidden Chrome. When PoliMi/SPID/WebEx asks for a login, the student does it here, in an
// app window with its own persistent session; its cookies are then handed to the hidden browser.
const LOGIN_RX = [
    /webeep\.polimi\.it\/login\//, /aunicalogin\.polimi\.it\/aunicalogin\/(aunicalogin\.jsp|federato|login)/, /spid\.polimi\.it/, /login\.polimi\.it/, /idp\.polimi\.it/,
    /posteid\.poste\.it/, /infocert\.it/, /aruba\.it/, /namirial/, /sielte/, /tim\.it/, /lepida/, /intesa\.it/, /register\.it/, /etna/, /teamsystem/,
    /webex\.com\/.*(signin|login)/i, /idbroker(-\w+)?\.webex\.com/,
];
const isLogin = u => LOGIN_RX.some(r => r.test(u));
const SAME_SITE = { no_restriction: 'None', lax: 'Lax', strict: 'Strict' };
/** Electron cookie → Chrome DevTools Protocol cookie */
const toCdp = c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly, session: !!c.session, expires: c.expirationDate || -1, ...(SAME_SITE[c.sameSite] ? { sameSite: SAME_SITE[c.sameSite] } : {}) });
const logins = new Map();

function openLogin({ id, url, email }) {
    if (logins.has(id)) return;
    let targetHost = ''; try { targetHost = new URL(url).host; } catch (e) { }
    const lw = new BrowserWindow({
        width: 540, height: 780, minWidth: 420, minHeight: 560, title: 'Accedi al Politecnico', parent: win && !win.isDestroyed() ? win : undefined,
        autoHideMenuBar: true, backgroundColor: '#ffffff', show: false,
        // partition name from before the rename (keeps the login session)
        webPreferences: { partition: 'persist:polirec-login', contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    logins.set(id, lw);
    let sawLogin = false, done = false, assisted = '';
    const check = async () => {
        if (done || lw.isDestroyed()) return;
        const u = lw.webContents.getURL();
        if (isLogin(u)) {
            sawLogin = true;
            if (!lw.isVisible()) { lw.show(); lw.focus(); }
            // same help as the hidden browser: e-mail on the WebEx broker, SSO button on WeBeep
            const host = u.split('?')[0];
            if (assisted !== host) {
                assisted = host;
                const js = /idbroker(-\w+)?\.webex\.com/.test(u) && email
                    ? `(() => { const i = document.querySelector('#IDToken1, input[type="email"], input[name="email"]'); if (i && !i.value) { i.value = ${JSON.stringify(email)}; i.dispatchEvent(new Event('input', { bubbles: true })); } })()`
                    : /webeep\.polimi\.it\/login\/index\.php/.test(u)
                        ? `(() => { const a = [...document.querySelectorAll('a')].find(a => /auth\\/(shibboleth|saml|oauth)|auth=/.test(a.href) || /polimi|accedi con/i.test(a.innerText)); if (a) a.click(); })()`
                        : '';
                if (js) setTimeout(() => !lw.isDestroyed() && lw.webContents.executeJavaScript(js).catch(() => { }), 700);
            }
            return;
        }
        let host = ''; try { host = new URL(u).host; } catch (e) { }
        if (!lw.webContents.isLoading() && host && (sawLogin || host === targetHost)) {
            done = true;
            const cookies = (await lw.webContents.session.cookies.get({})).map(toCdp);
            await daemon.request('login:done', { id, cookies }).catch(() => { });
            send({ type: 'login-done' });
            lw.close();
        }
    };
    for (const ev of ['did-finish-load', 'did-navigate', 'did-navigate-in-page', 'did-stop-loading']) lw.webContents.on(ev, () => setTimeout(check, 300));
    lw.webContents.setWindowOpenHandler(({ url: u }) => { lw.loadURL(u); return { action: 'deny' }; });
    // already logged in (cookies of this window still valid): it finishes without showing itself
    setTimeout(() => { if (!done && !lw.isDestroyed() && !lw.isVisible()) { lw.show(); lw.focus(); } }, 4000);
    lw.on('closed', () => { logins.delete(id); if (!done) { daemon.request('login:cancel', { id }).catch(() => { }); send({ type: 'login-done', cancelled: true }); } });
    lw.loadURL(url);
}

// ---------- IPC ----------
// binary payloads (pasted images, dictation audio) travel as base64
const toWire = (ch, arg) => {
    if ((ch === 'notes:asset' || ch === 'dictate') && arg && arg.data) return { ...arg, data: { $b64: Buffer.from(arg.data).toString('base64') } };
    return arg === undefined ? null : arg;
};
const local = new Map();
const handle = (ch, fn) => { local.set(ch, true); ipcMain.handle(ch, async (e, arg) => fn(arg)); };
const forward = ch => ipcMain.handle(ch, async (e, arg) => daemon.request(ch, toWire(ch, arg)));

handle('pick-dir', async def => {
    const st = await daemon.request('state').catch(() => ({ settings: {} }));
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: def || st.settings.defaultRoot || undefined });
    return r.canceled ? null : r.filePaths[0];
});
// files to upload among the notes (PDF, photos of handwritten notes, slides…)
handle('pick-files', async () => {
    const r = await dialog.showOpenDialog(win, {
        title: 'Carica appunti', buttonLabel: 'Carica', properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Appunti e documenti', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'webp', 'gif', 'doc', 'docx', 'odt', 'rtf', 'pages', 'ppt', 'pptx', 'key', 'odp', 'xls', 'xlsx', 'numbers', 'csv', 'txt', 'md', 'tex', 'typ', 'ipynb', 'zip', 'goodnotes', 'note'] }, { name: 'Tutti i file', extensions: ['*'] }],
    });
    return r.canceled ? [] : r.filePaths;
});
handle('appearance', async a => { nativeTheme.themeSource = a === 'light' ? 'light' : a === 'dark' ? 'dark' : 'system'; return true; });
handle('clipboard:write', async text => { clipboard.writeText(String(text || '')); return true; });
handle('open-external', async url => { if (/^https?:\/\//.test(url)) await shell.openExternal(url); return true; });
handle('reveal', async p => { shell.showItemInFolder(p); return true; });
handle('cal:revealIcs', async () => { shell.showItemInFolder(await daemon.request('cal:icsPath')); return true; });
handle('cal:importIcs', async src => {
    if (!src) {
        const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Calendario', extensions: ['ics'] }] });
        if (r.canceled) return 0;
        src = r.filePaths[0];
    }
    return daemon.request('cal:importIcs', src);
});

// ---------- "Modalità appunti": the lesson (player + transcript) in a second window ----------
// The main window stays free for notes, the course page and the rest of the app.
const lessonQuery = o => ({ popout: '1', course: String(o.courseId || ''), key: String(o.key || ''), t: String(Math.floor(o.t || 0)), play: o.playing ? '1' : '' });
handle('lesson:popout', async o => {
    if (alive(lessonWin)) {
        lessonWin.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: lessonQuery(o) });
        lessonWin.show(); lessonWin.focus();
        return true;
    }
    const b = alive(win) ? win.getBounds() : { x: 80, y: 80, width: 1320, height: 860 };
    lessonWin = new BrowserWindow({
        width: 900, height: 760, minWidth: 520, minHeight: 420,
        x: b.x + Math.max(0, b.width - 900 - 24), y: b.y + 40,
        title: o.title ? `${o.title} — PoliDesk` : 'Lezione — PoliDesk',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, plugins: true },
    });
    lessonWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    lessonWin.on('closed', () => { lessonWin = null; sendMain({ type: 'lesson-window', open: false }); });
    lessonWin.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: lessonQuery(o) });
    sendMain({ type: 'lesson-window', open: true, courseId: o.courseId, key: o.key });
    return true;
});
// back into the main window, at the same point of the video
handle('lesson:popin', async o => {
    sendMain({ type: 'lesson-popin', courseId: o.courseId, key: o.key, t: o.t || 0, playing: !!o.playing });
    if (alive(win)) { win.show(); win.focus(); }
    if (alive(lessonWin)) lessonWin.close();
    return true;
});
// from the lesson window: open a page (notes, course…) in the main window
handle('lesson:mainGo', async route => {
    sendMain({ type: 'lesson-go', route });
    if (alive(win)) { win.show(); win.focus(); }
    return true;
});
handle('lesson:isOpen', async () => alive(lessonWin));

/** Markdown → PDF via an offscreen window (same KaTeX CSS as the preview). */
async function mdToPdf(html, out) {
    const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    const css = fs.readFileSync(path.join(__dirname, 'renderer', 'vendor', 'katex.min.css'), 'utf8').replace(/url\(fonts\//g, `url(${pathToFileURL(path.join(__dirname, 'renderer', 'vendor', 'fonts')).href}/`);
    const page = `<!doctype html><meta charset="utf-8"><style>${css} body{font:11pt/1.55 -apple-system,"Segoe UI",sans-serif;max-width:720px;margin:24px auto;color:#111} pre,code{font-family:Menlo,monospace;font-size:.9em} pre{background:#f4f4f4;padding:10px;border-radius:6px} img{max-width:100%} blockquote{border-left:3px solid #ddd;margin:0;padding-left:12px;color:#555}</style>${html}`;
    const tmp = path.join(os.tmpdir(), `polidesk-${Date.now()}.html`);
    fs.writeFileSync(tmp, page);
    await w.loadFile(tmp);
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } });
    fs.writeFileSync(out, pdf); w.destroy(); fs.unlinkSync(tmp);
    return out;
}
handle('notes:exportPdf', async ({ html, out }) => { await mdToPdf(html, out); shell.showItemInFolder(out); return out; });
// Markdown notes are rendered to PDF here; everything else (Notion, Apple Notes, Obsidian, LaTeX/Typst) in the daemon
handle('notes:exportTo', async a => {
    const needsPdf = ['pdf', 'goodnotes', 'notability'].includes(a.target) && /\.md$/i.test(a.file);
    if (needsPdf) {
        const abs = await daemon.request('notes:path', { scope: a.scope, file: a.file });
        const pdf = await mdToPdf(a.html, abs.replace(/\.md$/i, '.pdf'));
        if (a.target === 'pdf') { shell.showItemInFolder(pdf); return { pdf }; }
        return daemon.request('notes:exportTo', { ...a, pdf });
    }
    return daemon.request('notes:exportTo', a);
});

// about / donate / updates
const meta = pkg.polidesk || {};
handle('about', async () => {
    const d = await daemon.request('daemon:info').catch(() => ({}));
    return {
        version: app.getVersion(), name: pkg.productName || 'PoliDesk', donateUrl: meta.donateUrl || '', repo: meta.repo || '',
        electron: process.versions.electron, platform: `${process.platform} ${process.arch}`, dataDir: APP_DIR, backend: d.version ? `polideskd ${d.version}` : '',
    };
});
handle('about:notice', async () => { const p = path.join(__dirname, '..', 'NOTICE.md'); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; });
handle('update:check', async () => {
    if (!meta.repo) return null;
    const r = await fetch(`https://api.github.com/repos/${meta.repo}/releases/latest`, { headers: { 'User-Agent': 'PoliDesk' } });
    if (!r.ok) return null;
    const j = await r.json();
    const latest = String(j.tag_name || '').replace(/^v/, '');
    return latest && latest.localeCompare(app.getVersion(), undefined, { numeric: true }) > 0 ? { version: latest, url: j.html_url } : null;
});

/** Every other channel of the preload goes to polideskd (same names). */
function forwardAll() {
    const channels = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8').match(/invoke\('([^']+)'/g).map(s => s.slice(8, -1));
    for (const ch of new Set(channels)) if (!local.has(ch)) forward(ch);
    daemon.required = [...new Set(channels)].filter(ch => !local.has(ch));
}

// ---------- window ----------
// media:// serves local videos (with HTTP range support, so seeking works) to the in-app player
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }]);

async function createWindow() {
    const st = await daemon.request('state').catch(() => ({ settings: { ui: {} } }));
    const appearance = (st.settings.ui || {}).appearance;
    nativeTheme.themeSource = appearance === 'light' ? 'light' : appearance === 'dark' ? 'dark' : 'system';
    win = new BrowserWindow({
        width: 1320, height: 860, minWidth: 960, minHeight: 620,
        title: 'PoliDesk',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 18, y: 20 },
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, plugins: true },
    });
    // microphone for dictation, video full screen; everything else denied
    const allowed = new Set(['media', 'notifications', 'fullscreen']);
    win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm)));
    win.webContents.session.setPermissionCheckHandler((wc, perm) => allowed.has(perm));
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    win.on('closed', () => { if (alive(lessonWin)) lessonWin.close(); });
    win.on('focus', () => daemon.request('cloud:autopull').catch(() => { }));
    win.webContents.on('console-message', e => { if (e.level === 'warning' || e.level === 'error') console.error('[renderer]', e.message); });
    win.webContents.once('did-finish-load', () => { if (!process.env.POLIDESK_SMOKE) daemon.request('app:ready').catch(() => { }); });
    // POLIDESK_SMOKE=out.png [POLIDESK_SMOKE_JS=code]: render, screenshot, quit (automated UI checks)
    if (process.env.POLIDESK_SMOKE) {
        win.webContents.setBackgroundThrottling(false);
        win.webContents.once('did-finish-load', () => setTimeout(async () => {
            if (process.env.POLIDESK_SMOKE_JS) { await win.webContents.executeJavaScript(process.env.POLIDESK_SMOKE_JS).catch(e => console.error(e)); await new Promise(r => setTimeout(r, 1500)); }
            fs.writeFileSync(process.env.POLIDESK_SMOKE, (await win.webContents.capturePage()).toPNG());
            app.quit();
        }, 2000));
    }
}

// Local video with HTTP Range support (needed for seeking in <video>)
function serveMedia(req) {
    if (new URL(req.url).host === 'stream') return serveStream(req);
    const p = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
    let st;
    try { st = fs.statSync(p); } catch (e) { return new Response('not found', { status: 404 }); }
    const type = /\.webm$/i.test(p) ? 'video/webm' : /\.m4a$/i.test(p) ? 'audio/mp4' : 'video/mp4';
    const range = req.headers.get('range');
    const toWeb = (start, end) => require('stream').Readable.toWeb(fs.createReadStream(p, { start, end }));
    if (range) {
        const m = range.match(/bytes=(\d*)-(\d*)/);
        let start = m && m[1] ? Number(m[1]) : 0;
        let end = m && m[2] ? Number(m[2]) : st.size - 1;
        if (m && !m[1] && m[2]) { start = st.size - Number(m[2]); end = st.size - 1; }
        end = Math.min(end, st.size - 1);
        if (start >= st.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
        return new Response(toWeb(start, end), { status: 206, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${st.size}` } });
    }
    return new Response(toWeb(0, st.size - 1), { status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(st.size) } });
}

// media://stream/<token>/… — lessons watched without downloading them. polideskd gives the real URL (WebEx,
// signed, expires) and the headers; this proxies it: Range requests for mp4, playlists rewritten for HLS so
// every segment comes back through here too (the page never sees tokens or cookies).
const streamTargets = new Map();
async function streamTarget(token) {
    let t = streamTargets.get(token);
    if (!t) { t = await daemon.request('rec:streamTarget', { token }); streamTargets.set(token, t); }
    return t;
}
const b64u = s => Buffer.from(s).toString('base64url');
async function serveStream(req) {
    try {
        const [, token, ...rest] = new URL(req.url).pathname.split('/');
        const t = await streamTarget(token);
        const url = rest[0] === 'u' ? Buffer.from(rest[1] || '', 'base64url').toString() : t.url;
        const headers = { ...t.headers };
        const range = req.headers.get('range');
        if (range) headers.Range = range;
        const r = await fetch(url, { headers, redirect: 'follow', signal: req.signal });
        const type = r.headers.get('content-type') || '';
        if (/mpegurl/i.test(type) || /\.m3u8($|\?)/i.test(new URL(r.url).pathname)) {
            const base = r.url, prox = u => `media://stream/${token}/u/${b64u(new URL(u, base).href)}`;
            const text = (await r.text()).split('\n').map(l => {
                const s = l.trim();
                if (!s) return l;
                if (s.startsWith('#')) return l.replace(/URI="([^"]+)"/g, (_, u) => `URI="${prox(u)}"`);
                return prox(s);
            }).join('\n');
            return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' } });
        }
        const out = new Headers();
        for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (r.headers.get(k)) out.set(k, r.headers.get(k));
        if (!out.get('content-type') || /octet-stream|download/i.test(out.get('content-type'))) out.set('content-type', rest[0] === 'u' ? 'video/mp2t' : 'video/mp4');
        return new Response(r.body, { status: r.status, headers: out });
    } catch (e) {
        if (e.name === 'AbortError') return new Response(null, { status: 499 });
        return new Response(String(e.message || e), { status: 502 });
    }
}

app.whenReady().then(async () => {
    await migrateLegacy(m => console.log('[polideskd]', m));
    // development: show the PoliDesk icon in the Dock (packaged builds get it from electron-builder)
    if (!app.isPackaged && process.platform === 'darwin' && app.dock) try { app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png')); } catch (e) { }
    writeRuntime();
    forwardAll();
    protocol.handle('media', req => serveMedia(req));
    try { await daemon.connect(); }
    catch (e) { dialog.showErrorBox('PoliDesk', `Impossibile avviare il motore di PoliDesk (polideskd).\n\n${e.message}`); }
    await createWindow();
});
// the daemon keeps running: downloads, transcriptions and AI jobs continue with the window closed
app.on('window-all-closed', () => { daemon.close(); app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
