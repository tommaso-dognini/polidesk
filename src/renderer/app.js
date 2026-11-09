'use strict';
/* PoliRec renderer — tiny router + views rendered from state. */
const api = window.polirec;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = null;                                   // state from main process
let route = { name: 'dashboard' };              // {name, courseId?, key?, tab?, side?}
const progress = {};                            // recording key -> {percent, speed}
const tprog = {};                               // video path -> 'queued' | number | {error}
const running = new Set();                      // course ids syncing
let player = null;                              // current <video> (recording page)
let aiStream = null, aiJob = null;                            // element receiving streamed AI output

// ───────── helpers ─────────
function toast(msg, ms = 3200) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
async function guard(fn) {
    try { return await fn(); }
    catch (e) { toast('Errore: ' + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 6000); }
}
function log(msg, busy = true) {
    // the activity bar/panel (activity-ui.js) shows it with the daemon's own log
    if (window.activityLog) window.activityLog(msg, busy);
}
// ───────── icons (Lucide-style, stroke = currentColor) ─────────
const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    play: '<path d="m7 4 13 8-13 8z"/>',
    pause: '<path d="M8 4v16M16 4v16"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    forward: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    skip: '<path d="m5 4 10 8-10 8zM19 5v14"/>',
    reset: '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    chevLeft: '<path d="m15 18-6-6 6-6"/>',
    chevRight: '<path d="m9 18 6-6-6-6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
$$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

const course = id => S.courses.find(c => c.id === id);
const cname = c => c.name || (c.manifest.course && c.manifest.course.fullname) || c.input;
const vpath = (c, r) => `${c.dir}/video/${r.file}`;
const fmtT = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '';

function md(src) {
    if (window.PoliEditor && PoliEditor.renderMarkdown) { try { return PoliEditor.renderMarkdown(String(src || '')); } catch (e) { } }
    const out = []; let list = false, code = false;
    const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
    for (const l of esc(src).split('\n')) {
        if (l.startsWith('```')) { out.push(code ? '</pre>' : '<pre>'); code = !code; continue; }
        if (code) { out.push(l + '\n'); continue; }
        const li = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
        if (li && !list) { out.push('<ul>'); list = true; }
        if (!li && list) { out.push('</ul>'); list = false; }
        const h = l.match(/^(#{1,4})\s+(.*)/);
        if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
        else if (li) out.push(`<li>${inline(li[1])}</li>`);
        else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    }
    return out.join('') + (list ? '</ul>' : '') + (code ? '</pre>' : '');
}

function applyUi() {
    const ui = S.settings.ui || {};
    const h = document.documentElement;
    h.dataset.theme = ui.theme || 'normal';
    h.dataset.font = ui.font && ui.font !== 'auto' ? ui.font : '';
    h.dataset.size = ui.size || '';
}

// ───────── data / router ─────────
async function refresh() {
    S = await api.state();
    (S.transcriptionJobs || S.transcribing.map(video => ({ video, status: 'queued' }))).forEach(j => { tprog[j.video] = j.status === 'paused' ? 'paused' : j.status === 'running' ? Math.round(j.percent || 0) : 'queued'; });
    applyUi();
    render();
}
const hist = { back: [], fwd: [] };              // navigation history (⌘[ / ⌘])
const sameRoute = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function go(r, { fromHist = false } = {}) {
    if (player && r.name !== 'recording') { player.pause(); player = null; }
    if (route.name === 'notes' && window.flushNote) window.flushNote();
    if (!fromHist && route.name !== 'setup' && !sameRoute(route, r)) { hist.back.push(route); if (hist.back.length > 60) hist.back.shift(); hist.fwd.length = 0; }
    route = r; $('#view').dataset.view = ''; render(); $('#view').scrollTop = 0;
}
function goBack() { const r = hist.back.pop(); if (!r) return; hist.fwd.push(route); go(r, { fromHist: true }); }
function goForward() { const r = hist.fwd.pop(); if (!r) return; hist.back.push(route); go(r, { fromHist: true }); }

function render() {
    if (!S) return;
    if (!S.settings.setupDone && route.name !== 'setup' && !render.skippedSetup) route = { name: 'setup' };
    renderSidebar();
    const v = $('#view');
    const views = { dashboard: viewDashboard, course: viewCourse, recording: viewRecording, settings: viewSettings, setup: viewSetup, community: viewCommunity, ...(window.extraViews || {}) };
    // the recording page owns a <video>: never re-render it on state refresh, only update panels
    if (route.name === 'recording' && v.dataset.view === 'recording:' + route.key) { updateRecordingLive(); return; }
    // don't wipe forms the user is typing in
    if ((route.name === 'settings' || route.name === 'setup' || ['impostazioni', 'panoramica'].includes(route.tab) || (window.noRerender && window.noRerender.has(route.name)) || ['calendar', 'rooms', 'todos', 'search'].includes(route.name)) && v.dataset.view === viewKey()) return;
    v.dataset.view = viewKey();
    (views[route.name] || viewDashboard)(v);
}
const viewKey = () => route.name === 'recording' ? 'recording:' + route.key : route.name + ':' + (route.courseId || '') + ':' + (route.tab || '') + ':' + (route.scope || '');

function showMenu(x, y, items) {
    const m = $('#menu');
    m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<div data-i="${i}">${esc(it[0])}</div>`).join('');
    m.classList.remove('hidden');
    m.style.left = Math.max(8, Math.min(x, innerWidth - 260)) + 'px';
    m.style.top = Math.max(8, Math.min(y, innerHeight - m.offsetHeight - 10)) + 'px';
    m.onclick = ev => { const d = ev.target.closest('[data-i]'); if (!d) return; m.classList.add('hidden'); guard(items[+d.dataset.i][1]); };
    setTimeout(() => document.addEventListener('click', () => m.classList.add('hidden'), { once: true }), 0);
}

function renderSidebar() {
    if (window.Pomo) window.Pomo.draw();
    $$('.nav-item[data-route]').forEach(a => a.classList.toggle('active', route.name === a.dataset.route));
    $('#side-courses').innerHTML = S.courses.map((c, i) => {
        const recs = c.recordings, dl = recs.filter(r => r.videoExists).length;
        const ico = running.has(c.id) ? '<span class="spin"></span>' : c.drive && c.drive.missing ? icon('alert', 'warn') : c.lastError ? icon('alert', 'err') : icon('book');
        return `<a class="nav-item ${route.courseId === c.id ? 'active' : ''}" data-course="${c.id}" title="${esc(cname(c))}${i < 9 ? ` · g ${i + 1}` : ''}">
            <span class="ico">${ico}</span><span class="n">${esc(cname(c))}</span><span class="badge">${dl}/${recs.length}</span></a>`;
    }).join('') || '<div class="faint" style="padding:6px 10px">Nessun corso</div>';
    $$('#side-courses [data-course]').forEach(a => a.onclick = () => go({ name: 'course', courseId: a.dataset.course, tab: 'panoramica' }));
    const tr = Object.values(tprog).filter(x => x === 'queued' || typeof x === 'number').length;
    const eng = S.settings.transcription;
    const st = $('#side-status');
    st.title = `Whisper ${eng.engine === 'mlx' ? '· Apple GPU ' : eng.engine === 'faster' ? '· faster ' : ''}· ${eng.model}\nAI · ${(S.tools.ai[S.settings.ai.provider] || {}).label || '—'}`;
    st.innerHTML = [
        S.syncing ? `<div><span class="spin"></span> Sincronizzazione…</div>` : '',
        tr ? `<div>${icon('mic')} ${tr} in trascrizione</div>` : '',
    ].join('');
    st.classList.toggle('hidden', !st.innerHTML);
}
$$('.nav-item[data-route]').forEach(a => a.onclick = () => go({ name: a.dataset.route }));

// ───────── dashboard ─────────
function viewDashboard(v) {
    const all = S.courses.flatMap(c => c.recordings);
    const stat = (val, l) => `<div class="stat"><div class="v">${val}</div><div class="l">${l}</div></div>`;
    const cards = S.courses.map((c, i) => {
        const recs = c.recordings, dl = recs.filter(r => r.videoExists).length, tr = recs.filter(r => r.transcript).length;
        const last = recs.slice().sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''))[0];
        const isRun = running.has(c.id), queued = (S.syncQueue || []).includes(c.id);
        const off = c.drive && c.drive.missing;
        const state = off ? `<span class="pill warn" title="Disco esterno non collegato">${icon('alert')} disco «${esc(c.drive.name)}» non collegato</span>` : isRun ? '<span class="pill acc"><span class="spin"></span> sync</span>' : queued ? '<span class="pill">in coda</span>'
            : c.lastError ? `<span class="pill err" title="${esc(c.lastError)}">errore</span>` : c.autoSync === false ? '<span class="pill">manuale</span>' : '';
        return `<div class="course-card" data-id="${c.id}">
            <div class="prio"><button class="icon ghost small" data-up="${i}" title="Più priorità">↑</button><button class="icon ghost small" data-down="${i}" title="Meno priorità">↓</button></div>
            <div><div class="t">${esc(cname(c))}</div><div class="full">${esc((c.manifest.course && c.manifest.course.fullname) || c.input)}</div></div>
            <div class="nums"><span><b>${recs.length}</b> lezioni</span><span><b>${dl}</b> scaricate</span><span><b>${tr}</b> trascritte</span>${c.materialsCount ? `<span><b>${c.materialsCount}</b> file</span>` : ''}</div>
            <div class="progress ${dl === recs.length && recs.length ? 'ok' : ''}"><i style="width:${recs.length ? dl / recs.length * 100 : 0}%"></i></div>
            <div class="foot"><span>${last ? 'Ultima lezione: ' + esc(fmtDate(last.isoDate)) : 'Mai sincronizzato'}</span><span class="grow"></span>${state}<span class="faint">#${i + 1}</span></div>
        </div>`;
    }).join('');
    v.innerHTML = `<div class="page">
        <div class="page-head"><div><h1>I tuoi corsi</h1><div class="sub">In ordine di priorità di sincronizzazione · ${S.settings.autoSync.onStart ? 'sync automatica all\'avvio attiva' : 'sync automatica disattivata'}</div></div><span class="grow"></span>
            ${S.syncing ? '<button id="d-stop">■ Ferma</button>' : '<button class="primary" id="d-sync">⟳ Sincronizza tutto</button>'}</div>
        <div class="stats">${stat(S.courses.length, 'corsi')}${stat(all.length, 'registrazioni')}${stat(all.filter(r => r.videoExists).length, 'scaricate')}${stat(all.filter(r => r.transcript).length, 'trascritte')}</div>
        <div class="grid">${cards}<div class="course-card add-card" id="d-add"><div style="font-size:1.8em">＋</div><div>Aggiungi corso</div></div></div>
    </div>`;
    $$('.course-card[data-id]', v).forEach(el => el.onclick = e => { if (!e.target.closest('button')) go({ name: 'course', courseId: el.dataset.id, tab: 'panoramica' }); });
    $$('[data-up],[data-down]', v).forEach(b => b.onclick = () => {
        const i = +(b.dataset.up ?? b.dataset.down), j = b.dataset.up !== undefined ? i - 1 : i + 1;
        if (j < 0 || j >= S.courses.length) return;
        const ids = S.courses.map(c => c.id);[ids[i], ids[j]] = [ids[j], ids[i]];
        guard(async () => { await api.reorderCourses(ids); v.dataset.view = ''; refresh(); });
    });
    $('#d-add', v).onclick = openAddCourse;
    if ($('#d-sync', v)) $('#d-sync', v).onclick = () => guard(() => api.sync());
    if ($('#d-stop', v)) $('#d-stop', v).onclick = () => guard(() => api.stopSync());
}

// ───────── course page ─────────
let lessonFocusKey = null;                       // keep keyboard focus on a lesson card across re-renders
function viewCourse(v) {
    const ae = document.activeElement;
    lessonFocusKey = ae && ae.classList && ae.classList.contains('lcard') ? ae.dataset.key : null;
    const c = course(route.courseId);
    if (!c) return go({ name: 'dashboard' });
    let tab = route.tab || 'panoramica';
    if (tab !== 'lezioni') lessonFilter.restore = false;
    const isRun = running.has(c.id);
    const recs = c.recordings.filter(r => isFollowed(c, r));
    const nTr = recs.filter(r => r.transcript).length;
    const full = c.manifest.course && c.manifest.course.fullname;
    const sub = [full && full.toLowerCase() !== cname(c).toLowerCase() ? full : '', `${recs.length} lezioni`, recs.length ? `${nTr} trascritte` : '',
        c.lastSync ? 'sync ' + new Date(c.lastSync).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : 'mai sincronizzato'].filter(Boolean);
    const tabs = [['panoramica', 'Panoramica'], ['lezioni', 'Lezioni', recs.length], ['materiale', 'Materiale', c.materials ? (c.materialFiles || []).length : '']];
    if (tab === 'note') tabs.push(['note', 'Note AI']);
    if (tab === 'impostazioni') tabs.push(['impostazioni', 'Impostazioni']);
    v.innerHTML = `<div class="page course-page">
        <div class="page-head"><div><h1>${esc(cname(c))}</h1><div class="sub">${sub.map(esc).join(' · ')}</div></div>
            <button id="c-sync" class="${isRun ? '' : 'primary'}" title="Sincronizza questo corso">${isRun ? '<span class="spin"></span> Ferma' : icon('refresh') + ' Sincronizza'}</button>
            <button id="c-more" class="ghost icon" title="Altre azioni" aria-label="Altre azioni">${icon('more')}</button></div>
        ${c.drive && c.drive.missing ? `<div class="note-line warn">${icon('alert')} <span class="grow">Registrazioni, trascrizioni e appunti di questo corso sono sul disco «${esc(c.drive.name)}», che non è collegato. Collegalo: PoliRec lo rileva e risincronizza da solo.</span><button class="small primary" id="c-drive">Collega il disco…</button></div>` : ''}
        ${c.lastError && !isRun && !(c.drive && c.drive.missing) ? `<div class="note-line err">${icon('alert')} <span class="grow">${esc(String(c.lastError).slice(0, 220))}</span><button class="small ghost" id="c-retry">Riprova</button></div>` : ''}
        <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button role="tab" data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}${n ? ` <span class="tab-n">${n}</span>` : ''}</button>`).join('')}</div>
        ${needsTeacherChoice(c) ? `<div class="note-line">${icon('users')} <span class="grow">Lezioni parallele di più docenti (${courseTeachers(c).map(t => esc(t.name)).join(', ')}): scegli quale segui prima di scaricarle.</span><button class="small primary" id="c-tch">Scegli docente…</button></div>` : ''}
        <div id="tab"></div></div>`;
    if ($('#c-tch', v)) { $('#c-tch', v).onclick = () => askTeachers(c); askTeachers(c, { auto: true }); }
    if ($('#c-drive', v)) $('#c-drive', v).onclick = () => ActivityUI.driveFor(c);
    if ($('#c-retry', v)) $('#c-retry', v).onclick = () => guard(() => api.sync([c.id]));
    $$('[data-tab]', v).forEach(b => b.onclick = () => go({ ...route, tab: b.dataset.tab }));
    $('#c-sync', v).onclick = () => guard(() => isRun ? api.stopSync() : api.sync([c.id]));
    $('#c-more', v).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 250, r.bottom + 6, courseMenu(c)); };
    ({ panoramica: window.tabOverview, lezioni: tabLessons, materiale: tabMaterials, note: tabNotes, impostazioni: tabCourseSettings })[tab](c, $('#tab', v));
}
function courseMenu(c) {
    return [
        ['Apri il riepilogo (INDICE)', () => api.open(c.id, 'root', 'INDICE.html')],
        ['Apri la cartella del corso', () => api.open(c.id, 'root')],
        ['Agente AI sul corso…', () => openAgent(c)],
        ...(courseTeachers(c).length > 1 ? [['Scegli docente…', () => askTeachers(c)]] : []),
        '-',
        ['Note AI di tutte le lezioni', () => go({ name: 'course', courseId: c.id, tab: 'note' })],
        ['Impostazioni del corso', () => go({ name: 'course', courseId: c.id, tab: 'impostazioni' })],
    ];
}

