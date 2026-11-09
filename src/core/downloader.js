'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_WIN = process.platform === 'win32';
const EXTRA_PATHS = IS_WIN ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', path.join(require('os').homedir(), '.local/bin')];
const cache = {};

/** Cross-platform `which` (also looks in Homebrew/~/.local dirs that GUI apps don't inherit). */
function which(bin) {
    if (bin in cache) return cache[bin];
    const exts = IS_WIN ? ['.exe', '.cmd', '.bat', ''] : [''];
    const dirs = [...(process.env.PATH || '').split(path.delimiter), ...EXTRA_PATHS].filter(Boolean);
    for (const d of dirs) for (const e of exts) {
        const p = path.join(d, bin + e);
        try { if (fs.statSync(p).isFile()) return (cache[bin] = p); } catch (err) { }
    }
    return (cache[bin] = null);
}

/** ffmpeg: system one, else the binary bundled with the app (ffmpeg-static). */
function ffmpegPath() {
    const sys = which('ffmpeg');
    if (sys) return sys;
    try {
        let p = require('ffmpeg-static');
        if (p && p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
        if (p && fs.existsSync(p)) return p;
    } catch (e) { }
    return null;
}

/** Environment for child processes (Whisper needs ffmpeg on PATH). */
function toolEnv() {
    const ff = ffmpegPath();
    const extra = [...EXTRA_PATHS];
    if (ff) extra.unshift(path.dirname(ff));
    return { ...process.env, PATH: [...extra, process.env.PATH].join(path.delimiter) };
}

function checkTools() {
    return { aria2c: which('aria2c'), ffmpeg: ffmpegPath() };
}

/**
 * Built-in HTTP downloader (no external tools): parallel byte ranges when the server supports them,
 * resumable single stream otherwise. Writes to <dest>.part and renames at the end.
 */
async function httpDownload(url, dest, { headers = {}, onProgress = () => { }, connections = 8 } = {}) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.part';
    const head = await fetch(url, { method: 'HEAD', headers, redirect: 'follow' }).catch(() => null);
    const total = head && head.ok ? Number(head.headers.get('content-length')) || 0 : 0;
    const ranges = head && head.ok && /bytes/i.test(head.headers.get('accept-ranges') || '') && total > 8 * 1024 * 1024;
    const finalUrl = head && head.ok ? head.url : url;
    let done = 0, last = 0, t0 = Date.now();
    const tick = n => {
        done += n;
        const now = Date.now();
        if (now - last > 500 && total) {
            last = now;
            const speed = done / Math.max(1, (now - t0) / 1000);
            onProgress({ percent: done / total * 100, speed: (speed / 1048576).toFixed(1) + 'MiB/s', eta: Math.round((total - done) / speed) + 's' });
        }
    };

    if (ranges && connections > 1) {
        const fd = fs.openSync(tmp, 'w');
        try {
            const chunk = Math.ceil(total / connections);
            await Promise.all(Array.from({ length: connections }, async (_, i) => {
                const start = i * chunk, end = Math.min(total, start + chunk) - 1;
                if (start > end) return;
                for (let attempt = 0; ; attempt++) {
                    try {
                        let pos = start;
                        const r = await fetch(finalUrl, { headers: { ...headers, Range: `bytes=${start}-${end}` } });
                        if (r.status !== 206) throw new Error('range non supportato (HTTP ' + r.status + ')');
                        for await (const buf of r.body) { fs.writeSync(fd, buf, 0, buf.length, pos); pos += buf.length; tick(buf.length); }
                        if (pos !== end + 1) throw new Error('chunk incompleto');
                        return;
                    } catch (e) { if (attempt >= 4) throw e; await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); }
                }
            }));
        } finally { fs.closeSync(fd); }
    } else {
        // single stream with resume
        let have = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
        const r = await fetch(finalUrl, { headers: have ? { ...headers, Range: `bytes=${have}-` } : headers });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        if (r.status !== 206) have = 0;
        done = have;
        const ws = fs.createWriteStream(tmp, { flags: have ? 'a' : 'w' });
        for await (const buf of r.body) { if (!ws.write(buf)) await new Promise(res => ws.once('drain', res)); tick(buf.length); }
        await new Promise((res, rej) => ws.end(err => err ? rej(err) : res()));
    }
    if (total && fs.statSync(tmp).size !== total) throw new Error(`file incompleto (${fs.statSync(tmp).size}/${total})`);
    fs.renameSync(tmp, dest);
    onProgress({ percent: 100, speed: '', eta: '' });
    return dest;
}

