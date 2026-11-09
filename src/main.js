'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { Session } = require('./core/browser');
const webeep = require('./core/webeep');
const lib = require('./core/library');
const { syncCourse } = require('./core/sync');
const { Transcriber, checkWhisper } = require('./core/transcriber');
const ai = require('./core/ai');
const dl = require('./core/downloader');

let win = null;
let cfg = lib.loadConfig();
let session = null;
let syncing = false;
let stopRequested = false;
const aiJobs = new Map(); // id -> AbortController

function send(evt) { if (win && !win.isDestroyed()) win.webContents.send('evt', evt); }
function log(msg, course) { send({ type: 'log', msg, course }); }

function getSession() {
    if (!session) {
        session = new Session({
            email: cfg.settings.polimiEmail,
            log: msg => log(msg),
            onLoginRequired: () => {
                send({ type: 'login-required' });
                if (Notification.isSupported()) new Notification({ title: 'PoliRec', body: 'Login richiesto: completa l\'accesso nella finestra di Chrome.' }).show();
            },
        });
    }
    return session;
}

async function closeSession() {
    if (session) { await session.close(); session = null; }
}

const findCourse = id => cfg.courses.find(c => c.id === id);
const saveCfg = () => lib.saveConfig(cfg);

// ---------- transcription ----------
const transcriber = new Transcriber({ emit: evt => { send(evt); if (evt.type === 'transcribe-done' || evt.type === 'transcribe-error') send({ type: 'refresh' }); } });

function queueTranscription(course, rec) {
    const dirs = lib.courseDirs(course.dir);
    const video = path.join(dirs.video, rec.file);
    if (!fs.existsSync(video)) return;
    const t = { ...cfg.settings.transcription, ...(course.language ? { language: course.language } : {}) };
    transcriber.enqueue(video, dirs.transcripts, t)
        .then(res => {
            if (res && cfg.settings.ai.autoNotes) generateNotes(course, rec.key, 'appunti').catch(e => log('✗ Note: ' + e.message, course.id));
        })
        .catch(e => log(`✗ Trascrizione ${rec.file}: ${e.message}`, course.id));
}

// ---------- AI notes ----------
async function generateNotes(course, key, template, provider) {
    const m = lib.loadManifest(course.dir);
    const rec = m.recordings[key];
    if (!rec) throw new Error('registrazione non trovata');
    const st = lib.fileStatus(course.dir, rec);
    if (!st.transcript) throw new Error('trascrizione mancante: trascrivi prima la lezione');
    const dirs = lib.courseDirs(course.dir);
    const prov = provider || cfg.settings.ai.provider;
    const jobId = crypto.randomUUID();
    const ac = new AbortController();
    aiJobs.set(jobId, ac);
    send({ type: 'ai-start', jobId, course: course.id, key, template, provider: prov });
    try {
        const name = await ai.generateNote({
            provider: prov, model: cfg.settings.ai.model, template,
            transcriptPath: path.join(dirs.transcripts, st.transcript), notesDir: dirs.notes,
            title: `${rec.topic || ''} (${(rec.isoDate || '').slice(0, 10)})`,
            onChunk: c => send({ type: 'ai-chunk', jobId, chunk: c }),
        });
        send({ type: 'ai-done', jobId, course: course.id, key, file: name });
        lib.writeIndex(course.dir, lib.loadManifest(course.dir));
        send({ type: 'refresh' });
        return name;
    } catch (e) {
        send({ type: 'ai-error', jobId, error: e.message });
        throw e;
    } finally { aiJobs.delete(jobId); }
}

// ---------- IPC ----------
function courseView(c) {
    const m = lib.loadManifest(c.dir);
    return { ...c, manifest: { course: m.course, sources: m.sources || [] }, recordings: lib.withFileStatus(c.dir, m) };
}

