'use strict';
// "Appunti": user-written notes in Markdown, LaTeX (Tectonic engine) or Typst (Typst engine).
// Files live in <course>/appunti/ or, for general notes, in <notesRoot>/.
// Engines are downloaded on demand into ~/.polirec/bin for the current OS/arch:
//   Typst    — Apache-2.0 — https://github.com/typst/typst
//   Tectonic — MIT        — https://github.com/tectonic-typesetting/tectonic (TeX bundle fetched on first compile)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { APP_DIR } = require('./paths');
const { httpDownload } = require('./downloader');

const BIN = path.join(APP_DIR, 'bin');
const IS_WIN = process.platform === 'win32';
const EXT = { markdown: '.md', latex: '.tex', typst: '.typ' };
const KIND_BY_EXT = { '.md': 'markdown', '.tex': 'latex', '.typ': 'typst' };

const TEMPLATES = {
    markdown: t => `# ${t}\n\n`,
    latex: t => `\\documentclass[11pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[italian,english]{babel}\n\\usepackage{amsmath,amssymb,amsthm}\n\\usepackage{graphicx}\n\\usepackage[margin=2.2cm]{geometry}\n\\usepackage{hyperref}\n\n\\title{${t}}\n\\author{}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduzione}\n\nScrivi qui. Formula: $E = mc^2$\n\n\\end{document}\n`,
    typst: t => `#set page(paper: "a4", margin: 2.2cm)\n#set text(font: "New Computer Modern", size: 11pt, lang: "it")\n#set heading(numbering: "1.1")\n\n#align(center, text(18pt, weight: "bold")[${t}])\n\n= Introduzione\n\nScrivi qui. Formula: $E = m c^2$\n`,
};

// ---------- files ----------
function dirFor(courseDir, notesRoot) { return courseDir ? path.join(courseDir, 'appunti') : notesRoot; }

function list(dir) {
    const out = [];
    const walk = (d, rel) => {
        let entries = [];
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
        for (const e of entries) {
            if (e.name.startsWith('.')) continue;
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) walk(path.join(d, e.name), r);
            else if (KIND_BY_EXT[path.extname(e.name)]) {
                const st = fs.statSync(path.join(d, e.name));
                const pdf = path.join(d, e.name.replace(/\.[^.]+$/, '.pdf'));
                out.push({ file: r, kind: KIND_BY_EXT[path.extname(e.name)], mtime: st.mtimeMs, size: st.size, pdf: fs.existsSync(pdf) ? r.replace(/\.[^.]+$/, '.pdf') : null });
            }
        }
    };
    walk(dir, '');
    return out.sort((a, b) => b.mtime - a.mtime);
}

function safe(dir, rel) {
    const p = path.resolve(dir, rel);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error('percorso non valido');
    return p;
}

