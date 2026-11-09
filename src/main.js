'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, nativeTheme, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const { Session } = require('./core/browser');
const webeep = require('./core/webeep');
const lib = require('./core/library');
const { syncCourse } = require('./core/sync');
const { Transcriber, checkWhisper } = require('./core/transcriber');
const ai = require('./core/ai');
const dl = require('./core/downloader');
const setup = require('./core/setup');
const cleaner = require('./core/cleaner');
const extra = require('./ipc-extra');

let win = null;
let session = null;
let syncing = false;
let stopRequested = false;
let syncQueue = [];          // course ids waiting, in priority order
let syncCurrent = null;

// Config is always re-read from disk: the CLI (or another window) may have changed it.
const cfg = () => lib.loadConfig();
const findCourse = id => cfg().courses.find(c => c.id === id);
function patchCourse(id, patch) { lib.patchCourse(id, patch); }
function patchSettings(fn) { const c = cfg(); fn(c.settings); lib.saveConfig(c); return c.settings; }

function send(evt) { if (win && !win.isDestroyed()) win.webContents.send('evt', evt); }
function log(msg, course) { send({ type: 'log', msg, course }); }
function notify(body) { if (Notification.isSupported()) new Notification({ title: 'PoliRec', body }).show(); }

function getSession() {
    if (!session) {
        session = new Session({
            email: cfg().settings.polimiEmail,
            log: msg => log(msg),
            onLoginRequired: () => { send({ type: 'login-required' }); notify('Login richiesto: completa l\'accesso nella finestra di Chrome.'); },
        });
    }
    return session;
}
async function closeSession() { if (session) { await session.close(); session = null; } }

// ---------- pipeline: download → transcription → summary → index ----------
const transcriber = new Transcriber({
    emit: evt => { send(evt); if (evt.type === 'transcribe-done' || evt.type === 'transcribe-error') send({ type: 'refresh' }); },
});

function transcriptionOpts(course) {
    const t = cfg().settings.transcription;
    return { ...t, ...(course.language ? { language: course.language } : {}) };
}

function queueTranscription(course, rec) {
    const dirs = lib.courseDirs(course.dir);
    const video = path.join(dirs.video, rec.file);
    if (!fs.existsSync(video)) return;
    transcriber.enqueue(video, dirs.transcripts, transcriptionOpts(course))
        .then(async res => {
            if (!res) return;
            // remove fillers (ehm, mmm…) and Whisper hallucinations; originals kept in trascrizioni/.orig
            if (cfg().settings.transcription.clean !== false) {
                try { cleaner.cleanTranscriptFiles(dirs.transcripts, rec.file.replace(/\.mp4$/i, '')); } catch (e) { log('⚠ Pulizia trascrizione: ' + e.message, course.id); }
            }
            const s = cfg().settings.ai;
            if (s.autoSummary) await generateNotes(course, rec.key, 'sommario').catch(e => log('✗ Sommario: ' + e.message, course.id));
            if (s.autoNotes) await generateNotes(course, rec.key, 'appunti').catch(e => log('✗ Note: ' + e.message, course.id));
            lib.writeIndex(course.dir, lib.loadManifest(course.dir));
            send({ type: 'refresh' });
        })
        .catch(e => log(`✗ Trascrizione ${rec.file}: ${e.message}`, course.id));
}

async function generateNotes(course, key, template, provider) {
    const m = lib.loadManifest(course.dir);
    const rec = m.recordings[key];
    if (!rec) throw new Error('registrazione non trovata');
    const st = lib.fileStatus(course.dir, rec);
    if (!st.transcript) throw new Error('trascrizione mancante: trascrivi prima la lezione');
    const dirs = lib.courseDirs(course.dir);
    const s = cfg().settings.ai;
    const prov = provider || s.provider;
    const jobId = crypto.randomUUID();
    send({ type: 'ai-start', jobId, course: course.id, key, template, provider: prov });
    try {
        const name = await ai.generateNote({
            provider: prov, model: s.model, template,
            transcriptPath: path.join(dirs.transcripts, st.transcript), notesDir: dirs.notes,
            title: `${rec.topic || ''} (${(rec.isoDate || '').slice(0, 10)})`,
            onChunk: c => send({ type: 'ai-chunk', jobId, chunk: c }),
        });
        send({ type: 'ai-done', jobId, course: course.id, key, file: name });
        lib.writeIndex(course.dir, lib.loadManifest(course.dir));
        send({ type: 'refresh' });
        return name;
    } catch (e) { send({ type: 'ai-error', jobId, error: e.message }); throw e; }
}

