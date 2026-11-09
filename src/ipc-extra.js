'use strict';
// IPC for: workspace/todos/pomodoro, calendar, free rooms, notes editors (+AI panel, dictation),
// transcript cleaning, hardware recommendations, about/donate/update check.
const { app, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const lib = require('./core/library');
const ws = require('./core/workspace');
const rooms = require('./core/rooms');
const timetable = require('./core/timetable');
const notes = require('./core/notes');
const ai = require('./core/ai');
const cleaner = require('./core/cleaner');
const setup = require('./core/setup');
const cloud = require('./core/cloud');
const integ = require('./core/integrations');
const { APP_DIR } = require('./core/paths');
const pkg = require('../package.json');

let hwCache = null;

/** The configured AI CLI, or the first one installed (works on any machine). */
function pickProvider(settings) {
    const av = ai.available();
    const want = settings.ai && settings.ai.provider;
    if (want && av[want] && av[want].path) return want;
    const first = ['agy', 'claude', 'gemini'].find(k => av[k] && av[k].path);
    if (!first) throw new Error('Nessuno strumento AI installato: installa Antigravity CLI, Claude Code o Gemini CLI e sceglilo in Impostazioni → AI');
    return first;
}
function hardware() {
    if (!hwCache) {
        const hw = setup.detect();
        const rec = setup.recommend(hw);
        hwCache = {
            hw, rec,
            parallel: Math.max(2, Math.min(6, Math.round(hw.cores / 3))),
            pomodoro: { focus: 25, short: 5, long: 15 },
        };
    }
    return hwCache;
}

function register({ handle, send, cfg, findCourse, getSession, closeSession, isSyncing, onNotesChanged = () => { } }) {
    // notes + workspace live in the cloud folder when sync is on, otherwise in the course folder
    const courseDir = id => {
        const s = cfg().settings;
        if (!id) return cloud.root(s) || null;          // global workspace (null → ~/.polirec)
        return cloud.courseDataDir(s, findCourse(id));
    };
    const notesRoot = () => cloud.generalNotesDir(cfg().settings);
    const notesDir = scope => scope ? notes.dirFor(courseDir(scope)) : notesRoot();

    // ── hardware recommendations ──
    handle('hw', async () => hardware());

    // ── transcription engine switch (Whisper ⇄ Parakeet) ──
    handle('engine:set', async ({ engine, model }) => {
        if (engine === 'parakeet') {
            const ok = await new Promise(r => require('child_process').execFile(cfg().settings.transcription.python, ['-c', 'import parakeet_mlx'], e => r(!e)));
            if (!ok) { send({ type: 'log', msg: '🧰 Installo parakeet-mlx…' }); await setup.addPackage('parakeet-mlx', l => send({ type: 'log', msg: l })); }
        }
        const c = cfg(); c.settings.transcription.engine = engine; c.settings.transcription.model = model; lib.saveConfig(c);
        return c.settings.transcription;
    });

    // ── workspace (course page, todos, pomodoro) ──
    handle('ws:get', async courseId => { const w = ws.load(courseDir(courseId)); return { ...w, stats: ws.stats(w) }; });
    handle('ws:page', async ({ courseId, text }) => { ws.update(courseDir(courseId), w => { w.page = text; }); onNotesChanged(courseId); return true; });
    handle('ws:todo:add', async ({ courseId, todo }) => ws.todo.add(courseDir(courseId), todo).todos);
    handle('ws:todo:set', async ({ courseId, id, patch }) => ws.todo.set(courseDir(courseId), id, patch).todos);
    handle('ws:todo:remove', async ({ courseId, id }) => ws.todo.remove(courseDir(courseId), id).todos);
    handle('ws:pomodoro', async ({ courseId, minutes, kind, start }) => ws.stats(ws.logPomodoro(courseDir(courseId), { minutes, kind, start })));
    handle('ws:all-todos', async () => {
        const all = [];
        const g = ws.load(courseDir(null)); g.todos.forEach(t => all.push({ ...t, courseId: null, course: 'Generale' }));
        for (const c of cfg().courses) { try { ws.load(cloud.courseDataDir(cfg().settings, c)).todos.forEach(t => all.push({ ...t, courseId: c.id, course: c.name || c.input })); } catch (e) { } }
        return all;
    });

    // ── calendar ──
    handle('cal:sync', async () => {
        const s = getSession();
        try { return await timetable.sync(s, msg => send({ type: 'log', msg })); }
        finally { if (!isSyncing()) await closeSession(); }
    });
    handle('cal:importText', async text => timetable.importText(text));
    handle('cal:importIcs', async src => {
        if (!src) {
            const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Calendario', extensions: ['ics'] }] });
            if (r.canceled) return 0; src = r.filePaths[0];
        }
        return timetable.importIcs(src, /^https?:|^webcal:/.test(src) ? 'Calendario web' : path.basename(src));
    });
    handle('cal:events', async ({ from, to }) => {
        const evs = timetable.occurrences(new Date(from), new Date(to));
        const courses = cfg().courses.map(c => ({ ...c, manifest: lib.loadManifest(c.dir) }));
        for (const e of evs) { const c = courses.find(c => timetable.matchCourse(e.summary, c)); if (c) { e.courseId = c.id; e.course = c.name; } }
        return { events: evs, meta: (({ updatedAt, feeds }) => ({ updatedAt, feeds }))(timetable.load()) };
    });
    handle('cal:revealIcs', async () => { if (fs.existsSync(timetable.ICS)) shell.showItemInFolder(timetable.ICS); else throw new Error('Importa prima l\'orario'); return true; });

    // ── free rooms ──
    handle('rooms:spaces', async () => { const sp = await rooms.spaces(); return { sedi: sp.sedi, campus: sp.campus }; });
    handle('rooms:free', async q => rooms.freeRooms({ ...q, when: new Date(q.when), onProgress: p => send({ type: 'rooms-progress', p }) }));

    // ── notes (appunti) ──
    handle('notes:scopes', async () => [{ id: null, name: 'Generale', dir: notesRoot() }].concat(cfg().courses.map(c => ({ id: c.id, name: c.name || c.input, dir: notes.dirFor(c.dir) }))));
    handle('notes:list', async scope => notes.list(notesDir(scope)));
    handle('notes:read', async ({ scope, file }) => notes.read(notesDir(scope), file));
    handle('notes:write', async ({ scope, file, content }) => { const r = notes.write(notesDir(scope), file, content); onNotesChanged(scope); return r; });
    handle('notes:create', async ({ scope, title, kind }) => notes.create(notesDir(scope), title, kind));
    handle('notes:rename', async ({ scope, file, name }) => notes.rename(notesDir(scope), file, name));
    handle('notes:remove', async ({ scope, file }) => notes.remove(notesDir(scope), file));
    handle('notes:asset', async ({ scope, file, name, data }) => notes.saveAsset(notesDir(scope), file, name, data));
    handle('notes:dir', async scope => notesDir(scope));
    handle('notes:engines', async () => notes.engineStatus());
    handle('notes:installEngine', async name => notes.installEngine(name, line => send({ type: 'log', msg: `🧰 ${line}` })));
    handle('notes:compile', async ({ scope, file }) => {
        const dir = notesDir(scope);
        const r = await notes.compile(dir, file, { onLog: l => send({ type: 'compile-log', line: l }) });
        if (r.pdf) r.pdfUrl = pathToFileURL(path.join(dir, r.pdf)).href + '?t=' + Date.now();
        return r;
    });
    async function mdToPdf(html, out) {
        // Markdown → PDF via an offscreen window (same KaTeX CSS as the preview)
        const { BrowserWindow } = require('electron');
        const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
        const css = fs.readFileSync(path.join(__dirname, 'renderer', 'vendor', 'katex.min.css'), 'utf8').replace(/url\(fonts\//g, `url(${pathToFileURL(path.join(__dirname, 'renderer', 'vendor', 'fonts')).href}/`);
        const page = `<!doctype html><meta charset="utf-8"><style>${css} body{font:11pt/1.55 -apple-system,"Segoe UI",sans-serif;max-width:720px;margin:24px auto;color:#111} pre,code{font-family:Menlo,monospace;font-size:.9em} pre{background:#f4f4f4;padding:10px;border-radius:6px} img{max-width:100%} blockquote{border-left:3px solid #ddd;margin:0;padding-left:12px;color:#555}</style>${html}`;
        const tmp = path.join(os.tmpdir(), `polirec-${Date.now()}.html`);
        fs.writeFileSync(tmp, page);
        await w.loadFile(tmp);
        const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } });
        fs.writeFileSync(out, pdf); w.destroy(); fs.unlinkSync(tmp);
        return out;
    }
    handle('notes:exportPdf', async ({ html, out }) => { await mdToPdf(html, out); shell.showItemInFolder(out); return out; });

    /** Send a note to another app: notion | applenotes | goodnotes | notability | obsidian | pdf */
    handle('notes:exportTo', async ({ scope, file, target, html }) => {
        const dir = notesDir(scope), abs = path.join(dir, file);
        const kind = notes.KIND_BY_EXT[path.extname(file)];
        const title = path.basename(file).replace(/\.(md|tex|typ)$/, '');
        const content = fs.readFileSync(abs, 'utf8');
        const pdfPath = async () => {
            if (kind === 'markdown') return mdToPdf(html, abs.replace(/\.md$/, '.pdf'));
            const r = await notes.compile(dir, file);
            if (!r.ok) throw new Error('Compilazione non riuscita: correggi gli errori prima di esportare');
            return path.join(dir, r.pdf);
        };
        const en = cfg().settings.integrations || {};
        if (target !== 'pdf' && !en[target]) throw new Error('Integrazione non attiva: attivala in Impostazioni → Integrazioni');
        if (target === 'notion') { const s = cfg().settings.integrations; return { url: await integ.exportToNotion({ token: s.notionToken, parent: s.notionParent, title, markdown: content, kind }) }; }
        if (target === 'applenotes') { await integ.exportToAppleNotes(title, html || `<pre>${content.replace(/</g, '&lt;')}</pre>`); return { ok: true }; }
        if (target === 'goodnotes' || target === 'notability') { const p = await pdfPath(); return { app: await integ.openPdfIn(target, p), pdf: p }; }
        if (target === 'pdf') { const p = await pdfPath(); shell.showItemInFolder(p); return { pdf: p }; }
        if (target === 'obsidian') {
            const vault = integ.obsidianVault(abs);
            if (!vault) return { needVault: true, dir };
            await shell.openExternal(integ.obsidianUrl(abs)); return { ok: true, vault };
        }
        throw new Error('destinazione sconosciuta');
    });
    handle('integrations:apps', async () => integ.installedApps());
    handle('integrations:testNotion', async ({ token, parent }) => integ.testNotion(token, parent));

    // ── cloud sync (iCloud / Google Drive / any folder) ──
    handle('cloud:detect', async () => cloud.detect());
    handle('cloud:set', async ({ enabled, provider, path: p }) => {
        const c = cfg();
        c.settings.cloud = { ...c.settings.cloud, enabled: !!enabled, provider: provider || '', path: p || '' };
        let copied = 0, pulled = null;
        if (enabled) {
            pulled = cloud.importConfig(c);            // another computer may already have synced
            copied = cloud.migrateToCloud(c, msg => send({ type: 'log', msg }));
        }
        lib.saveConfig(c);                             // also writes polirec-sync.json
        return { copied, pulled, root: cloud.root(c.settings) };
    });
    handle('cloud:pull', async () => {
        const c = cfg();
        const r = cloud.importConfig(c);
        if (r.changed) lib.saveConfig(c, { noExport: true });
        return r;
    });

    // AI chat for a note. Edits come back as a full revised document → shown inline as accept/reject changes.
    handle('ai:assist', async ({ instruction, document, selection, kind, courseId, history = [] }) => {
        const s = cfg().settings.ai;
        const prov = pickProvider(cfg().settings);
        const lang = { markdown: 'Markdown (formule LaTeX tra $…$)', latex: 'LaTeX', typst: 'Typst' }[kind] || 'Markdown';
        const courseCtx = courseId ? `Gli appunti sono del corso universitario "${(findCourse(courseId) || {}).name || ''}".\n` : '';
        const hist = history.slice(-6).map(h => `Studente: ${h.q}\nAssistente: ${h.a}`).join('\n\n');
        const prompt = `Sei l'assistente di scrittura di un editor di appunti universitari in ${lang}. ${courseCtx}` +
            `Hai il documento completo${selection ? ' e la porzione selezionata dallo studente' : ''}.\n` +
            `Se la richiesta comporta MODIFICARE o AGGIUNGERE testo nel documento, rispondi ESATTAMENTE in questo formato:\n` +
            `@@NOTA@@ una frase che riassume le modifiche\n@@DOCUMENTO@@\n<il documento COMPLETO aggiornato, in ${lang}>\n` +
            (selection ? `Modifica solo la parte selezionata (e ciò che serve per coerenza), lascia il resto identico.\n` : `Lascia identiche le parti che non devi cambiare.\n`) +
            `Se invece è una DOMANDA o una richiesta di spiegazione, rispondi normalmente in italiano, in Markdown, in modo conciso.\n` +
            (hist ? `\nConversazione precedente:\n${hist}\n` : '') + `\nRichiesta: ${instruction}`;
        const input = `<documento>\n${document}\n</documento>` + (selection ? `\n<selezione>\n${selection}\n</selezione>` : '');
        const jobId = crypto.randomUUID();
        send({ type: 'ai-start', jobId, provider: prov, assist: true });
        try {
            const out = await ai.runPrompt(prov, prompt, input, { model: s.model, cwd: os.tmpdir(), onChunk: ch => send({ type: 'ai-chunk', jobId, chunk: ch }) });
            send({ type: 'ai-done', jobId, assist: true });
            const m = out.match(/@@DOCUMENTO@@\s*\n([\s\S]*)$/);
            if (m) {
                const note = (out.match(/@@NOTA@@\s*(.*)/) || [])[1] || 'Modifiche proposte';
                const doc = m[1].replace(/^```\w*\n([\s\S]*?)\n```\s*$/, '$1').replace(/\s+$/, '') + '\n';
                return { mode: 'edit', note: note.trim(), document: doc };
            }
            return { mode: 'answer', text: out.trim() };
        } catch (e) { send({ type: 'ai-error', jobId, error: e.message }); throw e; }
    });

    // Dictation (Handy-style push-to-talk): audio from the renderer → local Whisper → text
    handle('dictate', async ({ data, language }) => {
        const t = cfg().settings.transcription;
        if (!cfg().settings.setupDone) throw new Error('Completa prima il setup della trascrizione');
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'polirec-dict-'));
        const f = path.join(tmp, 'dettato.webm');
        fs.writeFileSync(f, Buffer.from(data));
        const { spawn } = require('child_process');
        const { SCRIPT } = require('./core/transcriber');
        const env = { ...require('./core/downloader').toolEnv(), PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
        const args = [SCRIPT, '--engine', t.engine || 'auto', '--model', t.model || 'small', '--language', language || t.language || 'auto', '--formats', 'txt', '--out-dir', tmp, f];
        const text = await new Promise((resolve, reject) => {
            const p = spawn(t.python || 'python3', args, { env, windowsHide: true });
            let err = '';
            p.stderr.on('data', d => err += d);
            p.on('close', code => {
                const out = path.join(tmp, 'dettato.txt');
                if (code === 0 && fs.existsSync(out)) resolve(fs.readFileSync(out, 'utf8')); else reject(new Error('Dettatura fallita: ' + err.slice(-300)));
            });
            p.on('error', reject);
        });
        fs.rmSync(tmp, { recursive: true, force: true });
        return cleaner.cleanDictation(text.trim());
    });

    // ── transcript cleaning ──
    handle('transcripts:clean', async ({ courseId, keys, restore }) => {
        const c = findCourse(courseId);
        const d = lib.courseDirs(c.dir);
        const recs = lib.withFileStatus(c.dir, lib.loadManifest(c.dir)).filter(r => r.transcript && (!keys || keys.includes(r.key)));
        let removed = 0;
        for (const r of recs) {
            const stem = r.file.replace(/\.mp4$/i, '');
            if (restore) cleaner.restoreOriginal(d.transcripts, stem);
            else removed += cleaner.cleanTranscriptFiles(d.transcripts, stem).removedSegments;
        }
        return { files: recs.length, removed };
    });

    // ── about / donate / updates ──
    const meta = pkg.polirec || {};
    handle('about', async () => ({
        version: app.getVersion(), name: pkg.productName || 'PoliRec', donateUrl: meta.donateUrl || '', repo: meta.repo || '',
        electron: process.versions.electron, platform: `${process.platform} ${process.arch}`, dataDir: APP_DIR,
    }));
    handle('about:notice', async () => { const p = path.join(__dirname, '..', 'NOTICE.md'); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; });
    handle('update:check', async () => {
        if (!meta.repo) return null;
        const r = await fetch(`https://api.github.com/repos/${meta.repo}/releases/latest`, { headers: { 'User-Agent': 'PoliRec' } });
        if (!r.ok) return null;
        const j = await r.json();
        const latest = String(j.tag_name || '').replace(/^v/, '');
        const newer = latest && latest.localeCompare(app.getVersion(), undefined, { numeric: true }) > 0;
        return newer ? { version: latest, url: j.html_url } : null;
    });
}

module.exports = { register, hardware, pickProvider };
