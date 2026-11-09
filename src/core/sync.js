'use strict';
// Orchestrates: course → sources → recordings → download. Emits events through `emit`.
const fs = require('fs');
const path = require('path');
const webeep = require('./webeep');
const recman = require('./recman');
const webex = require('./webex');
const dl = require('./downloader');
const lib = require('./library');

/**
 * @param {Session} session
 * @param {object} course  config entry: { input, dir, webeepId?, extraUrls?[] }
 * @param {object} opts    { parallel, dryRun, emit(evt), shouldStop() }
 */
async function syncCourse(session, course, opts = {}) {
    const emit = opts.emit || (() => { });
    const log = msg => emit({ type: 'log', course: course.id, msg });
    const shouldStop = opts.shouldStop || (() => false);
    const dirs = lib.courseDirs(course.dir);
    fs.mkdirSync(dirs.video, { recursive: true });
    const manifest = lib.loadManifest(course.dir);
    const save = () => { lib.saveManifest(course.dir, manifest); emit({ type: 'manifest', course: course.id }); };

    // 1. course
    log('🔎 Cerco il corso su WeBeep...');
    const wc = await webeep.resolveCourse(session, course.webeepId ? `webeep:${course.webeepId}` : course.input);
    manifest.course = { id: wc.id, fullname: wc.fullname, url: wc.url || `${webeep.WEBEEP}/course/view.php?id=${wc.id}` };
    course.webeepId = wc.id; course.name = course.name || wc.fullname;
    log(`  ✓ ${wc.fullname} (id ${wc.id})`);

    // 2. sources
    log('🔎 Cerco gli archivi delle registrazioni in tutte le sezioni...');
    let sources = await webeep.findRecordingSources(session, wc, log);
    for (const u of course.extraUrls || []) {
        const c = webeep.classify(u) || { type: 'unknown' };
        sources.push({ ...c, url: u, label: 'Aggiunto manualmente' });
    }
    manifest.sources = sources;
    for (const s of sources) log(`  • [${s.type}] ${s.label || ''} → ${s.url.slice(0, 110)}`);
    if (!sources.length) log('  ⚠ Nessuna sorgente trovata. Puoi aggiungere manualmente il link dell\'archivio nelle impostazioni del corso.');
    save();

    // 3. enumerate recordings
    const found = []; // { key, rec }
    for (const src of sources) {
        if (shouldStop()) break;
        try {
            if (src.type === 'recman') {
                log(`📚 Archivio: ${src.label || src.url}`);
                const recs = await recman.listRecordings(session, src.url, log);
                for (const r of recs) {
                    const key = r.transferId ? `recman-${r.transferId}` : `recman-${r.isoDate}-${lib.sanitize(r.topic, 40)}`;
                    found.push({ key, rec: { ...r, source: 'recman', sourceLabel: src.label, teacher: lib.teacherFrom(r.course) } });
                }
            } else if (src.type === 'webex') {
                const playback = await webex.resolveToPlayback(session, src.url);
                const info = await webex.getStreamInfo(session, playback).catch(e => ({ error: e.message }));
                const id = webex.extractRecordingId(playback);
                const created = info.createTime ? new Date(info.createTime) : null;
                found.push({
                    key: `webex-${id}`, rec: {
                        source: 'webex', sourceLabel: src.label, webexUrl: playback, topic: info.recordName || src.label,
                        isoDate: created ? new Date(created.getTime() - created.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : null,
                        duration: info.duration ? Math.round(info.duration / 60000) + ' min' : '',
                    }
                });
            } else if (src.type === 'direct') {
                found.push({ key: 'direct-' + Buffer.from(src.url).toString('base64url').slice(-24), rec: { source: 'direct', directUrl: src.url, topic: src.label || path.basename(new URL(src.url).pathname) } });
            } else if (src.type === 'youtube' && dl.which('yt-dlp')) {
                found.push({ key: 'yt-' + Buffer.from(src.url).toString('base64url').slice(-24), rec: { source: 'youtube', directUrl: src.url, topic: src.label } });
            } else {
                log(`  ⚠ Sorgente non supportata (${src.type}): ${src.url}`);
            }
        } catch (e) {
            log(`  ✗ Errore sulla sorgente ${src.label || src.url}: ${e.message}`);
        }
    }

    // merge into manifest
    for (const { key, rec } of found) {
        const prev = manifest.recordings[key] || {};
        manifest.recordings[key] = { ...prev, ...rec, key, webexUrl: prev.webexUrl || rec.webexUrl, status: prev.status || 'new' };
        manifest.recordings[key].file = lib.assignFilename(manifest, key, manifest.recordings[key]);
        // file deleted by the user → mark as to download again
        const fp = path.join(dirs.video, manifest.recordings[key].file);
        if (manifest.recordings[key].status === 'downloaded' && !fs.existsSync(fp)) manifest.recordings[key].status = 'new';
        if (manifest.recordings[key].status !== 'downloaded' && fs.existsSync(fp)) manifest.recordings[key].status = 'downloaded';
    }
    save();
    lib.writeIndex(course.dir, manifest);

    const todo = found.map(f => manifest.recordings[f.key]).filter(r => r.status !== 'downloaded' && !r.ignored);
    log(`📋 ${found.length} registrazioni trovate, ${todo.length} da scaricare`);
    emit({ type: 'summary', course: course.id, total: found.length, todo: todo.length });
    if (opts.dryRun || !todo.length) return { total: found.length, downloaded: 0, failed: 0 };

    // 4+5. resolve RecMan previews → WebEx (serialized: RecMan sessions are stateful) and download
    //      with a concurrency pool, so downloads start while other previews are still being resolved.
    let lock = Promise.resolve();
    const serial = fn => { const p = lock.then(fn, fn); lock = p.catch(() => { }); return p; };
    const resolveSource = async r => {
        if (r.source !== 'recman' || r.webexUrl || r.directUrl) return;
        const res = await serial(() => recman.resolvePreview(session, r.previewUrl));
        if (res.webexUrl) r.webexUrl = res.webexUrl;
        else if (res.mediaUrls.length) r.directUrl = res.mediaUrls[0];
        else throw new Error('Anteprima RecMan: link video non trovato (finale: ' + res.finalUrl + ')');
        save();
    };
    const queue = todo;
    let ok = 0, failed = 0;
    await dl.pool(queue, opts.parallel || 3, async (r) => {
        if (shouldStop()) return;
        const dest = path.join(dirs.video, r.file);
        const progress = p => emit({ type: 'progress', course: course.id, key: r.key, file: r.file, ...p });
        r.status = 'downloading'; r.error = undefined; save();
        try {
            await resolveSource(r);
            let candidates = [], headers = { 'User-Agent': webex.UA };
            if (r.webexUrl) {
                const info = await webex.getStreamInfo(session, r.webexUrl, { password: course.videoPassword || '' });
                candidates = webex.downloadCandidates(info);
                if (!r.durationSec && info.duration) r.durationSec = Math.round(info.duration / 1000);
            } else if (r.source === 'youtube') {
                await ytdlp(r.directUrl, dest, progress); candidates = null;
            } else if (r.directUrl) {
                candidates = [r.directUrl];
                headers.Cookie = await session.cookieHeaderFor(r.directUrl);
            }
            if (candidates) {
                if (!candidates.length) throw new Error('nessun URL di download nella risposta WebEx');
                let lastErr;
                for (const url of candidates) {
                    try {
                        log(`  ⬇ ${r.file}`);
                        await dl.download(url, dest, { headers, onProgress: progress, durationSec: r.durationSec });
                        lastErr = null; break;
                    } catch (e) { lastErr = e; log(`  ↻ tentativo fallito (${e.message.slice(0, 120)}), provo l'URL alternativo...`); }
                }
                if (lastErr) throw lastErr;
            }
            r.status = 'downloaded'; r.downloadedAt = new Date().toISOString();
            ok++;
            log(`  ✓ ${r.file}`);
            emit({ type: 'downloaded', course: course.id, key: r.key, path: dest });
        } catch (e) {
            r.status = 'error'; r.error = e.message; failed++;
            log(`  ✗ ${r.file}: ${e.message}`);
        }
        save();
    });
    lib.writeIndex(course.dir, manifest);
    log(`🏁 Completato: ${ok} scaricati, ${failed} errori`);
    return { total: found.length, downloaded: ok, failed };
}

function ytdlp(url, dest, onProgress) {
    const { spawn } = require('child_process');
    return new Promise((resolve, reject) => {
        const p = spawn(dl.which('yt-dlp'), ['-f', 'mp4/best', '--newline', '-o', dest, url]);
        p.stdout.on('data', d => { const m = d.toString().match(/([\d.]+)%/); if (m) onProgress({ percent: +m[1] }); });
        p.on('close', c => c === 0 ? resolve() : reject(new Error('yt-dlp exit ' + c)));
    });
}

module.exports = { syncCourse };
