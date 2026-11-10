// Uploading the student's own notes (PDF, photos of handwritten notes, slides, documents…) to a course,
// linked to a lesson; badges for every kind of note; drag & drop anywhere it makes sense; file viewer.
// Uses globals from app.js / views.js: $, $$, esc, icon, api, guard, toast, modal, go, S, course, cname, Notes, flush.

// kind "file" + type → badge
const FILE_TYPES = {
    pdf: ['PDF', '#e5484d'], image: ['IMG', '#30a46c'], doc: ['DOC', '#3e63dd'], slides: ['PPT', '#f76b15'], sheet: ['XLS', '#2b9a66'],
    text: ['TXT', '#8b8d98'], code: ['</>', '#6e56cf'], handwritten: ['✍', '#d6409f'], archive: ['ZIP', '#8b8d98'], audio: ['♪', '#0090ff'], video: ['▶', '#0090ff'], other: ['FILE', '#8b8d98'],
};
const NOTE_SHORT = { markdown: 'MD', latex: 'TeX', typst: 'Typ' };
const FILE_TYPE_LABEL = { pdf: 'PDF', image: 'Immagine', doc: 'Documento', slides: 'Presentazione', sheet: 'Foglio di calcolo', text: 'Testo', code: 'Codice', handwritten: 'Appunti a mano', archive: 'Archivio', audio: 'Audio', video: 'Video', other: 'File' };
function fileTypeOf(name) {
    const e = String(name).split('.').pop().toLowerCase();
    if (e === 'pdf') return 'pdf';
    if (/^(png|jpe?g|gif|webp|heic|heif|svg|bmp|tiff?)$/.test(e)) return 'image';
    if (/^(docx?|odt|rtf|pages)$/.test(e)) return 'doc';
    if (/^(pptx?|odp|key)$/.test(e)) return 'slides';
    if (/^(xlsx?|ods|numbers|csv)$/.test(e)) return 'sheet';
    if (/^(txt|text|rst|org)$/.test(e)) return 'text';
    if (/^(md|tex|typ)$/.test(e)) return 'note';
    if (/^(ipynb|py|m|c|cpp|h|java|js|ts|rs|r|jl|sql|json|xml|html|css)$/.test(e)) return 'code';
    if (/^(goodnotes|note|notability|xopp|one)$/.test(e)) return 'handwritten';
    if (/^(zip|rar|7z|tar|gz)$/.test(e)) return 'archive';
    if (/^(mp3|m4a|wav|aac|ogg|flac)$/.test(e)) return 'audio';
    if (/^(mp4|mov|mkv|webm|avi)$/.test(e)) return 'video';
    return 'other';
}
/** Badge for an entry of notes:list / notes:forLesson */
function noteBadge(f) {
    if (f.kind !== 'file') return `<span class="badge-k ${f.kind}">${NOTE_SHORT[f.kind] || 'MD'}</span>`;
    const [t, c] = FILE_TYPES[f.type] || FILE_TYPES.other;
    return `<span class="badge-k file" style="--fc:${c}" title="${esc(FILE_TYPE_LABEL[f.type] || 'File')}">${t}</span>`;
}
/** Name shown for a note: without the extension of editable notes; uploaded files keep theirs (small) */
function noteName(f) {
    const file = typeof f === 'string' ? f : f.file;
    if (typeof f === 'object' && f.kind === 'file') { const i = file.lastIndexOf('.'); return i > 0 ? esc(file.slice(0, i)) + `<span class="n-ext">${esc(file.slice(i))}</span>` : esc(file); }
    return esc(file.replace(/\.(md|tex|typ)$/, ''));
}
const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';

