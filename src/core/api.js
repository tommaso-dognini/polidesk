'use strict';
// PoliRec public API — one service layer shared by the CLI (src/cli.js) and the MCP server (src/mcp.js),
// so a student can drive the app from Claude, another assistant or their own scripts.
// Pure Node (no Electron): reads/writes the same data as the app (config, course folders, notes, workspace).
// Writes are atomic and per-file, so it is safe to use while the app is open.
const fs = require('fs');
const os = require('os');
const path = require('path');
const lib = require('./library');
const notesLib = require('./notes');
const ws = require('./workspace');
const cloud = require('./cloud');
const ai = require('./ai');

const cfg = () => lib.loadConfig();

// ── selectors ──
const cname = c => c.name || (c.manifest && c.manifest.course && c.manifest.course.fullname) || c.input;
/** Course by id, 1-based index, or (part of) its name. */
function findCourse(sel) {
    const all = cfg().courses;
    if (sel === undefined || sel === null || sel === '') throw new Error('Specifica un corso (id, numero o nome). Corsi: ' + all.map((c, i) => `${i + 1}. ${c.name || c.input}`).join(', '));
    const s = String(sel).trim();
    const c = all.find(x => x.id === s) || (/^\d+$/.test(s) && s.length < 4 ? all[+s - 1] : null)
        || all.find(x => (x.name || '').toLowerCase() === s.toLowerCase())
        || all.find(x => [x.name, x.input, x.webeepId].join(' ').toLowerCase().includes(s.toLowerCase()));
    if (!c) throw new Error(`Corso «${sel}» non trovato. Corsi: ${all.map((x, i) => `${i + 1}. ${x.name || x.input}`).join(', ')}`);
    return c;
}
function recsOf(c, { all = false } = {}) {
    const m = lib.loadManifest(c.dir);
    const recs = lib.withFileStatus(c.dir, m).sort((a, b) => (a.isoDate || '').localeCompare(b.isoDate || ''));
    return all ? recs : recs.filter(r => lib.followed(c.teachers, r));
}
/** Lesson by key, number (1 = oldest, "#3" ok), date (YYYY-MM-DD) or part of the title. */
function findLesson(c, sel) {
    const recs = recsOf(c);
    const s = String(sel || '').trim().replace(/^#/, '');
    if (!s) throw new Error('Specifica una lezione (numero, data AAAA-MM-GG, titolo o chiave)');
    const r = recs.find(x => x.key === s) || (/^\d{1,3}$/.test(s) ? recs[+s - 1] : null)
        || (/^\d{4}-\d{2}-\d{2}$/.test(s) ? recs.find(x => (x.isoDate || '').startsWith(s)) : null)
        || recs.find(x => (x.displayTitle || '').toLowerCase().includes(s.toLowerCase()))
        || recsOf(c, { all: true }).find(x => x.key === s);
    if (!r) throw new Error(`Lezione «${sel}» non trovata in ${cname(c)} (${recs.length} lezioni)`);
    return r;
}

// ── read ──
function status() {
    const c = cfg();
    const av = ai.available();
    return {
        app: 'PoliRec', version: require('../../package.json').version, home: require('./paths').APP_DIR,
        courses: c.courses.length,
        ai: { provider: c.settings.ai.provider, installed: Object.entries(av).filter(([, v]) => v.path).map(([k]) => k) },
        transcription: { engine: c.settings.transcription.engine, model: c.settings.transcription.model, setupDone: !!c.settings.setupDone },
        cloudSync: !!(c.settings.cloud && c.settings.cloud.enabled),
    };
}
function courses() {
    return cfg().courses.map((c, i) => {
        const m = lib.loadManifest(c.dir);
        const all = lib.withFileStatus(c.dir, m), recs = all.filter(r => lib.followed(c.teachers, r));
        return {
            n: i + 1, id: c.id, name: c.name || c.input, fullname: m.course && m.course.fullname, dir: c.dir,
            lessons: recs.length, downloaded: recs.filter(r => r.videoExists).length, transcribed: recs.filter(r => r.transcript).length,
            teachers: lib.teachersOf(m).map(t => t.name), followedTeachers: Array.isArray(c.teachers) ? c.teachers : null,
            materials: Object.keys(m.materials || {}).length, lastSync: c.lastSync || null,
        };
    });
}
const lessonView = (r, i) => ({
    n: i + 1, key: r.key, date: r.isoDate || null, title: r.displayTitle || r.file, teacher: r.teacher || null, type: r.type || null, duration: r.duration || null,
    downloaded: !!r.videoExists, transcribed: !!r.transcript, summary: r.summary || null, topics: r.bullets || [],
    aiNotes: r.notes.map(f => f.split(' - ').pop().replace(/\.md$/, '')).filter(k => k !== 'sommario'),
});
function lessons(course, { all = false } = {}) { const c = findCourse(course); return recsOf(c, { all }).map(lessonView); }
function lesson(course, sel) {
    const c = findCourse(course); const r = findLesson(c, sel);
    const recs = recsOf(c);
    const d = lib.courseDirs(c.dir);
    return { course: cname(c), ...lessonView(r, recs.indexOf(r)), video: r.videoExists ? path.join(d.video, r.file) : null, webexUrl: r.webexUrl || null, linkedNotes: linkedNotes(c.id, r.key) };
}
/** Transcript text. timestamps=false → clean prose; offset/maxChars to page through long lessons. */
function transcript(course, sel, { timestamps = false, offset = 0, maxChars = 0 } = {}) {
    const c = findCourse(course); const r = findLesson(c, sel);
    if (!r.transcript) throw new Error(`«${r.displayTitle}» non è ancora trascritta`);
    const d = lib.courseDirs(c.dir);
    const stem = r.file.replace(/\.mp4$/i, '');
    let text;
    const srt = path.join(d.transcripts, stem + '.srt');
    if (timestamps && fs.existsSync(srt)) {
        text = fs.readFileSync(srt, 'utf8').replace(/\r/g, '').split(/\n\n+/).map(b => {
            const ls = b.trim().split('\n'); const i = ls.findIndex(l => l.includes('-->')); if (i < 0) return '';
            return `[${ls[i].split('-->')[0].trim().replace(/,\d+$/, '')}] ${ls.slice(i + 1).join(' ')}`;
        }).filter(Boolean).join('\n');
    } else text = fs.readFileSync(path.join(d.transcripts, r.transcript), 'utf8');
    const total = text.length;
    if (offset || maxChars) text = text.slice(offset, maxChars ? offset + maxChars : undefined);
    return { course: cname(c), lesson: r.displayTitle, date: r.isoDate, chars: total, offset, text, more: maxChars ? offset + maxChars < total : false };
}
function aiNote(course, sel, kind) {
    const c = findCourse(course); const r = findLesson(c, sel);
    const f = r.notes.find(n => n.endsWith(` - ${kind}.md`));
    if (!f) return { lesson: r.displayTitle, kind, exists: false, available: r.notes.map(n => n.split(' - ').pop().replace(/\.md$/, '')) };
    return { lesson: r.displayTitle, kind, exists: true, content: fs.readFileSync(path.join(lib.courseDirs(c.dir).notes, f), 'utf8') };
}
function coursePage(course) {
    const c = findCourse(course);
    const w = ws.load(cloud.courseDataDir(cfg().settings, c));
    return { course: cname(c), page: w.page.replace(/^<!--[^>]*-->\n?/, ''), todos: w.todos.filter(t => !t.done).length };
}

// ── AI ──
async function generateAiNote(course, sel, kind) {
    if (!ai.TEMPLATES[kind]) throw new Error(`Tipo sconosciuto: ${kind}. Disponibili: ${Object.keys(ai.TEMPLATES).join(', ')}`);
    const c = findCourse(course); const r = findLesson(c, sel);
    if (!r.transcript) throw new Error('Serve la trascrizione della lezione');
    const s = cfg().settings; const d = lib.courseDirs(c.dir);
    const name = await ai.generateNote({ provider: ai.pick(s), model: s.ai.model, template: kind, transcriptPath: path.join(d.transcripts, r.transcript), notesDir: d.notes, title: `${r.topic || r.displayTitle} (${(r.isoDate || '').slice(0, 10)})` });
    try { lib.writeIndex(c.dir, lib.loadManifest(c.dir)); } catch (e) { }
    return { file: path.join(d.notes, name), content: fs.readFileSync(path.join(d.notes, name), 'utf8') };
}
async function search(query, { course, k = 10 } = {}) {
    const s = require('./search');
    try {
        const c0 = cfg();
        const { results } = await s.query(c0, query, { courseId: course ? findCourse(course).id : undefined, k });
        return results.map(r => ({ score: +r.score.toFixed(3), type: r.meta.type, course: r.meta.courseName, title: r.meta.title || r.meta.file, date: r.meta.date || null, minute: r.meta.t != null ? Math.floor(r.meta.t / 60) : null, page: r.meta.page || null, text: r.text }));
    } finally { s.stop(); }
}
async function ask(question, { course } = {}) {
    const s = require('./search');
    try {
        const c0 = cfg(); c0.settings.ai.provider = ai.pick(c0.settings);
        const r = await s.ask(c0, question, { courseId: course ? findCourse(course).id : undefined });
        return { answer: r.answer.trim(), sources: r.sources.map((x, i) => `[${i + 1}] ${x.meta.title || x.meta.file}${x.meta.t != null ? ' min ' + Math.floor(x.meta.t / 60) : ''}`) };
    } finally { s.stop(); }
}

// ── notes (user-written: Markdown / LaTeX / Typst) ──
const notesDir = scope => scope ? notesLib.dirFor(cloud.courseDataDir(cfg().settings, findCourse(scope))) : cloud.generalNotesDir(cfg().settings);
const scopeId = scope => scope ? findCourse(scope).id : null;
function linkedNotes(courseId, key) {
    const out = [];
    for (const sc of [null].concat(cfg().courses.map(c => c.id))) {
        const dir = notesDir(sc);
        for (const [f, ls] of Object.entries(notesLib.getAllLinks(dir))) if (ls.some(l => l.c === courseId && l.k === key)) out.push({ scope: sc ? findCourse(sc).name : 'Generale', file: f });
    }
    return out;
}
const notes = {
    list: scope => notesLib.list(notesDir(scope)).map(f => ({ file: f.file, kind: f.kind, modified: new Date(f.mtime).toISOString(), lessons: notesLib.getLinks(notesDir(scope), f.file).length })),
    read: (scope, file) => ({ file, content: notesLib.read(notesDir(scope), file), lessons: notesLib.getLinks(notesDir(scope), file) }),
    write: (scope, file, content) => { notesLib.write(notesDir(scope), file, content); return { file, saved: true }; },
    append: (scope, file, content) => { const dir = notesDir(scope); const cur = notesLib.read(dir, file); notesLib.write(dir, file, cur.replace(/\s*$/, '\n\n') + content + '\n'); return { file, saved: true }; },
    create: (scope, { title, kind = 'markdown', content, lessons = [] }) => {
        const dir = notesDir(scope);
        // resolve the lessons first: a wrong lesson must not leave a half-created note behind
        const links = lessons.map(l => { const c = findCourse(l.course || scope); return { c: c.id, k: findLesson(c, l.lesson).key }; });
        const f = notesLib.create(dir, title, kind);
        if (content) notesLib.write(dir, f, content);
        if (links.length) notesLib.setLinks(dir, f, links);
        return { file: f, path: path.join(dir, f), lessons: links.length };
    },
    link: (scope, file, lessonSels, courseSel) => {
        const dir = notesDir(scope); const c = findCourse(courseSel || scope);
        const cur = notesLib.getLinks(dir, file);
        const add = lessonSels.map(s => ({ c: c.id, k: findLesson(c, s).key }));
        return { file, lessons: notesLib.setLinks(dir, file, cur.concat(add)) };
    },
};

// ── todos, timetable, free rooms ──
const wsDir = scope => scope ? cloud.courseDataDir(cfg().settings, findCourse(scope)) : (cloud.root(cfg().settings) || null);
const todos = {
    list: (scope, { done = false } = {}) => ws.load(wsDir(scope)).todos.filter(t => done || !t.done),
    add: (scope, text, due) => ws.todo.add(wsDir(scope), { text, due: due || null }).todos.slice(-1)[0],
    done: (scope, idOrText, isDone = true) => {
        const w = ws.load(wsDir(scope));
        const t = w.todos.find(x => x.id === idOrText) || w.todos.find(x => x.text.toLowerCase().includes(String(idOrText).toLowerCase()));
        if (!t) throw new Error('Attività non trovata');
        ws.todo.set(wsDir(scope), t.id, { done: isDone }); return { ...t, done: isDone };
    },
};
function events({ from, days = 7, course } = {}) {
    const tt = require('./timetable');
    const f = from ? new Date(from) : new Date(new Date().toDateString());
    let ev = tt.occurrences(f, new Date(f.getTime() + days * 864e5));
    if (course) { const c = findCourse(course); ev = ev.filter(e => tt.matchCourse(e.summary, { ...c, manifest: lib.loadManifest(c.dir) })); }
    return ev.map(e => ({ start: e.start, end: e.end, title: e.summary, room: (e.location || '').split('(')[0].trim(), source: e.source }));
}
async function freeRooms({ sede = 'MIA', date, from, hours = 2 } = {}) {
    const rooms = require('./rooms');
    const d = date ? new Date(date) : new Date();
    const now = new Date();
    const start = from ? (([h, m]) => h * 60 + (m || 0))(String(from).split(':').map(Number)) : now.getHours() * 60 + now.getMinutes();
    const r = await rooms.status({ sede, date: d, from: start, to: Math.min(20 * 60, start + hours * 60) });
    return {
        sede, date: d.toISOString().slice(0, 10), from: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`, hours,
        free: r.buildings.flatMap(b => b.rooms.filter(x => x.status === 'free').map(x => ({ room: x.name, building: b.name, address: b.address, seats: x.capienza, freeUntil: x.freeUntil || 'fine giornata' }))),
        partial: r.partial,
    };
}
async function sedi() { const sp = await require('./rooms').spaces(); return sp.sedi.map(s => ({ id: s.id, name: s.name, city: s.city })); }

// ── long-running: sync & transcription (same engine as the app) ──
async function sync(course, { limit, materials, log = () => { } } = {}) {
    const c = findCourse(course);
    const { Session } = require('./browser');
    const { syncCourse } = require('./sync');
    const s = new Session({ email: cfg().settings.polimiEmail });
    try {
        const r = await syncCourse(s, c, { parallel: cfg().settings.parallelDownloads, limit, materials, emit: e => { if (e.type === 'log') log(e.msg); } });
        lib.patchCourse(c.id, { webeepId: c.webeepId, name: c.name, lastSync: new Date().toISOString() });
        return r;
    } finally { await s.close(); }
}
async function transcribe(course, { lesson, log = () => { } } = {}) {
    const c = findCourse(course); const s = cfg().settings;
    if (!s.setupDone) throw new Error('Completa prima il setup della trascrizione nell\'app');
    const { Transcriber } = require('./transcriber');
    const t = new Transcriber({ emit: e => { if (e.type === 'transcribe-start') log('🎙 ' + path.basename(e.video)); if (e.type === 'transcribe-done') log('  ✓ fatto'); if (e.type === 'transcribe-error') log('  ✗ ' + e.error); } });
    const d = lib.courseDirs(c.dir);
    const list = lesson ? [findLesson(c, lesson)] : recsOf(c).filter(r => r.videoExists && !r.transcript);
    await Promise.all(list.filter(r => r.videoExists).map(r => t.enqueue(path.join(d.video, r.file), d.transcripts, { ...s.transcription, ...(c.language ? { language: c.language } : {}) }).catch(() => { })));
    return { transcribed: list.length };
}

module.exports = { status, courses, lessons, lesson, transcript, aiNote, coursePage, generateAiNote, search, ask, notes, todos, events, freeRooms, sedi, sync, transcribe, findCourse, findLesson, TEMPLATES: Object.keys(ai.TEMPLATES) };
