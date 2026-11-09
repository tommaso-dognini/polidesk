'use strict';
// App config + per-course folder layout and manifest.
//
// <courseDir>/
//   video/          lesson recordings (.mp4)
//   trascrizioni/   whisper transcripts (.txt / .srt / .vtt)
//   note/           AI generated notes / summaries (.md)
//   polirec.json    manifest (metadata + status of every recording)
//   INDICE.md       human readable index
const fs = require('fs');
const path = require('path');
const { CONFIG_FILE } = require('./paths');

const DEFAULT_SETTINGS = {
    parallelDownloads: 3,
    transcription: { auto: true, clean: true, engine: 'auto', device: 'auto', model: 'small', language: 'auto', format: 'txt', python: 'python3' },
    editor: { mode: 'markdown', aiPanel: true, font: 'mono' },
    pomodoro: { focus: 25, short: 5, long: 15, every: 4, sound: true },
    rooms: { sede: 'MIA', minutes: 60 },
    notesRoot: '',
    ai: { provider: 'agy', model: '', autoNotes: false, autoSummary: true, autoCoursePage: true },
    autoSync: { onStart: true, intervalHours: 0 },
    ui: { theme: 'normal', font: 'system', appearance: 'auto' },
    setupDone: false,
    cloud: { enabled: false, provider: '', path: '', lastPulled: '', lastPushed: '' },
    integrations: { notion: false, notionToken: '', notionParent: '', applenotes: false, goodnotes: false, notability: false, obsidian: false },
    defaultRoot: '',
    polimiEmail: '',
};

function loadConfig() {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { }
    cfg.courses = cfg.courses || [];
    cfg.settings = deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), cfg.settings || {});
    if (!cfg.settings.polimiEmail) cfg.settings.polimiEmail = legacyEmail();
    return cfg;
}

// Reuse the e-mail saved by PoliWebex (config.json next to poliwebex.js), if any
function legacyEmail() {
    const os = require('os');
    for (const p of [path.join(__dirname, '..', '..', 'legacy', 'config.json'), path.join(os.homedir(), 'Documents', 'PoliWebex', 'config.json')]) {
        try { const e = JSON.parse(fs.readFileSync(p, 'utf8')).email; if (e) return e; } catch (e) { }
    }
    return '';
}

/** Re-read config from disk and patch one course: never clobbers changes made by another process. */
function patchCourse(id, patch) {
    const cfg = loadConfig();
    const c = cfg.courses.find(x => x.id === id);
    if (c) { Object.assign(c, patch); saveConfig(cfg); }
    return cfg;
}

