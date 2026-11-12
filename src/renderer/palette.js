'use strict';
/* Keyboard layer: one command registry shared by the command palette, the global shortcuts and the
   shortcut cheat sheet (?). Uses globals from app.js / views.js / ai-ui.js. */

const IS_MAC = /mac/i.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
// "mod+shift+k" → <kbd>⌘</kbd><kbd>⇧</kbd><kbd>K</kbd>;  "g d" → <kbd>G</kbd> <kbd>D</kbd>
const KEY_LABEL = { mod: MOD, shift: '⇧', alt: IS_MAC ? '⌥' : 'Alt', ctrl: IS_MAC ? '⌃' : 'Ctrl', enter: '↵', esc: 'Esc', up: '↑', down: '↓', left: '←', right: '→', space: 'Spazio', tab: 'Tab', backslash: '\\' };
const kbd = keys => keys ? keys.split(' ').map(chord => chord.split('+').map(k => `<kbd>${esc(KEY_LABEL[k] || k.toUpperCase())}</kbd>`).join('')).join('<span class="kthen">poi</span>') : '';
document.querySelectorAll('kbd.mod').forEach(k => { k.innerHTML = `<kbd>${MOD}</kbd><kbd>${k.textContent}</kbd>`; k.classList.replace('mod', 'kgroup'); });

const typing = () => { const a = document.activeElement; return a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable); };
const modalOpen = () => !!($('#modal-root').innerHTML.trim() || $('#palette'));
const clickIf = sel => () => { const b = $(sel); if (b) b.click(); else toast('Non disponibile in questa pagina'); };