const lessonFilter = { q: '', f: 'all', allTeachers: false };
// ── parallel lecture tracks (same course, different teachers) ──
function courseTeachers(c) {
    const by = {};
    for (const r of c.recordings) if (r.teacher) by[r.teacher] = (by[r.teacher] || 0) + 1;
    return Object.entries(by).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}
const isFollowed = (c, r) => !Array.isArray(c.teachers) || !c.teachers.length || !r.teacher || c.teachers.includes(r.teacher);
const needsTeacherChoice = c => courseTeachers(c).length > 1 && !Array.isArray(c.teachers);
let teacherAsked = new Set();
async function askTeachers(c, { auto } = {}) {
    if (auto && (teacherAsked.has(c.id) || $('#modal-root').innerHTML)) return;
    teacherAsked.add(c.id);
    const ts = courseTeachers(c);
    if (ts.length < 2) return toast('Questo corso ha un solo docente');
    const cur = Array.isArray(c.teachers) ? c.teachers : [];
    const m = modal(`<h2>Quale docente segui?</h2>
        <p class="muted" style="margin-top:0"><b>${esc(cname(c))}</b> ha le registrazioni di ${ts.length} docenti (lezioni parallele sugli stessi argomenti). Scegli quali scaricare: puoi selezionarne anche più di uno e cambiare idea in Impostazioni del corso.</p>
        <div class="tch-list">${ts.map(t => `<label class="tch"><input type="checkbox" value="${esc(t.name)}" ${cur.includes(t.name) ? 'checked' : ''}><b>${esc(t.name)}</b><span class="faint">${t.count} registrazioni · ${c.recordings.filter(r => r.teacher === t.name && r.videoExists).length} già scaricate</span></label>`).join('')}</div>
        <div id="tch-trash" class="tch-trash hidden"><label class="row"><input type="checkbox" id="tch-del"> <span>Sposta nel Cestino i file già scaricati dei docenti non selezionati <span class="faint" id="tch-size"></span></span></label></div>
        <div class="foot"><button class="ghost" id="tch-no">Più tardi</button><button class="primary" id="tch-ok">Salva e scarica</button></div>`);
    const sel = () => $$('.tch input', m.el).filter(i => i.checked).map(i => i.value);
    const upd = () => {
        const s = sel(); $('#tch-ok', m.el).disabled = !s.length;
        const drop = c.recordings.filter(r => r.teacher && !s.includes(r.teacher) && (r.videoExists || r.transcript));
        $('#tch-trash', m.el).classList.toggle('hidden', !s.length || !drop.length);
        $('#tch-size', m.el).textContent = drop.length ? `(${drop.length} lezioni: video, trascrizioni e note AI — recuperabili dal Cestino)` : '';
    };
    $$('.tch input', m.el).forEach(i => i.onchange = upd); upd();
    $('#tch-no', m.el).onclick = m.close;
    $('#tch-ok', m.el).onclick = () => guard(async () => {
        const s = sel(); const del = $('#tch-del', m.el).checked && !$('#tch-trash', m.el).classList.contains('hidden');
        m.close();
        await api.updateCourse(c.id, { teachers: s });
        if (del) { const r = await api.trashUnfollowed(c.id); toast(`${r.trashed} file spostati nel Cestino`); }
        toast(`Segui: ${s.join(' e ')}`);
        $('#view').dataset.view = ''; await refresh();
        if (c.recordings.some(r => s.includes(r.teacher) && !r.videoExists)) api.sync([c.id]);
    });
}

function tabLessons(c, el) {
    const keepFocus = lessonFocusKey; lessonFocusKey = null;
    const multi = courseTeachers(c).length > 1 && Array.isArray(c.teachers) && c.teachers.length;
    const hiddenN = multi ? c.recordings.filter(r => !isFollowed(c, r)).length : 0;
    const recs = c.recordings.filter(r => lessonFilter.allTeachers || isFollowed(c, r)).sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));
    if (!recs.length) {
        el.innerHTML = `<div class="empty-state"><h2>Nessuna registrazione</h2><p>${c.lastSync ? 'Il corso non ha registrazioni pubblicate (o non sono state trovate). Puoi aggiungere un link nelle Impostazioni del corso.' : 'Sincronizza il corso per cercare le registrazioni.'}</p>${c.lastSync ? '' : '<button class="primary" id="l-sync">Sincronizza</button>'}</div>`;
        if ($('#l-sync', el)) $('#l-sync', el).onclick = () => guard(() => api.sync([c.id]));
        return;
    }
    const FILTERS = { all: ['Tutte', () => true], todo: ['Da scaricare', r => !r.videoExists], nt: ['Da trascrivere', r => r.videoExists && !r.transcript] };
    if (!FILTERS[lessonFilter.f]) lessonFilter.f = 'all';
    const pending = recs.filter(FILTERS.nt[1]).length;
    el.innerHTML = `<div class="toolbar">
        <input class="search" type="search" id="l-q" placeholder="Cerca nelle lezioni…" value="${esc(lessonFilter.q)}">
        <div class="seg">${Object.entries(FILTERS).map(([k, [l, f]]) => { const n = recs.filter(f).length; return k !== 'all' && !n && lessonFilter.f !== k ? '' : `<button data-f="${k}" class="${lessonFilter.f === k ? 'on' : ''}">${l} <span class="tab-n">${n}</span></button>`; }).join('')}</div>
        <span class="grow"></span>
        ${multi ? `<button class="chip ${lessonFilter.allTeachers ? 'on' : ''}" id="l-tch" title="Lezioni parallele di altri docenti">${esc(c.teachers.join(' + '))}${hiddenN ? ` · ${lessonFilter.allTeachers ? 'solo i miei' : `+${hiddenN} altri`}` : ''}</button>` : ''}
        ${pending ? `<button id="l-tr" title="Trascrivi tutte le lezioni scaricate">${icon('mic')} Trascrivi ${pending}</button>` : ''}
        <button class="ghost icon" id="l-more" title="Azioni su tutte le lezioni" aria-label="Altre azioni">${icon('more')}</button>
    </div>
    <div class="lx"><nav class="lx-toc" id="l-toc"></nav><div class="lx-cards" id="l-list"></div></div>
    <p class="faint lx-hint">${kbdHint('j')} ${kbdHint('k')} per muoverti · ${kbdHint('↵')} apri · ${kbdHint('/')} cerca</p>`;
    let counts = {};
    const n = recs.length;
    const num = r => n - recs.indexOf(r);           // lesson number, oldest = 1
    const draw = () => {
        const q = lessonFilter.q.toLowerCase();
        const list = recs.filter(r => (!q || [r.displayTitle, r.teacher, r.type, r.summary, (r.bullets || []).join(' ')].join(' ').toLowerCase().includes(q)) && FILTERS[lessonFilter.f][1](r));
        $('#l-toc', el).innerHTML = list.map(r => `<a data-k="${esc(r.key)}"><span>${r.isoDate ? new Date(r.isoDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '—'}</span>${esc(r.displayTitle || r.file)}</a>`).join('');
        $('#l-list', el).innerHTML = list.map(r => lessonCard(c, r, num(r), counts[r.key] || 0)).join('') || `<div class="empty-state">Nessuna lezione${q ? ` per «${esc(lessonFilter.q)}»` : ''}</div>`;
        $$('#l-toc a', el).forEach(a => a.onclick = () => { const card = $(`.lcard[data-key="${CSS.escape(a.dataset.k)}"]`, el); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.focus({ preventScroll: true }); } });
        $$('.lcard', el).forEach(card => {
            const open = extra => { lessonFilter.last = card.dataset.key; lessonFilter.restore = true; go({ name: 'recording', courseId: c.id, key: card.dataset.key, back: 'lezioni', ...extra }); };
            card.onkeydown = e => { if (e.key === 'Enter' && e.target === card) { e.preventDefault(); open({}); } };
            card.onclick = e => {
                const b = e.target.closest('[data-act]');
                if (!b) return open({});
                e.stopPropagation();
                const a = b.dataset.act;
                if (a === 'notes') open({ side: 'appunti' });
                else if (a.startsWith('ai:')) open({ study: a.slice(3) });
                else if (a === 'dl') guard(() => api.sync([c.id]));
                else if (a === 'dlpause') guard(async () => { await api.activity.pauseDownload(c.id, card.dataset.key); toast('Download in pausa'); });
                else if (a === 'dlres') guard(async () => { await api.activity.resumeDownload(c.id, card.dataset.key); toast('Download ripreso'); softRefresh(); });
                else if (a === 'trres') guard(async () => { await api.activity.resumeTranscription(vpath(c, recs.find(r => r.key === card.dataset.key))); });
                else if (a === 'tr') guard(async () => { await api.transcribe(c.id, [card.dataset.key]); tprog[vpath(c, recs.find(r => r.key === card.dataset.key))] = 'queued'; toast('In coda per la trascrizione'); draw(); });
            };
        });
        // coming back from a lesson: put the focus on it
        const back = lessonFilter.restore && $(`.lcard[data-key="${CSS.escape(lessonFilter.last)}"]`, el);
        if (back) { lessonFilter.restore = false; back.focus({ preventScroll: true }); back.scrollIntoView({ block: 'center' }); }
        else if (keepFocus) { const k = $(`.lcard[data-key="${CSS.escape(keepFocus)}"]`, el); if (k) k.focus({ preventScroll: true }); }
    };
    draw();
    api.notes.linkCounts(c.id).then(x => { counts = x || {}; if (Object.keys(counts).length) draw(); }).catch(() => { });
    $('#l-q', el).oninput = e => { lessonFilter.q = e.target.value; draw(); };
    $('#l-q', el).onkeydown = e => { if (e.key === 'Escape') { e.target.value = ''; lessonFilter.q = ''; draw(); e.target.blur(); } if (e.key === 'ArrowDown' || e.key === 'Enter') { const f = $('.lcard', el); if (f) { e.preventDefault(); f.focus(); } } };
    if ($('#l-tch', el)) $('#l-tch', el).onclick = () => { if (!hiddenN) return askTeachers(c); lessonFilter.allTeachers = !lessonFilter.allTeachers; tabLessons(c, el); };
    $$('[data-f]', el).forEach(b => b.onclick = () => { lessonFilter.f = b.dataset.f; tabLessons(c, el); });
    if ($('#l-tr', el)) $('#l-tr', el).onclick = () => guard(async () => { const k = await api.transcribe(c.id); toast(`${k} lezioni in coda per la trascrizione`); refresh(); });
    $('#l-more', el).onclick = e => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 300, r.bottom + 6, [
        ['Genera i sommari mancanti', async () => { const k2 = await api.notesBatch(c.id, 'sommario'); toast(k2 ? `Genero ${k2} sommari…` : 'Nessun sommario mancante'); }],
        ...Object.entries(S.templates).filter(([k]) => k !== 'sommario').map(([k, l]) => [`Genera ${l.split(' (')[0].toLowerCase()} per tutte le lezioni`, async () => { const k2 = await api.notesBatch(c.id, k); toast(k2 ? `Genero per ${k2} lezioni…` : 'Tutte le lezioni trascritte le hanno già'); }]),
        '-',
        ['Pulisci le trascrizioni (ehm, ripetizioni…)', async () => { const r2 = await api.cleanTranscripts(c.id); toast(`${r2.files} trascrizioni pulite, ${r2.removed} segmenti rimossi`); }],
    ]); };
}
const kbdHint = k => `<kbd>${esc(k.toUpperCase())}</kbd>`;
// j/k (or ↑/↓ on a focused card) move between lesson cards
document.addEventListener('keydown', e => {
    if (route.name !== 'course' || route.tab !== 'lezioni' || e.metaKey || e.ctrlKey || e.altKey || $('#modal-root').innerHTML.trim() || $('#palette')) return;
    const a = document.activeElement, onCard = a && a.classList && a.classList.contains('lcard');
    if (!onCard && a && /^(input|textarea|select)$/i.test(a.tagName)) return;
    const d = e.key === 'j' || (onCard && e.key === 'ArrowDown') ? 1 : e.key === 'k' || (onCard && e.key === 'ArrowUp') ? -1 : 0;
    if (!d) return;
    const cards = $$('#l-list .lcard'); if (!cards.length) return;
    e.preventDefault();
    const i = cards.indexOf(a);
    const next = cards[i < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, i + d))];
    next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

