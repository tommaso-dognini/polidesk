'use strict';
const api = window.polirec;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = null;                 // state from main
let current = null;           // selected course id
const progress = {};          // key -> {percent, speed}
const tprog = {};             // video path -> percent | 'queued'
const runningCourses = new Set();
let viewCtx = null;

// ---------- helpers ----------
function toast(msg, ms = 3500) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
async function guard(fn) { try { return await fn(); } catch (e) { toast('Errore: ' + (e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 6000); } }
function log(msg) {
    const el = $('#log');
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    el.textContent += `${new Date().toLocaleTimeString('it-IT')}  ${msg}\n`;
    if (el.textContent.length > 200000) el.textContent = el.textContent.slice(-150000);
    if (atBottom) el.scrollTop = el.scrollHeight;
    $('#activity').textContent = msg;
}
const course = () => S && S.courses.find(c => c.id === current);
const videoPath = (c, r) => `${c.dir}/video/${r.file}`;

function md(src) {
    // tiny markdown renderer (headings, lists, bold/italic, code, links) — enough for notes
    const lines = esc(src).split('\n'); let html = '', inList = false, inCode = false;
    for (let l of lines) {
        if (l.startsWith('```')) { html += inCode ? '</pre>' : '<pre>'; inCode = !inCode; continue; }
        if (inCode) { html += l + '\n'; continue; }
        const li = l.match(/^\s*([-*]|\d+\.)\s+(.*)/);
        if (li && !inList) { html += '<ul>'; inList = true; }
        if (!li && inList) { html += '</ul>'; inList = false; }
        l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
        const h = l.match(/^(#{1,4})\s+(.*)/);
        if (h) html += `<h${h[1].length}>${h[2]}</h${h[1].length}>`;
        else if (li) html += `<li>${li[2].replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`;
        else if (l.trim()) html += `<p>${l}</p>`;
    }
    return html + (inList ? '</ul>' : '') + (inCode ? '</pre>' : '');
}

// ---------- rendering ----------
async function refresh() {
    S = await api.state();
    if (!current && S.courses.length) current = S.courses[0].id;
    if (current && !course()) current = S.courses[0] ? S.courses[0].id : null;
    S.transcribing.forEach(v => { if (!(v in tprog)) tprog[v] = 'queued'; });
    render();
}

function render() {
    renderSidebar();
    const c = course();
    $('#empty').classList.toggle('hidden', !!c);
    $('#course').classList.toggle('hidden', !c);
    if (c) renderCourse(c);
    $('#btn-sync-all').disabled = S.syncing;
}

function renderSidebar() {
    $('#course-list').innerHTML = S.courses.map(c => {
        const recs = c.recordings;
        const dl = recs.filter(r => r.videoExists).length, tr = recs.filter(r => r.transcript).length;
        const name = c.name || (c.manifest.course && c.manifest.course.fullname) || c.input;
        return `<div class="course-item ${c.id === current ? 'active' : ''}" data-id="${c.id}">
            <div class="name" title="${esc(name)}">${esc(name)}</div>
            <div class="sub">${runningCourses.has(c.id) ? '<span class="spin"></span>' : ''}${dl}/${recs.length} video · ${tr} trascritti</div></div>`;
    }).join('');
    document.querySelectorAll('.course-item').forEach(el => el.onclick = () => { current = el.dataset.id; render(); });
    const t = S.tools;
    const items = [['aria2c', t.aria2c], ['ffmpeg', t.ffmpeg], ['whisper' + (t.whisper === 'mlx' ? ' (mlx)' : ''), t.whisper !== 'none'],
    ...Object.entries(t.ai).map(([k, v]) => [v.label.replace(' CLI', ''), v.path])];
    $('#tools').innerHTML = items.map(([n, ok]) => `<span class="${ok ? '' : 'missing'}" title="${ok ? 'disponibile' : 'non trovato'}">${esc(n)}</span>`).join('');
}

function renderCourse(c) {
    const name = c.name || (c.manifest.course && c.manifest.course.fullname) || c.input;
    $('#c-title').textContent = name;
    $('#c-dir').textContent = c.dir;
    const recs = c.recordings;
    $('#c-stats').textContent = `${recs.length} registrazioni · ${recs.filter(r => r.videoExists).length} scaricate · ${recs.filter(r => r.transcript).length} trascritte · ${recs.reduce((a, r) => a + r.notes.length, 0)} note`;
    $('#c-sources').innerHTML = (c.manifest.sources || []).map(s => `<span class="chip" title="${esc(s.url)}">${esc(s.type)} · ${esc(s.label || '')}</span>`).join('');
    $('#c-sync').disabled = S.syncing;
    $('#c-sync').textContent = runningCourses.has(c.id) ? '■ Ferma' : '⟳ Sincronizza';
    if (runningCourses.has(c.id)) $('#c-sync').disabled = false;
    $('#c-notes-template').innerHTML = Object.entries(S.templates).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

    $('#no-recs').classList.toggle('hidden', recs.length > 0);
    const rows = recs.slice().reverse().map(r => {
        const vp = videoPath(c, r);
        let v;
        const p = progress[r.key];
        if (r.videoExists) v = `<span class="status ok">✓ scaricato</span>`;
        else if (p && r.status !== 'error') v = `<span class="status">${Math.round(p.percent || 0)}% ${esc(p.speed || '')}</span><div class="bar"><i style="width:${p.percent || 0}%"></i></div>`;
        else if (r.status === 'error') v = `<span class="status err" title="${esc(r.error)}">✗ errore</span>`;
        else if (r.status === 'downloading') v = `<span class="status warn">in corso…</span>`;
        else v = `<span class="status muted">da scaricare</span>`;
        let t;
        const tp = tprog[vp];
        if (r.transcript) t = `<a class="link" data-act="view-t" data-key="${r.key}">📄 apri</a>`;
        else if (tp === 'queued') t = `<span class="status muted">in coda</span>`;
        else if (typeof tp === 'number') t = `<span class="status">${tp}%</span><div class="bar"><i style="width:${tp}%"></i></div>`;
        else if (tp && tp.error) t = `<span class="status err" title="${esc(tp.error)}">✗ errore</span>`;
        else t = r.videoExists ? `<a class="link" data-act="transcribe" data-key="${r.key}">🎙 trascrivi</a>` : '';
        const notes = r.notes.map(n => `<a data-act="view-n" data-file="${esc(n)}" title="${esc(n)}">📝 ${esc(n.split(' - ').pop().replace('.md', ''))}</a>`).join('');
        return `<tr data-key="${r.key}">
            <td class="date">${esc((r.isoDate || '').replace('T', ' '))}</td>
            <td class="topic">${esc(r.displayTitle || r.topic || r.file)}${r.teacher ? ` <span class="teacher">— ${esc(r.teacher)}</span>` : ''}</td>
            <td>${esc(r.type || '')}</td><td>${esc(r.duration || '')}</td>
            <td>${v}</td><td>${t}</td><td><div class="notes">${notes}</div></td>
            <td class="acts">${r.videoExists ? `<button class="small ghost" data-act="play" data-key="${r.key}" title="Apri video">▶</button>` : ''}
                <button class="small ghost" data-act="menu" data-key="${r.key}">⋯</button></td></tr>`;
    });
    $('#rec-table tbody').innerHTML = rows.join('');
}

// ---------- row actions ----------
$('#rec-table').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const c = course(); const key = el.dataset.key || el.closest('tr').dataset.key;
    const r = c.recordings.find(x => x.key === key);
    const act = el.dataset.act;
    if (act === 'play') guard(() => api.open(c.id, 'video', r.file));
    if (act === 'transcribe') guard(async () => { await api.transcribe(c.id, [key]); tprog[videoPath(c, r)] = 'queued'; render(); });
    if (act === 'view-t') openViewer(c, 'transcripts', r.transcript);
    if (act === 'view-n') openViewer(c, 'notes', el.dataset.file);
    if (act === 'menu') showRowMenu(e, c, r);
});

function showRowMenu(e, c, r) {
    const items = [];
    if (r.videoExists) items.push(['▶ Apri video', () => api.open(c.id, 'video', r.file)]);
    if (r.videoExists) items.push([r.transcript ? '🎙 Ritrascrivi' : '🎙 Trascrivi', async () => { await api.transcribe(c.id, [r.key]); tprog[videoPath(c, r)] = 'queued'; render(); }]);
    if (r.transcript) {
        items.push('-');
        for (const [k, label] of Object.entries(S.templates)) items.push([`✨ ${label}`, () => runNotes(c, r, k)]);
    }
    if (r.subtitles) items.push(['-'], ['💬 Apri sottotitoli', () => api.open(c.id, 'transcripts', r.subtitles)]);
    items.push('-');
    if (r.webexUrl) items.push(['🌐 Apri su WebEx', () => window.open(r.webexUrl)]);
    if (r.error) items.push(['⚠ Mostra errore', () => alert(r.error)]);
    if (r.videoExists) items.push(['📁 Mostra nel Finder', () => api.reveal(videoPath(c, r))]);
    showMenu(e.clientX, e.clientY, items);
}

function showMenu(x, y, items) {
    const m = $('#menu');
    m.innerHTML = items.map((it, i) => it === '-' || it[0] === '-' || (Array.isArray(it) && it.length === 1) ? '<hr>' : `<div data-i="${i}">${esc(it[0])}</div>`).join('');
    m.classList.remove('hidden');
    m.style.left = Math.min(x, innerWidth - 240) + 'px';
    m.style.top = Math.min(y, innerHeight - m.offsetHeight - 10) + 'px';
    m.onclick = ev => { const d = ev.target.closest('[data-i]'); if (!d) return; m.classList.add('hidden'); guard(items[+d.dataset.i][1]); };
    setTimeout(() => document.addEventListener('click', () => m.classList.add('hidden'), { once: true }), 0);
}

async function openViewer(c, kind, file) {
    viewCtx = { c, kind, file };
    $('#v-title').textContent = file;
    const txt = await guard(() => api.readFile(c.id, kind, file));
    $('#v-body').innerHTML = kind === 'notes' ? md(txt || '') : `<pre>${esc(txt || '')}</pre>`;
    $('#dlg-view').showModal();
}
$('#v-close').onclick = () => $('#dlg-view').close();
$('#v-open').onclick = () => viewCtx && viewCtx.file && guard(() => api.open(viewCtx.c.id, viewCtx.kind, viewCtx.file));

let aiStream = null;
function runNotes(c, r, template) {
    viewCtx = { c, kind: 'notes', file: null };
    $('#v-title').textContent = `✨ ${S.templates[template]} — ${r.topic || r.file}`;
    $('#v-body').innerHTML = '<div class="stream muted">Avvio…</div>';
    aiStream = $('#v-body .stream');
    $('#dlg-view').showModal();
    return api.notes(c.id, r.key, template).then(file => { viewCtx.file = file; });
}

// ---------- course actions ----------
$('#c-sync').onclick = () => {
    const c = course();
    if (runningCourses.has(c.id)) return guard(() => api.stopSync());
    guard(() => api.sync([c.id]));
};
$('#btn-sync-all').onclick = () => guard(() => api.sync());
$('#c-transcribe').onclick = () => guard(async () => { const n = await api.transcribe(current); toast(n ? `${n} video in coda per la trascrizione` : 'Niente da trascrivere'); refresh(); });
$('#c-notes-all').onclick = () => guard(async () => { const n = await api.notesBatch(current, $('#c-notes-template').value); toast(n ? `Genero note per ${n} lezioni…` : 'Nessuna trascrizione senza queste note'); });
$('#c-dir').onclick = e => { e.preventDefault(); guard(() => api.open(current, 'root')); };
$('#c-more').onclick = e => {
    const c = course();
    showMenu(e.clientX - 200, e.clientY + 10, [
        ['📁 Apri cartella', () => api.open(c.id, 'root')],
        ['📄 Apri INDICE.md', () => api.open(c.id, 'root', 'INDICE.md')],
        ['⚙ Impostazioni corso', () => openCourseSettings(c)],
    ]);
};

// ---------- agent ----------
const PRESETS = [
    ['Riassunto del corso', 'Leggi tutte le trascrizioni (e gli appunti già presenti) e scrivi un riassunto dell\'intero corso organizzato per argomenti, con i collegamenti tra le lezioni. Salvalo in note/00_riassunto_corso.md'],
    ['Guida d\'esame', 'Usando tutte le trascrizioni, crea una guida di preparazione all\'esame: argomenti più importanti, formule chiave, domande probabili con risposta. Salvala in note/00_guida_esame.md'],
    ['Glossario', 'Crea un glossario di tutti i termini tecnici del corso con definizione breve e lezione in cui compaiono. Salvalo in note/00_glossario.md'],
    ['Appunti mancanti', 'Per ogni trascrizione in trascrizioni/ che non ha ancora un file "<nome> - appunti.md" in note/, scrivi appunti strutturati in Markdown e salvali con quel nome.'],
];
$('#c-agent').onclick = () => {
    $('#agent-presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="small" data-i="${i}">${esc(p[0])}</button>`).join('');
    $('#agent-presets').onclick = e => { const b = e.target.closest('[data-i]'); if (b) $('#agent-prompt').value = PRESETS[+b.dataset.i][1]; };
    fillProviders($('#agent-provider'));
    $('#dlg-agent').showModal();
};
$('#agent-run').onclick = e => {
    e.preventDefault();
    const prompt = $('#agent-prompt').value.trim(); if (!prompt) return;
    const prov = $('#agent-provider').value;
    $('#dlg-agent').close();
    viewCtx = { c: course(), kind: 'notes', file: null };
    $('#v-title').textContent = '🤖 Agente AI';
    $('#v-body').innerHTML = '<div class="stream muted">Avvio…</div>';
    aiStream = $('#v-body .stream');
    $('#dlg-view').showModal();
    guard(() => api.agent(current, prompt, prov));
};
function fillProviders(sel) {
    sel.innerHTML = Object.entries(S.tools.ai).map(([k, v]) => `<option value="${k}" ${v.path ? '' : 'disabled'}>${esc(v.label)}${v.path ? '' : ' (non installato)'}</option>`).join('');
    sel.value = S.settings.ai.provider;
}

// ---------- add course ----------
function openAddCourse() {
    $('#add-input').value = ''; $('#add-name').value = ''; $('#add-dir').value = S.settings.defaultRoot || '';
    $('#add-webeep-list').classList.add('hidden');
    $('#dlg-add').showModal();
}
window.openAddCourse = openAddCourse;
$('#btn-add').onclick = openAddCourse;
$('#btn-add-first').onclick = openAddCourse;
$('#add-dir-pick').onclick = async () => { const d = await api.pickDir($('#add-dir').value); if (d) $('#add-dir').value = d; };
$('#add-pick-webeep').onclick = () => guard(async () => {
    const list = $('#add-webeep-list');
    list.classList.remove('hidden'); list.innerHTML = '<div class="muted">Apro WeBeep in Chrome… (potrebbe servire il login)</div>';
    const cs = await api.webeepCourses();
    list.innerHTML = cs.sort((a, b) => b.id - a.id).map(c => `<div data-id="${c.id}" data-name="${esc(c.fullname)}">${esc(c.fullname)}</div>`).join('');
    list.onclick = e => {
        const d = e.target.closest('[data-id]'); if (!d) return;
        $('#add-input').value = 'webeep:' + d.dataset.id;
        const short = d.dataset.name.replace(/^\d+\s*-\s*/, '').replace(/\s*[\(\[].*$/, '');
        if (!$('#add-name').value) $('#add-name').value = short;
        if (S.settings.defaultRoot && $('#add-dir').value === S.settings.defaultRoot) $('#add-dir').value = S.settings.defaultRoot.replace(/\/$/, '') + '/' + short.replace(/[\/:]/g, '-');
        list.classList.add('hidden');
    };
});
$('#dlg-add').addEventListener('close', () => {
    if ($('#dlg-add').returnValue !== 'ok') return;
    guard(async () => {
        const c = await api.addCourse({ input: $('#add-input').value, dir: $('#add-dir').value, name: $('#add-name').value });
        current = c.id; await refresh();
        if (confirm('Corso aggiunto. Vuoi sincronizzarlo adesso?')) guard(() => api.sync([c.id]));
    });
});

// ---------- course settings ----------
function openCourseSettings(c) {
    $('#cs-name').value = c.name || ''; $('#cs-input').value = c.input; $('#cs-dir').value = c.dir;
    $('#cs-extra').value = (c.extraUrls || []).join('\n'); $('#cs-pwd').value = c.videoPassword || ''; $('#cs-lang').value = c.language || '';
    $('#dlg-course').showModal();
}
$('#cs-dir-pick').onclick = async () => { const d = await api.pickDir($('#cs-dir').value); if (d) $('#cs-dir').value = d; };
$('#cs-remove').onclick = () => {
    if (!confirm('Rimuovere il corso dall\'app? I file scaricati NON vengono cancellati.')) return;
    $('#dlg-course').close();
    guard(async () => { await api.removeCourse(current); current = null; refresh(); });
};
$('#dlg-course').addEventListener('close', () => {
    if ($('#dlg-course').returnValue !== 'ok') return;
    const c = course();
    const patch = { name: $('#cs-name').value, input: $('#cs-input').value, dir: $('#cs-dir').value, extraUrls: $('#cs-extra').value.split('\n').map(s => s.trim()).filter(Boolean), videoPassword: $('#cs-pwd').value, language: $('#cs-lang').value };
    if (patch.input !== c.input) patch.webeepId = undefined;
    guard(async () => { await api.updateCourse(c.id, patch); refresh(); });
});

// ---------- settings ----------
$('#btn-settings').onclick = () => {
    const s = S.settings;
    $('#s-parallel').value = s.parallelDownloads; $('#s-root').value = s.defaultRoot || '';
    $('#s-t-auto').checked = s.transcription.auto; $('#s-t-model').value = s.transcription.model; $('#s-t-lang').value = s.transcription.language;
    $('#s-t-format').value = s.transcription.format; $('#s-t-python').value = s.transcription.python;
    fillProviders($('#s-ai-provider')); $('#s-ai-model').value = s.ai.model; $('#s-ai-auto').checked = s.ai.autoNotes;
    $('#dlg-settings').showModal();
};
$('#s-root-pick').onclick = async () => { const d = await api.pickDir($('#s-root').value); if (d) $('#s-root').value = d; };
$('#dlg-settings').addEventListener('close', () => {
    if ($('#dlg-settings').returnValue !== 'ok') return;
    const s = {
        parallelDownloads: Math.max(1, Math.min(8, +$('#s-parallel').value || 3)), defaultRoot: $('#s-root').value,
        transcription: { auto: $('#s-t-auto').checked, model: $('#s-t-model').value, language: $('#s-t-lang').value, format: $('#s-t-format').value || 'txt', python: $('#s-t-python').value || 'python3' },
        ai: { provider: $('#s-ai-provider').value, model: $('#s-ai-model').value, autoNotes: $('#s-ai-auto').checked },
    };
    guard(async () => { await api.saveSettings(s); refresh(); });
});

$('#log-toggle').onclick = () => { $('#logpanel').classList.toggle('collapsed'); $('#log-toggle').textContent = $('#logpanel').classList.contains('collapsed') ? '▸' : '▾'; };

// ---------- events from main ----------
let rerenderPending = false;
const softRender = () => { if (rerenderPending) return; rerenderPending = true; requestAnimationFrame(() => { rerenderPending = false; render(); }); };
let refreshTimer = null;
const softRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 300); };

api.on(evt => {
    switch (evt.type) {
        case 'log': log(evt.msg); break;
        case 'login-required': $('#login-banner').classList.remove('hidden'); log('🔐 Login richiesto in Chrome'); break;
        case 'sync-state': S.syncing = evt.syncing; if (!evt.syncing) { runningCourses.clear(); $('#login-banner').classList.add('hidden'); } softRender(); break;
        case 'sync-course':
            if (evt.state === 'running') runningCourses.add(evt.course); else runningCourses.delete(evt.course);
            softRefresh(); break;
        case 'manifest': $('#login-banner').classList.add('hidden'); softRefresh(); break;
        case 'progress': progress[evt.key] = evt; softRender(); break;
        case 'downloaded': delete progress[evt.key]; softRefresh(); break;
        case 'transcribe-queued': tprog[evt.video] = 'queued'; softRender(); break;
        case 'transcribe-start': tprog[evt.video] = 0; log('🎙 Trascrivo ' + evt.video.split('/').pop()); softRender(); break;
        case 'transcribe-progress': tprog[evt.video] = evt.percent; softRender(); break;
        case 'transcribe-done': delete tprog[evt.video]; log('✓ Trascritto ' + evt.video.split('/').pop()); softRefresh(); break;
        case 'transcribe-error': tprog[evt.video] = { error: evt.error }; log('✗ ' + evt.error); softRender(); break;
        case 'ai-start': log(`✨ ${S.tools.ai[evt.provider].label} al lavoro…`); if (aiStream) aiStream.textContent = ''; break;
        case 'ai-chunk': if (aiStream && $('#dlg-view').open) { aiStream.classList.remove('muted'); aiStream.textContent += evt.chunk; $('#v-body').scrollTop = 1e9; } break;
        case 'ai-done':
            log('✓ AI completato' + (evt.file ? ': ' + evt.file : ''));
            if (aiStream && $('#dlg-view').open && evt.file) { viewCtx.file = evt.file; $('#v-title').textContent = evt.file; $('#v-body').innerHTML = md(aiStream.textContent); }
            aiStream = null; softRefresh(); break;
        case 'ai-error': log('✗ AI: ' + evt.error); if (aiStream) aiStream.textContent += '\n\n✗ ' + evt.error; aiStream = null; break;
        case 'refresh': softRefresh(); break;
    }
});

refresh();
