'use strict';
// WeBeep (Moodle) helpers. All scraping is done with fetch() *inside* the logged-in page,
// which is much faster than navigating and keeps the user's session.
const WEBEEP = 'https://webeep.polimi.it';

// aunicalogin services that are NOT recording archives (e.g. 2292 = "Assistenza WeBeep")
const NON_RECORDING_SERVICES = new Set(['2292']);

async function ensureLoggedIn(session) {
    await session.start();
    await session.goto(`${WEBEEP}/my/courses.php`, async (u, page) =>
        u.startsWith(WEBEEP) && await page.evaluate(() =>
            !!(window.M && M.cfg && M.cfg.sesskey) && !document.body.classList.contains('notloggedin')));
    await session.saveCookies();
}

async function enrolledCourses(session) {
    await ensureLoggedIn(session);
    const res = await session.page.evaluate(async () => {
        const r = await fetch(M.cfg.wwwroot + '/lib/ajax/service.php?sesskey=' + M.cfg.sesskey, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ index: 0, methodname: 'core_course_get_enrolled_courses_by_timeline_classification', args: { offset: 0, limit: 0, classification: 'all', sort: 'fullname' } }])
        });
        return r.json();
    });
    if (!res[0] || res[0].error) throw new Error('Impossibile leggere i corsi WeBeep: ' + JSON.stringify(res[0] && res[0].exception));
    return res[0].data.courses.map(c => ({
        id: c.id, fullname: c.fullname, shortname: c.shortname, idnumber: c.idnumber,
        url: c.viewurl, image: c.courseimage, hidden: c.hidden,
    }));
}

function parseCourseInput(input) {
    input = String(input).trim();
    const w = input.match(/^webeep:(\d+)$/);
    if (w) return { id: w[1], raw: w[1] };
    try {
        const u = new URL(input);
        if (u.host.includes('webeep.polimi.it')) {
            const id = u.searchParams.get('id');
            if (u.pathname.includes('/course/view.php') && id) return { id: id.replace(/^0+/, ''), raw: id };
        }
        return { url: input };
    } catch (e) { }
    return { query: input };
}

/** Accepts a WeBeep URL, a course id, a PoliMi course code (e.g. 054307) or part of the name. */
async function resolveCourse(session, input) {
    const parsed = parseCourseInput(input);
    const courses = await enrolledCourses(session);
    const latestFirst = list => list.sort((a, b) => b.id - a.id);

    if (parsed.id) {
        const byId = courses.find(c => String(c.id) === parsed.id);
        if (byId) return byId;
        // Might be a valid course you are not enrolled in
        const title = await fetchTitle(session, `${WEBEEP}/course/view.php?id=${parsed.id}`);
        if (title && !/^errore|^error/i.test(title)) return { id: Number(parsed.id), fullname: title.replace(/^Corso:\s*|\s*\|\s*WeBeep$/g, ''), url: `${WEBEEP}/course/view.php?id=${parsed.id}` };
        // The "id" was probably a PoliMi course code (e.g. view.php?id=054307): fall through to search
        parsed.query = parsed.raw;
    }
    if (parsed.url) throw new Error('URL non riconosciuto: usa il link WeBeep del corso, il codice o il nome.');

    const q = parsed.query.toLowerCase();
    const exactId = courses.find(c => String(c.id) === q);
    if (exactId) return exactId;
    let matches = courses.filter(c => [c.fullname, c.shortname, c.idnumber].join(' ').toLowerCase().includes(q));
    if (matches.length === 0) {
        const words = q.split(/\s+/).filter(Boolean);
        matches = courses.filter(c => words.every(w => c.fullname.toLowerCase().includes(w)));
    }
    if (matches.length === 0) throw new Error(`Nessun corso WeBeep trovato per "${parsed.query}" tra i tuoi corsi.`);
    return latestFirst(matches)[0]; // most recent edition (e.g. [2026-27] over [2025-26])
}

async function fetchTitle(session, url) {
    return session.page.evaluate(async url => {
        const r = await fetch(url, { credentials: 'include' });
        const d = new DOMParser().parseFromString(await r.text(), 'text/html');
        return d.title;
    }, url);
}

/** Fetch several pages in-browser and return their links (scoped to main content when present). */
async function fetchLinks(session, urls) {
    return session.page.evaluate(async urls => {
        const out = {};
        await Promise.all(urls.map(async url => {
            try {
                const r = await fetch(url, { credentials: 'include' });
                const d = new DOMParser().parseFromString(await r.text(), 'text/html');
                const scope = d.querySelector('#region-main, #page-content, [role="main"]') || d;
                const base = new URL(r.url);
                const links = [...scope.querySelectorAll('a[href], iframe[src]')].map(a => {
                    const raw = a.getAttribute('href') || a.getAttribute('src');
                    let href; try { href = new URL(raw, base).href; } catch (e) { return null; }
                    // activity name is the cleanest label when present
                    const act = a.closest('li.activity, [data-for="cmitem"]');
                    const name = act && act.querySelector('.instancename, .activityname');
                    const label = (name ? name.textContent : (a.textContent || a.title || '')).replace(/\s+/g, ' ').trim().replace(/\s+(URL|File|Pagina|Page|Cartella|Folder)$/, '');
                    // onclick="window.open('...')" popups used by mod/url
                    const oc = a.getAttribute('onclick') || '';
                    const m = oc.match(/window\.open\('([^']+)'/);
                    return { href: m ? new URL(m[1], base).href : href, label };
                }).filter(Boolean);
                out[url] = { finalUrl: r.url, title: d.title, links };
            } catch (e) { out[url] = { error: String(e), links: [] }; }
        }));
        return out;
    }, urls);
}

