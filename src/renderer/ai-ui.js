'use strict';
/* Semantic search view, AI queue indicator, AI in the course overview.
   Uses globals from app.js / views.js. */

// ═════════════ helpers ═════════════
const fmtTs = s => { s = Math.floor(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const TYPE_LABEL = { lesson: 'Lezione', summary: 'Sommario', ainote: 'Note AI', note: 'Appunto', page: 'Pagina corso', material: 'Materiale' };
const TYPE_ICON = { lesson: '🎬', summary: '✨', ainote: '✨', note: '✎', page: '📄', material: '📎' };
function openSource(m) {
    if (m.type === 'lesson' || m.type === 'summary' || m.type === 'ainote') return go({ name: 'recording', courseId: m.course, key: m.lesson, t: m.type === 'lesson' ? m.t : undefined, side: m.type === 'lesson' ? 'testo' : 'note' });
    if (m.type === 'note') return go({ name: 'notes', scope: m.course || null, file: m.file, kind: m.kind });
    if (m.type === 'material') return guard(() => api.open(m.course, 'materials', m.file));
    if (m.type === 'page') return go({ name: 'course', courseId: m.course, tab: 'panoramica' });
}
function sourceLabel(m) {
    if (m.type === 'lesson') return `${m.title} · ${m.date} · ${fmtTs(m.t)}`;
    if (m.type === 'material') return `${m.file.split('/').pop()}${m.page ? ' · p. ' + m.page : ''}`;
    return m.title || '';
}
function highlight(text, q) {
    const words = (q || '').toLowerCase().match(/\p{L}{3,}/gu) || [];
    let t = esc(text.length > 320 ? text.slice(0, 320) + '…' : text);
    for (const w of words) t = t.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'giu'), '<mark>$1</mark>');
    return t;
}
function renderCitations(md, sources) {
    return PoliEditor.renderMarkdown(md).replace(/\[(\d{1,2})\]/g, (all, n) => sources[+n - 1] ? `<a class="cite" data-cite="${+n - 1}" title="${esc(sourceLabel(sources[+n - 1].meta))}">${n}</a>` : all);
}
function wireCitations(el, sources) { $$('[data-cite]', el).forEach(a => a.onclick = () => openSource(sources[+a.dataset.cite].meta)); }

// ═════════════ SEARCH VIEW ═════════════
window.noRerender.add('search');
window.extraViews.search = async v => {
    const st = await api.search.status();
    const q0 = route.q || '';
    v.innerHTML = `<div class="page">
        <div class="page-head"><div><h1>Cerca</h1><div class="sub">Ricerca per significato in lezioni (al minuto esatto), appunti, sommari, pagine dei corsi e slide — anche tra italiano e inglese</div></div></div>
        ${st.ready ? '' : `<div class="banner" style="margin:0 0 16px">La ricerca semantica non è ancora installata. <button class="small primary" id="s-inst">Installa (~250 MB, tutto in locale)</button></div>`}
        <div class="search-bar"><input id="sq" placeholder="Es. come si evita l'overfitting? · formula della cross-entropy · regole d'esame" value="${esc(q0)}" autofocus>
            <select id="sc" style="width:auto"><option value="">Tutti i corsi</option>${S.courses.map(c => `<option value="${c.id}" ${route.courseId === c.id ? 'selected' : ''}>${esc(cname(c))}</option>`).join('')}</select>
            <button class="primary" id="sgo">Cerca</button><button id="sask" title="Risposta dell'AI basata sulle fonti trovate">✨ Chiedi all'AI</button></div>
        <div id="s-ans"></div>
        <div id="s-res" class="s-res"></div></div>`;
    if ($('#s-inst', v)) $('#s-inst', v).onclick = () => guard(async () => { $('#s-inst', v).disabled = true; $('#s-inst', v).textContent = 'Installo…'; await api.search.install(); toast('Installata: indicizzo i corsi in background'); window.extraViews.search(v); });
    const run = () => guard(async () => {
        const q = $('#sq', v).value.trim(); if (!q) return;
        route.q = q; route.courseId = $('#sc', v).value || null;
        $('#s-res', v).innerHTML = '<div class="empty-state"><span class="spin"></span></div>';
        const { results, needIndex } = await api.search.query(q, route.courseId, 30);
        if (needIndex) { $('#s-res', v).innerHTML = '<div class="empty-state">Indice vuoto: <button id="s-idx">Crea l\'indice ora</button></div>'; $('#s-idx', v).onclick = () => guard(async () => { await api.search.index(); run(); }); return; }
        $('#s-res', v).innerHTML = results.map((r, i) => `<div class="hit" data-i="${i}"><div class="hit-h"><span>${TYPE_ICON[r.meta.type] || '•'} ${TYPE_LABEL[r.meta.type] || ''}</span><b>${esc(sourceLabel(r.meta))}</b><span class="faint">${esc(r.meta.courseName || '')}</span><span class="grow"></span><span class="score" title="pertinenza">${Math.round(Math.min(1, r.score) * 100)}%</span></div><div class="hit-t">${highlight(r.text, q)}</div></div>`).join('') || '<div class="empty-state">Nessun risultato</div>';
        $$('.hit', v).forEach(h => h.onclick = () => openSource(results[+h.dataset.i].meta));
    });
    const ask = () => guard(async () => {
        const q = $('#sq', v).value.trim(); if (!q) return;
        const box = $('#s-ans', v);
        box.innerHTML = `<div class="answer"><div class="ans-h">✨ Risposta</div><div class="ans-b"><span class="spin"></span> <span class="faint">cerco le fonti e scrivo la risposta…</span></div></div>`;
        const r = await api.search.ask(q, $('#sc', v).value || null);
        $('.ans-b', box).innerHTML = `<div class="md">${renderCitations(r.answer, r.sources)}</div><div class="ans-src">${r.sources.slice(0, 8).map((s, i) => `<a data-cite="${i}">[${i + 1}] ${TYPE_ICON[s.meta.type] || ''} ${esc(sourceLabel(s.meta))}</a>`).join('')}</div>`;
        wireCitations(box, r.sources);
        run();
    });
    $('#sgo', v).onclick = run;
    $('#sask', v).onclick = ask;
    $('#sq', v).onkeydown = e => { if (e.key === 'Enter') (e.metaKey || e.ctrlKey ? ask : run)(); };
    if (q0) route.ask ? ask() : run();
    $('#sq', v).focus();
};