const AI_KIND = { appunti: 'Appunti', riassunto: 'Riassunto', spiegazione: 'Spiegazioni', flashcard: 'Flashcard', domande: 'Domande' };
const resumeAt = r => { const p = Number(localStorage.getItem('pos:' + r.key) || 0); return p > 30 ? p : 0; };
function lessonCard(c, r, num, linked) {
    const d = r.isoDate ? new Date(r.isoDate) : null;
    const p = progress[r.key], tp = tprog[vpath(c, r)];
    let state = '';
    if (!r.videoExists) state = r.status === 'paused' ? `<span class="pill">${icon('pause')} download in pausa</span><button class="small ghost" data-act="dlres">${icon('play')} Riprendi</button>`
        : p && r.status !== 'error' ? `<span class="pill acc">${icon('download')} ${Math.round(p.percent || 0)}%</span><button class="small ghost icon-only" data-act="dlpause" title="Metti in pausa">${icon('pause')}</button>` : r.status === 'error' ? `<span class="pill err" title="${esc(r.error)}">download non riuscito</span><button class="small ghost" data-act="dl">Riprova</button>` : `<button class="small ghost" data-act="dl" title="Scarica le lezioni mancanti del corso">${icon('download')} Scarica</button>`;
    else if (!r.transcript) state = tp === 'paused' ? `<span class="pill">${icon('pause')} trascrizione in pausa</span><button class="small ghost" data-act="trres">${icon('play')} Riprendi</button>` : tp === 'queued' ? '<span class="pill">trascrizione in coda</span>' : typeof tp === 'number' ? `<span class="pill acc">trascrivo ${tp}%</span>` : tp && tp.error ? '<span class="pill err">trascrizione non riuscita</span><button class="small ghost" data-act="tr">Riprova</button>' : `<button class="small ghost" data-act="tr">${icon('mic')} Trascrivi</button>`;
    else { const at = resumeAt(r); if (at) state = `<span class="pill acc" title="Riprendi da dove eri rimasto">${icon('play')} ${fmtT(at)}</span>`; }
    const kinds = r.notes.map(f => f.split(' - ').pop().replace(/\.md$/, '')).filter(k => k !== 'sommario');
    const tags = kinds.map(k => `<button class="ltag" data-act="ai:${esc(k)}">${AI_KIND[k] || esc(k)}</button>`);
    if (linked) tags.push(`<button class="ltag" data-act="notes">${icon('note')} ${linked} appunt${linked === 1 ? 'o' : 'i'}</button>`);
    const bullets = r.bullets || [];
    const sum = r.summary || bullets.length
        ? `${r.summary ? `<p class="sum">${esc(r.summary)}</p>` : ''}${bullets.length ? `<ul>${bullets.slice(0, 4).map(b => `<li>${esc(b)}</li>`).join('')}${bullets.length > 4 ? `<li class="faint more">e altri ${bullets.length - 4} argomenti</li>` : ''}</ul>` : ''}`
        : (r.transcript ? '<p class="sum faint">Sommario non ancora generato.</p>' : '');
    const meta = [d ? d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : '—', r.teacher, r.type, r.duration].filter(Boolean).map(esc).join(' · ');
    return `<article class="lcard ${r.videoExists ? '' : 'missing'}" tabindex="0" data-key="${esc(r.key)}">
        <div class="lc-meta"><span class="lc-n">${num}</span><span class="lc-m">${meta}</span><span class="grow"></span>${state}</div>
        <h3>${esc(r.displayTitle || r.file)}</h3>
        ${sum}
        ${tags.length ? `<div class="lc-links">${tags.join('')}</div>` : ''}</article>`;
}

function tabMaterials(c, el) {
    if (!c.materials) {
        el.innerHTML = `<div class="empty-state"><h2>Materiale del corso</h2><p>Slide, PDF e cartelle pubblicate su WeBeep, organizzate per sezione.<br>Il download del materiale è disattivato per questo corso.</p>
            <button class="primary" id="m-on">Attiva e sincronizza</button></div>`;
        $('#m-on', el).onclick = () => guard(async () => { await api.updateCourse(c.id, { materials: true }); await api.sync([c.id]); refresh(); });
        return;
    }
    const tree = c.materialFiles || [];
    el.innerHTML = `<div class="toolbar"><span class="muted">${tree.length} file in <code>materiale/</code></span><span class="grow"></span>
        <button id="m-open" class="ghost">Apri cartella</button><button id="m-sync">${icon('refresh')} Aggiorna</button></div><div class="list files" id="m-tree"></div>`;
    $('#m-open', el).onclick = () => guard(() => api.open(c.id, 'materials'));
    $('#m-sync', el).onclick = () => guard(() => api.sync([c.id]));
    if (!tree.length) { $('#m-tree', el).innerHTML = '<div class="empty-state">Nessun file ancora: premi Aggiorna.</div>'; return; }
    const groups = {};
    for (const f of tree) { const s = f.includes('/') ? f.split('/')[0] : 'Generale'; (groups[s] = groups[s] || []).push(f); }
    const fIco = f => icon(/\.(zip|rar|7z|gz)$/i.test(f) ? 'folder' : /\.md$/i.test(f) ? 'external' : 'file');
    $('#m-tree', el).innerHTML = Object.entries(groups).map(([s, fs]) => `<details ${Object.keys(groups).length <= 4 ? 'open' : ''}><summary>${esc(s)} <span class="muted" style="font-weight:400">${fs.length}</span></summary>
        ${fs.map(f => `<div class="f" data-f="${esc(f)}"><span class="faint">${fIco(f)}</span>${esc(f.split('/').slice(1).join(' / ') || f)}</div>`).join('')}</details>`).join('');
    $$('.f', el).forEach(x => x.onclick = () => guard(() => api.open(c.id, 'materials', x.dataset.f)));
}

function tabNotes(c, el) {
    const withNotes = c.recordings.filter(r => r.notes.length).sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));
    el.innerHTML = `<div class="toolbar"><span class="muted">Note generate con ${esc((S.tools.ai[S.settings.ai.provider] || {}).label || 'AI')} dalle trascrizioni</span><span class="grow"></span>
        <button id="n-open" class="ghost">Apri cartella note</button><button id="n-agent">${icon('sparkles')} Agente sul corso</button></div>
        <div class="list">${withNotes.map(r => `<div class="rec" data-key="${esc(r.key)}"><div class="d"><b>${esc(fmtDate(r.isoDate))}</b></div>
            <div><div class="ti">${esc(r.displayTitle)}</div><div class="meta">${r.notes.map(n => `<span class="pill">${esc(n.split(' - ').pop().replace('.md', ''))}</span>`).join('')}</div></div><div></div></div>`).join('')
        || '<div class="empty-state">Nessuna nota. Apri una lezione trascritta e genera appunti, riassunti o flashcard.</div>'}</div>`;
    $('#n-open', el).onclick = () => guard(() => api.open(c.id, 'notes'));
    $('#n-agent', el).onclick = () => openAgent(c);
    $$('.rec', el).forEach(row => row.onclick = () => go({ name: 'recording', courseId: c.id, key: row.dataset.key, side: 'note', back: 'note' }));
}

