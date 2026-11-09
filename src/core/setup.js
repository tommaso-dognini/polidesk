'use strict';
// First-run setup: detect OS / hardware, create a private Python env (~/.polirec/venv),
// install the best Whisper engine for this machine and pre-download the model.
//
//   macOS Apple Silicon → mlx-whisper (Metal GPU)            model by RAM (turbo ≥ 16 GB)
//   NVIDIA GPU          → faster-whisper (CUDA, float16)       large-v3-turbo
//   everything else     → faster-whisper (CPU, int8)           small / base by RAM+cores
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { APP_DIR } = require('./paths');
const dl = require('./downloader');

const VENV = path.join(APP_DIR, 'venv');
const IS_WIN = process.platform === 'win32';
const venvPython = () => IS_WIN ? path.join(VENV, 'Scripts', 'python.exe') : path.join(VENV, 'bin', 'python');

function run(cmd, args, { onLine = () => { }, env } = {}) {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { env: env || dl.toolEnv(), windowsHide: true });
        let tail = '';
        const feed = d => {
            const s = d.toString();
            tail = (tail + s).slice(-3000);
            s.split(/\r?\n|\r/).map(l => l.trim()).filter(Boolean).forEach(onLine);
        };
        p.stdout.on('data', feed); p.stderr.on('data', feed);
        p.on('error', reject);
        p.on('close', code => code === 0 ? resolve(tail) : reject(new Error(`${path.basename(cmd)} ${args[0] || ''} → exit ${code}\n${tail.slice(-800)}`)));
    });
}

function tryExec(cmd, args) {
    try { return execFileSync(cmd, args, { env: dl.toolEnv(), stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000, windowsHide: true }).toString().trim(); }
    catch (e) { return null; }
}

function pythonVersion(bin) {
    const v = tryExec(bin, ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])']);
    return v && /^\d+\.\d+$/.test(v) ? v : null;
}

/** Detect hardware and tools. */
function detect() {
    const cpus = os.cpus();
    const ramGB = Math.round(os.totalmem() / 1024 ** 3);
    const appleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
    let nvidia = null;
    const smi = dl.which('nvidia-smi');
    if (smi) {
        const out = tryExec(smi, ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
        if (out) { const [name, mem] = out.split('\n')[0].split(',').map(s => s.trim()); nvidia = { name, vramGB: Math.round(Number(mem) / 1024) }; }
    }
    // python candidates (3.9–3.13 have wheels for all engines)
    const candidates = IS_WIN ? ['py', 'python', 'python3'] : ['python3.12', 'python3.11', 'python3.13', 'python3.10', 'python3'];
    const pythons = [];
    for (const c of candidates) {
        const bin = dl.which(c);
        if (!bin) continue;
        const v = c === 'py' ? tryExec(bin, ['-3', '-c', 'import sys;print("%d.%d"%sys.version_info[:2])']) : pythonVersion(bin);
        if (v) pythons.push({ bin, version: v, launcher: c === 'py' });
    }
    const venvOk = fs.existsSync(venvPython());
    return {
        platform: process.platform, arch: process.arch, os: `${os.type()} ${os.release()}`,
        cpu: cpus[0] ? cpus[0].model.trim() : '', cores: cpus.length, ramGB, appleSilicon, nvidia,
        uv: dl.which('uv'), pythons, venv: venvOk ? VENV : null,
        aria2c: dl.which('aria2c'), ffmpeg: dl.ffmpegPath(), chrome: (() => { try { return require('./browser').findChrome(); } catch (e) { return null; } })(),
        ai: Object.fromEntries(['agy', 'claude', 'gemini'].map(b => [b, dl.which(b)])),
    };
}

/** Pick engine + model for this machine. */
function recommend(hw) {
    if (hw.appleSilicon) {
        return { engine: 'mlx', model: hw.ramGB >= 16 ? 'large-v3-turbo' : hw.ramGB >= 8 ? 'small' : 'base', device: 'Apple GPU (Metal)', packages: ['mlx-whisper'] };
    }
    if (hw.nvidia) {
        const big = hw.nvidia.vramGB >= 6;
        const pk = ['faster-whisper'];
        if (process.platform !== 'darwin') pk.push('nvidia-cublas-cu12', 'nvidia-cudnn-cu12==9.*');
        return { engine: 'faster', model: big ? 'large-v3-turbo' : 'small', device: `NVIDIA ${hw.nvidia.name} (CUDA)`, packages: pk, cuda: true };
    }
    const strong = hw.cores >= 8 && hw.ramGB >= 16;
    return { engine: 'faster', model: strong ? 'small' : hw.ramGB >= 8 ? 'base' : 'tiny', device: `CPU (${hw.cores} core, int8)`, packages: ['faster-whisper'] };
}

/**
 * Install everything. onStep({step, status, detail}) is called for UI progress.
 * Returns the transcription settings to save.
 */
async function install(rec, { onStep = () => { }, onLog = () => { } } = {}) {
    const hw = detect();
    const step = (s, status, detail = '') => onStep({ step: s, status, detail });

    // 1. Python environment
    step('python', 'running', 'Creo l\'ambiente Python privato…');
    if (!fs.existsSync(venvPython())) {
        let uv = hw.uv;
        const good = hw.pythons.find(p => /^3\.(9|1[0-3])$/.test(p.version));
        if (!uv && !good) {
            // no usable Python: install uv (single binary, it can download Python by itself)
            step('python', 'running', 'Installo uv (gestore Python)…');
            if (IS_WIN) await run('powershell', ['-ExecutionPolicy', 'ByPass', '-c', 'irm https://astral.sh/uv/install.ps1 | iex'], { onLine: onLog });
            else await run('/bin/sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { onLine: onLog });
            uv = dl.which('uv') || [path.join(os.homedir(), '.local', 'bin', IS_WIN ? 'uv.exe' : 'uv'), path.join(os.homedir(), '.cargo', 'bin', 'uv')].find(p => fs.existsSync(p));
            if (!uv) throw new Error('Installazione di uv non riuscita. Installa Python 3.12 da python.org e riprova.');
        }
        if (uv) await run(uv, ['venv', '--python', '3.12', '--seed', VENV], { onLine: onLog });
        else if (good.launcher) await run(good.bin, ['-' + good.version, '-m', 'venv', VENV], { onLine: onLog });
        else await run(good.bin, ['-m', 'venv', VENV], { onLine: onLog });
    }
    step('python', 'done', VENV);

    // 2. engine packages
    step('engine', 'running', `Installo ${rec.packages.join(', ')}…`);
    const py = venvPython();
    if (hw.uv || dl.which('uv')) await run(dl.which('uv') || hw.uv, ['pip', 'install', '--python', py, '-U', ...rec.packages], { onLine: onLog });
    else await run(py, ['-m', 'pip', 'install', '-U', ...rec.packages], { onLine: onLog });
    step('engine', 'done', rec.engine === 'mlx' ? 'mlx-whisper' : 'faster-whisper');

    // 3. model download (warm-up run on 1 s of silence)
    step('model', 'running', `Scarico il modello ${rec.model}…`);
    const script = require('./transcriber').SCRIPT;
    await run(py, [script, '--warmup', '--engine', rec.engine, '--model', rec.model, ...(rec.cuda ? ['--device', 'cuda'] : [])], { onLine: onLog });
    step('model', 'done', rec.model);

    return { engine: rec.engine, model: rec.model, python: py, device: rec.cuda ? 'cuda' : 'auto' };
}

module.exports = { detect, recommend, install, VENV, venvPython };
