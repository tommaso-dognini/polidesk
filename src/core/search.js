'use strict';
// Semantic search over everything PoliRec knows about your courses:
// lesson transcripts (with timestamps), AI summaries/notes, your notes, course pages, course PDFs.
// Embeddings run locally (python/semantic.py, fastembed). "Ask" = retrieval + the configured AI CLI.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const { APP_DIR } = require('./paths');
const lib = require('./library');
const notesLib = require('./notes');
const ws = require('./workspace');
const cloud = require('./cloud');
const cleaner = require('./cleaner');

const SCRIPT = path.join(__dirname, '..', '..', 'python', 'semantic.py').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const INDEX = path.join(APP_DIR, 'index');

// ───────── worker ─────────
class Worker {
    constructor(python) { this.python = python; this.p = null; this.n = 0; this.wait = new Map(); }
    start() {
        if (this.p) return;
        const env = { ...require('./downloader').toolEnv(), PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
        this.p = spawn(this.python, [SCRIPT], { env, windowsHide: true });
        readline.createInterface({ input: this.p.stdout }).on('line', l => {
            let m; try { m = JSON.parse(l); } catch (e) { return; }
            const w = this.wait.get(m.id); if (!w) return;
            this.wait.delete(m.id);
            m.ok ? w.resolve(m) : w.reject(new Error(m.error));
        });
        let err = '';
        this.p.stderr.on('data', d => { err = (err + d).slice(-2000); });
        this.p.on('close', code => {
            for (const w of this.wait.values()) w.reject(new Error(`Motore di ricerca terminato (${code}). ${/No module named/.test(err) ? 'Installa la ricerca semantica da Impostazioni → AI.' : err.split('\n').slice(-3).join(' ')}`));
            this.wait.clear(); this.p = null;
        });
    }
    call(cmd, args = {}) {
        this.start();
        const id = ++this.n;
        return new Promise((resolve, reject) => { this.wait.set(id, { resolve, reject }); this.p.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n'); });
    }
    stop() { if (this.p) this.p.kill(); this.p = null; }
}
let worker = null;
const getWorker = python => { if (!worker || worker.python !== python) { if (worker) worker.stop(); worker = new Worker(python); } return worker; };

// ───────── sources → chunks ─────────
function parseSrt(text) { return cleaner.parseSrt(text); }

function courseChunks(settings, c) {
    const out = [];
    const d = lib.courseDirs(c.dir);
    const m = lib.loadManifest(c.dir);
    const recs = lib.withFileStatus(c.dir, m);
    const cname = c.name || (m.course && m.course.fullname) || c.input;
    for (const r of recs) {
        const base = { course: c.id, courseName: cname, lesson: r.key, title: r.displayTitle, date: (r.isoDate || '').slice(0, 10) };
        const stem = (r.file || '').replace(/\.mp4$/i, '');
        // transcript windows (~60 s) keep their start time → open the video right there
        const srt = path.join(d.transcripts, stem + '.srt');
        if (fs.existsSync(srt)) {
            const segs = parseSrt(fs.readFileSync(srt, 'utf8'));
            let cur = null;
            for (const s of segs) {
                if (!cur) cur = { start: s.start, text: '' };
                cur.text += (cur.text ? ' ' : '') + s.text;
                if (s.end - cur.start >= 60 || cur.text.length > 900) { out.push({ text: cur.text, meta: { ...base, type: 'lesson', t: Math.floor(cur.start) } }); cur = null; }
            }
            if (cur && cur.text) out.push({ text: cur.text, meta: { ...base, type: 'lesson', t: Math.floor(cur.start) } });
        }
        for (const n of r.notes || []) {
            const kind = n.split(' - ').pop().replace(/\.md$/, '');
            const txt = safeRead(path.join(d.notes, n));
            for (const p of paragraphs(txt)) out.push({ text: p, meta: { ...base, type: kind === 'sommario' ? 'summary' : 'ainote', file: n } });
        }
    }
    // user notes + course page (cloud-aware)
    const dataDir = cloud.courseDataDir(settings, c);
    const ndir = notesLib.dirFor(dataDir);
    for (const f of notesLib.list(ndir)) for (const p of paragraphs(safeRead(path.join(ndir, f.file)))) out.push({ text: p, meta: { type: 'note', course: c.id, courseName: cname, file: f.file, kind: f.kind, title: f.file.replace(/\.(md|tex|typ)$/, '') } });
    const page = ws.load(dataDir).page;
    for (const p of paragraphs(page)) out.push({ text: p, meta: { type: 'page', course: c.id, courseName: cname, title: 'Pagina del corso' } });
    // course material PDFs (text extracted in python)
    for (const v of Object.values(m.materials || {})) {
        const abs = path.join(c.dir, 'materiale', v.path);
        if (/\.pdf$/i.test(abs) && fs.existsSync(abs)) out.push({ pdf: abs, meta: { type: 'material', course: c.id, courseName: cname, file: v.path, title: path.basename(v.path) } });
    }
    return out;
}

function generalChunks(settings) {
    const out = [];
    const dir = cloud.generalNotesDir(settings);
    for (const f of notesLib.list(dir)) for (const p of paragraphs(safeRead(path.join(dir, f.file)))) out.push({ text: p, meta: { type: 'note', course: null, courseName: 'Generale', file: f.file, kind: f.kind, title: f.file.replace(/\.(md|tex|typ)$/, '') } });
    return out;
}

const safeRead = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
function paragraphs(txt) {
    if (!txt) return [];
    const parts = txt.replace(/\r/g, '').split(/\n(?=#{1,4}\s)|\n\s*\n/).map(s => s.trim()).filter(s => s.length > 25);
    const out = [];
    for (const p of parts) for (let i = 0; i < p.length; i += 1000) out.push(p.slice(i, i + 1100));
    return out;
}

// ───────── public API ─────────
const scopeDir = id => path.join(INDEX, id || 'generale');

async function indexCourse(settings, c, log = () => { }) {
    const w = getWorker(settings.transcription.python);
    const chunks = courseChunks(settings, c);
    const r = await w.call('index', { scope: c.id, dir: scopeDir(c.id), chunks });
    log(`🔎 Indice ${c.name || c.input}: ${r.total} frammenti (${r.added} nuovi)`);
    return r;
}
async function indexGeneral(settings) {
    const w = getWorker(settings.transcription.python);
    return w.call('index', { scope: 'generale', dir: scopeDir(null), chunks: generalChunks(settings) });
}
async function indexAll(cfg, log) {
    const res = {};
    for (const c of cfg.courses) { try { res[c.id] = await indexCourse(cfg.settings, c, log); } catch (e) { res[c.id] = { error: e.message }; log('✗ Indice: ' + e.message); } }
    try { res.generale = await indexGeneral(cfg.settings); } catch (e) { }
    return res;
}

async function query(cfg, text, { courseId, k = 20 } = {}) {
    const dirs = courseId ? [scopeDir(courseId)] : cfg.courses.map(c => scopeDir(c.id)).concat([scopeDir(null)]);
    const existing = dirs.filter(d => fs.existsSync(path.join(d, 'vectors.npy')));
    if (!existing.length) return { results: [], needIndex: true };
    const r = await getWorker(cfg.settings.transcription.python).call('query', { dirs: existing, text, k });
    return { results: r.results };
}

/** Retrieval-augmented answer with numbered citations. */
async function ask(cfg, question, { courseId, onChunk } = {}) {
    const { results } = await query(cfg, question, { courseId, k: 10 });
    if (!results.length) throw new Error('Indice vuoto: premi «Aggiorna indice» nella ricerca');
    const ai = require('./ai');
    const fmtT = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const ctx = results.map((r, i) => `[${i + 1}] (${label(r.meta, fmtT)})\n${r.text}`).join('\n\n');
    const prompt = `Sei un tutor universitario. Rispondi alla domanda dello studente usando SOLO le fonti numerate qui sotto (trascrizioni di lezioni, appunti, slide). ` +
        `Cita le fonti tra parentesi quadre come [1], [2]. Se le fonti non bastano, dillo chiaramente. Rispondi in italiano, in Markdown, in modo conciso.\n\nDomanda: ${question}`;
    const s = cfg.settings.ai;
    const answer = await ai.runPrompt(s.provider, prompt, `<fonti>\n${ctx}\n</fonti>`, { model: s.model, cwd: require('os').tmpdir(), onChunk });
    return { answer, sources: results };
}
function label(m, fmtT) {
    if (m.type === 'lesson') return `Lezione «${m.title}» ${m.date} al minuto ${fmtT(m.t || 0)}`;
    if (m.type === 'material') return `Materiale ${m.file}${m.page ? ' p. ' + m.page : ''}`;
    if (m.type === 'summary') return `Sommario lezione «${m.title}»`;
    if (m.type === 'page') return `Pagina del corso ${m.courseName}`;
    return `Appunto «${m.title}»`;
}

function status(cfg) {
    const one = id => { try { return JSON.parse(fs.readFileSync(path.join(scopeDir(id), 'chunks.json'), 'utf8')).length; } catch (e) { return 0; } };
    return Object.fromEntries(cfg.courses.map(c => [c.id, one(c.id)]).concat([['generale', one(null)]]));
}

function stop() { if (worker) worker.stop(); }

module.exports = { indexCourse, indexAll, indexGeneral, query, ask, status, stop, SCRIPT };