// ---------- sync queue (priority = order of courses in the dashboard) ----------
function enqueueSync(ids) {
    const all = cfg().courses;
    const wanted = (ids && ids.length ? ids : all.filter(c => c.autoSync !== false).map(c => c.id));
    for (const c of all) if (wanted.includes(c.id) && !syncQueue.includes(c.id) && syncCurrent !== c.id) syncQueue.push(c.id);
    send({ type: 'sync-queue', queue: syncQueue, current: syncCurrent });
    if (!syncing) runSyncQueue();
}

async function runSyncQueue() {
    syncing = true; stopRequested = false;
    send({ type: 'sync-state', syncing });
    let total = 0;
    try {
        while (syncQueue.length && !stopRequested) {
            const id = syncQueue.shift();
            const c = findCourse(id);
            if (!c) continue;
            syncCurrent = id;
            send({ type: 'sync-queue', queue: syncQueue, current: syncCurrent });
            send({ type: 'sync-course', course: id, state: 'running' });
            try {
                const s = cfg().settings;
                const opts = {
                    parallel: s.parallelDownloads,
                    shouldStop: () => stopRequested,
                    emit: evt => {
                        send({ ...evt, course: id });
                        if (evt.type === 'downloaded' && cfg().settings.transcription.auto && cfg().settings.setupDone) {
                            const m = lib.loadManifest(c.dir);
                            if (m.recordings[evt.key]) queueTranscription(c, m.recordings[evt.key]);
                        }
                    },
                };
                let r;
                try { r = await syncCourse(getSession(), c, opts); }
                catch (e) {
                    // browser/page died mid-sync (closed window, crash): restart the session once
                    if (!/detached|Target closed|Session closed|Protocol error|Navigating frame was detached/i.test(e.message) || stopRequested) throw e;
                    log('↻ Sessione del browser interrotta, riprovo…', id);
                    await closeSession().catch(() => { });
                    r = await syncCourse(getSession(), c, opts);
                }
                patchCourse(id, { webeepId: c.webeepId, name: c.name, lastSync: new Date().toISOString(), lastError: null });
                total += r.downloaded || 0;
                send({ type: 'sync-course', course: id, state: 'done', result: r });
            } catch (e) {
                patchCourse(id, { lastError: e.message });
                log(`✗ ${c.name || c.input}: ${e.message}`, id);
                send({ type: 'sync-course', course: id, state: 'error', error: e.message });
            }
            const s = cfg().settings;
            if (s.transcription.auto && s.setupDone) {
                for (const r of lib.withFileStatus(c.dir, lib.loadManifest(c.dir))) if (r.videoExists && !r.transcript) queueTranscription(c, r);
            }
        }
    } finally {
        syncCurrent = null; syncQueue = []; syncing = false;
        await closeSession();
        send({ type: 'sync-state', syncing });
        send({ type: 'sync-queue', queue: [], current: null });
        send({ type: 'refresh' });
        if (total) notify(`Sincronizzazione completata: ${total} nuove lezioni`);
    }
}

let intervalTimer = null;
function scheduleAutoSync() {
    clearInterval(intervalTimer);
    const h = Number(cfg().settings.autoSync.intervalHours) || 0;
    if (h > 0) intervalTimer = setInterval(() => enqueueSync(), h * 3600 * 1000);
}

// ---------- IPC ----------
function courseView(c) {
    const m = lib.loadManifest(c.dir);
    return {
        ...c, manifest: { course: m.course, sources: m.sources || [] }, recordings: lib.withFileStatus(c.dir, m),
        materialsCount: Object.keys(m.materials || {}).length, dirExists: fs.existsSync(c.dir),
        materialFiles: [...new Set(Object.values(m.materials || {}).map(x => x.path.split(path.sep).join('/')))].sort((a, b) => a.localeCompare(b, 'it', { numeric: true }))
            .concat(fs.existsSync(path.join(c.dir, 'materiale', 'LINK.md')) ? ['LINK.md'] : []),
    };
}

const handle = (ch, fn) => ipcMain.handle(ch, async (e, arg) => fn(arg));

handle('state', async () => {
    const c = cfg();
    return {
        settings: c.settings,
        courses: c.courses.map(courseView),
        syncing, syncQueue, syncCurrent,
        tools: { ...dl.checkTools(), whisper: await checkWhisper(c.settings.transcription.python), ai: ai.available() },
        templates: Object.fromEntries(Object.entries(ai.TEMPLATES).map(([k, v]) => [k, v.label])),
        transcribing: transcriber.pending(),
        platform: process.platform,
    };
});

