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

// ═════════════ FOCUS (Pomodoro): pill in the top bar while a session is on, popover with the controls ═════════════
// st.run = the settings of the session in progress (chosen in the "Nuova sessione" sheet); defaults in settings.pomodoro
const FOCUS_PRESETS = [['classico', 'Classico', 25, 5, 15], ['lungo', 'Lungo', 50, 10, 20], ['profondo', 'Profondo', 90, 20, 30]];
const today = () => new Date().toISOString().slice(0, 10);
const Pomo = {
    st: (() => { try { return JSON.parse(localStorage.getItem('pomo')) || null; } catch (e) { return null; } })() || {},
    cfg() { return { focus: 25, short: 5, long: 15, every: 4, cycles: 4, autoBreak: true, autoFocus: false, sound: true, ...((S && S.settings.pomodoro) || {}) }; },
    run() { return { ...this.cfg(), ...(this.st.run || {}) }; },
    dur(mode) { const c = this.run(); return (mode === 'focus' ? c.focus : mode === 'short' ? c.short : c.long) * 60000 + (this.st.extra || 0); },
    save() { try { localStorage.setItem('pomo', JSON.stringify(this.st)); } catch (e) { } },
    remaining() { return this.st.running ? Math.max(0, (this.st.endsAt || 0) - Date.now()) : (this.st.left > 0 ? this.st.left : this.dur(this.st.mode)); },
    get active() { return !!this.st.active; },
    /** begin a session (opts from the sheet; none = saved defaults) */
    begin(opts = {}) {
        const run = { ...this.cfg(), ...opts };
        if (this.st.day !== today()) { this.st.day = today(); this.st.todayCount = 0; }
        this.st = { ...this.st, active: true, run, mode: 'focus', done: 0, extra: 0, courseId: opts.courseId !== undefined ? opts.courseId : this.st.courseId || null, running: false, left: 0, startedAt: null };
        delete this.st.run.courseId;
        this.start();
    },
    start() {
        if (!this.st.active) return this.begin();
        if (this.st.running) return;
        const left = this.remaining();
        this.st.endsAt = Date.now() + left; this.st.running = true; this.st.startedAt = this.st.startedAt || new Date().toISOString();
        this.save(); this.draw();
    },
    pause() { this.st.left = this.remaining(); this.st.running = false; this.save(); this.draw(); },
    toggle() { if (!this.st.active) this.begin(); else this.st.running ? this.pause() : this.start(); },
    addMinutes(n) { this.st.extra = (this.st.extra || 0) + n * 60000; if (this.st.running) this.st.endsAt += n * 60000; else this.st.left = this.remaining() + n * 60000; this.save(); this.draw(); },
    stop() { this.st = { day: this.st.day, todayCount: this.st.todayCount, courseId: this.st.courseId }; this.save(); this.draw(); closeFocusPop(); },
    // compat: older callers
    reset() { this.stop(); },
    async finish(skipped) {
        const was = this.st.mode, r = this.run();
        if (this.st.day !== today()) { this.st.day = today(); this.st.todayCount = 0; }
        this.st.running = false; this.st.extra = 0;
        if (was === 'focus') {
            if (!skipped) {
                const minutes = Math.round((Date.now() - new Date(this.st.startedAt || Date.now()).getTime()) / 60000) || r.focus;
                guard(() => api.ws.pomodoro(this.st.courseId, Math.min(minutes, r.focus + 60), 'focus', this.st.startedAt));
            }
            this.st.done = (this.st.done || 0) + 1; this.st.todayCount = (this.st.todayCount || 0) + (skipped ? 0 : 1);
            if (r.cycles > 0 && this.st.done >= r.cycles) {
                this.notify('🎉 Sessione completata', `${this.st.done} ${this.st.done === 1 ? 'blocco' : 'blocchi'} di focus. Ottimo lavoro!`);
                return this.stop();
            }
            const next = this.st.done % r.every === 0 ? 'long' : 'short';
            if (!skipped) this.notify('Focus completato', `Pausa ${next === 'long' ? 'lunga' : 'breve'} di ${next === 'long' ? r.long : r.short} minuti.`);
            this.st.mode = next;
        } else {
            if (!skipped) this.notify('Pausa finita', 'Si torna a studiare.');
            this.st.mode = 'focus';
        }
        this.st.left = this.dur(this.st.mode); this.st.startedAt = null;
        this.save();
        if (this.st.mode === 'focus' ? r.autoFocus : r.autoBreak) this.start(); else this.draw();
    },
    notify(title, body) {
        const r = this.run();
        try { new Notification(title, { body, silent: !r.sound }); } catch (e) { }
        if (r.sound) { try { const a = new AudioContext(); [0, .18].forEach((t, i) => { const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = i ? 1320 : 880; g.gain.setValueAtTime(.12, a.currentTime + t); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + t + .9); o.start(a.currentTime + t); o.stop(a.currentTime + t + .9); }); } catch (e) { } }
        toast(`${title} · ${body}`, 5000);
    },
    label(mode = this.st.mode) { return { focus: 'Focus', short: 'Pausa', long: 'Pausa lunga' }[mode]; },
    time(ms = this.remaining()) { const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0'); },
    /** top bar: a timer button when idle, the live pill while a session is on */
    draw() {
        const slot = $('#focus-slot'); if (!slot || !S) return;
        if (!this.active) {
            slot.innerHTML = `<button class="tb-btn" id="focus-new" title="Focus · Pomodoro (⌘⇧T)" aria-label="Nuova sessione di focus">${icon('timer')}</button>`;
            $('#focus-new').onclick = () => openFocusSheet();
            return;
        }
        const r = this.remaining(), tot = this.dur(this.st.mode), pct = Math.max(0, Math.min(1, 1 - r / tot));
        const c = this.st.courseId && course(this.st.courseId);
        slot.innerHTML = `<button class="focus-pill ${this.st.mode} ${this.st.running ? 'running' : 'paused'}" id="focus-pill" title="${this.label()}${c ? ' · ' + esc(cname(c)) : ''} — clic per i controlli">
            <svg class="ring" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><circle class="v" cx="10" cy="10" r="8" style="stroke-dashoffset:${(50.27 * (1 - pct)).toFixed(2)}"/></svg>
            <span class="fp-t">${this.time(r)}</span>${this.st.running ? '' : `<span class="fp-s">${icon('pause')}</span>`}</button>`;
        $('#focus-pill').onclick = e => { e.stopPropagation(); toggleFocusPop(); };
        drawFocusPop();
    },
};
if (Pomo.st.running && Pomo.st.endsAt && Pomo.st.endsAt < Date.now() - 5 * 60000) { Pomo.st.running = false; Pomo.st.left = Pomo.dur(Pomo.st.mode); Pomo.save(); }
setInterval(() => { if (Pomo.st.running) { if (Pomo.remaining() <= 0) Pomo.finish(); else Pomo.draw(); } }, 1000);
window.Pomo = Pomo;

