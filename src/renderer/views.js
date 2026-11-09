'use strict';
/* Extra views: Pomodoro, Appunti (editors + AI panel + dictation), Calendario, Aule libere, Da fare, Panoramica corso.
   Uses globals from app.js: api, $, $$, esc, S, route, go, guard, toast, log, md, course, cname, field, sw, fmtDate, refresh */

window.extraViews = {};

// window.prompt() is not supported in Electron: in-app text dialog instead.
function askText(title, { value = '', placeholder = '', multiline = false, ok = 'OK', help = '' } = {}) {
    return new Promise(resolve => {
        const root = $('#modal-root');
        root.innerHTML = `<div class="modal-bg"><div class="modal"><h2>${esc(title)}</h2>${help ? `<p class="muted" style="margin:0">${esc(help)}</p>` : ''}
            ${multiline ? `<textarea id="ask-v" rows="10" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input id="ask-v" value="${esc(value)}" placeholder="${esc(placeholder)}">`}
            <div class="foot"><button class="ghost" id="ask-no">Annulla</button><button class="primary" id="ask-ok">${esc(ok)}</button></div></div></div>`;
        const inp = $('#ask-v'), done = v => { root.innerHTML = ''; document.removeEventListener('keydown', key); resolve(v); };
        const key = e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); done(inp.value); } };
        document.addEventListener('keydown', key);
        $('#ask-no').onclick = () => done(null);
        $('#ask-ok').onclick = () => done(inp.value);
        $('.modal-bg', root).onclick = e => { if (e.target.classList.contains('modal-bg')) done(null); };
        inp.focus(); if (inp.select) inp.select();
    });
}
window.askText = askText;

// New note dialog: title + format
function askNewNote(defaultKind) {
    return new Promise(resolve => {
        const root = $('#modal-root');
        let kind = defaultKind || 'markdown';
        root.innerHTML = `<div class="modal-bg"><div class="modal"><h2>Nuovo appunto</h2>
            <label class="l">Titolo<input id="nn-t" placeholder="es. Lezione 3 — Backpropagation"></label>
            <label class="l">Formato<div class="seg" id="nn-k">${[['markdown', 'Markdown'], ['latex', 'LaTeX'], ['typst', 'Typst']].map(([k, l]) => `<button data-v="${k}" class="${k === kind ? 'on' : ''}">${l}</button>`).join('')}</div></label>
            <div class="foot"><button class="ghost" id="nn-no">Annulla</button><button class="primary" id="nn-ok">Crea</button></div></div></div>`;
        const done = v => { root.innerHTML = ''; document.removeEventListener('keydown', key); resolve(v); };
        const ok = () => done({ title: $('#nn-t').value.trim() || 'Senza titolo', kind });
        const key = e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter') { e.preventDefault(); ok(); } };
        document.addEventListener('keydown', key);
        $$('#nn-k button').forEach(b => b.onclick = () => { kind = b.dataset.v; $$('#nn-k button').forEach(x => x.classList.toggle('on', x === b)); });
        $('#nn-no').onclick = () => done(null);
        $('#nn-ok').onclick = ok;
        $('#nn-t').focus();
    });
}
window.noRerender = new Set(['notes']);

// ═════════════ POMODORO (sidebar widget, state survives reloads) ═════════════
const Pomo = {
    st: (() => { try { return JSON.parse(localStorage.getItem('pomo')) || null; } catch (e) { return null; } })() || { mode: 'focus', running: false, endsAt: 0, left: 0, count: 0, courseId: null, startedAt: null },
    cfg() { return (S && S.settings.pomodoro) || { focus: 25, short: 5, long: 15, every: 4, sound: true }; },
    dur(mode) { const c = this.cfg(); return (mode === 'focus' ? c.focus : mode === 'short' ? c.short : c.long) * 60000; },
    save() { localStorage.setItem('pomo', JSON.stringify(this.st)); },
    remaining() { return this.st.running ? Math.max(0, (this.st.endsAt || 0) - Date.now()) : (this.st.left > 0 ? this.st.left : this.dur(this.st.mode)); },
    start() { if (this.st.running) return; const left = this.remaining(); this.st.endsAt = Date.now() + (left > 0 ? left : this.dur(this.st.mode)); this.st.running = true; this.st.startedAt = this.st.startedAt || new Date().toISOString(); this.save(); this.draw(); },
    pause() { this.st.left = this.remaining(); this.st.running = false; this.save(); this.draw(); },
    reset(mode) { this.st = { ...this.st, mode: mode || this.st.mode, running: false, left: this.dur(mode || this.st.mode), startedAt: null }; this.save(); this.draw(); },
    async finish() {
        const was = this.st.mode;
        const minutes = Math.round(this.dur(was) / 60000);
        this.st.running = false;
        if (was === 'focus') {
            this.st.count++;
            guard(() => api.ws.pomodoro(this.st.courseId, minutes, 'focus', this.st.startedAt));
            const next = this.st.count % this.cfg().every === 0 ? 'long' : 'short';
            this.notify('🍅 Sessione completata!', `Pausa ${next === 'long' ? 'lunga' : 'breve'} di ${Math.round(this.dur(next) / 60000)} minuti.`);
            this.st.mode = next;
        } else { this.notify('☕ Pausa finita', 'Si torna a studiare.'); this.st.mode = 'focus'; }
        this.st.left = this.dur(this.st.mode); this.st.startedAt = null; this.save(); this.draw();
    },
    notify(title, body) {
        try { new Notification(title, { body, silent: !this.cfg().sound }); } catch (e) { }
        if (this.cfg().sound) { try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + 1.2); o.start(); o.stop(a.currentTime + 1.2); } catch (e) { } }
        toast(title + ' ' + body, 5000);
    },
    draw() {
        const el = $('#pomo'); if (!el || !S) return;
        const r = this.remaining(), m = Math.floor(r / 60000), s = Math.floor(r % 60000 / 1000);
        const label = { focus: 'Focus', short: 'Pausa', long: 'Pausa lunga' }[this.st.mode];
        const pct = 100 - r / this.dur(this.st.mode) * 100;
        const courses = S.courses.map(c => `<option value="${c.id}" ${this.st.courseId === c.id ? 'selected' : ''}>${esc(cname(c))}</option>`).join('');
        el.innerHTML = `<div class="pomo-card ${this.st.mode}">
            <div class="row"><span class="pomo-label">🍅 ${label}</span><span class="grow"></span><span class="faint" title="Sessioni completate oggi">${this.st.count || ''}</span></div>
            <div class="pomo-time">${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</div>
            <div class="progress"><i style="width:${pct}%"></i></div>
            <div class="row" style="margin-top:6px"><button class="small ${this.st.running ? '' : 'primary'}" id="pomo-go">${this.st.running ? '❚❚' : '▶'}</button><button class="small ghost" id="pomo-reset" title="Azzera">↺</button><button class="small ghost" id="pomo-skip" title="Salta">⏭</button>
            <select id="pomo-course" class="small-select" title="Corso a cui assegnare il tempo"><option value="">Generale</option>${courses}</select></div></div>`;
        $('#pomo-go').onclick = () => this.st.running ? this.pause() : this.start();
        $('#pomo-reset').onclick = () => this.reset();
        $('#pomo-skip').onclick = () => this.finish();
        $('#pomo-course').onchange = e => { this.st.courseId = e.target.value || null; this.save(); };
    },
};
if (Pomo.st.running && (!Pomo.st.endsAt || Pomo.st.endsAt < Date.now() - 60000)) { Pomo.st.running = false; Pomo.st.left = Pomo.dur(Pomo.st.mode); Pomo.save(); }
setInterval(() => { if (Pomo.st.running) { if (Pomo.remaining() <= 0) Pomo.finish(); else Pomo.draw(); } }, 1000);
window.Pomo = Pomo;

// ═════════════ APPUNTI (editor) ═════════════
const Notes = { scope: null, file: null, kind: null, editor: null, dirty: false, saveT: null, aiOpen: true, dir: '', open: {} };
const KIND_LABEL = { markdown: 'Markdown', latex: 'LaTeX', typst: 'Typst' };
const KIND_SHORT = { markdown: 'MD', latex: 'TeX', typst: 'Typ' };
const KIND_INFO = {
    markdown: ['Markdown', 'Appunti veloci in stile Obsidian/Notion: titoli, liste, checklist, formule $…$, immagini incollate.'],
    latex: ['LaTeX', 'Documenti matematici completi. Si compila in PDF con il motore incluso (Tectonic).'],
    typst: ['Typst', 'Come LaTeX ma più semplice e istantaneo. Ottimo per formule e appunti impaginati.'],
};
// view mode per format: write | split | read
const viewMode = kind => { try { return localStorage.getItem('nview:' + kind) || 'split'; } catch (e) { return 'split'; } };
const setViewMode = (kind, m) => { try { localStorage.setItem('nview:' + kind, m); } catch (e) { } };