// ═════════════ AI queue indicator + failures ═════════════
(() => {
    const el = document.createElement('div');
    el.id = 'ai-status'; el.className = 'ai-status hidden';
    $('#side-status').before(el);
    api.on(e => {
        if (e.type === 'ai-queue') {
            if (!e.current && !e.pending) { el.classList.add('hidden'); return; }
            el.classList.remove('hidden');
            el.innerHTML = `<span class="spin"></span><span class="t" title="${esc((e.items || []).join('\n'))}">${esc(e.current || '')}</span>${e.pending ? `<span class="faint">+${e.pending}</span>` : ''}`;
        }
        if (e.type === 'ai-failed') toast(`AI non riuscita · ${e.label}: ${String(e.error).slice(0, 140)}`, 7000);
        if (e.type === 'search-indexed' && window.Palette) window.Palette.notesCache = null;
    });
})();

// ═════════════ Course overview: AI page + "Chiedi al corso" ═════════════
const _origOverview = window.tabOverview;
window.tabOverview = async (c, el) => {
    await _origOverview(c, el);
    // 1) "Ask this course" box on top
    const main = $('.ov-main', el); if (!main) return;
    const ask = document.createElement('div');
    ask.className = 'block ask-block';
    ask.innerHTML = `<div class="ask-row"><span class="ask-ico">${icon('sparkles')}</span><input id="ov-ask" placeholder="Chiedi qualcosa su ${esc(cname(c))}…"><button id="ov-ask-go">Chiedi</button></div><div id="ov-ans"></div>`;
    main.prepend(ask);
    const go2 = () => guard(async () => {
        const q = $('#ov-ask', ask).value.trim(); if (!q) return;
        const box = $('#ov-ans', ask);
        box.innerHTML = '<div class="ans-b"><span class="spin"></span> <span class="faint">cerco nelle lezioni e nelle slide…</span></div>';
        const r = await api.search.ask(q, c.id);
        box.innerHTML = `<div class="ans-b"><div class="md">${renderCitations(r.answer, r.sources)}</div><div class="ans-src">${r.sources.slice(0, 6).map((s, i) => `<a data-cite="${i}">[${i + 1}] ${TYPE_ICON[s.meta.type] || ''} ${esc(sourceLabel(s.meta))}</a>`).join('')}</div></div>`;
        wireCitations(box, r.sources);
    });
    $('#ov-ask-go', ask).onclick = go2;
    $('#ov-ask', ask).onkeydown = e => { if (e.key === 'Enter') go2(); };
    // 2) course page: AI badge + regenerate
    const w = await api.ws.get(c.id);
    const head = $('.block .block-h', $('#pg-view', el) && $('#pg-view', el).closest('.block'));
    const view = $('#pg-view', el);
    if (view) {
        const isAuto = w.page.startsWith('<!-- polirec:auto');
        const clean = w.page.replace(/^<!--[\s\S]*?-->\s*/, '');
        view.innerHTML = clean.trim() ? PoliEditor.renderMarkdown(clean) : `<p class="faint">${c.recordings.some(r => r.transcript) ? 'La descrizione del corso viene generata dall\'AI dai sommari delle lezioni.' : 'La descrizione verrà generata automaticamente dall\'AI quando ci saranno lezioni trascritte.'}</p>`;
        if (head) {
            const b = document.createElement('span'); b.className = 'pill acc'; b.textContent = isAuto ? 'generata dall\'AI' : clean.trim() ? 'scritta da te' : '';
            if (b.textContent) head.insertBefore(b, head.querySelector('.grow'));
            const rg = document.createElement('button'); rg.className = 'small ghost'; rg.textContent = clean.trim() ? 'Rigenera' : 'Genera ora';
            rg.title = isAuto || !clean.trim() ? 'Riscrive la pagina dai sommari delle lezioni' : 'Sovrascrive la pagina scritta da te';
            rg.onclick = () => guard(async () => { if (clean.trim() && !isAuto && !confirm('La pagina è stata scritta da te: sostituirla con una generata dall\'AI?')) return; await api.genCoursePage(c.id); toast('Generazione in corso: la pagina si aggiornerà da sola'); });
            head.insertBefore(rg, head.querySelector('#pg-edit'));
        }
    }
};
