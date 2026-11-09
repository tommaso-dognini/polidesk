//! MCP server over stdio (JSON-RPC 2.0, one message per line) — lets Claude (Code / Desktop) or any
//! MCP-capable assistant use PoliRec. Every tool goes through polirecd ("api:*" methods); the daemon checks
//! the opt-in switch (Impostazioni → Integrazioni → «Assistenti AI (MCP)») on every call.
use anyhow::Result;
use polirec_core::rpc::Client;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

const PROTOCOLS: [&str; 4] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS: &str = "PoliRec gestisce le lezioni registrate del Politecnico di Milano: corsi, registrazioni, trascrizioni, note AI (sommario, appunti, riassunto, spiegazione, flashcard, domande d'esame), appunti dello studente (Markdown/LaTeX/Typst, collegabili alle lezioni), attività, orario e aule libere. I corsi si indicano per nome (anche parziale), numero o id; le lezioni per numero (1 = la più vecchia), data AAAA-MM-GG, parte del titolo o chiave. Le trascrizioni sono automatiche e possono contenere errori. Per domande sui contenuti usa prima `search` (ricerca semantica con citazioni) o `get_transcript`.";

fn s(desc: &str) -> Value {
    json!({ "type": "string", "description": desc })
}
fn course() -> Value {
    s("Corso: nome (anche parziale, es. \"ANN\"), numero da list_courses o id")
}
fn course_opt() -> Value {
    s("Corso (nome, numero o id). Omesso = appunti/attività generali")
}
fn lesson() -> Value {
    s("Lezione: numero (1 = la più vecchia), data AAAA-MM-GG, parte del titolo o chiave")
}
fn kind() -> Value {
    json!({ "type": "string", "enum": ["sommario", "appunti", "riassunto", "spiegazione", "domande", "flashcard"], "description": "Tipo di nota AI" })
}

struct Tool {
    name: &'static str,
    title: &'static str,
    desc: &'static str,
    props: Value,
    required: &'static [&'static str],
    read_only: bool,
    destructive: bool,
}