/** Popover under the pill (like a menu bar extra on macOS). */
function toggleFocusPop() { if ($('#focus-pop')) closeFocusPop(); else { const p = document.createElement('div'); p.id = 'focus-pop'; p.className = 'focus-pop'; document.body.appendChild(p); drawFocusPop(); setTimeout(() => document.addEventListener('mousedown', focusPopOutside), 0); } }
function closeFocusPop() { const p = $('#focus-pop'); if (p) p.remove(); document.removeEventListener('mousedown', focusPopOutside); }
function focusPopOutside(e) { if (!e.target.closest('#focus-pop') && !e.target.closest('#focus-pill')) closeFocusPop(); }
function drawFocusPop() {
    const p = $('#focus-pop'); if (!p) return;
    if (!Pomo.active) return closeFocusPop();
    const st = Pomo.st, r = Pomo.run(), rem = Pomo.remaining(), tot = Pomo.dur(st.mode), pct = Math.max(0, Math.min(1, 1 - rem / tot));
    const pill = $('#focus-pill'); if (pill) { const b = pill.getBoundingClientRect(); p.style.top = (b.bottom + 8) + 'px'; p.style.right = Math.max(10, innerWidth - b.right - 40) + 'px'; }
    const n = r.cycles > 0 ? r.cycles : Math.max(r.every, (st.done || 0) + 1);
    const dots = Array.from({ length: n }, (_, i) => `<i class="${i < (st.done || 0) ? 'on' : i === (st.done || 0) && st.mode === 'focus' ? 'cur' : ''}"></i>`).join('');
    const courses = S.courses.map(c => `<option value="${c.id}" ${st.courseId === c.id ? 'selected' : ''}>${esc(cname(c))}</option>`).join('');
    if (!p.dataset.built) {
        p.dataset.built = '1';
        p.innerHTML = `<div class="fpp-head"><span class="fpp-mode"></span><span class="grow"></span><span class="faint fpp-today"></span></div>
            <div class="fpp-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle class="v" cx="60" cy="60" r="52"/></svg><div><b class="fpp-time"></b><span class="fpp-sub"></span></div></div>
            <div class="fpp-dots"></div>
            <div class="fpp-btns"><button class="primary" id="fp-go"></button><button id="fp-plus" title="Aggiungi 5 minuti">+5 min</button><button id="fp-skip" title="Passa alla fase successiva">${icon('skip')}</button></div>
            <label class="fpp-course">${icon('book')}<select id="fp-course"><option value="">Nessun corso</option>${courses}</select></label>
            <div class="fpp-foot"><button class="ghost small" id="fp-stop">Termina sessione</button><span class="grow"></span><button class="ghost small" id="fp-new">Nuova…</button></div>`;
        $('#fp-go', p).onclick = () => Pomo.toggle();
        $('#fp-plus', p).onclick = () => Pomo.addMinutes(5);
        $('#fp-skip', p).onclick = () => Pomo.finish(true);
        $('#fp-stop', p).onclick = () => Pomo.stop();
        $('#fp-new', p).onclick = () => { closeFocusPop(); openFocusSheet(); };
        $('#fp-course', p).onchange = e => { Pomo.st.courseId = e.target.value || null; Pomo.save(); Pomo.draw(); };
    }
    p.className = `focus-pop ${st.mode}`;
    $('.fpp-mode', p).textContent = Pomo.label();
    $('.fpp-today', p).textContent = st.todayCount ? `${st.todayCount} oggi` : '';
    $('.fpp-time', p).textContent = Pomo.time(rem);
    $('.fpp-sub', p).textContent = st.running ? `fino alle ${new Date(Date.now() + rem).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : 'in pausa';
    $('.fpp-ring .v', p).style.strokeDashoffset = (326.73 * (1 - pct)).toFixed(1);
    $('.fpp-dots', p).innerHTML = dots + `<span class="faint">${r.cycles > 0 ? `${st.done || 0} di ${r.cycles}` : `${st.done || 0} completati`}</span>`;
    $('#fp-go', p).innerHTML = st.running ? `${icon('pause')} Pausa` : `${icon('play')} Riprendi`;
}

/** "Nuova sessione di focus": everything adjustable; the choice becomes the new default. */
function openFocusSheet(courseId) {
    const c = Pomo.cfg();
    const preset = (FOCUS_PRESETS.find(p => p[2] === c.focus && p[3] === c.short && p[4] === c.long) || ['custom'])[0];
    const num = (id, v, min, max, unit) => `<div class="stepper"><button data-d="-1" data-for="${id}">−</button><input id="${id}" type="number" min="${min}" max="${max}" value="${v}"><button data-d="1" data-for="${id}">+</button><span class="muted">${unit || ''}</span></div>`;
    const cur = courseId !== undefined ? courseId : Pomo.st.courseId;
    const m = modal(`<div class="focus-sheet">
        <div class="fs-hero"><span class="ob-ic" style="background:linear-gradient(135deg,#ff6b4a,#ff2d55)">${icon('timer')}</span><div><h2>Nuova sessione di focus</h2><p class="muted">Blocchi di studio con pause in mezzo. Il timer resta in alto finché la sessione è attiva.</p></div></div>
        <div class="seg fs-presets">${FOCUS_PRESETS.map(([k, l, f, s]) => `<button data-p="${k}" class="${preset === k ? 'on' : ''}">${l}<span>${f} / ${s}</span></button>`).join('')}<button data-p="custom" class="${preset === 'custom' ? 'on' : ''}">Personalizzato<span>a scelta</span></button></div>
        <div class="gcard">
            ${field('Focus', 'Durata di ogni blocco di studio', num('fs-f', c.focus, 1, 240, 'min'))}
            ${field('Pausa breve', '', num('fs-s', c.short, 1, 60, 'min'))}
            ${field('Pausa lunga', '', num('fs-l', c.long, 1, 90, 'min'))}
            ${field('Pausa lunga ogni', '', num('fs-e', c.every, 2, 12, 'blocchi'))}
        </div>
        <div class="gcard">
            ${field('Blocchi da fare', '0 = finché non la termini tu', num('fs-c', c.cycles, 0, 20, ''))}
            ${field('Avvia le pause da solo', '', sw('fs-ab', c.autoBreak))}
            ${field('Avvia il blocco successivo da solo', 'Altrimenti aspetta che premi Riprendi', sw('fs-af', c.autoFocus))}
            ${field('Suono alla fine', '', sw('fs-snd', c.sound))}
            ${field('Corso', 'Il tempo di studio viene registrato nel corso', `<select id="fs-course"><option value="">Nessun corso</option>${S.courses.map(x => `<option value="${x.id}" ${cur === x.id ? 'selected' : ''}>${esc(cname(x))}</option>`).join('')}</select>`)}
        </div>
        <p class="faint fs-total" id="fs-total"></p>
        <div class="foot"><button class="ghost" id="fs-x">Annulla</button><button class="primary" id="fs-go">${icon('play')} Inizia</button></div></div>`);
    const el = m.el, val = id => Math.max(+$('#' + id, el).min, Math.min(+$('#' + id, el).max, Math.round(+$('#' + id, el).value || 0)));
    const total = () => {
        const f = val('fs-f'), s = val('fs-s'), l = val('fs-l'), e = val('fs-e'), n = val('fs-c');
        if (!n) return $('#fs-total', el).textContent = `Blocchi da ${f} minuti, senza limite`;
        let t = 0; for (let i = 1; i <= n; i++) { t += f; if (i < n) t += i % e === 0 ? l : s; }
        const end = new Date(Date.now() + t * 60000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        $('#fs-total', el).textContent = `${n} ${n === 1 ? 'blocco' : 'blocchi'} · ${Math.floor(t / 60) ? Math.floor(t / 60) + ' h ' : ''}${t % 60} min in tutto · fine verso le ${end}`;
    };
    $$('.fs-presets button', el).forEach(b => b.onclick = () => {
        $$('.fs-presets button', el).forEach(x => x.classList.toggle('on', x === b));
        const p = FOCUS_PRESETS.find(x => x[0] === b.dataset.p);
        if (p) { $('#fs-f', el).value = p[2]; $('#fs-s', el).value = p[3]; $('#fs-l', el).value = p[4]; }
        else $('#fs-f', el).focus();
        total();
    });
    const markCustom = () => { const f = val('fs-f'), s = val('fs-s'), l = val('fs-l'); const p = FOCUS_PRESETS.find(x => x[2] === f && x[3] === s && x[4] === l); $$('.fs-presets button', el).forEach(x => x.classList.toggle('on', x.dataset.p === (p ? p[0] : 'custom'))); total(); };
    $$('.stepper button', el).forEach(b => b.onclick = () => { const i = $('#' + b.dataset.for, el); i.value = Math.max(+i.min, Math.min(+i.max, (+i.value || 0) + +b.dataset.d * (b.dataset.for === 'fs-f' && +i.value >= 30 ? 5 : 1))); markCustom(); });
    $$('.stepper input', el).forEach(i => i.oninput = markCustom);
    total();
    $('#fs-x', el).onclick = m.close;
    $('#fs-go', el).onclick = () => guard(async () => {
        const o = { focus: val('fs-f'), short: val('fs-s'), long: val('fs-l'), every: val('fs-e'), cycles: val('fs-c'), autoBreak: $('#fs-ab', el).checked, autoFocus: $('#fs-af', el).checked, sound: $('#fs-snd', el).checked };
        await api.saveSettings({ pomodoro: { ...(S.settings.pomodoro || {}), ...o } });
        await refresh();
        m.close();
        Pomo.begin({ ...o, courseId: $('#fs-course', el).value || null });
        toast(`Focus di ${o.focus} minuti avviato`, 2500);
    });
}
window.openFocusSheet = openFocusSheet;

// ═════════════ APPUNTI (editor) ═════════════
const Notes = { scope: null, file: null, kind: null, editor: null, dirty: false, saveT: null, aiOpen: true, dir: '', abs: '', open: {}, target: { scope: null, folder: null } };
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

/** file:// URL of an absolute path (# and ? are valid in file names) */
const fileUrl = abs => 'file://' + encodeURI(String(abs).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
const dirOf = p => String(p).replace(/[\\/][^\\/]*$/, '');
const scopeLabel = scope => scope && course(scope) ? cname(course(scope)) : 'Generale';
/** "Image Analysis › Esercizi" — where a new note goes */
const targetLabel = (scope, folder) => scopeLabel(scope) + (folder ? ' › ' + folder.split('/').map(x => x.replace(/^@/, '')).join(' › ') : '');

/** New note of a given format in the selected course/folder (title asked first). */
async function newNoteIn(kind, scope = Notes.target.scope, folder = Notes.target.folder) {
    const title = await askText(`Nuovo appunto ${KIND_LABEL[kind]}`, { placeholder: 'Titolo', ok: 'Crea', help: `In ${targetLabel(scope, folder)}` });
    if (title === null) return;
    const f = await api.notes.create(scope, title.trim() || 'Senza titolo', kind, folder);
    await SideNotes.reload();
    go({ name: 'notes', scope, file: f, kind });
}
window.newNoteIn = newNoteIn;

/** files of one scope → folder tree { dirs: Map, files: [], n } */
function noteTree(files) {
    const root = { dirs: new Map(), files: [], n: 0 };
    for (const f of files) {
        const parts = f.file.split('/');
        let node = root, path = '';
        root.n++;
        for (const p of parts.slice(0, -1)) {
            path = path ? path + '/' + p : p;
            if (!node.dirs.has(p)) node.dirs.set(p, { name: p, path, dirs: new Map(), files: [], n: 0 });
            node = node.dirs.get(p); node.n++;
        }
        node.files.push(f);
    }
    return root;
}

// ── «Appunti» tab of a course page: the notes of that course (folders and linked folders too) ──
const courseNotesOpen = {};
window.tabCourseNotes = async (c, el) => {
    el.innerHTML = `<div class="cn-head">
            <div class="cn-new">${Object.keys(KIND_LABEL).map(k => `<button class="ns-k" data-k="${k}" title="Nuovo appunto ${KIND_LABEL[k]} in ${esc(cname(c))}"><span class="badge-k ${k}">${KIND_SHORT[k]}</span>${KIND_LABEL[k]}</button>`).join('')}</div>
            <span class="grow"></span>
            <button id="cn-up">${icon('download')} Carica file o cartella</button>
            <button class="ghost" id="cn-all">Apri in Appunti</button>
        </div>
        <input id="cn-q" class="cn-q" placeholder="Cerca negli appunti di ${esc(cname(c))}…">
        <div class="cn-tree n-tree" id="cn-tree"><div class="faint">Carico…</div></div>`;
    const open = (file, kind) => go({ name: 'notes', scope: c.id, file, kind });
    $$('.cn-new .ns-k', el).forEach(b => b.onclick = () => guard(async () => {
        const kind = b.dataset.k;
        const title = await askText(`Nuovo appunto ${KIND_LABEL[kind]}`, { placeholder: 'Titolo', ok: 'Crea', help: `In ${cname(c)}` });
        if (title === null) return;
        open(await api.notes.create(c.id, title.trim() || 'Senza titolo', kind), kind);
    }));
    $('#cn-up', el).onclick = () => Upload.open({ courseId: c.id }).then(ok => ok && draw());
    $('#cn-all', el).onclick = () => go({ name: 'notes', scope: c.id });
    Upload.zone(el, files => Upload.open({ courseId: c.id, files }).then(ok => ok && draw()));
    let all = [];
    const render = () => {
        const q = ($('#cn-q', el).value || '').toLowerCase();
        const files = all.filter(f => !q || f.file.toLowerCase().includes(q));
        const row = f => `<div class="n-file" data-f="${esc(f.file)}" data-k="${f.kind}" title="${esc(f.file)}">${noteBadge(f)}<span class="n">${noteName({ ...f, file: f.file.split('/').pop() })}</span><span class="faint">${new Date(f.mtime).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>`;
        const branch = (node, depth) => [...node.dirs.values()].sort((a, b) => (b.name.startsWith('@') - a.name.startsWith('@')) || a.name.localeCompare(b.name, 'it')).map(d => {
            const linked = depth === 0 && d.name.startsWith('@');
            const isOpen = q || (courseNotesOpen[c.id + ':' + d.path] ?? true);
            return `<div class="n-dir ${isOpen ? 'open' : ''}" data-p="${esc(d.path)}"><div class="n-dh"><span class="chev">▸</span><span class="n-dico">${linked ? '🔗' : '📁'}</span><span class="n">${esc(linked ? d.name.slice(1) : d.name)}</span><span class="faint">${d.n}</span></div><div class="n-db">${branch(d, depth + 1)}</div></div>`;
        }).join('') + node.files.map(row).join('');
        const tree = $('#cn-tree', el); if (!tree) return;
        tree.innerHTML = files.length ? branch(noteTree(files), 0)
            : q ? '<p class="faint">Nessun appunto trovato.</p>'
            : `<div class="empty-state"><h2>Nessun appunto per ${esc(cname(c))}</h2><p class="muted">Crea un appunto con i tasti qui sopra, oppure trascina qui PDF, foto o un'intera cartella (viene collegata, non copiata).</p></div>`;
        $$('.n-file', tree).forEach(x => x.onclick = () => open(x.dataset.f, x.dataset.k));
        $$('.n-dir', tree).forEach(d => $('.n-dh', d).onclick = e => { e.stopPropagation(); courseNotesOpen[c.id + ':' + d.dataset.p] = !d.classList.contains('open'); d.classList.toggle('open'); });
    };
    const draw = async () => {
        all = await api.notes.list(c.id).catch(() => []);
        const tab = $('.tabs [data-tab="appunti"]'); if (tab) tab.innerHTML = `Appunti${all.length ? ` <span class="tab-n">${all.length}</span>` : ''}`;
        render();
    };
    $('#cn-q', el).oninput = render;
    await draw();
};