window.extraViews.notes = async v => {
    if (route.scope !== undefined) Notes.scope = route.scope;
    v.innerHTML = `<div class="notes-layout">
        <aside class="notes-side">
            <div class="ns-head"><b>Appunti</b><span class="grow"></span><button class="primary small" id="n-new" title="Nuovo appunto (⌘N)">＋ Nuovo</button><button class="ghost small icon" id="n-hide" title="Nascondi elenco (⌘⇧E)">⇤</button></div>
            <div class="ns-search"><input id="n-filter" placeholder="Cerca negli appunti…"></div>
            <div id="n-tree" class="n-tree"></div>
            <div class="ns-foot"><button class="ghost small" id="n-folder">⌂ Apri cartella</button><span class="faint" id="n-cloud"></span></div>
        </aside>
        <section class="notes-main" id="n-main"></section>
    </div>`;
    const layout = $('.notes-layout', v);
    const setFiles = hidden => { layout.classList.toggle('files-hidden', hidden); try { localStorage.setItem('notesFilesHidden', hidden ? '1' : '0'); } catch (e) { } };
    Notes.toggleFiles = () => setFiles(!layout.classList.contains('files-hidden'));
    try { setFiles(localStorage.getItem('notesFilesHidden') === '1'); } catch (e) { }
    $('#n-hide', v).onclick = () => setFiles(true);
    const scopes = await api.notes.scopes();
    const cloudOn = S.settings.cloud && S.settings.cloud.enabled;
    $('#n-cloud').textContent = cloudOn ? '☁ sincronizzati' : '';
    const lists = {};
    const loadFiles = async () => {
        await Promise.all(scopes.map(async s => { lists[s.id || ''] = await api.notes.list(s.id); }));
        const q = ($('#n-filter').value || '').toLowerCase();
        $('#n-tree').innerHTML = scopes.map(s => {
            const key = s.id || '';
            const files = (lists[key] || []).filter(f => !q || f.file.toLowerCase().includes(q));
            if (q && !files.length) return '';
            const open = Notes.open[key] ?? (key === String(Notes.scope || '') || files.length > 0);
            return `<div class="n-group ${open ? 'open' : ''}" data-s="${esc(key)}">
                <div class="n-gh"><span class="chev">▸</span><span class="n">${esc(s.name)}</span><span class="faint">${files.length || ''}</span><button class="icon ghost small n-add" title="Nuovo appunto in ${esc(s.name)}">＋</button></div>
                <div class="n-gb">${files.map(f => `<div class="n-file ${Notes.file === f.file && String(Notes.scope || '') === key ? 'on' : ''}" data-f="${esc(f.file)}" data-k="${f.kind}">
                    <span class="badge-k ${f.kind}">${KIND_SHORT[f.kind]}</span><span class="n">${esc(f.file.replace(/\.(md|tex|typ)$/, ''))}</span><span class="faint">${new Date(f.mtime).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span></div>`).join('') || '<div class="faint n-empty">vuoto</div>'}</div></div>`;
        }).join('');
        $$('.n-group').forEach(g => {
            const key = g.dataset.s;
            $('.n-gh', g).onclick = e => { if (e.target.closest('.n-add')) return; Notes.open[key] = !g.classList.contains('open'); g.classList.toggle('open'); };
            $('.n-add', g).onclick = () => create(key || null);
            $$('.n-file', g).forEach(x => x.onclick = () => openNote(x.dataset.f, x.dataset.k, key || null));
        });
    };
    Notes.reload = loadFiles;
    const create = (scope = Notes.scope) => guard(async () => {
        const r = await askNewNote(S.settings.editor.mode || 'markdown');
        if (!r) return;
        const f = await api.notes.create(scope, r.title, r.kind);
        Notes.open[scope || ''] = true;
        await loadFiles(); openNote(f, r.kind, scope);
    });
    Notes.create = create;
    $('#n-new').onclick = () => create(Notes.scope);
    $('#n-filter').oninput = loadFiles;
    $('#n-folder').onclick = () => guard(async () => api.openPath(await api.notes.dir(Notes.scope)));
    await loadFiles();
    if (route.file) openNote(route.file, route.kind || 'markdown', Notes.scope);
    else if (Notes.file && Notes.editor === null) welcome();
    else welcome();
};

// ── links note ↔ lessons (one note can cover several lessons, also of different courses) ──
async function drawNoteLinks(scope, file) {
    const box = $('#ed-links'); if (!box) return;
    const links = await api.notes.links(scope, file);
    if (Notes.file !== file || !box.isConnected) return;
    const label = l => { const cc = course(l.c); const rr = cc && cc.recordings.find(x => x.key === l.k); return rr ? `${rr.isoDate ? new Date(rr.isoDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : ''} ${rr.displayTitle || ''}`.trim() : null; };
    const valid = links.filter(l => label(l));
    box.innerHTML = valid.map(l => `<a class="lchip" data-c="${esc(l.c)}" data-k="${esc(l.k)}" title="${esc((course(l.c) ? cname(course(l.c)) + ' · ' : '') + label(l))}">▶ ${esc(label(l).slice(0, 34))}</a>`).join('') +
        `<button class="lchip add" id="ed-link-add" title="Collega a una o più lezioni">🔗 ${valid.length ? 'Modifica' : 'Collega a lezioni'}</button>`;
    $$('.lchip[data-k]', box).forEach(a => a.onclick = () => go({ name: 'recording', courseId: a.dataset.c, key: a.dataset.k, side: 'appunti' }));
    $('#ed-link-add', box).onclick = () => pickLessons(scope, file, links).then(ok => ok && drawNoteLinks(scope, file));
}
function pickLessons(scope, file, current) {
    const has = (c, k) => current.some(l => l.c === c && l.k === k);
    const courses = S.courses.slice().sort((a, b) => (a.id === scope ? -1 : b.id === scope ? 1 : 0));
    return new Promise(resolve => {
        const root = $('#modal-root');
        root.innerHTML = `<div class="modal-bg"><div class="modal wide"><h2>Collega a lezioni</h2>
            <p class="muted" style="margin-top:0">L'appunto comparirà nella pagina di ogni lezione selezionata (scheda «Appunti»).</p>
            <input id="pl-q" placeholder="Filtra per titolo o data…">
            <div class="pick-list" id="pl-list">${courses.map(cc => `<details ${cc.id === scope || cc.recordings.some(r => has(cc.id, r.key)) ? 'open' : ''}><summary class="pick-h">${esc(cname(cc))} <span class="faint">${cc.recordings.length}</span></summary>
                ${cc.recordings.slice().sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || '')).map(r => `<label class="pick" data-t="${esc(((r.displayTitle || '') + ' ' + (r.isoDate || '')).toLowerCase())}"><input type="checkbox" data-c="${esc(cc.id)}" data-k="${esc(r.key)}" ${has(cc.id, r.key) ? 'checked' : ''}><span class="faint pick-d">${r.isoDate ? new Date(r.isoDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '—'}</span>${esc(r.displayTitle || r.file)}</label>`).join('')}</details>`).join('')}</div>
            <div class="foot"><span class="faint" id="pl-n"></span><span class="grow"></span><button class="ghost" id="pl-no">Annulla</button><button class="primary" id="pl-ok">Salva</button></div></div></div>`;
        const done = v => { root.innerHTML = ''; document.removeEventListener('keydown', key); resolve(v); };
        const key = e => { if (e.key === 'Escape') done(false); };
        document.addEventListener('keydown', key);
        const count = () => { $('#pl-n').textContent = `${$$('#pl-list input:checked').length} lezioni selezionate`; };
        count(); $$('#pl-list input').forEach(i => i.onchange = count);
        $('#pl-q').oninput = e => { const q = e.target.value.toLowerCase(); $$('#pl-list .pick').forEach(l => l.style.display = !q || l.dataset.t.includes(q) ? '' : 'none'); if (q) $$('#pl-list details').forEach(d => d.open = true); };
        $('#pl-no').onclick = () => done(false);
        $('.modal-bg', root).onclick = e => { if (e.target.classList.contains('modal-bg')) done(false); };
        $('#pl-ok').onclick = () => guard(async () => {
            const keep = current.filter(l => !course(l.c));       // links to courses no longer in the app are preserved
            const sel = $$('#pl-list input:checked').map(i => ({ c: i.dataset.c, k: i.dataset.k }));
            await api.notes.setLinks(scope, file, keep.concat(sel)); done(true);
        });
        $('#pl-q').focus();
    });
}

function welcome() {
    const m = $('#n-main'); if (!m) return;
    const scopeName = Notes.scope && course(Notes.scope) ? cname(course(Notes.scope)) : 'Generale';
    m.innerHTML = `<div class="n-welcome"><h1>Nuovo appunto</h1><p class="muted">In <b>${esc(scopeName)}</b> · scegli il formato (il predefinito si cambia in Impostazioni → Appunti)</p>
        <div class="kind-cards">${Object.entries(KIND_INFO).map(([k, [t, d]]) => `<button class="kind-card ${k === (S.settings.editor.mode || 'markdown') ? 'def' : ''}" data-k="${k}"><span class="badge-k ${k}">${KIND_SHORT[k]}</span><b>${t}</b><span>${d}</span></button>`).join('')}</div>
        <p class="faint">Suggerimenti: <b>⌘S</b> salva (comunque salvo da solo) · <b>⌘↵</b> compila LaTeX/Typst · seleziona del testo e usa <b>✨ AI</b> · <b>🎙 Detta</b> trascrive la tua voce in locale.</p></div>`;
    $$('.kind-card', m).forEach(b => b.onclick = () => guard(async () => {
        const title = await askText(`Nuovo appunto ${KIND_LABEL[b.dataset.k]}`, { placeholder: 'Titolo', ok: 'Crea' });
        if (title === null) return;
        const f = await api.notes.create(Notes.scope, title.trim() || 'Senza titolo', b.dataset.k);
        await Notes.reload(); openNote(f, b.dataset.k, Notes.scope);
    }));
}