handle('course:add', async ({ input, dir, name, materials, language }) => {
    if (!input || !dir) throw new Error('Serve il corso e la cartella di destinazione');
    const c = { id: crypto.randomUUID(), input: String(input).trim(), dir, name: name || '', extraUrls: [], materials: !!materials, language: language || '', autoSync: true, addedAt: new Date().toISOString() };
    const m = String(input).match(/^webeep:(\d+)$/);
    if (m) c.webeepId = Number(m[1]);
    const all = cfg(); all.courses.push(c); lib.saveConfig(all);
    return courseView(c);
});
handle('course:update', async ({ id, patch }) => { patchCourse(id, patch); return courseView(findCourse(id)); });
handle('course:remove', async id => { const all = cfg(); all.courses = all.courses.filter(c => c.id !== id); lib.saveConfig(all); return true; });
handle('course:reorder', async ids => {
    const all = cfg();
    all.courses.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    lib.saveConfig(all); return true;
});

handle('webeep:courses', async () => {
    const s = getSession();
    try { return await webeep.enrolledCourses(s); }
    finally { if (!syncing) await closeSession(); }
});

handle('sync', async ids => { enqueueSync(ids); return true; });
handle('sync:stop', async () => { stopRequested = true; syncQueue = []; return true; });

handle('transcribe', async ({ courseId, keys }) => {
    if (!cfg().settings.setupDone) throw new Error('Completa prima il setup (Impostazioni → Trascrizione)');
    const c = findCourse(courseId);
    const recs = lib.withFileStatus(c.dir, lib.loadManifest(c.dir));
    const sel = recs.filter(r => r.videoExists && (keys ? keys.includes(r.key) : !r.transcript));
    sel.forEach(r => queueTranscription(c, r));
    return sel.length;
});
handle('transcribe:cancel', async () => { transcriber.cancelAll(); return true; });

handle('notes', async ({ courseId, key, template, provider }) => generateNotes(findCourse(courseId), key, template, provider));
handle('notes:batch', async ({ courseId, template, provider }) => {
    const c = findCourse(courseId);
    const suffix = ai.TEMPLATES[template].suffix;
    const recs = lib.withFileStatus(c.dir, lib.loadManifest(c.dir)).filter(r => r.transcript && !r.notes.some(n => n.endsWith(` - ${suffix}.md`)));
    (async () => { for (const r of recs) { try { await generateNotes(c, r.key, template, provider); } catch (e) { log('✗ ' + e.message, c.id); } } })();
    return recs.length;
});

handle('agent', async ({ courseId, prompt, provider }) => {
    const c = findCourse(courseId);
    const s = cfg().settings.ai;
    const prov = provider || s.provider;
    const jobId = crypto.randomUUID();
    const preamble = `Stai lavorando nella cartella di un corso universitario (${c.name || ''}). Struttura: video/ (registrazioni), trascrizioni/ (trascrizioni Whisper .txt/.srt, possono contenere errori), materiale/ (slide e PDF del corso), note/ (appunti in Markdown), INDICE.md. Salva sempre i file che produci dentro note/ in formato Markdown. Non modificare né cancellare video, trascrizioni e materiale.\n\nRichiesta: `;
    send({ type: 'ai-start', jobId, course: c.id, agent: true, provider: prov });
    try {
        const out = await ai.runAgent(prov, preamble + prompt, c.dir, { model: s.model, onChunk: ch => send({ type: 'ai-chunk', jobId, chunk: ch }) });
        send({ type: 'ai-done', jobId, course: c.id, output: out });
        send({ type: 'refresh' });
        return out;
    } catch (e) { send({ type: 'ai-error', jobId, error: e.message }); throw e; }
});

// One recording: metadata, transcript segments (from .srt), notes, video URL
function parseSrt(text) {
    const toSec = t => { const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; };
    return text.replace(/\r/g, '').split(/\n\n+/).map(b => {
        const lines = b.trim().split('\n');
        const i = lines.findIndex(l => l.includes('-->'));
        if (i === -1) return null;
        const [a, z] = lines[i].split('-->');
        return { start: toSec(a), end: toSec(z), text: lines.slice(i + 1).join(' ').trim() };
    }).filter(s => s && s.text);
}

handle('recording', async ({ courseId, key }) => {
    const c = findCourse(courseId);
    const d = lib.courseDirs(c.dir);
    const rec = lib.withFileStatus(c.dir, lib.loadManifest(c.dir)).find(r => r.key === key);
    if (!rec) throw new Error('registrazione non trovata');
    const stem = rec.file.replace(/\.mp4$/i, '');
    let segments = null, text = null;
    const srt = path.join(d.transcripts, stem + '.srt');
    if (fs.existsSync(srt)) segments = parseSrt(fs.readFileSync(srt, 'utf8'));
    else if (rec.transcript) text = fs.readFileSync(path.join(d.transcripts, rec.transcript), 'utf8');
    const notes = rec.notes.map(n => ({ file: n, kind: n.split(' - ').pop().replace(/\.md$/, ''), content: fs.readFileSync(path.join(d.notes, n), 'utf8') }));
    const videoPath = path.join(d.video, rec.file);
    return { rec, segments, text, notes, videoPath, videoUrl: rec.videoExists ? 'media://local/' + encodeURIComponent(videoPath) : null };
});

