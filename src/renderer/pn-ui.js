'use strict';
/* Appunti PoliNetwork — the students' archive of notes, past exams and material (gitlab.com/polinetwork,
   one repo per degree and year, one folder per course). The course overview links the matching folder;
   the "Appunti PoliNetwork" tab lists its files to pick what to download into materiale/PoliNetwork. */

const PnUI = { tree: {}, sel: {}, open: {}, q: '', job: {} };
const pnLinks = c => Array.isArray(c.polinetwork) ? c.polinetwork : [];
const pnWhere = s => [s.degree, s.year].filter(Boolean).join(' · ');
const pnLocalCount = c => (c.materialFiles || []).filter(f => f.startsWith('PoliNetwork/')).length;
const pnKey = (s, f) => `${s.repo}\u001f${s.folder}\u001f${f.path}`;

// ───────── overview block ─────────
PnUI.overview = async (c, el) => {
    const head = `<div class="block-h"><b>Appunti PoliNetwork</b><span class="grow"></span><a class="faint" data-pn-site title="L'archivio di appunti degli studenti del Politecnico">cos'è?</a></div>`;
    el.innerHTML = head + '<p class="faint"><span class="spin"></span> Cerco il corso nell\'archivio…</p>';
    let m;
    try { m = await api.pn.match(c.id); }
    catch (e) { el.innerHTML = head + `<p class="faint">Archivio non raggiungibile. <a data-pn-retry>Riprova</a></p>`; $('[data-pn-retry]', el).onclick = () => PnUI.overview(c, el); return; }
    const best = m.candidates[0];
    if (m.linked.length) {
        const n = pnLocalCount(c);
        el.innerHTML = head + m.linked.map(s => `<div class="pn-src"><b>${esc(s.name)}</b><span class="faint">${esc(pnWhere(s))}</span></div>`).join('')
            + `<div class="faint pn-n">${n ? `${n} file scaricati` : 'Appunti, temi d\'esame e materiale degli anni passati'}</div>
            <button class="small primary" data-pn-go>${icon('download')} Scegli cosa scaricare</button>`;
    } else if (best && best.score >= 0.8) {
        el.innerHTML = head + `<div class="faint">Trovato nell'archivio:</div><div class="pn-src"><b>${esc(best.name)}</b><span class="faint">${esc(pnWhere(best))}</span></div>
            <div class="row pn-act"><button class="small primary" data-pn-use>${icon('book')} Vedi i file</button><button class="small ghost" data-pn-pick>Non è questo</button></div>`;
        $('[data-pn-use]', el).onclick = () => guard(async () => { await api.updateCourse(c.id, { polinetwork: [{ repo: best.repo, folder: best.folder }] }); await refresh(); go({ name: 'course', courseId: c.id, tab: 'polinetwork' }); });
    } else {
        el.innerHTML = head + `<p class="faint" style="margin:0 0 8px">${best ? 'Forse è uno di questi corsi:' : 'Non ho trovato questo corso nell\'archivio.'}</p>
            ${m.candidates.slice(0, 2).map((s, i) => `<div class="lnk" data-pn-cand="${i}"><b>${esc(s.name)}</b> <span class="faint">${esc(pnWhere(s))}</span></div>`).join('')}
            <button class="small ghost" data-pn-pick>Cerca il corso…</button>`;
        $$('[data-pn-cand]', el).forEach(a => a.onclick = () => guard(async () => { const s = m.candidates[+a.dataset.pnCand]; await api.updateCourse(c.id, { polinetwork: [{ repo: s.repo, folder: s.folder }] }); await refresh(); go({ name: 'course', courseId: c.id, tab: 'polinetwork' }); }));
    }
    $('[data-pn-site]', el).onclick = () => api.openExternal(m.site);
    if ($('[data-pn-go]', el)) $('[data-pn-go]', el).onclick = () => go({ name: 'course', courseId: c.id, tab: 'polinetwork' });
    if ($('[data-pn-pick]', el)) $('[data-pn-pick]', el).onclick = () => PnUI.pick(c, () => go({ name: 'course', courseId: c.id, tab: 'polinetwork' }));
};

