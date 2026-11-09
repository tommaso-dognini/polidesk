#!/usr/bin/env node
'use strict';
// PoliRec command line (same engine and data as the app — safe to use while the app is open)
//
//   polirec status                                   app, AI and transcription status
//   polirec list                                     configured courses
//   polirec courses                                  your WeBeep courses (login)
//   polirec add <course> <dir> [name] [--materials] [--lang en]
//   polirec sync [course...] [--dry-run] [-j N] [--limit N] [--materials]
//   polirec transcribe [course]
//   polirec lessons <course> [--all]                 lessons with summary (--all: also other teachers)
//   polirec lesson <course> <lesson>                 details (lesson = number, YYYY-MM-DD or title)
//   polirec transcript <course> <lesson> [--timestamps]
//   polirec ainote <course> <lesson> <kind> [--generate]   kind: sommario appunti riassunto spiegazione flashcard domande
//   polirec search "<query>" [--course X] [-k N]     semantic search
//   polirec ask "<question>" [--course X]            answer with citations
//   polirec notes [course]                           student notes   ·   polirec note <file> [--course X]
//   polirec new-note "<title>" [--course X] [--lesson N]... [--kind markdown|latex|typst]  (content from stdin)
//   polirec todo [course] · todo add "<text>" [--course X] [--due YYYY-MM-DD] · todo done "<text|id>" [--course X]
//   polirec timetable [--days N] [--course X]        polirec rooms [--sede MIA] [--from 14:00] [--hours 2]
//   polirec mcp                                      start the MCP server (stdio) for Claude & co.
//   add --json to any read command for machine-readable output
const path = require('path');
const crypto = require('crypto');
const { Session } = require('./core/browser');
const webeep = require('./core/webeep');
const lib = require('./core/library');
const { syncCourse } = require('./core/sync');
const { Transcriber } = require('./core/transcriber');