const Upload = (() => {
    const lessonsOf = c => (c ? c.recordings.filter(r => typeof isFollowed !== 'function' || isFollowed(c, r)) : []).slice().sort((a, b) => (b.isoDate || '').localeCompare(a.isoDate || ''));
    const lessonLabelOf = r => `${r.isoDate ? new Date(r.isoDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' · ' : ''}${r.displayTitle || r.file}`;

    /** files: [{path, name, size}] — from the picker or a drop */
    function fromFileList(list) {
        return [...list].map(f => ({ path: api.filePath(f), name: f.name, size: f.size })).filter(f => f.path);
    }

    /**
     * The upload sheet. ctx: { courseId (null = Generale), key (lesson, optional), files (optional) }.
     * Resolves with the uploaded files (relative paths) or null.
     */
    function open(ctx = {}) {
        return new Promise(resolve => {
            let files = [...(ctx.files || [])];
            let scope = ctx.courseId !== undefined ? ctx.courseId : (route.courseId || null);
            const m = modal(`<div class="up-sheet">
                <div class="fs-hero"><span class="ob-ic" style="background:linear-gradient(135deg,#ffb224,#f76b15)">${icon('download')}</span><div><h2>Carica i tuoi appunti</h2><p class="muted">PDF, foto degli appunti a mano, slide annotate, documenti… Compaiono tra gli appunti del corso e nella lezione che scegli.</p></div></div>
                <div class="up-drop" id="up-drop" tabindex="0"><div class="up-ico">${icon('download')}</div><b>Trascina qui i file</b><span class="muted">oppure <a id="up-pick">sceglili dal computer</a></span></div>
                <div class="gcard up-list hidden" id="up-list"></div>
                <div class="gcard">
                    ${field('Corso', '', `<select id="up-scope"><option value="">Generale (nessun corso)</option>${S.courses.map(c => `<option value="${c.id}" ${scope === c.id ? 'selected' : ''}>${esc(cname(c))}</option>`).join('')}</select>`)}
                    <div id="up-lesson-row"></div>
                </div>
                <div class="foot"><span class="faint" id="up-hint"></span><span class="grow"></span><button class="ghost" id="up-x">Annulla</button><button class="primary" id="up-go" disabled>Carica</button></div></div>`, { wide: false });
            const el = m.el;
            const drawLessons = () => {
                const c = scope && course(scope);
                const ls = lessonsOf(c);
                $('#up-lesson-row', el).innerHTML = c ? field('Lezione', 'Gli appunti compaiono anche nella pagina della lezione. Puoi collegarli ad altre lezioni dopo.', `<select id="up-lesson"><option value="">Nessuna lezione in particolare</option>${ls.map(r => `<option value="${esc(r.key)}" ${ctx.key === r.key ? 'selected' : ''}>${esc(lessonLabelOf(r))}</option>`).join('')}</select>`) : '';
            };
            const draw = () => {
                const list = $('#up-list', el);
                list.classList.toggle('hidden', !files.length);
                list.innerHTML = files.map((f, i) => {
                    const t = fileTypeOf(f.name);
                    const badge = t === 'note' ? noteBadge({ kind: { md: 'markdown', tex: 'latex', typ: 'typst' }[f.name.split('.').pop().toLowerCase()] }) : noteBadge({ kind: 'file', type: t });
                    const st = f.state === 'done' ? `<span class="pill ok">${icon('check')} caricato</span>` : f.state === 'busy' ? '<span class="spin"></span>' : f.state === 'err' ? `<span class="pill err" title="${esc(f.error)}">errore</span>` : `<button class="icon ghost small" data-rm="${i}" title="Togli" aria-label="Togli">✕</button>`;
                    return `<div class="field up-file"><label>${badge}<span class="up-n" title="${esc(f.path)}">${esc(f.name)}</span></label><div class="ctl"><span class="faint">${f.size != null ? fmtSize(f.size) : ''}</span>${st}</div></div>`;
                }).join('');
                $$('[data-rm]', list).forEach(b => b.onclick = () => { files.splice(+b.dataset.rm, 1); draw(); });
                const n = files.filter(f => f.state !== 'done').length;
                $('#up-go', el).disabled = !n;
                $('#up-go', el).textContent = n ? `Carica ${n} file` : 'Carica';
                $('#up-hint', el).textContent = files.length ? `${files.length} file · ${fmtSize(files.reduce((a, f) => a + (f.size || 0), 0))}` : '';
            };
            const add = list => { for (const f of list) if (f.path && !files.some(x => x.path === f.path)) files.push(f); draw(); };
            const pick = () => guard(async () => { const ps = await api.pickFiles(); add(ps.map(p => ({ path: p, name: p.split(/[\\/]/).pop(), size: null }))); });
            $('#up-pick', el).onclick = pick;
            const drop = $('#up-drop', el);
            drop.onclick = e => { if (!e.target.closest('a')) pick(); };
            drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
            zone(drop, list => add(list));
            $('#up-scope', el).onchange = e => { scope = e.target.value || null; ctx.key = null; drawLessons(); };
            drawLessons(); draw();
            $('#up-x', el).onclick = () => { m.close(); resolve(null); };
            $('#up-go', el).onclick = () => guard(async () => {
                const key = ($('#up-lesson', el) || {}).value || '';
                const links = scope && key ? [{ c: scope, k: key }] : [];
                $('#up-go', el).disabled = true; $('#up-x', el).disabled = true;
                const out = [];
                for (const f of files.filter(f => f.state !== 'done')) {
                    f.state = 'busy'; draw();
                    try {
                        const r = await api.notes.import(scope, [f.path], links);
                        if (r.errors && r.errors.length) { f.state = 'err'; f.error = r.errors[0].error; } else { f.state = 'done'; out.push(...r.files); }
                    } catch (e) { f.state = 'err'; f.error = e.message; }
                    draw();
                }
                $('#up-x', el).disabled = false;
                if (!out.length) return;
                const c = scope && course(scope);
                toast(`${out.length} ${out.length === 1 ? 'file caricato' : 'file caricati'} negli appunti${c ? ' di ' + cname(c) : ''}`);
                if (window.Notes && Notes.reload) Notes.reload().catch(() => { });
                window.dispatchEvent(new CustomEvent('notes-uploaded', { detail: { scope, key, files: out } }));
                if (files.every(f => f.state === 'done')) { setTimeout(() => m.close(), 450); resolve(out); }
            });
            if (!files.length) setTimeout(() => drop.focus(), 50);
        });
    }

    /** Make `el` accept dropped files: onFiles(list of {path,name,size}). */
    function zone(el, onFiles) {
        let depth = 0;
        const has = e => [...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files');
        el.addEventListener('dragenter', e => { if (!has(e)) return; e.preventDefault(); depth++; el.classList.add('drop-on'); });
        el.addEventListener('dragover', e => { if (!has(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
        el.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; el.classList.remove('drop-on'); } });
        el.addEventListener('drop', e => {
            if (!has(e)) return;
            e.preventDefault(); e.stopPropagation(); depth = 0; el.classList.remove('drop-on');
            const list = fromFileList(e.dataTransfer.files);
            if (list.length) onFiles(list); else toast('Non riesco a leggere questi file: usa «sceglili dal computer»');
        });
    }
    return { open, zone, fromFileList };
})();
window.Upload = Upload;

// a file dropped where nothing handles it must not replace the app with the file
document.addEventListener('dragover', e => { if ([...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => {
    if (![...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault();
    // anywhere else in a course or a lesson: same as the upload button
    if (['course', 'recording', 'notes'].includes(route.name)) {
        const files = Upload.fromFileList(e.dataTransfer.files);
        if (files.length) Upload.open({ courseId: route.name === 'notes' ? (Notes.scope || null) : route.courseId, key: route.name === 'recording' ? route.key : undefined, files });
    }
});

/** Viewer for uploaded files in the Appunti page (PDF and images inline, the rest with the default app). */
async function openFileNote(file, scope, meta) {
    if (window.flushNote) await flushNote();
    if (Notes.editor) { Notes.editor.destroy(); Notes.editor = null; }
    Notes.scope = scope; Notes.file = file; Notes.kind = 'file';
    Notes.dir = await api.notes.dir(scope);
    $$('.n-file').forEach(x => x.classList.toggle('on', x.dataset.f === file && x.closest('.n-group').dataset.s === String(scope || '')));
    const all = meta ? null : await api.notes.list(scope);
    const f = meta || (all || []).find(x => x.file === file) || { file, kind: 'file', type: fileTypeOf(file) };
    const abs = Notes.dir + '/' + file, url = 'file://' + encodeURI(abs).replace(/#/g, '%23').replace(/\?/g, '%3F');
    const scopeName = scope && course(scope) ? cname(course(scope)) : 'Generale';
    const name = file.split('/').pop(), dot = name.lastIndexOf('.');
    const m = $('#n-main');
    m.innerHTML = `<header class="ed-head">
            <button class="ghost icon ed-files" id="ed-files" title="Mostra/nascondi elenco appunti (⌘⇧E)">☰</button>
            <div class="ed-titlebox"><input class="ed-title" id="ed-title" value="${esc(dot > 0 ? name.slice(0, dot) : name)}" spellcheck="false">
                <div class="ed-meta">${noteBadge(f)}<span>${esc(FILE_TYPE_LABEL[f.type] || 'File')}${f.size ? ' · ' + fmtSize(f.size) : ''}</span><span>${esc(scopeName)}</span><span class="ed-links" id="ed-links"></span></div></div>
            <div class="ed-actions">
                <button class="primary" id="fv-open">${icon('external')} Apri</button>
                <button id="fv-reveal">Mostra nella cartella</button>
                <button class="ghost icon" id="ed-more" title="Altro">⋯</button>
            </div>
        </header>
        <div class="fv-body" id="fv-body"></div>`;
    const body = $('#fv-body', m);
    if (f.type === 'pdf') body.innerHTML = `<iframe src="${url}#toolbar=1&view=FitH" class="pdf-frame"></iframe>`;
    else if (f.type === 'image' && !/\.(heic|heif|tiff?)$/i.test(file)) body.innerHTML = `<div class="fv-img"><img src="${url}" alt=""></div>`;
    else if (f.type === 'text' || f.type === 'code') {
        const t = await api.notes.read(scope, file).catch(() => null);
        body.innerHTML = t != null ? `<pre class="fv-text">${esc(t.slice(0, 400000))}</pre>` : '';
    }
    if (!body.innerHTML) body.innerHTML = `<div class="empty-state fv-empty">${noteBadge(f).replace('badge-k', 'badge-k big')}<h2>${esc(name)}</h2><p class="muted">Questo tipo di file si apre con la sua app.</p><button class="primary" id="fv-open2">${icon('external')} Apri con l'app predefinita</button></div>`;
    const openIt = () => api.openPath(abs);
    $('#fv-open', m).onclick = openIt; if ($('#fv-open2', m)) $('#fv-open2', m).onclick = openIt;
    $('#fv-reveal', m).onclick = () => api.reveal(abs);
    $('#ed-files', m).onclick = () => Notes.toggleFiles && Notes.toggleFiles();
    const title = $('#ed-title', m);
    const rename = () => guard(async () => {
        const v = title.value.trim(); if (!v || v === (dot > 0 ? name.slice(0, dot) : name)) return;
        const nf = await api.notes.rename(scope, file, v);
        await Notes.reload(); openFileNote(nf, scope);
    });
    title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } if (e.key === 'Escape') { title.value = dot > 0 ? name.slice(0, dot) : name; title.blur(); } };
    title.onchange = rename;
    $('#ed-more', m).onclick = e => showMenu(e.clientX, e.clientY, [
        ['Apri con l\'app predefinita', openIt],
        ['Mostra nella cartella', () => api.reveal(abs)],
        '-',
        ['🗑 Sposta nel cestino', () => guard(async () => { if (!confirm('Spostare il file nel cestino degli appunti (.cestino nella cartella)?')) return; await api.notes.remove(scope, file); Notes.file = null; await Notes.reload(); $('#n-main').innerHTML = '<div class="empty-state">File spostato nel cestino</div>'; })],
    ]);
    if (typeof drawNoteLinks === 'function') drawNoteLinks(scope, file);
}
window.openFileNote = openFileNote;