async function flush() {
    if (Notes.editor && Notes.editor.isReviewing()) Notes.editor.rejectAll();   // leaving with pending AI suggestions: keep the original
    if (!Notes.editor || !Notes.dirty) return;
    clearTimeout(Notes.saveT);
    await api.notes.write(Notes.scope, Notes.file, Notes.editor.getValue());
    Notes.dirty = false; const s = $('#ed-saved'); if (s) s.textContent = 'Salvato';
}
window.flushNote = flush;

async function openNote(file, kind, scope = Notes.scope) {
    await flush();
    if (Notes.editor) { Notes.editor.destroy(); Notes.editor = null; }
    Notes.scope = scope; Notes.file = file; Notes.kind = kind;
    Notes.dir = await api.notes.dir(scope);
    $$('.n-file').forEach(x => x.classList.toggle('on', x.dataset.f === file && x.closest('.n-group').dataset.s === String(scope || '')));
    const content = await api.notes.read(scope, file);
    const compiled = kind !== 'markdown';
    const engines = compiled ? await api.notes.engines() : {};
    const engineOk = kind === 'typst' ? engines.typst : kind === 'latex' ? engines.tectonic : true;
    const mode = viewMode(kind);
    const scopeName = scope && course(scope) ? cname(course(scope)) : 'Generale';
    const m = $('#n-main');
    m.innerHTML = `<header class="ed-head">
            <button class="ghost icon ed-files" id="ed-files" title="Mostra/nascondi elenco appunti (⌘⇧E)">☰</button>
            <div class="ed-titlebox"><input class="ed-title" id="ed-title" value="${esc(file.replace(/\.(md|tex|typ)$/, '').split('/').pop())}" spellcheck="false">
                <div class="ed-meta"><span class="badge-k ${kind}">${KIND_LABEL[kind]}</span><span>${esc(scopeName)}</span><span id="ed-saved">Salvato</span><span class="ed-links" id="ed-links"></span></div></div>
            <div class="ed-actions">
                <div class="seg" id="ed-mode">${[['write', 'Scrivi'], ['split', 'Dividi'], ['read', compiled ? 'PDF' : 'Leggi']].map(([k, l]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
                ${compiled ? '<button class="primary" id="ed-compile" title="⌘↵">▶ Compila</button>' : ''}
                <button id="ed-dict" title="Dettatura: parla, la voce viene trascritta in locale">🎙 Detta</button>
                <button id="ed-ai" class="${Notes.aiOpen ? 'on' : ''}" title="Assistente AI">✨ AI</button>
                <button id="ed-export">Esporta ▾</button>
                <button class="ghost icon" id="ed-more" title="Altro">⋯</button>
            </div>
        </header>
        ${compiled && !engineOk ? `<div class="banner ed-banner">Per compilare serve il motore ${kind === 'typst' ? 'Typst' : 'LaTeX (Tectonic)'}. <button class="small primary" id="ed-install">Installa ora</button> <span class="faint">${kind === 'typst' ? '~30 MB' : '~15 MB + pacchetti al primo uso'}</span></div>` : ''}
        <div class="ed-body mode-${mode} ${Notes.aiOpen ? 'with-ai' : ''}">
            <div class="ed-src" id="ed-src"></div>
            <div class="ed-prev" id="ed-prevpane">${compiled ? '<div class="empty-state">Premi <b>▶ Compila</b> (⌘↵) per vedere il PDF</div>' : ''}</div>
            <div class="ed-ai" id="ed-aipane"></div>
        </div>
        <pre class="ed-log hidden" id="ed-log"></pre>`;
    const onChange = () => {
        Notes.dirty = true; $('#ed-saved').textContent = 'Modificato…';
        clearTimeout(Notes.saveT); Notes.saveT = setTimeout(flush, 800);
        if (kind === 'markdown' && viewMode(kind) !== 'write') renderPreview();
    };
    Notes.editor = PoliEditor.create($('#ed-src'), { kind, value: content, onChange, onSave: () => { flush(); if (compiled) compileNote(); }, onReviewChange: reviewBar, lineNumbers: compiled });
    Notes.editor.view.dom.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && compiled) { e.preventDefault(); compileNote(); } });
    Notes.editor.view.dom.addEventListener('paste', e => {
        const item = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/'));
        if (!item) return;
        e.preventDefault();
        const f = item.getAsFile();
        f.arrayBuffer().then(buf => guard(async () => {
            const rel = await api.notes.asset(Notes.scope, Notes.file, f.name || 'immagine.png', buf);
            Notes.editor.insertAtCursor(kind === 'markdown' ? `![](${rel})` : kind === 'typst' ? `#image("${rel}", width: 80%)` : `\\includegraphics[width=0.8\\linewidth]{${rel}}`);
        }));
    });
    // inline rename
    const t = $('#ed-title');
    const doRename = () => guard(async () => {
        const n = t.value.trim(), old = file.replace(/\.(md|tex|typ)$/, '').split('/').pop();
        if (!n || n === old) { t.value = old; return; }
        await flush(); const nf = await api.notes.rename(Notes.scope, file, n); await Notes.reload(); openNote(nf, kind, Notes.scope);
    });
    t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } if (e.key === 'Escape') { t.value = file.replace(/\.(md|tex|typ)$/, '').split('/').pop(); t.blur(); } };
    t.onblur = doRename;
    $$('#ed-mode button').forEach(b => b.onclick = () => {
        setViewMode(kind, b.dataset.m);
        $$('#ed-mode button').forEach(x => x.classList.toggle('on', x === b));
        const body = $('.ed-body'); body.classList.remove('mode-write', 'mode-split', 'mode-read'); body.classList.add('mode-' + b.dataset.m);
        if (kind === 'markdown' && b.dataset.m !== 'write') renderPreview();
        if (b.dataset.m === 'write') Notes.editor.focus();
    });
    $('#ed-ai').onclick = () => { Notes.aiOpen = !Notes.aiOpen; $('.ed-body').classList.toggle('with-ai', Notes.aiOpen); $('#ed-ai').classList.toggle('on', Notes.aiOpen); if (Notes.aiOpen) $('#ai-q') && $('#ai-q').focus(); };
    $('#ed-export').onclick = e => exportMenu(e);
    $('#ed-files').onclick = () => Notes.toggleFiles && Notes.toggleFiles();
    drawNoteLinks(scope, file);
    $('#ed-more').onclick = e => showMenu(e.clientX - 200, e.clientY + 10, [
        ['📁 Mostra nella cartella', () => api.reveal(Notes.dir + '/' + file)],
        ['↗ Apri con app di sistema', () => api.openPath(Notes.dir + '/' + file)],
        '-',
        ['🗑 Sposta nel cestino', async () => { if (!confirm('Spostare l\'appunto nel cestino (.cestino nella cartella)?')) return; await api.notes.remove(Notes.scope, file); Notes.file = null; Notes.editor.destroy(); Notes.editor = null; await Notes.reload(); welcome(); }],
    ]);
    if ($('#ed-install')) $('#ed-install').onclick = () => guard(async () => { $('#ed-install').disabled = true; $('#ed-install').textContent = 'Installo…'; await api.notes.installEngine(kind === 'typst' ? 'typst' : 'tectonic'); toast('Motore installato'); openNote(file, kind, Notes.scope); });
    if ($('#ed-compile')) $('#ed-compile').onclick = compileNote;
    $('#ed-dict').onclick = toggleDictation;
    if (kind === 'markdown') renderPreview();
    else if (engineOk) {
        const pdf = (await api.notes.list(Notes.scope)).find(f => f.file === file);
        if (pdf && pdf.pdf) showPdf('file://' + encodeURI(Notes.dir + '/' + pdf.pdf) + '?t=' + Date.now());
    }
    drawAiPanel();
    Notes.editor.focus();
}

async function exportMenu(e) {
    const apps = await api.integrations.apps().catch(() => ({}));
    const it = S.settings.integrations || {};
    const run = (target, label) => guard(async () => {
        await flush();
        toast(`Esporto in ${label}…`, 2500);
        const html = Notes.kind === 'markdown' ? PoliEditor.renderMarkdown(Notes.editor.getValue(), { baseUrl: 'file://' + encodeURI(Notes.dir + '/' + (Notes.file.includes('/') ? Notes.file.split('/').slice(0, -1).join('/') + '/' : '')) }) : null;
        const r = await api.exportNote(Notes.scope, Notes.file, target, html);
        if (r.needVault) { if (confirm('Questa cartella non è un vault di Obsidian. In Obsidian scegli «Apri cartella come vault» e seleziona la cartella degli appunti. Mostrarla ora?')) api.openPath(r.dir); return; }
        if (r.url) { toast('Pagina creata su Notion ✓'); api.openExternal(r.url); }
        else if (r.app) toast(`Aperto in ${r.app} ✓`);
        else toast('Fatto ✓');
    });
    const items = [['📄 PDF', () => run('pdf', 'PDF')]];
    const en = [['notion', 'Notion'], ['applenotes', 'Note di Apple'], ['goodnotes', 'Goodnotes (PDF)'], ['notability', 'Notability (PDF)'], ['obsidian', 'Apri in Obsidian']].filter(([k]) => it[k]);
    if (en.length) items.push('-', ...en.map(([k, l]) => [l, () => (k === 'notion' && !it.notionToken) ? go({ name: 'settings' }) : run(k, l.replace(/ \(PDF\)|Apri in /g, ''))]));
    items.push('-', ['⚙ Altre app… (Impostazioni → Integrazioni)', () => go({ name: 'settings' })]);
    showMenu(e.clientX - 160, e.clientY + 10, items);
}