function saveConfig(cfg, { noExport = false } = {}) {
    // mirror settings + course list to the cloud folder (iCloud/Drive/…) when sync is on
    if (!noExport && cfg.settings && cfg.settings.cloud && cfg.settings.cloud.enabled) {
        try { cfg.settings.cloud.lastPushed = require('./cloud').exportConfig(cfg) || cfg.settings.cloud.lastPushed; } catch (e) { }
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function deepMerge(a, b) {
    for (const [k, v] of Object.entries(b)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') deepMerge(a[k], v);
        else a[k] = v;
    }
    return a;
}

const DIRS = { video: 'video', transcripts: 'trascrizioni', notes: 'note' };

function courseDirs(courseDir) {
    return {
        root: courseDir,
        video: path.join(courseDir, DIRS.video),
        transcripts: path.join(courseDir, DIRS.transcripts),
        notes: path.join(courseDir, DIRS.notes),
        manifest: path.join(courseDir, 'polirec.json'),
        index: path.join(courseDir, 'INDICE.md'),
    };
}

function loadManifest(courseDir) {
    const d = courseDirs(courseDir);
    try { return JSON.parse(fs.readFileSync(d.manifest, 'utf8')); } catch (e) { return { recordings: {} }; }
}

function saveManifest(courseDir, m) {
    const d = courseDirs(courseDir);
    fs.mkdirSync(d.root, { recursive: true });
    const tmp = d.manifest + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
    fs.renameSync(tmp, d.manifest);
}

function sanitize(s, max = 120) {
    return String(s || '').replace(/\s*:\s*/g, ' - ').replace(/[\/\\?%*|"<>\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, '');
}

/** "054307 - ANN... (MATTEUCCI MATTEO)" -> "Matteucci" */
function teacherFrom(courseLabel) {
    const m = (courseLabel || '').match(/\(([A-ZÀ-Ü' ]+)\)/);
    if (!m) return '';
    const surname = m[1].trim().split(/\s+/)[0];
    return surname.charAt(0) + surname.slice(1).toLowerCase();
}

function prettyTopic(rec) {
    let topic = rec.topic || rec.title || rec.type || 'Registrazione';
    // topics like "2026_11_02_AN2DL_Lez_1_Image_Classification_Matteucci" → "AN2DL Lez 1 Image Classification"
    if (/^[\w]+$/.test(topic) && topic.includes('_')) topic = topic.replace(/^\d{4}_\d{2}_\d{2}_?/, '').replace(/_/g, ' ');
    if (rec.teacher) topic = topic.replace(new RegExp('[\\s_-]*' + rec.teacher + '$', 'i'), '').trim() || topic;
    return topic;
}

function baseName(rec) {
    const date = (rec.isoDate || '').slice(0, 10) || 'senza-data';
    const topic = prettyTopic(rec);
    const teacher = rec.teacher ? ` (${rec.teacher})` : '';
    return sanitize(`${date} - ${topic}${teacher}`);
}

/** Pick a unique filename for a recording, stable across syncs (stored in manifest). */
function assignFilename(manifest, key, rec) {
    const existing = manifest.recordings[key];
    if (existing && existing.file) return existing.file;
    const used = new Set(Object.values(manifest.recordings).map(r => r.file).filter(Boolean));
    let name = baseName(rec) + '.mp4';
    for (let i = 2; used.has(name); i++) name = baseName(rec) + ` [${i}].mp4`;
    return name;
}

/** Transcript / notes are derived from the filesystem (never stored), so concurrent jobs can't clobber each other. */
function fileStatus(courseDir, rec) {
    const d = courseDirs(courseDir);
    const stem = (rec.file || '').replace(/\.mp4$/i, '');
    const out = { videoExists: false, transcript: null, subtitles: null, notes: [] };
    if (!stem) return out;
    out.videoExists = fs.existsSync(path.join(d.video, rec.file));
    for (const ext of ['txt', 'srt', 'vtt']) {
        if (fs.existsSync(path.join(d.transcripts, `${stem}.${ext}`))) {
            if (ext === 'txt') out.transcript = `${stem}.txt`; else if (!out.subtitles) out.subtitles = `${stem}.${ext}`;
        }
    }
    try { out.notes = fs.readdirSync(d.notes).filter(f => f.startsWith(stem + ' - ') && f.endsWith('.md')).sort(); } catch (e) { }
    return out;
}

function withFileStatus(courseDir, manifest) {
    const d = courseDirs(courseDir);
    const recs = Object.values(manifest.recordings || {}).map(r => {
        const st = fileStatus(courseDir, r);
        let summary = null, bullets = [];
        const sf = st.notes.find(n => / - sommario\.md$/.test(n));
        if (sf) {
            try {
                const lines = fs.readFileSync(path.join(d.notes, sf), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !/^#/.test(l));
                summary = (lines.find(l => !/^[-*•]/.test(l)) || '').replace(/\*\*/g, '') || null;
                bullets = lines.filter(l => /^[-*•]\s+/.test(l)).map(l => l.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '')).slice(0, 8);
            } catch (e) { }
        }
        return { ...r, ...st, displayTitle: prettyTopic(r), summary, bullets };
    });
    return recs.sort((a, b) => (a.isoDate || '').localeCompare(b.isoDate || ''));
}

function writeIndex(courseDir, manifest) {
    const d = courseDirs(courseDir);
    const recs = withFileStatus(courseDir, manifest);
    fs.mkdirSync(d.root, { recursive: true });
    // HTML overview (cards with summaries + quick links)
    fs.writeFileSync(path.join(d.root, 'INDICE.html'), require('./indexpage').render({ course: manifest.course, recs, dirs: d, DIRS }));
    // Markdown version (Obsidian/VS Code friendly)
    const rel = p => encodeURI(p).replace(/\(/g, '%28').replace(/\)/g, '%29');
    const { readSummary } = require('./indexpage');
    let md = `# ${manifest.course ? manifest.course.fullname : 'Registrazioni'}\n\n`;
    md += `Aggiornato: ${new Date().toLocaleString('it-IT')} · ${recs.length} registrazioni · [versione HTML](INDICE.html)\n\n`;
    for (const r of recs.slice().reverse()) {
        md += `## ${(r.isoDate || '').slice(0, 10)} — ${r.displayTitle || ''}${r.teacher ? ' (' + r.teacher + ')' : ''}\n\n`;
        const meta = [r.type, r.duration].filter(Boolean).join(' · ');
        if (meta) md += `*${meta}*\n\n`;
        const sum = readSummary(d, r);
        if (sum) { if (sum.text) md += sum.text + '\n\n'; for (const b of sum.bullets) md += `- ${b}\n`; if (sum.bullets.length) md += '\n'; }
        const links = [];
        if (r.videoExists) links.push(`[▶ Video](${rel(DIRS.video + '/' + r.file)})`);
        if (r.webexUrl) links.push(`[WebEx](${r.webexUrl})`);
        if (r.transcript) links.push(`[Trascrizione](${rel(DIRS.transcripts + '/' + r.transcript)})`);
        for (const n of r.notes) if (!/ - sommario\.md$/.test(n)) links.push(`[${n.split(' - ').pop().replace('.md', '')}](${rel(DIRS.notes + '/' + n)})`);
        md += (links.join(' · ') || '_non scaricato_') + '\n\n';
    }
    fs.writeFileSync(d.index, md);
}

module.exports = { DEFAULT_SETTINGS, DIRS, loadConfig, saveConfig, patchCourse, courseDirs, loadManifest, saveManifest, assignFilename, baseName, prettyTopic, teacherFrom, sanitize, writeIndex, fileStatus, withFileStatus };