function create(dir, title, kind) {
    fs.mkdirSync(dir, { recursive: true });
    const base = (title || 'Senza titolo').replace(/[\\/:*?"<>|]/g, '-').trim();
    let name = base + EXT[kind], i = 2;
    while (fs.existsSync(path.join(dir, name))) name = `${base} ${i++}${EXT[kind]}`;
    fs.writeFileSync(path.join(dir, name), TEMPLATES[kind](title || 'Senza titolo'));
    return name;
}
const read = (dir, rel) => fs.readFileSync(safe(dir, rel), 'utf8');
function write(dir, rel, content) { const p = safe(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); const tmp = p + '.tmp'; fs.writeFileSync(tmp, content); fs.renameSync(tmp, p); return true; }
function rename(dir, rel, newName) {
    const from = safe(dir, rel), to = safe(dir, path.join(path.dirname(rel), newName.replace(/[\\/:*?"<>|]/g, '-') + path.extname(rel)));
    if (fs.existsSync(to)) throw new Error('esiste già un appunto con questo nome');
    fs.renameSync(from, to);
    const nrel = path.relative(dir, to).split(path.sep).join('/');
    moveLinks(dir, rel, nrel);
    return nrel;
}
function remove(dir, rel) {
    const p = safe(dir, rel), trash = path.join(dir, '.cestino');
    fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(p, path.join(trash, `${Date.now()}-${path.basename(p)}`));
    moveLinks(dir, rel, null);
    return true;
}
/** Save a pasted/dropped image next to the note (assets/) and return its relative path. */
function saveAsset(dir, rel, name, buf) {
    const assets = path.join(path.dirname(safe(dir, rel)), 'assets');
    fs.mkdirSync(assets, { recursive: true });
    const fname = `${Date.now()}-${name.replace(/[^\w.-]/g, '_')}`;
    fs.writeFileSync(path.join(assets, fname), Buffer.from(buf));
    return 'assets/' + fname;
}

// ---------- links note ↔ lessons (sidecar .polirec-links.json in each notes folder) ----------
// { "<file>": [{ "c": courseId, "k": recordingKey }, ...] } — works for .md, .tex and .typ alike.
const LINKS = '.polirec-links.json';
function getAllLinks(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, LINKS), 'utf8')) || {}; } catch (e) { return {}; } }
function saveAllLinks(dir, all) {
    for (const k of Object.keys(all)) if (!all[k] || !all[k].length) delete all[k];
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, LINKS + '.tmp'); fs.writeFileSync(tmp, JSON.stringify(all, null, 1)); fs.renameSync(tmp, path.join(dir, LINKS));
}
const getLinks = (dir, file) => getAllLinks(dir)[file] || [];
function setLinks(dir, file, links) {
    const all = getAllLinks(dir);
    const seen = new Set();
    all[file] = (links || []).filter(l => l && l.c && l.k && !seen.has(l.c + '|' + l.k) && seen.add(l.c + '|' + l.k)).map(l => ({ c: l.c, k: l.k }));
    saveAllLinks(dir, all);
    return all[file] || [];
}
function moveLinks(dir, from, to) { const all = getAllLinks(dir); if (!all[from]) return; if (to) all[to] = all[from]; delete all[from]; saveAllLinks(dir, all); }

// ---------- engines ----------
const engineBin = name => path.join(BIN, name + (IS_WIN ? '.exe' : ''));
function engineStatus() {
    const v = name => { try { return execFileSync(engineBin(name), ['--version'], { timeout: 5000 }).toString().split('\n')[0].trim(); } catch (e) { return null; } };
    return { typst: fs.existsSync(engineBin('typst')) ? v('typst') || 'installato' : null, tectonic: fs.existsSync(engineBin('tectonic')) ? v('tectonic') || 'installato' : null };
}

function targetTriple() {
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    if (process.platform === 'darwin') return `${arch}-apple-darwin`;
    if (IS_WIN) return `${arch}-pc-windows-msvc`;
    return `${arch}-unknown-linux-musl`;
}

async function installEngine(name, onLog = () => { }) {
    const repo = name === 'typst' ? 'typst/typst' : 'tectonic-typesetting/tectonic';
    const rel = await (await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'User-Agent': 'PoliRec' } })).json();
    let triple = targetTriple();
    if (name === 'tectonic' && process.platform === 'win32') triple = 'x86_64-pc-windows-msvc';
    if (name === 'tectonic' && process.platform === 'linux' && process.arch !== 'arm64') triple = 'x86_64-unknown-linux-musl';
    const asset = (rel.assets || []).find(a => a.name.includes(triple) && /\.(tar\.xz|tar\.gz|zip)$/.test(a.name));
    if (!asset) throw new Error(`Nessun binario ${name} per ${triple} nella release ${rel.tag_name}`);
    onLog(`Scarico ${asset.name} (${rel.tag_name})…`);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polirec-'));
    const archive = path.join(tmpDir, asset.name);
    await httpDownload(asset.browser_download_url, archive, { connections: 4 });
    onLog('Estraggo…');
    // bsdtar (macOS, Windows 10+) and GNU tar handle .tar.xz/.tar.gz/.zip
    await new Promise((res, rej) => { const p = spawn('tar', ['-xf', archive, '-C', tmpDir], { windowsHide: true }); p.on('close', c => c === 0 ? res() : rej(new Error('tar exit ' + c))); p.on('error', rej); });
    const found = findFile(tmpDir, name + (IS_WIN ? '.exe' : ''));
    if (!found) throw new Error('binario non trovato nell\'archivio');
    fs.mkdirSync(BIN, { recursive: true });
    fs.copyFileSync(found, engineBin(name));
    if (!IS_WIN) fs.chmodSync(engineBin(name), 0o755);
    if (process.platform === 'darwin') { try { execFileSync('xattr', ['-d', 'com.apple.quarantine', engineBin(name)], { stdio: 'ignore' }); } catch (e) { } }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    onLog(`${name} installato: ${engineStatus()[name]}`);
    return engineStatus()[name];
}
function findFile(dir, name) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { const f = findFile(p, name); if (f) return f; }
        else if (e.name === name) return p;
    }
    return null;
}

/** Compile .typ / .tex to PDF next to the source. Returns {pdf, log, ok}. */
function compile(dir, rel, { onLog = () => { } } = {}) {
    const src = safe(dir, rel);
    const kind = KIND_BY_EXT[path.extname(src)];
    const outDir = path.dirname(src);
    let bin, args;
    if (kind === 'typst') { bin = engineBin('typst'); args = ['compile', '--root', dir, src, src.replace(/\.typ$/, '.pdf')]; }
    else if (kind === 'latex') { bin = engineBin('tectonic'); args = ['-X', 'compile', '--outdir', outDir, '--keep-logs', src]; }
    else return Promise.reject(new Error('Solo Typst e LaTeX vanno compilati'));
    if (!fs.existsSync(bin)) return Promise.reject(Object.assign(new Error(`Motore ${kind === 'typst' ? 'Typst' : 'LaTeX (Tectonic)'} non installato`), { code: 'NO_ENGINE' }));
    return new Promise(resolve => {
        const p = spawn(bin, args, { cwd: outDir, windowsHide: true });
        let log = '';
        const feed = d => { const s = d.toString(); log += s; s.split(/\r?\n/).filter(Boolean).forEach(onLog); };
        p.stdout.on('data', feed); p.stderr.on('data', feed);
        p.on('error', e => resolve({ ok: false, log: e.message }));
        p.on('close', code => {
            const pdf = src.replace(/\.(typ|tex)$/, '.pdf');
            resolve({ ok: code === 0 && fs.existsSync(pdf), pdf: fs.existsSync(pdf) ? path.relative(dir, pdf).split(path.sep).join('/') : null, log, errors: parseErrors(kind, log) });
        });
    });
}

function parseErrors(kind, log) {
    const errs = [];
    if (kind === 'typst') {
        const rx = /error: (.+)\n\s+┌─ ([^:\n]+):(\d+):(\d+)/g; let m;
        while ((m = rx.exec(log))) errs.push({ line: +m[3], col: +m[4], msg: m[1] });
    } else {
        const rx = /error: ([^:\n]+):(\d+): (.+)/g; let m;
        while ((m = rx.exec(log))) errs.push({ line: +m[2], msg: m[3] });
    }
    return errs;
}

module.exports = { getLinks, setLinks, getAllLinks, EXT, KIND_BY_EXT, dirFor, list, create, read, write, rename, remove, saveAsset, engineStatus, installEngine, compile };