function renderPreview() {
    const p = $('#ed-prevpane'); if (!p || !Notes.editor) return;
    const base = 'file://' + encodeURI(Notes.dir + '/' + (Notes.file.includes('/') ? Notes.file.split('/').slice(0, -1).join('/') + '/' : ''));
    p.innerHTML = `<article class="md md-doc">${PoliEditor.renderMarkdown(Notes.editor.getValue(), { baseUrl: base })}</article>`;
}
function showPdf(url) { const p = $('#ed-prevpane'); if (p) p.innerHTML = `<iframe src="${url}#toolbar=1&view=FitH" class="pdf-frame"></iframe>`; }

async function compileNote() {
    await flush();
    const b = $('#ed-compile'); if (!b) return;
    b.disabled = true; b.textContent = '⏳ Compilo…';
    const logEl = $('#ed-log');
    try {
        const r = await api.notes.compile(Notes.scope, Notes.file);
        if (r.pdfUrl) { showPdf(r.pdfUrl); if (viewMode(Notes.kind) === 'write') $('#ed-mode [data-m="split"]').click(); }
        logEl.classList.toggle('hidden', r.ok);
        logEl.textContent = r.ok ? '' : (r.errors.length ? r.errors.map(e => `riga ${e.line}${e.col ? ':' + e.col : ''} — ${e.msg}`).join('\n') : r.log.slice(-2000));
        if (!r.ok && r.errors[0]) Notes.editor.gotoLine(r.errors[0].line);
        if (r.ok) toast('Compilato ✓', 1500);
    } catch (e) {
        if (/non installato/.test(e.message)) openNote(Notes.file, Notes.kind, Notes.scope); else toast('Errore: ' + e.message, 6000);
    } finally { b.disabled = false; b.textContent = '▶ Compila'; }
}

document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && route.name === 'notes' && Notes.create) { e.preventDefault(); Notes.create(Notes.scope); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e' && route.name === 'notes' && Notes.toggleFiles) { e.preventDefault(); Notes.toggleFiles(); }
});

// ── AI chat panel: answers in the chat, edits applied inline as reviewable changes ──
const AI_ACTIONS = [
    ['✍️ Migliora', 'Migliora chiarezza, struttura e correttezza, senza cambiare il contenuto'],
    ['➕ Continua', 'Continua a scrivere il documento in modo coerente'],
    ['🧮 Formule', 'Correggi e uniforma tutte le formule matematiche'],
    ['🗂 Struttura', 'Riorganizza in sezioni con titoli chiari e punti elenco'],
    ['📝 Esempio', 'Aggiungi un esempio svolto dove è più utile'],
    ['❓ Spiega', 'Spiegami in modo semplice il contenuto (domanda, non modificare)'],
];
const chatHistory = {};   // per file: [{q, a, kind}]
function drawAiPanel() {
    const p = $('#ed-aipane'); if (!p) return;
    const prov = (S.tools.ai[S.settings.ai.provider] || {}).label || 'AI';
    const hist = chatHistory[Notes.scope + ':' + Notes.file] || [];
    p.innerHTML = `<div class="ai-head"><b>✨ Assistente</b><span class="faint">${esc(prov)}</span><span class="grow"></span><button class="ghost small icon" id="ai-clear" title="Nuova conversazione">⟲</button></div>
        <div class="ai-log" id="ai-log">${hist.length ? '' : `<div class="ai-hint"><b>Come funziona</b><br>Chiedi una modifica («aggiungi un esempio», «traduci in inglese», «trasforma in tabella») e la vedrai <b>direttamente nel documento</b>: accetta o rifiuta ogni cambiamento. Seleziona del testo per lavorare solo su quella parte. Le domande ricevono risposta qui.</div>`}</div>
        <div class="ai-chips">${AI_ACTIONS.map((a, i) => `<button class="small" data-a="${i}" title="${esc(a[1])}">${a[0]}</button>`).join('')}</div>
        <div class="ai-input"><textarea id="ai-q" rows="2" placeholder="Chiedi o descrivi una modifica… (↵ invia, ⇧↵ a capo)"></textarea><button class="primary small" id="ai-send">↑</button></div>`;
    for (const h of hist) addChat(h.q, h.a, h.kind);
    $$('[data-a]', p).forEach(b => b.onclick = () => askAi(AI_ACTIONS[+b.dataset.a][1]));
    $('#ai-send').onclick = () => { const q = $('#ai-q').value.trim(); if (q) { askAi(q); $('#ai-q').value = ''; } };
    $('#ai-q').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ai-send').click(); } };
    $('#ai-clear').onclick = () => { delete chatHistory[Notes.scope + ':' + Notes.file]; drawAiPanel(); };
}
function addChat(q, a, kind) {
    const log = $('#ai-log'); if (!log) return null;
    const hint = $('.ai-hint', log); if (hint) hint.remove();
    const item = document.createElement('div'); item.className = 'ai-item';
    item.innerHTML = `<div class="ai-q">${esc(q)}</div><div class="ai-a ${kind || ''}">${a === null ? '<span class="spin"></span> <span class="faint">sto pensando…</span>' : kind === 'edit' ? `<span class="edit-badge">✎ ${esc(a)}</span>` : `<div class="md">${PoliEditor.renderMarkdown(a)}</div>`}</div>`;
    log.appendChild(item); log.scrollTop = 1e9;
    return item;
}
function reviewBar(n) {
    let bar = $('#ed-review');
    if (!n) { if (bar) bar.remove(); Notes.reviewing = false; return; }
    Notes.reviewing = true;
    if (!bar) {
        bar = document.createElement('div'); bar.id = 'ed-review'; bar.className = 'review-bar';
        $('.ed-body').before(bar);
    }
    bar.innerHTML = `<span>✨ <b>${n}</b> ${n === 1 ? 'modifica proposta' : 'modifiche proposte'} dall'AI — usa ✓ / ✗ accanto a ognuna, oppure</span><span class="grow"></span><button class="small" id="rv-no">Rifiuta tutte</button><button class="small primary" id="rv-yes">Accetta tutte</button>`;
    $('#rv-yes').onclick = () => Notes.editor.acceptAll();
    $('#rv-no').onclick = () => Notes.editor.rejectAll();
}
async function askAi(instruction) {
    if (Notes.editor.isReviewing()) return toast('Prima accetta o rifiuta le modifiche proposte', 4000);
    const key = Notes.scope + ':' + Notes.file;
    const hist = chatHistory[key] = chatHistory[key] || [];
    const sel = Notes.editor.getSelection();
    const item = addChat(instruction + (sel ? ' (sulla selezione)' : ''), null);
    const a = $('.ai-a', item);
    try {
        const r = await api.assist({ instruction, document: Notes.editor.getValue(), selection: sel, kind: Notes.kind, courseId: Notes.scope, history: hist.map(h => ({ q: h.q, a: h.kind === 'edit' ? '(ha modificato il documento: ' + h.a + ')' : h.a })) });
        if (r.mode === 'edit') {
            const n = Notes.editor.propose(r.document);
            a.className = 'ai-a edit';
            a.innerHTML = n ? `<span class="edit-badge">✎ ${esc(r.note)}</span><div class="faint">${n} ${n === 1 ? 'modifica' : 'modifiche'} da rivedere nel documento</div>` : '<span class="faint">Nessuna modifica necessaria.</span>';
            hist.push({ q: instruction, a: r.note, kind: 'edit' });
        } else {
            a.innerHTML = `<div class="md">${PoliEditor.renderMarkdown(r.text)}</div>`;
            const acts = document.createElement('div'); acts.className = 'row ai-acts';
            acts.innerHTML = '<button class="small ghost" data-x="ins">Inserisci nel documento</button><button class="small ghost" data-x="copy">Copia</button>';
            a.appendChild(acts);
            $('[data-x="ins"]', acts).onclick = () => Notes.editor.insertAtCursor(r.text + '\n');
            $('[data-x="copy"]', acts).onclick = () => navigator.clipboard.writeText(r.text).then(() => toast('Copiato'));
            hist.push({ q: instruction, a: r.text });
        }
    } catch (e) { a.innerHTML = `<span style="color:var(--err)">${esc(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span>`; }
    if ($('#ai-log')) $('#ai-log').scrollTop = 1e9;
}

// ── Dictation (Handy-style): record → local Whisper → insert ──
let rec = null;
async function toggleDictation() {
    const b = $('#ed-dict');
    if (rec) { rec.stop(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { return toast('Microfono non disponibile: ' + e.message, 5000); }
    const chunks = [];
    rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); rec = null;
        b.classList.remove('rec'); b.textContent = '⏳ Trascrivo…';
        try {
            const buf = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
            const lang = Notes.scope && course(Notes.scope) ? course(Notes.scope).language : '';
            const text = await api.dictate(buf, lang || undefined);
            if (text) Notes.editor.insertAtCursor(text + ' ');
        } catch (e) { toast(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 6000); }
        b.textContent = '🎙 Detta';
    };
    rec.start(); b.classList.add('rec'); b.textContent = '⏺ Stop dettatura';
}

