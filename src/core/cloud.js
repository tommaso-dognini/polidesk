'use strict';
// Cloud sync through the user's own cloud folders (no accounts / APIs needed):
// iCloud Drive, Google Drive for desktop, Dropbox, OneDrive, or any folder.
//
// <cloud>/PoliRec/
//   polirec-sync.json          settings + course list (machine-specific bits excluded)
//   Appunti/                   general notes
//   Corsi/<Nome corso>/        per-course notes (appunti/) and workspace (todos, course page)
// Videos, transcripts and materials stay local (too large / re-downloadable).
const fs = require('fs');
const os = require('os');
const path = require('path');

const H = os.homedir();
const IS_MAC = process.platform === 'darwin', IS_WIN = process.platform === 'win32';

function exists(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }

/** Cloud folders available on this machine. */
function detect() {
    const out = [];
    const add = (id, name, p) => { if (p && exists(p) && !out.some(o => o.path === p)) out.push({ id, name, path: p }); };
    if (IS_MAC) add('icloud', 'iCloud Drive', path.join(H, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'));
    if (IS_WIN) add('icloud', 'iCloud Drive', path.join(H, 'iCloudDrive'));
    // Google Drive for desktop / Dropbox / OneDrive (macOS File Provider lives in ~/Library/CloudStorage)
    const cs = path.join(H, 'Library', 'CloudStorage');
    if (exists(cs)) for (const d of fs.readdirSync(cs)) {
        const full = path.join(cs, d);
        if (/^GoogleDrive/i.test(d)) {
            const my = ['My Drive', 'Il mio Drive', 'Mon Drive', 'Mi unidad'].map(x => path.join(full, x)).find(exists);
            add('gdrive', `Google Drive (${d.replace(/^GoogleDrive-?/, '') || 'account'})`, my || full);
        } else if (/^Dropbox/i.test(d)) add('dropbox', 'Dropbox', full);
        else if (/^OneDrive/i.test(d)) add('onedrive', d.replace(/-/g, ' '), full);
    }
    for (const p of [path.join(H, 'Google Drive', 'My Drive'), path.join(H, 'Google Drive'), 'G:\\My Drive', 'G:\\Il mio Drive']) add('gdrive', 'Google Drive', p);
    add('dropbox', 'Dropbox', path.join(H, 'Dropbox'));
    if (IS_WIN && process.env.OneDrive) add('onedrive', 'OneDrive', process.env.OneDrive);
    add('onedrive', 'OneDrive', path.join(H, 'OneDrive'));
    return out;
}

const safeName = s => String(s || 'Corso').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 80);

/** Root of PoliRec data in the cloud, or null when sync is off. */
function root(settings) {
    const c = settings && settings.cloud;
    if (!c || !c.enabled || !c.path) return null;
    return path.join(c.path, 'PoliRec');
}

/** Where a course keeps notes/workspace: cloud folder when sync is on, else the course folder. */
function courseDataDir(settings, course) {
    const r = root(settings);
    return r ? path.join(r, 'Corsi', safeName(course.name || course.input)) : course.dir;
}
function generalNotesDir(settings) {
    const r = root(settings);
    return r ? path.join(r, 'Appunti') : (settings.notesRoot || path.join(H, 'Documents', 'PoliRec Appunti'));
}

// ---- settings / course list ----
const LOCAL_ONLY_SETTINGS = ['cloud', 'notesRoot', 'setupDone'];
const LOCAL_ONLY_TRANSCRIPTION = ['python', 'engine', 'device'];   // depend on this machine's hardware
const SYNC_FILE = r => path.join(r, 'polirec-sync.json');

function exportConfig(cfg) {
    const r = root(cfg.settings); if (!r) return null;
    fs.mkdirSync(r, { recursive: true });
    const settings = JSON.parse(JSON.stringify(cfg.settings));
    for (const k of LOCAL_ONLY_SETTINGS) delete settings[k];
    for (const k of LOCAL_ONLY_TRANSCRIPTION) delete settings.transcription[k];
    const courses = cfg.courses.map(c => ({ id: c.id, input: c.input, name: c.name, webeepId: c.webeepId, language: c.language, materials: c.materials, autoSync: c.autoSync, extraUrls: c.extraUrls, videoPassword: c.videoPassword, dirHint: c.dir }));
    const data = { app: 'PoliRec', updatedAt: new Date().toISOString(), host: os.hostname(), settings, courses, deletedCourses: cfg.deletedCourses || [] };
    const tmp = SYNC_FILE(r) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, SYNC_FILE(r));
    return data.updatedAt;
}