function classify(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    const h = u.host, p = u.pathname;
    if (h === 'aunicalogin.polimi.it' && p.includes('getservizio')) {
        const sid = u.searchParams.get('id_servizio');
        if (NON_RECORDING_SERVICES.has(sid)) return null;
        // 2294 = RecMan "Archivio registrazioni"; unknown services are probed later
        return { type: 'recman', confidence: sid === '2294' || u.searchParams.has('c_classe_webeep') ? 'high' : 'low' };
    }
    if (h.includes('onlineservices.polimi.it') && p.includes('recman')) return { type: 'recman', confidence: 'high' };
    if (/\.webex\.com$/.test(h) && (/recordingservice|\/recording\/|playback|\/ldr\.php|\/lsr\.php/.test(p) || u.searchParams.has('RCID') || u.searchParams.has('rcid')))
        return { type: 'webex', confidence: 'high' };
    if (/youtube\.com|youtu\.be/.test(h) && !/channel|\/c\/|\/@/.test(p)) return { type: 'youtube', confidence: 'medium' };
    if (/web\.microsoftstream\.com|sharepoint\.com.*\.mp4|stream\.aspx/i.test(href)) return { type: 'msstream', confidence: 'medium' };
    if (/drive\.google\.com\/(file|drive\/folders)/.test(href)) return { type: 'gdrive', confidence: 'low' };
    if (/\.(mp4|m4v|mov|mkv|webm|m3u8)(\?|$)/i.test(p)) return { type: 'direct', confidence: 'high' };
    if (/panopto|kaltura|vimeo\.com/.test(h)) return { type: 'other-video', confidence: 'medium' };
    return null;
}

/**
 * Scan the whole course (main page, every section page, every URL/page activity) and
 * return all places where recordings may live.
 */
async function findRecordingSources(session, course, log = () => { }) {
    await ensureLoggedIn(session);
    const courseUrl = `${WEBEEP}/course/view.php?id=${course.id}`;
    const seenPages = new Set();
    const found = new Map(); // href -> source
    const add = (href, label, from) => {
        const c = classify(href);
        if (!c) return;
        const key = href.replace(/#.*$/, '');
        if (!found.has(key)) found.set(key, { ...c, url: key, label, from });
        else if (label && !found.get(key).label) found.get(key).label = label;
    };

    // 1. course page + 2. all section pages
    let pages = [courseUrl];
    const first = await fetchLinks(session, pages);
    seenPages.add(courseUrl);
    const sectionUrls = new Set();
    for (const l of first[courseUrl].links) {
        if (/\/course\/section\.php\?id=\d+/.test(l.href)) sectionUrls.add(l.href.replace(/#.*$/, ''));
        if (/\/course\/view\.php\?id=\d+&section=\d+/.test(l.href)) sectionUrls.add(l.href.replace(/#.*$/, ''));
    }
    log(`  • Pagina corso: ${first[courseUrl].links.length} link, ${sectionUrls.size} sezioni`);
    const sectionPages = sectionUrls.size ? await fetchLinks(session, [...sectionUrls]) : {};
    const all = { ...first, ...sectionPages };

    // collect activities to inspect
    const activities = new Map();
    for (const [pageUrl, d] of Object.entries(all)) {
        seenPages.add(pageUrl);
        for (const l of d.links) {
            add(l.href, l.label, pageUrl);
            const m = l.href.match(/\/mod\/(url|page|label|book|lti|resource)\/view\.php\?id=(\d+)/);
            if (m && !activities.has(m[2])) activities.set(m[2], { type: m[1], id: m[2], label: l.label, href: l.href.replace(/#.*$/, '') });
        }
    }

    // 3. open every url/page/book activity and look inside
    const toFetch = [...activities.values()].filter(a => ['url', 'page', 'book'].includes(a.type))
        .map(a => a.type === 'url' ? `${WEBEEP}/mod/url/view.php?id=${a.id}&forceview=1` : a.href);
    log(`  • Attività da ispezionare: ${toFetch.length}`);
    for (let i = 0; i < toFetch.length; i += 8) {
        const batch = await fetchLinks(session, toFetch.slice(i, i + 8));
        for (const [pageUrl, d] of Object.entries(batch)) {
            const actId = (pageUrl.match(/id=(\d+)/) || [])[1];
            const act = activities.get(actId);
            // an external redirect of the fetch itself (mod/url with automatic redirect)
            if (d.finalUrl && !d.finalUrl.startsWith(WEBEEP)) add(d.finalUrl, act && act.label, pageUrl);
            for (const l of d.links) {
                if (l.href.startsWith(WEBEEP) && !/pluginfile/.test(l.href)) continue;
                add(l.href, (act && act.label) || l.label, pageUrl);
            }
        }
    }
    return [...found.values()];
}

module.exports = { WEBEEP, ensureLoggedIn, enrolledCourses, resolveCourse, findRecordingSources, classify };
