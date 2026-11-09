#!/usr/bin/env node
'use strict';
// PoliRec MCP server (stdio) — lets Claude (Code / Desktop) or any MCP-capable assistant use PoliRec:
// courses, lessons, transcripts, AI notes, semantic search, notes, todos, timetable, free rooms, sync.
// Enable it in PoliRec → Impostazioni → Integrazioni → «Assistenti AI (MCP)», which also shows the exact
// command to register it (e.g. `claude mcp add polirec -- node /path/to/src/mcp.js`).
// Uses the official MCP TypeScript SDK (MIT). Everything goes through src/core/api.js.
console.log = (...a) => console.error(...a);          // stdout is reserved for the protocol
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const api = require('./core/api');
const lib = require('./core/library');

const server = new McpServer({ name: 'polirec', version: require('../package.json').version }, {
    instructions: 'PoliRec gestisce le lezioni registrate del Politecnico di Milano: corsi, registrazioni, trascrizioni, note AI (sommario, appunti, riassunto, spiegazione, flashcard, domande d\'esame), appunti dello studente (Markdown/LaTeX/Typst, collegabili alle lezioni), attività, orario e aule libere. ' +
        'I corsi si indicano per nome (anche parziale), numero o id; le lezioni per numero (1 = la più vecchia), data AAAA-MM-GG, parte del titolo o chiave. Le trascrizioni sono automatiche e possono contenere errori. ' +
        'Per domande sui contenuti usa prima `search` (ricerca semantica con citazioni) o `get_transcript`.',
});

const enabled = () => { const i = lib.loadConfig().settings.integrations || {}; return !!i.assistant; };
const ok = data => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 1) }] });
const fail = e => ({ isError: true, content: [{ type: 'text', text: '✗ ' + (e && e.message || e) }] });
/** Register a tool; every call checks the opt-in switch, so enabling it in the app needs no restart. */
function tool(name, title, description, shape, fn, { readOnly = true, destructive = false } = {}) {
    server.registerTool(name, { title, description, inputSchema: shape, annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: false } }, async args => {
        if (!enabled()) return fail('Accesso degli assistenti AI disattivato. Attivalo in PoliRec → Impostazioni → Integrazioni → «Assistenti AI (MCP)».');
        try { return ok(await fn(args || {})); } catch (e) { return fail(e); }
    });
}
const course = z.string().describe('Corso: nome (anche parziale, es. "ANN"), numero da list_courses o id');
const courseOpt = z.string().optional().describe('Corso (nome, numero o id). Omesso = appunti/attività generali');
const lesson = z.string().describe('Lezione: numero (1 = la più vecchia), data AAAA-MM-GG, parte del titolo o chiave');
const kind = z.enum(api.TEMPLATES).describe('Tipo di nota AI');

// ── courses & lessons ──
tool('polirec_status', 'Stato di PoliRec', 'Versione, numero di corsi, strumenti AI e trascrizione configurati.', {}, () => api.status());
tool('list_courses', 'Elenca i corsi', 'Corsi configurati con conteggi di lezioni scaricate/trascritte e docenti seguiti.', {}, () => api.courses());
tool('list_lessons', 'Elenca le lezioni', 'Lezioni di un corso in ordine cronologico, con sommario, argomenti e note AI disponibili. Di default solo i docenti seguiti.',
    { course, include_other_teachers: z.boolean().optional().describe('Includi le lezioni parallele di docenti non seguiti') },
    a => api.lessons(a.course, { all: !!a.include_other_teachers }));
tool('get_lesson', 'Dettagli lezione', 'Metadati, sommario, note AI disponibili e appunti dello studente collegati a una lezione.', { course, lesson }, a => api.lesson(a.course, a.lesson));
tool('get_transcript', 'Trascrizione', 'Testo della lezione (trascrizione automatica). Le lezioni sono lunghe (~60-100k caratteri): usa offset/max_chars per leggerle a pezzi.',
    { course, lesson, timestamps: z.boolean().optional().describe('Includi i tempi [hh:mm:ss] per riga'), offset: z.number().int().min(0).optional(), max_chars: z.number().int().min(1000).max(200000).optional().describe('Default 60000') },
    a => api.transcript(a.course, a.lesson, { timestamps: !!a.timestamps, offset: a.offset || 0, maxChars: a.max_chars || 60000 }));
tool('get_course_info', 'Scheda del corso', 'Scheda breve del corso: descrizione, docenti, modalità d\'esame, orario.', { course }, a => api.coursePage(a.course));

// ── AI notes & search ──
tool('get_ai_note', 'Nota AI di una lezione', 'Legge una nota generata dall\'AI (sommario, appunti, riassunto, spiegazione, flashcard, domande).', { course, lesson, kind }, a => api.aiNote(a.course, a.lesson, a.kind));
tool('generate_ai_note', 'Genera nota AI', 'Genera (o rigenera) una nota AI della lezione con lo strumento AI configurato in PoliRec. Richiede 1-2 minuti.', { course, lesson, kind },
    a => api.generateAiNote(a.course, a.lesson, a.kind), { readOnly: false });
