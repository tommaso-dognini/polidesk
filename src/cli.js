#!/usr/bin/env node
'use strict';
// PoliRec command line (same engine as the app; shares ~/.polirec config and Chrome session)
//
//   node src/cli.js courses                         list your WeBeep courses
//   node src/cli.js add <course> <dir> [name]       add a course (link, code, name or webeep:<id>)
//   node src/cli.js list                            list configured courses
//   node src/cli.js sync [nameOrIndex...] [--dry-run] [-j N]
//   node src/cli.js transcribe [nameOrIndex]        transcribe downloaded videos without transcript
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

(async () => {
    const cfg = lib.loadConfig();
    if (cmd === 'courses') {
        const s = new Session();
        try { (await webeep.enrolledCourses(s)).sort((a, b) => b.id - a.id).forEach(c => console.log(`webeep:${c.id}\t${c.fullname}`)); }
        finally { await s.close(); }
    } else if (cmd === 'add') {
        const [input, dir, name] = args;
        if (!input || !dir) throw new Error('uso: add <corso> <cartella> [nome]');
        const c = { id: crypto.randomUUID(), input, dir: path.resolve(dir), name: name || '', extraUrls: [] };
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
        const list = pick(cfg, args);
        const s = new Session({ onLoginRequired: () => console.log('\x07') });
        let stop = false;
        process.on('SIGINT', () => { if (stop) process.exit(130); stop = true; console.log('\n⏹  Interrompo dopo i download in corso (Ctrl+C di nuovo per uscire subito)'); });
        try {
            for (const c of list) {
                console.log(`\n━━ ${c.name || c.input} ━━`);
                const lastPct = {};
                const r = await syncCourse(s, c, {
                    dryRun, parallel, shouldStop: () => stop,
                    emit: e => {
                        if (e.type === 'log') console.log(e.msg);
                        if (e.type === 'progress' && process.stdout.isTTY) {
                            const p = Math.floor(e.percent / 10) * 10;
                            if (lastPct[e.key] !== p) { lastPct[e.key] = p; console.log(`     ${String(Math.round(e.percent)).padStart(3)}% ${e.speed || ''}  ${e.file}`); }
                        }
                    },
                });
                lib.saveConfig(cfg);
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
    } else {
        console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 10).join('\n').replace(/^\/\/ ?/gm, ''));
    }
})().catch(e => { console.error('✗', e.message); process.exit(1); });