fn tools() -> Vec<Tool> {
    let t = |name, title, desc, props: Value, required: &'static [&'static str], read_only, destructive| Tool { name, title, desc, props, required, read_only, destructive };
    vec![
        t("polirec_status", "Stato di PoliRec", "Versione, numero di corsi, strumenti AI e trascrizione configurati.", json!({}), &[], true, false),
        t("list_courses", "Elenca i corsi", "Corsi configurati con conteggi di lezioni scaricate/trascritte e docenti seguiti.", json!({}), &[], true, false),
        t("list_lessons", "Elenca le lezioni", "Lezioni di un corso in ordine cronologico, con sommario, argomenti e note AI disponibili. Di default solo i docenti seguiti.", json!({ "course": course(), "include_other_teachers": { "type": "boolean", "description": "Includi le lezioni parallele di docenti non seguiti" } }), &["course"], true, false),
        t("get_lesson", "Dettagli lezione", "Metadati, sommario, note AI disponibili e appunti dello studente collegati a una lezione.", json!({ "course": course(), "lesson": lesson() }), &["course", "lesson"], true, false),
        t("get_transcript", "Trascrizione", "Testo della lezione (trascrizione automatica). Le lezioni sono lunghe (~60-100k caratteri): usa offset/max_chars per leggerle a pezzi.", json!({ "course": course(), "lesson": lesson(), "timestamps": { "type": "boolean", "description": "Includi i tempi [hh:mm:ss] per riga" }, "offset": { "type": "integer", "minimum": 0 }, "max_chars": { "type": "integer", "minimum": 1000, "maximum": 200000, "description": "Default 60000" } }), &["course", "lesson"], true, false),
        t("get_course_info", "Scheda del corso", "Scheda breve del corso: descrizione, docenti, modalità d'esame, orario.", json!({ "course": course() }), &["course"], true, false),
        t("get_ai_note", "Nota AI di una lezione", "Legge una nota generata dall'AI (sommario, appunti, riassunto, spiegazione, flashcard, domande).", json!({ "course": course(), "lesson": lesson(), "kind": kind() }), &["course", "lesson", "kind"], true, false),
        t("generate_ai_note", "Genera nota AI", "Genera (o rigenera) una nota AI della lezione con lo strumento AI configurato in PoliRec. Richiede 1-2 minuti.", json!({ "course": course(), "lesson": lesson(), "kind": kind() }), &["course", "lesson", "kind"], false, false),
        t("search", "Ricerca semantica", "Cerca per significato in trascrizioni, slide, sommari e appunti. Restituisce i passaggi più pertinenti con lezione e minuto.", json!({ "query": { "type": "string" }, "course": { "type": "string" }, "k": { "type": "integer", "minimum": 1, "maximum": 50 } }), &["query"], true, false),
        t("ask", "Chiedi al corso", "Risposta con citazioni [n] generata dall'AI di PoliRec usando le fonti del corso (RAG).", json!({ "question": { "type": "string" }, "course": { "type": "string" } }), &["question"], true, false),
        t("list_notes", "Elenca appunti", "Appunti dello studente (Markdown, LaTeX, Typst) di un corso o generali.", json!({ "course": course_opt() }), &[], true, false),
        t("read_note", "Leggi appunto", "Contenuto di un appunto e lezioni collegate.", json!({ "course": course_opt(), "file": { "type": "string" } }), &["file"], true, false),
        t("create_note", "Crea appunto", "Crea un appunto, opzionalmente con contenuto e collegato a una o più lezioni.", json!({ "course": course_opt(), "title": { "type": "string" }, "kind": { "type": "string", "enum": ["markdown", "latex", "typst"] }, "content": { "type": "string" }, "lessons": { "type": "array", "items": { "type": "string" }, "description": "Lezioni del corso da collegare" } }), &["title"], false, false),
        t("update_note", "Modifica appunto", "Sostituisce il contenuto di un appunto o aggiunge testo in fondo.", json!({ "course": course_opt(), "file": { "type": "string" }, "content": { "type": "string" }, "mode": { "type": "string", "enum": ["replace", "append"] } }), &["file", "content"], false, true),
        t("link_note", "Collega appunto a lezioni", "Collega un appunto a una o più lezioni (anche di un altro corso con lesson_course).", json!({ "course": course_opt(), "file": { "type": "string" }, "lessons": { "type": "array", "items": { "type": "string" } }, "lesson_course": { "type": "string" } }), &["file", "lessons"], false, false),
        t("list_todos", "Attività", "Attività da fare di un corso o generali.", json!({ "course": course_opt(), "include_done": { "type": "boolean" } }), &[], true, false),
        t("add_todo", "Aggiungi attività", "Aggiunge un'attività (con scadenza opzionale AAAA-MM-GG).", json!({ "course": course_opt(), "text": { "type": "string" }, "due": { "type": "string" } }), &["text"], false, false),
        t("complete_todo", "Completa attività", "Segna un'attività come fatta (o non fatta) per id o testo.", json!({ "course": course_opt(), "todo": { "type": "string" }, "done": { "type": "boolean" } }), &["todo"], false, false),
        t("timetable", "Orario", "Lezioni in calendario (orario importato in PoliRec) nei prossimi giorni.", json!({ "from": s("AAAA-MM-GG, default oggi"), "days": { "type": "integer", "minimum": 1, "maximum": 60 }, "course": { "type": "string" } }), &[], true, false),
        t("free_rooms", "Aule libere", "Aule libere del Politecnico per una sede, giorno e fascia oraria (dati pubblici).", json!({ "sede": s("Id sede, es. MIA = Città Studi, MIB = Bovisa (vedi list_sedi)"), "date": { "type": "string" }, "from": s("HH:MM, default adesso"), "hours": { "type": "number", "minimum": 0.5, "maximum": 10 } }), &[], true, false),
        t("list_sedi", "Sedi", "Sedi del Politecnico per free_rooms.", json!({}), &[], true, false),
        t("sync_course", "Sincronizza corso", "Cerca e scarica le nuove registrazioni del corso (può aprire Chrome per il login PoliMi e durare vari minuti).", json!({ "course": course(), "limit": { "type": "integer", "minimum": 1 } }), &["course"], false, false),
        t("transcribe", "Trascrivi", "Trascrive in locale le lezioni scaricate e non ancora trascritte (o una sola lezione).", json!({ "course": course(), "lesson": { "type": "string" } }), &["course"], false, false),
    ]
}