// ═════════════ CALENDARIO ═════════════
let calWeek = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
window.extraViews.calendar = async v => {
    const from = new Date(calWeek), to = new Date(calWeek.getTime() + 7 * 864e5);
    const [{ events, meta }, todos] = await Promise.all([api.cal.events(from.toISOString(), to.toISOString()), api.ws.allTodos()]);
    const days = [...Array(7)].map((_, i) => new Date(from.getTime() + i * 864e5));
    const H0 = 8, H1 = 20, PX = 46;
    const colorOf = id => { const i = S.courses.findIndex(c => c.id === id); return i < 0 ? 'var(--faint)' : `hsl(${(i * 67 + 210) % 360} 65% 52%)`; };
    v.innerHTML = `<div class="page wide">
        <div class="page-head"><div><h1>Calendario</h1><div class="sub">${meta.updatedAt ? 'Orario aggiornato ' + new Date(meta.updatedAt).toLocaleDateString('it-IT') : 'Importa l\'orario dai Servizi Online'} · orario convertito con <a data-ext="https://github.com/bebora/polimi-schedule-js">polimi-schedule-js</a></div></div>
            <button id="cal-prev" class="ghost">‹</button><button id="cal-today" class="ghost">Oggi</button><button id="cal-next" class="ghost">›</button>
            <button id="cal-more">Importa…</button><button id="cal-sync" class="primary">⟳ Aggiorna orario</button></div>
        <div class="cal">
            <div class="cal-head"><div></div>${days.map(d => `<div class="${d.toDateString() === new Date().toDateString() ? 'today' : ''}">${d.toLocaleDateString('it-IT', { weekday: 'short' })} <b>${d.getDate()}</b></div>`).join('')}</div>
            <div class="cal-body" style="height:${(H1 - H0) * PX}px">
                <div class="cal-hours">${[...Array(H1 - H0)].map((_, i) => `<div style="height:${PX}px">${H0 + i}:00</div>`).join('')}</div>
                ${days.map(d => {
                    const evs = events.filter(e => new Date(e.start).toDateString() === d.toDateString());
                    const due = todos.filter(t => !t.done && t.due && new Date(t.due).toDateString() === d.toDateString());
                    return `<div class="cal-day">${[...Array(H1 - H0)].map(() => `<div class="cal-slot" style="height:${PX}px"></div>`).join('')}
                        ${evs.map(e => { const s = new Date(e.start), en = new Date(e.end); const top = (s.getHours() + s.getMinutes() / 60 - H0) * PX, h = Math.max(22, (en - s) / 36e5 * PX); return `<div class="cal-ev" style="top:${top}px;height:${h}px;--c:${colorOf(e.courseId)}" ${e.courseId ? `data-c="${e.courseId}"` : ''} title="${esc(e.summary + '\n' + e.location)}"><b>${esc(e.course || e.summary)}</b><span>${s.toTimeString().slice(0, 5)}–${en.toTimeString().slice(0, 5)}</span><span>${esc((e.location || '').split('(')[0])}</span></div>`; }).join('')}
                        ${due.map((t, i) => `<div class="cal-due" style="top:${i * 22}px" title="${esc(t.course)}">☑ ${esc(t.text)}</div>`).join('')}</div>`;
                }).join('')}
            </div></div>
        ${!events.length ? '<div class="empty-state"><p>Nessuna lezione in questa settimana. Premi <b>Aggiorna orario</b> per importarlo dai Servizi Online (serve il login), oppure importa un file .ics.</p></div>' : ''}
    </div>`;
    $$('[data-ext]', v).forEach(a => a.onclick = () => api.openExternal(a.dataset.ext));
    $('#cal-prev').onclick = () => { calWeek = new Date(calWeek.getTime() - 7 * 864e5); window.extraViews.calendar(v); };
    $('#cal-next').onclick = () => { calWeek = new Date(calWeek.getTime() + 7 * 864e5); window.extraViews.calendar(v); };
    $('#cal-today').onclick = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); calWeek = d; window.extraViews.calendar(v); };
    $('#cal-sync').onclick = () => guard(async () => { $('#cal-sync').disabled = true; $('#cal-sync').innerHTML = '<span class="spin"></span> Apro i Servizi Online…'; const r = await api.cal.sync(); toast(`${r.count} serie di lezioni importate`); window.extraViews.calendar(v); });
    $('#cal-more').onclick = e => showMenu(e.clientX - 200, e.clientY + 10, [
        ['📄 Importa file .ics…', async () => { const n = await api.cal.importIcs(); if (n) { toast(`${n} eventi importati`); window.extraViews.calendar(v); } }],
        ['🌐 Aggiungi calendario web (URL .ics)…', async () => { const u = await askText('Aggiungi calendario web', { placeholder: 'https://… .ics oppure webcal://…', help: 'Per Google Calendar usa l\'«indirizzo segreto in formato iCal» dalle impostazioni del calendario.', ok: 'Importa' }); if (u) { const n = await api.cal.importIcs(u.trim()); toast(`${n} eventi importati`); window.extraViews.calendar(v); } }],
        ['📋 Incolla orario testuale…', async () => { const t = await askText('Incolla orario testuale', { multiline: true, placeholder: '054307 - NOME CORSO (Docente: …)\nInizio lezioni: …\nLunedì dalle 10:15 alle 12:15 in aula …', help: 'Copia l\'«Orario testuale» dai Servizi Online o dal Manifesto degli studi. ⌘↵ per importare.', ok: 'Importa' }); if (t) { const r = await api.cal.importText(t); toast(`${r.count} serie importate`); window.extraViews.calendar(v); } }],
        '-',
        ['📤 Esporta per Google Calendar / Apple Calendar (.ics)', () => api.cal.revealIcs()],
    ]);
    $$('.cal-ev[data-c]', v).forEach(el => el.onclick = () => go({ name: 'course', courseId: el.dataset.c, tab: 'panoramica' }));
};

