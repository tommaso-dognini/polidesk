'use strict';
// Background activity: bottom bar (status + what's running), panel with downloads / transcriptions / AI
// (pause and resume each one, or all of them), activity log (kept by polirecd, so it survives closing
// the window), and the "connect your external drive" popup.
(() => {
    const A = { snap: null, log: [], tab: localStorage.getItem('actTab') || 'run', filter: 'all', q: '', drivesShown: new Set(), driveModal: null };
    const panel = () => $('#act-panel'), bar = () => $('#activity');
    const time = iso => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const day = iso => iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '';
    const pct = n => `${Math.max(0, Math.min(100, Math.round(n || 0)))}%`;
    const KIND = { download: ['download', 'Download'], transcribe: ['mic', 'Trascrizioni'], ai: ['sparkles', 'AI'], sync: ['refresh', 'Sincronizzazione'], search: ['search', 'Ricerca'], system: ['info', 'Sistema'] };
    const LEVEL_ICON = { err: '✗', warn: '⚠', ok: '✓', info: '·' };

    // ───────── status line ─────────
    function status(msg, level = 'info') {
        $('#act-text').textContent = msg.replace(/^\s+/, '');
        $('#act-dot').className = 'dot ' + (level === 'err' ? 'err' : level === 'warn' ? 'warn' : busy() ? 'busy' : 'idle');
    }
    const busy = () => { const s = A.snap; return !!s && (s.sync.running || s.downloads.some(d => d.status === 'downloading') || s.transcriptions.some(t => t.status === 'running') || !!s.ai.current); };

    // ───────── log ─────────
    function addLog(e, { quiet } = {}) {
        A.log.push(e);
        if (A.log.length > 2000) A.log.splice(0, A.log.length - 1500);
        if (!quiet) status(e.msg, e.level);
        if (isOpen() && A.tab === 'log' && match(e)) {
            const list = $('.al-list', panel());
            if (list) { const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 30; list.insertAdjacentHTML('beforeend', logRow(e)); list.querySelector('.empty')?.remove(); if (atEnd) list.scrollTop = 1e9; }
        }
    }
    /** Local message from the UI (setup, errors…), same look as the daemon's entries. */
    window.activityLog = (msg, busyFlag = true) => addLog({ t: new Date().toISOString(), level: /^✗/.test(msg) ? 'err' : /^⚠/.test(msg) ? 'warn' : /^✓/.test(msg) ? 'ok' : 'info', kind: 'system', msg, local: true });
    const match = e => (A.filter === 'all' || (A.filter === 'err' ? e.level === 'err' || e.level === 'warn' : e.kind === A.filter))
        && (!A.q || (e.msg + ' ' + (e.courseName || '')).toLowerCase().includes(A.q));
    const logRow = e => `<div class="al-row lv-${e.level}"><span class="al-t">${time(e.t)}</span><span class="al-i">${LEVEL_ICON[e.level] || '·'}</span>${e.courseName ? `<span class="al-c" title="${esc(e.courseName)}">${esc(e.courseName)}</span>` : ''}<span class="al-m">${esc(String(e.msg).trim())}</span></div>`;

    // ───────── snapshot from polirecd ─────────
    let fetching = null;
    async function load() {
        if (fetching) return fetching;
        fetching = api.activity.list().then(s => { A.snap = s; chips(); if (isOpen() && A.tab === 'run') drawRun(); }).catch(() => { }).finally(() => { fetching = null; });
        return fetching;
    }

    // ───────── bottom bar chips ─────────
    function chips() {
        const s = A.snap; if (!s) return;
        const dls = s.downloads.filter(d => d.status === 'downloading'), dq = s.downloads.filter(d => d.status === 'queued').length, dp = s.downloads.filter(d => d.status === 'paused').length;
        const tr = s.transcriptions.find(t => t.status === 'running'), tq = s.transcriptions.filter(t => t.status === 'queued').length, tp = s.transcriptions.filter(t => t.status === 'paused').length;
        const ai = (s.ai.current ? 1 : 0) + (s.ai.pending || 0);
        const out = [];
        if (dls.length || dq) out.push(`<button class="act-chip" data-go="run" title="Download in corso">${icon('download')} ${dls.length ? `${dls.length} · ${pct(dls.reduce((a, d) => a + (d.percent || 0), 0) / dls.length)}` : ''}${dq ? `<span class="faint"> +${dq}</span>` : ''}</button>`);
        if (dp) out.push(`<button class="act-chip paused" data-go="run" title="Download in pausa">${icon('pause')} ${dp}</button>`);
        if (tr || tq) out.push(`<button class="act-chip" data-go="run" title="Trascrizioni">${icon('mic')} ${tr ? pct(tr.percent) : ''}${tq ? `<span class="faint"> +${tq}</span>` : ''}</button>`);
        if (tp) out.push(`<button class="act-chip paused" data-go="run" title="Trascrizioni in pausa">${icon('mic')}${icon('pause')} ${tp}</button>`);
        if (ai) out.push(`<button class="act-chip" data-go="run" title="${esc(s.ai.current || 'AI in coda')}">${icon('sparkles')} ${ai}</button>`);
        if (s.drives.length) out.push(`<button class="act-chip warn" data-drive="1" title="Disco esterno non collegato">${icon('alert')} ${esc(s.drives[0].name)}</button>`);
        $('#act-chips').innerHTML = out.join('');
        $$('#act-chips [data-go]').forEach(b => b.onclick = () => open('run'));
        $$('#act-chips [data-drive]').forEach(b => b.onclick = () => driveModal(A.snap.drives[0]));
        if (!busy() && /^(Pronto|)$/.test($('#act-text').textContent) === false && $('#act-dot').classList.contains('busy')) $('#act-dot').className = 'dot idle';
        if (s.sync.running && s.sync.currentName) status(`Sincronizzo ${s.sync.currentName}…`);
    }

    // ───────── panel ─────────
    const isOpen = () => bar().classList.contains('open');
    function open(tab) {
        if (tab) { A.tab = tab; localStorage.setItem('actTab', tab); }
        bar().classList.add('open');
        draw();
    }
    window.toggleActivity = force => { const o = force ?? !isOpen(); if (o) open(); else bar().classList.remove('open'); };
    $('#act-open').onclick = () => isOpen() && A.tab === 'run' ? toggleActivity(false) : open('run');
    $('#act-toggle').onclick = () => isOpen() && A.tab === 'log' ? toggleActivity(false) : open('log');

    function draw() {
        const p = panel();
        p.innerHTML = `<div class="ap-head">
            <div class="seg">${[['run', 'In corso'], ['log', 'Registro']].map(([k, l]) => `<button data-tab="${k}" class="${A.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
            <span class="grow"></span><div class="ap-tools"></div>
            <button class="icon ghost small" id="ap-close" title="Chiudi (⌘J)">✕</button></div>
            <div class="ap-body"></div>`;
        $$('[data-tab]', p).forEach(b => b.onclick = () => open(b.dataset.tab));
        $('#ap-close', p).onclick = () => toggleActivity(false);
        if (A.tab === 'run') { drawRun(); load(); } else drawLog();
    }

    function drawRun() {
        const p = panel(), s = A.snap; if (!p || !$('.ap-body', p)) return;
        $('.ap-tools', p).innerHTML = '';
        if (!s) { $('.ap-body', p).innerHTML = '<div class="empty">Carico…</div>'; return; }
        const sec = [];
        if (s.drives.length) sec.push(`<section class="ap-sec"><h4>${icon('alert', 'warn')} Dischi non collegati</h4>${s.drives.map((d, i) => `<div class="ap-row"><div class="ap-main"><b>${esc(d.name)}</b><div class="faint">${d.courses.map(c => esc(c.name)).join(' · ')}</div></div><button class="small" data-drv="${i}">Dettagli</button></div>`).join('')}</section>`);
        if (s.sync.running) sec.push(`<section class="ap-sec"><h4>${icon('refresh')} Sincronizzazione</h4><div class="ap-row"><span class="spin"></span><div class="ap-main">${esc(s.sync.currentName || '…')}${s.sync.queue.length ? `<div class="faint">poi altri ${s.sync.queue.length} cors${s.sync.queue.length === 1 ? 'o' : 'i'}</div>` : ''}</div><button class="small" id="ap-stop">Ferma</button></div></section>`);
        // downloads
        const dls = s.downloads.slice().sort((a, b) => ({ downloading: 0, error: 1, queued: 2, paused: 3 }[a.status] - { downloading: 0, error: 1, queued: 2, paused: 3 }[b.status]));
        const anyDl = dls.some(d => d.status !== 'paused');
        sec.push(`<section class="ap-sec"><h4>${icon('download')} Download <span class="faint">${dls.length || ''}</span><span class="grow"></span>
            ${s.downloadsPaused || dls.some(d => d.status === 'paused') ? `<button class="small" id="dl-resume">${icon('play')} Riprendi tutti</button>` : ''}
            ${anyDl && !s.downloadsPaused ? `<button class="small" id="dl-pause">${icon('pause')} Metti in pausa tutti</button>` : ''}</h4>
            ${s.downloadsPaused ? '<div class="ap-note">I download sono in pausa: le nuove lezioni trovate dalla sincronizzazione aspettano.</div>' : ''}
            ${dls.map(dlRow).join('') || '<div class="ap-none">Nessun download</div>'}</section>`);
        // transcriptions
        const trs = s.transcriptions;
        sec.push(`<section class="ap-sec"><h4>${icon('mic')} Trascrizioni <span class="faint">${trs.length || ''}</span><span class="grow"></span>
            ${s.transcriptionsPaused || trs.some(t => t.status === 'paused') ? `<button class="small" id="tr-resume">${icon('play')} Riprendi tutte</button>` : ''}
            ${trs.some(t => t.status !== 'paused') && !s.transcriptionsPaused ? `<button class="small" id="tr-pause">${icon('pause')} Metti in pausa tutte</button>` : ''}</h4>
            ${s.transcriptionsPaused ? '<div class="ap-note">Trascrizione in pausa: il computer resta libero. Riprendi quando vuoi.</div>' : ''}
            ${trs.map(trRow).join('') || '<div class="ap-none">Nessuna trascrizione in coda</div>'}</section>`);
        // AI
        const ai = s.ai;
        if (ai.current || ai.pending) sec.push(`<section class="ap-sec"><h4>${icon('sparkles')} AI <span class="faint">${(ai.current ? 1 : 0) + (ai.pending || 0)}</span></h4>
            ${ai.current ? `<div class="ap-row"><span class="spin"></span><div class="ap-main">${esc(ai.current)}</div></div>` : ''}
            ${ai.pending ? `<div class="ap-none">altri ${ai.pending} in coda (sommari, appunti, pagine dei corsi)</div>` : ''}</section>`);
        const body = $('.ap-body', p);
        body.innerHTML = sec.join('');
        const act = (sel, fn) => { const b = $(sel, body); if (b) b.onclick = () => guard(async () => { b.disabled = true; await fn(); await load(); }); };
        act('#dl-pause', () => api.activity.pauseDownloads());
        act('#dl-resume', () => api.activity.resumeDownloads());
        act('#tr-pause', () => api.activity.pauseTranscriptions());
        act('#tr-resume', () => api.activity.resumeTranscriptions());
        act('#ap-stop', () => api.stopSync());
        $$('[data-drv]', body).forEach(b => b.onclick = () => driveModal(s.drives[+b.dataset.drv]));
        $$('[data-dl]', body).forEach(b => b.onclick = () => guard(async () => {
            b.disabled = true; const [cid, key] = [b.dataset.course, b.dataset.key];
            await (b.dataset.dl === 'pause' ? api.activity.pauseDownload(cid, key) : api.activity.resumeDownload(cid, key)); await load();
        }));
        $$('[data-tr]', body).forEach(b => b.onclick = () => guard(async () => {
            b.disabled = true; await (b.dataset.tr === 'pause' ? api.activity.pauseTranscription(b.dataset.video) : api.activity.resumeTranscription(b.dataset.video)); await load();
        }));
        $$('[data-open]', body).forEach(a => a.onclick = () => { const [cid, key] = a.dataset.open.split('|'); if (key) go({ name: 'recording', courseId: cid, key }); else go({ name: 'course', courseId: cid, tab: 'lezioni' }); });
    }
    function dlRow(d) {
        const st = { downloading: '', queued: 'In coda', paused: 'In pausa', error: 'Non riuscito' }[d.status] || d.status;
        const info = d.status === 'downloading' ? [pct(d.percent), d.speed, d.eta && d.eta !== '0s' ? `mancano ${d.eta}` : ''].filter(Boolean).join(' · ') : st;
        const btn = d.status === 'paused' || d.status === 'error'
            ? `<button class="small" data-dl="resume" data-course="${esc(d.course)}" data-key="${esc(d.key)}" title="${d.status === 'error' ? 'Riprova' : 'Riprendi'}">${icon(d.status === 'error' ? 'refresh' : 'play')}</button>`
            : `<button class="small" data-dl="pause" data-course="${esc(d.course)}" data-key="${esc(d.key)}" title="Metti in pausa">${icon('pause')}</button>`;
        return `<div class="ap-row st-${d.status}" data-row="${esc(d.id)}">
            <div class="ap-main"><a data-open="${esc(d.course)}|${esc(d.key)}">${esc(d.title || d.file || d.key)}</a>
            <div class="faint">${esc(d.courseName || '')}${d.date ? ' · ' + day(d.date) : ''} · <span class="ap-info">${esc(info)}</span>${d.status === 'error' && d.error ? ` — <span class="err-t" title="${esc(d.error)}">${esc(String(d.error).slice(0, 90))}</span>` : ''}</div>
            <div class="bar"><i style="width:${d.status === 'downloading' ? pct(d.percent) : d.status === 'paused' ? pct(d.percent) : '0%'}"></i></div></div>${btn}</div>`;
    }
    function trRow(t) {
        const st = { running: pct(t.percent), queued: 'In coda', paused: 'In pausa' }[t.status];
        const btn = t.status === 'paused'
            ? `<button class="small" data-tr="resume" data-video="${esc(t.video)}" title="Riprendi">${icon('play')}</button>`
            : `<button class="small" data-tr="pause" data-video="${esc(t.video)}" title="${t.status === 'running' ? 'Metti in pausa (ripartirà da capo)' : 'Metti in pausa'}">${icon('pause')}</button>`;
        return `<div class="ap-row st-${t.status}" data-video="${esc(t.video)}">
            <div class="ap-main"><a ${t.course && t.key ? `data-open="${esc(t.course)}|${esc(t.key)}"` : ''}>${esc(t.title)}</a>
            <div class="faint">${esc(t.courseName || '')}${t.date ? ' · ' + day(t.date) : ''} · <span class="ap-info">${esc(st)}</span></div>
            <div class="bar"><i style="width:${t.status === 'running' ? pct(t.percent) : '0%'}"></i></div></div>${btn}</div>`;
    }

    function drawLog() {
        const p = panel(), body = $('.ap-body', p);
        $('.ap-tools', p).innerHTML = `<input id="al-q" placeholder="Filtra…" value="${esc(A.q)}"><button class="small ghost" id="al-copy" title="Copia il registro">${icon('copy')}</button>`;
        const filters = [['all', 'Tutto'], ['err', 'Problemi'], ['sync', 'Sincronizzazione'], ['download', 'Download'], ['transcribe', 'Trascrizioni'], ['ai', 'AI'], ['system', 'Sistema']];
        const rows = A.log.filter(match);
        body.innerHTML = `<div class="al-filters">${filters.map(([k, l]) => `<button class="chip ${A.filter === k ? 'on' : ''}" data-f="${k}">${l}${k === 'err' ? ` <span class="faint">${A.log.filter(e => e.level === 'err' || e.level === 'warn').length || ''}</span>` : ''}</button>`).join('')}</div>
            <div class="al-list">${rows.slice(-800).map(logRow).join('') || '<div class="empty">Nessuna voce</div>'}</div>`;
        const list = $('.al-list', body); list.scrollTop = 1e9;
        $$('[data-f]', body).forEach(b => b.onclick = () => { A.filter = b.dataset.f; drawLog(); });
        const q = $('#al-q', p); q.oninput = () => { A.q = q.value.toLowerCase().trim(); const pos = q.selectionStart; drawLog(); const n = $('#al-q', panel()); n.focus(); n.setSelectionRange(pos, pos); };
        $('#al-copy', p).onclick = () => { api.copy(A.log.filter(match).map(e => `${time(e.t)}  ${e.courseName ? '[' + e.courseName + '] ' : ''}${e.msg}`).join('\n')); toast('Registro copiato'); };
    }

    // live progress without rebuilding the panel
    function liveProgress(e) {
        if (!A.snap) return;
        const id = `${e.course}:${e.key}`;
        const d = A.snap.downloads.find(x => x.id === id);
        if (!d) { load(); return; }
        Object.assign(d, { percent: e.percent, speed: e.speed, eta: e.eta, status: 'downloading' });
        const row = isOpen() && A.tab === 'run' && panel().querySelector(`[data-row="${CSS.escape(id)}"]`);
        if (row) { $('.bar i', row).style.width = pct(e.percent); $('.ap-info', row).textContent = [pct(e.percent), e.speed, e.eta && e.eta !== '0s' ? `mancano ${e.eta}` : ''].filter(Boolean).join(' · '); }
        chipsSoon();
    }
    function liveTranscribe(e) {
        if (!A.snap) return;
        const t = A.snap.transcriptions.find(x => x.video === e.video);
        if (!t) { load(); return; }
        t.percent = e.percent; t.status = 'running';
        const row = isOpen() && A.tab === 'run' && panel().querySelector(`[data-video="${CSS.escape(e.video)}"].ap-row`);
        if (row) { $('.bar i', row).style.width = pct(e.percent); $('.ap-info', row).textContent = pct(e.percent); }
        chipsSoon();
    }
    let chipT = null;
    const chipsSoon = () => { if (!chipT) chipT = setTimeout(() => { chipT = null; chips(); }, 500); };

    // ───────── external drive popup ─────────
    function driveModal(d) {
        if (!d) return;
        if (A.driveModal && A.driveModal.path === d.path && document.contains(A.driveModal.el)) return;
        const m = modal(`<div class="drive-pop">
            <div class="dp-ico">💽</div>
            <h2>Collega il disco «${esc(d.name)}»</h2>
            <p>Le registrazioni e i file di ${d.courses.length === 1 ? 'questo corso sono' : 'questi corsi sono'} sul disco esterno, che ora non è collegato:</p>
            <ul>${d.courses.map(c => `<li>${esc(c.name)}</li>`).join('')}</ul>
            <div class="dp-wait"><span class="spin"></span> In attesa del disco… appena lo colleghi PoliRec lo trova e risincronizza.</div>
            <div class="row end"><button id="dp-later">Più tardi</button><button id="dp-dir">Cambia cartella…</button></div></div>`);
        A.driveModal = { path: d.path, el: m.el, close: () => { m.close(); A.driveModal = null; } };
        $('#dp-later', m.el).onclick = () => A.driveModal.close();
        $('#dp-dir', m.el).onclick = () => { A.driveModal.close(); go({ name: 'course', courseId: d.courses[0].id, tab: 'impostazioni' }); };
        // the daemon watches for the drive and resyncs these courses when it appears
        api.drives.wait(d.courses.map(c => c.id)).catch(() => { });
    }
    function driveConnected(e) {
        const dm = A.driveModal;
        if (dm && dm.path === e.path && document.contains(dm.el)) {
            $('.dp-wait', dm.el).innerHTML = `<span style="color:var(--ok)">✓</span> Disco collegato: sincronizzo…`;
            $('.dp-ico', dm.el).textContent = '✅';
            setTimeout(() => dm.close(), 1600);
        } else toast(`Disco «${e.name}» collegato: sincronizzo`);
        A.drivesShown.delete(e.path);
        load();
    }
    async function checkDrives() {
        const ds = await api.drives.status().catch(() => []);
        const d = ds.find(x => !A.drivesShown.has(x.path));
        if (d) { A.drivesShown.add(d.path); driveModal(d); }
    }

    // ───────── AI tool out of quota / not logged in ─────────
    let aiModalFor = null;
    function aiLimitModal(e) {
        if (aiModalFor === e.provider && document.querySelector('.ai-limit')) return;
        aiModalFor = e.provider;
        const when = e.resetsAt ? new Date(e.resetsAt).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
        const alt = e.alternatives || [], inst = e.installable || [];
        const m = modal(`<div class="ai-limit drive-pop">
            <div class="dp-ico">⚠️</div>
            <h2>${esc(e.label)} ${e.kind === 'quota' ? 'ha esaurito la quota' : 'richiede il login'}</h2>
            <p>${e.kind === 'quota' ? (when ? `La quota si riazzera ${esc(when)}.` : 'Riprova più tardi.') : `Accedi dal terminale (${esc(e.provider)}) e riprova.`} Le note AI in coda sono in pausa.</p>
            <p class="faint" style="font-size:.85em">${esc(e.error)}</p>
            ${alt.length ? `<p><b>Vuoi usare un altro strumento?</b></p><div class="row" style="display:flex;gap:8px;flex-wrap:wrap">${alt.map(a => `<button class="primary" data-use="${a.id}">Usa ${esc(a.label)}</button>`).join('')}</div>
                <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="al-rem"> Usalo sempre (cambia l'impostazione)</label>`
                : '<p><b>Non ci sono altri strumenti AI installati.</b></p>'}
            ${inst.length ? `<details><summary>Installa un altro strumento</summary><ul>${inst.map(i => `<li><b>${esc(i.label)}</b>${i.install && i.install.cmd ? ` — <code>${esc(i.install.cmd)}</code>` : ''}${i.install && i.install.login ? `, poi <code>${esc(i.install.login)}</code>` : ''}</li>`).join('')}</ul></details>` : ''}
            <div class="row end"><button id="al-wait">${e.kind === 'quota' ? 'Aspetta il reset' : 'Più tardi'}</button></div></div>`);
        $$('[data-use]', m.el).forEach(b => b.onclick = () => guard(async () => { await api.aiSwitch.use(b.dataset.use, $('#al-rem', m.el).checked); m.close(); toast('Note AI riprese con ' + b.textContent.replace(/^Usa /, '')); load(); }));
        $('#al-wait', m.el).onclick = () => guard(async () => { await api.aiSwitch.wait(); m.close(); });
    }

    // ───────── events ─────────
    api.on(e => {
        switch (e.type) {
            case 'activity-log': addLog(e.entry); break;
            case 'ai-limit': aiLimitModal(e); load(); break;
            case 'activity': load(); break;
            case 'progress': liveProgress(e); break;
            case 'transcribe-progress': liveTranscribe(e); break;
            case 'sync-state': if (!e.syncing) setTimeout(() => { if (!busy()) status('Pronto', 'ok'); }, 800); break;
            case 'drive-missing': driveModal({ name: e.name, path: e.path, courses: (e.courses || []).map((id, i) => ({ id, name: (e.courseNames || [])[i] || id })) }); break;
            case 'drive-connected': driveConnected(e); break;
            case 'login-required': status(e.id ? '🔐 Accedi al Politecnico nella finestra di login' : '🔐 Login richiesto nella finestra di Chrome', 'warn'); break;
            case 'login-done': status(e.cancelled ? 'Login annullato' : '✓ Login completato', e.cancelled ? 'warn' : 'ok'); break;
        }
    });

    // history kept by polirecd (also what happened while the window was closed)
    api.activity.log().then(entries => { A.log = entries.concat(A.log.filter(e => e.local)); const last = entries[entries.length - 1]; if (last) status(last.msg, last.level === 'err' ? 'err' : 'info'); }).catch(() => { });
    load().then(() => { if (!busy()) $('#act-dot').className = 'dot idle'; });
    setTimeout(checkDrives, 1200);
    /** Popup for the drive of one course (course page, dashboard). */
    const driveFor = c => driveModal({ name: c.drive.name, path: c.drive.path, courses: S.courses.filter(x => x.drive && x.drive.path === c.drive.path).map(x => ({ id: x.id, name: cname(x) })) });
    window.ActivityUI = { open, load, checkDrives, driveFor };
})();
