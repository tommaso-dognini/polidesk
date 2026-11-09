'use strict';
// Transcript cleanup: fillers (ehm, mmm, uh…), stutters, Whisper hallucinations on silence.
// Works on .txt and .srt in place (keeps an untouched copy in .orig/ the first time).
const fs = require('fs');
const path = require('path');

// standalone filler tokens (IT + EN), case-insensitive, with optional trailing punctuation
const FILLERS = [
    'e+h+m*', 'e+m+', 'u+h+m*', 'u+m+', 'm+h*m+', 'h+m+', 'a+h+', 'o+h+', 'e+h+', 'u+h+', 'mh+', 'hm+',
];
const FILLER_RX = new RegExp(`(^|[\\s,.;:!?…-])(?:${FILLERS.join('|')})(?=[\\s,.;:!?…-]|$)[,.…]*`, 'giu');

// classic Whisper hallucinations on silence / music
const HALLUCINATIONS = [
    /sottotitoli (creati|a cura) (dalla|di).*$/i, /sottotitoli e revisione.*$/i, /^grazie a tutti( per la visione)?[.!]*$/i,
    /^thank(s| you) (for watching|so much for watching)[.!]*$/i, /^(please )?subscribe.*$/i, /amara\.org/i,
    /^\s*\[(musica|music|applausi|applause|silenzio|silence|risate|laughter)\]\s*$/i, /^\s*(♪|\.\.\.)+\s*$/,
];

function cleanText(t) {
    let s = ' ' + t + ' ';
    for (let i = 0; i < 2; i++) s = s.replace(FILLER_RX, '$1');
    // stutters: "il il il modello" → "il modello" (only short words, max 3 letters, to avoid real repetitions)
    s = s.replace(/(?<![\p{L}])(\p{L}{1,5})(?:[\s,]+\1)+(?![\p{L}])/giu, '$1');
    s = s.replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?:\s*[,;:])+/g, '$1').replace(/\s{2,}/g, ' ');
    s = s.replace(/^[\s,;:.]+/, '').trim();
    // capitalize first letter if we removed a leading filler
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function isHallucination(line) {
    const t = line.trim();
    if (!t) return true;
    return HALLUCINATIONS.some(rx => rx.test(t)) || /^[\p{P}\s]+$/u.test(t);
}

function cleanSegments(segs) {
    const out = [];
    let prev = '';
    segs = segs.filter((sg, i) => {
        // isolated 1–2 word fragments surrounded by silence are almost always hallucinations
        const words = (sg.text || '').trim().split(/\s+/).filter(Boolean).length;
        if (words > 2 || sg.start === undefined) return true;
        const gapBefore = i ? sg.start - segs[i - 1].end : sg.start;
        const gapAfter = i < segs.length - 1 ? segs[i + 1].start - sg.end : 99;
        return !(gapBefore > 3 && gapAfter > 3) && !(i < 3 && gapAfter > 8);
    });
    // short fragments before the lecture actually starts (mic noise, room chatter)
    const firstLong = segs.findIndex(sg => (sg.text || '').trim().split(/\s+/).length > 2);
    if (firstLong > 0 && segs[firstLong].start !== undefined)
        segs = segs.filter((sg, i) => i >= firstLong || segs[firstLong].start - sg.end <= 5);
    for (const sg of segs) {
        const text = cleanText(sg.text || '');
        if (!text || isHallucination(text) || text.split(/\s+/).length === 0) continue;
        // drop Whisper loops (same line repeated many times)
        if (text.toLowerCase() === prev.toLowerCase() && text.split(/\s+/).length < 8) continue;
        prev = text;
        out.push({ ...sg, text });
    }
    return out;
}

// ---- SRT helpers ----
const toSec = t => { const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; };
const toTs = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60), ms = Math.round((s % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
function parseSrt(text) {
    return text.replace(/\r/g, '').split(/\n\n+/).map(b => {
        const lines = b.trim().split('\n');
        const i = lines.findIndex(l => l.includes('-->'));
        if (i === -1) return null;
        const [a, z] = lines[i].split('-->');
        return { start: toSec(a), end: toSec(z), text: lines.slice(i + 1).join(' ').trim() };
    }).filter(Boolean);
}
const writeSrt = segs => segs.map((s, i) => `${i + 1}\n${toTs(s.start)} --> ${toTs(s.end)}\n${s.text}\n`).join('\n');

/** Clean <stem>.srt / <stem>.txt in a transcripts folder. Returns {removedSegments, before, after}. */
function cleanTranscriptFiles(dir, stem) {
    const srt = path.join(dir, stem + '.srt'), txt = path.join(dir, stem + '.txt');
    const orig = path.join(dir, '.orig');
    const backup = f => { if (!fs.existsSync(f)) return; fs.mkdirSync(orig, { recursive: true }); const b = path.join(orig, path.basename(f)); if (!fs.existsSync(b)) fs.copyFileSync(f, b); };
    let res = { removedSegments: 0, before: 0, after: 0 };
    if (fs.existsSync(srt)) {
        backup(srt);
        const segs = parseSrt(fs.readFileSync(srt, 'utf8'));
        const cleaned = cleanSegments(segs);
        res = { removedSegments: segs.length - cleaned.length, before: segs.map(s => s.text).join(' ').length, after: cleaned.map(s => s.text).join(' ').length };
        fs.writeFileSync(srt, writeSrt(cleaned));
        if (fs.existsSync(txt)) { backup(txt); fs.writeFileSync(txt, paragraphs(cleaned) + '\n'); }
    } else if (fs.existsSync(txt)) {
        backup(txt);
        const t = fs.readFileSync(txt, 'utf8');
        const c = t.split(/(?<=[.!?])\s+/).map(cleanText).filter(x => x && !isHallucination(x)).join(' ');
        res = { removedSegments: 0, before: t.length, after: c.length };
        fs.writeFileSync(txt, c + '\n');
    }
    return res;
}

/** Readable text with paragraph breaks on long pauses (> 2.5 s). */
function paragraphs(segs) {
    let out = '', prevEnd = 0;
    for (const s of segs) {
        if (out && s.start - prevEnd > 2.5) out += '\n\n'; else if (out) out += ' ';
        out += s.text; prevEnd = s.end;
    }
    return out;
}

/** Restore the original (uncleaned) files. */
function restoreOriginal(dir, stem) {
    for (const ext of ['srt', 'txt']) {
        const b = path.join(dir, '.orig', `${stem}.${ext}`);
        if (fs.existsSync(b)) fs.copyFileSync(b, path.join(dir, `${stem}.${ext}`));
    }
}

/** Dictation: also drops repeated short sentences and trailing "thank you"/"grazie" hallucinations. */
function cleanDictation(text) {
    const sents = cleanText(text).split(/(?<=[.!?])\s+/).filter(Boolean);
    const out = [];
    for (const s of sents) {
        const k = s.toLowerCase().replace(/[^\p{L}\s]/gu, '').trim();
        if (out.length && k && k === out[out.length - 1].toLowerCase().replace(/[^\p{L}\s]/gu, '').trim() && k.split(' ').length <= 5) continue;
        out.push(s);
    }
    while (out.length > 1 && /^(thank you|thanks|grazie( a tutti)?|bye|ciao)[.!]*$/i.test(out[out.length - 1].trim())) out.pop();
    return out.join(' ');
}

module.exports = { cleanDictation, cleanText, cleanSegments, cleanTranscriptFiles, restoreOriginal, parseSrt, writeSrt };