const field = (label, help, ctl) => `<div class="field"><label>${label}${help ? `<div class="help">${help}</div>` : ''}</label><div class="ctl">${ctl}</div></div>`;
const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label>`;

function tabCourseSettings(c, el) {
    el.innerHTML = `<div class="group"><h3>Generale</h3>
        ${field('Nome', 'Come appare nella dashboard', `<input id="cs-name" value="${esc(c.name || '')}">`)}
        ${field('Corso WeBeep', 'Link (anche di una sezione), codice o nome', `<input id="cs-input" value="${esc(c.input)}">`)}
        ${field('Cartella', '', `<input id="cs-dir" value="${esc(c.dir)}"><button id="cs-pick">Sfoglia…</button>`)}
        ${field('Lingua delle lezioni', 'Usata dalla trascrizione', `<select id="cs-lang">${[['', 'Come impostazioni generali'], ['it', 'Italiano'], ['en', 'Inglese'], ['auto', 'Rilevamento automatico']].map(([k, l]) => `<option value="${k}" ${(c.language || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    </div>
    <div class="group"><h3>Sincronizzazione</h3>
        ${field('Sync automatica', 'Includi il corso nella sync all\'avvio e periodica', sw('cs-auto', c.autoSync !== false))}
        ${field('Scarica il materiale', 'Slide, PDF e cartelle del corso in materiale/', sw('cs-mat', !!c.materials))}
        ${field('Link extra', 'Uno per riga: archivi RecMan, link WebEx, mp4 o YouTube non trovati automaticamente', `<textarea id="cs-extra" rows="3">${esc((c.extraUrls || []).join('\n'))}</textarea>`)}
        ${field('Password video', 'Se il docente protegge le registrazioni WebEx', `<input id="cs-pwd" value="${esc(c.videoPassword || '')}">`)}
        ${courseTeachers(c).length > 1 ? field('Docenti seguiti', 'Il corso ha lezioni parallele di più docenti: si scaricano solo quelle dei docenti scelti', `<span class="pill ${Array.isArray(c.teachers) ? 'ok' : 'warn'}">${Array.isArray(c.teachers) ? esc(c.teachers.join(', ')) : 'da scegliere'}</span><span class="grow"></span><button id="cs-tch">Cambia…</button>`) : ''}
    </div>
    <div class="group"><h3>Sorgenti trovate</h3>
        ${(c.manifest.sources || []).map(s => field(`<span class="pill">${esc(s.type)}</span>`, '', `<span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.url)}">${esc(s.label || s.url)}</span>`)).join('') || field('—', 'Nessuna sorgente: sincronizza il corso', '')}
    </div>
    <div class="row"><button class="danger" id="cs-del">Rimuovi corso</button><span class="faint">I file scaricati non vengono cancellati.</span><span class="grow"></span><button class="primary" id="cs-save">Salva</button></div>`;
    if ($('#cs-tch', el)) $('#cs-tch', el).onclick = () => askTeachers(c);
    $('#cs-pick', el).onclick = async () => { const d = await api.pickDir($('#cs-dir', el).value); if (d) $('#cs-dir', el).value = d; };
    $('#cs-save', el).onclick = () => guard(async () => {
        const patch = {
            name: $('#cs-name', el).value, input: $('#cs-input', el).value, dir: $('#cs-dir', el).value, language: $('#cs-lang', el).value,
            autoSync: $('#cs-auto', el).checked, materials: $('#cs-mat', el).checked, videoPassword: $('#cs-pwd', el).value,
            extraUrls: $('#cs-extra', el).value.split('\n').map(s => s.trim()).filter(Boolean),
        };
        if (patch.input !== c.input) patch.webeepId = null;
        await api.updateCourse(c.id, patch); toast('Impostazioni salvate'); $('#view').dataset.view = ''; refresh();
    });
    $('#cs-del', el).onclick = () => { if (confirm(`Rimuovere "${cname(c)}" dall'app? I file restano sul disco.`)) guard(async () => { await api.removeCourse(c.id); go({ name: 'dashboard' }); refresh(); }); };
}

// ───────── recording page ─────────
let recData = null;
const lessonChats = {};                                   // key → [{role, text}] (kept while the app is open)
function lessonSiblings(c) { return c.recordings.filter(r => isFollowed(c, r)).sort((a, b) => (a.isoDate || '').localeCompare(b.isoDate || '')); }
function viewRecording(v) {
    const c = course(route.courseId);
    const r = c && c.recordings.find(x => x.key === route.key);
    if (!r) return go({ name: 'course', courseId: route.courseId, tab: 'panoramica' });
    recData = null;
    const sib = lessonSiblings(c), idx = sib.findIndex(x => x.key === r.key);
    const prev = sib[idx - 1], next = sib[idx + 1];
    const goLesson = x => x && go({ name: 'recording', courseId: c.id, key: x.key, back: route.back });
    v.innerHTML = `<div class="page wide rec-page">
        <div class="rec-top">
            <button class="ghost small back" id="r-back" title="Torna al corso">${icon('chevLeft')} ${esc(cname(c))}</button><span class="grow"></span>
            ${idx >= 0 ? `<span class="faint">Lezione ${idx + 1} di ${sib.length}</span>` : ''}
            <button class="ghost icon" id="r-prev" ${prev ? '' : 'disabled'} title="${prev ? 'Lezione precedente: ' + esc(prev.displayTitle || '') : 'Nessuna lezione precedente'} ( [ )" aria-label="Lezione precedente">${icon('chevLeft')}</button>
            <button class="ghost icon" id="r-next" ${next ? '' : 'disabled'} title="${next ? 'Lezione successiva: ' + esc(next.displayTitle || '') : 'Nessuna lezione successiva'} ( ] )" aria-label="Lezione successiva">${icon('chevRight')}</button>
            <button class="ghost icon" id="r-more" title="Altre azioni" aria-label="Altre azioni">${icon('more')}</button>
        </div>
        <div class="page-head"><div><h1>${esc(r.displayTitle || r.file)}</h1><div class="sub">${[r.isoDate && new Date(r.isoDate).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), r.teacher, r.type, r.duration].filter(Boolean).map(esc).join(' · ')}</div></div></div>
        <div class="rec-layout">
            <div class="rec-main"><div class="player" id="player"><div class="empty">Caricamento…</div></div><div class="info-card" id="r-info"></div><section class="study" id="r-study"></section></div>
            <div class="side-panel"><div class="tabs" id="r-tabs">${[['testo', 'Trascrizione'], ['appunti', 'Appunti']].map(([k, l]) => `<button data-s="${k}" class="${sideTab() === k ? 'active' : ''}">${l}</button>`).join('')}</div><div class="body" id="r-side"></div></div>
        </div></div>`;
    $('#r-back', v).onclick = () => go({ name: 'course', courseId: c.id, tab: route.back || 'lezioni' });
    $('#r-prev', v).onclick = () => goLesson(prev);
    $('#r-next', v).onclick = () => goLesson(next);
    $('#r-more', v).onclick = e => { const b = e.currentTarget.getBoundingClientRect(); showMenu(b.right - 260, b.bottom + 6, lessonMenu(c, r)); };
    $$('#r-tabs button', v).forEach(b => b.onclick = () => { route.side = b.dataset.s; $$('#r-tabs button', v).forEach(x => x.classList.toggle('active', x === b)); drawSide(c, r); });
    const act = lessonActions(c, r);
    window.lessonCmd = { ...act, prev: () => goLesson(prev), next: () => goLesson(next) };
    guard(async () => {
        recData = await api.recording(c.id, r.key);
        drawPlayer(c, r); drawSide(c, r); drawInfo(c, r); drawStudy(c, r);
        if (route.study) setTimeout(() => $('#r-study') && $('#r-study').scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    });
}
function lessonActions(c, r) {
    return {
        ext: () => { if (!recData || !recData.videoUrl) return toast('Video non ancora scaricato'); if (player) player.pause(); return guard(() => api.openPath(recData.videoPath)); },
        finder: () => recData && recData.videoUrl ? guard(() => api.reveal(recData.videoPath)) : toast('Video non ancora scaricato'),
        webex: () => r.webexUrl ? guard(() => api.openExternal(r.webexUrl)) : toast('Nessun link WebEx'),
        sum: () => guard(async () => { toast('Genero il sommario…'); await api.genNote(c.id, r.key, 'sommario'); }),
        tr: () => guard(async () => { await api.transcribe(c.id, [r.key]); tprog[vpath(c, r)] = 'queued'; toast('In coda per la trascrizione'); if (sideTab() === 'testo') drawSide(c, r); }),
        details: () => lessonDetails(c, r),
    };
}
function lessonMenu(c, r) {
    const a = lessonActions(c, r), d = recData || {};
    const hasText = !!(d.segments || d.text), hasSum = (d.notes || []).some(n => n.kind === 'sommario');
    return [
        ...(d.videoUrl ? [['Apri il video con l\'app di sistema', a.ext], ['Mostra il video nella cartella', a.finder]] : []),
        ...(r.webexUrl ? [['Apri su WebEx', a.webex]] : []),
        '-',
        ...(hasText ? [[hasSum ? 'Rigenera il sommario' : 'Genera il sommario', a.sum]] : []),
        ...(d.videoUrl ? [[r.transcript ? 'Trascrivi di nuovo' : 'Trascrivi', a.tr]] : []),
        ['Dettagli del file…', a.details],
    ].filter((x, i, arr) => x !== '-' || (i > 0 && i < arr.length - 1 && arr[i - 1] !== '-'));
}
function lessonDetails(c, r) {
    const row = (l, v) => v ? `<div class="kv"><span class="faint">${l}</span><span>${v}</span></div>` : '';
    const m = modal(`<h2>Dettagli</h2><div class="kvs">
        ${row('File', esc(r.file))}${row('Fonte', esc(r.sourceLabel || r.source || ''))}${row('Nome su WebEx', esc(r.webexName || ''))}${row('Dimensione', esc(r.size || ''))}
        ${row('Trascrizione', r.transcript ? `<a data-tr>${esc(r.transcript)}</a>` : '')}${row('Ultimo errore', r.error ? `<span style="color:var(--err)">${esc(r.error)}</span>` : '')}</div>
        <div class="foot"><button class="primary" id="dt-ok">Chiudi</button></div>`);
    $('#dt-ok', m.el).onclick = m.close;
    if ($('[data-tr]', m.el)) $('[data-tr]', m.el).onclick = () => guard(() => api.open(c.id, 'transcripts', r.transcript));
}
const sideTab = () => ({ note: 'appunti', info: 'testo' }[route.side] || route.side || 'testo');

function updateRecordingLive() {
    const c = course(route.courseId); const r = c && c.recordings.find(x => x.key === route.key);
    if (!c || !r || !recData) return;
    guard(async () => {
        const sig = d => d.notes.map(n => n.file).join('|') + ':' + !!d.segments + ':' + !!d.text + ':' + !!d.videoUrl;
        const before = sig(recData);
        recData = await api.recording(c.id, r.key);
        if (sig(recData) !== before) {
            if (!player && recData.videoUrl) drawPlayer(c, r);
            if (!aiStream) { if (sideTab() === 'testo') drawSide(c, r); drawStudy(c, r); }
        }
        drawInfo(c, r);
    });
}

function drawPlayer(c, r) {
    const box = $('#player');
    if (!recData.videoUrl) {
        if (c.drive && c.drive.missing) {
            box.innerHTML = `<div class="empty"><div style="text-align:center">💽 Il video è sul disco «${esc(c.drive.name)}», che non è collegato<br><br><button class="primary" id="p-drive">Collega il disco…</button></div></div>`;
            $('#p-drive').onclick = () => ActivityUI.driveFor(c);
            player = null; return;
        }
        box.innerHTML = `<div class="empty"><div style="text-align:center">${r.status === 'paused' ? 'Download in pausa' : r.status === 'error' ? 'Download non riuscito' : 'Video non ancora scaricato'}<br><br><button class="primary" id="p-sync">${icon(r.status === 'paused' ? 'play' : 'download')} ${r.status === 'paused' ? 'Riprendi' : 'Scarica'}</button></div></div>`;
        $('#p-sync').onclick = () => guard(() => r.status === 'paused' ? api.activity.resumeDownload(c.id, r.key) : api.sync([c.id]));
        player = null; return;
    }
    const speeds = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    box.innerHTML = `<video id="vid" preload="metadata" src="${recData.videoUrl}"></video>
        <div class="controls">
            <button id="p-play" class="icon" title="Play / pausa (spazio)" aria-label="Play">${icon('play')}</button>
            <button id="p-back" class="icon" title="−10 s (←)" aria-label="Indietro di 10 secondi">${icon('reset')}</button><button id="p-fwd" class="icon" title="+10 s (→)" aria-label="Avanti di 10 secondi">${icon('refresh')}</button>
            <span class="time" id="p-time">0:00 / 0:00</span>
            <input type="range" id="p-seek" min="0" max="1000" value="0" aria-label="Posizione">
            <select class="speed" id="p-speed" title="Velocità (< >)" aria-label="Velocità">${speeds.map(s => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}×</option>`).join('')}</select>
            <button id="p-skip" class="icon" title="Salta i silenzi (usa i tempi della trascrizione)" aria-label="Salta i silenzi">${icon('skip')}</button>
            <button id="p-full" class="icon" title="Schermo intero (F)" aria-label="Schermo intero">${icon('expand')}</button>
        </div>`;
    const vid = player = $('#vid');
    const saved = Number(localStorage.getItem('speed') || 1); vid.playbackRate = saved; $('#p-speed').value = String(saved);
    const fromSearch = route.t != null ? Number(route.t) : null;   // opened from search: jump to that minute
    const pos = fromSearch != null ? fromSearch : Number(localStorage.getItem('pos:' + r.key) || 0);
    vid.addEventListener('loadedmetadata', () => { if ((fromSearch != null || pos > 5) && pos < vid.duration - 5) vid.currentTime = pos; });
    vid.addEventListener('ratechange', () => { $('#p-speed').value = String(vid.playbackRate); });
    $('#p-play').onclick = () => vid.paused ? vid.play() : vid.pause();
    vid.onclick = () => $('#p-play').click();
    vid.ondblclick = () => $('#p-full').click();
    vid.onplay = () => { $('#p-play').innerHTML = icon('pause'); $('#p-play').setAttribute('aria-label', 'Pausa'); };
    vid.onpause = () => { $('#p-play').innerHTML = icon('play'); $('#p-play').setAttribute('aria-label', 'Play'); localStorage.setItem('pos:' + r.key, vid.currentTime); };
    $('#p-back').onclick = () => vid.currentTime -= 10;
    $('#p-fwd').onclick = () => vid.currentTime += 10;
    $('#p-speed').onchange = e => { vid.playbackRate = +e.target.value; localStorage.setItem('speed', e.target.value); };
    $('#p-full').onclick = () => document.fullscreenElement ? document.exitFullscreen() : box.requestFullscreen();
    let skip = localStorage.getItem('skipSilence') === '1';
    const skipBtn = $('#p-skip');
    const updSkip = () => skipBtn.classList.toggle('on', skip && !!recData.segments);
    updSkip();
    skipBtn.onclick = () => { if (!recData.segments) return toast('Serve la trascrizione con i tempi per saltare i silenzi'); skip = !skip; localStorage.setItem('skipSilence', skip ? '1' : '0'); updSkip(); };
    const seek = $('#p-seek');
    seek.oninput = () => { vid.currentTime = seek.value / 1000 * (vid.duration || 0); };
    let lastSave = 0;
    const tick = () => { const t = vid.currentTime, d = vid.duration || 0; $('#p-time').textContent = `${fmtT(t)} / ${fmtT(d)}`; if (document.activeElement !== seek) seek.value = d ? t / d * 1000 : 0; highlightSegment(t); };
    vid.addEventListener('loadedmetadata', tick); vid.addEventListener('seeked', tick); vid.addEventListener('durationchange', tick);
    vid.ontimeupdate = () => {
        const t = vid.currentTime, d = vid.duration || 0;
        $('#p-time').textContent = `${fmtT(t)} / ${fmtT(d)}`;
        if (document.activeElement !== seek) seek.value = d ? t / d * 1000 : 0;
        if (Date.now() - lastSave > 5000) { lastSave = Date.now(); localStorage.setItem('pos:' + r.key, t); }
        highlightSegment(t);
        // silence skipping (idea from PoliMi Webex Enhancer): jump over gaps > 1.5 s between transcript segments
        if (skip && recData.segments && !vid.paused) {
            const segs = recData.segments;
            if (!segs.some(s => t >= s.start - 0.2 && t <= s.end + 0.3)) {
                const next = segs.find(s => s.start > t);
                if (next && next.start - t > 1.5) vid.currentTime = next.start - 0.2;
            }
        }
    };
}

function highlightSegment(t) {
    const lines = $$('.seg-line');
    if (!lines.length) return;
    let cur = null;
    for (const l of lines) { if (+l.dataset.s <= t) cur = l; else break; }
    if (cur && !cur.classList.contains('cur')) {
        $$('.seg-line.cur').forEach(x => x.classList.remove('cur'));
        cur.classList.add('cur');
        if ($('#r-follow') && $('#r-follow').checked) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

/** Transcript as clean prose, without timestamps: segments joined into paragraphs at pauses. */
function plainTranscript() {
    if (!recData) return '';
    if (!recData.segments) return (recData.text || '').replace(/^\s*\[?\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\]?\s*(-->\s*\S+\s*)?/gm, '').trim();
    const paras = []; let cur = '', prevEnd = 0;
    for (const s of recData.segments) {
        const t = s.text.trim(); if (!t) continue;
        if (cur && ((s.start - prevEnd > 2 && /[.?!…]$/.test(cur)) || (cur.length > 900 && /[.?!…]$/.test(cur)))) { paras.push(cur); cur = ''; }
        cur += (cur ? ' ' : '') + t; prevEnd = s.end;
    }
    if (cur) paras.push(cur);
    return paras.join('\n\n');
}

function drawSide(c, r) {
    const el = $('#r-side'); if (!el || !recData) return;
    const side = sideTab();
    if (side === 'testo') {
        if (!recData.segments && !recData.text) {
            const tp = tprog[vpath(c, r)];
            el.innerHTML = `<div class="empty-state"><h2>Nessuna trascrizione</h2><p>${typeof tp === 'number' ? `Trascrizione in corso: ${tp}%` : tp === 'queued' ? 'In coda per la trascrizione…' : r.videoExists ? 'Trascrivi la lezione per avere il testo sincronizzato col video.' : 'Scarica prima il video.'}</p>
                ${r.videoExists && !tp ? `<button class="primary" id="s-tr">${icon('mic')} Trascrivi ora</button>` : ''}</div>`;
            if ($('#s-tr', el)) $('#s-tr', el).onclick = () => guard(async () => { await api.transcribe(c.id, [r.key]); tprog[vpath(c, r)] = 'queued'; drawSide(c, r); });
            return;
        }
        el.innerHTML = `<div class="t-bar"><input type="search" id="t-q" placeholder="Cerca nella trascrizione…"><label class="t-follow" title="Scorri la trascrizione insieme al video"><input type="checkbox" id="r-follow" checked>Segui</label><button class="small ghost icon" id="t-copy" title="Copia tutta la trascrizione, senza tempi" aria-label="Copia la trascrizione">${icon('copy')}</button></div><div id="t-body"></div>`;
        const draw = q => {
            const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
            if (recData.segments) {
                $('#t-body', el).innerHTML = recData.segments.filter(s => !rx || s.text.match(rx)).map(s => `<div class="seg-line" data-s="${s.start}"><span class="ts">${fmtT(s.start)}</span><span>${rx ? esc(s.text).replace(rx, m => `<mark>${m}</mark>`) : esc(s.text)}</span></div>`).join('');
                $$('.seg-line', el).forEach(l => l.onclick = () => { if (player) { player.currentTime = +l.dataset.s; player.play(); } });
            } else $('#t-body', el).innerHTML = `<div class="md">${esc(recData.text).replace(/\n/g, '<br>')}</div>`;
        };
        draw('');
        $('#t-q', el).oninput = e => draw(e.target.value.trim());
        $('#t-copy', el).onclick = () => guard(async () => {
            const txt = plainTranscript();
            await api.copy(txt);
            toast(`Trascrizione copiata (${txt.split(/\s+/).length.toLocaleString('it-IT')} parole)`);
        });
    } else drawLinkedNotes(c, r, el);
}

// ── user notes linked to this lesson ──
const lessonLabel = (cid, key) => {
    const cc = course(cid); const rr = cc && cc.recordings.find(x => x.key === key);
    if (!rr) return 'lezione rimossa';
    return `${rr.isoDate ? new Date(rr.isoDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' · ' : ''}${rr.displayTitle || rr.file}`;
};
async function drawLinkedNotes(c, r, el) {
    el.innerHTML = '<div class="empty-state"><span class="spin"></span></div>';
    const list = await api.notes.forLesson(c.id, r.key);
    if (sideTab() !== 'appunti' || !el.isConnected) return;
    el.innerHTML = `<div class="ln-actions"><button class="small" id="ln-new">${icon('plus')} Nuovo appunto</button><button class="small ghost" id="ln-link">Collega esistente…</button></div>
        ${list.length ? list.map(n => `<div class="ln-item" data-scope="${esc(n.scope || '')}" data-f="${esc(n.file)}" data-k="${n.kind}">
            <div class="row"><span class="badge-k ${n.kind}">${({ markdown: 'MD', latex: 'TeX', typst: 'Typ' })[n.kind]}</span><b class="grow">${esc(n.file.replace(/\.(md|tex|typ)$/, ''))}</b><button class="icon ghost small" data-unlink title="Scollega da questa lezione">✕</button></div>
            <div class="faint ln-sub">${n.scope ? esc(cname(course(n.scope) || { name: '' })) : 'Generale'}${n.links.length > 1 ? ` · collegato anche a ${n.links.length - 1} altr${n.links.length === 2 ? 'a lezione' : 'e lezioni'}` : ''}</div></div>`).join('')
            : `<div class="empty-state small"><p>Nessun appunto collegato a questa lezione.</p><p class="faint">Un appunto può essere collegato a più lezioni: crealo qui o collegalo dall'editor degli appunti.</p></div>`}`;
    $('#ln-new', el).onclick = () => guard(async () => {
        const x = await askNewNote(S.settings.editor.mode || 'markdown');
        if (!x) return;
        const f = await api.notes.createLinked(c.id, x.title, x.kind, [{ c: c.id, k: r.key }]);
        go({ name: 'notes', scope: c.id, file: f, kind: x.kind });
    });
    $('#ln-link', el).onclick = () => pickNotesToLink(c, r).then(ok => ok && drawLinkedNotes(c, r, el));
    $$('.ln-item', el).forEach(it => it.onclick = e => {
        const scope = it.dataset.scope || null;
        if (e.target.closest('[data-unlink]')) {
            e.stopPropagation();
            return guard(async () => { const cur = await api.notes.links(scope, it.dataset.f); await api.notes.setLinks(scope, it.dataset.f, cur.filter(l => !(l.c === c.id && l.k === r.key))); drawLinkedNotes(c, r, el); });
        }
        go({ name: 'notes', scope, file: it.dataset.f, kind: it.dataset.k });
    });
}
async function pickNotesToLink(c, r) {
    const scopes = [{ id: c.id, name: cname(c) }, { id: null, name: 'Generale' }];
    const lists = await Promise.all(scopes.map(async s => ({ s, files: await api.notes.list(s.id), links: await Promise.all((await api.notes.list(s.id)).map(f => api.notes.links(s.id, f.file))) })));
    return new Promise(resolve => {
        const m = modal(`<h2>Collega appunti a questa lezione</h2><p class="muted" style="margin-top:0">${esc(lessonLabel(c.id, r.key))}</p>
            <div class="pick-list">${lists.map(({ s, files, links }) => files.length ? `<div class="pick-h">${esc(s.name)}</div>${files.map((f, i) => `<label class="pick"><input type="checkbox" data-scope="${esc(s.id || '')}" data-f="${esc(f.file)}" ${links[i].some(l => l.c === c.id && l.k === r.key) ? 'checked' : ''}><span class="badge-k ${f.kind}">${({ markdown: 'MD', latex: 'TeX', typst: 'Typ' })[f.kind]}</span>${esc(f.file.replace(/\.(md|tex|typ)$/, ''))}</label>`).join('')}` : '').join('') || '<p class="muted">Non ci sono ancora appunti.</p>'}</div>
            <div class="foot"><button class="ghost" id="pk-no">Annulla</button><button class="primary" id="pk-ok">Salva</button></div>`);
        $('#pk-no', m.el).onclick = () => { m.close(); resolve(false); };
        $('#pk-ok', m.el).onclick = () => guard(async () => {
            for (const cb of $$('input[data-f]', m.el)) {
                const scope = cb.dataset.scope || null;
                const cur = await api.notes.links(scope, cb.dataset.f);
                const has = cur.some(l => l.c === c.id && l.k === r.key);
                if (cb.checked && !has) await api.notes.setLinks(scope, cb.dataset.f, [...cur, { c: c.id, k: r.key }]);
                if (!cb.checked && has) await api.notes.setLinks(scope, cb.dataset.f, cur.filter(l => !(l.c === c.id && l.k === r.key)));
            }
            m.close(); resolve(true);
        });
    });
}

// ── "Studia con l'AI": flashcard, domande d'esame, appunti, spiegazioni, riassunto + domande libere ──
const STUDY = [
    ['flashcard', '🃏', 'Flashcard', 'Ripassa con le carte'],
    ['domande', '❓', 'Domande d\'esame', 'Con traccia di risposta'],
    ['appunti', '📝', 'Appunti', 'Completi e strutturati'],
    ['spiegazione', '💡', 'Spiegazioni', 'I concetti difficili'],
    ['riassunto', '📄', 'Riassunto', 'In una pagina'],
];
function parseQA(mdText) {
    const out = [];
    for (const b of mdText.split(/^#{2,4}\s*(?:D|Q|Domanda)\s*[:.)]\s*/m).slice(1)) {
        const [q, ...rest] = b.split(/^\s*(?:\*\*)?(?:R|A|Risposta)\s*[:.)](?:\*\*)?\s*/m);
        if (q && rest.length) out.push({ q: q.trim(), a: rest.join('').replace(/\n-{3,}\s*$/, '').trim() });
    }
    return out;
}
function drawStudy(c, r) {
    const el = $('#r-study'); if (!el || !recData) return;
    const can = !!(recData.segments || recData.text);
    const have = Object.fromEntries(recData.notes.map(n => [n.kind, n]));
    const sel = route.study && (have[route.study] || route.study === 'chat') ? route.study : null;
    const prov = (S.tools.ai[S.settings.ai.provider] || {}).label || 'AI';
    if (!can) { el.innerHTML = `<div class="study-head"><h2>Studia con l'AI</h2></div><p class="muted" style="margin:0">Flashcard, domande d'esame, appunti e chat sulla lezione si attivano quando la lezione è trascritta.</p>`; return; }
    el.innerHTML = `<div class="study-head"><h2>Studia con l'AI</h2><span class="faint">${esc(prov)}</span></div>
        <div class="study-tools" role="toolbar">${STUDY.map(([k, ic, t, d]) => `<button class="stool ${sel === k ? 'on' : ''} ${have[k] ? 'has' : ''}" data-k="${k}" title="${esc(d)}${have[k] ? ' · pronto' : ' · da generare'}">${t}</button>`).join('')}</div>
        <div id="st-out" class="st-out ${sel && sel !== 'chat' ? '' : 'hidden'}"></div>
        <div class="st-chat">
            <div id="st-msgs" class="st-msgs"></div>
            <div class="st-sugg" id="st-sugg">${['Spiegami il concetto principale in modo semplice', 'Fammi un esempio pratico', 'Cosa devo sapere per l\'esame?', 'Quali sono le formule chiave?'].map(s => `<button class="small soft" data-sugg="${esc(s)}" ${can ? '' : 'disabled'}>${esc(s)}</button>`).join('')}</div>
            <div class="st-ask"><textarea id="st-q" rows="1" placeholder="Chiedi qualcosa su questa lezione…"></textarea><button class="primary" id="st-send" aria-label="Invia" title="Invia (↵)">${icon('forward')}</button></div>
        </div>`;
    const show = k => {
        route.study = k;
        $$('.stool', el).forEach(b => b.classList.toggle('on', b.dataset.k === k));
        const out = $('#st-out', el); out.classList.remove('hidden');
        const n = recData.notes.find(x => x.kind === k);
        if (!n) return generate(k);
        const qa = (k === 'flashcard' || k === 'domande') ? parseQA(n.content) : [];
        out.innerHTML = `<div class="st-out-head"><b>${STUDY.find(s => s[0] === k)[2]}</b><span class="grow"></span>
            <button class="small ghost" data-a="save" title="Crea un appunto modificabile collegato a questa lezione">Salva negli appunti</button><button class="small ghost icon" data-a="copy" title="Copia" aria-label="Copia">${icon('copy')}</button><button class="small ghost icon" data-a="regen" title="Rigenera" aria-label="Rigenera">${icon('refresh')}</button><button class="small ghost icon" data-a="file" title="Apri il file" aria-label="Apri il file">${icon('external')}</button><button class="small ghost icon" data-a="close" title="Chiudi" aria-label="Chiudi">✕</button></div>
            <div class="st-body" id="st-body"></div>`;
        const body = $('#st-body', out);
        if (k === 'flashcard' && qa.length) flashDeck(body, qa);
        else if (k === 'domande' && qa.length) body.innerHTML = `<div class="qa-list">${qa.map((x, i) => `<details class="qa"><summary><span class="qa-n">${i + 1}</span><span class="md">${md(x.q)}</span></summary><div class="md">${md(x.a)}</div></details>`).join('')}</div>`;
        else body.innerHTML = `<div class="md">${md(n.content)}</div>`;
        $$('[data-a]', out).forEach(b => b.onclick = () => guard(async () => {
            const a = b.dataset.a;
            if (a === 'copy') { await api.copy(n.content); toast('Copiato'); }
            else if (a === 'file') api.open(c.id, 'notes', n.file);
            else if (a === 'close') { route.study = null; out.classList.add('hidden'); $$('.stool', el).forEach(x => x.classList.remove('on')); }
            else if (a === 'regen') generate(k);
            else if (a === 'save') {
                const f = await api.notes.createLinked(c.id, `${r.displayTitle || 'Lezione'} — ${STUDY.find(s => s[0] === k)[2]}`, 'markdown', [{ c: c.id, k: r.key }], n.content);
                toast('Appunto creato e collegato alla lezione'); go({ name: 'notes', scope: c.id, file: f, kind: 'markdown' });
            }
        }));
    };
    const generate = k => {
        const out = $('#st-out', el); out.classList.remove('hidden');
        out.innerHTML = `<div class="st-out-head"><span class="spin"></span><b>Genero ${STUDY.find(s => s[0] === k)[2].toLowerCase()}…</b><span class="faint">può richiedere un minuto</span></div><pre class="st-stream" id="st-stream"></pre>`;
        aiStream = $('#st-stream', out); window.aiWant = { key: r.key, template: k };
        $$('.stool', el).forEach(b => b.disabled = true);
        guard(async () => { await api.genNote(c.id, r.key, k); recData = await api.recording(c.id, r.key); })
            .finally(() => { aiStream = null; window.aiWant = null; drawStudy(c, r); drawInfo(c, r); if (recData.notes.some(n => n.kind === k)) { route.study = k; drawStudy(c, r); } });
    };
    $$('.stool', el).forEach(b => b.onclick = () => show(b.dataset.k));
    if (sel && sel !== 'chat') show(sel);
    // chat
    const msgs = lessonChats[r.key] = lessonChats[r.key] || [];
    const drawMsgs = () => {
        const box = $('#st-msgs', el);
        $('#st-sugg', el).classList.toggle('hidden', msgs.length > 0);
        box.innerHTML = msgs.map((m, i) => `<div class="msg ${m.role}">${m.role === 'user' ? esc(m.text) : `<div class="md">${md(m.text)}</div><div class="msg-act"><button class="small ghost" data-copy="${i}">Copia</button><button class="small ghost" data-save="${i}">Salva negli appunti</button></div>`}</div>`).join('');
        $$('[data-copy]', box).forEach(b => b.onclick = () => guard(async () => { await api.copy(msgs[+b.dataset.copy].text); toast('Copiato'); }));
        $$('[data-save]', box).forEach(b => b.onclick = () => guard(async () => {
            const i = +b.dataset.save; const q = (msgs[i - 1] || {}).text || 'Domanda';
            const f = await api.notes.createLinked(c.id, `${q.slice(0, 50)}`, 'markdown', [{ c: c.id, k: r.key }], `# ${q}\n\n${msgs[i].text}`);
            toast('Salvato negli appunti, collegato alla lezione'); go({ name: 'notes', scope: c.id, file: f, kind: 'markdown' });
        }));
    };
    drawMsgs();
    const ask = q => {
        q = (q || '').trim(); if (!q || aiStream) return;
        const history = msgs.slice();
        msgs.push({ role: 'user', text: q });
        drawMsgs();
        const box = $('#st-msgs', el);
        const bubble = document.createElement('div'); bubble.className = 'msg assistant'; bubble.innerHTML = '<pre class="st-stream"><span class="spin"></span></pre>'; box.appendChild(bubble);
        bubble.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        aiStream = $('pre', bubble); window.aiWant = { key: r.key, template: 'domanda' };
        $('#st-q', el).value = '';
        api.askLesson(c.id, r.key, q, history).then(a => msgs.push({ role: 'assistant', text: a.trim() }))
            .catch(e => msgs.push({ role: 'assistant', text: '✗ ' + e.message }))
            .finally(() => { aiStream = null; window.aiWant = null; drawMsgs(); const last = $('#st-msgs', el).lastElementChild; if (last) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    };
    const ta = $('#st-q', el);
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(ta.value); } };
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };
    $('#st-send', el).onclick = () => ask(ta.value);
    $$('[data-sugg]', el).forEach(b => b.onclick = () => ask(b.dataset.sugg));
}