const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (n, def) => { const i = args.indexOf(n); if (i === -1) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const bool = n => { const i = args.indexOf(n); if (i === -1) return false; args.splice(i, 1); return true; };

function pick(cfg, sel) {
    if (!sel.length) return cfg.courses;
    return sel.map(s => cfg.courses[+s - 1] || cfg.courses.find(c => (c.name || c.input).toLowerCase().includes(s.toLowerCase()))).filter(Boolean);
}

const api = require('./core/api');
const many = n => { const out = []; let i; while ((i = args.indexOf(n)) !== -1) { out.push(args[i + 1]); args.splice(i, 2); } return out; };
const readStdin = () => process.stdin.isTTY ? Promise.resolve('') : new Promise(r => { let d = ''; process.stdin.on('data', c => d += c); process.stdin.on('end', () => r(d)); });
const pretty = x => Array.isArray(x)
    ? x.map(o => typeof o !== 'object' ? String(o) : Object.entries(o).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' · ') : typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n  ')).join('\n\n')
    : JSON.stringify(x, null, 2);
// read/write commands backed by the shared API (src/core/api.js)
const API = {
    status: () => api.status(),
    lessons: () => api.lessons(args[0], { all: bool('--all') }),
    lesson: () => api.lesson(args[0], args[1]),
    transcript: () => { const ts = bool('--timestamps'); return api.transcript(args[0], args[1], { timestamps: ts }).text; },
    ainote: async () => { const gen = bool('--generate'); const r = gen ? await api.generateAiNote(args[0], args[1], args[2]) : api.aiNote(args[0], args[1], args[2]); return r.content || r; },
    search: () => { const course = flag('--course'); const k = +flag('-k', 10); return api.search(args.join(' '), { course, k }); },
    ask: async () => { const course = flag('--course'); const r = await api.ask(args.join(' '), { course }); return r.answer + '\n\n' + r.sources.join('\n'); },
    notes: () => api.notes.list(args[0]),
    note: () => { const course = flag('--course'); return api.notes.read(course, args[0]).content; },
    'new-note': async () => { const course = flag('--course'); const kind = flag('--kind', 'markdown'); const lessons = many('--lesson').map(l => ({ lesson: l })); return api.notes.create(course, { title: args.join(' '), kind, content: await readStdin(), lessons }); },
    todo: () => {
        const course = flag('--course'); const due = flag('--due');
        if (args[0] === 'add') return api.todos.add(course, args.slice(1).join(' '), due);
        if (args[0] === 'done') return api.todos.done(course, args.slice(1).join(' '));
        return api.todos.list(args[0] || course);
    },
    timetable: () => { const days = +flag('--days', 7); const course = flag('--course'); return api.events({ days, course }); },
    rooms: async () => { const sede = flag('--sede', 'MIA'); const from = flag('--from'); const hours = +flag('--hours', 2); const r = await api.freeRooms({ sede, from, hours }); return r.free.map(x => `${x.room.padEnd(14)} ${x.building} · ${x.seats || '?'} posti · libera fino ${x.freeUntil}`).join('\n') || 'Nessuna aula libera'; },
};

(async () => {
    const cfg = lib.loadConfig();
    if (cmd === 'courses') {
        const s = new Session({ email: cfg.settings.polimiEmail });
        try { (await webeep.enrolledCourses(s)).sort((a, b) => b.id - a.id).forEach(c => console.log(`webeep:${c.id}\t${c.fullname}`)); }
        finally { await s.close(); }
    } else if (cmd === 'add') {
        const materials = bool('--materials');
        const language = flag('--lang', '');
        const [input, dir, name] = args;
        if (!input || !dir) throw new Error('uso: add <corso> <cartella> [nome]');
        const c = { id: crypto.randomUUID(), input, dir: path.resolve(dir), name: name || '', extraUrls: [], materials, language };
        const m = input.match(/^webeep:(\d+)$/); if (m) c.webeepId = +m[1];
        cfg.courses.push(c); lib.saveConfig(cfg);
        console.log('Aggiunto:', c.name || c.input, '→', c.dir);
    } else if (cmd === 'list') {
        cfg.courses.forEach((c, i) => {
            const recs = lib.withFileStatus(c.dir, lib.loadManifest(c.dir));
            console.log(`${i + 1}. ${c.name || c.input}  [${recs.filter(r => r.videoExists).length}/${recs.length} video, ${recs.filter(r => r.transcript).length} trascritti]\n   ${c.dir}`);
        });
    } else if (cmd === 'sync') {
        const dryRun = bool('--dry-run');
        const parallel = +flag('-j', cfg.settings.parallelDownloads);
        const limit = +flag('--limit', 0) || 0;
        const onlyMaterials = bool('--only-materials');
        const withMaterials = bool('--materials') || onlyMaterials ? true : undefined;
        const list = pick(cfg, args);
        const s = new Session({ email: cfg.settings.polimiEmail, onLoginRequired: () => console.log('\x07') });
        let stop = false;
        process.on('SIGINT', () => { if (stop) process.exit(130); stop = true; console.log('\n⏹  Interrompo dopo i download in corso (Ctrl+C di nuovo per uscire subito)'); });
        try {
            for (const c of list) {
                console.log(`\n━━ ${c.name || c.input} ━━`);
                const lastPct = {};
                const r = await syncCourse(s, c, {
                    dryRun, parallel, limit, onlyMaterials, materials: withMaterials, shouldStop: () => stop,
                    emit: e => {
                        if (e.type === 'log') console.log(e.msg);
                        if (e.type === 'progress' && process.stdout.isTTY) {
                            const p = Math.floor(e.percent / 10) * 10;
                            if (lastPct[e.key] !== p) { lastPct[e.key] = p; console.log(`     ${String(Math.round(e.percent)).padStart(3)}% ${e.speed || ''}  ${e.file}`); }
                        }
                    },
                });
                lib.patchCourse(c.id, { webeepId: c.webeepId, name: c.name });
                console.log('Risultato:', JSON.stringify(r));
            }
        } finally { await s.close(); }
    } else if (cmd === 'transcribe') {
        const t = new Transcriber({ emit: e => { if (e.type === 'transcribe-start') console.log('🎙', path.basename(e.video)); if (e.type === 'transcribe-done') console.log('  ✓', e.files.map(f => path.basename(f)).join(', ')); if (e.type === 'transcribe-error') console.log('  ✗', e.error); if (e.type === 'transcribe-progress' && e.percent % 10 === 0) process.stdout.write(`  ${e.percent}%\r`); } });
        const jobs = [];
        for (const c of pick(cfg, args)) {
            const d = lib.courseDirs(c.dir);
            for (const r of lib.withFileStatus(c.dir, lib.loadManifest(c.dir))) if (r.videoExists && !r.transcript) jobs.push(t.enqueue(path.join(d.video, r.file), d.transcripts, { ...cfg.settings.transcription, ...(c.language ? { language: c.language } : {}) }).catch(() => { }));
        }
        console.log(`${jobs.length} video da trascrivere`);
        await Promise.all(jobs);
    } else if (cmd === 'mcp') {
        require('./mcp');
        return;
    } else if (API[cmd]) {
        const json = bool('--json');
        const out = await API[cmd]();
        if (out === undefined) return;
        if (json || typeof out !== 'string') console.log(typeof out === 'string' ? JSON.stringify(out) : json ? JSON.stringify(out, null, 2) : pretty(out));
        else console.log(out);
    } else {
        console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 25).join('\n').replace(/^\/\/ ?/gm, ''));
    }
})().catch(e => { console.error('✗', e.message); process.exit(1); });