// ───────── choose the folder(s) ─────────
PnUI.pick = async (c, after) => {
    const chosen = new Map(pnLinks(c).map(l => [l.repo + '\u001f' + l.folder, l]));
    const m = modal(`<h2>Corso nell'archivio PoliNetwork</h2>
        <p class="muted" style="margin-top:0">Scegli la cartella di <b>${esc(cname(c))}</b>. Puoi sceglierne più di una (ad esempio lo stesso esame in corsi di laurea diversi).</p>
        <input id="pn-q" placeholder="Cerca un corso: es. Analisi 2, ACSO, Machine Learning…" autocomplete="off">
        <div class="pn-cands" id="pn-list"><p class="faint"><span class="spin"></span> Carico l'archivio…</p></div>
        <div class="foot"><a class="faint" id="pn-site">Apri il sito PoliNetwork ↗</a><span class="grow"></span><button class="ghost" id="pn-no">Annulla</button><button class="primary" id="pn-ok">Salva</button></div>`, { wide: true });
    let last = [];
    const draw = list => {
        const extra = [...chosen.values()].filter(l => !list.some(s => s.repo === l.repo && s.folder === l.folder)).map(l => ({ ...l, name: l.folder.replace(/#U([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), degree: '', year: '' }));
        last = [...extra, ...list];
        $('#pn-list', m.el).innerHTML = last.map((s, i) => `<label class="tch"><input type="checkbox" data-i="${i}" ${chosen.has(s.repo + '\u001f' + s.folder) ? 'checked' : ''}><b>${esc(s.name)}</b><span class="faint">${esc(pnWhere(s) || s.repo)}</span></label>`).join('')
            || '<p class="faint">Nessun corso trovato con questo nome. Prova con la sigla o il nome in inglese.</p>';
        $$('#pn-list input', m.el).forEach(i => i.onchange = () => { const s = last[+i.dataset.i]; const k = s.repo + '\u001f' + s.folder; if (i.checked) chosen.set(k, { repo: s.repo, folder: s.folder }); else chosen.delete(k); });
    };
    let t = null, seq = 0;
    const search = async q => { const my = ++seq; try { const r = await api.pn.match(c.id, q || undefined); if (my === seq) draw(r.candidates); } catch (e) { if (my === seq) $('#pn-list', m.el).innerHTML = `<p class="faint">${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</p>`; } };
    $('#pn-q', m.el).oninput = e => { clearTimeout(t); t = setTimeout(() => search(e.target.value.trim()), 200); };
    $('#pn-q', m.el).focus();
    $('#pn-site', m.el).onclick = () => api.openExternal('https://polinetwork.org/it/materials/view/');
    $('#pn-no', m.el).onclick = m.close;
    $('#pn-ok', m.el).onclick = () => guard(async () => {
        m.close();
        await api.updateCourse(c.id, { polinetwork: [...chosen.values()] });
        delete PnUI.tree[c.id]; delete PnUI.sel[c.id];
        await refresh();
        if (after) after();
    });
    search('');
};

// ───────── the page: pick files to download ─────────
window.tabPoliNetwork = async (c, el) => {
    if (!pnLinks(c).length) {
        el.innerHTML = `<div class="empty-state"><h2>Appunti PoliNetwork</h2><p>Appunti, temi d'esame e materiale raccolti dagli studenti del Politecnico negli anni,<br>dall'archivio della community <a data-ext>PoliNetwork</a>.</p>
            <button class="primary" id="pn-pick">Trova il corso nell'archivio…</button></div>`;
        $('[data-ext]', el).onclick = () => api.openExternal('https://polinetwork.org/it/materials/view/');
        $('#pn-pick', el).onclick = () => PnUI.pick(c, () => window.tabPoliNetwork(course(c.id), el));
        return;
    }
    if (!PnUI.tree[c.id]) {
        el.innerHTML = '<div class="empty-state small"><span class="spin"></span> Leggo l\'elenco dei file da GitLab…</div>';
        try { PnUI.tree[c.id] = await api.pn.tree(c.id); }
        catch (e) { el.innerHTML = `<div class="empty-state"><h2>Archivio non raggiungibile</h2><p>${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</p><button id="pn-retry">Riprova</button></div>`; $('#pn-retry', el).onclick = () => window.tabPoliNetwork(c, el); return; }
        if (!PnUI.job[c.id]) { const st = await api.pn.status(c.id).catch(() => null); if (st) PnUI.job[c.id] = st; }
    }
    PnUI.render(c, el);
};

// path tree of one source: {dirs: {name: node}, files: [file]}
function pnBuild(src) {
    const root = { dirs: {}, files: [], path: '' };
    for (const f of src.files) {
        const parts = f.path.split('/');
        let n = root;
        for (const p of parts.slice(0, -1)) n = n.dirs[p] || (n.dirs[p] = { dirs: {}, files: [], path: (n.path ? n.path + '/' : '') + p });
        n.files.push({ ...f, name: parts[parts.length - 1] });
    }
    return root;
}
const pnAll = n => [...n.files, ...Object.values(n.dirs).flatMap(pnAll)];
const pnName = s => s.replace(/#U([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

PnUI.render = (c, el) => {
    const data = PnUI.tree[c.id];
    const sel = PnUI.sel[c.id] || (PnUI.sel[c.id] = new Set());
    const open = PnUI.open[c.id] || (PnUI.open[c.id] = new Set());
    const q = PnUI.q.toLowerCase();
    const job = PnUI.job[c.id];
    const all = data.sources.flatMap(s => s.files.map(f => ({ s, f })));
    const nNew = all.filter(x => x.f.state === 'new').length, nUpd = all.filter(x => x.f.state === 'updated').length, nLoc = all.length - nNew - nUpd;
    const match = f => !q || pnName(f.path).toLowerCase().includes(q);
    const ext = n => (n.match(/\.([a-z0-9]{1,5})$/i) || [])[1] || '';
    const pill = f => f.state === 'local' ? '<span class="pill ok">scaricato</span>' : f.state === 'updated' ? '<span class="pill warn">aggiornato</span>' : '';
    const fileRow = (s, f) => `<label class="pn-f ${f.state}" title="${esc(pnName(f.path))}"><input type="checkbox" data-k="${esc(pnKey(s, f))}" ${sel.has(pnKey(s, f)) ? 'checked' : ''}>
        <span class="faint">${icon('file')}</span><span class="nm">${esc(pnName(f.name))}</span>${ext(f.name) ? `<span class="ext">${esc(ext(f.name).toUpperCase())}</span>` : ''}${pill(f)}
        ${f.state !== 'new' ? `<button class="small ghost icon" data-open="${esc(f.local)}" title="Apri" aria-label="Apri">${icon('external')}</button>` : ''}</label>`;
    const dirHtml = (s, n, depth) => {
        const dirs = Object.entries(n.dirs).sort(([a], [b]) => a.localeCompare(b, 'it', { numeric: true }));
        const files = n.files.filter(match);
        let html = '';
        for (const [name, d] of dirs) {
            const inside = pnAll(d).filter(match);
            if (!inside.length) continue;
            const k = s.repo + '\u001f' + s.folder + '\u001f' + d.path;
            const nSel = inside.filter(f => sel.has(pnKey(s, f))).length;
            const isOpen = q || open.has(k);
            html += `<details class="pn-d" data-dk="${esc(k)}" ${isOpen ? 'open' : ''} style="--d:${depth}"><summary><input type="checkbox" data-dir="${esc(k)}" ${nSel && nSel === inside.length ? 'checked' : ''} ${nSel && nSel < inside.length ? 'data-mixed' : ''}>
                <span class="faint">${icon('folder')}</span><span class="nm">${esc(pnName(name))}</span><span class="faint">${inside.length}</span>${inside.every(f => f.state === 'local') ? '<span class="pill ok">scaricata</span>' : ''}</summary>
                ${isOpen ? dirHtml(s, d, depth + 1) : ''}</details>`;
        }
        html += files.map(f => `<div class="pn-row" style="--d:${depth}">${fileRow(s, f)}</div>`).join('');
        return html;
    };
    const trees = data.sources.map(s => ({ s, root: pnBuild(s) }));
    PnUI.trees = trees;
    el.innerHTML = `<div class="pn-page">
        <div class="pn-head">${data.sources.map(s => `<div class="pn-srcbig"><div><b>${esc(s.name)}</b> <span class="faint">${esc(pnWhere(s) || s.repo)}</span></div>
            ${s.error ? `<div class="pill err">${esc(s.error)}</div>` : `<div class="faint">${s.files.length} file</div>`}<a data-web="${esc(s.web)}">GitLab ↗</a></div>`).join('')}
            <span class="grow"></span><button class="ghost small" id="pn-change">Cambia corso…</button></div>
        <p class="muted pn-intro">Appunti, temi d'esame e materiale condivisi dagli studenti nell'archivio della community <a data-ext>PoliNetwork</a>. Scegli cosa scaricare: i file vanno in <code>materiale/PoliNetwork</code> e compaiono nella scheda Materiale.</p>
        ${job ? `<div class="pn-job"><span class="spin"></span><span class="grow">Scarico ${job.done} di ${job.total}${job.file ? ` · <span class="faint">${esc(job.file.split('/').pop())}</span>` : ''}</span><div class="progress" style="width:180px"><i style="width:${job.total ? Math.round(job.done / job.total * 100) : 0}%"></i></div><button class="small ghost" id="pn-stop">Ferma</button></div>` : ''}
        <div class="toolbar"><input id="pn-filter" type="search" placeholder="Filtra i file…" value="${esc(PnUI.q)}" style="flex:1;min-width:180px">
            <span class="muted">Seleziona:</span>
            <div class="seg"><button data-s="new">Da scaricare${nNew ? ` (${nNew})` : ''}</button>${nUpd ? `<button data-s="updated">Aggiornati (${nUpd})</button>` : ''}<button data-s="all">Tutti</button><button data-s="none">Nessuno</button></div></div>
        <div class="list files pn-tree">${trees.map(({ s, root }) => (trees.length > 1 ? `<div class="pn-sh">${esc(s.name)} <span class="faint">${esc(pnWhere(s))}</span></div>` : '') + dirHtml(s, root, 0)).join('') || '<div class="empty-state small">Nessun file.</div>'}
            ${q && !all.some(x => match(x.f)) ? '<div class="empty-state small">Nessun file corrisponde al filtro.</div>' : ''}</div>
        <div class="pn-bar"><span class="muted" id="pn-count"></span><span class="faint">${nLoc ? `${nLoc} già scaricati` : ''}</span><span class="grow"></span>
            ${pnLocalCount(c) ? `<button class="ghost" id="pn-folder">Apri cartella</button>` : ''}<button class="primary" id="pn-dl" ${job ? 'disabled' : ''}>${icon('download')} Scarica</button></div></div>`;

    const keyed = new Map(all.map(x => [pnKey(x.s, x.f), x]));
    const count = () => {
        const n = sel.size;
        $('#pn-count', el).textContent = n ? `${n} file selezionati` : 'Nessun file selezionato';
        $('#pn-dl', el).disabled = !n || !!job;
        $('#pn-dl', el).innerHTML = `${icon('download')} Scarica${n ? ' ' + n : ''}`;
    };
    $$('[data-mixed]', el).forEach(i => i.indeterminate = true);
    count();
    const rerender = () => { const sc = $('#view').scrollTop; PnUI.render(c, el); $('#view').scrollTop = sc; };
    $$('[data-k]', el).forEach(i => i.onchange = () => { if (i.checked) sel.add(i.dataset.k); else sel.delete(i.dataset.k); rerender(); });
    $$('[data-dir]', el).forEach(i => {
        i.onclick = e => e.stopPropagation();
        i.onchange = () => {
            const [repo, folder, path] = i.dataset.dir.split('\u001f');
            const files = all.filter(x => x.s.repo === repo && x.s.folder === folder && x.f.path.startsWith(path + '/') && match(x.f));
            for (const x of files) { const k = pnKey(x.s, x.f); if (i.checked) sel.add(k); else sel.delete(k); }
            rerender();
        };
    });
    $$('details.pn-d', el).forEach(d => d.ontoggle = () => {
        const k = d.dataset.dk;
        if (d.open === open.has(k) || q) return;
        if (d.open) open.add(k); else open.delete(k);
        rerender();
    });
    $$('[data-s]', el).forEach(b => b.onclick = () => {
        const v = b.dataset.s;
        if (v === 'none') sel.clear();
        else for (const x of all) if (match(x.f) && (v === 'all' || x.f.state === v)) sel.add(pnKey(x.s, x.f));
        rerender();
    });
    $$('[data-open]', el).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); guard(() => api.open(c.id, 'materials', 'PoliNetwork/' + b.dataset.open)); });
    $$('[data-web]', el).forEach(a => a.onclick = () => api.openExternal(a.dataset.web));
    $$('[data-ext]', el).forEach(a => a.onclick = () => api.openExternal('https://polinetwork.org/it/materials/view/'));
    $('#pn-change', el).onclick = () => PnUI.pick(c, () => window.tabPoliNetwork(course(c.id), el));
    let ft = null;
    $('#pn-filter', el).oninput = e => { clearTimeout(ft); ft = setTimeout(() => { PnUI.q = e.target.value; rerender(); const f = $('#pn-filter', el); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }, 180); };
    if ($('#pn-folder', el)) $('#pn-folder', el).onclick = () => guard(() => api.open(c.id, 'materials', 'PoliNetwork'));
    if ($('#pn-stop', el)) $('#pn-stop', el).onclick = () => guard(() => api.pn.cancel(c.id));
    $('#pn-dl', el).onclick = () => guard(async () => {
        const files = [...sel].map(k => keyed.get(k)).filter(Boolean).map(({ s, f }) => ({ repo: s.repo, folder: s.folder, path: f.path, oid: f.oid }));
        if (!files.length) return;
        PnUI.job[c.id] = { done: 0, total: files.length };
        await api.pn.download(c.id, files);
        rerender();
    });
};

// ───────── daemon events ─────────
PnUI.onEvent = e => {
    const here = () => route.name === 'course' && route.courseId === e.courseId && route.tab === 'polinetwork' && $('.pn-page');
    if (e.type === 'pn-progress') {
        PnUI.job[e.courseId] = e;
        const j = $('.pn-job');
        if (here() && j) {
            j.querySelector('.grow').innerHTML = `Scarico ${e.done} di ${e.total}${e.file ? ` · <span class="faint">${esc(e.file.split('/').pop())}</span>` : ''}`;
            j.querySelector('.progress > i').style.width = (e.total ? Math.round(e.done / e.total * 100) : 0) + '%';
        } else if (here()) PnUI.render(course(e.courseId), $('#tab'));
    } else if (e.type === 'pn-done') {
        delete PnUI.job[e.courseId];
        const c = course(e.courseId);
        toast(e.error ? 'PoliNetwork: ' + e.error : `${c ? cname(c) + ': ' : ''}${e.downloaded} file scaricati da PoliNetwork${e.failed ? ` · ${e.failed} non riusciti` : ''}${e.stopped ? ' (fermato)' : ''}`, 5000);
        if (PnUI.sel[e.courseId] && !e.error) PnUI.sel[e.courseId].clear();
        delete PnUI.tree[e.courseId];
        refresh().then(() => { if (here()) window.tabPoliNetwork(course(e.courseId), $('#tab')); });
    }
};
window.PnUI = PnUI;