// ═════════════ AULE LIBERE ═════════════
window.extraViews.rooms = async v => {
    const sp = await api.rooms.spaces();
    const st = S.settings.rooms || { sede: 'MIA', minutes: 60 };
    const now = new Date(); const pad = n => String(n).padStart(2, '0');
    v.innerHTML = `<div class="page">
        <div class="page-head"><div><h1>Aule libere</h1><div class="sub">Dati pubblici del Politecnico in tempo reale · idea di <a data-ext="https://poliaule.com">PoliAule</a> e <a data-ext="https://github.com/riccardosalemme/alpolimibot">@alpolimibot</a></div></div></div>
        <div class="toolbar">
            <select id="r-sede" style="width:auto">${sp.sedi.map(s => `<option value="${s.id}" ${s.id === st.sede ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
            <select id="r-campus" style="width:auto"><option value="">Tutti i campus</option></select>
            <input type="date" id="r-date" style="width:auto" value="${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}">
            <input type="time" id="r-time" style="width:auto" value="${pad(now.getHours())}:${pad(now.getMinutes())}">
            <select id="r-min" style="width:auto">${[30, 60, 90, 120, 180].map(m => `<option value="${m}" ${m === st.minutes ? 'selected' : ''}>libera per ≥ ${m} min</option>`).join('')}</select>
            <input id="r-cap" type="number" min="0" placeholder="posti min" style="width:110px">
            <button class="primary" id="r-go">Cerca</button>
        </div>
        <div id="r-res"></div></div>`;
    $$('[data-ext]', v).forEach(a => a.onclick = () => api.openExternal(a.dataset.ext));
    const fillCampus = () => { $('#r-campus').innerHTML = '<option value="">Tutti i campus</option>' + sp.campus.filter(c => c.sede === $('#r-sede').value).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(''); };
    fillCampus();
    $('#r-sede').onchange = () => { fillCampus(); api.saveSettings({ rooms: { ...st, sede: $('#r-sede').value } }); };
    const search = () => guard(async () => {
        const when = new Date(`${$('#r-date').value}T${$('#r-time').value}`);
        $('#r-res').innerHTML = '<div class="empty-state"><span class="spin"></span> Controllo l\'occupazione delle aule… <span id="r-p"></span></div>';
        const r = await api.rooms.free({ sede: $('#r-sede').value, campus: $('#r-campus').value || null, when: when.toISOString(), minutes: +$('#r-min').value, minCapacity: +$('#r-cap').value || 0 });
        const tl = occ => { const a = 8 * 60, z = 20 * 60, w = z - a; return `<div class="tl">${occ.map(o => { const s = o.start.split(':'), e = o.end.split(':'); const L = Math.max(0, (+s[0] * 60 + +s[1] - a) / w * 100), R = Math.min(100, (+e[0] * 60 + +e[1] - a) / w * 100); return R > L ? `<i style="left:${L}%;width:${R - L}%" title="${o.start}–${o.end}"></i>` : ''; }).join('')}<b style="left:${Math.max(0, Math.min(100, (when.getHours() * 60 + when.getMinutes() - a) / w * 100))}%"></b></div>`; };
        $('#r-res').innerHTML = `<p class="muted">${r.rooms.length} aule libere · ${r.busy} occupate · ${r.hidden} con occupazione non pubblica</p>
            <div class="list">${r.rooms.map(x => `<div class="room"><div><b>${esc(x.name)}</b> <span class="muted">${esc(x.edificioName)}${x.capienza ? ' · ' + x.capienza + ' posti' : ''}</span><div class="faint">${esc(x.address || '')}</div></div>
                ${tl(x.occ)}<span class="pill ok">libera fino ${x.freeUntil === '23:59' ? 'a fine giornata' : 'alle ' + x.freeUntil}</span></div>`).join('') || '<div class="empty-state">Nessuna aula libera con questi filtri.</div>'}</div>`;
    });
    $('#r-go').onclick = search;
    search();
};

// ═════════════ DA FARE (all todos) ═════════════
window.extraViews.todos = async v => {
    const todos = await api.ws.allTodos();
    const open = todos.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = todos.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 20);
    v.innerHTML = `<div class="page"><div class="page-head"><div><h1>Da fare</h1><div class="sub">${open.length} da fare in tutti i corsi</div></div></div>
        ${todoComposer(null, true)}
        <div class="list todo-list">${open.map(t => todoRow(t, true)).join('') || '<div class="empty-state">Niente da fare 🎉</div>'}</div>
        ${done.length ? `<details style="margin-top:16px"><summary class="muted">Completati (${done.length})</summary><div class="list todo-list" style="margin-top:8px">${done.map(t => todoRow(t, true)).join('')}</div></details>` : ''}</div>`;
    wireTodos(v, () => window.extraViews.todos(v));
};

function todoComposer(courseId, withCourse) {
    return `<div class="todo-add row"><input id="td-text" placeholder="Aggiungi un'attività… (Invio)">${withCourse ? `<select id="td-course" style="width:auto"><option value="">Generale</option>${S.courses.map(c => `<option value="${c.id}" ${courseId === c.id ? 'selected' : ''}>${esc(cname(c))}</option>`).join('')}</select>` : ''}<input type="date" id="td-due" style="width:auto"><button class="primary" id="td-add">Aggiungi</button></div>`;
}
function todoRow(t, showCourse) {
    const late = t.due && !t.done && new Date(t.due) < new Date(new Date().toDateString());
    return `<div class="todo ${t.done ? 'done' : ''}" data-id="${t.id}" data-c="${t.courseId || ''}">
        <input type="checkbox" ${t.done ? 'checked' : ''}><span class="tt">${esc(t.text)}</span>
        ${showCourse ? `<span class="pill">${esc(t.course)}</span>` : ''}${t.due ? `<span class="pill ${late ? 'err' : ''}">${new Date(t.due).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>` : ''}
        <button class="small ghost del" title="Elimina">✕</button></div>`;
}
function wireTodos(root, redraw, fixedCourse) {
    const add = () => guard(async () => {
        const text = $('#td-text', root).value.trim(); if (!text) return;
        const cid = fixedCourse !== undefined ? fixedCourse : ($('#td-course', root) ? $('#td-course', root).value || null : null);
        await api.ws.addTodo(cid, { text, due: $('#td-due', root).value || null });
        redraw();
    });
    if ($('#td-add', root)) { $('#td-add', root).onclick = add; $('#td-text', root).onkeydown = e => { if (e.key === 'Enter') add(); }; }
    $$('.todo', root).forEach(el => {
        const cid = fixedCourse !== undefined ? fixedCourse : (el.dataset.c || null);
        $('input', el).onchange = e => guard(async () => { await api.ws.setTodo(cid, el.dataset.id, { done: e.target.checked }); redraw(); });
        $('.del', el).onclick = () => guard(async () => { await api.ws.removeTodo(cid, el.dataset.id); redraw(); });
        $('.tt', el).ondblclick = async () => { const n = await askText('Modifica attività', { value: $('.tt', el).textContent, ok: 'Salva' }); if (n && n.trim()) guard(async () => { await api.ws.setTodo(cid, el.dataset.id, { text: n }); redraw(); }); };
    });
}

// ═════════════ COURSE OVERVIEW (Notion-like) ═════════════
window.tabOverview = async (c, el) => {
    const [w, files, cal] = await Promise.all([
        api.ws.get(c.id), api.notes.list(c.id),
        api.cal.events(new Date().toISOString(), new Date(Date.now() + 14 * 864e5).toISOString()),
    ]);
    const next = cal.events.filter(e => e.courseId === c.id).slice(0, 4);
    const recent = c.recordings.slice().sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || '')).slice(0, 4);
    const mats = (c.materialFiles || []).filter(f => f !== 'LINK.md').slice(-6).reverse();
    const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
    el.innerHTML = `<div class="ov">
        <div class="ov-main">
            <div class="block"><div class="block-h"><b>📄 Pagina del corso</b><span class="faint" id="pg-st"></span><span class="grow"></span><button class="small ghost" id="pg-edit">Modifica</button></div>
                <div id="pg-view" class="md md-doc">${w.page ? PoliEditor.renderMarkdown(w.page) : '<p class="faint">Scrivi qui obiettivi, info d\'esame, link utili… (Markdown con formule $…$)</p>'}</div>
                <div id="pg-ed" class="pg-ed hidden"></div></div>
            <div class="block"><div class="block-h"><b>☑ Da fare</b><span class="faint">${w.todos.filter(t => !t.done).length} aperte</span></div>
                ${todoComposer(c.id, false)}<div class="todo-list">${w.todos.filter(t => !t.done).map(t => todoRow(t)).join('')}${w.todos.filter(t => t.done).slice(-3).map(t => todoRow(t)).join('')}</div></div>
            <div class="block"><div class="block-h"><b>🎬 Ultime lezioni</b><span class="grow"></span><a data-tab="lezioni">Tutte →</a></div>
                <div class="cards">${recent.map(r => `<div class="mini" data-key="${esc(r.key)}"><div class="faint">${esc(fmtDate(r.isoDate))} · ${esc(r.teacher || r.type || '')}</div><b>${esc(r.displayTitle)}</b>${r.summary ? `<div class="sum">${esc(r.summary)}</div>` : ''}<div class="row" style="margin-top:6px">${r.videoExists ? '<span class="pill ok">video</span>' : ''}${r.transcript ? '<span class="pill ok">testo</span>' : ''}</div></div>`).join('') || '<p class="faint">Nessuna lezione ancora.</p>'}</div></div>
        </div>
        <div class="ov-side">
            <div class="block"><div class="block-h"><b>📅 Prossime lezioni</b></div>${next.map(e => `<div class="ev"><b>${new Date(e.start).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</b> ${new Date(e.start).toTimeString().slice(0, 5)}<div class="faint">${esc((e.location || '').split('(')[0])}</div></div>`).join('') || '<p class="faint">Importa l\'orario dal Calendario.</p>'}</div>
            <div class="block"><div class="block-h"><b>🍅 Studio</b></div><div class="stats2"><div><b>${fmtMin(w.stats.today)}</b><span>oggi</span></div><div><b>${fmtMin(w.stats.week)}</b><span>7 giorni</span></div><div><b>${w.stats.sessions}</b><span>sessioni</span></div></div>
                <button class="small" id="ov-pomo">▶ Pomodoro su questo corso</button></div>
            <div class="block"><div class="block-h"><b>✎ Appunti</b><span class="grow"></span><button class="small ghost" id="ov-newnote">＋</button></div>${files.slice(0, 6).map(f => `<div class="lnk" data-note="${esc(f.file)}" data-k="${f.kind}"><span class="badge-k ${f.kind}">${{ markdown: 'MD', latex: 'TeX', typst: 'Typ' }[f.kind]}</span> ${esc(f.file.replace(/\.(md|tex|typ)$/, ''))}</div>`).join('') || '<p class="faint">Nessun appunto.</p>'}</div>
            <div class="block"><div class="block-h"><b>📎 Materiale</b><span class="grow"></span><a data-tab="materiale">Tutto →</a></div>${mats.map(f => `<div class="lnk" data-mat="${esc(f)}">📄 ${esc(f.split('/').pop())}</div>`).join('') || '<p class="faint">Nessun file.</p>'}</div>
        </div></div>`;
    wireTodos(el, () => window.tabOverview(c, el), c.id);
    $$('[data-tab]', el).forEach(a => a.onclick = () => go({ ...route, tab: a.dataset.tab }));
    $$('.mini', el).forEach(m => m.onclick = () => go({ name: 'recording', courseId: c.id, key: m.dataset.key, back: 'panoramica' }));
    $$('[data-mat]', el).forEach(a => a.onclick = () => guard(() => api.open(c.id, 'materials', a.dataset.mat)));
    $$('[data-note]', el).forEach(a => a.onclick = () => go({ name: 'notes', scope: c.id, file: a.dataset.note, kind: a.dataset.k }));
    $('#ov-newnote', el).onclick = () => go({ name: 'notes', scope: c.id });
    $('#ov-pomo', el).onclick = () => { Pomo.st.courseId = c.id; Pomo.reset('focus'); Pomo.start(); };
    let pageEd = null;
    $('#pg-edit', el).onclick = () => {
        if (pageEd) { // close
            const text = pageEd.getValue(); pageEd.destroy(); pageEd = null;
            $('#pg-ed', el).classList.add('hidden'); $('#pg-view', el).classList.remove('hidden'); $('#pg-edit', el).textContent = 'Modifica';
            $('#pg-view', el).innerHTML = text ? PoliEditor.renderMarkdown(text) : '<p class="faint">Pagina vuota</p>';
            return;
        }
        $('#pg-ed', el).classList.remove('hidden'); $('#pg-view', el).classList.add('hidden'); $('#pg-edit', el).textContent = 'Fine';
        let t = null;
        pageEd = PoliEditor.create($('#pg-ed', el), { kind: 'markdown', value: w.page.replace(/^<!--[\s\S]*?-->\s*/, ''), lineNumbers: false, onChange: v => { $('#pg-st', el).textContent = '…'; clearTimeout(t); t = setTimeout(() => api.ws.page(c.id, v).then(() => $('#pg-st', el).textContent = 'Salvato'), 600); } });
        pageEd.focus();
    };
};

// ═════════════ SETTINGS: recommendations, notes, pomodoro, about ═════════════
window.settingsExtra = async v => {
    const s = S.settings;
    const [hw, about] = await Promise.all([api.hw(), api.about()]);
    // hardware recommendations next to existing fields
    const recBadge = (sel, val, apply) => {
        const f = $(sel, v); if (!f) return;
        const ctl = f.closest('.ctl');
        const b = document.createElement('span');
        b.className = 'pill acc rec'; b.title = `Consigliato per ${hw.hw.cpu} · ${hw.hw.ramGB} GB${hw.hw.appleSilicon ? ' · Apple Silicon' : hw.hw.nvidia ? ' · ' + hw.hw.nvidia.name : ''}`;
        b.textContent = `consigliato: ${val}`; b.style.cursor = 'pointer';
        b.onclick = () => { apply(); toast('Valore consigliato applicato: premi Salva'); };
        ctl.appendChild(b);
    };
    recBadge('#s-par', hw.parallel, () => $('#s-par', v).value = hw.parallel);
    recBadge('#s-model', hw.rec.model, () => $('#s-model', v).value = hw.rec.model);

    const engines = await api.notes.engines();
    const [clouds, apps, searchSt] = await Promise.all([api.cloud.detect(), api.integrations.apps(), api.search.status()]);
    const integ = (key, name, desc, detected) => field(name, desc + (detected === undefined || detected ? '' : ` <span class="pill warn">non rilevata su questo computer</span>`), sw('x-int-' + key, !!(s.integrations || {})[key]));
    const av = S.tools.ai, cur = s.ai.provider;
    const providerWarn = av[cur] && av[cur].path ? '' : field('Strumento AI', '', `<span class="pill err">${esc((av[cur] || {}).label || cur)} non è installato su questo computer</span><span class="faint">${Object.values(av).some(x => x.path) ? 'verrà usato ' + esc(Object.values(av).find(x => x.path).label) : 'installa Antigravity CLI, Claude Code o Gemini CLI'}</span>`);
    const cl = s.cloud || {}, it = s.integrations || {};
    const box = $('#s-extra', v);
    box.innerHTML = `
    <div class="group"><h3>Trascrizioni</h3>
        ${hw.hw.appleSilicon ? field('Motore', 'Whisper large-v3-turbo: più accurato, punteggiatura migliore. Parakeet (NVIDIA, lo stesso usato da Handy): ~2× più veloce, trascrive in modo letterale (le esitazioni vengono poi rimosse dalla pulizia).', `<div class="seg" id="x-eng"><button data-v="mlx" class="${s.transcription.engine !== 'parakeet' ? 'on' : ''}">Whisper</button><button data-v="parakeet" class="${s.transcription.engine === 'parakeet' ? 'on' : ''}">Parakeet</button></div>`) : ''}
        ${field('Pulizia automatica', 'Rimuove ehm, mmm, uh, balbettii e frasi inventate da Whisper nei silenzi. Gli originali restano in trascrizioni/.orig', sw('x-clean', s.transcription.clean !== false))}
    </div>
    <div class="group"><h3>Appunti</h3>
        ${field('Formato predefinito', 'Per i nuovi appunti (puoi sempre crearne di altri tipi)', `<div class="seg" id="x-mode">${[['markdown', 'Markdown'], ['latex', 'LaTeX'], ['typst', 'Typst']].map(([k, l]) => `<button data-v="${k}" class="${(s.editor.mode || 'markdown') === k ? 'on' : ''}">${l}</button>`).join('')}</div>`)}
        ${field('Motore LaTeX', 'Tectonic (MIT): scarica i pacchetti TeX al primo uso', engines.tectonic ? `<span class="pill ok">${esc(engines.tectonic)}</span>` : '<button id="x-tex">Installa</button>')}
        ${field('Motore Typst', 'Typst (Apache-2.0)', engines.typst ? `<span class="pill ok">${esc(engines.typst)}</span>` : '<button id="x-typ">Installa</button>')}
        ${field('Cartella appunti generali', 'Gli appunti dei corsi stanno in <cartella corso>/appunti', `<input id="x-nroot" value="${esc(s.notesRoot || '')}" placeholder="~/Documents/PoliRec Appunti"><button id="x-nroot-pick">Sfoglia…</button>`)}
    </div>
    <div class="group"><h3>Pomodoro</h3>
        ${field('Durate (minuti)', 'Focus · pausa breve · pausa lunga', `<input id="x-pf" type="number" min="5" max="90" style="width:70px" value="${s.pomodoro.focus}"><input id="x-ps" type="number" min="1" max="30" style="width:70px" value="${s.pomodoro.short}"><input id="x-pl" type="number" min="5" max="60" style="width:70px" value="${s.pomodoro.long}">`)}
        ${field('Pausa lunga ogni', 'sessioni', `<input id="x-pe" type="number" min="2" max="8" style="width:70px" value="${s.pomodoro.every}">`)}
        ${field('Suono', '', sw('x-psnd', s.pomodoro.sound))}
    </div>
    <div class="group"><h3>Sincronizzazione cloud</h3>
        ${field('Sincronizza appunti e impostazioni', 'Appunti, pagine dei corsi, attività, impostazioni ed elenco corsi vengono salvati in una cartella cloud e ritrovati sugli altri computer. Video, trascrizioni e materiale restano in locale.', sw('x-cl-on', cl.enabled))}
        ${field('Cartella cloud', clouds.length ? 'Rilevate su questo computer' : 'Nessuna cartella cloud trovata: installa iCloud Drive o Google Drive per desktop, oppure scegli una cartella sincronizzata', `<select id="x-cl-where" style="width:auto">${clouds.map(c => `<option value="${esc(c.path)}" data-p="${c.id}" ${cl.path === c.path ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__custom" ${cl.path && !clouds.some(c => c.path === cl.path) ? 'selected' : ''}>Altra cartella…</option></select><span class="faint" id="x-cl-path">${esc(cl.path ? cl.path + '/PoliRec' : '')}</span>`)}
        ${cl.enabled ? field('Stato', '', `<span class="pill ok">☁ attiva</span><span class="faint">${cl.lastPushed ? 'ultimo invio ' + new Date(cl.lastPushed).toLocaleString('it-IT') : ''}</span><span class="grow"></span><button id="x-cl-pull">Aggiorna ora</button>`) : ''}
    </div>
    <div class="group"><h3>AI</h3>
        ${field('Descrizione del corso automatica', 'La «Pagina del corso» viene scritta e aggiornata dall\'AI dai sommari delle lezioni (finché non la modifichi tu)', sw('x-ai-page', s.ai.autoCoursePage !== false))}
        ${field('Ricerca semantica', 'Cerca per significato in lezioni, appunti e slide (anche tra lingue diverse). Tutto in locale.', `<span class="pill ${searchSt.ready ? 'ok' : 'warn'}">${searchSt.ready ? Object.values(searchSt.counts).reduce((a, b) => a + b, 0) + ' frammenti indicizzati' : 'non installata'}</span><span class="grow"></span>${searchSt.ready ? '<button id="x-idx">Aggiorna indice</button>' : '<button class="primary" id="x-sinst">Installa (~250 MB)</button>'}`)}
        ${providerWarn}
    </div>
    <div class="group"><h3>Integrazioni</h3>
        <p class="muted" style="margin:4px 18px 8px">Attiva le app in cui vuoi esportare gli appunti: compariranno nel menu «Esporta» di ogni appunto. L'esportazione in PDF è sempre disponibile.</p>
        ${integ('notion', 'Notion', 'Crea una pagina Notion per ogni appunto esportato (titoli, liste, checklist, formule, codice).', true)}
        <div id="x-notion-cfg" class="${it.notion ? '' : 'hidden'}">
            ${field('Token di integrazione', 'notion.so/my-integrations → Nuova integrazione → copia il «Internal Integration Secret»', `<input id="x-nt" type="password" placeholder="ntn_… / secret_…" value="${esc(it.notionToken || '')}">`)}
            ${field('Pagina di destinazione', 'Nella pagina: ••• → Connessioni → aggiungi la tua integrazione, poi incolla qui il link', `<input id="x-np" placeholder="https://www.notion.so/…" value="${esc(it.notionParent || '')}"><button id="x-ntest">Prova</button>`)}
        </div>
        ${integ('applenotes', 'Note di Apple', 'Crea una nota in Note di Apple (solo macOS).', apps.notes)}
        ${integ('goodnotes', 'Goodnotes', 'Esporta il PDF dell\'appunto e lo apre in Goodnotes per annotarlo a mano.', apps.goodnotes)}
        ${integ('notability', 'Notability', 'Esporta il PDF e lo apre in Notability.', apps.notability)}
        ${integ('obsidian', 'Obsidian', 'Apre l\'appunto in Obsidian. Usa come vault la cartella degli appunti (o la cartella cloud).', apps.obsidian)}
    </div>
    <div class="group"><h3>Informazioni</h3>
        ${field(`${esc(about.name)} ${esc(about.version)}`, `Electron ${esc(about.electron)} · ${esc(about.platform)} · dati in ${esc(about.dataDir)}`, '<button id="x-upd">Controlla aggiornamenti</button>')}
        ${field('Gratis e open source', 'PoliRec è gratuito per tutti gli studenti. Se ti è utile, puoi offrire un caffè allo sviluppatore ☕', about.donateUrl ? '<button class="primary" id="x-coffee">☕ Buy me a coffee</button>' : '<span class="faint">link donazioni non configurato</span>')}
        ${field('Licenze e crediti', 'MIT · progetti della community PoliNetwork e componenti di terze parti', '<button id="x-notice">Mostra</button>')}
        ${field('Avviso', 'App non ufficiale, non affiliata né approvata dal Politecnico di Milano. Usa le registrazioni solo per studio personale, nel rispetto del regolamento di Ateneo e del diritto d\'autore dei docenti.', '')}
    </div>`;
    const saveX = patch => api.saveSettings(patch).then(() => refresh());
    // cloud
    const applyCloud = async (enabled, p) => {
        const opt = $('#x-cl-where', box).selectedOptions[0];
        const r = await api.cloud.set({ enabled, provider: opt ? opt.dataset.p || 'custom' : 'custom', path: p });
        if (enabled) toast(`☁ Sincronizzazione attiva${r.copied ? ` · ${r.copied} file copiati` : ''}${r.pulled && r.pulled.changed ? ` · importato da ${r.pulled.from}` : ''}`, 5000); else toast('Sincronizzazione disattivata');
        await refresh(); $('#view').dataset.view = ''; render();
    };
    const pickCloudPath = async () => {
        const sel = $('#x-cl-where', box).value;
        if (sel !== '__custom') return sel;
        const d = await api.pickDir(cl.path || ''); return d;
    };
    $('#x-cl-on', box).onchange = e => guard(async () => {
        if (!e.target.checked) return applyCloud(false, cl.path);
        const p = await pickCloudPath(); if (!p) { e.target.checked = false; return; }
        if (!confirm(`Attivare la sincronizzazione in:\n${p}/PoliRec ?\n\nGli appunti esistenti vengono copiati (gli originali restano dove sono).`)) { e.target.checked = false; return; }
        await applyCloud(true, p);
    });
    $('#x-cl-where', box).onchange = () => guard(async () => { if (!cl.enabled) return; const p = await pickCloudPath(); if (p) await applyCloud(true, p); });
    if ($('#x-cl-pull', box)) $('#x-cl-pull', box).onclick = () => guard(async () => { const r = await api.cloud.pull(); toast(r.changed ? `Aggiornato da ${r.from}` : 'Già aggiornato'); refresh(); });
    // integrations (opt-in)
    const saveIt = () => saveX({ integrations: { ...(S.settings.integrations || {}), notionToken: $('#x-nt', box).value.trim(), notionParent: $('#x-np', box).value.trim(), ...Object.fromEntries(['notion', 'applenotes', 'goodnotes', 'notability', 'obsidian'].map(k => [k, $('#x-int-' + k, box).checked])) } });
    ['notion', 'applenotes', 'goodnotes', 'notability', 'obsidian'].forEach(k => $('#x-int-' + k, box).onchange = () => { if (k === 'notion') $('#x-notion-cfg', box).classList.toggle('hidden', !$('#x-int-notion', box).checked); saveIt(); });
    $('#x-nt', box).onchange = saveIt; $('#x-np', box).onchange = saveIt;
    $('#x-ntest', box).onclick = () => guard(async () => { await saveIt(); const t = await api.integrations.testNotion($('#x-nt', box).value.trim(), $('#x-np', box).value.trim()); toast(`Notion collegato ✓ (pagina «${t}»)`, 4000); });
    // AI
    $('#x-ai-page', box).onchange = e => saveX({ ai: { ...S.settings.ai, autoCoursePage: e.target.checked } });
    if ($('#x-idx', box)) $('#x-idx', box).onclick = () => guard(async () => { $('#x-idx', box).disabled = true; $('#x-idx', box).textContent = 'Indicizzo…'; await api.search.index(); toast('Indice aggiornato'); window.settingsExtra(v); });
    if ($('#x-sinst', box)) $('#x-sinst', box).onclick = () => guard(async () => { $('#x-sinst', box).disabled = true; $('#x-sinst', box).textContent = 'Installo…'; const ok = await api.search.install(); toast(ok ? 'Ricerca semantica installata: indicizzo i corsi…' : 'Installazione non riuscita (vedi Attività)'); window.settingsExtra(v); });
    $$('#x-eng button', box).forEach(b => b.onclick = () => guard(async () => {
        $$('#x-eng button', box).forEach(x => x.classList.toggle('on', x === b));
        toast(b.dataset.v === 'parakeet' ? 'Preparo Parakeet (al primo uso scarica ~1 GB)…' : 'Motore Whisper attivo', 4000);
        await api.setEngine(b.dataset.v, b.dataset.v === 'parakeet' ? 'parakeet' : (hw.rec.model || 'large-v3-turbo'));
        toast('Motore aggiornato'); refresh();
    }));
    $('#x-clean', box).onchange = e => saveX({ transcription: { ...S.settings.transcription, clean: e.target.checked } });
    $$('#x-mode button', box).forEach(b => b.onclick = () => { $$('#x-mode button', box).forEach(x => x.classList.toggle('on', x === b)); saveX({ editor: { ...S.settings.editor, mode: b.dataset.v } }); });
    const inst = (id, n) => { const b = $(id, box); if (b) b.onclick = () => guard(async () => { b.disabled = true; b.textContent = 'Installo…'; await api.notes.installEngine(n); toast('Installato'); window.settingsExtra(v); }); };
    inst('#x-tex', 'tectonic'); inst('#x-typ', 'typst');
    $('#x-nroot-pick', box).onclick = async () => { const d = await api.pickDir($('#x-nroot', box).value); if (d) { $('#x-nroot', box).value = d; saveX({ notesRoot: d }); } };
    $('#x-nroot', box).onchange = e => saveX({ notesRoot: e.target.value });
    const pomo = () => saveX({ pomodoro: { focus: +$('#x-pf', box).value || 25, short: +$('#x-ps', box).value || 5, long: +$('#x-pl', box).value || 15, every: +$('#x-pe', box).value || 4, sound: $('#x-psnd', box).checked } });
    ['#x-pf', '#x-ps', '#x-pl', '#x-pe', '#x-psnd'].forEach(id => $(id, box).onchange = pomo);
    if ($('#x-coffee', box)) $('#x-coffee', box).onclick = () => api.openExternal(about.donateUrl);
    $('#x-upd', box).onclick = () => guard(async () => { const u = await api.checkUpdate(); if (u) { if (confirm(`È disponibile la versione ${u.version}. Aprire la pagina di download?`)) api.openExternal(u.url); } else toast(about.repo ? 'Hai l\'ultima versione' : 'Repository per gli aggiornamenti non configurato'); });
    $('#x-notice', box).onclick = () => guard(async () => { const t = await api.notice(); const m = document.createElement('div'); $('#modal-root').innerHTML = `<div class="modal-bg"><div class="modal wide"><div class="md">${PoliEditor.renderMarkdown(t)}</div><div class="foot"><button class="primary" id="nt-x">Chiudi</button></div></div></div>`; $('#nt-x').onclick = () => $('#modal-root').innerHTML = ''; });
};

// donate link in the sidebar + update banner (once per start)
setTimeout(async () => {
    try {
        const a = await api.about();
        if (a.donateUrl) { const d = document.createElement('a'); d.className = 'nav-item coffee'; d.innerHTML = '<span class="ico">☕</span>Offrimi un caffè'; d.onclick = () => api.openExternal(a.donateUrl); $('#side-status').before(d); }
        const u = await api.checkUpdate();
        if (u) { const b = $('#banner'); b.innerHTML = `Nuova versione ${esc(u.version)} disponibile · <a id="upd-l">Scarica</a>`; b.classList.remove('hidden'); $('#upd-l').onclick = () => api.openExternal(u.url); }
    } catch (e) { }
}, 3000);


// ═════════════ collapsible sidebar ═════════════
(() => {
    const app = $('#app');
    if (navigator.platform.toLowerCase().includes('mac')) document.documentElement.classList.add('mac');
    let collapsed = false;
    try { collapsed = localStorage.getItem('sbCollapsed') === '1'; } catch (e) { }
    let hideT = null;
    const set = c => {
        collapsed = c;
        app.classList.toggle('sb-collapsed', c);
        app.classList.remove('sb-peek');
        try { localStorage.setItem('sbCollapsed', c ? '1' : '0'); } catch (e) { }
    };
    const peek = on => {
        if (!collapsed) return;
        clearTimeout(hideT);
        if (on) app.classList.add('sb-peek');
        else hideT = setTimeout(() => app.classList.remove('sb-peek'), 250);   // small grace period
    };
    set(collapsed);
    $('#sb-hide').onclick = () => set(!collapsed);
    $('#sb-show').onclick = () => set(false);
    $('#sb-hot').addEventListener('mouseenter', () => peek(true));
    $('#sidebar').addEventListener('mouseenter', () => peek(true));
    $('#sidebar').addEventListener('mouseleave', () => peek(false));
    // clicking a link in the peeking sidebar closes it
    $('#sidebar').addEventListener('click', e => { if (collapsed && e.target.closest('.nav-item')) app.classList.remove('sb-peek'); });
    document.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); set(!collapsed); }
    });
    window.toggleSidebar = set;
})();
