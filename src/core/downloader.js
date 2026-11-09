'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function which(bin) {
    const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
    try { return execFileSync('/usr/bin/which', [bin], { env: { ...process.env, PATH: [process.env.PATH, ...extra].join(':') } }).toString().trim() || null; }
    catch (e) {
        for (const d of extra) if (fs.existsSync(path.join(d, bin))) return path.join(d, bin);
        return null;
    }
}

function checkTools() {
    return { aria2c: which('aria2c'), ffmpeg: which('ffmpeg'), ffprobe: which('ffprobe') };
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
    const bin = which('ffmpeg');
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
    return aria2(url, dest, opts);
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

module.exports = { which, checkTools, download, aria2, ffmpegCopy, pool };