// ═════════════ «Appunti» in the main sidebar: courses → folders → notes (no second sidebar in the page) ═════════════
const SideNotes = (() => {
    let scopes = [], lists = {}, sig = null, loading = null, loaded = false;
    let open = {};
    try { open = JSON.parse(localStorage.getItem('sideNotesOpen') || '{}') || {}; } catch (e) { }
    const saveOpen = () => { try { localStorage.setItem('sideNotesOpen', JSON.stringify(open)); } catch (e) { } };
    const K = (s, p) => `${s || ''}|${p || ''}`;
    function reload() {
        if (loading) return loading;
        loading = (async () => {
            try {
                scopes = await api.notes.scopes();
                await Promise.all(scopes.map(async s => { lists[s.id || ''] = await api.notes.list(s.id).catch(() => lists[s.id || ''] || []); }));
                loaded = true;
            } finally { loading = null; }
            draw();
            if (route.name === 'notes' && Notes.view === 'home') notesHome();
        })();
        return loading;
    }
    /** (re)load when the courses change (also the first time the sidebar is drawn) */
    function ensure() { const s = (S && S.courses || []).map(c => c.id + ':' + cname(c)).join('|'); if (s !== sig) { sig = s; reload().catch(() => { }); } }
    function draw() {
        const box = $('#side-notes'); if (!box) return;
        wire();
        const fileRow = (s, f, d) => `<a class="sn-row sn-file" style="--d:${d}" data-s="${esc(s)}" data-f="${esc(f.file)}" data-k="${f.kind}" title="${esc(f.file.split('/').pop())}">${noteBadge(f)}<span class="n">${noteName({ ...f, file: f.file.split('/').pop() })}</span></a>`;
        const kids = (s, node, d) => [...node.dirs.values()].sort((a, b) => (b.name.startsWith('@') - a.name.startsWith('@')) || a.name.localeCompare(b.name, 'it')).map(x => dirNode(s, x, d)).join('') + node.files.map(f => fileRow(s, f, d)).join('');
        const dirNode = (s, x, d) => {
            const linked = x.path === x.name && x.name.startsWith('@');
            const isOpen = !!open[K(s, x.path)];
            return `<div class="sn-node ${isOpen ? 'open' : ''}"><a class="sn-row sn-dir" style="--d:${d}" data-s="${esc(s)}" data-p="${esc(x.path)}" ${linked ? 'data-linked="1"' : ''} title="${linked ? 'Cartella collegata: i file restano dove sono e si aggiornano da soli' : esc(x.name)}"><span class="tw">${icon('chevRight')}</span><span class="ico">${icon(linked ? 'link' : 'folder')}</span><span class="n">${esc(linked ? x.name.slice(1) : x.name)}</span><span class="badge">${x.n}</span><button class="icon ghost small sn-add" title="Nuovo appunto qui" aria-label="Nuovo appunto qui">${icon('plus')}</button></a>
                <div class="sn-kids">${isOpen ? kids(s, x, d + 1) : ''}</div></div>`;
        };
        // courses without notes stay out of the way (their page has an «Appunti» tab to start)
        const shown = scopes.filter(s => !s.id || (lists[s.id] || []).length || String(Notes.target.scope || '') === s.id);
        box.innerHTML = shown.map(s => {
            const key = s.id || '', files = lists[key] || [], isOpen = !!open[K(key, '')];
            return `<div class="sn-node ${isOpen ? 'open' : ''}"><a class="sn-row sn-scope" style="--d:0" data-s="${esc(key)}" data-p="" title="${esc(s.name)}"><span class="tw">${icon('chevRight')}</span><span class="ico">${icon('note')}</span><span class="n">${esc(s.name)}</span><span class="badge">${files.length || ''}</span><button class="icon ghost small sn-add" title="Nuovo appunto in ${esc(s.name)}" aria-label="Nuovo appunto">${icon('plus')}</button></a>
                <div class="sn-kids">${isOpen ? (kids(key, noteTree(files), 1) || '<div class="sn-empty faint">Nessun appunto</div>') : ''}</div></div>`;
        }).join('') || '<div class="faint sn-empty">Caricamento…</div>';
        mark();
    }
    function mark() {
        const box = $('#side-notes'); if (!box) return;
        const inNotes = route.name === 'notes';
        $$('.sn-row', box).forEach(r => {
            const s = r.dataset.s || '';
            const on = inNotes && (r.dataset.f !== undefined
                ? Notes.view === 'file' && String(Notes.scope || '') === s && Notes.file === r.dataset.f
                : Notes.view === 'home' && !Notes.root && String(Notes.target.scope || '') === s && (Notes.target.folder || '') === (r.dataset.p || ''));
            r.classList.toggle('active', on);
        });
        const h = $('#sn-home'); if (h) h.classList.toggle('active', inNotes && Notes.view === 'home' && !!Notes.root);
    }
    /** expand the course and the folders around a note or folder */
    function reveal(scope, folder) {
        open[K(scope, '')] = true;
        const parts = folder ? folder.split('/') : [];
        parts.forEach((_, i) => { open[K(scope, parts.slice(0, i + 1).join('/'))] = true; });
        saveOpen(); draw();
        const a = $('#side-notes .sn-row.active'); if (a) a.scrollIntoView({ block: 'nearest' });
    }
    const kindMenu = (e, scope, folder) => {
        const r = e.target.closest('button, .sn-row').getBoundingClientRect();
        showMenu(r.left, r.bottom + 4, [
            ...Object.keys(KIND_LABEL).map(k => [`${KIND_LABEL[k]}  ·  in ${targetLabel(scope, folder)}`, () => newNoteIn(k, scope, folder)]),
            '-', ['Carica file o collega una cartella…', () => Upload.open({ courseId: scope })],
        ]);
    };
    function wire() {
        const box = $('#side-notes'); if (!box || box.dataset.wired) return;
        box.dataset.wired = '1';
        box.addEventListener('click', e => {
            const row = e.target.closest('.sn-row'); if (!row) return;
            const s = row.dataset.s || null, p = row.dataset.p || null;
            if (e.target.closest('.sn-add')) { e.preventDefault(); e.stopPropagation(); return kindMenu(e, s, p); }
            if (row.dataset.f !== undefined) return go({ name: 'notes', scope: s, file: row.dataset.f, kind: row.dataset.k });
            const k = K(s, p);
            const here = route.name === 'notes' && Notes.view === 'home' && !Notes.root && String(Notes.target.scope || '') === String(s || '') && (Notes.target.folder || '') === (p || '');
            // the arrow (or a second click on the open folder) only expands/collapses
            if (e.target.closest('.tw') || here) { open[k] = !open[k]; saveOpen(); return draw(); }
            open[k] = true; saveOpen();
            go({ name: 'notes', scope: s, folder: p });
        });
        box.addEventListener('contextmenu', e => {
            const row = e.target.closest('.sn-row'); if (!row) return;
            e.preventDefault();
            const s = row.dataset.s || null;
            if (row.dataset.f !== undefined) return showMenu(e.clientX, e.clientY, [
                ['Apri', () => go({ name: 'notes', scope: s, file: row.dataset.f, kind: row.dataset.k })],
                ['Mostra nel Finder', async () => api.reveal(await api.notes.path(s, row.dataset.f))],
            ]);
            folderMenu(e, s, row.dataset.p || null, !!row.dataset.linked);
        });
        $('#sn-home').onclick = () => go({ name: 'notes' });
        $('#sn-new').onclick = e => kindMenu(e, Notes.target.scope, Notes.target.folder);
        $('#sn-up').onclick = () => Upload.open({ courseId: Notes.target.scope });
        // (upload-ui.js loads after this file)
        setTimeout(() => window.Upload && Upload.zone(box, files => Upload.open({ courseId: Notes.target.scope, files })), 0);
    }
    return { reload, ensure, draw, mark, reveal, lists: () => lists, scopes: () => scopes, loaded: () => loaded };
})();
window.SideNotes = SideNotes;

/** ⋯ of a course or folder: new notes there, Finder, unlink a linked folder */
function folderMenu(e, scope, path, linked) {
    showMenu(e.clientX, e.clientY, [
        ...Object.keys(KIND_LABEL).map(k => [`＋ Nuovo ${KIND_LABEL[k]} qui`, () => newNoteIn(k, scope, path)]),
        ['Carica file o collega una cartella…', () => Upload.open({ courseId: scope })],
        '-',
        ['Mostra nel Finder', async () => api.openPath(path ? await api.notes.path(scope, path) : await api.notes.dir(scope))],
        ...(linked ? [['Scollega cartella (i file restano dove sono)', async () => {
            if (!confirm(`Scollegare «${path.slice(1)}» dagli appunti? I file sul disco non vengono toccati.`)) return;
            await api.notes.remove(scope, path);
            toast('Cartella scollegata');
            await SideNotes.reload();
            if (route.name === 'notes') go({ name: 'notes', scope });
        }]] : []),
    ]);
}

/** where new notes go, and the sidebar around the open note */
Notes.setTarget = (scope, folder) => { Notes.target = { scope: scope || null, folder: folder || null }; SideNotes.reveal(scope || null, folder || null); };
Notes.reload = () => SideNotes.reload();
Notes.toggleFiles = () => window.toggleSidebar && window.toggleSidebar(!$('#app').classList.contains('sb-collapsed'));
Notes.create = (scope = Notes.target.scope, folder = String(scope || '') === String(Notes.target.scope || '') ? Notes.target.folder : null) => guard(async () => {
    const r = await askNewNote(S.settings.editor.mode || 'markdown');
    if (!r) return;
    const f = await api.notes.create(scope, r.title, r.kind, folder);
    await SideNotes.reload();
    go({ name: 'notes', scope, file: f, kind: r.kind });
});

window.extraViews.notes = async v => {
    v.innerHTML = `<div class="notes-layout single"><section class="notes-main" id="n-main"></section></div>`;
    if (!SideNotes.loaded()) await SideNotes.reload().catch(() => { });
    if (route.file) {
        if (route.scope !== undefined) Notes.scope = route.scope;
        return openNote(route.file, route.kind || 'markdown', Notes.scope);
    }
    notesHome();
};

