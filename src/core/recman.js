'use strict';
// RecMan ("Archivio registrazioni") — onlineservices.polimi.it/recman_frontend
const { sleep } = require('./browser');

const isRecman = u => u.includes('onlineservices.polimi.it/recman_frontend');

function parseDate(s) {
    // "04/11/2026 16:30" -> Date
    const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
}

/** Open an archive (aunicalogin getservizio URL or a recman URL) and list all recordings. */
async function listRecordings(session, archiveUrl, log = () => { }) {
    await session.start();
    const page = session.page;
    // aunicalogin -> (SSO) -> recman_frontend
    await session.goto(archiveUrl, u => isRecman(u), { timeout: 60000 });
    await session.saveCookies();

    // archive title (course name shown above the table)
    // "Mostra tutti" (action=plen_0) removes pagination
    const showAll = await page.evaluate(() => [...document.links].map(a => a.href).find(h => h.includes('action=plen_0')));
    if (showAll) {
        await session.goto(showAll, u => isRecman(u));
        await sleep(500);
    }

    const result = await page.evaluate(() => {
        const norm = s => (s || '').replace(/\s+/g, ' ').trim();
        // Find the table whose header contains "Data Registrazione"/"Recording date"
        const tables = [...document.querySelectorAll('table')];
        let best = null;
        for (const t of tables) {
            const rows = [...t.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')];
            const headerIdx = rows.findIndex(r => /data registrazione|recording date|argomento|topic/i.test(r.innerText) && r.querySelectorAll('th,td').length >= 5);
            if (headerIdx === -1) continue;
            if (!best || rows.length > best.rows.length) best = { t, rows, headerIdx };
        }
        if (!best) return { error: 'tabella non trovata', title: document.title };
        const headers = [...best.rows[best.headerIdx].querySelectorAll('th,td')].map(c => norm(c.innerText).toLowerCase());
        const col = (...names) => headers.findIndex(h => names.some(n => h.includes(n)));
        const ix = {
            date: col('data registrazione', 'recording date', 'data'),
            course: col('corso', 'course'),
            type: col('forma didattica', 'teaching', 'tipo'),
            topic: col('argomento', 'topic', 'subject'),
            guests: col('ospiti', 'guests'),
            duration: col('durata', 'duration'),
            size: col('dimensione', 'size'),
        };
        const recs = [];
        for (const r of best.rows.slice(best.headerIdx + 1)) {
            const cells = [...r.querySelectorAll('td')];
            if (cells.length < 5) continue;
            const links = [...r.querySelectorAll('a')].map(a => a.href);
            const preview = links.find(h => /evn_preview_link|evn_play|preview|play/i.test(h)) || links[0];
            const get = i => (i >= 0 && cells[i]) ? norm(cells[i].innerText) : '';
            if (!get(ix.date)) continue;
            const tid = (preview || '').match(/transfer_id=(\d+)/);
            recs.push({
                transferId: tid ? tid[1] : null,
                previewUrl: preview || null,
                date: get(ix.date), course: get(ix.course), type: get(ix.type), topic: get(ix.topic),
                guests: get(ix.guests), duration: get(ix.duration), size: get(ix.size),
            });
        }
        return { recs, headers };
    });
    if (result.error) {
        await session.debugSnapshot(page, 'recman_table');
        throw new Error(`RecMan: ${result.error}`);
    }
    for (const r of result.recs) {
        const d = parseDate(r.date);
        r.isoDate = d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : null;
        r.recmanArchive = archiveUrl;
    }
    log(`  • RecMan: ${result.recs.length} registrazioni`);
    return result.recs;
}

/**
 * Follow a RecMan preview link in a separate tab and figure out where the video is.
 * Returns { webexUrl?, mediaUrls[], finalUrl }.
 */
async function resolvePreview(session, previewUrl, { timeout = 60000 } = {}) {
    const page = await session.browser.newPage();
    const media = [];
    const webex = [];
    const onReq = req => {
        const u = req.url();
        if (/\.(mp4|m3u8|m4s|mpd)(\?|$)/i.test(u) || /\/apis\/download\.do|fallbackPlaySrc|\/hls\//i.test(u)) media.push(u);
        if (/webex\.com\/(recordingservice|webappng\/sites\/[^/]+\/recording)/.test(u)) webex.push(u);
    };
    page.on('request', onReq);
    // preview may open a popup
    const popupUrls = [];
    const onTarget = t => { if (t.opener && t.type() === 'page') popupUrls.push(t); };
    session.browser.on('targetcreated', onTarget);
    try {
        const done = (u) => /webex\.com\/(recordingservice|webappng\/sites\/[^/]+\/recording)/.test(u) || media.length > 0 || webex.length > 0;
        await session.goto(previewUrl, done, { timeout, page }).catch(e => { if (!media.length && !webex.length) throw e; });
        await sleep(1500);
        let finalUrl = page.url();
        // inspect DOM for embedded players / links
        const dom = await page.evaluate(() => {
            const urls = [];
            document.querySelectorAll('video[src], source[src], iframe[src], a[href], embed[src]').forEach(e => urls.push(e.src || e.href));
            const m = document.documentElement.innerHTML.match(/https?:\/\/[^"'\s<>]*webex\.com\/(recordingservice|webappng)[^"'\s<>]*/g);
            return urls.concat(m || []);
        }).catch(() => []);
        for (const u of dom) {
            if (/webex\.com\/(recordingservice|webappng\/sites\/[^/]+\/recording)/.test(u)) webex.push(u.replace(/&amp;/g, '&'));
            else if (/\.(mp4|m3u8)(\?|$)/i.test(u)) media.push(u);
        }
        if (/webex\.com\/(recordingservice|webappng\/sites\/[^/]+\/recording)/.test(finalUrl)) webex.unshift(finalUrl);
        return { webexUrl: webex[0] || null, mediaUrls: [...new Set(media)], finalUrl };
    } finally {
        page.off('request', onReq);
        session.browser.off('targetcreated', onTarget);
        await page.close().catch(() => { });
    }
}

module.exports = { listRecordings, resolvePreview, parseDate };
