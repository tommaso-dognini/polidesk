'use strict';
// Course material (slides, PDFs, folders…) from WeBeep, organized by course section.
//
// <course>/materiale/<NN - Section name>/<file>
// <course>/materiale/LINK.md      external links (Drive, GitHub, …) that can't be downloaded directly
const fs = require('fs');
const path = require('path');
const { WEBEEP } = require('./webeep');
const { httpDownload } = require('./downloader');
const lib = require('./library');

const DOC_EXT = /\.(pdf|pptx?|docx?|xlsx?|odp|odt|ods|zip|rar|7z|tar|gz|ipynb|py|m|r|c|cpp|h|java|js|ts|txt|md|csv|json|png|jpe?g|gif|svg|mp3|wav|tex|bib)(\?|$)/i;

/** Inventory of downloadable material, grouped by section. Runs fetch() inside the logged-in page. */
async function inventory(session, courseId) {
    await require('./webeep').ensureLoggedIn(session); // page must be on webeep.polimi.it for same-origin fetch()
    return session.page.evaluate(async ({ courseId, WEBEEP }) => {
        const get = async u => {
            const r = await fetch(u, { credentials: 'include' });
            return { url: r.url, doc: new DOMParser().parseFromString(await r.text(), 'text/html') };
        };
        const clean = s => (s || '').replace(/\s+/g, ' ').trim();
        const textOf = el => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('.accesshide, .sr-only, .visually-hidden').forEach(x => x.remove()); return clean(c.textContent); };
        const sectionTitle = (sec, doc) => {
            const t = textOf(sec.querySelector && sec.querySelector('h3.sectionname, .sectionname, .section-title'));
            if (t) return t;
            const m = (doc.title || '').match(/Sezione:\s*(.+?)\s*\|/) || (doc.title || '').match(/Section:\s*(.+?)\s*\|/);
            return m ? clean(m[1]) : '';
        };
        const main = await get(`${WEBEEP}/course/view.php?id=${courseId}`);
        const sectionUrls = [...new Set([...main.doc.querySelectorAll('a[href*="/course/section.php?id="]')].map(a => a.href.replace(/#.*/, '')))];
        const pages = [main, ...(await Promise.all(sectionUrls.map(get)))];

        const items = new Map(); // cmid/url -> item
        let secIndex = 0;
        for (const p of pages) {
            // a page can contain several sections (course page) or just one (section.php)
            const secEls = p.doc.querySelectorAll('li.section, .course-section, [data-for="section"]');
            const groups = secEls.length ? [...secEls] : [p.doc];
            for (const sec of groups) {
                const numAttr = sec.getAttribute && sec.getAttribute('data-number');
                const num = numAttr != null ? Number(numAttr) : secIndex++;
                const section = sectionTitle(sec, p.doc) || (num === 0 ? 'Generale' : `Sezione ${num}`);
                for (const act of sec.querySelectorAll('li.activity, [data-for="cmitem"]')) {
                    const a = act.querySelector('a[href*="/mod/"]');
                    const name = textOf(act.querySelector('.instancename') || act.querySelector('.activityname') || a).replace(/\s+(File|Cartella|Folder|URL|Pagina|Page)$/, '');
                    if (a) {
                        const m = a.href.match(/\/mod\/(resource|folder|url|page)\/view\.php\?id=(\d+)/);
                        if (m && !items.has('cm' + m[2])) items.set('cm' + m[2], { kind: m[1], cmid: m[2], name, section, num, href: a.href });
                    }
                    // files linked inline in labels / descriptions
                    for (const l of act.querySelectorAll('a[href*="pluginfile.php"]')) {
                        if (!items.has(l.href)) items.set(l.href, { kind: 'file', url: l.href, name: clean(l.textContent), section, num });
                    }
                }
            }
        }

        // expand folders, resolve urls/resources
        const out = [];
        const external = [];
        await Promise.all([...items.values()].map(async it => {
            try {
                if (it.kind === 'folder') {
                    const { doc } = await get(`${WEBEEP}/mod/folder/view.php?id=${it.cmid}`);
                    for (const l of doc.querySelectorAll('a[href*="pluginfile.php"][href*="mod_folder/content"]')) {
                        // keep the folder's sub-directory structure (…/content/<rev>/<sub/dirs>/<file>)
                        const after = decodeURIComponent(new URL(l.href).pathname.split('/mod_folder/content/')[1] || '');
                        const rel = after.split('/').slice(1).join('/');
                        out.push({ url: l.href.replace(/\?forcedownload=1$/, ''), section: it.section, num: it.num, folder: it.name, rel: rel || clean(l.textContent) });
                    }
                } else if (it.kind === 'resource') {
                    out.push({ url: `${WEBEEP}/mod/resource/view.php?id=${it.cmid}&redirect=1`, section: it.section, num: it.num, name: it.name, resolve: true });
                } else if (it.kind === 'file') {
                    out.push({ url: it.url, section: it.section, num: it.num, name: it.name });
                } else if (it.kind === 'url') {
                    const { doc } = await get(`${WEBEEP}/mod/url/view.php?id=${it.cmid}&forceview=1`);
                    const l = doc.querySelector('.urlworkaround a, #region-main a[href^="http"]:not([href*="webeep.polimi.it"])');
                    if (l) external.push({ url: l.href, name: it.name, section: it.section });
                } else if (it.kind === 'page') {
                    const { doc } = await get(it.href);
                    for (const l of doc.querySelectorAll('#region-main a[href*="pluginfile.php"]')) out.push({ url: l.href, section: it.section, num: it.num, name: clean(l.textContent) });
                }
            } catch (e) { }
        }));
        return { files: out, external };
    }, { courseId, WEBEEP });
}

function sectionDir(f) {
    const n = String(f.num ?? 0).padStart(2, '0');
    return lib.sanitize(`${n} - ${f.section}`, 80);
}

/**
 * Download course material incrementally.
 * Files already present with the same size are skipped; the manifest remembers url → path.
 */
async function syncMaterials(session, course, manifest, { log = () => { }, shouldStop = () => false, onProgress = () => { } } = {}) {
    const root = path.join(course.dir, 'materiale');
    fs.mkdirSync(root, { recursive: true });
    log('📎 Cerco il materiale del corso...');
    const inv = await inventory(session, manifest.course.id);
    manifest.materials = manifest.materials || {};
    const cookie = await session.cookieHeaderFor(WEBEEP + '/');
    let downloaded = 0, skipped = 0, failed = 0;
    log(`  • ${inv.files.length} file, ${inv.external.length} link esterni`);

    for (const f of inv.files) {
        if (shouldStop()) break;
        const known = manifest.materials[f.url];
        try {
            // resolve real file name (resources redirect to pluginfile)
            let url = f.url, size = null, name = null;
            const head = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { Cookie: cookie } });
            if (head.ok) {
                url = head.url;
                size = Number(head.headers.get('content-length')) || null;
                const cd = head.headers.get('content-disposition') || '';
                const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
                name = m ? decodeURIComponent(m[1] || m[2]) : decodeURIComponent(path.basename(new URL(url).pathname));
                if (/text\/html/.test(head.headers.get('content-type') || '') && !/\.html?$/i.test(name)) throw new Error('non è un file scaricabile');
            } else if (known) { skipped++; continue; } else throw new Error('HTTP ' + head.status);

            const rel = known && known.path ? known.path : path.join(sectionDir(f), f.folder ? lib.sanitize(f.folder, 80) : '', ...(f.rel ? f.rel.split('/').map(p => lib.sanitize(p, 120)) : [lib.sanitize(name, 150)]));
            const dest = path.join(root, rel);
            if (fs.existsSync(dest) && (!size || fs.statSync(dest).size === size)) { skipped++; manifest.materials[f.url] = { path: rel, size }; continue; }
            await httpDownload(url, dest, { headers: { Cookie: cookie }, connections: 1 });
            manifest.materials[f.url] = { path: rel, size, downloadedAt: new Date().toISOString() };
            downloaded++;
            onProgress({ file: rel });
            log(`  ✓ ${rel}`);
        } catch (e) {
            failed++;
            log(`  ✗ ${f.name || f.rel || f.url}: ${e.message}`);
        }
    }

    // external links → LINK.md
    if (inv.external.length) {
        let md = `# Link esterni\n\nRisorse del corso fuori da WeBeep (non scaricate automaticamente).\n\n`;
        let last = '';
        for (const e of inv.external) {
            if (e.section !== last) { md += `\n## ${e.section}\n\n`; last = e.section; }
            md += `- [${e.name}](${e.url})\n`;
        }
        fs.writeFileSync(path.join(root, 'LINK.md'), md);
    }
    log(`📎 Materiale: ${downloaded} nuovi, ${skipped} già presenti, ${failed} errori`);
    return { downloaded, skipped, failed, external: inv.external.length };
}

module.exports = { inventory, syncMaterials, DOC_EXT };
