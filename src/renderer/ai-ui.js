'use strict';
/* Command palette (⇧⌘P / ⌘K), semantic search view, AI queue indicator, AI in the course overview.
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

// ═════════════ COMMAND PALETTE ═════════════
const Palette = { open: false, items: [], sel: 0, notesCache: null, searchT: null };
async function paletteCommands() {
    const nav = (label, r, kw = '') => ({ g: 'Vai a', label, kw, run: () => go(r) });
    const s = S.settings;
    const cmds = [
        nav('Dashboard', { name: 'dashboard' }), nav('Appunti', { name: 'notes' }), nav('Calendario', { name: 'calendar' }), nav('Aule libere', { name: 'rooms' }, 'aule stanze'),
        nav('Da fare', { name: 'todos' }, 'todo attività'), nav('Cerca', { name: 'search' }, 'ricerca semantica'), nav('Community', { name: 'community' }), nav('Impostazioni', { name: 'settings' }, 'preferenze'),
        ...S.courses.flatMap(c => [
            nav(`${cname(c)}`, { name: 'course', courseId: c.id, tab: 'panoramica' }, 'corso ' + (c.manifest.course ? c.manifest.course.fullname : '')),
            nav(`${cname(c)} · Lezioni`, { name: 'course', courseId: c.id, tab: 'lezioni' }, 'registrazioni video'),
            nav(`${cname(c)} · Materiale`, { name: 'course', courseId: c.id, tab: 'materiale' }, 'slide pdf'),
        ]),
        ...['markdown', 'latex', 'typst'].map(k => ({ g: 'Appunti', label: `Nuovo appunto ${KIND_LABEL[k]}`, kw: 'crea nota', run: async () => { const scope = route.courseId || null; const t = await askText(`Nuovo appunto ${KIND_LABEL[k]}`, { placeholder: 'Titolo', ok: 'Crea' }); if (t === null) return; const f = await api.notes.create(scope, t.trim() || 'Senza titolo', k); go({ name: 'notes', scope, file: f, kind: k }); } })),
        { g: 'Aspetto', label: 'Tema: Normale', kw: 'theme apple', run: () => setUi({ theme: 'normal' }) },
        { g: 'Aspetto', label: 'Tema: Developer', kw: 'theme mono', run: () => setUi({ theme: 'developer' }) },
        { g: 'Aspetto', label: 'Aspetto: Chiaro', kw: 'light', run: () => { setUi({ appearance: 'light' }); api.setAppearance('light'); } },
        { g: 'Aspetto', label: 'Aspetto: Scuro', kw: 'dark', run: () => { setUi({ appearance: 'dark' }); api.setAppearance('dark'); } },
        { g: 'Aspetto', label: 'Aspetto: Come il sistema', kw: 'auto', run: () => { setUi({ appearance: 'auto' }); api.setAppearance('auto'); } },
        { g: 'Aspetto', label: 'Font: JetBrains Mono', kw: 'font', run: () => setUi({ font: 'jetbrains' }) },
        { g: 'Aspetto', label: 'Font: Sistema', kw: 'font', run: () => setUi({ font: 'system' }) },
        { g: 'Aspetto', label: 'Mostra/nascondi barra laterale', kw: 'sidebar ⌘\\', run: () => window.toggleSidebar(!$('#app').classList.contains('sb-collapsed')) },
        { g: 'Azioni', label: 'Sincronizza tutti i corsi', kw: 'sync scarica', run: () => api.sync() },
        ...S.courses.map(c => ({ g: 'Azioni', label: `Sincronizza ${cname(c)}`, kw: 'sync', run: () => api.sync([c.id]) })),
        ...S.courses.map(c => ({ g: 'Azioni', label: `Rigenera descrizione di ${cname(c)}`, kw: 'ai pagina corso', run: async () => { await api.genCoursePage(c.id); toast('In coda all\'AI'); } })),
        { g: 'Azioni', label: 'Applica le funzioni AI alle lezioni già trascritte', kw: 'sommari appunti backfill', run: async () => { const n = await api.aiBackfill(); toast(n ? `${n} attività AI in coda` : 'Niente da fare'); } },
        { g: 'Azioni', label: 'Aggiorna indice di ricerca', kw: 'search index', run: async () => { toast('Indicizzo…'); await api.search.index(); toast('Indice aggiornato'); } },
        { g: 'Azioni', label: 'Aggiorna orario delle lezioni', kw: 'calendario timetable', run: async () => { await api.cal.sync(); toast('Orario aggiornato'); } },
        { g: 'Pomodoro', label: Pomo.st.running ? 'Pomodoro: pausa' : 'Pomodoro: avvia', kw: 'timer focus', run: () => Pomo.st.running ? Pomo.pause() : Pomo.start() },
        { g: 'Pomodoro', label: 'Pomodoro: azzera', kw: 'timer', run: () => Pomo.reset() },
        ...[['Trascrizione', 'whisper motore'], ['AI', 'assistente provider'], ['Integrazioni', 'notion goodnotes obsidian apple'], ['Sincronizzazione cloud', 'icloud drive'], ['Appunti', 'latex typst markdown'], ['Pomodoro', 'timer'], ['Aspetto', 'tema font']].map(([g, kw]) => ({ g: 'Impostazioni', label: `Impostazioni → ${g}`, kw, run: () => { go({ name: 'settings' }); setTimeout(() => { const h = $$('.group h3').find(x => x.textContent.toLowerCase().startsWith(g.toLowerCase())); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 600); } })),
    ];
    // notes (all scopes)
    if (!Palette.notesCache) {
        Palette.notesCache = [];
        try { const scopes = await api.notes.scopes(); for (const sc of scopes) for (const f of await api.notes.list(sc.id)) Palette.notesCache.push({ g: 'Appunti', label: f.file.replace(/\.(md|tex|typ)$/, ''), kw: sc.name + ' ' + f.kind, hint: sc.name, run: () => go({ name: 'notes', scope: sc.id, file: f.file, kind: f.kind }) }); } catch (e) { }
    }
    return cmds.concat(Palette.notesCache);
}
function setUi(patch) { S.settings.ui = { ...(S.settings.ui || {}), ...patch }; applyUi(); api.saveSettings({ ui: S.settings.ui }); }

function score(item, q) {
    if (!q) return 1;
    const hay = (item.label + ' ' + (item.kw || '') + ' ' + item.g).toLowerCase();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let sc = 0;
    for (const w of words) {
        const i = hay.indexOf(w);
        if (i < 0) { // subsequence fuzzy
            let j = 0; for (const ch of hay) if (ch === w[j]) j++;
            if (j < w.length) return 0; sc += 0.3;
        } else sc += i === 0 || hay[i - 1] === ' ' ? 2 : 1;
    }
    return sc + (item.label.toLowerCase().startsWith(q.toLowerCase()) ? 3 : 0);
}

async function openPalette(prefill = '') {
    if (Palette.open) return;
    Palette.open = true; Palette.notesCache = null;
    const root = document.createElement('div');
    root.className = 'pal-bg'; root.id = 'palette';
    root.innerHTML = `<div class="pal"><input id="pal-q" placeholder="Cerca comandi, corsi, appunti… o scrivi una domanda" value="${esc(prefill)}"><div id="pal-list" class="pal-list"></div><div class="pal-foot"><span>↑↓ muovi</span><span>↵ esegui</span><span>⌘↵ chiedi all'AI</span><span>esc chiudi</span></div></div>`;
    document.body.appendChild(root);
    const all = await paletteCommands();
    const input = $('#pal-q');
    const close = () => { Palette.open = false; root.remove(); };
    root.onclick = e => { if (e.target === root) close(); };
    const draw = (sem = []) => {
        const q = input.value.trim();
        let items = all.map(i => ({ ...i, s: score(i, q) })).filter(i => i.s > 0).sort((a, b) => b.s - a.s).slice(0, q ? 12 : 40);
        if (q.length >= 3) items.push(
            { g: 'Cerca', label: `Cerca «${q}» ovunque`, icon: '🔎', run: () => go({ name: 'search', q }) },
            { g: 'Cerca', label: `Chiedi all'AI: «${q}»`, icon: '✨', run: () => go({ name: 'search', q, ask: true }) },
            ...sem.map(r => ({ g: 'Risultati', label: sourceLabel(r.meta), hint: (TYPE_LABEL[r.meta.type] || '') + ' · ' + (r.meta.courseName || ''), icon: TYPE_ICON[r.meta.type], sub: r.text.slice(0, 120), run: () => openSource(r.meta) })));
        Palette.items = items; Palette.sel = Math.min(Palette.sel, Math.max(0, items.length - 1));
        let lastG = '';
        $('#pal-list').innerHTML = items.map((it, i) => {
            const head = it.g !== lastG ? `<div class="pal-g">${esc(it.g)}</div>` : ''; lastG = it.g;
            return head + `<div class="pal-i ${i === Palette.sel ? 'on' : ''}" data-i="${i}">${it.icon ? `<span class="pi">${it.icon}</span>` : ''}<span class="pl">${esc(it.label)}${it.sub ? `<span class="ps">${esc(it.sub)}</span>` : ''}</span>${it.hint ? `<span class="ph">${esc(it.hint)}</span>` : ''}</div>`;
        }).join('') || '<div class="pal-empty">Nessun comando</div>';
        $$('.pal-i').forEach(el => { el.onmouseenter = () => { Palette.sel = +el.dataset.i; $$('.pal-i').forEach(x => x.classList.toggle('on', x === el)); }; el.onclick = () => exec(+el.dataset.i); });
        const on = $('.pal-i.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const exec = i => { const it = Palette.items[i]; if (!it) return; close(); guard(async () => it.run()); };
    input.oninput = () => {
        Palette.sel = 0; draw();
        clearTimeout(Palette.searchT);
        const q = input.value.trim();
        if (q.length >= 4) Palette.searchT = setTimeout(async () => { try { const r = await api.search.query(q, null, 5); if (Palette.open && input.value.trim() === q) draw(r.results || []); } catch (e) { } }, 300);
    };
    input.onkeydown = e => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); Palette.sel = Math.min(Palette.items.length - 1, Palette.sel + 1); draw(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); Palette.sel = Math.max(0, Palette.sel - 1); draw(); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); const q = input.value.trim(); if (q) { close(); go({ name: 'search', q, ask: true }); } }
        else if (e.key === 'Enter') { e.preventDefault(); exec(Palette.sel); }
    };
    draw(); input.focus(); input.select();
}
window.openPalette = openPalette;
document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && ((e.shiftKey && k === 'p') || k === 'k')) { e.preventDefault(); Palette.open ? $('#palette') && $('#palette').click() : openPalette(); }
});

// ═════════════ AI queue indicator + failures ═════════════
(() => {
    const el = document.createElement('div');
    el.id = 'ai-status'; el.className = 'ai-status hidden';
    $('#side-status').before(el);
    api.on(e => {
        if (e.type === 'ai-queue') {
            if (!e.current && !e.pending) { el.classList.add('hidden'); return; }
            el.classList.remove('hidden');
            el.innerHTML = `<span class="spin"></span><span class="t" title="${esc((e.items || []).join('\n'))}">✨ ${esc(e.current || '')}</span>${e.pending ? `<span class="faint">+${e.pending}</span>` : ''}`;
        }
        if (e.type === 'ai-failed') toast(`AI non riuscita · ${e.label}: ${String(e.error).slice(0, 140)}`, 7000);
        if (e.type === 'search-indexed') Palette.notesCache = null;
    });
    // search entry in the sidebar nav
    const nav = $('.nav');
    if (nav && !$('[data-route="search"]', nav)) {
        const a = document.createElement('a'); a.className = 'nav-item'; a.dataset.route = 'search';
        a.innerHTML = '<span class="ico">⌕</span>Cerca<span class="badge">⌘K</span>';
        a.onclick = () => go({ name: 'search' });
        nav.insertBefore(a, nav.children[1]);
    }
})();

// ═════════════ Course overview: AI page + "Chiedi al corso" ═════════════
const _origOverview = window.tabOverview;
window.tabOverview = async (c, el) => {
    await _origOverview(c, el);
    // 1) "Ask this course" box on top
    const main = $('.ov-main', el); if (!main) return;
    const ask = document.createElement('div');
    ask.className = 'block ask-block';
    ask.innerHTML = `<div class="ask-row"><span class="ask-ico">✨</span><input id="ov-ask" placeholder="Chiedi qualcosa su ${esc(cname(c))}… (es. cosa serve sapere per l'esame? come funziona la LSTM?)"><button class="primary" id="ov-ask-go">Chiedi</button></div><div id="ov-ans"></div>`;
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
            const b = document.createElement('span'); b.className = 'pill acc'; b.textContent = isAuto ? '✨ generata dall\'AI' : clean.trim() ? 'scritta da te' : '';
            if (b.textContent) head.insertBefore(b, head.querySelector('.grow'));
            const rg = document.createElement('button'); rg.className = 'small ghost'; rg.textContent = clean.trim() ? '✨ Rigenera' : '✨ Genera ora';
            rg.title = isAuto || !clean.trim() ? 'Riscrive la pagina dai sommari delle lezioni' : 'Sovrascrive la pagina scritta da te';
            rg.onclick = () => guard(async () => { if (clean.trim() && !isAuto && !confirm('La pagina è stata scritta da te: sostituirla con una generata dall\'AI?')) return; await api.genCoursePage(c.id); toast('Generazione in corso: la pagina si aggiornerà da sola'); });
            head.insertBefore(rg, head.querySelector('#pg-edit'));
        }
    }
};
