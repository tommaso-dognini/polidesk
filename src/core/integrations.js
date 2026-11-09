'use strict';
// Note-app integrations: Notion (official API), Apple Notes (AppleScript, macOS),
// Goodnotes/Notability (PDF hand-off), Obsidian (obsidian:// URI when the file is in a vault).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// ───────── Notion ─────────
const NOTION = 'https://api.notion.com/v1';
const pageIdFrom = s => { const m = String(s || '').replace(/-/g, '').match(/([0-9a-f]{32})(?:\?|$|#)/i) || String(s || '').replace(/-/g, '').match(/([0-9a-f]{32})/i); return m ? m[1] : null; };

async function notion(token, method, url, body) {
    const r = await fetch(NOTION + url, {
        method, body: body ? JSON.stringify(body) : undefined,
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Notion: ${j.message || r.status}${r.status === 404 ? ' — condividi la pagina con l\'integrazione (••• → Connessioni)' : ''}`);
    return j;
}

/** Inline markdown → Notion rich_text (bold, italic, code, links, $math$). */
function richText(s) {
    const out = [];
    const rx = /(\$[^$\n]+\$)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g;
    let last = 0, m;
    const push = (content, ann = {}, link) => {
        for (let i = 0; i < content.length; i += 1900) out.push({ type: 'text', text: { content: content.slice(i, i + 1900), link: link ? { url: link } : null }, annotations: ann });
    };
    while ((m = rx.exec(s))) {
        if (m.index > last) push(s.slice(last, m.index));
        const t = m[0];
        if (m[1]) out.push({ type: 'equation', equation: { expression: t.slice(1, -1) } });
        else if (m[2]) push(t.slice(2, -2), { bold: true });
        else if (m[3]) push(t.slice(1, -1), { italic: true });
        else if (m[4]) push(t.slice(1, -1), { code: true });
        else { const l = t.match(/\[([^\]]+)\]\(([^)]+)\)/); push(l[1], {}, /^https?:/.test(l[2]) ? l[2] : null); }
        last = m.index + t.length;
    }
    if (last < s.length) push(s.slice(last));
    return out.length ? out : [{ type: 'text', text: { content: '' } }];
}

/** Markdown → Notion blocks (headings, lists, todos, quotes, code, $$equations$$, dividers, paragraphs). */
function mdToBlocks(md) {
    const lines = md.replace(/\r/g, '').split('\n');
    const blocks = [];
    const b = (type, data) => blocks.push({ object: 'block', type, [type]: data });
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.trim()) continue;
        if (l.startsWith('```')) {
            const lang = l.slice(3).trim() || 'plain text'; const code = [];
            while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
            b('code', { language: /^(python|javascript|java|c|c\+\+|latex|bash|json|markdown|typescript|sql|r|matlab)$/i.test(lang) ? lang.toLowerCase() : 'plain text', rich_text: richText(code.join('\n')).map(r => ({ ...r, annotations: {} })) });
            continue;
        }
        if (l.trim().startsWith('$$')) {
            let expr = l.trim().slice(2);
            if (expr.endsWith('$$')) expr = expr.slice(0, -2);
            else { while (++i < lines.length && !lines[i].trim().endsWith('$$')) expr += '\n' + lines[i]; if (i < lines.length) expr += '\n' + lines[i].trim().slice(0, -2); }
            b('equation', { expression: expr.trim() });
            continue;
        }
        let m;
        if ((m = l.match(/^(#{1,3})\s+(.*)/))) b(`heading_${m[1].length}`, { rich_text: richText(m[2]) });
        else if ((m = l.match(/^#{4,6}\s+(.*)/))) b('heading_3', { rich_text: richText(m[1]) });
        else if ((m = l.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)/))) b('to_do', { checked: m[1] !== ' ', rich_text: richText(m[2]) });
        else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) b('bulleted_list_item', { rich_text: richText(m[1]) });
        else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) b('numbered_list_item', { rich_text: richText(m[1]) });
        else if ((m = l.match(/^>\s?(.*)/))) b('quote', { rich_text: richText(m[1]) });
        else if (/^(-{3,}|\*{3,})$/.test(l.trim())) b('divider', {});
        else {
            let para = l;
            while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\s*[-*•]\s|\s*\d+[.)]\s|>|```|\$\$)/.test(lines[i + 1])) para += ' ' + lines[++i].trim();
            b('paragraph', { rich_text: richText(para) });
        }
    }
    return blocks;
}

async function exportToNotion({ token, parent, title, markdown, kind }) {
    if (!token) throw new Error('Configura il token Notion in Impostazioni → Integrazioni');
    const pid = pageIdFrom(parent);
    if (!pid) throw new Error('Configura la pagina Notion di destinazione in Impostazioni → Integrazioni');
    const blocks = kind === 'markdown' ? mdToBlocks(markdown)
        : [{ object: 'block', type: 'callout', callout: { icon: { emoji: '📄' }, rich_text: richText(`Sorgente ${kind === 'latex' ? 'LaTeX' : 'Typst'} esportata da PoliRec`) } },
        ...chunks(markdown, 1900).map(c => ({ object: 'block', type: 'code', code: { language: kind === 'latex' ? 'latex' : 'plain text', rich_text: [{ type: 'text', text: { content: c } }] } }))];
    const page = await notion(token, 'POST', '/pages', {
        parent: { page_id: pid }, icon: { emoji: '📝' },
        properties: { title: { title: [{ type: 'text', text: { content: title.slice(0, 200) } }] } },
        children: blocks.slice(0, 100),
    });
    for (let i = 100; i < blocks.length; i += 100) await notion(token, 'PATCH', `/blocks/${page.id}/children`, { children: blocks.slice(i, i + 100) });
    return page.url;
}
const chunks = (s, n) => { const o = []; for (let i = 0; i < s.length; i += n) o.push(s.slice(i, i + n)); return o.length ? o : ['']; };

async function testNotion(token, parent) {
    const pid = pageIdFrom(parent);
    if (!pid) throw new Error('Link della pagina non valido');
    const p = await notion(token, 'GET', `/pages/${pid}`);
    const t = p.properties && Object.values(p.properties).find(x => x.type === 'title');
    return (t && t.title.map(x => x.plain_text).join('')) || 'pagina';
}

// ───────── Apple Notes (macOS) ─────────
function exportToAppleNotes(title, html) {
    if (process.platform !== 'darwin') return Promise.reject(new Error('Note di Apple è disponibile solo su macOS'));
    const f = path.join(os.tmpdir(), `polirec-note-${Date.now()}.html`);
    fs.writeFileSync(f, `<h1>${title.replace(/</g, '&lt;')}</h1>${html}`);
    const script = `set b to read POSIX file "${f}" as «class utf8»\ntell application "Notes"\n  activate\n  make new note with properties {body:b}\nend tell`;
    return new Promise((resolve, reject) => execFile('osascript', ['-e', script], (e, out, err) => { fs.unlink(f, () => { }); e ? reject(new Error(err || e.message)) : resolve(true); }));
}

// ───────── PDF hand-off (Goodnotes, Notability, Preview…) ─────────
const APPS = { goodnotes: ['Goodnotes', 'GoodNotes 5', 'GoodNotes'], notability: ['Notability'] };
function openPdfIn(app, pdf) {
    if (process.platform !== 'darwin') { require('electron').shell.openPath(pdf); return Promise.resolve('sistema'); }
    const names = APPS[app] || [app];
    return new Promise((resolve, reject) => {
        const tryN = i => {
            if (i >= names.length) return reject(new Error(`${names[0]} non è installato`));
            execFile('open', ['-a', names[i], pdf], e => e ? tryN(i + 1) : resolve(names[i]));
        };
        tryN(0);
    });
}
function installedApps() {
    if (process.platform !== 'darwin') return {};
    const has = n => ['/Applications', path.join(os.homedir(), 'Applications')].some(d => fs.existsSync(path.join(d, n + '.app')));
    return { goodnotes: APPS.goodnotes.some(has), notability: has('Notability'), obsidian: has('Obsidian'), notion: has('Notion'), notes: true };
}

// ───────── Obsidian ─────────
function obsidianVault(file) {
    let d = path.dirname(file);
    for (let i = 0; i < 12; i++) { if (fs.existsSync(path.join(d, '.obsidian'))) return d; const p = path.dirname(d); if (p === d) break; d = p; }
    return null;
}
function obsidianUrl(file) { return `obsidian://open?path=${encodeURIComponent(file)}`; }

module.exports = { mdToBlocks, exportToNotion, testNotion, exportToAppleNotes, openPdfIn, installedApps, obsidianVault, obsidianUrl, pageIdFrom };
