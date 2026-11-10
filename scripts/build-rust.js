#!/usr/bin/env node
// Builds the Rust backend (polideskd + polidesk) in release mode and puts the binaries in target/dist-bin,
// which electron-builder ships as resources/bin. On macOS it builds a universal binary (arm64 + x64),
// so both the Apple Silicon and the Intel installers work.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'target', 'dist-bin');
const bins = ['polideskd', 'polidesk'];
const exe = n => n + (process.platform === 'win32' ? '.exe' : '');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

if (process.platform === 'darwin') {
    const targets = ['aarch64-apple-darwin', 'x86_64-apple-darwin'];
    try { run('rustup', ['target', 'add', ...targets]); } catch (e) { console.warn('rustup non disponibile: uso i target già installati'); }
    for (const t of targets) run('cargo', ['build', '--release', '--target', t, '-p', 'polideskd', '-p', 'polidesk']);
    for (const b of bins) run('lipo', ['-create', '-output', path.join(out, b), ...targets.map(t => path.join(root, 'target', t, 'release', b))]);
} else {
    run('cargo', ['build', '--release', '-p', 'polideskd', '-p', 'polidesk']);
    for (const b of bins) fs.copyFileSync(path.join(root, 'target', 'release', exe(b)), path.join(out, exe(b)));
}
for (const b of bins) console.log('✓', path.join(out, exe(b)));
