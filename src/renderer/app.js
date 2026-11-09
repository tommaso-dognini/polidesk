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
    const el = $('#log');
    const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    el.textContent += `${new Date().toLocaleTimeString('it-IT')}  ${msg}\n`;
    if (el.textContent.length > 200000) el.textContent = el.textContent.slice(-150000);
    if (bottom) el.scrollTop = el.scrollHeight;
    $('#act-text').textContent = msg;
    $('#act-dot').className = 'dot ' + (/^✗/.test(msg) ? 'err' : busy ? 'busy' : 'idle');
}
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
    S.transcribing.forEach(v => { if (!(v in tprog)) tprog[v] = 'queued'; });
    applyUi();
    render();
}
function go(r) {
    if (player && r.name !== 'recording') { player.pause(); player = null; }
    if (route.name === 'notes' && window.flushNote) window.flushNote();
    route = r; $('#view').dataset.view = ''; render(); $('#view').scrollTop = 0;
}

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
    $('#side-courses').innerHTML = S.courses.map(c => {
        const recs = c.recordings, dl = recs.filter(r => r.videoExists).length;
        return `<a class="nav-item ${route.courseId === c.id ? 'active' : ''}" data-course="${c.id}">
            <span class="ico">${running.has(c.id) ? '<span class="spin"></span>' : c.lastError ? '<span style="color:var(--err)">!</span>' : '▤'}</span>
            <span class="n">${esc(cname(c))}</span><span class="badge">${dl}/${recs.length}</span></a>`;
    }).join('') || '<div class="faint" style="padding:6px 10px">Nessun corso</div>';
    $$('#side-courses [data-course]').forEach(a => a.onclick = () => go({ name: 'course', courseId: a.dataset.course, tab: 'panoramica' }));
    const tr = Object.values(tprog).filter(x => x === 'queued' || typeof x === 'number').length;
    const eng = S.settings.transcription;
    $('#side-status').innerHTML = [
        S.syncing ? `<div><span class="spin"></span> Sincronizzazione…</div>` : '',
        tr ? `<div>🎙 ${tr} in trascrizione</div>` : '',
        `<div class="faint">Whisper ${esc(eng.engine === 'mlx' ? '· Apple GPU' : eng.engine === 'faster' ? '· faster' : '')} · ${esc(eng.model)}<br>AI · ${esc((S.tools.ai[S.settings.ai.provider] || {}).label || '—')}</div>`,
    ].join('');
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
        const state = isRun ? '<span class="pill acc"><span class="spin"></span> sync</span>' : queued ? '<span class="pill">in coda</span>'
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
function viewCourse(v) {
    const c = course(route.courseId);
    if (!c) return go({ name: 'dashboard' });
    const tab = route.tab || 'panoramica';
    const isRun = running.has(c.id);
    v.innerHTML = `<div class="page">
        <div class="crumbs"><a data-go="dashboard">Dashboard</a> › ${esc(cname(c))}</div>
        <div class="page-head"><div><h1>${esc(cname(c))}</h1><div class="sub">${esc((c.manifest.course && c.manifest.course.fullname) || c.input)}</div></div><span class="grow"></span>
            <button id="c-index" class="ghost" title="Apri la pagina di riepilogo con tutti i link">☰ Riepilogo</button>
            <button id="c-folder" class="ghost">Apri cartella</button>
            <button id="c-agent">🤖 Agente AI</button>
            <button id="c-sync" class="${isRun ? '' : 'primary'}">${isRun ? '■ Ferma' : '⟳ Sincronizza'}</button></div>
        <div class="tabs">${[['panoramica', 'Panoramica'], ['lezioni', 'Lezioni'], ['materiale', 'Materiale'], ['note', 'Note AI'], ['impostazioni', 'Impostazioni']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
        <div id="tab"></div></div>`;
    $('[data-go]', v).onclick = () => go({ name: 'dashboard' });
    $$('[data-tab]', v).forEach(b => b.onclick = () => go({ ...route, tab: b.dataset.tab }));
    $('#c-sync', v).onclick = () => guard(() => isRun ? api.stopSync() : api.sync([c.id]));
    $('#c-folder', v).onclick = () => guard(() => api.open(c.id, 'root'));
    $('#c-index', v).onclick = () => guard(() => api.open(c.id, 'root', 'INDICE.html'));
    $('#c-agent', v).onclick = () => openAgent(c);
    ({ panoramica: window.tabOverview, lezioni: tabLessons, materiale: tabMaterials, note: tabNotes, impostazioni: tabCourseSettings })[tab](c, $('#tab', v));
}