tool('search', 'Ricerca semantica', 'Cerca per significato in trascrizioni, slide, sommari e appunti. Restituisce i passaggi più pertinenti con lezione e minuto.',
    { query: z.string(), course: z.string().optional(), k: z.number().int().min(1).max(50).optional() }, a => api.search(a.query, { course: a.course, k: a.k || 10 }));
tool('ask', 'Chiedi al corso', 'Risposta con citazioni [n] generata dall\'AI di PoliRec usando le fonti del corso (RAG).', { question: z.string(), course: z.string().optional() }, a => api.ask(a.question, { course: a.course }));

// ── student notes ──
tool('list_notes', 'Elenca appunti', 'Appunti dello studente (Markdown, LaTeX, Typst) di un corso o generali.', { course: courseOpt }, a => api.notes.list(a.course));
tool('read_note', 'Leggi appunto', 'Contenuto di un appunto e lezioni collegate.', { course: courseOpt, file: z.string() }, a => api.notes.read(a.course, a.file));
tool('create_note', 'Crea appunto', 'Crea un appunto, opzionalmente con contenuto e collegato a una o più lezioni.',
    { course: courseOpt, title: z.string(), kind: z.enum(['markdown', 'latex', 'typst']).optional(), content: z.string().optional(), lessons: z.array(z.string()).optional().describe('Lezioni del corso da collegare') },
    a => api.notes.create(a.course, { title: a.title, kind: a.kind || 'markdown', content: a.content, lessons: (a.lessons || []).map(l => ({ lesson: l })) }), { readOnly: false });
tool('update_note', 'Modifica appunto', 'Sostituisce il contenuto di un appunto o aggiunge testo in fondo.',
    { course: courseOpt, file: z.string(), content: z.string(), mode: z.enum(['replace', 'append']).optional() },
    a => (a.mode === 'append' ? api.notes.append : api.notes.write)(a.course, a.file, a.content), { readOnly: false, destructive: true });
tool('link_note', 'Collega appunto a lezioni', 'Collega un appunto a una o più lezioni (anche di un altro corso con lesson_course).',
    { course: courseOpt, file: z.string(), lessons: z.array(z.string()), lesson_course: z.string().optional() }, a => api.notes.link(a.course, a.file, a.lessons, a.lesson_course), { readOnly: false });

// ── todos, timetable, rooms ──
tool('list_todos', 'Attività', 'Attività da fare di un corso o generali.', { course: courseOpt, include_done: z.boolean().optional() }, a => api.todos.list(a.course, { done: !!a.include_done }));
tool('add_todo', 'Aggiungi attività', 'Aggiunge un\'attività (con scadenza opzionale AAAA-MM-GG).', { course: courseOpt, text: z.string(), due: z.string().optional() }, a => api.todos.add(a.course, a.text, a.due), { readOnly: false });
tool('complete_todo', 'Completa attività', 'Segna un\'attività come fatta (o non fatta) per id o testo.', { course: courseOpt, todo: z.string(), done: z.boolean().optional() }, a => api.todos.done(a.course, a.todo, a.done !== false), { readOnly: false });
tool('timetable', 'Orario', 'Lezioni in calendario (orario importato in PoliRec) nei prossimi giorni.', { from: z.string().optional().describe('AAAA-MM-GG, default oggi'), days: z.number().int().min(1).max(60).optional(), course: z.string().optional() },
    a => api.events({ from: a.from, days: a.days || 7, course: a.course }));
tool('free_rooms', 'Aule libere', 'Aule libere del Politecnico per una sede, giorno e fascia oraria (dati pubblici).',
    { sede: z.string().optional().describe('Id sede, es. MIA = Città Studi, MIB = Bovisa (vedi list_sedi)'), date: z.string().optional(), from: z.string().optional().describe('HH:MM, default adesso'), hours: z.number().min(0.5).max(10).optional() },
    a => api.freeRooms({ sede: a.sede || 'MIA', date: a.date, from: a.from, hours: a.hours || 2 }));
tool('list_sedi', 'Sedi', 'Sedi del Politecnico per free_rooms.', {}, () => api.sedi());

// ── long-running ──
tool('sync_course', 'Sincronizza corso', 'Cerca e scarica le nuove registrazioni del corso (può aprire Chrome per il login PoliMi e durare vari minuti).',
    { course, limit: z.number().int().min(1).optional() }, a => api.sync(a.course, { limit: a.limit }), { readOnly: false });
tool('transcribe', 'Trascrivi', 'Trascrive in locale le lezioni scaricate e non ancora trascritte (o una sola lezione).', { course, lesson: z.string().optional() }, a => api.transcribe(a.course, { lesson: a.lesson }), { readOnly: false });

server.connect(new StdioServerTransport()).catch(e => { console.error(e); process.exit(1); });