/** Download `url` to `dest` (final path). Writes to dest.part-ish via aria2 control file; atomic rename at the end. */
function aria2(url, dest, { headers = {}, onProgress = () => { }, connections = 16 } = {}) {
    const bin = which('aria2c');
    if (!bin) return Promise.reject(new Error('aria2c non trovato (brew install aria2)'));
    const dir = path.dirname(dest);
    const tmpName = path.basename(dest) + '.part';
    fs.mkdirSync(dir, { recursive: true });
    const args = [
        '-x', String(connections), '-s', String(connections), '-k', '1M', '-c',
        '--auto-file-renaming=false', '--allow-overwrite=true',
        '--max-tries=5', '--retry-wait=3', '--timeout=60',
        '--summary-interval=1', '--console-log-level=warn', '--download-result=hide',
        '-d', dir, '-o', tmpName,
    ];
    for (const [k, v] of Object.entries(headers)) if (v) args.push('--header', `${k}: ${v}`);
    args.push(url);
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let err = '';
        const parse = d => {
            const s = d.toString();
            // [#2089b0 120MiB/200MiB(60%) CN:16 DL:12MiB ETA:6s]
            const m = s.match(/\(([\d.]+)%\).*?DL:([\d.]+\w+)(?:.*?ETA:(\w+))?/);
            if (m) onProgress({ percent: parseFloat(m[1]), speed: m[2] + '/s', eta: m[3] || '' });
            if (/error|exception/i.test(s)) err += s;
        };
        p.stdout.on('data', parse);
        p.stderr.on('data', d => { err += d.toString(); });
        p.on('error', reject);
        p.on('close', code => {
            const tmp = path.join(dir, tmpName);
            if (code === 0 && fs.existsSync(tmp)) {
                fs.renameSync(tmp, dest);
                onProgress({ percent: 100, speed: '', eta: '' });
                resolve(dest);
            } else reject(new Error(`aria2c exit ${code}: ${err.slice(-400)}`));
        });
    });
}

/** HLS / generic stream → mp4 via ffmpeg (copy, no re-encode). */
function ffmpegCopy(url, dest, { headers = {}, onProgress = () => { }, durationSec = 0 } = {}) {
    const bin = ffmpegPath();
    if (!bin) return Promise.reject(new Error('ffmpeg non trovato'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.part.mp4';
    const hdr = Object.entries(headers).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}\r\n`).join('');
    const args = ['-y', '-loglevel', 'error', '-stats'];
    if (hdr) args.push('-headers', hdr);
    args.push('-i', url, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', tmp);
    return new Promise((resolve, reject) => {
        const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let err = '';
        p.stderr.on('data', d => {
            const s = d.toString(); err += s;
            const m = s.match(/time=(\d+):(\d+):([\d.]+)/);
            if (m && durationSec) onProgress({ percent: Math.min(99, ((+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])) / durationSec * 100), speed: '', eta: '' });
        });
        p.on('error', reject);
        p.on('close', code => {
            if (code === 0) { fs.renameSync(tmp, dest); resolve(dest); }
            else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`));
        });
    });
}

async function download(url, dest, opts = {}) {
    if (/\.m3u8(\?|$)/i.test(url)) return ffmpegCopy(url, dest, opts);
    if (which('aria2c') && !process.env.POLIREC_NO_ARIA2) return aria2(url, dest, opts);
    return httpDownload(url, dest, opts);
}

/** Run async tasks with a concurrency limit (a real pool, not fixed batches). */
async function pool(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (next < items.length) {
            const i = next++;
            try { results[i] = { ok: true, value: await worker(items[i], i) }; }
            catch (e) { results[i] = { ok: false, error: e }; }
        }
    });
    await Promise.all(runners);
    return results;
}

module.exports = { which, ffmpegPath, toolEnv, checkTools, download, httpDownload, aria2, ffmpegCopy, pool, IS_WIN };
