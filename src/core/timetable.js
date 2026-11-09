'use strict';
// Lesson timetable from Servizi Online ("Orario delle lezioni", service 398), parsed with
// polimi-schedule-js by bebora (MIT, vendored in src/vendor/polimi-schedule-js).
// Also supports pasting the textual timetable and importing any .ics file/URL (e.g. teachers' Google Calendars).
const fs = require('fs');
const path = require('path');
const { APP_DIR } = require('./paths');
const { sleep } = require('./browser');

const FILE = path.join(APP_DIR, 'timetable.json');
const ICS = path.join(APP_DIR, 'orario.ics');
const SERVICE = 'https://aunicalogin.polimi.it/aunicalogin/getservizio.xml?id_servizio=398';

let parser = null;
async function getParser() {
    // single-file CJS bundle of the vendored parser + deps (works inside app.asar)
    if (!parser) parser = require('../vendor/polimi-schedule-js/schedule.bundle.cjs');
    return parser;
}

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { events: [], extra: [], updatedAt: null }; } }
function save(t) { fs.writeFileSync(FILE, JSON.stringify(t, null, 2)); return t; }

/** Open the timetable in the logged-in browser and read the textual version. */
async function fetchText(session, log = () => { }) {
    await session.start();
    log('📅 Apro l\'orario delle lezioni nei Servizi Online…');
    await session.goto(SERVICE, async (u, p) => /oralez/.test(u) && await p.evaluate(() => !!document.getElementById('orarioTestuale')), { timeout: 60000 });
    await sleep(800);
    // same trick as polimi-schedule-js: innerText of a visible copy has clean line breaks
    return session.page.evaluate(() => {
        const d = document.createElement('div');
        d.innerHTML = document.getElementById('orarioTestuale').innerHTML;
        Object.assign(d.style, { display: 'block', height: '0', width: '0', overflow: 'hidden' });
        document.body.appendChild(d);
        const t = d.innerText; d.remove(); return t;
    });
}

async function importText(text) {
    const p = await getParser();
    const parsed = p.parseText(text);
    if (parsed.error && !parsed.data.length) throw new Error('Orario non riconosciuto: ' + parsed.error);
    const ics = p.getIcalendar(parsed);
    if (ics.data) fs.writeFileSync(ICS, ics.data);
    const t = load();
    t.events = parsed.data.map(e => ({ ...e, source: 'polimi' }));
    t.updatedAt = new Date().toISOString();
    save(t);
    return { count: t.events.length, ics: ICS };
}

async function sync(session, log) {
    const text = await fetchText(session, log);
    const r = await importText(text);
    log(`  ✓ ${r.count} serie di lezioni importate`);
    return r;
}

// ---- minimal .ics import (VEVENT with DTSTART/DTEND/SUMMARY/LOCATION/RRULE) ----
function parseIcsText(ics, sourceName) {
    const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const out = []; let cur = null;
    const dt = v => {
        const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
        if (!m) return null;
        return m[7] ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString() : new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).toISOString();
    };
    for (const l of lines) {
        if (l === 'BEGIN:VEVENT') cur = {};
        else if (l === 'END:VEVENT') { if (cur && cur.start) out.push({ ...cur, source: sourceName }); cur = null; }
        else if (cur) {
            const i = l.indexOf(':'); if (i < 0) continue;
            const key = l.slice(0, i).split(';')[0], val = l.slice(i + 1).replace(/\\n/g, '\n').replace(/\\,/g, ',');
            if (key === 'DTSTART') cur.start = dt(val);
            else if (key === 'DTEND') cur.end = dt(val);
            else if (key === 'SUMMARY') cur.summary = val;
            else if (key === 'LOCATION') cur.location = val;
            else if (key === 'DESCRIPTION') cur.description = val;
            else if (key === 'RRULE') cur.rrule = val;
        }
    }
    return out;
}

async function importIcs(src, name) {
    const text = /^https?:\/\//.test(src) ? await (await fetch(src.replace(/^webcal:/, 'https:'))).text() : fs.readFileSync(src, 'utf8');
    const evs = parseIcsText(text, name || path.basename(src));
    if (!evs.length) throw new Error('Nessun evento trovato nel calendario');
    const t = load();
    t.extra = (t.extra || []).filter(e => e.source !== (name || path.basename(src))).concat(evs);
    t.feeds = (t.feeds || []).filter(f => f.src !== src).concat(/^https?:/.test(src) ? [{ src, name }] : []);
    save(t);
    return evs.length;
}

/** Expand weekly recurrences into concrete occurrences within [from, to). */
function occurrences(from, to) {
    const t = load();
    const out = [];
    for (const e of [...(t.events || []), ...(t.extra || [])]) {
        const s0 = new Date(e.start), e0 = new Date(e.end || e.start);
        const dur = e0 - s0;
        let until = to, interval = 7 * 864e5, isWeekly = false;
        if (e.rrule) {
            const m = e.rrule.match(/UNTIL=(\d{8})(T\d{6}Z?)?/);
            if (m) until = new Date(Math.min(to, new Date(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T23:59:59`)));
            isWeekly = /FREQ=WEEKLY/.test(e.rrule);
            const iv = e.rrule.match(/INTERVAL=(\d+)/); if (iv) interval *= +iv[1];
        }
        const exdates = new Set((e.exdate || []).map(d => new Date(d).toDateString()));
        if (isWeekly) {
            for (let s = new Date(s0); s < until; s = new Date(s.getTime() + interval)) {
                // keep wall-clock time across DST changes
                const fixed = new Date(s); fixed.setHours(s0.getHours(), s0.getMinutes(), 0, 0);
                if (fixed >= from && !exdates.has(fixed.toDateString())) out.push(occ(e, fixed, dur));
            }
        } else if (s0 >= from && s0 < to) out.push(occ(e, s0, dur));
        for (const rd of e.rdate || []) { const d = new Date(rd); if (d >= from && d < to) out.push(occ(e, d, dur)); }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
}
const occ = (e, s, dur) => ({ summary: e.summary, location: e.location || '', description: e.description || '', source: e.source, start: s.toISOString(), end: new Date(s.getTime() + dur).toISOString() });

/** Does a timetable event belong to this course? (fuzzy match on course name words) */
function matchCourse(summary, course) {
    const name = ((course.manifest && course.manifest.course && course.manifest.course.fullname) || course.name || '').toUpperCase().replace(/\(.*?\)|\[.*?\]|^\d+\s*-\s*/g, '').trim();
    const s = (summary || '').toUpperCase();
    if (!name || !s) return false;
    const words = name.split(/\s+/).filter(w => w.length > 3);
    const hit = words.filter(w => s.includes(w)).length;
    return words.length && hit / words.length >= 0.6;
}

module.exports = { load, sync, importText, importIcs, occurrences, matchCourse, ICS, fetchText };