/**
 * Merge the cloud copy into the local config when it's newer than what we last saw.
 * Courses are matched by id; local folders are kept; new courses get a folder under defaultRoot.
 */
function importConfig(cfg) {
    const r = root(cfg.settings); if (!r) return { changed: false };
    let data;
    try { data = JSON.parse(fs.readFileSync(SYNC_FILE(r), 'utf8')); } catch (e) { return { changed: false }; }
    const last = cfg.settings.cloud.lastPulled || '';
    if (!data.updatedAt || data.updatedAt <= last || data.host === os.hostname() && data.updatedAt <= (cfg.settings.cloud.lastPushed || '')) return { changed: false };
    // settings (keep machine-specific values)
    const keepT = Object.fromEntries(LOCAL_ONLY_TRANSCRIPTION.map(k => [k, cfg.settings.transcription[k]]));
    const keep = Object.fromEntries(LOCAL_ONLY_SETTINGS.map(k => [k, cfg.settings[k]]));
    cfg.settings = { ...cfg.settings, ...data.settings, ...keep };
    cfg.settings.transcription = { ...cfg.settings.transcription, ...keepT };
    // courses
    const deleted = new Set(data.deletedCourses || []);
    cfg.courses = cfg.courses.filter(c => !deleted.has(c.id));
    let added = 0;
    for (const rc of data.courses) {
        if (deleted.has(rc.id)) continue;
        const local = cfg.courses.find(c => c.id === rc.id);
        const { dirHint, ...rest } = rc;
        if (local) Object.assign(local, rest);
        else {
            const base = cfg.settings.defaultRoot || path.join(H, 'Documents', 'PoliRec');
            const dir = dirHint && exists(path.dirname(dirHint)) ? dirHint : path.join(base, safeName(rc.name || rc.input));
            cfg.courses.push({ ...rest, dir, addedAt: new Date().toISOString(), fromCloud: true });
            added++;
        }
    }
    // keep the remote order
    const order = data.courses.map(c => c.id);
    cfg.courses.sort((a, b) => (order.indexOf(a.id) + 1 || 1e9) - (order.indexOf(b.id) + 1 || 1e9));
    cfg.deletedCourses = [...new Set([...(cfg.deletedCourses || []), ...deleted])];
    cfg.settings.cloud.lastPulled = data.updatedAt;
    return { changed: true, added, from: data.host, at: data.updatedAt };
}

/** Copy existing notes/workspaces into the cloud folder (never deletes the originals). */
function migrateToCloud(cfg, log = () => { }) {
    const r = root(cfg.settings); if (!r) return 0;
    let n = 0;
    const copyDir = (from, to) => {
        if (!exists(from)) return;
        fs.mkdirSync(to, { recursive: true });
        for (const e of fs.readdirSync(from, { withFileTypes: true })) {
            const a = path.join(from, e.name), b = path.join(to, e.name);
            if (e.isDirectory()) copyDir(a, b);
            else if (!fs.existsSync(b) || fs.statSync(a).mtimeMs > fs.statSync(b).mtimeMs) { fs.copyFileSync(a, b); n++; }
        }
    };
    const localGeneral = cfg.settings.notesRoot || path.join(H, 'Documents', 'PoliRec Appunti');
    copyDir(localGeneral, path.join(r, 'Appunti'));
    for (const c of cfg.courses) {
        const dst = path.join(r, 'Corsi', safeName(c.name || c.input));
        copyDir(path.join(c.dir, 'appunti'), path.join(dst, 'appunti'));
        const ws = path.join(c.dir, 'polirec-workspace.json');
        if (fs.existsSync(ws) && !fs.existsSync(path.join(dst, 'polirec-workspace.json'))) { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(ws, path.join(dst, 'polirec-workspace.json')); n++; }
    }
    const gws = path.join(require('./paths').APP_DIR, 'workspace.json');
    if (fs.existsSync(gws) && !fs.existsSync(path.join(r, 'polirec-workspace.json'))) { fs.copyFileSync(gws, path.join(r, 'polirec-workspace.json')); n++; }
    log(`☁ ${n} file copiati nella cartella cloud`);
    return n;
}

module.exports = { detect, root, courseDataDir, generalNotesDir, exportConfig, importConfig, migrateToCloud, safeName };