/** The notes page without an open note: all notes, a course, or a folder (with its subfolders and files). */
function notesHome() {
    const m = $('#n-main'); if (!m) return;
    if (Notes.editor) { Notes.editor.destroy(); Notes.editor = null; }
    const root = !('scope' in route);
    const scope = root ? null : (route.scope || null), folder = root ? null : (route.folder || null);
    Notes.view = 'home'; Notes.root = root; Notes.file = null; Notes.scope = scope;
    Notes.target = { scope, folder };
    if (!root) SideNotes.reveal(scope, folder); else SideNotes.mark();
    const lists = SideNotes.lists(), scopes = SideNotes.scopes();
    const sName = s => (scopes.find(x => String(x.id || '') === String(s || '')) || {}).name || scopeLabel(s);
    const files = root ? [] : (lists[scope || ''] || []);
    // the folder shown: its node in the tree of the course
    let node = noteTree(files);
    if (folder) for (const p of folder.split('/')) node = node && node.dirs.get(p);
    if (!root && !node) { go({ name: 'notes', scope }); return; }
    const linkedRoot = folder && !folder.includes('/') && folder.startsWith('@');
    const title = root ? 'Appunti' : folder ? folder.split('/').pop().replace(/^@/, '') : sName(scope);
    const crumbs = [`<a data-go="root">Appunti</a>`];
    if (!root) {
        crumbs.push(`<a data-go="scope">${esc(sName(scope))}</a>`);
        (folder ? folder.split('/') : []).forEach((p, i, a) => crumbs.push(`<a data-go="dir" data-p="${esc(a.slice(0, i + 1).join('/'))}">${esc(p.replace(/^@/, ''))}</a>`));
    }
    const date = t => new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    const fileRow = (s, f, showWhere) => `<div class="nh-row" data-s="${esc(s || '')}" data-f="${esc(f.file)}" data-k="${f.kind}"><span class="ico">${noteBadge(f)}</span><span class="n">${noteName({ ...f, file: f.file.split('/').pop() })}</span><span class="sub">${showWhere ? esc(targetLabel(s, f.file.includes('/') ? f.file.split('/').slice(0, -1).join('/') : null)) : f.kind === 'file' && f.size ? fmtSize(f.size) : ''}</span><span class="sub">${date(f.mtime)}</span></div>`;
    const dirRow = (s, path, name, n, linked, ico = linked ? 'link' : 'folder') => `<div class="nh-row" data-s="${esc(s || '')}" data-p="${esc(path)}"><span class="ico">${icon(ico)}</span><span class="n">${esc(name)}</span><span class="sub">${linked ? 'cartella collegata' : ''}</span><span class="sub">${n} ${n === 1 ? 'elemento' : 'elementi'}</span></div>`;
    const q = (Notes.q || '').toLowerCase();
    let body;
    if (q) {
        // search: everywhere (all notes) or inside this course/folder
        const pool = root ? scopes.flatMap(s => (lists[s.id || ''] || []).map(f => [s.id || null, f])) : files.filter(f => !folder || f.file.startsWith(folder + '/')).map(f => [scope, f]);
        const hit = pool.filter(([, f]) => f.file.toLowerCase().includes(q)).slice(0, 200);
        body = hit.length ? `<div class="nh-list">${hit.map(([s, f]) => fileRow(s, f, true)).join('')}</div>` : '<div class="nh-empty">Nessun appunto trovato.</div>';
    } else if (root) {
        const withNotes = scopes.filter(s => (lists[s.id || ''] || []).length || !s.id);
        const recent = scopes.flatMap(s => (lists[s.id || ''] || []).map(f => [s.id || null, f])).sort((a, b) => b[1].mtime - a[1].mtime).slice(0, 12);
        body = `<div class="nh-sec">Corsi</div><div class="nh-list">${withNotes.map(s => dirRow(s.id, '', s.name, (lists[s.id || ''] || []).length, false, 'note')).join('')}</div>
            ${recent.length ? `<div class="nh-sec">Modificati di recente</div><div class="nh-list">${recent.map(([s, f]) => fileRow(s, f, true)).join('')}</div>` : ''}`;
    } else {
        const dirs = [...node.dirs.values()].sort((a, b) => (b.name.startsWith('@') - a.name.startsWith('@')) || a.name.localeCompare(b.name, 'it'));
        const rows = dirs.map(d => dirRow(scope, d.path, d.name.replace(/^@/, ''), d.n, !d.path.includes('/') && d.name.startsWith('@'))).join('') + node.files.map(f => fileRow(scope, f, false)).join('');
        body = rows ? `<div class="nh-list">${rows}</div>` : `<div class="nh-empty"><b>Ancora nessun appunto qui</b><br>Crea un appunto con i tasti qui sopra, oppure trascina qui PDF, foto o un'intera cartella (viene collegata, non copiata).</div>`;
    }
    const target = root ? { scope: null, folder: null } : { scope, folder };
    m.innerHTML = `<div class="nh">
        <div class="nh-crumbs">${crumbs.join('<span class="sep">›</span>')}</div>
        <div class="nh-top"><h1>${!root && folder ? icon(linkedRoot ? 'link' : 'folder') : ''}${esc(title)}</h1><span class="grow"></span>
            <button id="nh-up">${icon('download')} Carica</button>${root ? '' : `<button class="ghost icon" id="nh-more" title="Altro" aria-label="Altro">${icon('more')}</button>`}</div>
        ${linkedRoot ? '<p class="muted nh-note">Cartella collegata: i file restano nella loro posizione sul disco e qui sono sempre aggiornati.</p>' : ''}
        <div class="nh-new">${Object.entries(KIND_INFO).map(([k, [t, d]]) => `<button class="nh-k" data-k="${k}" title="${esc(d)}"><span class="badge-k ${k}">${KIND_SHORT[k]}</span><span><b>Nuovo ${t}</b><small>in ${esc(targetLabel(target.scope, target.folder))}</small></span></button>`).join('')}</div>
        <input class="nh-q" id="nh-q" placeholder="${root ? 'Cerca in tutti gli appunti…' : `Cerca in ${esc(title)}…`}" value="${esc(Notes.q || '')}">
        <div id="nh-body">${body}</div>
        <p class="faint nh-tips"><b>⌘N</b> nuovo appunto · <b>⌘↵</b> compila LaTeX/Typst · seleziona del testo e usa <b>✨ AI</b> · trascina file o cartelle in questa pagina per caricarli.</p>
    </div>`;
    $$('[data-go]', m).forEach(a => a.onclick = () => { Notes.q = ''; a.dataset.go === 'root' ? go({ name: 'notes' }) : go({ name: 'notes', scope, folder: a.dataset.go === 'dir' ? a.dataset.p : null }); });
    $$('.nh-k', m).forEach(b => b.onclick = () => guard(() => newNoteIn(b.dataset.k, target.scope, target.folder)));
    $('#nh-up', m).onclick = () => Upload.open({ courseId: target.scope });
    if ($('#nh-more', m)) $('#nh-more', m).onclick = e => folderMenu(e, scope, folder, linkedRoot);
    $$('.nh-row', m).forEach(r => r.onclick = () => {
        const s = r.dataset.s || null; Notes.q = '';
        if (r.dataset.f !== undefined) go({ name: 'notes', scope: s, file: r.dataset.f, kind: r.dataset.k });
        else go({ name: 'notes', scope: s, folder: r.dataset.p || null });
    });
    const qi = $('#nh-q', m);
    qi.oninput = () => { Notes.q = qi.value; const pos = qi.selectionStart; notesHome(); const n = $('#nh-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
}
window.notesHome = notesHome;
// linked folders change outside the app: refresh the list when coming back to the window
window.addEventListener('focus', () => { if (SideNotes.loaded()) SideNotes.reload().catch(() => { }); });
window.addEventListener('notes-uploaded', () => SideNotes.reload().catch(() => { }));


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

/** after deleting/unlinking: back to the page of the course/folder */
function welcome() { go({ name: 'notes', scope: Notes.target.scope, folder: Notes.target.folder }); }

async function flush() {
    if (Notes.editor && Notes.editor.isReviewing()) Notes.editor.rejectAll();   // leaving with pending AI suggestions: keep the original
    if (!Notes.editor || !Notes.dirty) return;
    clearTimeout(Notes.saveT);
    await api.notes.write(Notes.scope, Notes.file, Notes.editor.getValue());
    Notes.dirty = false; const s = $('#ed-saved'); if (s) s.textContent = 'Salvato';
}
window.flushNote = flush;

async function openNote(file, kind, scope = Notes.scope) {
    if (kind === 'file') return openFileNote(file, scope);
    await flush();
    if (Notes.editor) { Notes.editor.destroy(); Notes.editor = null; }
    Notes.scope = scope; Notes.file = file; Notes.kind = kind; Notes.view = 'file'; Notes.root = false;
    Notes.dir = await api.notes.dir(scope);
    Notes.abs = await api.notes.path(scope, file);
    if (Notes.setTarget) Notes.setTarget(scope, file.includes('/') ? file.split('/').slice(0, -1).join('/') : null);
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
                <select id="ed-spell" title="Lingua correttore"><option value="it-IT">Italiano</option><option value="en-US">English</option><option value="off">Disattivato</option></select>
                <button id="ed-help" title="Grassetto ⌘B · corsivo ⌘I · sottolineato ⌘U · codice ⌘E · link ⌘K · titoli ⌘⌥1/2/3 · liste ⇧⌘7/8/9 · Tab per rientrare · / per blocchi">?</button>
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
    const spellLang = localStorage.getItem('polidesk-spell-language') || 'it-IT';
    $('#ed-spell').value = spellLang;
    api.spell.set(spellLang === 'off' ? [] : [spellLang]).catch(() => {});
    Notes.editor = PoliEditor.create($('#ed-src'), { kind, value: content, spellcheck: spellLang !== 'off', onChange, onSave: () => { flush(); if (compiled) compileNote(); }, onReviewChange: reviewBar, onSlash: showSlashMenu, lineNumbers: compiled });
    $('#ed-spell').onchange = e => { const v = e.target.value; localStorage.setItem('polidesk-spell-language', v); api.spell.set(v === 'off' ? [] : [v]).catch(() => {}); Notes.editor.view.contentDOM.spellcheck = v !== 'off'; if (v !== 'off') Notes.editor.view.contentDOM.lang = v; };
    Notes.editor.view.dom.addEventListener('keydown', e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && compiled) { e.preventDefault(); compileNote(); return; }
        if (kind !== 'markdown') return;
        const mod = e.metaKey || e.ctrlKey;
        const digit = e.code.match(/^Digit([1-9])$/)?.[1] || e.key;
        if (mod && e.altKey && /^[123]$/.test(digit)) { e.preventDefault(); Notes.editor.prefixLine('#'.repeat(+digit) + ' '); return; }
        if (mod && e.shiftKey && /^[789]$/.test(digit)) { e.preventDefault(); Notes.editor.prefixLine(digit === '7' ? '1. ' : digit === '8' ? '- ' : '- [ ] '); return; }
        if (e.key === '/' && !e.shiftKey) setTimeout(() => showSlashMenu(), 0);
    });
    function showSlashMenu() {
        if ($('.ed-slash-menu')) return;
        const blocks = [['Titolo 1','\n# '],['Titolo 2','\n## '],['Titolo 3','\n### '],['Elenco puntato','\n- '],['Elenco numerato','\n1. '],['Checklist','\n- [ ] '],['Citazione','\n> '],['Codice','\n```\n\n```'],['Tabella','\n| Colonna 1 | Colonna 2 |\n| --- | --- |\n|  |  |'],['Formula','\n$$\n\n$$'],['Divisore','\n---\n'],['Immagine','\n![](url)']];
        const box = document.createElement('div'); box.className = 'ed-slash-menu'; box.innerHTML = blocks.map(([n],i) => `<button data-i="${i}">${n}</button>`).join(''); $('#ed-src').append(box);
        box.onclick = ev => { const b = ev.target.closest('button'); if (!b) return; Notes.editor.replaceSelection(blocks[+b.dataset.i][1]); box.remove(); };
        document.addEventListener('pointerdown', function close(ev) { if (!box.contains(ev.target)) { box.remove(); document.removeEventListener('pointerdown', close); } }, { once: true });
    }
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
        ['📁 Mostra nella cartella', () => api.reveal(Notes.abs)],
        ['↗ Apri con app di sistema', () => api.openPath(Notes.abs)],
        '-',
        ['🗑 Sposta nel cestino', async () => { if (!confirm(file.startsWith('@') ? 'Questo appunto è in una cartella collegata: spostare il file originale nel Cestino del sistema?' : 'Spostare l\'appunto nel cestino (.cestino nella cartella)?')) return; await api.notes.remove(Notes.scope, file); Notes.file = null; Notes.editor.destroy(); Notes.editor = null; await Notes.reload(); welcome(); }],
    ]);
    if ($('#ed-install')) $('#ed-install').onclick = () => guard(async () => { $('#ed-install').disabled = true; $('#ed-install').textContent = 'Installo…'; await api.notes.installEngine(kind === 'typst' ? 'typst' : 'tectonic'); toast('Motore installato'); openNote(file, kind, Notes.scope); });
    if ($('#ed-compile')) $('#ed-compile').onclick = compileNote;
    $('#ed-dict').onclick = toggleDictation;
    if (kind === 'markdown') renderPreview();
    else if (engineOk) {
        const pdf = (await api.notes.list(Notes.scope)).find(f => f.file === file);
        if (pdf && pdf.pdf) showPdf(fileUrl(Notes.abs.replace(/\.(tex|typ)$/i, '.pdf')) + '?t=' + Date.now());
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
        const html = Notes.kind === 'markdown' ? PoliEditor.renderMarkdown(Notes.editor.getValue(), { baseUrl: fileUrl(dirOf(Notes.abs) + '/') }) : null;
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
    const base = fileUrl(dirOf(Notes.abs) + '/');
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
        Notes.editor.diagnosticsFromErrors(r.errors || []);
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
    const cals = meta.calendars || [];
    const readCalPref = (key, fallback) => { try { const value = localStorage.getItem(key); return value == null ? fallback : value === 'true'; } catch { return fallback; } };
    const showTodos = readCalPref('cal-show-todos', true), showDoneTodos = readCalPref('cal-show-done-todos', false);
    const days = [...Array(7)].map((_, i) => new Date(from.getTime() + i * 864e5));
    const timed = events.filter(e => !e.allDay), allDay = events.filter(e => e.allDay);
    const todoDate = t => {
        if (!t.due) return null;
        // Date-only values are calendar dates, not UTC instants.
        const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(t.due);
        return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(t.due);
    };
    const hasTodoTime = t => !!t.due && /T\d\d:\d\d|\s\d\d:\d\d/.test(t.due);
    // visible hours: 8–20, widened to fit early or late events
    const hrs = timed.flatMap(e => { const s = new Date(e.start), en = new Date(e.end); return [s.getHours(), en.getHours() + (en.getMinutes() ? 1 : 0)]; });
    todos.filter(t => t.due && hasTodoTime(t)).forEach(t => { const d = todoDate(t); hrs.push(d.getHours(), d.getHours() + 1); });
    const H0 = Math.max(0, Math.min(8, ...hrs)), H1 = Math.min(24, Math.max(20, ...hrs)), PX = 46;
    const colorOf = e => { if (e.color) return e.color; const i = S.courses.findIndex(c => c.id === e.courseId); return i < 0 ? 'var(--faint)' : `hsl(${(i * 67 + 210) % 360} 65% 52%)`; };
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const fmtH = d => d.toTimeString().slice(0, 5);
    const visibleTodos = todos.filter(t => showTodos && (showDoneTodos || !t.done));
    const todoColor = t => { const idx = S.courses.findIndex(c => c.id === t.courseId); return idx >= 0 ? `hsl(${(idx * 67 + 210) % 360} 65% 52%)` : 'var(--warn)'; };
    // overlapping events of a day side by side: columns per cluster
    const layout = evs => {
        const items = evs.map(e => ({ e, s: new Date(e.start).getTime(), en: Math.max(new Date(e.end).getTime(), new Date(e.start).getTime() + 15 * 6e4) })).sort((a, b) => a.s - b.s || b.en - a.en);
        let cluster = [], end = 0;
        const flush = () => { const cols = []; for (const it of cluster) { let c = cols.findIndex(x => x <= it.s); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = it.en; it.col = c; } for (const it of cluster) it.n = cols.length; cluster = []; };
        for (const it of items) { if (cluster.length && it.s >= end) flush(); cluster.push(it); end = Math.max(end, it.en); }
        flush();
        return items;
    };
    const kindLabel = { icloud: 'iCloud', google: 'Google', microsoft: 'Microsoft 365', mac: 'Mac', ics: 'Link .ics' };
    v.innerHTML = `<div class="page wide">
        <div class="page-head"><div><h1>Calendario</h1><div class="sub">${days[0].toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – ${days[6].toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} · ${meta.updatedAt ? 'orario aggiornato ' + new Date(meta.updatedAt).toLocaleDateString('it-IT') : 'importa l\'orario dai Servizi Online'} · orario convertito con <a data-ext="https://github.com/bebora/polimi-schedule-js">polimi-schedule-js</a></div></div>
            <button id="cal-prev" class="ghost icon" title="Settimana precedente" aria-label="Settimana precedente">${icon('chevLeft')}</button><button id="cal-today" class="ghost">Oggi</button><button id="cal-next" class="ghost icon" title="Settimana successiva" aria-label="Settimana successiva">${icon('chevRight')}</button>
            <button id="cal-cals">${icon('calendar')} Calendari…</button><button id="cal-more" class="ghost">Importa…</button><button id="cal-sync" class="primary">${icon('refresh')} Aggiorna orario</button></div>
        <div class="cal-legend">
            <span class="cal-chip static"><i style="background:hsl(210 65% 52%)"></i>Lezioni</span>
            <button class="cal-chip ${showTodos ? '' : 'off'}" id="cal-todos" title="Clicca per ${showTodos ? 'nascondere' : 'mostrare'}"><i style="background:var(--warn)"></i>Da fare${showTodos && showDoneTodos ? ' · anche completati' : ''}</button>
            ${showTodos ? `<button class="cal-chip ${showDoneTodos ? '' : 'off'}" id="cal-done-todos">Mostra anche quelli fatti</button>` : ''}
            ${cals.map(c => `<button class="cal-chip ${c.enabled === false ? 'off' : ''}" data-feed="${esc(c.id)}" title="${esc(kindLabel[c.kind] || '')}${c.error ? ' · ' + esc(c.error) : ''} · clicca per ${c.enabled === false ? 'mostrare' : 'nascondere'}"><i style="background:${esc(c.color)}"></i>${esc(c.name)}${c.error ? ` <span class="cal-err">${icon('alert')}</span>` : ''}</button>`).join('')}
            <button class="cal-chip add" id="cal-add">${icon('plus')} Collega iCloud, Google o Outlook</button></div>
        <div class="cal">
            <div class="cal-head"><div></div>${days.map(d => `<div class="${sameDay(d, new Date()) ? 'today' : ''}">${d.toLocaleDateString('it-IT', { weekday: 'short' })} <b>${d.getDate()}</b></div>`).join('')}</div>
            ${allDay.length || visibleTodos.some(t => t.due && !hasTodoTime(t)) ? `<div class="cal-allday"><div class="cal-ad-l">tutto il giorno</div>${days.map(d => `<div>${allDay.filter(e => new Date(e.start) <= new Date(d.getTime() + 864e5 - 1) && new Date(e.end) > d).map(e => `<div class="cal-ad" style="--c:${colorOf(e)}" title="${esc(e.summary + (e.feedName ? '\n' + e.feedName : ''))}">${esc(e.summary)}</div>`).join('')}${visibleTodos.filter(t => t.due && !hasTodoTime(t) && sameDay(todoDate(t), d)).map(t => `<label class="cal-todo ${t.done ? 'done' : ''}" style="--c:${todoColor(t)}" title="${esc((t.course ? t.course + ' · ' : '') + t.text)}"><input type="checkbox" data-todo="${esc(t.id)}" data-todo-course="${esc(t.courseId || '')}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}</span></label>`).join('')}</div>`).join('')}</div>` : ''}
            <div class="cal-body" style="height:${(H1 - H0) * PX}px">
                <div class="cal-hours">${[...Array(H1 - H0)].map((_, i) => `<div style="height:${PX}px">${H0 + i}:00</div>`).join('')}</div>
                ${days.map(d => {
                    const evs = layout(timed.filter(e => sameDay(new Date(e.start), d)));
                    const due = visibleTodos.filter(t => t.due && hasTodoTime(t) && todoDate(t).toDateString() === d.toDateString());
                    const now = new Date(), nowTop = (now.getHours() + now.getMinutes() / 60 - H0) * PX;
                    return `<div class="cal-day">${[...Array(H1 - H0)].map(() => `<div class="cal-slot" style="height:${PX}px"></div>`).join('')}
                        ${sameDay(d, now) && nowTop > 0 && nowTop < (H1 - H0) * PX ? `<div class="cal-now" style="top:${nowTop}px"></div>` : ''}
                        ${evs.map(({ e, col, n }) => { const st = new Date(e.start), en = new Date(e.end); const top = (st.getHours() + st.getMinutes() / 60 - H0) * PX, h = Math.max(22, (en - st) / 36e5 * PX);
                            return `<div class="cal-ev ${e.feed ? 'ext' : ''}" style="top:${top}px;height:${h}px;left:calc(${col / n * 100}% + 3px);width:calc(${100 / n}% - 6px);--c:${colorOf(e)}" ${e.courseId ? `data-c="${e.courseId}"` : ''} title="${esc([e.summary, `${fmtH(st)}–${fmtH(en)}`, e.location, e.feedName].filter(Boolean).join('\n'))}"><b>${esc(e.course || e.summary)}</b><span>${fmtH(st)}–${fmtH(en)}</span>${e.location ? `<span>${esc((e.location || '').split('(')[0])}</span>` : ''}</div>`; }).join('')}
                        ${due.map(t => { const dt = todoDate(t), top = (dt.getHours() + dt.getMinutes() / 60 - H0) * PX; return `<label class="cal-todo cal-todo-time ${t.done ? 'done' : ''}" style="top:${top}px;--c:${todoColor(t)}" title="${esc((t.course ? t.course + ' · ' : '') + t.text)}"><input type="checkbox" data-todo="${esc(t.id)}" data-todo-course="${esc(t.courseId || '')}" ${t.done ? 'checked' : ''}><span>${fmtH(dt)} ${esc(t.text)}</span></label>`; }).join('')}</div>`;
                }).join('')}
            </div></div>
        ${!events.length ? `<div class="empty-state"><p>Nessun evento in questa settimana. Premi <b>Aggiorna orario</b> per importare le lezioni dai Servizi Online (serve il login), oppure <a id="cal-add2">collega i tuoi calendari</a>.</p></div>` : ''}
    </div>`;
    const redraw = () => window.extraViews.calendar(v);
    $('#cal-todos').onclick = () => { try { localStorage.setItem('cal-show-todos', String(!showTodos)); } catch {} redraw(); };
    if ($('#cal-done-todos')) $('#cal-done-todos').onclick = () => { try { localStorage.setItem('cal-show-done-todos', String(!showDoneTodos)); } catch {} redraw(); };
    $$('[data-todo]', v).forEach(input => input.onchange = () => guard(async () => { await api.ws.setTodo(input.dataset.todoCourse || null, input.dataset.todo, { done: input.checked }); redraw(); }));
    $$('[data-ext]', v).forEach(a => a.onclick = () => api.openExternal(a.dataset.ext));
    $('#cal-prev').onclick = () => { calWeek = new Date(calWeek.getTime() - 7 * 864e5); redraw(); };
    $('#cal-next').onclick = () => { calWeek = new Date(calWeek.getTime() + 7 * 864e5); redraw(); };
    $('#cal-today').onclick = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); calWeek = d; redraw(); };
    $('#cal-sync').onclick = () => guard(async () => { $('#cal-sync').disabled = true; $('#cal-sync').innerHTML = '<span class="spin"></span> Apro i Servizi Online…'; const r = await api.cal.sync(); toast(`${r.count} serie di lezioni importate`); redraw(); });
    $('#cal-cals').onclick = () => openCalendars(redraw);
    $('#cal-add').onclick = () => openCalendars(redraw, true);
    if ($('#cal-add2')) $('#cal-add2').onclick = () => openCalendars(redraw, true);
    $$('[data-feed]', v).forEach(b => b.onclick = () => guard(async () => { const c = cals.find(x => x.id === b.dataset.feed); await api.cal.updateFeed(c.id, { enabled: c.enabled === false }); redraw(); }));
    $('#cal-more').onclick = e => showMenu(e.clientX - 200, e.clientY + 10, [
        ['Collega iCloud, Google, Outlook o il Mac…', () => openCalendars(redraw, true)],
        ['Importa un file .ics…', async () => { const n = await api.cal.importIcs(); if (n) { toast(`${n} eventi importati`); redraw(); } }],
        ['Incolla l\'orario testuale…', async () => { const t = await askText('Incolla orario testuale', { multiline: true, placeholder: '054307 - NOME CORSO (Docente: …)\nInizio lezioni: …\nLunedì dalle 10:15 alle 12:15 in aula …', help: 'Copia l\'«Orario testuale» dai Servizi Online o dal Manifesto degli studi. ⌘↵ per importare.', ok: 'Importa' }); if (t) { const r = await api.cal.importText(t); toast(`${r.count} serie importate`); redraw(); } }],
        '-',
        ['Esporta l\'orario per Google Calendar / Apple Calendar (.ics)', () => api.cal.revealIcs()],
    ]);
    $$('.cal-ev[data-c]', v).forEach(el => el.onclick = () => go({ name: 'course', courseId: el.dataset.c, tab: 'panoramica' }));
};
// linked calendars refreshed in the background: redraw the week
api.on(e => { if (e.type === 'cal-updated' && route.name === 'calendar' && !$('#modal-root').innerHTML.trim()) window.extraViews.calendar($('#view')); });

// ───────── linked calendars: list + guided setup for each service ─────────
const CAL_KINDS = {
    icloud: {
        name: 'iCloud', icon: 'cloud', url: 'https://www.icloud.com/calendar/',
        steps: ['Apri l\'app <b>Calendario</b> sul Mac o sull\'iPhone (oppure icloud.com/calendar).', 'Accanto al calendario scegli <b>Condividi calendario</b> (sul Mac: clic destro sul calendario).', 'Attiva <b>Calendario pubblico</b> e copia il link: inizia con <code>webcal://</code>.'],
        note: 'Chi conosce il link può vedere gli eventi: non condividerlo. Sul Mac puoi evitare il link pubblico con «Calendari del Mac».',
        ph: 'webcal://p…-caldav.icloud.com/published/2/…',
    },
    google: {
        name: 'Google Calendar', icon: 'calendar', url: 'https://calendar.google.com/calendar/r/settings',
        steps: ['Apri <b>calendar.google.com</b> dal computer → ⚙︎ <b>Impostazioni</b>.', 'A sinistra, in <b>Impostazioni dei miei calendari</b>, scegli il calendario.', 'In <b>Integra calendario</b> copia l\'<b>Indirizzo segreto in formato iCal</b>.'],
        note: 'L\'indirizzo segreto dà accesso in sola lettura: non condividerlo. Puoi reimpostarlo da Google quando vuoi.',
        ph: 'https://calendar.google.com/calendar/ical/…/private-…/basic.ics',
    },
    microsoft: {
        name: 'Outlook · Microsoft 365 (PoliMi)', short: 'Outlook (PoliMi)', icon: 'mail', url: 'https://outlook.office.com/calendar/options/calendar/SharedCalendars',
        steps: ['Apri <b>outlook.office.com</b> e accedi con l\'account del Politecnico (<code>@mail.polimi.it</code> o <code>@polimi.it</code>).', '⚙︎ <b>Impostazioni</b> → <b>Calendario</b> → <b>Calendari condivisi</b>.', 'In <b>Pubblica un calendario</b> scegli il calendario e «<b>Può visualizzare tutti i dettagli</b>», poi <b>Pubblica</b>.', 'Copia il <b>link ICS</b> (non quello HTML).'],
        note: 'Se «Pubblica un calendario» non c\'è, l\'Ateneo l\'ha disattivato: su Mac aggiungi l\'account del Politecnico in Impostazioni di Sistema → Account Internet (Microsoft Exchange) e usa «Calendari del Mac». Funziona anche con un account Outlook personale.',
        ph: 'https://outlook.office365.com/owa/calendar/…/calendar.ics',
    },
    ics: { name: 'Altro calendario (link .ics)', icon: 'external', steps: ['Copia il link del calendario in formato iCal/ICS (ad esempio quello di un docente o di un\'associazione).'], ph: 'https://… .ics oppure webcal://…' },
    mac: { name: 'Calendari del Mac', icon: 'calendar' },
};
const isMac = /Mac/.test(navigator.platform);
async function openCalendars(after, adding) {
    const m = modal('<div id="cals"></div>', { wide: true });
    const box = $('#cals', m.el);
    let changed = false;
    const close = () => { m.close(); if (changed && after) after(); };
    const ago = t => { if (!t) return 'mai'; const mi = Math.round((Date.now() - t) / 6e4); return mi < 1 ? 'ora' : mi < 60 ? `${mi} min fa` : new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
    const drawList = async () => {
        const feeds = await api.cal.feeds();
        box.innerHTML = `<h2>Calendari collegati</h2>
            <p class="muted" style="margin-top:0">I tuoi calendari compaiono nel Calendario di PoliDesk accanto alle lezioni, in sola lettura. Si aggiornano da soli.</p>
            <div class="cals-list">${feeds.map(f => `<div class="cals-row" data-id="${esc(f.id)}">
                <input type="color" value="${esc(f.color)}" data-color title="Colore">
                <div class="grow"><input class="cals-name" value="${esc(f.name)}" data-name><div class="faint cals-sub">${esc((CAL_KINDS[f.kind] || {}).name || f.kind)} · ${f.error ? `<span class="cals-e">${esc(f.error)}</span>` : `${f.count ?? 0} eventi · aggiornato ${ago(f.updatedAt)}`}</div></div>
                <label class="switch" title="Mostra nel calendario"><input type="checkbox" data-on ${f.enabled === false ? '' : 'checked'}><span></span></label>
                <button class="ghost small icon" data-refresh title="Aggiorna ora" aria-label="Aggiorna">${icon('refresh')}</button>
                <button class="ghost small icon" data-del title="Scollega" aria-label="Scollega">${icon('trash')}</button></div>`).join('') || '<p class="faint">Nessun calendario collegato.</p>'}</div>
            <h3 class="cals-h">Collega un calendario</h3>
            <div class="cals-kinds">${Object.entries(CAL_KINDS).filter(([k]) => k !== 'mac' || isMac).map(([k, x]) => `<button class="cals-kind" data-kind="${k}">${icon(x.icon)}<span>${esc(x.short || x.name)}</span></button>`).join('')}</div>
            <div class="foot"><span class="grow"></span><button class="primary" id="cals-ok">Fine</button></div>`;
        $('#cals-ok', box).onclick = close;
        $$('[data-kind]', box).forEach(b => b.onclick = () => b.dataset.kind === 'mac' ? drawMac() : drawAdd(b.dataset.kind));
        $$('.cals-row', box).forEach(row => {
            const id = row.dataset.id;
            const upd = patch => guard(async () => { await api.cal.updateFeed(id, patch); changed = true; });
            $('[data-color]', row).onchange = e => upd({ color: e.target.value });
            $('[data-name]', row).onchange = e => upd({ name: e.target.value.trim() || 'Calendario' });
            $('[data-on]', row).onchange = e => upd({ enabled: e.target.checked });
            $('[data-refresh]', row).onclick = () => guard(async () => { row.classList.add('busy'); await api.cal.refreshFeeds(true); changed = true; drawList(); });
            $('[data-del]', row).onclick = () => guard(async () => { await api.cal.removeFeed(id); changed = true; toast('Calendario scollegato'); drawList(); });
        });
    };
    const drawAdd = kind => {
        const k = CAL_KINDS[kind];
        box.innerHTML = `<h2>${icon(k.icon)} ${esc(k.name)}</h2>
            <ol class="cals-steps">${k.steps.map(x => `<li>${x}</li>`).join('')}</ol>
            ${k.url ? `<p><a id="cal-site">Apri la pagina delle impostazioni ↗</a></p>` : ''}
            <label class="l">Link del calendario<input id="cal-src" placeholder="${esc(k.ph)}" autocomplete="off" spellcheck="false"></label>
            <label class="l">Nome<input id="cal-nm" placeholder="${esc(kind === 'microsoft' ? 'Outlook PoliMi' : k.name)}"></label>
            ${k.note ? `<p class="faint cals-note">${icon('info')} ${k.note}</p>` : ''}
            <div class="foot"><button class="ghost" id="cal-back">${icon('chevLeft')} Indietro</button><span class="grow"></span><button class="primary" id="cal-go">Collega</button></div>`;
        if ($('#cal-site', box)) $('#cal-site', box).onclick = () => api.openExternal(k.url);
        $('#cal-back', box).onclick = drawList;
        $('#cal-src', box).focus();
        $('#cal-go', box).onclick = () => guard(async () => {
            const src = $('#cal-src', box).value.trim();
            if (!src) return toast('Incolla prima il link del calendario');
            const b = $('#cal-go', box); b.disabled = true; b.innerHTML = '<span class="spin"></span> Collego…';
            try {
                const f = await api.cal.addFeed({ src, name: $('#cal-nm', box).value.trim(), kind: kind === 'ics' ? '' : kind });
                changed = true; toast(`«${f.name}» collegato: ${f.count} eventi`); drawList();
            } finally { if (b.isConnected) { b.disabled = false; b.textContent = 'Collega'; } }
        });
    };
    const drawMac = async () => {
        box.innerHTML = `<h2>${icon('calendar')} Calendari del Mac</h2>
            <p class="muted" style="margin-top:0">PoliDesk legge i calendari dell'app <b>Calendario</b>: iCloud, Google ed <b>Exchange del Politecnico</b> se li hai aggiunti in Impostazioni di Sistema → Account Internet. Nessun link da copiare, solo lettura.</p>
            <div id="mac-body"><p class="faint"><span class="spin"></span> Controllo il permesso…</p></div>
            <div class="foot"><button class="ghost" id="cal-back">${icon('chevLeft')} Indietro</button><span class="grow"></span><button class="primary" id="mac-go" disabled>Collega i selezionati</button></div>`;
        $('#cal-back', box).onclick = drawList;
        const body = $('#mac-body', box);
        const st = await api.cal.macStatus();
        const list = async () => {
            body.innerHTML = '<p class="faint"><span class="spin"></span> Leggo i calendari… (la prima volta macOS chiede il permesso)</p>';
            let cals;
            try { cals = await api.cal.macCalendars(); }
            catch (e) { body.innerHTML = `<div class="note-line err">${icon('alert')} <span class="grow">${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span></div>`; return; }
            const have = new Set((await api.cal.feeds()).flatMap(f => f.macIds || []));
            const by = {};
            for (const c of cals) (by[c.account] = by[c.account] || []).push(c);
            body.innerHTML = Object.entries(by).map(([acc, cs]) => `<div class="cals-acc">${esc(acc)}</div>${cs.map(c => `<label class="tch"><input type="checkbox" value="${esc(c.id)}" ${have.has(c.id) ? 'disabled checked' : ''}><i class="cals-dot" style="background:${esc(c.color || 'var(--faint)')}"></i><b>${esc(c.title)}</b>${have.has(c.id) ? '<span class="faint">già collegato</span>' : ''}</label>`).join('')}`).join('') || '<p class="faint">Nessun calendario nell\'app Calendario.</p>';
            const sel = () => $$('input:not([disabled]):checked', body).map(i => cals.find(c => c.id === i.value));
            $$('input', body).forEach(i => i.onchange = () => { $('#mac-go', box).disabled = !sel().length; });
            $('#mac-go', box).onclick = () => guard(async () => {
                const b = $('#mac-go', box); b.disabled = true; b.innerHTML = '<span class="spin"></span> Collego…';
                for (const c of sel()) await api.cal.addFeed({ kind: 'mac', macIds: [c.id], name: c.title, color: c.color });
                changed = true; toast('Calendari del Mac collegati'); drawList();
            });
        };
        if (st.status === 3) return list();
        body.innerHTML = st.status === 2 || st.status === 1
            ? `<div class="note-line warn">${icon('alert')} <span class="grow">PoliDesk non ha il permesso di leggere i calendari. Consentilo in Impostazioni di Sistema → Privacy e sicurezza → Calendari, poi torna qui.</span><button class="small" id="mac-retry">Riprova</button></div>`
            : `<p>La prima volta macOS ti chiede se PoliDesk può accedere ai calendari: rispondi <b>Consenti</b>.</p><button class="primary" id="mac-ask">${icon('calendar')} Mostra i miei calendari</button>`;
        if ($('#mac-ask', body)) $('#mac-ask', body).onclick = list;
        if ($('#mac-retry', body)) $('#mac-retry', body).onclick = drawMac;
    };
    await drawList();
    if (adding) $('.cals-h', box).scrollIntoView({ block: 'nearest' });
}

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
    const [w, cal] = await Promise.all([
        api.ws.get(c.id),
        api.cal.events(new Date().toISOString(), new Date(Date.now() + 14 * 864e5).toISOString()),
    ]);
    const next = cal.events.filter(e => e.courseId === c.id).slice(0, 4);
    const recent = c.recordings.slice().sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || '')).slice(0, 4);
    const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
    el.innerHTML = `<div class="ov">
        <div class="ov-main">
            <div class="block"><div class="block-h"><b>Pagina del corso</b><span class="faint" id="pg-st"></span><span class="grow"></span><button class="small ghost" id="pg-edit">Modifica</button></div>
                <div id="pg-view" class="md md-doc">${w.page ? PoliEditor.renderMarkdown(w.page) : '<p class="faint">Scrivi qui obiettivi, info d\'esame, link utili… (Markdown con formule $…$)</p>'}</div>
                <div id="pg-ed" class="pg-ed hidden"></div></div>
            <div class="block"><div class="block-h"><b>Da fare</b><span class="faint">${w.todos.filter(t => !t.done).length} aperte</span></div>
                ${todoComposer(c.id, false)}<div class="todo-list">${w.todos.filter(t => !t.done).map(t => todoRow(t)).join('')}${w.todos.filter(t => t.done).slice(-3).map(t => todoRow(t)).join('')}</div></div>
            <div class="block"><div class="block-h"><b>Ultime lezioni</b><span class="grow"></span><a data-tab="lezioni">Tutte →</a></div>
                <div class="cards">${recent.map(r => `<div class="mini" data-key="${esc(r.key)}"><div class="faint">${esc(fmtDate(r.isoDate))} · ${esc(r.teacher || r.type || '')}</div><b>${esc(r.displayTitle)}</b>${r.summary ? `<div class="sum">${esc(r.summary)}</div>` : ''}</div>`).join('') || '<p class="faint">Nessuna lezione ancora.</p>'}</div></div>
        </div>
        <div class="ov-side">
            <div class="block"><div class="block-h"><b>Prossime lezioni</b></div>${next.map(e => `<div class="ev"><b>${new Date(e.start).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</b> ${new Date(e.start).toTimeString().slice(0, 5)}<div class="faint">${esc((e.location || '').split('(')[0])}</div></div>`).join('') || '<p class="faint">Importa l\'orario dal Calendario.</p>'}</div>
            <div class="block pn-block" id="ov-pn"></div>
            <div class="block"><div class="block-h"><b>Tempo di studio</b></div><div class="stats2"><div><b>${fmtMin(w.stats.today)}</b><span>oggi</span></div><div><b>${fmtMin(w.stats.week)}</b><span>7 giorni</span></div><div><b>${w.stats.sessions}</b><span>sessioni</span></div></div>
                <button class="small ghost" id="ov-pomo">${icon('timer')} Studia con il timer</button></div>
        </div></div>`;
    if (window.PnUI) PnUI.overview(c, $('#ov-pn', el));
    wireTodos(el, () => window.tabOverview(c, el), c.id);
    $$('[data-tab]', el).forEach(a => a.onclick = () => go({ ...route, tab: a.dataset.tab }));
    $$('.mini', el).forEach(m => m.onclick = () => go({ name: 'recording', courseId: c.id, key: m.dataset.key, back: 'panoramica' }));
    $('#ov-pomo', el).onclick = () => openFocusSheet(c.id);
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
    const [clouds, apps, searchSt, assist] = await Promise.all([api.cloud.detect(), api.integrations.apps(), api.search.status(), api.assistant.info()]);
    const integ = (key, name, desc, detected) => field(name, desc + (detected === undefined || detected ? '' : ` <span class="pill warn">non rilevata su questo computer</span>`), sw('x-int-' + key, !!(s.integrations || {})[key]));
    const av = S.tools.ai, cur = s.ai.provider;
    const providerWarn = av[cur] && av[cur].path ? '' : field('Strumento AI', '', `<span class="pill err">${esc((av[cur] || {}).label || cur)} non è installato su questo computer</span><span class="faint">${Object.values(av).some(x => x.path) ? 'verrà usato ' + esc(Object.values(av).find(x => x.path).label) : 'installa Antigravity CLI, Claude Code, GitHub Copilot CLI, ChatGPT Codex CLI o OpenCode (vedi sopra)'}</span>`);
    const cl = s.cloud || {}, it = s.integrations || {};
    const box = $('#s-extra', v);
    box.innerHTML = `
    <div class="group" data-pane="trascrizione"><h3>Motore e pulizia</h3>
        ${hw.hw.appleSilicon ? field('Motore', 'Whisper large-v3-turbo: più accurato, punteggiatura migliore. Parakeet (NVIDIA, lo stesso usato da Handy): ~2× più veloce, trascrive in modo letterale (le esitazioni vengono poi rimosse dalla pulizia).', `<div class="seg" id="x-eng"><button data-v="mlx" class="${s.transcription.engine !== 'parakeet' ? 'on' : ''}">Whisper</button><button data-v="parakeet" class="${s.transcription.engine === 'parakeet' ? 'on' : ''}">Parakeet</button></div>`) : ''}
        ${field('Pulizia automatica', 'Rimuove ehm, mmm, uh, balbettii e frasi inventate da Whisper nei silenzi. Gli originali restano in trascrizioni/.orig', sw('x-clean', s.transcription.clean !== false))}
    </div>
    <div class="group" data-pane="appunti"><h3>Appunti</h3>
        ${field('Formato predefinito', 'Per i nuovi appunti (puoi sempre crearne di altri tipi)', `<div class="seg" id="x-mode">${[['markdown', 'Markdown'], ['latex', 'LaTeX'], ['typst', 'Typst']].map(([k, l]) => `<button data-v="${k}" class="${(s.editor.mode || 'markdown') === k ? 'on' : ''}">${l}</button>`).join('')}</div>`)}
        ${field('Motore LaTeX', 'Tectonic (MIT): scarica i pacchetti TeX al primo uso', engines.tectonic ? `<span class="pill ok">${esc(engines.tectonic)}</span>` : '<button id="x-tex">Installa</button>')}
        ${field('Motore Typst', 'Typst (Apache-2.0)', engines.typst ? `<span class="pill ok">${esc(engines.typst)}</span>` : '<button id="x-typ">Installa</button>')}
        ${field('Cartella appunti generali', 'Gli appunti dei corsi stanno in <cartella corso>/appunti', `<input id="x-nroot" value="${esc(s.notesRoot || '')}" placeholder="~/Documents/PoliDesk Appunti"><button id="x-nroot-pick">Sfoglia…</button>`)}
    </div>
    <div class="group" data-pane="pomodoro"><h3>Impostazioni predefinite</h3>
        <p class="pf-note">Valgono per le nuove sessioni: quando ne avvii una puoi cambiarle, e la scelta diventa la nuova predefinita.</p>
        ${field('Focus', 'Durata di ogni blocco di studio', `<input id="x-pf" type="number" min="1" max="240" style="width:70px" value="${Pomo.cfg().focus}"><span class="muted">min</span>`)}
        ${field('Pausa breve · lunga', '', `<input id="x-ps" type="number" min="1" max="60" style="width:70px" value="${Pomo.cfg().short}"><input id="x-pl" type="number" min="1" max="90" style="width:70px" value="${Pomo.cfg().long}"><span class="muted">min</span>`)}
        ${field('Pausa lunga ogni', '', `<input id="x-pe" type="number" min="2" max="12" style="width:70px" value="${Pomo.cfg().every}"><span class="muted">blocchi</span>`)}
        ${field('Blocchi per sessione', '0 = finché non la termini tu', `<input id="x-pc" type="number" min="0" max="20" style="width:70px" value="${Pomo.cfg().cycles}">`)}
    </div>
    <div class="group" data-pane="pomodoro"><h3>Comportamento</h3>
        ${field('Avvia le pause da solo', '', sw('x-pab', Pomo.cfg().autoBreak))}
        ${field('Avvia il blocco successivo da solo', 'Altrimenti aspetta che premi Riprendi', sw('x-paf', Pomo.cfg().autoFocus))}
        ${field('Suono alla fine', '', sw('x-psnd', Pomo.cfg().sound))}
        ${field('Nuova sessione', 'Il timer compare in alto a destra finché la sessione è attiva · ⌘⇧T avvia o mette in pausa', '<button id="x-pnew">Inizia…</button>')}
    </div>
    <div class="group" data-pane="cloud"><h3>Sincronizzazione cloud</h3>
        ${field('Sincronizza appunti e impostazioni', 'Appunti, pagine dei corsi, attività, impostazioni ed elenco corsi vengono salvati in una cartella cloud e ritrovati sugli altri computer. Video, trascrizioni e materiale restano in locale.', sw('x-cl-on', cl.enabled))}
        ${field('Cartella cloud', clouds.length ? 'Rilevate su questo computer' : 'Nessuna cartella cloud trovata: installa iCloud Drive o Google Drive per desktop, oppure scegli una cartella sincronizzata', `<select id="x-cl-where" style="width:auto">${clouds.map(c => `<option value="${esc(c.path)}" data-p="${c.id}" ${cl.path === c.path ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__custom" ${cl.path && !clouds.some(c => c.path === cl.path) ? 'selected' : ''}>Altra cartella…</option></select><span class="faint" id="x-cl-path">${esc(cl.path ? cl.path + '/PoliDesk' : '')}</span>`)}
        ${cl.enabled ? field('Stato', '', `<span class="pill ok">☁ attiva</span><span class="faint">${cl.lastPushed ? 'ultimo invio ' + new Date(cl.lastPushed).toLocaleString('it-IT') : ''}</span><span class="grow"></span><button id="x-cl-pull">Aggiorna ora</button>`) : ''}
    </div>
    <div class="group" data-pane="ai"><h3>Ricerca e pagine dei corsi</h3>
        ${field('Descrizione del corso automatica', 'La «Pagina del corso» viene scritta e aggiornata dall\'AI dai sommari delle lezioni (finché non la modifichi tu)', sw('x-ai-page', s.ai.autoCoursePage !== false))}
        ${field('Ricerca semantica', 'Cerca per significato in lezioni, appunti e slide (anche tra lingue diverse). Tutto in locale.', `<span class="pill ${searchSt.ready ? 'ok' : 'warn'}">${searchSt.ready ? Object.values(searchSt.counts).reduce((a, b) => a + b, 0) + ' frammenti indicizzati' : 'non installata'}</span><span class="grow"></span>${searchSt.ready ? '<button id="x-idx">Aggiorna indice</button>' : '<button class="primary" id="x-sinst">Installa (~250 MB)</button>'}`)}
        ${providerWarn}
    </div>
    <div class="group" data-pane="appunti"><h3>Esporta in altre app</h3>
        <p class="pf-note">Attiva le app in cui vuoi esportare gli appunti: compariranno nel menu «Esporta» di ogni appunto. L'esportazione in PDF è sempre disponibile.</p>
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
    <div class="group" data-pane="ai"><h3>Assistenti AI e automazioni</h3>
        ${field('Assistenti AI (MCP)', 'Permette a Claude Code, Claude Desktop o altri assistenti compatibili MCP di usare PoliDesk: leggere lezioni, trascrizioni e note, cercare, creare appunti e attività, vedere orario e aule libere.', sw('x-mcp', !!it.assistant))}
        <div id="x-mcp-cfg" class="${it.assistant ? '' : 'hidden'}">
            ${field('Claude Code', assist.claudeInstalled ? 'Registra PoliDesk come server MCP per tutti i tuoi progetti' : 'Esegui il comando nel terminale dopo aver installato Claude Code', `${assist.claudeInstalled ? '<button class="primary" id="x-mcp-add">Aggiungi a Claude Code</button>' : ''}<button id="x-mcp-cc">⧉ Copia comando</button>`)}
            ${field('Claude Desktop e altri', 'Incolla in claude_desktop_config.json (o nella configurazione MCP del tuo assistente)', '<button id="x-mcp-json">⧉ Copia JSON</button>')}
            ${field('Riga di comando', 'Per i tuoi script: polidesk lessons, transcript, search, ask, notes, todo, rooms… (--json per l\'output strutturato)', '<button id="x-cli">⧉ Copia alias</button>')}
            <pre class="mcp-snip">${esc(assist.claudeCode)}</pre>
        </div>
    </div>
    <div class="group" data-pane="info"><h3>Informazioni</h3>
        ${field(`${esc(about.name)} ${esc(about.version)}`, `Electron ${esc(about.electron)} · ${esc(about.platform)} · dati in ${esc(about.dataDir)}`, '<button id="x-upd">Controlla aggiornamenti</button>')}
        ${field('Gratis e open source', 'PoliDesk è gratuito per tutti gli studenti. Se ti è utile, puoi offrire un caffè allo sviluppatore ☕', about.donateUrl ? '<button class="primary" id="x-coffee">☕ Buy me a coffee</button>' : '<span class="faint">link donazioni non configurato</span>')}
        ${field('Licenze e crediti', 'Software libero GPL-3.0-or-later · progetti della community PoliNetwork e componenti di terze parti', '<button id="x-notice">Mostra</button>')}
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
        if (!confirm(`Attivare la sincronizzazione in:\n${p}/PoliDesk ?\n\nGli appunti esistenti vengono copiati (gli originali restano dove sono).`)) { e.target.checked = false; return; }
        await applyCloud(true, p);
    });
    $('#x-cl-where', box).onchange = () => guard(async () => { if (!cl.enabled) return; const p = await pickCloudPath(); if (p) await applyCloud(true, p); });
    if ($('#x-cl-pull', box)) $('#x-cl-pull', box).onclick = () => guard(async () => { const r = await api.cloud.pull(); toast(r.changed ? `Aggiornato da ${r.from}` : 'Già aggiornato'); refresh(); });
    // integrations (opt-in)
    const saveIt = () => saveX({ integrations: { ...(S.settings.integrations || {}), notionToken: $('#x-nt', box).value.trim(), notionParent: $('#x-np', box).value.trim(), ...Object.fromEntries(['notion', 'applenotes', 'goodnotes', 'notability', 'obsidian'].map(k => [k, $('#x-int-' + k, box).checked])) } });
    ['notion', 'applenotes', 'goodnotes', 'notability', 'obsidian'].forEach(k => $('#x-int-' + k, box).onchange = () => { if (k === 'notion') $('#x-notion-cfg', box).classList.toggle('hidden', !$('#x-int-notion', box).checked); saveIt(); });
    $('#x-nt', box).onchange = saveIt; $('#x-np', box).onchange = saveIt;
    $('#x-ntest', box).onclick = () => guard(async () => { await saveIt(); const t = await api.integrations.testNotion($('#x-nt', box).value.trim(), $('#x-np', box).value.trim()); toast(`Notion collegato ✓ (pagina «${t}»)`, 4000); });
    // assistants (MCP) + CLI
    $('#x-mcp', box).onchange = e => guard(async () => { await saveX({ integrations: { ...(S.settings.integrations || {}), assistant: e.target.checked } }); $('#x-mcp-cfg', box).classList.toggle('hidden', !e.target.checked); });
    const cp = (id, txt, msg) => { const b = $(id, box); if (b) b.onclick = () => guard(async () => { await api.copy(txt); toast(msg); }); };
    cp('#x-mcp-cc', assist.claudeCode, 'Comando copiato: incollalo nel terminale');
    cp('#x-mcp-json', assist.json, 'Configurazione JSON copiata');
    cp('#x-cli', assist.cli, 'Alias copiato: aggiungilo a ~/.zshrc o ~/.bashrc');
    if ($('#x-mcp-add', box)) $('#x-mcp-add', box).onclick = () => guard(async () => { await api.assistant.addClaude(); toast('PoliDesk aggiunto a Claude Code ✓ — prova a chiedere «quali lezioni ho questa settimana?»', 6000); });
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
    const pomo = () => saveX({ pomodoro: { ...(S.settings.pomodoro || {}), focus: +$('#x-pf', box).value || 25, short: +$('#x-ps', box).value || 5, long: +$('#x-pl', box).value || 15, every: +$('#x-pe', box).value || 4, cycles: Math.max(0, +$('#x-pc', box).value || 0), autoBreak: $('#x-pab', box).checked, autoFocus: $('#x-paf', box).checked, sound: $('#x-psnd', box).checked } });
    ['#x-pf', '#x-ps', '#x-pl', '#x-pe', '#x-pc', '#x-pab', '#x-paf', '#x-psnd'].forEach(id => $(id, box).onchange = pomo);
    $('#x-pnew', box).onclick = () => openFocusSheet();
    if ($('#x-coffee', box)) $('#x-coffee', box).onclick = () => api.openExternal(about.donateUrl);
    $('#x-upd', box).onclick = () => guard(async () => { const u = await api.checkUpdate(); if (u) { if (confirm(`È disponibile la versione ${u.version}. Aprire la pagina di download?`)) api.openExternal(u.url); } else toast(about.repo ? 'Hai l\'ultima versione' : 'Repository per gli aggiornamenti non configurato'); });
    $('#x-notice', box).onclick = () => guard(async () => { const t = await api.notice(); const m = document.createElement('div'); $('#modal-root').innerHTML = `<div class="modal-bg"><div class="modal wide"><div class="md">${PoliEditor.renderMarkdown(t)}</div><div class="foot"><button class="primary" id="nt-x">Chiudi</button></div></div></div>`; $('#nt-x').onclick = () => $('#modal-root').innerHTML = ''; });
    if (typeof prefsLayout === 'function') prefsLayout(v);
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
