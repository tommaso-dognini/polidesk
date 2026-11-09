'use strict';
/* Extra views: Pomodoro, Appunti (editors + AI panel + dictation), Calendario, Aule libere, Da fare, Panoramica corso.
   Uses globals from app.js: api, $, $$, esc, S, route, go, guard, toast, log, md, course, cname, field, sw, fmtDate, refresh */

window.extraViews = {};
window.noRerender = new Set(['notes']);

// ═════════════ POMODORO (sidebar widget, state survives reloads) ═════════════
const Pomo = {
    st: (() => { try { return JSON.parse(localStorage.getItem('pomo')) || null; } catch (e) { return null; } })() || { mode: 'focus', running: false, endsAt: 0, left: 0, count: 0, courseId: null, startedAt: null },
    cfg() { return (S && S.settings.pomodoro) || { focus: 25, short: 5, long: 15, every: 4, sound: true }; },
    dur(mode) { const c = this.cfg(); return (mode === 'focus' ? c.focus : mode === 'short' ? c.short : c.long) * 60000; },
    save() { localStorage.setItem('pomo', JSON.stringify(this.st)); },
    remaining() { return this.st.running ? Math.max(0, this.st.endsAt - Date.now()) : (this.st.left || this.dur(this.st.mode)); },
    start() { this.st.running = true; this.st.endsAt = Date.now() + this.remaining(); this.st.startedAt = this.st.startedAt || new Date().toISOString(); this.save(); this.draw(); },
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
setInterval(() => { if (Pomo.st.running) { if (Pomo.remaining() <= 0) Pomo.finish(); else Pomo.draw(); } }, 1000);
window.Pomo = Pomo;

// ═════════════ APPUNTI (editor) ═════════════
const Notes = { scope: null, file: null, kind: null, editor: null, dirty: false, saveT: null, preview: true, aiOpen: true, rec: null, dir: '' };
const KIND_LABEL = { markdown: 'Markdown', latex: 'LaTeX', typst: 'Typst' };

window.extraViews.notes = async v => {
    const scopes = await api.notes.scopes();
    if (route.scope !== undefined) Notes.scope = route.scope;
    const mode = S.settings.editor.mode || 'markdown';
    v.innerHTML = `<div class="notes-layout">
        <aside class="notes-side">
            <div class="row" style="padding:12px 12px 6px"><select id="n-scope">${scopes.map(s => `<option value="${s.id || ''}" ${String(Notes.scope || '') === String(s.id || '') ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
            <div class="row" style="padding:0 12px 8px"><button class="primary small" id="n-new">＋ Nuovo ${KIND_LABEL[mode]}</button><span class="grow"></span><button class="ghost small" id="n-newmenu" title="Altro tipo">▾</button><button class="ghost small" id="n-folder" title="Apri cartella">⌂</button></div>
            <input id="n-filter" placeholder="Cerca…" style="margin:0 12px 8px;width:calc(100% - 24px)">
            <div id="n-files" class="n-files"></div>
        </aside>
        <section class="notes-main" id="n-main"><div class="empty-state"><h2>Appunti</h2><p>Crea un appunto in Markdown, LaTeX o Typst.<br>Il formato predefinito si sceglie in Impostazioni → Appunti.</p></div></section>
    </div>`;
    const loadFiles = async () => {
        Notes.dir = await api.notes.dir(Notes.scope);
        const files = await api.notes.list(Notes.scope);
        const q = ($('#n-filter') && $('#n-filter').value.toLowerCase()) || '';
        $('#n-files').innerHTML = files.filter(f => !q || f.file.toLowerCase().includes(q)).map(f => `<div class="n-file ${Notes.file === f.file ? 'on' : ''}" data-f="${esc(f.file)}" data-k="${f.kind}">
            <span class="badge-k ${f.kind}">${{ markdown: 'MD', latex: 'TeX', typst: 'Typ' }[f.kind]}</span><span class="n">${esc(f.file.replace(/\.(md|tex|typ)$/, ''))}</span><span class="faint">${new Date(f.mtime).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span></div>`).join('')
            || '<div class="faint" style="padding:10px 14px">Nessun appunto</div>';
        $$('.n-file').forEach(x => x.onclick = () => openNote(x.dataset.f, x.dataset.k));
    };
    Notes.reload = loadFiles;
    $('#n-scope').onchange = e => { Notes.scope = e.target.value || null; Notes.file = null; loadFiles(); $('#n-main').innerHTML = ''; };
    $('#n-filter').oninput = loadFiles;
    $('#n-folder').onclick = () => guard(() => api.openPath(Notes.dir));
    const create = kind => guard(async () => {
        const title = prompt('Titolo dell\'appunto', '');
        if (title === null) return;
        const f = await api.notes.create(Notes.scope, title || 'Senza titolo', kind);
        await loadFiles(); openNote(f, kind);
    });
    $('#n-new').onclick = () => create(mode);
    $('#n-newmenu').onclick = e => showMenu(e.clientX, e.clientY + 10, Object.entries(KIND_LABEL).map(([k, l]) => [`Nuovo ${l}`, () => create(k)]));
    await loadFiles();
    if (route.file) openNote(route.file, route.kind || 'markdown');
};

async function flush() {
    if (!Notes.editor || !Notes.dirty) return;
    clearTimeout(Notes.saveT);
    await api.notes.write(Notes.scope, Notes.file, Notes.editor.getValue());
    Notes.dirty = false; const s = $('#ed-saved'); if (s) s.textContent = 'Salvato';
}
window.flushNote = flush;

async function openNote(file, kind) {
    await flush();
    if (Notes.editor) { Notes.editor.destroy(); Notes.editor = null; }
    Notes.file = file; Notes.kind = kind;
    $$('.n-file').forEach(x => x.classList.toggle('on', x.dataset.f === file));
    const content = await api.notes.read(Notes.scope, file);
    const compiled = kind !== 'markdown';
    const engines = compiled ? await api.notes.engines() : {};
    const engineOk = kind === 'typst' ? engines.typst : kind === 'latex' ? engines.tectonic : true;
    const m = $('#n-main');
    m.innerHTML = `<div class="ed-toolbar">
            <span class="badge-k ${kind}">${KIND_LABEL[kind]}</span><b class="ed-title" id="ed-title" title="Rinomina">${esc(file.replace(/\.(md|tex|typ)$/, ''))}</b><span class="faint" id="ed-saved">Salvato</span><span class="grow"></span>
            ${kind === 'markdown' ? '<button class="small ghost" data-w="**,**" title="Grassetto">B</button><button class="small ghost" data-w="*,*" title="Corsivo"><i>I</i></button><button class="small ghost" data-w="$,$" title="Formula">∑</button><button class="small ghost" data-w="- [ ] ," title="Checklist">☑</button>' : ''}
            <button class="small ghost" id="ed-dict" title="Dettatura (Whisper locale)">🎙</button>
            ${compiled ? `<button class="small primary" id="ed-compile" title="Compila (⌘↵)">▶ Compila</button>` : '<button class="small ghost" id="ed-pdf">Esporta PDF</button>'}
            <button class="small ghost ${Notes.preview ? 'on' : ''}" id="ed-prev" title="Anteprima">◫</button>
            <button class="small ghost ${Notes.aiOpen ? 'on' : ''}" id="ed-ai" title="Pannello AI">✨</button>
            <button class="small ghost" id="ed-more">⋯</button>
        </div>
        ${compiled && !engineOk ? `<div class="banner" style="margin:10px 14px">Il motore ${kind === 'typst' ? 'Typst' : 'LaTeX (Tectonic)'} non è ancora installato. <button class="small primary" id="ed-install">Installa (${kind === 'typst' ? '~30 MB' : '~15 MB + pacchetti al primo uso'})</button></div>` : ''}
        <div class="ed-body ${Notes.preview ? 'with-prev' : ''} ${Notes.aiOpen ? 'with-ai' : ''}">
            <div class="ed-src" id="ed-src"></div>
            <div class="ed-prev" id="ed-prevpane">${compiled ? '<div class="empty-state">Premi <b>Compila</b> per vedere il PDF</div>' : ''}</div>
            <div class="ed-ai" id="ed-aipane"></div>
        </div>
        <pre class="ed-log hidden" id="ed-log"></pre>`;
    const onChange = () => {
        Notes.dirty = true; $('#ed-saved').textContent = 'Modificato…';
        clearTimeout(Notes.saveT); Notes.saveT = setTimeout(flush, 800);
        if (kind === 'markdown' && Notes.preview) renderPreview();
    };
    Notes.editor = PoliEditor.create($('#ed-src'), { kind, value: content, onChange, onSave: () => { flush(); if (compiled) compileNote(); } });
    Notes.editor.view.dom.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && compiled) { e.preventDefault(); compileNote(); } });
    // paste images → assets/
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
    $$('[data-w]', m).forEach(b => b.onclick = () => { const [a, z] = b.dataset.w.split(','); Notes.editor.wrapSelection(a, z); });
    $('#ed-prev').onclick = () => { Notes.preview = !Notes.preview; openNote(file, kind); };
    $('#ed-ai').onclick = () => { Notes.aiOpen = !Notes.aiOpen; $('.ed-body').classList.toggle('with-ai', Notes.aiOpen); $('#ed-ai').classList.toggle('on', Notes.aiOpen); };
    $('#ed-title').onclick = () => { const n = prompt('Nuovo nome', file.replace(/\.(md|tex|typ)$/, '').split('/').pop()); if (n) guard(async () => { await flush(); const nf = await api.notes.rename(Notes.scope, file, n); await Notes.reload(); openNote(nf, kind); }); };
    $('#ed-more').onclick = e => showMenu(e.clientX - 180, e.clientY + 10, [
        ['📁 Mostra nella cartella', () => api.reveal(Notes.dir + '/' + file)],
        ['↗ Apri con app di sistema', () => api.openPath(Notes.dir + '/' + file)],
        ['🗑 Sposta nel cestino', async () => { if (!confirm('Spostare l\'appunto nel cestino (.cestino nella cartella)?')) return; await api.notes.remove(Notes.scope, file); Notes.file = null; Notes.editor.destroy(); Notes.editor = null; $('#n-main').innerHTML = ''; Notes.reload(); }],
    ]);
    if ($('#ed-install')) $('#ed-install').onclick = () => guard(async () => { $('#ed-install').disabled = true; $('#ed-install').textContent = 'Installo…'; await api.notes.installEngine(kind === 'typst' ? 'typst' : 'tectonic'); toast('Motore installato'); openNote(file, kind); });
    if ($('#ed-compile')) $('#ed-compile').onclick = compileNote;
    if ($('#ed-pdf')) $('#ed-pdf').onclick = () => guard(async () => { await flush(); const out = (Notes.dir + '/' + file).replace(/\.md$/, '.pdf'); await api.notes.exportPdf(PoliEditor.renderMarkdown(Notes.editor.getValue(), { baseUrl: 'file://' + encodeURI(Notes.dir + '/' + file.split('/').slice(0, -1).join('/') + (file.includes('/') ? '/' : '')) }), out); toast('PDF esportato'); });
    $('#ed-dict').onclick = toggleDictation;
    if (kind === 'markdown' && Notes.preview) renderPreview();
    else if (compiled && Notes.preview && engineOk) {
        const pdf = (await api.notes.list(Notes.scope)).find(f => f.file === file);
        if (pdf && pdf.pdf) showPdf('file://' + encodeURI(Notes.dir + '/' + pdf.pdf) + '?t=' + Date.now());
    }
    drawAiPanel();
    Notes.editor.focus();
}

function renderPreview() {
    const base = 'file://' + encodeURI(Notes.dir + '/' + (Notes.file.includes('/') ? Notes.file.split('/').slice(0, -1).join('/') + '/' : ''));
    $('#ed-prevpane').innerHTML = `<div class="md md-doc">${PoliEditor.renderMarkdown(Notes.editor.getValue(), { baseUrl: base })}</div>`;
}
function showPdf(url) { $('#ed-prevpane').innerHTML = `<iframe src="${url}#toolbar=1&view=FitH" class="pdf-frame"></iframe>`; }

async function compileNote() {
    await flush();
    const b = $('#ed-compile'); if (!b) return;
    b.disabled = true; b.textContent = '⏳ Compilo…';
    const logEl = $('#ed-log');
    try {
        const r = await api.notes.compile(Notes.scope, Notes.file);
        if (r.pdfUrl && Notes.preview) showPdf(r.pdfUrl);
        logEl.classList.toggle('hidden', r.ok);
        logEl.textContent = r.ok ? '' : (r.errors.length ? r.errors.map(e => `riga ${e.line}${e.col ? ':' + e.col : ''} — ${e.msg}`).join('\n') : r.log.slice(-2000));
        if (!r.ok && r.errors[0]) Notes.editor.gotoLine(r.errors[0].line);
        if (r.ok) toast('Compilato ✓', 1500);
    } catch (e) {
        if (/non installato/.test(e.message)) openNote(Notes.file, Notes.kind); else toast('Errore: ' + e.message, 6000);
    } finally { b.disabled = false; b.textContent = '▶ Compila'; }
}

// ── AI side panel ──
const AI_ACTIONS = [
    ['Migliora', 'Migliora chiarezza e struttura, correggi errori, mantieni il contenuto'],
    ['Continua', 'Continua a scrivere il testo in modo coerente (solo la continuazione)'],
    ['Spiega', 'Spiegami in modo semplice il contenuto selezionato'],
    ['Riassumi', 'Riassumi in punti chiave'],
    ['Formule', 'Riscrivi le formule in notazione corretta per questo formato'],
    ['Esercizio', 'Crea un esercizio con soluzione su questo argomento'],
];
function drawAiPanel() {
    const p = $('#ed-aipane'); if (!p) return;
    const prov = (S.tools.ai[S.settings.ai.provider] || {}).label || 'AI';
    p.innerHTML = `<div class="ai-head"><b>✨ Assistente</b><span class="faint">${esc(prov)}</span></div>
        <div class="ai-chips">${AI_ACTIONS.map((a, i) => `<button class="small" data-a="${i}" title="${esc(a[1])}">${a[0]}</button>`).join('')}</div>
        <div class="ai-log" id="ai-log"><p class="faint">Seleziona del testo (opzionale) e chiedi qualcosa. Le risposte si possono inserire o sostituire nel documento.</p></div>
        <div class="ai-input"><textarea id="ai-q" rows="3" placeholder="Es. trasforma in tabella, aggiungi un esempio, traduci in inglese… (⌘↵)"></textarea><button class="primary small" id="ai-send">Invia</button></div>`;
    $$('[data-a]', p).forEach(b => b.onclick = () => askAi(AI_ACTIONS[+b.dataset.a][1]));
    $('#ai-send').onclick = () => { const q = $('#ai-q').value.trim(); if (q) { askAi(q); $('#ai-q').value = ''; } };
    $('#ai-q').onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $('#ai-send').click(); };
}
async function askAi(instruction) {
    const log = $('#ai-log');
    const sel = Notes.editor.getSelection();
    const item = document.createElement('div'); item.className = 'ai-item';
    item.innerHTML = `<div class="ai-q">${esc(instruction)}${sel ? ` <span class="faint">(su selezione)</span>` : ''}</div><div class="ai-a"><span class="spin"></span></div>`;
    if (log.querySelector('p.faint')) log.innerHTML = '';
    log.appendChild(item); log.scrollTop = 1e9;
    const a = $('.ai-a', item);
    window.aiStreamTarget = a; a.textContent = '';
    try {
        const out = await api.assist({ instruction, document: Notes.editor.getValue(), selection: sel, kind: Notes.kind, courseId: Notes.scope });
        window.aiStreamTarget = null;
        a.innerHTML = Notes.kind === 'markdown' ? `<div class="md">${PoliEditor.renderMarkdown(out)}</div>` : `<pre>${esc(out)}</pre>`;
        const acts = document.createElement('div'); acts.className = 'row'; acts.style.marginTop = '6px';
        acts.innerHTML = `${sel ? '<button class="small primary" data-x="rep">Sostituisci selezione</button>' : ''}<button class="small ${sel ? '' : 'primary'}" data-x="ins">Inserisci al cursore</button><button class="small ghost" data-x="end">In fondo</button>${sel ? '' : '<button class="small ghost" data-x="all" title="Sostituisce tutto il documento">Sostituisci tutto</button>'}<button class="small ghost" data-x="copy">Copia</button>`;
        item.appendChild(acts);
        $('[data-x="ins"]', acts).onclick = () => Notes.editor.insertAtCursor(out);
        $('[data-x="end"]', acts).onclick = () => Notes.editor.append('\n\n' + out + '\n');
        if ($('[data-x="all"]', acts)) $('[data-x="all"]', acts).onclick = () => { if (confirm('Sostituire tutto il documento con questa versione?')) Notes.editor.setValue(out); };
        $('[data-x="copy"]', acts).onclick = () => navigator.clipboard.writeText(out).then(() => toast('Copiato'));
        if (sel) $('[data-x="rep"]', acts).onclick = () => Notes.editor.replaceSelection(out);
    } catch (e) { window.aiStreamTarget = null; a.innerHTML = `<span style="color:var(--err)">${esc(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span>`; }
    log.scrollTop = 1e9;
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
        b.classList.remove('rec'); b.textContent = '⏳';
        try {
            const buf = await new Blob(chunks, { type: 'audio/webm' }).arrayBuffer();
            const lang = Notes.scope && course(Notes.scope) ? course(Notes.scope).language : '';
            const text = await api.dictate(buf, lang || undefined);
            if (text) Notes.editor.insertAtCursor(text + ' ');
        } catch (e) { toast(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 6000); }
        b.textContent = '🎙';
    };
    rec.start(); b.classList.add('rec'); b.textContent = '⏺ Stop';
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
        ['🌐 Aggiungi calendario web (URL .ics)…', async () => { const u = prompt('URL del calendario (.ics, webcal://, Google Calendar "indirizzo segreto in formato iCal")'); if (u) { const n = await api.cal.importIcs(u.trim()); toast(`${n} eventi importati`); window.extraViews.calendar(v); } }],
        ['📋 Incolla orario testuale…', async () => { const t = prompt('Incolla qui il testo dell\'orario (Servizi Online o Manifesto degli studi)'); if (t) { const r = await api.cal.importText(t); toast(`${r.count} serie importate`); window.extraViews.calendar(v); } }],
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
        $('.tt', el).ondblclick = () => { const n = prompt('Modifica', $('.tt', el).textContent); if (n) guard(async () => { await api.ws.setTodo(cid, el.dataset.id, { text: n }); redraw(); }); };
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
        pageEd = PoliEditor.create($('#pg-ed', el), { kind: 'markdown', value: w.page, lineNumbers: false, onChange: v => { $('#pg-st', el).textContent = '…'; clearTimeout(t); t = setTimeout(() => api.ws.page(c.id, v).then(() => $('#pg-st', el).textContent = 'Salvato'), 600); } });
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
    <div class="group"><h3>Informazioni</h3>
        ${field(`${esc(about.name)} ${esc(about.version)}`, `Electron ${esc(about.electron)} · ${esc(about.platform)} · dati in ${esc(about.dataDir)}`, '<button id="x-upd">Controlla aggiornamenti</button>')}
        ${field('Gratis e open source', 'PoliRec è gratuito per tutti gli studenti. Se ti è utile, puoi offrire un caffè allo sviluppatore ☕', about.donateUrl ? '<button class="primary" id="x-coffee">☕ Buy me a coffee</button>' : '<span class="faint">link donazioni non configurato</span>')}
        ${field('Licenze e crediti', 'MIT · progetti della community PoliNetwork e componenti di terze parti', '<button id="x-notice">Mostra</button>')}
        ${field('Avviso', 'App non ufficiale, non affiliata né approvata dal Politecnico di Milano. Usa le registrazioni solo per studio personale, nel rispetto del regolamento di Ateneo e del diritto d\'autore dei docenti.', '')}
    </div>`;
    const saveX = patch => api.saveSettings(patch).then(() => refresh());
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