function flashDeck(el, cards) {
    let i = 0, flipped = false;
    const known = new Set();
    const draw = () => {
        const x = cards[i];
        el.innerHTML = `<div class="deck">
            <div class="fcard ${flipped ? 'flip' : ''}" id="fc"><div class="fside front"><span class="faint">Domanda ${i + 1} di ${cards.length}</span><div class="md">${md(x.q)}</div><span class="faint fc-hint">clic o spazio per girare</span></div>
                <div class="fside back"><span class="faint">Risposta</span><div class="md">${md(x.a)}</div></div></div>
            <div class="deck-bar"><button id="fc-prev">←</button><span class="faint">${known.size} sapute · ${cards.length - known.size} da ripassare</span><span class="grow"></span>
                <button id="fc-no" class="small">✗ Da ripassare</button><button id="fc-yes" class="small primary">✓ La so</button><button id="fc-next">→</button></div>
            <div class="deck-prog"><i style="width:${(i + 1) / cards.length * 100}%"></i></div></div>`;
        $('#fc', el).onclick = () => { flipped = !flipped; $('#fc', el).classList.toggle('flip', flipped); };
        const move = d => { i = (i + d + cards.length) % cards.length; flipped = false; draw(); };
        $('#fc-prev', el).onclick = () => move(-1);
        $('#fc-next', el).onclick = () => move(1);
        $('#fc-yes', el).onclick = () => { known.add(i); move(1); };
        $('#fc-no', el).onclick = () => { known.delete(i); move(1); };
    };
    draw();
    el.tabIndex = 0;
    el.onkeydown = e => {
        if (/input|textarea/i.test(document.activeElement.tagName) && document.activeElement !== el) return;
        if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); $('#fc', el) && $('#fc', el).click(); }
        else if (e.key === 'ArrowRight') { e.stopPropagation(); $('#fc-next', el).click(); }
        else if (e.key === 'ArrowLeft') { e.stopPropagation(); $('#fc-prev', el).click(); }
    };
}