ipcMain.handle('state', async () => ({
    settings: cfg.settings,
    courses: cfg.courses.map(courseView),
    syncing,
    tools: { ...dl.checkTools(), whisper: await checkWhisper(cfg.settings.transcription.python), ai: ai.available() },
    templates: Object.fromEntries(Object.entries(ai.TEMPLATES).map(([k, v]) => [k, v.label])),
    transcribing: transcriber.pending(),
}));

ipcMain.handle('course:add', async (_, { input, dir, name }) => {
    if (!input || !dir) throw new Error('Serve il corso e la cartella di destinazione');
    const c = { id: crypto.randomUUID(), input: String(input).trim(), dir, name: name || '', extraUrls: [], addedAt: new Date().toISOString() };
    const m = String(input).match(/^webeep:(\d+)$/);
    if (m) c.webeepId = Number(m[1]);
    cfg.courses.push(c); saveCfg();
    return courseView(c);
});

ipcMain.handle('course:update', async (_, { id, patch }) => {
    const c = findCourse(id); if (!c) throw new Error('corso non trovato');
    Object.assign(c, patch); saveCfg(); return courseView(c);
});

ipcMain.handle('course:remove', async (_, id) => {
    cfg.courses = cfg.courses.filter(c => c.id !== id); saveCfg(); return true;
});

ipcMain.handle('webeep:courses', async () => {
    const s = getSession();
    try { return await webeep.enrolledCourses(s); }
    finally { if (!syncing) await closeSession(); }
});

ipcMain.handle('sync', async (_, ids) => {
    if (syncing) throw new Error('Sincronizzazione già in corso');
    syncing = true; stopRequested = false;
    send({ type: 'sync-state', syncing });
    const list = (ids && ids.length ? ids.map(findCourse) : cfg.courses).filter(Boolean);
    const results = {};
    try {
        const s = getSession();
        for (const c of list) {
            if (stopRequested) break;
            send({ type: 'sync-course', course: c.id, state: 'running' });
            try {
                results[c.id] = await syncCourse(s, c, {
                    parallel: cfg.settings.parallelDownloads,
                    shouldStop: () => stopRequested,
                    emit: evt => {
                        send({ ...evt, course: c.id });
                        if (evt.type === 'downloaded' && cfg.settings.transcription.auto) {
                            const m = lib.loadManifest(c.dir);
                            if (m.recordings[evt.key]) queueTranscription(c, m.recordings[evt.key]);
                        }
                    },
                });
                saveCfg(); // webeepId / name learned during sync
                send({ type: 'sync-course', course: c.id, state: 'done', result: results[c.id] });
            } catch (e) {
                log(`✗ ${c.name || c.input}: ${e.message}`, c.id);
                send({ type: 'sync-course', course: c.id, state: 'error', error: e.message });
            }
        }
        // transcribe anything downloaded earlier but never transcribed
        if (cfg.settings.transcription.auto) {
            for (const c of list) for (const r of lib.withFileStatus(c.dir, lib.loadManifest(c.dir))) if (r.videoExists && !r.transcript) queueTranscription(c, r);
        }
    } finally {
        await closeSession();
        syncing = false;
        send({ type: 'sync-state', syncing });
        send({ type: 'refresh' });
        const tot = Object.values(results).reduce((a, r) => a + (r.downloaded || 0), 0);
        if (Notification.isSupported()) new Notification({ title: 'PoliRec', body: `Sincronizzazione completata: ${tot} nuove lezioni` }).show();
    }
    return results;
});

ipcMain.handle('sync:stop', async () => { stopRequested = true; return true; });

ipcMain.handle('transcribe', async (_, { courseId, keys }) => {
    const c = findCourse(courseId);
    const recs = lib.withFileStatus(c.dir, lib.loadManifest(c.dir));
    const sel = recs.filter(r => r.videoExists && (keys ? keys.includes(r.key) : !r.transcript));
    sel.forEach(r => queueTranscription(c, r));
    return sel.length;
});