// ═════════════ actions shared by palette + shortcuts ═════════════
async function newNote(kind) {
    if (route.name === 'notes' && Notes.create && !kind) return Notes.create(Notes.scope);
    const scope = route.courseId || (route.name === 'notes' ? route.scope : null) || null;
    let title, k = kind;
    if (k) { title = await askText(`Nuovo appunto ${KIND_LABEL[k]}`, { placeholder: 'Titolo', ok: 'Crea' }); if (title === null) return; }
    else { const r = await askNewNote('markdown'); if (!r) return; title = r.title; k = r.kind; }
    const f = await api.notes.create(scope, title.trim() || 'Senza titolo', k);
    go({ name: 'notes', scope, file: f, kind: k });
}
function toggleActivity(force) {
    const f = $('#activity'), open = force ?? !f.classList.contains('open');
    f.classList.toggle('open', open); if (open) f.classList.remove('idle');
}
function toggleTheme() {
    const ui = S.settings.ui || {};
    const dark = ui.appearance === 'dark' || (ui.appearance !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark'; setUi({ appearance: next }); api.setAppearance(next);
}
function setUi(patch) { S.settings.ui = { ...(S.settings.ui || {}), ...patch }; applyUi(); api.saveSettings({ ui: S.settings.ui }); }
function goSettings(pane) {
    try { localStorage.setItem('prefsPane', pane); } catch (e) { }
    $('#view').dataset.view = '';
    go({ name: 'settings', pane });
}
const COURSE_TABS = ['panoramica', 'lezioni', 'materiale'];
function cycleTab(d) {
    if (route.name !== 'course') return false;
    const i = COURSE_TABS.indexOf(route.tab || 'panoramica');
    go({ ...route, tab: COURSE_TABS[(i + d + COURSE_TABS.length) % COURSE_TABS.length] });
    return true;
}
function focusPageSearch() {
    const el = $('#view').querySelector('#sq, .search-bar input, .ns-search input, .t-bar input, input.search, input[type=search]');
    if (el) { el.focus(); el.select && el.select(); return true; }
    return false;
}
const nthCourse = n => S.courses[n - 1];

// ═════════════ command registry ═════════════
// id: stable (recents) · g: group · label · icon · keys: shortcut shown (and matched by the global handler when `key` is set)
// when(): only in some pages · ctx: shown in the "In questa pagina" group
function commands() {
    const nav = (id, label, r, icon, keys, kw = '') => ({ id, g: 'Vai a', label, icon, keys, kw, run: () => go(r) });
    const cmds = [
        nav('go.dashboard', 'Dashboard', { name: 'dashboard' }, 'home', 'mod+alt+1', 'home inizio'),
        nav('go.notes', 'Appunti', { name: 'notes' }, 'note', 'mod+alt+2', 'note'),
        nav('go.calendar', 'Calendario', { name: 'calendar' }, 'calendar', 'mod+alt+3', 'orario settimana'),
        nav('go.rooms', 'Aule libere', { name: 'rooms' }, 'pin', 'mod+alt+4', 'aule stanze'),
        nav('go.todos', 'Da fare', { name: 'todos' }, 'check', 'mod+alt+5', 'todo attività'),
        nav('go.search', 'Cerca nelle lezioni', { name: 'search' }, 'search', 'mod+shift+f', 'ricerca semantica trova'),
        // nav('go.community', 'Community', { name: 'community' }, 'users', '', ''),   // Community page hidden for now
        nav('go.settings', 'Impostazioni', { name: 'settings' }, 'settings', 'mod+,', 'preferenze opzioni'),
        { id: 'nav.back', g: 'Vai a', label: 'Indietro', icon: 'back', keys: 'mod+[', kw: 'back', run: goBack },
        { id: 'nav.fwd', g: 'Vai a', label: 'Avanti', icon: 'forward', keys: 'mod+]', kw: 'forward', run: goForward },

        ...S.courses.flatMap((c, i) => [
            { id: 'course:' + c.id, g: 'Corsi', label: cname(c), icon: 'book', keys: i < 9 ? `mod+${i + 1}` : '', kw: 'corso ' + (c.manifest.course ? c.manifest.course.fullname : ''), course: true, run: () => go({ name: 'course', courseId: c.id, tab: 'panoramica' }) },
            { id: 'course.lez:' + c.id, g: 'Corsi', label: `${cname(c)} › Lezioni`, icon: 'video', kw: 'registrazioni video', course: true, run: () => go({ name: 'course', courseId: c.id, tab: 'lezioni' }) },
            { id: 'course.mat:' + c.id, g: 'Corsi', label: `${cname(c)} › Materiale`, icon: 'folder', kw: 'slide pdf', course: true, run: () => go({ name: 'course', courseId: c.id, tab: 'materiale' }) },
        ]),

        { id: 'note.new', g: 'Appunti', label: 'Nuovo appunto…', icon: 'plus', keys: 'mod+n', kw: 'crea nota', run: () => newNote() },
        ...['markdown', 'latex', 'typst'].map(k => ({ id: 'note.new.' + k, g: 'Appunti', label: `Nuovo appunto ${KIND_LABEL[k]}`, icon: 'plus', kw: 'crea nota', run: () => newNote(k) })),

        { id: 'sync.all', g: 'Azioni', label: 'Sincronizza tutti i corsi', icon: 'refresh', keys: 'mod+shift+s', kw: 'sync scarica aggiorna', run: () => { api.sync(); toast('Sincronizzazione avviata'); } },
        ...S.courses.map(c => ({ id: 'sync:' + c.id, g: 'Azioni', label: `Sincronizza ${cname(c)}`, icon: 'refresh', kw: 'sync', run: () => api.sync([c.id]) })),
        ...S.courses.map(c => ({ id: 'page:' + c.id, g: 'Azioni', label: `Rigenera descrizione di ${cname(c)}`, icon: 'sparkles', kw: 'ai pagina corso', run: async () => { await api.genCoursePage(c.id); toast('In coda all\'AI'); } })),
        { id: 'ai.backfill', g: 'Azioni', label: 'Applica le funzioni AI alle lezioni già trascritte', icon: 'sparkles', kw: 'sommari appunti backfill', run: async () => { const n = await api.aiBackfill(); toast(n ? `${n} attività AI in coda` : 'Niente da fare'); } },
        { id: 'search.index', g: 'Azioni', label: 'Aggiorna indice di ricerca', icon: 'search', kw: 'search index', run: async () => { toast('Indicizzo…'); await api.search.index(); toast('Indice aggiornato'); } },
        { id: 'cal.sync', g: 'Azioni', label: 'Aggiorna orario delle lezioni', icon: 'calendar', kw: 'calendario timetable', run: async () => { await api.cal.sync(); toast('Orario aggiornato'); } },
        { id: 'pomo.new', g: 'Focus', label: 'Focus: nuova sessione…', icon: 'timer', kw: 'pomodoro timer studio', run: () => openFocusSheet() },
        { id: 'pomo.toggle', g: 'Focus', label: !Pomo.active ? 'Focus: avvia con le impostazioni predefinite' : Pomo.st.running ? 'Focus: pausa' : 'Focus: riprendi', icon: Pomo.st.running ? 'pause' : 'play', keys: 'mod+shift+t', kw: 'pomodoro timer', run: () => Pomo.toggle() },
        ...(Pomo.active ? [{ id: 'pomo.plus', g: 'Focus', label: 'Focus: aggiungi 5 minuti', icon: 'plus', kw: 'pomodoro timer', run: () => Pomo.addMinutes(5) }, { id: 'pomo.stop', g: 'Focus', label: 'Focus: termina la sessione', icon: 'reset', kw: 'pomodoro timer stop', run: () => Pomo.stop() }] : []),

        { id: 'ui.sidebar', g: 'Vista', label: 'Mostra/nascondi barra laterale', icon: 'sidebar', keys: 'mod+backslash', kw: 'sidebar', run: () => window.toggleSidebar(!$('#app').classList.contains('sb-collapsed')) },
        { id: 'ui.activity', g: 'Vista', label: 'Mostra/nascondi registro attività', icon: 'terminal', keys: 'mod+j', kw: 'log attività console', run: () => toggleActivity() },
        { id: 'ui.dark', g: 'Vista', label: 'Alterna chiaro / scuro', icon: 'sun', keys: 'mod+shift+l', kw: 'tema dark light notte', run: toggleTheme },
        { id: 'ui.auto', g: 'Vista', label: 'Aspetto: come il sistema', icon: 'sun', kw: 'auto tema', run: () => { setUi({ appearance: 'auto' }); api.setAppearance('auto'); } },
        { id: 'ui.theme', g: 'Vista', label: (S.settings.ui || {}).theme === 'developer' ? 'Tema: Normale' : 'Tema: Developer', icon: 'sun', kw: 'theme mono apple', run: () => setUi({ theme: (S.settings.ui || {}).theme === 'developer' ? 'normal' : 'developer' }) },
        { id: 'ui.font', g: 'Vista', label: (S.settings.ui || {}).font === 'jetbrains' ? 'Font: Sistema' : 'Font: JetBrains Mono', icon: 'sun', kw: 'font carattere', run: () => setUi({ font: (S.settings.ui || {}).font === 'jetbrains' ? 'system' : 'jetbrains' }) },
        { id: 'ui.keys', g: 'Vista', label: 'Scorciatoie da tastiera', icon: 'keyboard', keys: '?', kw: 'shortcut tasti aiuto help', run: showShortcuts },

        ...PREF_PANES.map(([k, l, ic]) => ({ id: 'set:' + k, g: 'Impostazioni', label: `Impostazioni › ${l}`, icon: ic, kw: { trascrizione: 'whisper motore', ai: 'assistente provider modello crediti', appunti: 'latex typst markdown notion goodnotes obsidian esporta', pomodoro: 'pomodoro timer', cloud: 'icloud drive', aspetto: 'tema font scuro', componenti: 'chrome browser python installa', generale: 'email cartella account' }[k] || '', run: () => goSettings(k) })),
    ];

    // context: commands for the current page
    const here = [];
    if (route.name === 'course') {
        const c = course(route.courseId);
        if (c) here.push(
            ...COURSE_TABS.filter(t => t !== (route.tab || 'panoramica')).map(t => ({ id: 'tab:' + t, label: `Scheda ${t[0].toUpperCase() + t.slice(1)}`, icon: 'forward', kw: 'tab', run: () => go({ ...route, tab: t }) })),
            { id: 'here.sync', label: `Sincronizza ${cname(c)}`, icon: 'refresh', kw: 'sync', run: () => api.sync([c.id]) },
            { id: 'here.note', label: `Nuovo appunto per ${cname(c)}`, icon: 'plus', keys: 'mod+n', kw: 'nota', run: () => newNote() },
            { id: 'here.agent', label: 'Agente AI sul corso', icon: 'sparkles', kw: 'chat', run: () => openAgent(c) },
            { id: 'here.notesai', label: 'Note AI di tutte le lezioni', icon: 'sparkles', kw: 'note', run: () => go({ name: 'course', courseId: c.id, tab: 'note' }) },
            { id: 'here.settings', label: 'Impostazioni del corso', icon: 'settings', kw: 'docente password link', run: () => go({ name: 'course', courseId: c.id, tab: 'impostazioni' }) },
            { id: 'here.folder', label: 'Apri la cartella del corso', icon: 'folder', kw: 'finder', run: () => api.open(c.id, 'root') });
    }
    const la = (k, fallback) => () => window.lessonCmd && window.lessonCmd[k] ? window.lessonCmd[k]() : fallback && fallback();
    if (route.name === 'recording') here.push(
        { id: 'rec.play', label: 'Play / pausa', icon: 'play', keys: 'space', kw: 'video', run: () => player && (player.paused ? player.play() : player.pause()) },
        { id: 'rec.next', label: 'Lezione successiva', icon: 'chevRight', keys: ']', kw: 'next avanti', run: la('next') },
        { id: 'rec.prev', label: 'Lezione precedente', icon: 'chevLeft', keys: '[', kw: 'prev indietro', run: la('prev') },
        { id: 'rec.course', label: 'Torna al corso', icon: 'back', kw: 'lezioni', run: () => go({ name: 'course', courseId: route.courseId, tab: route.back || 'lezioni' }) },
        { id: 'rec.copy', label: 'Copia la trascrizione', icon: 'copy', kw: 'testo', run: clickIf('#t-copy') },
        { id: 'rec.sum', label: 'Genera sommario con l\'AI', icon: 'sparkles', kw: 'riassunto', run: la('sum') },
        { id: 'rec.tr', label: 'Trascrivi la lezione', icon: 'mic', kw: 'whisper', run: la('tr') },
        { id: 'rec.full', label: 'Schermo intero', icon: 'expand', keys: 'f', kw: 'fullscreen', run: clickIf('#p-full') },
        { id: 'rec.theater', label: 'Modalità cinema', icon: 'theater', keys: 't', kw: 'theater teatro grande', run: clickIf('#p-theater') },
        { id: 'rec.cc', label: 'Trascrizione sotto il video a schermo intero', icon: 'captions', keys: 'c', kw: 'sottotitoli testo fullscreen', run: clickIf('#p-cc') },
        { id: 'rec.popout', label: 'Modalità appunti (lezione in una finestra separata)', icon: 'popout', kw: 'finestra separata appunti popout', run: clickIf('#r-popout, #r-popin') },
        { id: 'rec.ext', label: 'Apri il video con l\'app di sistema', icon: 'external', kw: 'vlc quicktime', run: la('ext') },
        { id: 'rec.finder', label: 'Mostra il video nella cartella', icon: 'folder', kw: 'finder', run: la('finder') },
        { id: 'rec.info', label: 'Dettagli del file', icon: 'info', kw: 'info', run: la('details') });
    if (route.name === 'notes' && Notes.file) here.push(
        { id: 'n.files', label: 'Mostra/nascondi elenco file', icon: 'sidebar', keys: 'mod+shift+e', kw: 'files', run: () => Notes.toggleFiles && Notes.toggleFiles() },
        { id: 'n.compile', label: 'Compila', icon: 'play', keys: 'mod+enter', kw: 'pdf latex typst', run: clickIf('#ed-compile') });
    if (route.name === 'calendar') here.push(
        { id: 'cal.prev', label: 'Settimana precedente', icon: 'back', run: clickIf('#cal-prev') },
        { id: 'cal.next', label: 'Settimana successiva', icon: 'forward', run: clickIf('#cal-next') },
        { id: 'cal.today', label: 'Oggi', icon: 'calendar', run: clickIf('#cal-today') });
    here.forEach(h => { h.g = 'In questa pagina'; h.ctx = true; h.id = route.name + '.' + h.id; });
    return here.concat(cmds);
}
window.Palette = { notesCache: null };
async function noteCommands() {
    if (Palette.notesCache) return Palette.notesCache;
    const out = [];
    try { for (const sc of await api.notes.scopes()) for (const f of await api.notes.list(sc.id)) out.push({ id: `note:${sc.id}:${f.file}`, g: 'Appunti', note: true, label: f.file.replace(/\.(md|tex|typ)$/, ''), icon: 'file', hint: sc.name, kw: sc.name + ' ' + f.kind, run: () => go({ name: 'notes', scope: sc.id, file: f.file, kind: f.kind }) }); } catch (e) { }
    return (Palette.notesCache = out);
}

// ═════════════ recents (MRU) ═════════════
const Recent = {
    get() { try { return JSON.parse(localStorage.getItem('pal:recent')) || []; } catch (e) { return []; } },
    push(id) { if (!id) return; const r = [id, ...this.get().filter(x => x !== id)].slice(0, 30); try { localStorage.setItem('pal:recent', JSON.stringify(r)); } catch (e) { } },
};

// ═════════════ fuzzy match with highlight ═════════════
function match(text, q) {
    // returns {score, hits:[indices]} or null. Prefers word starts and contiguous runs.
    const t = text.toLowerCase(); q = q.toLowerCase();
    const at = t.indexOf(q);
    if (at >= 0) return { score: 100 - at + (at === 0 || /[\s›·(-]/.test(t[at - 1]) ? 40 : 0), hits: [...Array(q.length)].map((_, i) => at + i) };
    let ti = 0, score = 0, prev = -2; const hits = [];
    for (const ch of q) {
        if (ch === ' ') continue;
        const j = t.indexOf(ch, ti); if (j < 0) return null;
        score += j === prev + 1 ? 6 : (j === 0 || /[\s›·(-]/.test(t[j - 1])) ? 4 : 1;
        hits.push(j); prev = j; ti = j + 1;
    }
    return { score, hits };
}
function rank(item, q) {
    if (!q) return { score: 1, hits: [] };
    const words = q.split(/\s+/).filter(Boolean);
    const m = match(item.label, q);
    if (m) return m;
    // every word must match label or keywords (no highlight for keyword matches)
    const hay = (item.label + ' ' + (item.kw || '') + ' ' + (item.hint || '') + ' ' + (item.g || '')).toLowerCase();
    let s = 0;
    for (const w of words) { const i = hay.indexOf(w.toLowerCase()); if (i < 0) return null; s += i === 0 || hay[i - 1] === ' ' ? 8 : 3; }
    return { score: s, hits: [] };
}
const hl = (label, hits) => { if (!hits || !hits.length) return esc(label); const set = new Set(hits); return [...label].map((ch, i) => set.has(i) ? `<b>${esc(ch)}</b>` : esc(ch)).join(''); };

// ═════════════ command palette ═════════════
const MODES = { '>': { label: 'Comandi', test: i => !i.course && !i.note && i.g !== 'Vai a' }, '@': { label: 'Corsi', test: i => i.course }, '#': { label: 'Appunti', test: i => i.note }, '?': { label: 'Chiedi all\'AI', test: () => false } };
let pal = null;
function openPalette(prefill = '') {
    if (pal) { pal.close(); return; }
    const root = document.createElement('div');
    root.className = 'pal-bg'; root.id = 'palette';
    root.innerHTML = `<div class="pal" role="dialog" aria-label="Command palette">
        <div class="pal-in"><span class="pal-mode hidden" id="pal-mode"></span>${icon('search')}<input id="pal-q" role="combobox" aria-expanded="true" aria-controls="pal-list" autocomplete="off" spellcheck="false" placeholder="Cerca comandi, corsi, appunti… o fai una domanda"></div>
        <div id="pal-list" class="pal-list" role="listbox"></div>
        <div class="pal-foot"><span>${kbd('up')}${kbd('down')} muovi</span><span>${kbd('enter')} esegui</span><span>${kbd('mod+enter')} chiedi all'AI</span><span class="grow"></span>
            <button class="pal-pfx" data-p=">">&gt; comandi</button><button class="pal-pfx" data-p="@">@ corsi</button><button class="pal-pfx" data-p="#"># appunti</button><button class="pal-pfx" data-p="?">? AI</button></div></div>`;
    document.body.appendChild(root);
    const input = $('#pal-q', root), list = $('#pal-list', root);
    const prevFocus = document.activeElement;
    let all = commands(), notes = [], items = [], sel = 0, sem = [], semT = null, mouseOk = false;
    noteCommands().then(n => { notes = n; if (pal) draw(); });

    const parse = () => { const v = input.value; const m = MODES[v[0]] ? v[0] : ''; return { mode: m, q: (m ? v.slice(1) : v).trim() }; };
    const draw = () => {
        const { mode, q } = parse();
        const modeEl = $('#pal-mode', root);
        modeEl.textContent = mode ? MODES[mode].label : ''; modeEl.classList.toggle('hidden', !mode);
        const recent = Recent.get();
        const pool = all.concat(notes).filter(i => !mode || MODES[mode].test(i));
        if (!q && !mode) {
            // empty: recents, then this page, then sections
            const byId = new Map(pool.map(i => [i.id, i]));
            const rec = recent.map(id => byId.get(id)).filter(Boolean).filter(i => !i.ctx).slice(0, 5).map(i => ({ ...i, g: 'Recenti', hits: [] }));
            const seen = new Set(rec.map(i => i.id));
            items = rec.concat(pool.filter(i => i.ctx && !seen.has(i.id)), pool.filter(i => i.g === 'Vai a' && !seen.has(i.id)));
        } else {
            items = pool.map(i => { const m = rank(i, q); if (!m) return null; const r = recent.indexOf(i.id); return { ...i, hits: m.hits, s: m.score + (r >= 0 ? 20 - Math.min(r, 19) : 0) + (i.ctx ? 5 : 0) }; })
                .filter(Boolean).sort((a, b) => b.s - a.s).slice(0, mode ? 50 : 14);
            // group results while keeping best-first order of groups
            const order = []; items.forEach(i => { if (!order.includes(i.g)) order.push(i.g); });
            items = order.flatMap(g => items.filter(i => i.g === g));
        }
        if (q.length >= 3 && (!mode || mode === '?')) {
            const ask = { id: '', g: 'Cerca', label: `Chiedi all'AI: «${q}»`, icon: 'sparkles', keys: 'mod+enter', hits: [], run: () => go({ name: 'search', q, ask: true }) };
            const find = { id: '', g: 'Cerca', label: `Cerca «${q}» in lezioni, slide e appunti`, icon: 'search', hits: [], run: () => go({ name: 'search', q }) };
            items.push(...(mode === '?' ? [ask, find] : [find, ask]),
                ...sem.map(r => ({ id: '', g: 'Dalle lezioni', label: sourceLabel(r.meta), hint: (TYPE_LABEL[r.meta.type] || '') + (r.meta.courseName ? ' · ' + r.meta.courseName : ''), icon: r.meta.type === 'material' ? 'file' : r.meta.type === 'note' ? 'note' : 'video', sub: r.text.slice(0, 140), hits: [], run: () => openSource(r.meta) })));
        }
        sel = Math.min(sel, Math.max(0, items.length - 1));
        let lastG = '';
        list.innerHTML = items.map((it, i) => {
            const head = it.g !== lastG ? `<div class="pal-g" role="presentation">${esc(it.g)}</div>` : ''; lastG = it.g;
            return head + `<div class="pal-i ${i === sel ? 'on' : ''}" id="pal-o${i}" role="option" aria-selected="${i === sel}" data-i="${i}">
                <span class="pi">${icon(it.icon || 'command')}</span>
                <span class="pl">${hl(it.label, it.hits)}${it.sub ? `<span class="ps">${esc(it.sub)}</span>` : ''}</span>
                ${it.hint ? `<span class="ph">${esc(it.hint)}</span>` : ''}${it.keys ? `<span class="pk">${kbd(it.keys)}</span>` : ''}</div>`;
        }).join('') || `<div class="pal-empty">Nessun risultato${q ? ` per «${esc(q)}»` : ''}</div>`;
        input.setAttribute('aria-activedescendant', items.length ? 'pal-o' + sel : '');
        const on = $('.pal-i.on', list); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const move = d => { if (!items.length) return; sel = (sel + d + items.length) % items.length; $$('.pal-i', list).forEach((el, i) => { el.classList.toggle('on', i === sel); el.setAttribute('aria-selected', i === sel); }); input.setAttribute('aria-activedescendant', 'pal-o' + sel); const on = $('.pal-i.on', list); if (on) on.scrollIntoView({ block: 'nearest' }); };
    const close = (restore = true) => { pal = null; clearTimeout(semT); root.remove(); if (restore && prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus(); };
    const exec = i => { const it = items[i]; if (!it) return; close(false); Recent.push(it.id); guard(async () => it.run()); };
    const askAi = () => { const { q } = parse(); if (q) { close(false); go({ name: 'search', q, ask: true }); } };

    root.addEventListener('mousedown', e => { if (e.target === root) close(); });
    list.addEventListener('mousemove', e => { const el = e.target.closest('.pal-i'); if (!el || !mouseOk) { mouseOk = true; return; } if (+el.dataset.i !== sel) { sel = +el.dataset.i; move(0); } });
    list.addEventListener('click', e => { const el = e.target.closest('.pal-i'); if (el) exec(+el.dataset.i); });
    $$('.pal-pfx', root).forEach(b => b.onclick = () => { input.value = b.dataset.p + parse().q; sel = 0; draw(); input.focus(); });
    input.oninput = () => {
        sel = 0; sem = []; mouseOk = false; draw();
        clearTimeout(semT);
        const { mode, q } = parse();
        if (q.length >= 4 && (!mode || mode === '?')) semT = setTimeout(async () => { try { const r = await api.search.query(q, null, 5); if (pal && parse().q === q) { sem = r.results || []; draw(); } } catch (e) { } }, 280);
    };
    input.onkeydown = e => {
        const ctrl = e.ctrlKey && !e.metaKey;
        if (e.key === 'Escape') { e.preventDefault(); if (input.value) { input.value = ''; input.oninput(); } else close(); }
        else if (e.key === 'ArrowDown' || (ctrl && e.key === 'n') || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp' || (ctrl && e.key === 'p') || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); move(-1); }
        else if (e.key === 'PageDown') { e.preventDefault(); move(Math.min(8, items.length - 1 - sel)); }
        else if (e.key === 'PageUp') { e.preventDefault(); move(-Math.min(8, sel)); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); askAi(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (parse().mode === '?' && !items.length) askAi(); else exec(sel); }
        else if (e.key === 'Backspace' && input.value.length === 1 && MODES[input.value]) { e.preventDefault(); input.value = ''; input.oninput(); }
    };
    pal = { close };
    input.value = prefill;
    draw(); input.focus();
}
window.openPalette = openPalette;
$('#sb-search').onclick = () => openPalette();

// ═════════════ shortcut cheat sheet ═════════════
function showShortcuts() {
    if (pal) pal.close(false);
    const groups = [
        ['Generale', [['mod+k', 'Command palette (anche ⇧⌘P)'], ['?', 'Questo elenco'], ['/', 'Cerca nella pagina'], ['mod+[', 'Indietro'], ['mod+]', 'Avanti'], ['mod+backslash', 'Barra laterale'], ['mod+j', 'Registro attività'], ['mod+shift+l', 'Chiaro / scuro'], ['esc', 'Chiudi']]],
        ['Vai a', [['mod+alt+1', 'Dashboard'], ['mod+alt+2', 'Appunti'], ['mod+alt+3', 'Calendario'], ['mod+alt+4', 'Aule libere'], ['mod+alt+5', 'Da fare'], ['mod+shift+f', 'Cerca nelle lezioni'], ['mod+,', 'Impostazioni'], ['mod+1', 'Corso 1…9 (anche g poi numero)'], ['g d', 'Dashboard (anche g n, g c, g a, g t, g s, g i)']]],
        ['Azioni', [['mod+n', 'Nuovo appunto'], ['mod+shift+s', 'Sincronizza tutti i corsi'], ['mod+shift+t', 'Focus: avvia / pausa'], ['ctrl+tab', 'Scheda successiva del corso'], ['ctrl+shift+tab', 'Scheda precedente']]],
        ['Corso', [['j', 'Lezione successiva nell\'elenco'], ['k', 'Lezione precedente nell\'elenco'], ['enter', 'Apri la lezione']]],
        ['Lezione', [['space', 'Play / pausa'], ['[', 'Lezione precedente'], [']', 'Lezione successiva'], ['left', '−10 s'], ['right', '+10 s'], ['f', 'Schermo intero'], ['t', 'Modalità cinema'], ['c', 'Trascrizione a schermo intero'], ['.', 'Più veloce'], [',', 'Più lento']]],
        ['Appunti', [['mod+s', 'Salva'], ['mod+enter', 'Compila (LaTeX, Typst)'], ['mod+shift+e', 'Elenco file']]],
        ['Palette', [['>', 'Solo comandi'], ['@', 'Solo corsi'], ['#', 'Solo appunti'], ['?', 'Domanda all\'AI'], ['mod+enter', 'Chiedi all\'AI']]],
    ];
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-bg" id="ks-bg"><div class="modal wide ks" role="dialog" aria-label="Scorciatoie da tastiera"><div class="row"><h2>Scorciatoie da tastiera</h2><span class="grow"></span><button class="ghost icon" id="ks-x" aria-label="Chiudi">✕</button></div>
        <div class="ks-grid">${groups.map(([g, rows]) => `<section><h3>${g}</h3>${rows.map(([k, l]) => `<div class="ks-row"><span>${esc(l)}</span><span class="pk">${kbd(k)}</span></div>`).join('')}</section>`).join('')}</div></div></div>`;
    const done = () => { root.innerHTML = ''; document.removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopPropagation(); done(); } };
    document.addEventListener('keydown', key, true);
    $('#ks-x').onclick = done;
    $('#ks-bg').addEventListener('mousedown', e => { if (e.target.id === 'ks-bg') done(); });
}

// ═════════════ global shortcuts ═════════════
const G_ROUTES = { d: 'dashboard', n: 'notes', c: 'calendar', a: 'rooms', t: 'todos', s: 'search', i: 'settings' };
let gPending = 0;
const chordHint = on => { let el = $('#chord'); if (!el) { el = document.createElement('div'); el.id = 'chord'; el.className = 'chord'; document.body.appendChild(el); } el.innerHTML = on ? `${kbd('g')} <span class="faint">d · n · c · a · t · s · i · 1–9</span>` : ''; el.classList.toggle('show', on); };

document.addEventListener('keydown', e => {
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (pal) { if (mod && (k === 'k' || (e.shiftKey && k === 'p'))) { e.preventDefault(); pal.close(); } return; }   // palette owns its keys
    if ($('#modal-root').innerHTML.trim()) return;      // dialogs own the keyboard
    // palette — works everywhere, even inside inputs and the editor
    if (mod && (k === 'k' || (e.shiftKey && k === 'p'))) { e.preventDefault(); openPalette(); return; }
    const t = typing();

    if (mod && !e.altKey) {
        // ⌘1–9: course pages · ⌥⌘1–5: main sections (e.code: ⌥ changes e.key on macOS)
        const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (digit && !e.shiftKey && !e.altKey) { e.preventDefault(); const c = nthCourse(+digit[1]); if (c) go({ name: 'course', courseId: c.id, tab: 'panoramica' }); return; }
    }
    if (mod && e.altKey && !e.shiftKey) {
        const digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
        if (digit) { e.preventDefault(); go({ name: ['dashboard', 'notes', 'calendar', 'rooms', 'todos'][+digit[1] - 1] }); return; }
    }
    if (mod && !e.altKey) {
        if (k === ',' && !e.shiftKey) { e.preventDefault(); go({ name: 'settings' }); return; }
        if (!t && (k === '[' || e.code === 'BracketLeft') && !e.shiftKey) { e.preventDefault(); goBack(); return; }
        if (!t && (k === ']' || e.code === 'BracketRight') && !e.shiftKey) { e.preventDefault(); goForward(); return; }
        if (k === 'j' && !e.shiftKey) { e.preventDefault(); toggleActivity(); return; }
        if (k === 'n' && !e.shiftKey && route.name !== 'notes') { e.preventDefault(); guard(() => newNote()); return; }   // in notes: views.js
        if (e.shiftKey && k === 'f') { e.preventDefault(); go({ name: 'search' }); return; }
        if (e.shiftKey && k === 's') { e.preventDefault(); api.sync(); toast('Sincronizzazione avviata'); return; }
        if (e.shiftKey && k === 't') { e.preventDefault(); Pomo.toggle(); toast(Pomo.st.running ? 'Focus avviato' : 'Focus in pausa', 1500); return; }
        if (!t && e.shiftKey && k === 'l') { e.preventDefault(); toggleTheme(); return; }
    }
    if (!t && !IS_MAC && e.altKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.key === 'ArrowLeft' ? goBack() : goForward(); return; }
    if (e.ctrlKey && e.key === 'Tab') { if (cycleTab(e.shiftKey ? -1 : 1)) e.preventDefault(); return; }

    // single keys: only when not typing
    if (t || e.metaKey || e.ctrlKey || e.altKey) return;
    if (gPending) {
        clearTimeout(gPending); gPending = 0; chordHint(false);
        if (G_ROUTES[k]) { e.preventDefault(); go({ name: G_ROUTES[k] }); }
        else if (/^[1-9]$/.test(k) && nthCourse(+k)) { e.preventDefault(); go({ name: 'course', courseId: nthCourse(+k).id, tab: 'panoramica' }); }
        return;
    }
    if (k === 'g' && route.name !== 'recording') { gPending = setTimeout(() => { gPending = 0; chordHint(false); }, 1500); chordHint(true); return; }
    if (k === '?') { e.preventDefault(); showShortcuts(); return; }
    if (k === '/') { e.preventDefault(); if (!focusPageSearch()) openPalette(); return; }
}, true);

// mouse back/forward buttons
window.addEventListener('mouseup', e => { if (e.button === 3) { e.preventDefault(); goBack(); } if (e.button === 4) { e.preventDefault(); goForward(); } });

// show shortcut hints in the sidebar on hover
$$('.nav-item[data-keys]').forEach(a => { a.insertAdjacentHTML('beforeend', `<span class="nk">${kbd('mod+' + a.dataset.keys)}</span>`); });