extra.register({ handle, send, cfg, findCourse, getSession, closeSession, isSyncing: () => syncing });

handle('settings:save', async s => { const c = cfg(); c.settings = { ...c.settings, ...s }; lib.saveConfig(c); scheduleAutoSync(); return c.settings; });

handle('pick-dir', async def => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: def || cfg().settings.defaultRoot || undefined });
    return r.canceled ? null : r.filePaths[0];
});

handle('open', async ({ courseId, kind, file }) => {
    const d = lib.courseDirs(findCourse(courseId).dir);
    const base = { video: d.video, transcripts: d.transcripts, notes: d.notes, root: d.root, materials: path.join(d.root, 'materiale') }[kind] || d.root;
    const p = file ? path.join(base, file) : base;
    if (!fs.existsSync(p)) throw new Error('Non trovato: ' + p);
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return true;
});
handle('open-path', async p => { const err = await shell.openPath(p); if (err) throw new Error(err); return true; });
handle('read-file', async ({ courseId, kind, file }) => {
    const d = lib.courseDirs(findCourse(courseId).dir);
    const base = { transcripts: d.transcripts, notes: d.notes }[kind];
    const p = path.join(base, file);
    if (!p.startsWith(base)) throw new Error('percorso non valido');
    return fs.readFileSync(p, 'utf8');
});
handle('reveal', async p => { shell.showItemInFolder(p); return true; });
handle('open-external', async url => { if (/^https?:\/\//.test(url)) await shell.openExternal(url); return true; });
handle('appearance', async a => { nativeTheme.themeSource = a === 'light' ? 'light' : a === 'dark' ? 'dark' : 'system'; return true; });

// setup
handle('setup:detect', async () => { const hw = setup.detect(); return { hw, rec: setup.recommend(hw) }; });
handle('setup:install', async rec => {
    const r = await setup.install(rec, { onStep: e => send({ type: 'setup-step', ...e }), onLog: l => send({ type: 'setup-log', line: l }) });
    patchSettings(s => { Object.assign(s.transcription, r); s.setupDone = true; });
    return r;
});
handle('setup:skip', async () => { patchSettings(s => { s.setupDone = true; s.transcription.auto = false; }); return true; });

// ---------- app ----------
// media:// serves local videos (with HTTP range support, so seeking works) to the in-app player
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }]);

function createWindow() {
    const s = cfg().settings;
    nativeTheme.themeSource = s.ui.appearance === 'light' ? 'light' : s.ui.appearance === 'dark' ? 'dark' : 'system';
    win = new BrowserWindow({
        width: 1320, height: 860, minWidth: 960, minHeight: 620,
        title: 'PoliRec',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 18, y: 20 },
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, plugins: true },
    });
    // microphone for dictation; everything else denied
    win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' || perm === 'notifications'));
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    win.webContents.on('console-message', e => { if (e.level === 'warning' || e.level === 'error') console.error('[renderer]', e.message); });
    win.webContents.once('did-finish-load', () => {
        const st = cfg().settings;
        if (st.setupDone && st.autoSync.onStart && !process.env.POLIREC_SMOKE && cfg().courses.length) setTimeout(() => enqueueSync(), 1500);
    });
    // POLIREC_SMOKE=out.png [POLIREC_SMOKE_JS=code]: render, screenshot, quit (automated UI checks)
    if (process.env.POLIREC_SMOKE) {
        win.webContents.setBackgroundThrottling(false);   // keep painting even when not focused (fresh captures)
        win.webContents.once('did-finish-load', () => setTimeout(async () => {
            if (process.env.POLIREC_SMOKE_JS) { await win.webContents.executeJavaScript(process.env.POLIREC_SMOKE_JS).catch(e => console.error(e)); await new Promise(r => setTimeout(r, 1500)); }
            fs.writeFileSync(process.env.POLIREC_SMOKE, (await win.webContents.capturePage()).toPNG());
            app.quit();
        }, 2000));
    }
}

// Local video with HTTP Range support (needed for seeking in <video>)
function serveMedia(req) {
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

app.whenReady().then(() => {
    protocol.handle('media', req => serveMedia(req));
    createWindow();
    scheduleAutoSync();
});
app.on('window-all-closed', async () => { transcriber.cancelAll(); await closeSession(); app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
