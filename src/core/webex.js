'use strict';
// WebEx recordings (politecnicomilano.webex.com)
const { sleep } = require('./browser');

const SITE = 'https://politecnicomilano.webex.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

function extractRecordingId(url) {
    try {
        const u = new URL(url);
        for (const part of u.pathname.split('/')) {
            if (/^[a-f0-9]{32}/i.test(part)) return part.slice(0, 32);
        }
    } catch (e) { }
    return null;
}

const isPlayback = u => /webex\.com\/(recordingservice|webappng\/sites\/[^/]+\/recording)/.test(u) && !!extractRecordingId(u);

/** RCID / ldr.php / lsr.php links → playback URL (needs the browser for redirects + SSO). */
async function resolveToPlayback(session, url) {
    if (extractRecordingId(url) && isPlayback(url)) return url;
    await session.start();
    const page = await session.browser.newPage();
    try {
        return await session.goto(url, u => isPlayback(u), { page, timeout: 45000 });
    } finally {
        await page.close().catch(() => { });
    }
}

/**
 * Ask WebEx for stream info. Uses the browser's WebEx cookies; if they are missing/expired,
 * opens the playback page in the browser so SSO can (re)authenticate, then retries.
 */
let authLock = null; // one WebEx SSO at a time; parallel downloads wait for it and reuse the ticket

async function authenticate(session, playbackUrl) {
    if (authLock) return authLock;
    authLock = (async () => {
        const page = await session.browser.newPage();
        try {
            await session.goto(playbackUrl, async (u) => {
                if (!isPlayback(u)) return false;
                const c = await session.cookieHeaderFor(SITE + '/');
                return /(^|; )ticket=/.test(c);
            }, { page, timeout: 60000 });
            await sleep(1000);
            await session.saveCookies();
        } finally { await page.close().catch(() => { }); }
    })();
    try { await authLock; } finally { authLock = null; }
}

async function getStreamInfo(session, playbackUrl, { password = '' } = {}) {
    const id = extractRecordingId(playbackUrl);
    if (!id) throw new Error('ID registrazione WebEx non trovato in ' + playbackUrl);
    const api = `${SITE}/webappng/api/v1/recordings/${id}/stream?siteurl=politecnicomilano`;

    for (let attempt = 0; attempt < 2; attempt++) {
        const cookie = await session.cookieHeaderFor(SITE + '/');
        const r = await fetch(api, { headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json, text/plain, */*', accessPwd: password } });
        const text = await r.text();
        let obj = null;
        try { obj = JSON.parse(text); } catch (e) { }
        if (obj && (obj.fallbackPlaySrc || obj.downloadRecordingInfo || obj.mp4StreamOption)) return { id, ...obj };
        if (obj && obj.code === 53005) { const e = new Error('Registrazione protetta da password'); e.code = 'PASSWORD'; e.recordName = obj.recordName; throw e; }
        if (obj && obj.code === 54001) throw new Error('Registrazione WebEx non esistente o rimossa');
        if (attempt === 0) {
            // authenticate WebEx via SSO by opening the recording page in the browser
            await authenticate(session, playbackUrl);
            continue;
        }
        throw new Error(`Risposta WebEx inattesa (HTTP ${r.status}): ${text.slice(0, 200)}`);
    }
}

/** Candidate download URLs, fastest first. */
function downloadCandidates(info) {
    const out = [];
    if (info.fallbackPlaySrc) out.push(info.fallbackPlaySrc);
    const di = info.downloadRecordingInfo && info.downloadRecordingInfo.downloadInfo;
    if (di && di.mp4URL) out.push(di.mp4URL);
    if (di && di.hlsURL) out.push(di.hlsURL);
    if (info.mp4StreamOption && info.mp4StreamOption.recordingDir) {
        const o = info.mp4StreamOption;
        out.push(`https://nfg1vss.webex.com/apis/download.do?recordingDir=${o.recordingDir}&timestamp=${o.timestamp}&token=${o.token}&fileName=${encodeURIComponent((info.recordName || 'recording') + '.mp4')}`);
    }
    return [...new Set(out)];
}

module.exports = { SITE, UA, extractRecordingId, isPlayback, resolveToPlayback, getStreamInfo, downloadCandidates };
