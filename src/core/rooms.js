'use strict';
// Free classrooms, from the public Politecnico "maps_rest" API (no login needed).
// UI inspired by PoliAule (PoliNetwork) — independent implementation; building shapes for the map come
// from the same public API (no third-party map tiles).
const fs = require('fs');
const path = require('path');
const { APP_DIR } = require('./paths');

const BASE = 'https://onlineservices.polimi.it/maps_rest/rest';
const CACHE = path.join(APP_DIR, 'cache');
const PHOTOS = path.join(CACHE, 'foto-aule');
const UA = 'PoliRec (student app)';

async function getJson(url) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.json();
}

/** Spaces hierarchy + geometry — cached for 7 days. */
let mem = null;
async function spaces() {
    if (mem) return mem;
    fs.mkdirSync(CACHE, { recursive: true });
    const f = path.join(CACHE, 'spazi-v2.json');
    try { if (Date.now() - fs.statSync(f).mtimeMs < 7 * 864e5) return (mem = JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) { }
    const d = await getJson(`${BASE}/spazi/`);
    const geo = {};
    for (const ft of (d.edificiGeoJsonLoc && d.edificiGeoJsonLoc.features) || []) geo[ft.properties.POLIMI_ID_SPAZIO] = ft.geometry;
    const pts = {};
    for (const ft of (d.edificiGeoJson && d.edificiGeoJson.features) || []) pts[ft.properties.POLIMI_ID_SPAZIO] = [ft.properties.LAT, ft.properties.LNG];
    const campusShape = {};
    for (const ft of (d.campiGeoJsonShapes && d.campiGeoJsonShapes.features) || []) campusShape[ft.properties.POLIMI_ID_SPAZIO] = ft.geometry;
    const sedeCity = Object.fromEntries(d.sede.map(s => [s.csis, (d.polo.find(p => p.csim === s.csim) || {}).nome || s.nome]));
    mem = {
        sedi: d.sede.filter(s => s.visibile === 'S').map(s => ({ id: s.csis, name: s.nome, city: sedeCity[s.csis] })),
        campus: d.campus.filter(c => c.visibile === 'S').map(c => ({ id: c.csic, sede: c.csis, name: c.nome, city: sedeCity[c.csis], shape: campusShape[c.csic] || null })),
        edifici: d.edificio.map(e => ({ id: e.csie, campus: e.csic, name: e.nome, label: e.etichettaMappa || '', address: [e.prefissoToponomastico, e.indirizzo, e.numeroCivico].filter(Boolean).join(' '), geo: geo[e.csie] || null, point: pts[e.csie] || null })),
        aule: d.aula.filter(a => a.fittizia !== 'S' && a.uso_test !== 'S').map(a => ({
            id: a.idaula, name: a.sigla || a.denominazione, edificio: a.csie, piano: a.csip, capienza: Number(a.capienza) || null,
            tipo: a.tipologia || a.categoria || '', descrizione: a.descrizione || a.denominazione || '', foto: a.idfoto && a.idfoto !== '0' ? a.idfoto : null,
        })),
    };
    fs.writeFileSync(f, JSON.stringify(mem));
    return mem;
}

const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

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

/**
 * Status of every room of a campus for the interval [from, to) (minutes from midnight) on `date`:
 * 'free' (no overlap), 'partial' (busy for part of it), 'busy' (busy the whole interval).
 */
async function status({ campus, sede, date, from, to, onProgress = () => { } }) {
    const sp = await spaces();
    const ids = campus ? [].concat(campus) : sp.campus.filter(c => c.sede === sede).map(c => c.id);
    const edifici = new Map(sp.edifici.filter(e => ids.includes(e.campus)).map(e => [e.id, e]));
    const aule = sp.aule.filter(a => edifici.has(a.edificio));
    const day = new Date(date);
    let done = 0;
    const rows = await pool(aule, 8, async a => {
        const occ = await occupation(a.id, day);
        onProgress(++done / aule.length);
        if (!occ) return { ...a, hidden: true };
        let busy = 0;
        for (const s of occ) busy += Math.max(0, Math.min(to, toMin(s.end)) - Math.max(from, toMin(s.start)));
        const len = Math.max(1, to - from);
        const st = busy <= 0 ? 'free' : busy >= len - 1 ? 'busy' : 'partial';
        const next = occ.filter(s => toMin(s.start) >= from).sort((x, y) => toMin(x.start) - toMin(y.start))[0];
        return { ...a, occ, status: st, busyFrac: busy / len, freeUntil: st === 'free' ? (next ? next.start : null) : null };
    });
    const visible = rows.filter(r => !r.hidden);
    const byBuilding = {};
    for (const r of visible) (byBuilding[r.edificio] = byBuilding[r.edificio] || []).push(r);
    const buildings = [...edifici.values()].filter(e => byBuilding[e.id]).map(e => {
        const rs = byBuilding[e.id].sort((a, b) => ({ free: 0, partial: 1, busy: 2 }[a.status] - { free: 0, partial: 1, busy: 2 }[b.status]) || a.name.localeCompare(b.name, 'it', { numeric: true }));
        return { ...e, rooms: rs, free: rs.filter(r => r.status === 'free').length, partial: rs.filter(r => r.status === 'partial').length };
    }).sort((a, b) => (b.free - a.free) || (b.partial - a.partial) || a.name.localeCompare(b.name, 'it', { numeric: true }));
    const shapes = sp.campus.filter(x => ids.includes(x.id)).map(x => x.shape).filter(Boolean);
    return { campus: ids, shapes, buildings, total: aule.length, hidden: rows.length - visible.length, free: visible.filter(r => r.status === 'free').length, partial: visible.filter(r => r.status === 'partial').length };
}

/** Local path of a room photo (downloaded once). */
async function photo(idfoto) {
    if (!idfoto) return null;
    fs.mkdirSync(PHOTOS, { recursive: true });
    const f = path.join(PHOTOS, idfoto + '.jpg');
    if (fs.existsSync(f)) return f;
    try {
        const url = (await (await fetch(`${BASE}/syncro/rooms/foto/${idfoto}`, { headers: { 'User-Agent': UA } })).text()).trim();
        if (!/^https:\/\//.test(url)) return null;
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) return null;
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
        return f;
    } catch (e) { return null; }
}

// legacy helper kept for compatibility
async function freeRooms({ sede, campus, when = new Date(), minutes = 60, minCapacity = 0 }) {
    const sp = await spaces();
    const ids = campus ? [campus] : sp.campus.filter(c => c.sede === sede).map(c => c.id);
    const t = when.getHours() * 60 + when.getMinutes();
    const all = [];
    for (const id of ids) { const r = await status({ campus: id, date: when, from: t, to: t + minutes }); for (const b of r.buildings) for (const x of b.rooms) if (x.status === 'free' && (!minCapacity || (x.capienza || 0) >= minCapacity)) all.push({ ...x, edificioName: b.name, address: b.address }); }
    return { rooms: all, total: all.length, hidden: 0, busy: 0 };
}

module.exports = { spaces, occupation, status, photo, freeRooms };