ipcMain.handle('transcribe:cancel', async () => { transcriber.cancelAll(); return true; });

ipcMain.handle('notes', async (_, { courseId, key, template, provider }) => generateNotes(findCourse(courseId), key, template, provider));

ipcMain.handle('notes:batch', async (_, { courseId, template, provider }) => {
    const c = findCourse(courseId);
    const recs = lib.withFileStatus(c.dir, lib.loadManifest(c.dir)).filter(r => r.transcript && !r.notes.some(n => n.endsWith(` - ${ai.TEMPLATES[template].suffix}.md`)));
    (async () => { for (const r of recs) { try { await generateNotes(c, r.key, template, provider); } catch (e) { log('✗ ' + e.message, c.id); } } })();
    return recs.length;
});

ipcMain.handle('agent', async (_, { courseId, prompt, provider }) => {
    const c = findCourse(courseId);
    const prov = provider || cfg.settings.ai.provider;
    const jobId = crypto.randomUUID();
    const preamble = `Stai lavorando nella cartella di un corso universitario (${c.name || ''}). Struttura: video/ (registrazioni), trascrizioni/ (trascrizioni Whisper .txt/.srt, possono contenere errori), note/ (appunti in Markdown), INDICE.md (indice). Salva sempre i file che produci dentro note/ in formato Markdown. Non modificare né cancellare video e trascrizioni.\n\nRichiesta: `;
    send({ type: 'ai-start', jobId, course: c.id, agent: true, provider: prov });
    try {
        const out = await ai.runAgent(prov, preamble + prompt, c.dir, { model: cfg.settings.ai.model, onChunk: ch => send({ type: 'ai-chunk', jobId, chunk: ch }) });
        send({ type: 'ai-done', jobId, course: c.id, output: out });
        send({ type: 'refresh' });
        return out;
    } catch (e) { send({ type: 'ai-error', jobId, error: e.message }); throw e; }
});

ipcMain.handle('settings:save', async (_, s) => { cfg.settings = s; saveCfg(); return cfg.settings; });

ipcMain.handle('pick-dir', async (_, def) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: def || cfg.settings.defaultRoot || undefined });
    return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('open', async (_, { courseId, kind, file }) => {
    const c = findCourse(courseId);
    const d = lib.courseDirs(c.dir);
    const base = { video: d.video, transcripts: d.transcripts, notes: d.notes, root: d.root }[kind] || d.root;
    const p = file ? path.join(base, file) : base;
    if (!fs.existsSync(p)) throw new Error('File non trovato: ' + p);
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return true;
});

ipcMain.handle('read-file', async (_, { courseId, kind, file }) => {
    const c = findCourse(courseId);
    const d = lib.courseDirs(c.dir);
    const base = { transcripts: d.transcripts, notes: d.notes }[kind];
    const p = path.join(base, file);
    if (!p.startsWith(base)) throw new Error('percorso non valido');
    return fs.readFileSync(p, 'utf8');
});

ipcMain.handle('reveal', async (_, p) => { shell.showItemInFolder(p); return true; });

// ---------- app ----------
function createWindow() {
    win = new BrowserWindow({
        width: 1280, height: 820, minWidth: 900, minHeight: 600,
        title: 'PoliRec',
        backgroundColor: '#0f1115',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    win.webContents.on('console-message', e => { if (e.level === 'warning' || e.level === 'error') console.error('[renderer]', e.message); });
    // POLIREC_SMOKE=out.png: render, save a screenshot and quit (used for automated checks)
    if (process.env.POLIREC_SMOKE) {
        win.webContents.once('did-finish-load', () => setTimeout(async () => {
            fs.writeFileSync(process.env.POLIREC_SMOKE, (await win.webContents.capturePage()).toPNG());
            app.quit();
        }, 2500));
    }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', async () => {
    transcriber.cancelAll();
    await closeSession();
    app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