/// Tool → daemon method + params.
fn route(name: &str, a: &Value) -> Option<(&'static str, Value)> {
    let g = |k: &str| a.get(k).cloned().unwrap_or(Value::Null);
    Some(match name {
        "polirec_status" => ("api:status", Value::Null),
        "list_courses" => ("api:courses", Value::Null),
        "list_lessons" => ("api:lessons", json!({ "course": g("course"), "all": g("include_other_teachers") })),
        "get_lesson" => ("api:lesson", json!({ "course": g("course"), "lesson": g("lesson") })),
        "get_transcript" => ("api:transcript", json!({ "course": g("course"), "lesson": g("lesson"), "timestamps": g("timestamps"), "offset": a["offset"].as_u64().unwrap_or(0), "maxChars": a["max_chars"].as_u64().unwrap_or(60000) })),
        "get_course_info" => ("api:coursePage", json!({ "course": g("course") })),
        "get_ai_note" => ("api:aiNote", json!({ "course": g("course"), "lesson": g("lesson"), "kind": g("kind") })),
        "generate_ai_note" => ("api:generateAiNote", json!({ "course": g("course"), "lesson": g("lesson"), "kind": g("kind") })),
        "search" => ("api:search", json!({ "query": g("query"), "course": g("course"), "k": a["k"].as_u64().unwrap_or(10) })),
        "ask" => ("api:ask", json!({ "question": g("question"), "course": g("course") })),
        "list_notes" => ("api:notes.list", json!({ "course": g("course") })),
        "read_note" => ("api:notes.read", json!({ "course": g("course"), "file": g("file") })),
        "create_note" => ("api:notes.create", json!({ "course": g("course"), "title": g("title"), "kind": g("kind"), "content": g("content"), "lessons": g("lessons") })),
        "update_note" => ("api:notes.write", json!({ "course": g("course"), "file": g("file"), "content": g("content"), "mode": g("mode") })),
        "link_note" => ("api:notes.link", json!({ "course": g("course"), "file": g("file"), "lessons": g("lessons"), "lessonCourse": g("lesson_course") })),
        "list_todos" => ("api:todos.list", json!({ "course": g("course"), "done": g("include_done") })),
        "add_todo" => ("api:todos.add", json!({ "course": g("course"), "text": g("text"), "due": g("due") })),
        "complete_todo" => ("api:todos.done", json!({ "course": g("course"), "todo": g("todo"), "done": g("done") })),
        "timetable" => ("api:events", json!({ "from": g("from"), "days": a["days"].as_i64().unwrap_or(7), "course": g("course") })),
        "free_rooms" => ("api:freeRooms", json!({ "sede": g("sede"), "date": g("date"), "from": g("from"), "hours": a["hours"].as_f64().unwrap_or(2.0) })),
        "list_sedi" => ("api:sedi", Value::Null),
        "sync_course" => ("api:sync", json!({ "course": g("course"), "limit": g("limit") })),
        "transcribe" => ("api:transcribe", json!({ "course": g("course"), "lesson": g("lesson") })),
        _ => return None,
    })
}

pub async fn run() -> Result<()> {
    let mut client: Option<Client> = None;
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut out = tokio::io::stdout();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Value>();
    // responses can finish out of order (long tool calls): a single writer keeps lines intact
    let writer = tokio::spawn(async move {
        while let Some(v) = rx.recv().await {
            let _ = out.write_all(format!("{v}\n").as_bytes()).await;
            let _ = out.flush().await;
        }
    });
    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        let id = msg.get("id").cloned();
        let method = msg["method"].as_str().unwrap_or("").to_string();
        let Some(id) = id else { continue }; // notifications (initialized, cancelled) need no answer
        let reply = |result: Value| json!({ "jsonrpc": "2.0", "id": id, "result": result });
        match method.as_str() {
            "initialize" => {
                let want = msg["params"]["protocolVersion"].as_str().unwrap_or("");
                let v = PROTOCOLS.iter().find(|p| **p == want).copied().unwrap_or(PROTOCOLS[0]);
                let _ = tx.send(reply(json!({
                    "protocolVersion": v,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": "polirec", "title": "PoliRec", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": INSTRUCTIONS,
                })));
            }
            "ping" => {
                let _ = tx.send(reply(json!({})));
            }
            "tools/list" => {
                let list: Vec<Value> = tools()
                    .into_iter()
                    .map(|t| {
                        json!({
                            "name": t.name, "title": t.title, "description": t.desc,
                            "inputSchema": { "type": "object", "properties": t.props, "required": t.required },
                            "annotations": { "title": t.title, "readOnlyHint": t.read_only, "destructiveHint": t.destructive, "openWorldHint": false },
                        })
                    })
                    .collect();
                let _ = tx.send(reply(json!({ "tools": list })));
            }
            "tools/call" => {
                let name = msg["params"]["name"].as_str().unwrap_or("").to_string();
                let args = msg["params"]["arguments"].clone();
                if client.is_none() {
                    match Client::connect("mcp").await {
                        Ok(c) => client = Some(c),
                        Err(e) => {
                            let _ = tx.send(reply(json!({ "isError": true, "content": [{ "type": "text", "text": format!("✗ {e}") }] })));
                            continue;
                        }
                    }
                }
                let c = client.clone().unwrap();
                let tx = tx.clone();
                tokio::spawn(async move {
                    let res = match route(&name, &args) {
                        None => json!({ "isError": true, "content": [{ "type": "text", "text": format!("✗ Strumento sconosciuto: {name}") }] }),
                        Some((m, p)) => match c.call(m, p).await {
                            Ok(v) => json!({ "content": [{ "type": "text", "text": if let Some(s) = v.as_str() { s.to_string() } else { serde_json::to_string_pretty(&v).unwrap_or_default() } }] }),
                            Err(e) => json!({ "isError": true, "content": [{ "type": "text", "text": format!("✗ {e}") }] }),
                        },
                    };
                    let _ = tx.send(json!({ "jsonrpc": "2.0", "id": id, "result": res }));
                });
            }
            _ => {
                let _ = tx.send(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("Metodo non supportato: {method}") } }));
            }
        }
    }
    drop(tx);
    let _ = writer.await;
    Ok(())
}
