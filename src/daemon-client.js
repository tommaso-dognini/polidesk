'use strict';
// Client of polirecd (the Rust backend) for the Electron main process.
// Same wire protocol as crates/polirec-core/src/rpc.rs: one JSON object per line over a local socket.
// Starts the daemon when it is not running (it keeps running after the app quits), reconnects if it
// restarts, and replaces it when the app ships a newer version.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const PROTOCOL = 1;
const APP_DIR = process.env.POLIREC_HOME || path.join(os.homedir(), '.polirec');

/** FNV-1a 64 bit, low 48 bits — same as util::short_hash in Rust. */
function shortHash(s) {
    let h = 0xcbf29ce484222325n;
    for (const b of Buffer.from(s, 'utf8')) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
    return (h & 0xffffffffffffn).toString(16).padStart(12, '0');
}
/** Same rules as paths::socket_path in Rust. */
function socketPath() {
    if (process.platform === 'win32') return `\\\\.\\pipe\\polirecd-${shortHash(APP_DIR)}`;
    const p = path.join(APP_DIR, 'polirecd.sock');
    if (Buffer.byteLength(p) < 100) return p;
    const name = `polirecd-${shortHash(APP_DIR)}.sock`;
    const t = path.join(os.tmpdir(), name);
    return Buffer.byteLength(t) < 100 ? t : path.join('/tmp', name);
}

class DaemonClient {
    /** bin: path of polirecd; env: extra env for it; onEvent(evt) */
    constructor({ bin, env = {}, onEvent = () => { }, log = () => { } }) {
        this.bin = bin; this.env = env; this.onEvent = onEvent; this.log = log;
        this.required = [];   // methods the UI needs (set by main.js from the preload channels)
        this.sock = null; this.buf = ''; this.n = 0; this.wait = new Map(); this.ready = null; this.closing = false;
    }

    bundledVersion() {
        try { return execFileSync(this.bin, ['--version'], { timeout: 5000 }).toString().trim().split(' ').pop(); } catch (e) { return null; }
    }

    spawnDaemon() {
        fs.mkdirSync(APP_DIR, { recursive: true });
        const p = spawn(this.bin, [], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ...this.env } });
        p.unref();
    }

    connectOnce() {
        return new Promise((resolve, reject) => {
            const s = net.createConnection(socketPath());
            s.once('connect', () => { s.removeAllListeners('error'); resolve(s); });
            s.once('error', reject);
        });
    }

    /** Connect (starting/upgrading the daemon if needed), say hello and subscribe to events. */
    connect() {
        if (this.ready) return this.ready;
        this.ready = (async () => {
            let s = await this.connectOnce().catch(() => null);
            if (!s) {
                this.spawnDaemon();
                for (let i = 0; i < 200 && !s; i++) { await new Promise(r => setTimeout(r, 50)); s = await this.connectOnce().catch(() => null); }
                if (!s) throw new Error('Impossibile avviare il server di PoliRec (polirecd)');
            }
            this.attach(s);
            const hello = await this.call('hello', { client: 'electron', protocol: PROTOCOL });
            // the app was updated: replace the old daemon (it keeps running across app restarts)
            const want = this.bundledVersion();
            // outdated: other version, a newer binary on disk, a build that predates these checks, or missing
            // methods the UI needs (same version number during development)
            let newer = !hello.started;
            try { newer = newer || (hello.exe && path.resolve(hello.exe) === path.resolve(this.bin) && fs.statSync(this.bin).mtimeMs > hello.started + 1000); } catch (e) { }
            const missing = this.required.filter(m => !(hello.methods || []).includes(m));
            if (((want && hello.version !== want) || newer || missing.length) && !this.replaced) {
                this.replaced = true;   // once per app start: never loop if the bundled daemon is the old one
                this.log(`polirecd ${hello.version} → ${want}`);
                await this.call('daemon:shutdown').catch(() => { });
                this.detach();
                await new Promise(r => setTimeout(r, 400));
                this.ready = null;
                return this.connect();
            }
            await this.call('subscribe');
            this.methods = new Set(hello.methods || []);
            return hello;
        })().catch(e => { this.ready = null; throw e; });
        return this.ready;
    }

    attach(s) {
        this.sock = s; this.buf = '';
        s.setEncoding('utf8');
        s.on('data', d => {
            this.buf += d;
            let i;
            while ((i = this.buf.indexOf('\n')) >= 0) {
                const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
                if (!line) continue;
                let m; try { m = JSON.parse(line); } catch (e) { continue; }
                if (m.event) { try { this.onEvent(m.event); } catch (e) { } continue; }
                const w = this.wait.get(m.id); if (!w) continue;
                this.wait.delete(m.id);
                m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result);
            }
        });
        s.on('close', () => {
            for (const w of this.wait.values()) w.reject(new Error('Connessione al server di PoliRec interrotta'));
            this.wait.clear();
            if (this.sock === s) { this.sock = null; this.ready = null; }
            // the daemon restarted or crashed: reconnect (and start it again) in the background
            if (!this.closing) setTimeout(() => this.connect().then(() => this.onEvent({ type: 'refresh' })).catch(() => { }), 500);
        });
        s.on('error', () => { });
    }
    detach() { const s = this.sock; this.sock = null; if (s) { s.removeAllListeners('close'); s.destroy(); } }

    call(method, params = null) {
        if (!this.sock) return Promise.reject(new Error('Server di PoliRec non connesso'));
        const id = ++this.n;
        return new Promise((resolve, reject) => {
            this.wait.set(id, { resolve, reject });
            this.sock.write(JSON.stringify({ id, method, params: params === undefined ? null : params }) + '\n');
        });
    }

    /** call() that first makes sure the connection is up. */
    async request(method, params) {
        await this.connect();
        return this.call(method, params);
    }

    close() { this.closing = true; this.detach(); }
}

module.exports = { DaemonClient, socketPath, APP_DIR };
