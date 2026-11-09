'use strict';
// Runs python/transcribe_cli.py (wrapper around the user's Whisper script). One job at a time:
// Whisper is CPU/GPU heavy, parallel runs only slow everything down.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// inside a packaged app the script lives in app.asar.unpacked (external Python can't read asar archives)
const SCRIPT = path.join(__dirname, '..', '..', 'python', 'transcribe_cli.py').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);

class Transcriber {
    constructor({ emit = () => { } } = {}) {
        this.emit = emit;
        this.queue = [];     // { video, outDir, opts, resolve, reject }
        this.running = null; // child process
        this.current = null;
    }

    pending() { return this.queue.map(j => j.video).concat(this.current ? [this.current] : []); }

    enqueue(video, outDir, opts) {
        if (this.pending().includes(video)) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            this.queue.push({ video, outDir, opts, resolve, reject });
            this.emit({ type: 'transcribe-queued', video });
            this._next();
        });
    }

    _next() {
        if (this.running || !this.queue.length) return;
        const job = this.queue.shift();
        const { opts } = job;
        this.current = job.video;
        const formats = (opts.format || 'txt').split(',').concat(['srt']).filter((v, i, a) => a.indexOf(v) === i).join(',');
        const args = [SCRIPT, '--engine', opts.engine || 'auto', '--device', opts.device || 'auto', '--model', opts.model || 'small', '--language', opts.language || 'auto', '--formats', formats, '--out-dir', job.outDir, job.video];
        const py = opts.python || 'python3';
        const env = { ...require('./downloader').toolEnv(), PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
        const p = spawn(py, args, { env, windowsHide: true });
        this.running = p;
        let result = null, errText = '';
        readline.createInterface({ input: p.stdout }).on('line', line => {
            let ev; try { ev = JSON.parse(line); } catch (e) { return; }
            if (ev.event === 'progress') this.emit({ type: 'transcribe-progress', video: job.video, percent: ev.percent });
            else if (ev.event === 'start') this.emit({ type: 'transcribe-start', video: job.video });
            else if (ev.event === 'loaded') this.emit({ type: 'log', msg: `🎙  Whisper (${ev.engine}, ${ev.model}) pronto` });
            else if (ev.event === 'done') result = ev;
            else if (ev.event === 'error' || ev.event === 'fatal') errText = ev.error;
        });
        p.stderr.on('data', d => { errText += d.toString(); if (errText.length > 4000) errText = errText.slice(-4000); });
        const finish = () => { this.running = null; this.current = null; this._next(); };
        p.on('error', e => { job.reject(e); finish(); });
        p.on('close', code => {
            if (result) {
                this.emit({ type: 'transcribe-done', video: job.video, files: result.files });
                job.resolve(result);
            } else {
                const e = new Error(`Trascrizione fallita (exit ${code}): ${errText.trim().split('\n').slice(-3).join(' ')}`);
                this.emit({ type: 'transcribe-error', video: job.video, error: e.message });
                job.reject(e);
            }
            finish();
        });
    }

    cancelAll() {
        for (const j of this.queue) j.reject(new Error('annullato'));
        this.queue = [];
        if (this.running) this.running.kill('SIGTERM');
    }
}

function checkWhisper(python = 'python3') {
    return new Promise(resolve => {
        const p = spawn(python, ['-c', 'import importlib.util as u;print("mlx" if u.find_spec("mlx_whisper") else "faster" if u.find_spec("faster_whisper") else "whisper" if u.find_spec("whisper") else "none")']);
        let out = '';
        p.stdout.on('data', d => out += d);
        p.on('error', () => resolve('none'));
        p.on('close', () => resolve(out.trim() || 'none'));
    });
}

module.exports = { Transcriber, checkWhisper, SCRIPT };
