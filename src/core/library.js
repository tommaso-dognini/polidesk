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
    transcription: { auto: true, model: 'small', language: 'auto', format: 'txt', python: 'python3' },
    ai: { provider: 'claude', model: '', autoNotes: false },
    defaultRoot: '',
};

function loadConfig() {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { }
    cfg.courses = cfg.courses || [];
    cfg.settings = deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), cfg.settings || {});
    return cfg;
}

function saveConfig(cfg) {
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
    const recs = Object.values(manifest.recordings || {}).map(r => ({ ...r, ...fileStatus(courseDir, r), displayTitle: prettyTopic(r) }));
    return recs.sort((a, b) => (a.isoDate || '').localeCompare(b.isoDate || ''));
}

function writeIndex(courseDir, manifest) {
    const d = courseDirs(courseDir);
    const recs = withFileStatus(courseDir, manifest);
    const rel = p => encodeURI(p).replace(/\(/g, '%28').replace(/\)/g, '%29');
    let md = `# ${manifest.course ? manifest.course.fullname : 'Registrazioni'}\n\n`;
    md += `Aggiornato: ${new Date().toLocaleString('it-IT')} · ${recs.length} registrazioni\n\n`;
    md += `| # | Data | Argomento | Tipo | Durata | Video | Trascrizione | Note |\n|---|---|---|---|---|---|---|---|\n`;
    recs.forEach((r, i) => {
        const v = r.status === 'downloaded' && r.file ? `[▶](${rel(DIRS.video + '/' + r.file)})` : (r.status || '');
        const t = r.transcript ? `[📄](${rel(DIRS.transcripts + '/' + r.transcript)})` : '';
        const n = (r.notes || []).map(n => `[📝](${rel(DIRS.notes + '/' + n)})`).join(' ');
        md += `| ${i + 1} | ${(r.isoDate || '').replace('T', ' ')} | ${(r.displayTitle || '').replace(/\|/g, '/')}${r.teacher ? ' — ' + r.teacher : ''} | ${r.type || ''} | ${r.duration || ''} | ${v} | ${t} | ${n} |\n`;
    });
    fs.writeFileSync(d.index, md);
}

module.exports = { DEFAULT_SETTINGS, DIRS, loadConfig, saveConfig, courseDirs, loadManifest, saveManifest, assignFilename, baseName, prettyTopic, teacherFrom, sanitize, writeIndex, fileStatus, withFileStatus };