function drawInfo(c, r) {
    const el = $('#r-info'); if (!el || !recData) return;
    const sum = recData.notes.find(n => n.kind === 'sommario');
    const hasText = !!(recData.segments || recData.text);
    el.innerHTML = `<div class="block-h"><b>Sommario</b><span class="grow"></span>${hasText && !sum ? `<button class="small" id="i-sum">${icon('sparkles')} Genera</button>` : ''}</div>
        ${sum ? `<div class="md">${md(sum.content.replace(/^#\s.*\n+/, ''))}</div>` : `<p class="faint" style="margin:0">${hasText ? 'Non ancora generato.' : 'Comparirà qui dopo la trascrizione.'}</p>`}`;
    if ($('#i-sum', el)) $('#i-sum', el).onclick = () => lessonActions(c, r).sum();
}

document.addEventListener('keydown', e => {
    if (!player || route.name !== 'recording' || /input|textarea|select/i.test(document.activeElement.tagName) || $('#modal-root').innerHTML) return;
    if (e.code === 'Space') { e.preventDefault(); player.paused ? player.play() : player.pause(); }
    else if (e.key === 'ArrowLeft') player.currentTime -= 10;
    else if (e.key === 'ArrowRight') player.currentTime += 10;
    else if (e.key.toLowerCase() === 'f') $('#p-full') && $('#p-full').click();
    else if (e.key === '>' || e.key === '.') player.playbackRate = Math.min(3, player.playbackRate + 0.25);
    else if (e.key === '<' || e.key === ',') player.playbackRate = Math.max(0.5, player.playbackRate - 0.25);
});
document.addEventListener('keydown', e => {
    if (route.name !== 'recording' || e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(document.activeElement.tagName) || $('#modal-root').innerHTML || $('#palette') || !window.lessonCmd) return;
    if (e.key === '[') { e.preventDefault(); window.lessonCmd.prev(); }
    else if (e.key === ']') { e.preventDefault(); window.lessonCmd.next(); }
});

// ───────── settings ─────────
function viewSettings(v) {
    const s = S.settings, ui = s.ui || {};
    const seg = (id, val, opts) => `<div class="seg" data-seg="${id}">${opts.map(([k, l]) => `<button data-v="${k}" class="${val === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const prov = Object.entries(S.tools.ai).map(([k, x]) => `<option value="${k}" ${s.ai.provider === k ? 'selected' : ''} ${x.path ? '' : 'disabled'}>${esc(x.label)}${x.path ? '' : ' (non installato)'}</option>`).join('');
    v.innerHTML = `<div class="page"><div class="page-head"><div><h1>Impostazioni</h1></div></div>
    <div class="group"><h3>Aspetto</h3>
        ${field('Tema', 'Normale in stile macOS, oppure Developer con font monospace e colori da editor', seg('theme', ui.theme || 'normal', [['normal', 'Normale'], ['developer', 'Developer']]))}
        ${field('Chiaro / scuro', '', seg('appearance', ui.appearance || 'auto', [['auto', 'Sistema'], ['light', 'Chiaro'], ['dark', 'Scuro']]))}
        ${field('Font', 'JetBrains Mono è incluso nell\'app', `<select id="s-font">${[['auto', 'Automatico (dal tema)'], ['system', 'Sistema (San Francisco / Segoe UI)'], ['jetbrains', 'JetBrains Mono'], ['serif', 'Serif']].map(([k, l]) => `<option value="${k}" ${(ui.font || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${field('Dimensione testo', '', seg('size', ui.size || '', [['small', 'Piccolo'], ['', 'Normale'], ['large', 'Grande']]))}
    </div>
    <div class="group"><h3>Sincronizzazione</h3>
        ${field('Sincronizza all\'avvio', 'All\'apertura controlla tutti i corsi, nell\'ordine di priorità della dashboard', sw('s-onstart', s.autoSync.onStart))}
        ${field('Ripeti ogni', 'Mentre l\'app è aperta (0 = mai)', `<input id="s-interval" type="number" min="0" max="48" style="width:90px" value="${s.autoSync.intervalHours || 0}"><span class="muted">ore</span>`)}
        ${field('Download in parallelo', '', `<input id="s-par" type="number" min="1" max="8" style="width:90px" value="${s.parallelDownloads}">`)}
        ${field('Mostra il browser', 'La sincronizzazione usa Chrome in background, senza finestre: il login PoliMi si apre in una finestra di PoliRec solo quando serve. Attiva per vedere Chrome mentre lavora (utile se qualcosa non funziona).', sw('s-showbrowser', !!(s.browser || {}).show))}
        ${field('Email PoliMi', 'Usata per completare il login WebEx', `<input id="s-email" value="${esc(s.polimiEmail || '')}" placeholder="nome.cognome@mail.polimi.it">`)}
        ${field('Cartella base', 'Proposta quando aggiungi un corso', `<input id="s-root" value="${esc(s.defaultRoot || '')}"><button id="s-root-pick">Sfoglia…</button>`)}
    </div>
    <div class="group"><h3>Trascrizione</h3>
        ${field('Motore', 'Configurato dal setup per questo computer', `<span class="pill ${s.setupDone ? 'ok' : 'warn'}">${esc(s.transcription.engine || 'auto')} · ${esc(s.transcription.model)}</span><span class="grow"></span><button id="s-setup">Rifai il setup…</button>`)}
        ${field('Trascrivi automaticamente', 'Dopo ogni download', sw('s-tauto', s.transcription.auto))}
        ${field('Modello', 'Più grande = più preciso ma più lento', `<select id="s-model">${['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v3'].map(m => `<option ${s.transcription.model === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}
        ${field('Lingua predefinita', 'Ogni corso può sovrascriverla', `<select id="s-lang">${[['auto', 'Rilevamento automatico'], ['it', 'Italiano'], ['en', 'Inglese']].map(([k, l]) => `<option value="${k}" ${s.transcription.language === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    </div>
    <div class="group"><h3>AI</h3>
        ${field('Strumento', 'CLI usata per sommari, appunti e agente', `<select id="s-prov">${prov}</select>`)}
        ${field('Modello', 'Vuoto = predefinito del CLI', `<input id="s-aimodel" value="${esc(s.ai.model || '')}">`)}
        ${field('Sommario automatico', 'Dopo la trascrizione: breve descrizione degli argomenti, mostrata nel riepilogo del corso', sw('s-sum', s.ai.autoSummary))}
        ${field('Appunti automatici', 'Dopo la trascrizione genera anche gli appunti completi', sw('s-notes', s.ai.autoNotes))}
    </div>
    <div id="s-extra"></div>
    <div class="row"><span class="faint">Configurazione: ~/.polirec/config.json</span><span class="grow"></span><button class="primary" id="s-save">Salva</button></div></div>`;
    if (window.settingsExtra) window.settingsExtra(v);
    const set = (k, val) => { S.settings.ui = { ...(S.settings.ui || {}), [k]: val }; applyUi(); };
    $$('[data-seg]', v).forEach(g => $$('button', g).forEach(b => b.onclick = () => {
        $$('button', g).forEach(x => x.classList.toggle('on', x === b));
        set(g.dataset.seg, b.dataset.v);
        if (g.dataset.seg === 'appearance') api.setAppearance(b.dataset.v);
        api.saveSettings({ ui: S.settings.ui });
    }));
    $('#s-font', v).onchange = e => { set('font', e.target.value); api.saveSettings({ ui: S.settings.ui }); };
    $('#s-root-pick', v).onclick = async () => { const d = await api.pickDir($('#s-root', v).value); if (d) $('#s-root', v).value = d; };
    $('#s-setup', v).onclick = () => { render.skippedSetup = false; go({ name: 'setup' }); };
    $('#s-save', v).onclick = () => guard(async () => {
        await api.saveSettings({
            parallelDownloads: Math.max(1, Math.min(8, +$('#s-par', v).value || 3)), polimiEmail: $('#s-email', v).value.trim(), defaultRoot: $('#s-root', v).value,
            autoSync: { onStart: $('#s-onstart', v).checked, intervalHours: Math.max(0, +$('#s-interval', v).value || 0) },
            browser: { ...(s.browser || {}), show: $('#s-showbrowser', v).checked },
            transcription: { ...s.transcription, auto: $('#s-tauto', v).checked, model: $('#s-model', v).value, language: $('#s-lang', v).value },
            ai: { ...s.ai, provider: $('#s-prov', v).value, model: $('#s-aimodel', v).value, autoSummary: $('#s-sum', v).checked, autoNotes: $('#s-notes', v).checked },
        });
        toast('Impostazioni salvate'); $('#view').dataset.view = ''; refresh();
    });
}

// ───────── setup (first run) ─────────
function viewSetup(v) {
    v.innerHTML = `<div class="setup"><h1>Benvenuto in PoliRec</h1>
        <p class="muted">Configuro la trascrizione per questo computer: creo un ambiente Python privato (in <code>~/.polirec</code>, non tocca il sistema), installo il motore Whisper più adatto e scarico il modello.</p>
        <div id="su-body"><div class="empty-state"><span class="spin"></span> Analizzo il sistema…</div></div></div>`;
    guard(async () => {
        const { hw, rec } = await api.setupDetect();
        const ok = x => x ? '<span style="color:var(--ok)">✓</span>' : '<span style="color:var(--err)">✗</span>';
        $('#su-body').innerHTML = `<div class="hw">
            <div><b>Sistema</b>${esc(hw.platform === 'darwin' ? 'macOS' : hw.platform === 'win32' ? 'Windows' : 'Linux')} · ${esc(hw.arch)}</div>
            <div><b>Processore</b>${esc(hw.cpu)} · ${hw.cores} core</div>
            <div><b>Memoria</b>${hw.ramGB} GB</div>
            <div><b>Accelerazione</b>${hw.appleSilicon ? 'Apple Silicon (Metal)' : hw.nvidia ? esc(hw.nvidia.name) + ` · ${hw.nvidia.vramGB} GB` : 'Solo CPU'}</div>
            <div><b>Browser per il login</b>${ok(hw.chrome)} ${esc(hw.chrome ? hw.chrome.split(/[\\/]/).slice(-1)[0] : 'Installa Google Chrome')}</div>
            <div><b>Strumenti</b>${ok(hw.ffmpeg)} ffmpeg · ${hw.aria2c ? ok(1) + ' aria2c' : '<span class="faint">downloader interno</span>'}</div>
            <div><b>Python</b>${hw.venv ? ok(1) + ' ambiente già pronto' : hw.uv ? ok(1) + ' uv' : hw.pythons.length ? ok(1) + ' ' + esc(hw.pythons[0].version) : '<span class="faint">verrà installato</span>'}</div>
            <div><b>AI</b>${Object.entries(hw.ai).map(([k, p]) => `${ok(p)} ${k}`).join(' · ')}</div>
        </div>
        <div class="info-card" style="margin-top:0"><b>Configurazione consigliata</b><p style="margin:6px 0 0">Motore <b>${rec.engine === 'mlx' ? 'mlx-whisper' : 'faster-whisper'}</b> su <b>${esc(rec.device)}</b> con modello <b>${esc(rec.model)}</b>.</p>
            <div class="row" style="margin-top:10px"><span class="muted">Modello</span><select id="su-model" style="width:auto">${['tiny', 'base', 'small', 'medium', 'large-v3-turbo'].map(m => `<option ${m === rec.model ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
        <div class="steps" id="su-steps"></div>
        <div class="row"><button class="ghost" id="su-skip">Salta (niente trascrizione)</button><span class="grow"></span><button class="primary" id="su-go">Installa e continua</button></div>
        <pre class="setup-log hidden" id="su-log"></pre>`;
        $('#su-skip').onclick = () => guard(async () => { await api.setupSkip(); render.skippedSetup = true; await refresh(); go({ name: 'dashboard' }); });
        $('#su-go').onclick = () => guard(async () => {
            const steps = { python: 'Ambiente Python', engine: 'Motore di trascrizione', model: 'Modello Whisper' };
            $('#su-steps').innerHTML = Object.entries(steps).map(([k, l]) => `<div class="step" id="st-${k}"><span class="s faint">○</span><span>${l}</span><span class="grow"></span><span class="muted d"></span></div>`).join('');
            $('#su-log').classList.remove('hidden');
            $('#su-go').disabled = $('#su-skip').disabled = true;
            await api.setupInstall({ ...rec, model: $('#su-model').value });
            toast('Setup completato');
            await refresh(); go({ name: 'dashboard' });
            if (!S.courses.length) openAddCourse();
        });
    });
}

// ───────── community ─────────
const COMMUNITY = [
    { name: 'PoliWebex', by: 'sup3rgiu', url: 'https://github.com/sup3rgiu/PoliWebex', lic: 'MIT', used: 'Base del motore di download WebEx (codice originale in legacy/).' },
    { name: 'PoliDown', by: 'sup3rgiu', url: 'https://github.com/sup3rgiu/PoliDown', lic: 'MIT', used: 'Riferimento per il supporto ai video Microsoft Stream / SharePoint (in programma).' },
    { name: 'polimi-schedule-js', by: 'bebora', url: 'https://github.com/bebora/polimi-schedule-js', lic: 'MIT', used: 'Portato in Rust nel backend: converte l\'orario dei Servizi Online nel Calendario dell\'app e in .ics.' },
    { name: 'Handy', by: 'CJ Pais', url: 'https://github.com/cjpais/Handy', lic: 'MIT', used: 'Ispirazione: dettatura push-to-talk negli appunti e motore Parakeet (opzionale).' },
    { name: 'WeBeepSync', by: 'Tommaso Morganti', url: 'https://github.com/toto04/webeep-sync', lic: 'GPL-3.0', used: 'Ispirazione per la sincronizzazione incrementale del materiale WeBeep (reimplementata da zero). In programma: accesso tramite token dell\'app mobile Moodle.' },
    { name: 'PoliMi Webex Enhancer', by: 'Francesco Vagli', url: 'https://github.com/fravagli/Polimi-webex-enhancer', lic: 'GPL-3.0', used: 'Ispirazione: player offline, salto dei silenzi, testo sincronizzato (reimplementati).' },
    { name: 'WebXDownloader', by: 'jacopo-j', url: 'https://github.com/jacopo-j/WebXDownloader', lic: 'MIT', used: 'Riferimento per le API di download WebEx.' },
    { name: 'Polimi Exam Calendar', by: 'frephs', url: 'https://github.com/frephs/polimi-exam-calendar', lic: 'MIT', used: 'Estensione browser: calendario nella pagina iscrizione esami.' },
    { name: '@alpolimibot', by: 'riccardosalemme', url: 'https://github.com/riccardosalemme/alpolimibot', lic: 'GPL-3.0', used: 'Ispirazione per la sezione Aule libere (client per le API pubbliche Polimi scritto da zero).' },
    { name: 'PoliAule', by: 'PoliNetwork', url: 'https://poliaule.com', lic: '—', used: 'Ispirazione per la sezione Aule libere.' },
    { name: 'PoliAuth', by: 'PoliAuth', url: 'https://github.com/PoliAuth/PoliAuthenticator', lic: 'nessuna', used: 'Login automatico ai Servizi Online (solo link: senza licenza non è integrabile).' },
    { name: 'PoliPlease', by: 'Alessandro Berardi', url: 'https://github.com/berryno/PoliPlease', lic: 'nessuna', used: 'Orario settimanale personalizzabile (solo link).' },
    { name: 'Materiali e Appunti', by: 'PoliNetwork', url: 'https://polinetwork.org/it/materials/', lic: '—', used: 'Archivio di appunti degli studenti.' },
];
function viewCommunity(v) {
    v.innerHTML = `<div class="page community"><div class="page-head"><div><h1>Community</h1><div class="sub">PoliRec è costruito sul lavoro della community studentesca del Politecnico, in particolare dei progetti raccolti da <a data-ext="https://polinetwork.org/it/projects/">PoliNetwork</a>. Grazie!</div></div></div>
        <div class="grid">${COMMUNITY.map(p => `<div class="card"><div class="t">${esc(p.name)} <span class="pill ${p.lic === 'MIT' ? 'ok' : p.lic.startsWith('GPL') ? 'acc' : ''}">${esc(p.lic)}</span></div>
            <div class="muted">di ${esc(p.by)}</div><div>${esc(p.used)}</div><div><a data-ext="${esc(p.url)}">${esc(p.url.replace(/^https?:\/\//, ''))} ↗</a></div></div>`).join('')}</div></div>`;
    $$('[data-ext]', v).forEach(a => a.onclick = () => api.openExternal(a.dataset.ext));
}

// ───────── modals ─────────
function modal(html, { wide } = {}) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-bg"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`;
    const bg = $('.modal-bg', root);
    const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    bg.onclick = e => { if (e.target === bg) close(); };
    document.addEventListener('keydown', onKey);
    return { el: $('.modal', root), close };
}

function openAddCourse() {
    const root = (S.settings.defaultRoot || '').replace(/[\\/]$/, '');
    const m = modal(`<h2>Aggiungi corso</h2>
        <label class="l">Corso<input id="a-in" placeholder="Link WeBeep (anche di una sezione), codice o nome"><span class="help">Es. https://webeep.polimi.it/course/view.php?id=24218 · 054307 · machine learning</span></label>
        <div><button id="a-pick">📚 Scegli dai miei corsi WeBeep</button></div>
        <div id="a-list" class="pick hidden"></div>
        <label class="l">Nome breve<input id="a-name" placeholder="es. ANN&DL"></label>
        <label class="l">Cartella di destinazione<div class="row"><input id="a-dir" value="${esc(root)}"><button id="a-dirp">Sfoglia…</button></div></label>
        <label class="l">Lingua delle lezioni<select id="a-lang"><option value="">Come impostazioni generali</option><option value="it">Italiano</option><option value="en">Inglese</option><option value="auto">Rilevamento automatico</option></select></label>
        <div class="field" style="padding:6px 0;grid-template-columns:1fr auto"><label>Scaricare anche il materiale del corso?<div class="help">Slide, PDF, cartelle e file pubblicati su WeBeep, divisi per sezione</div></label><div class="ctl">${sw('a-mat', true)}</div></div>
        <div class="foot"><button class="ghost" id="a-cancel">Annulla</button><button class="primary" id="a-ok">Aggiungi e sincronizza</button></div>`);
    const el = m.el;
    const setDir = name => { if (root && (!$('#a-dir', el).value || $('#a-dir', el).value.startsWith(root))) $('#a-dir', el).value = root + '/' + name.replace(/[\\/:*?"<>|]/g, '-'); };
    $('#a-name', el).oninput = e => setDir(e.target.value);
    $('#a-dirp', el).onclick = async () => { const d = await api.pickDir($('#a-dir', el).value); if (d) $('#a-dir', el).value = d; };
    $('#a-pick', el).onclick = () => guard(async () => {
        const list = $('#a-list', el); list.classList.remove('hidden');
        list.innerHTML = '<div class="muted"><span class="spin"></span> Apro WeBeep in Chrome (potrebbe servire il login)…</div>';
        const cs = (await api.webeepCourses()).sort((a, b) => b.id - a.id);
        const added = new Set(S.courses.map(c => c.webeepId));
        list.innerHTML = cs.map(c => `<div data-id="${c.id}" data-n="${esc(c.fullname)}" ${added.has(c.id) ? 'class="faint"' : ''}>${esc(c.fullname)}${added.has(c.id) ? ' · già aggiunto' : ''}</div>`).join('');
        $$('[data-id]', list).forEach(d => d.onclick = () => {
            $$('[data-id]', list).forEach(x => x.classList.toggle('on', x === d));
            $('#a-in', el).value = 'webeep:' + d.dataset.id;
            const short = d.dataset.n.replace(/^\d+\s*-\s*/, '').replace(/\s*[([].*$/, '').trim();
            const acronym = short.split(/\s+/).filter(w => w.length > 3).map(w => w[0]).join('').toUpperCase();
            $('#a-name', el).value = short.length > 22 ? acronym || short : short;
            setDir($('#a-name', el).value);
        });
    });
    $('#a-cancel', el).onclick = m.close;
    $('#a-ok', el).onclick = () => guard(async () => {
        const c = await api.addCourse({ input: $('#a-in', el).value, dir: $('#a-dir', el).value, name: $('#a-name', el).value, language: $('#a-lang', el).value, materials: $('#a-mat', el).checked });
        m.close(); await refresh(); go({ name: 'course', courseId: c.id, tab: 'panoramica' });
        api.sync([c.id]);
    });
}

const PRESETS = [
    ['Riassunto del corso', 'Leggi tutte le trascrizioni (e le note già presenti) e scrivi un riassunto dell\'intero corso organizzato per argomenti, con i collegamenti tra le lezioni. Salvalo in note/00_riassunto_corso.md'],
    ['Guida d\'esame', 'Usando trascrizioni e materiale del corso, crea una guida di preparazione all\'esame: argomenti più importanti, formule chiave, domande probabili con risposta. Salvala in note/00_guida_esame.md'],
    ['Glossario', 'Crea un glossario dei termini tecnici del corso con definizione breve e lezione in cui compaiono. Salvalo in note/00_glossario.md'],
    ['Collega slide e lezioni', 'Per ogni file in materiale/ indica in quali lezioni (trascrizioni) viene spiegato quel contenuto. Salva una tabella in note/00_mappa_slide_lezioni.md'],
];
function openAgent(c) {
    const prov = Object.entries(S.tools.ai).map(([k, x]) => `<option value="${k}" ${S.settings.ai.provider === k ? 'selected' : ''} ${x.path ? '' : 'disabled'}>${esc(x.label)}</option>`).join('');
    const m = modal(`<h2>🤖 Agente AI · ${esc(cname(c))}</h2>
        <p class="muted" style="margin:0">L'agente lavora nella cartella del corso: legge trascrizioni, materiale e note, e salva i risultati in <code>note/</code>.</p>
        <div class="row" style="flex-wrap:wrap">${PRESETS.map((p, i) => `<button class="small" data-p="${i}">${esc(p[0])}</button>`).join('')}</div>
        <textarea id="g-prompt" rows="5" placeholder="Cosa vuoi che faccia?"></textarea>
        <div id="g-out" class="hidden" style="max-height:320px;overflow:auto;background:var(--sel);padding:10px;border-radius:8px;white-space:pre-wrap;font-size:.92em"></div>
        <div class="foot"><select id="g-prov" style="width:auto">${prov}</select><span class="grow"></span><button class="ghost" id="g-close">Chiudi</button><button class="primary" id="g-run">Avvia</button></div>`, { wide: true });
    const el = m.el;
    $$('[data-p]', el).forEach(b => b.onclick = () => $('#g-prompt', el).value = PRESETS[+b.dataset.p][1]);
    $('#g-close', el).onclick = m.close;
    $('#g-run', el).onclick = () => {
        const p = $('#g-prompt', el).value.trim(); if (!p) return;
        const out = $('#g-out', el); out.classList.remove('hidden'); out.textContent = '…'; aiStream = out;
        $('#g-run', el).disabled = true;
        guard(async () => { await api.agent(c.id, p, $('#g-prov', el).value); toast('Agente completato'); }).finally(() => { $('#g-run', el) && ($('#g-run', el).disabled = false); aiStream = null; });
    };
}

// ───────── activity panel ─────────

// ───────── events from main ─────────
let rafPending = false;
// Views with their own state (editors, forms, players, async pages) must not be rebuilt on background
// events: only the sidebar is refreshed. Data-driven lists (dashboard, lessons…) re-render.
const isSticky = () => ['recording', 'settings', 'setup', 'notes', 'calendar', 'rooms', 'todos', 'community', 'search'].includes(route.name)
    || ['impostazioni', 'panoramica'].includes(route.tab);
const soft = () => { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; if (!S) return; if (isSticky()) { renderSidebar(); return; } $('#view').dataset.view = ''; render(); }); };
let refreshT = null;
const softRefresh = () => { clearTimeout(refreshT); refreshT = setTimeout(async () => { if (!isSticky()) $('#view').dataset.view = ''; await refresh(); }, 400); };

// links inside rendered Markdown open in the system browser, never inside the app window
document.addEventListener('click', e => {
    const a = e.target.closest('.md a[href], .lcard a[href]');
    if (!a) return;
    const h = a.getAttribute('href') || '';
    if (/^https?:|^mailto:/i.test(h)) { e.preventDefault(); api.openExternal(h); }
    else if (!h.startsWith('#')) e.preventDefault();
}, true);

api.on(e => {
    switch (e.type) {
        case 'login-required': $('#banner').textContent = e.id ? '🔐 Accedi al Politecnico (PoliMi/SPID) nella finestra di login di PoliRec: la sincronizzazione riprende da sola.' : '🔐 Login richiesto: completa l\'accesso PoliMi/SPID nella finestra di Chrome che si è aperta.'; $('#banner').classList.remove('hidden'); break;
        case 'login-done': $('#banner').classList.add('hidden'); break;
        case 'sync-state': if (S) S.syncing = e.syncing; if (!e.syncing) { running.clear(); $('#banner').classList.add('hidden'); } soft(); break;
        case 'download-paused': case 'download-queued': softRefresh(); break;
        case 'transcribe-paused': if (e.video) tprog[e.video] = 'paused'; else for (const k in tprog) if (tprog[k] === 'queued' || typeof tprog[k] === 'number') tprog[k] = 'paused'; soft(); break;
        case 'transcribe-resumed': if (e.video) tprog[e.video] = 'queued'; else for (const k in tprog) if (tprog[k] === 'paused') tprog[k] = 'queued'; soft(); break;
        case 'sync-queue': if (S) S.syncQueue = e.queue; soft(); break;
        case 'sync-course': if (e.state === 'running') running.add(e.course); else running.delete(e.course); softRefresh(); break;
        case 'manifest': $('#banner').classList.add('hidden'); softRefresh(); break;
        case 'progress': progress[e.key] = e; soft(); break;
        case 'downloaded': delete progress[e.key]; softRefresh(); break;
        case 'transcribe-queued': tprog[e.video] = 'queued'; soft(); break;
        case 'transcribe-start': tprog[e.video] = 0; soft(); break;
        case 'transcribe-progress': tprog[e.video] = e.percent; soft(); break;
        case 'transcribe-done': delete tprog[e.video]; softRefresh(); break;
        case 'transcribe-error': if (!/annullato/.test(e.error)) tprog[e.video] = { error: e.error }; soft(); break;
        case 'ai-start':
            // streams go only to the view that asked for them (background AI jobs must not write into it)
            if (aiStream && (!window.aiWant || (e.key === window.aiWant.key && e.template === window.aiWant.template))) { aiJob = e.jobId; aiStream.textContent = ''; }
            break;
        case 'ai-chunk': if (window.aiStreamTarget) { window.aiStreamTarget.textContent += e.chunk; } else if (aiStream && (!aiJob || e.jobId === aiJob)) { aiStream.textContent += e.chunk; aiStream.scrollTop = 1e9; const sc = aiStream.closest('.st-msgs'); if (sc) sc.scrollTop = 1e9; } break;
        case 'ai-done': softRefresh(); break;
        case 'ai-error': if (aiStream) aiStream.textContent += '\n\n✗ ' + e.error; break;
        case 'setup-step': { const st = $('#st-' + e.step); if (st) { $('.s', st).innerHTML = e.status === 'done' ? '<span style="color:var(--ok)">✓</span>' : '<span class="spin"></span>'; $('.d', st).textContent = e.detail; } break; }
        case 'setup-log': { const l = $('#su-log'); if (l) { l.textContent += e.line + '\n'; l.scrollTop = 1e9; } break; }
        case 'refresh': softRefresh(); break;
        case 'teacher-choice': refresh().then(() => { const c = course(e.course); if (c) { teacherAsked.delete(c.id); askTeachers(c, { auto: true }); } }); break;
    }
});

refresh();
