'use strict';
// Free classrooms, from the public Politecnico "maps_rest" API (no login needed).
// Idea credit: PoliAule / @alpolimibot (PoliNetwork community) — this is an independent implementation.
const fs = require('fs');
const path = require('path');
const { APP_DIR } = require('./paths');

const BASE = 'https://onlineservices.polimi.it/maps_rest/rest';
const CACHE = path.join(APP_DIR, 'cache');
const UA = 'PoliRec (student app)';

async function getJson(url) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
}

/** Spaces hierarchy (campuses, buildings, rooms) — cached for 7 days. */
async function spaces() {
    fs.mkdirSync(CACHE, { recursive: true });
    const f = path.join(CACHE, 'spazi.json');
    try {
        const st = fs.statSync(f);
        if (Date.now() - st.mtimeMs < 7 * 864e5) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) { }
    const d = await getJson(`${BASE}/spazi/`);
    const slim = {
        sedi: d.sede.filter(s => s.visibile === 'S').map(s => ({ id: s.csis, name: s.nome, polo: s.csim })),
        campus: d.campus.filter(c => c.visibile === 'S').map(c => ({ id: c.csic, sede: c.csis, name: c.nome })),
        edifici: d.edificio.map(e => ({ id: e.csie, campus: e.csic, name: e.nome, address: e.indirizzo })),
        aule: d.aula.filter(a => a.fittizia !== 'S' && a.uso_test !== 'S').map(a => ({
            id: a.idaula, name: a.sigla || a.denominazione, edificio: a.csie, piano: a.csip, capienza: Number(a.capienza) || null,
            tipo: a.tipologia || a.categoria || '', descrizione: a.descrizione || a.denominazione || '',
        })),
    };
    fs.writeFileSync(f, JSON.stringify(slim));
    return slim;
}

const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** Occupation slots of one room on a date (cached per day). null = hidden by Polimi. */
const occCache = new Map();
async function occupation(idaula, date) {
    const k = idaula + ':' + ymd(date);
    if (occCache.has(k)) return occCache.get(k);
    let v;
    try {
        const r = await getJson(`${BASE}/ricerca/aula/occupazione/${idaula}/${ymd(date)}`);
        v = Array.isArray(r) ? r.map(s => ({ start: s.inizio, end: s.fine, corso: s.corso || null })) : null;
    } catch (e) { v = undefined; }
    if (v !== undefined) occCache.set(k, v);
    return v;
}

async function pool(items, n, fn) {
    let i = 0; const out = new Array(items.length);
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]); } }));
    return out;
}

const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/**
 * Free rooms in a campus (or sede) at `when`, for at least `minutes`.
 * Returns rooms sorted by how long they stay free, with their full day schedule.
 */
async function freeRooms({ sede, campus, when = new Date(), minutes = 60, minCapacity = 0, onProgress = () => { } }) {
    const sp = await spaces();
    const campusIds = campus ? [campus] : sp.campus.filter(c => c.sede === sede).map(c => c.id);
    const edifici = new Map(sp.edifici.filter(e => campusIds.includes(e.campus)).map(e => [e.id, e]));
    const aule = sp.aule.filter(a => edifici.has(a.edificio) && (!minCapacity || (a.capienza || 0) >= minCapacity));
    const t = when.getHours() * 60 + when.getMinutes();
    let done = 0;
    const res = await pool(aule, 8, async a => {
        const occ = await occupation(a.id, when);
        onProgress(++done / aule.length);
        if (!occ) return null;
        const busyNow = occ.find(s => toMin(s.start) <= t && t < toMin(s.end));
        const next = occ.filter(s => toMin(s.start) > t).sort((x, y) => toMin(x.start) - toMin(y.start))[0];
        const freeUntil = busyNow ? null : next ? next.start : '23:59';
        const freeMin = busyNow ? 0 : (next ? toMin(next.start) : 24 * 60) - t;
        const e = edifici.get(a.edificio);
        return { ...a, edificioName: e.name, address: e.address, occ, free: !busyNow, freeUntil, freeMin, busyUntil: busyNow ? busyNow.end : null };
    });
    const rooms = res.filter(Boolean);
    return {
        total: aule.length, hidden: aule.length - rooms.length,
        rooms: rooms.filter(r => r.free && r.freeMin >= minutes).sort((a, b) => b.freeMin - a.freeMin || (b.capienza || 0) - (a.capienza || 0)),
        busy: rooms.filter(r => !r.free).length,
    };
}

module.exports = { spaces, occupation, freeRooms };