const lessonFilter = { q: '', f: 'all' };
function tabLessons(c, el) {
    const recs = c.recordings.slice().sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));
    if (!recs.length) {
        el.innerHTML = `<div class="empty-state"><h2>Nessuna registrazione</h2><p>${c.lastSync ? 'Il corso non ha registrazioni pubblicate (o non sono state trovate). Puoi aggiungere un link nelle Impostazioni del corso.' : 'Premi Sincronizza per cercare le registrazioni del corso.'}</p></div>`;
        return;
    }
    const pending = recs.filter(r => r.videoExists && !r.transcript).length;
    el.innerHTML = `<div class="toolbar">
        <input class="search" id="l-q" placeholder="Cerca per argomento, docente, parola chiave…" value="${esc(lessonFilter.q)}">
        <div class="seg">${[['all', 'Tutte'], ['dl', 'Scaricate'], ['todo', 'Da scaricare'], ['nt', 'Da trascrivere']].map(([k, l]) => `<button data-f="${k}" class="${lessonFilter.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="grow"></span>
        ${pending ? `<button id="l-tr">🎙 Trascrivi ${pending}</button>` : ''}
        <button class="ghost" id="l-more">⋯ Altro</button>
    </div>
    <div class="lx"><nav class="lx-toc" id="l-toc"></nav><div class="lx-cards" id="l-list"></div></div>`;
    let counts = {};
    const n = recs.length;
    const num = r => n - recs.indexOf(r);           // lesson number, oldest = 1
    const draw = () => {
        const q = lessonFilter.q.toLowerCase();
        const list = recs.filter(r => (!q || [r.displayTitle, r.teacher, r.type, r.summary, (r.bullets || []).join(' ')].join(' ').toLowerCase().includes(q))
            && (lessonFilter.f === 'all' || (lessonFilter.f === 'dl' && r.videoExists) || (lessonFilter.f === 'todo' && !r.videoExists) || (lessonFilter.f === 'nt' && r.videoExists && !r.transcript)));
        $('#l-toc', el).innerHTML = list.map(r => `<a data-k="${esc(r.key)}"><span>${r.isoDate ? new Date(r.isoDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '—'}</span>${esc(r.displayTitle || r.file)}</a>`).join('');
        $('#l-list', el).innerHTML = list.map(r => lessonCard(c, r, num(r), counts[r.key] || 0)).join('') || '<div class="empty-state">Nessun risultato</div>';
        $$('#l-toc a', el).forEach(a => a.onclick = () => { const card = $(`.lcard[data-key="${CSS.escape(a.dataset.k)}"]`, el); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1200); } });
        $$('.lcard', el).forEach(card => card.onclick = e => {
            const b = e.target.closest('[data-act]');
            const open = extra => go({ name: 'recording', courseId: c.id, key: card.dataset.key, back: 'lezioni', ...extra });
            if (!b) return open({});
            e.stopPropagation();
            const a = b.dataset.act;
            if (a === 'play') open({ side: 'testo' });
            else if (a === 'text') open({ side: 'testo' });
            else if (a === 'notes') open({ side: 'appunti' });
            else if (a.startsWith('ai:')) open({ study: a.slice(3) });
            else if (a === 'dl') guard(() => api.sync([c.id]));
            else if (a === 'tr') guard(async () => { await api.transcribe(c.id, [card.dataset.key]); toast('In coda per la trascrizione'); refresh(); });
        });
    };
    draw();
    api.notes.linkCounts(c.id).then(x => { counts = x || {}; if (Object.keys(counts).length) draw(); }).catch(() => { });
    $('#l-q', el).oninput = e => { lessonFilter.q = e.target.value; draw(); };
    $$('[data-f]', el).forEach(b => b.onclick = () => { lessonFilter.f = b.dataset.f; tabLessons(c, el); });
    if ($('#l-tr', el)) $('#l-tr', el).onclick = () => guard(async () => { const k = await api.transcribe(c.id); toast(`${k} lezioni in coda per la trascrizione`); refresh(); });
    $('#l-more', el).onclick = e => showMenu(e.clientX - 240, e.clientY + 10, [
        ...Object.entries(S.templates).filter(([k]) => k !== 'sommario').map(([k, l]) => [`✨ ${l.split(' (')[0]} per tutte le lezioni`, async () => { const k2 = await api.notesBatch(c.id, k); toast(k2 ? `Genero per ${k2} lezioni…` : 'Tutte le lezioni trascritte le hanno già'); }]),
        ['✨ Sommari mancanti', async () => { const k2 = await api.notesBatch(c.id, 'sommario'); toast(k2 ? `Genero ${k2} sommari…` : 'Nessun sommario mancante'); }],
        '-',
        ['🧹 Pulisci trascrizioni (ehm, ripetizioni…)', async () => { const r = await api.cleanTranscripts(c.id); toast(`${r.files} trascrizioni pulite, ${r.removed} segmenti rimossi`); }],
    ]);
}

const AI_KIND = { appunti: '📝 Appunti', riassunto: '📄 Riassunto', spiegazione: '💡 Spiegazione', flashcard: '🃏 Flashcard', domande: '❓ Domande' };
function lessonCard(c, r, num, linked) {
    const d = r.isoDate ? new Date(r.isoDate) : null;
    const p = progress[r.key], tp = tprog[vpath(c, r)];
    let state = '';
    if (!r.videoExists) state = p && r.status !== 'error' ? `<span class="pill acc">⬇ ${Math.round(p.percent || 0)}%</span>` : r.status === 'error' ? `<span class="pill err" title="${esc(r.error)}">✗ download</span>` : '<span class="pill">non scaricata</span>';
    else if (!r.transcript) state = tp === 'queued' ? '<span class="pill">🎙 in coda</span>' : typeof tp === 'number' ? `<span class="pill acc">🎙 ${tp}%</span>` : tp && tp.error ? '<span class="pill err">🎙 errore</span>' : '<span class="pill warn">da trascrivere</span>';
    const kinds = r.notes.map(f => f.split(' - ').pop().replace(/\.md$/, '')).filter(k => k !== 'sommario');
    const links = [];
    if (r.videoExists) links.push('<button class="small primary" data-act="play">▶ Guarda</button>');
    else links.push('<button class="small" data-act="dl">⬇ Scarica</button>');
    if (r.transcript) links.push('<button class="small" data-act="text">Trascrizione</button>');
    else if (r.videoExists && !tp) links.push('<button class="small" data-act="tr">🎙 Trascrivi</button>');
    for (const k of kinds) links.push(`<button class="small soft" data-act="ai:${esc(k)}">${AI_KIND[k] || esc(k)}</button>`);
    if (linked) links.push(`<button class="small soft" data-act="notes">✎ ${linked} appunt${linked === 1 ? 'o' : 'i'}</button>`);
    const sum = r.summary || (r.bullets && r.bullets.length)
        ? `${r.summary ? `<p class="sum">${esc(r.summary)}</p>` : ''}${r.bullets && r.bullets.length ? `<ul>${r.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}`
        : `<p class="sum muted">${r.transcript ? 'Sommario non ancora generato.' : r.videoExists ? 'Il sommario degli argomenti arriverà dopo la trascrizione.' : 'Video non ancora scaricato.'}</p>`;
    return `<article class="lcard" data-key="${esc(r.key)}">
        <div class="lc-meta"><span class="lc-n">#${num}</span><span>${d ? esc(d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })) : '—'}</span>${r.teacher ? `<span>· ${esc(r.teacher)}</span>` : ''}${r.type ? `<span class="tag">${esc(r.type)}</span>` : ''}${r.duration ? `<span>· ${esc(r.duration)}</span>` : ''}<span class="grow"></span>${state}</div>
        <h3>${esc(r.displayTitle || r.file)}</h3>
        ${sum}
        <div class="lc-links">${links.join('')}</div></article>`;
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
        <button id="m-open">Apri cartella</button><button id="m-sync" class="primary">⟳ Aggiorna</button></div><div class="list files" id="m-tree"></div>`;
    $('#m-open', el).onclick = () => guard(() => api.open(c.id, 'materials'));
    $('#m-sync', el).onclick = () => guard(() => api.sync([c.id]));
    if (!tree.length) { $('#m-tree', el).innerHTML = '<div class="empty-state">Nessun file ancora: premi Aggiorna.</div>'; return; }
    const groups = {};
    for (const f of tree) { const s = f.includes('/') ? f.split('/')[0] : 'Generale'; (groups[s] = groups[s] || []).push(f); }
    const icon = f => /\.pdf$/i.test(f) ? '📄' : /\.(zip|rar|7z|gz)$/i.test(f) ? '🗜' : /\.(png|jpe?g|gif|svg)$/i.test(f) ? '🖼' : /\.md$/i.test(f) ? '🔗' : /\.(pptx?|key|odp)$/i.test(f) ? '📊' : '📎';
    $('#m-tree', el).innerHTML = Object.entries(groups).map(([s, fs]) => `<details ${Object.keys(groups).length <= 4 ? 'open' : ''}><summary>${esc(s)} <span class="muted" style="font-weight:400">${fs.length}</span></summary>
        ${fs.map(f => `<div class="f" data-f="${esc(f)}"><span>${icon(f)}</span>${esc(f.split('/').slice(1).join(' / ') || f)}</div>`).join('')}</details>`).join('');
    $$('.f', el).forEach(x => x.onclick = () => guard(() => api.open(c.id, 'materials', x.dataset.f)));
}

function tabNotes(c, el) {
    const withNotes = c.recordings.filter(r => r.notes.length).sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));
    el.innerHTML = `<div class="toolbar"><span class="muted">Note generate con ${esc((S.tools.ai[S.settings.ai.provider] || {}).label || 'AI')} dalle trascrizioni</span><span class="grow"></span>
        <button id="n-open">Apri cartella note</button><button id="n-agent" class="primary">🤖 Agente sul corso</button></div>
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
    </div>
    <div class="group"><h3>Sorgenti trovate</h3>
        ${(c.manifest.sources || []).map(s => field(`<span class="pill">${esc(s.type)}</span>`, '', `<span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.url)}">${esc(s.label || s.url)}</span>`)).join('') || field('—', 'Nessuna sorgente: sincronizza il corso', '')}
    </div>
    <div class="row"><button class="danger" id="cs-del">Rimuovi corso</button><span class="faint">I file scaricati non vengono cancellati.</span><span class="grow"></span><button class="primary" id="cs-save">Salva</button></div>`;
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
function viewRecording(v) {
    const c = course(route.courseId);
    const r = c && c.recordings.find(x => x.key === route.key);
    if (!r) return go({ name: 'course', courseId: route.courseId, tab: 'panoramica' });
    recData = null;
    v.innerHTML = `<div class="page wide">
        <div class="crumbs"><a data-go="dash">Dashboard</a> › <a data-go="course">${esc(cname(c))}</a> › ${esc(fmtDate(r.isoDate))}</div>
        <div class="page-head"><div><h1>${esc(r.displayTitle || r.file)}</h1><div class="sub">${[r.isoDate && new Date(r.isoDate).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' }), r.teacher, r.type, r.duration].filter(Boolean).map(esc).join(' · ')}</div></div></div>
        <div class="rec-layout">
            <div class="rec-main"><div class="player" id="player"><div class="empty">Caricamento…</div></div><div class="info-card" id="r-info"></div><section class="study" id="r-study"></section></div>
            <div class="side-panel"><div class="tabs" id="r-tabs">${[['testo', 'Trascrizione'], ['appunti', 'Appunti'], ['info', 'Dettagli']].map(([k, l]) => `<button data-s="${k}" class="${sideTab() === k ? 'active' : ''}">${l}</button>`).join('')}</div><div class="body" id="r-side"></div></div>
        </div></div>`;
    $('[data-go="dash"]', v).onclick = () => go({ name: 'dashboard' });
    $('[data-go="course"]', v).onclick = () => go({ name: 'course', courseId: c.id, tab: route.back || 'lezioni' });
    $$('#r-tabs button', v).forEach(b => b.onclick = () => { route.side = b.dataset.s; $$('#r-tabs button', v).forEach(x => x.classList.toggle('active', x === b)); drawSide(c, r); });
    guard(async () => {
        recData = await api.recording(c.id, r.key);
        drawPlayer(c, r); drawSide(c, r); drawInfo(c, r); drawStudy(c, r);
        if (route.study) setTimeout(() => $('#r-study') && $('#r-study').scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    });
}
const sideTab = () => ({ note: 'appunti' }[route.side] || route.side || 'testo');

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
        box.innerHTML = `<div class="empty"><div style="text-align:center">Video non ancora scaricato<br><br><button class="primary" id="p-sync">⟳ Sincronizza il corso</button></div></div>`;
        $('#p-sync').onclick = () => guard(() => api.sync([c.id]));
        player = null; return;
    }
    const speeds = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    box.innerHTML = `<video id="vid" preload="metadata" src="${recData.videoUrl}"></video>
        <div class="controls">
            <button id="p-play" title="Play/Pausa (spazio)">▶</button>
            <button id="p-back" title="-10 s (←)">↺10</button><button id="p-fwd" title="+10 s (→)">10↻</button>
            <span class="time" id="p-time">0:00 / 0:00</span>
            <input type="range" id="p-seek" min="0" max="1000" value="0">
            <select class="speed" id="p-speed" title="Velocità (< >)">${speeds.map(s => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}×</option>`).join('')}</select>
            <button id="p-skip" title="Salta i silenzi (usa i tempi della trascrizione)">⏭ silenzi</button>
            <button id="p-full" title="Schermo intero (F)">⛶</button>
            <button id="p-ext" title="Apri con l'app di sistema">↗</button>
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
    vid.onplay = () => $('#p-play').textContent = '❚❚';
    vid.onpause = () => { $('#p-play').textContent = '▶'; localStorage.setItem('pos:' + r.key, vid.currentTime); };
    $('#p-back').onclick = () => vid.currentTime -= 10;
    $('#p-fwd').onclick = () => vid.currentTime += 10;
    $('#p-speed').onchange = e => { vid.playbackRate = +e.target.value; localStorage.setItem('speed', e.target.value); };
    $('#p-full').onclick = () => document.fullscreenElement ? document.exitFullscreen() : box.requestFullscreen();
    $('#p-ext').onclick = () => { vid.pause(); guard(() => api.openPath(recData.videoPath)); };
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
                ${r.videoExists && !tp ? '<button class="primary" id="s-tr">🎙 Trascrivi ora</button>' : ''}</div>`;
            if ($('#s-tr', el)) $('#s-tr', el).onclick = () => guard(async () => { await api.transcribe(c.id, [r.key]); tprog[vpath(c, r)] = 'queued'; drawSide(c, r); });
            return;
        }
        el.innerHTML = `<div class="t-bar"><input id="t-q" placeholder="Cerca nella trascrizione…"><button class="small" id="t-copy" title="Copia tutta la trascrizione, senza tempi">⧉ Copia</button></div>
            <label class="row faint t-follow"><input type="checkbox" id="r-follow" checked> segui il video</label><div id="t-body"></div>`;
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
            const b = $('#t-copy', el); b.textContent = '✓ Copiata'; setTimeout(() => { if (b.isConnected) b.textContent = '⧉ Copia'; }, 1600);
            toast(`Trascrizione copiata (${txt.split(/\s+/).length.toLocaleString('it-IT')} parole)`);
        });
    } else if (side === 'appunti') {
        drawLinkedNotes(c, r, el);
    } else {
        el.innerHTML = `<div class="md">
            <p><b>File</b><br><span class="muted">${esc(r.file)}</span></p>
            <p><b>Fonte</b><br><span class="muted">${esc(r.sourceLabel || r.source || '')}</span></p>
            ${r.webexName ? `<p><b>Nome su WebEx</b><br><span class="muted">${esc(r.webexName)}</span></p>` : ''}
            ${r.size ? `<p><b>Dimensione</b><br><span class="muted">${esc(r.size)}</span></p>` : ''}
            ${r.transcript ? `<p><b>Trascrizione</b><br><a data-tr>${esc(r.transcript)} ↗</a></p>` : ''}
            ${r.error ? `<p><b>Ultimo errore</b><br><span style="color:var(--err)">${esc(r.error)}</span></p>` : ''}</div>`;
        if ($('[data-tr]', el)) $('[data-tr]', el).onclick = () => guard(() => api.open(c.id, 'transcripts', r.transcript));
    }
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
    el.innerHTML = `<div class="ln-actions"><button class="primary small" id="ln-new">＋ Nuovo appunto</button><button class="small" id="ln-link">🔗 Collega esistente</button></div>
        ${list.length ? list.map(n => `<div class="ln-item" data-scope="${esc(n.scope || '')}" data-f="${esc(n.file)}" data-k="${n.kind}">
            <div class="row"><span class="badge-k ${n.kind}">${({ markdown: 'MD', latex: 'TeX', typst: 'Typ' })[n.kind]}</span><b class="grow">${esc(n.file.replace(/\.(md|tex|typ)$/, ''))}</b><button class="icon ghost small" data-unlink title="Scollega da questa lezione">✕</button></div>
            <div class="faint ln-sub">${n.scope ? esc(cname(course(n.scope) || { name: '' })) : 'Generale'}${n.links.length > 1 ? ` · collegato anche a ${n.links.length - 1} altr${n.links.length === 2 ? 'a lezione' : 'e lezioni'}` : ''}</div></div>`).join('')
            : `<div class="empty-state small"><p>Nessun appunto collegato a questa lezione.</p><p class="faint">Un appunto può essere collegato a più lezioni: crealo qui o collegalo dall'editor degli appunti (🔗).</p></div>`}`;
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
    el.innerHTML = `<div class="study-head"><h2>✨ Studia con l'AI</h2><span class="faint">${esc(prov)} · a partire dalla trascrizione</span></div>
        ${can ? '' : '<p class="muted">Gli strumenti AI si attivano quando la lezione è trascritta.</p>'}
        <div class="study-tools">${STUDY.map(([k, ic, t, d]) => `<button class="stool ${sel === k ? 'on' : ''} ${have[k] ? 'has' : ''}" data-k="${k}" ${can ? '' : 'disabled'}><span class="ic">${ic}</span><b>${t}</b><span class="faint">${have[k] ? '✓ pronto' : d}</span></button>`).join('')}</div>
        <div id="st-out" class="st-out ${sel && sel !== 'chat' ? '' : 'hidden'}"></div>
        <div class="st-chat">
            <div id="st-msgs" class="st-msgs"></div>
            <div class="st-sugg">${['Spiegami il concetto principale in modo semplice', 'Fammi un esempio pratico', 'Cosa devo sapere per l\'esame?', 'Quali sono le formule chiave?'].map(s => `<button class="small soft" data-sugg="${esc(s)}" ${can ? '' : 'disabled'}>${esc(s)}</button>`).join('')}</div>
            <div class="st-ask"><textarea id="st-q" rows="1" placeholder="Chiedi qualcosa su questa lezione… (↵ invia, ⇧↵ a capo)" ${can ? '' : 'disabled'}></textarea><button class="primary" id="st-send" ${can ? '' : 'disabled'}>↑</button></div>
        </div>`;
    const show = k => {
        route.study = k;
        $$('.stool', el).forEach(b => b.classList.toggle('on', b.dataset.k === k));
        const out = $('#st-out', el); out.classList.remove('hidden');
        const n = recData.notes.find(x => x.kind === k);
        if (!n) return generate(k);
        const qa = (k === 'flashcard' || k === 'domande') ? parseQA(n.content) : [];
        out.innerHTML = `<div class="st-out-head"><b>${STUDY.find(s => s[0] === k)[1]} ${STUDY.find(s => s[0] === k)[2]}</b><span class="grow"></span>
            <button class="small ghost" data-a="copy">⧉ Copia</button><button class="small ghost" data-a="save" title="Crea un appunto modificabile collegato a questa lezione">✎ Negli appunti</button><button class="small ghost" data-a="regen">↻ Rigenera</button><button class="small ghost" data-a="file">↗</button><button class="small ghost icon" data-a="close">✕</button></div>
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
        box.innerHTML = msgs.map((m, i) => `<div class="msg ${m.role}">${m.role === 'user' ? esc(m.text) : `<div class="md">${md(m.text)}</div><div class="msg-act"><button class="small ghost" data-copy="${i}">⧉ Copia</button><button class="small ghost" data-save="${i}">✎ Salva negli appunti</button></div>`}</div>`).join('');
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
    el.innerHTML = `${sum ? `<div class="md">${md(sum.content)}</div>` : `<p class="muted" style="margin:0">${hasText ? 'Sommario degli argomenti non ancora generato.' : 'Il sommario degli argomenti comparirà qui dopo la trascrizione.'}</p>`}
        <div class="actions">
            ${recData.videoUrl ? '<button id="i-ext">↗ Apri con app di sistema</button><button id="i-finder" class="ghost">Mostra nella cartella</button>' : ''}
            ${r.webexUrl ? '<button id="i-webex" class="ghost">Apri su WebEx</button>' : ''}
            ${hasText && !sum ? '<button id="i-sum">✨ Genera sommario</button>' : ''}
            ${recData.videoUrl ? `<button id="i-tr" class="ghost">🎙 ${r.transcript ? 'Ritrascrivi' : 'Trascrivi'}</button>` : ''}
        </div>`;
    const on = (id, fn) => { const b = $('#' + id, el); if (b) b.onclick = () => guard(fn); };
    on('i-ext', () => { if (player) player.pause(); return api.openPath(recData.videoPath); });
    on('i-finder', () => api.reveal(recData.videoPath));
    on('i-webex', () => api.openExternal(r.webexUrl));
    on('i-sum', async () => { toast('Genero il sommario…'); await api.genNote(c.id, r.key, 'sommario'); });
    on('i-tr', async () => { await api.transcribe(c.id, [r.key]); tprog[vpath(c, r)] = 'queued'; toast('In coda per la trascrizione'); });
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
    { name: 'polimi-schedule-js', by: 'bebora', url: 'https://github.com/bebora/polimi-schedule-js', lic: 'MIT', used: 'Incluso: converte l\'orario dei Servizi Online nel Calendario dell\'app e in .ics.' },
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
$('#act-toggle').onclick = () => $('#activity').classList.toggle('open');

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
        case 'log': log(e.msg); break;
        case 'login-required': $('#banner').textContent = '🔐 Login richiesto: completa l\'accesso PoliMi/SPID nella finestra di Chrome che si è aperta.'; $('#banner').classList.remove('hidden'); break;
        case 'sync-state': if (S) S.syncing = e.syncing; if (!e.syncing) { running.clear(); $('#banner').classList.add('hidden'); log('Sincronizzazione terminata', false); } soft(); break;
        case 'sync-queue': if (S) S.syncQueue = e.queue; soft(); break;
        case 'sync-course': if (e.state === 'running') running.add(e.course); else running.delete(e.course); softRefresh(); break;
        case 'manifest': $('#banner').classList.add('hidden'); softRefresh(); break;
        case 'progress': progress[e.key] = e; soft(); break;
        case 'downloaded': delete progress[e.key]; softRefresh(); break;
        case 'transcribe-queued': tprog[e.video] = 'queued'; soft(); break;
        case 'transcribe-start': tprog[e.video] = 0; log('🎙 Trascrivo ' + e.video.split(/[\\/]/).pop()); soft(); break;
        case 'transcribe-progress': tprog[e.video] = e.percent; soft(); break;
        case 'transcribe-done': delete tprog[e.video]; log('✓ Trascritto ' + e.video.split(/[\\/]/).pop(), false); softRefresh(); break;
        case 'transcribe-error': tprog[e.video] = { error: e.error }; log('✗ ' + e.error); soft(); break;
        case 'ai-start': log(`✨ ${(S && S.tools.ai[e.provider] || {}).label || 'AI'} al lavoro…`);
            // streams go only to the view that asked for them (background AI jobs must not write into it)
            if (aiStream && (!window.aiWant || (e.key === window.aiWant.key && e.template === window.aiWant.template))) { aiJob = e.jobId; aiStream.textContent = ''; }
            break;
        case 'ai-chunk': if (window.aiStreamTarget) { window.aiStreamTarget.textContent += e.chunk; } else if (aiStream && (!aiJob || e.jobId === aiJob)) { aiStream.textContent += e.chunk; aiStream.scrollTop = 1e9; const sc = aiStream.closest('.st-msgs'); if (sc) sc.scrollTop = 1e9; } break;
        case 'ai-done': log('✓ AI completato' + (e.file ? ': ' + e.file : ''), false); softRefresh(); break;
        case 'ai-error': log('✗ AI: ' + e.error); if (aiStream) aiStream.textContent += '\n\n✗ ' + e.error; break;
        case 'setup-step': { const st = $('#st-' + e.step); if (st) { $('.s', st).innerHTML = e.status === 'done' ? '<span style="color:var(--ok)">✓</span>' : '<span class="spin"></span>'; $('.d', st).textContent = e.detail; } break; }
        case 'setup-log': { const l = $('#su-log'); if (l) { l.textContent += e.line + '\n'; l.scrollTop = 1e9; } break; }
        case 'refresh': softRefresh(); break;
    }
});

refresh();
