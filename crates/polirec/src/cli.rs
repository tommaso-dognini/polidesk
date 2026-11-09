//! Command line. Read commands accept --json for machine-readable output.
use anyhow::{bail, Result};
use polirec_core::rpc::Client;
use serde_json::{json, Value};
use std::io::{IsTerminal, Read};

const HELP: &str = "PoliRec — riga di comando (stessi dati dell'app, che può restare aperta)

  polirec status                                   stato di app, AI e trascrizione
  polirec list                                     corsi configurati
  polirec courses                                  i tuoi corsi WeBeep (login)
  polirec add <corso> <cartella> [nome] [--materials] [--lang en]
  polirec sync [corso...] [--dry-run] [-j N] [--limit N] [--materials] [--only-materials]
  polirec transcribe [corso...]
  polirec lessons <corso> [--all]                  lezioni con sommario (--all: anche altri docenti)
  polirec lesson <corso> <lezione>                 dettagli (lezione = numero, AAAA-MM-GG o titolo)
  polirec transcript <corso> <lezione> [--timestamps]
  polirec ainote <corso> <lezione> <tipo> [--generate]   tipo: sommario appunti riassunto spiegazione flashcard domande
  polirec search \"<testo>\" [--course X] [-k N]     ricerca semantica
  polirec ask \"<domanda>\" [--course X]             risposta con citazioni
  polirec notes [corso]                            appunti   ·   polirec note <file> [--course X]
  polirec new-note \"<titolo>\" [--course X] [--lesson N]... [--kind markdown|latex|typst]  (contenuto da stdin)
  polirec todo [corso] · todo add \"<testo>\" [--course X] [--due AAAA-MM-GG] · todo done \"<testo|id>\" [--course X]
  polirec timetable [--days N] [--course X]        polirec rooms [--sede MIA] [--from 14:00] [--hours 2]
  polirec mcp                                      server MCP (stdio) per Claude e altri assistenti
  polirec daemon [status|stop]                     server locale polirecd

  aggiungi --json ai comandi di lettura per l'output in JSON";

struct Args(Vec<String>);
impl Args {
    fn flag(&mut self, n: &str) -> Option<String> {
        let i = self.0.iter().position(|a| a == n)?;
        self.0.remove(i);
        (i < self.0.len()).then(|| self.0.remove(i))
    }
    fn bool(&mut self, n: &str) -> bool {
        match self.0.iter().position(|a| a == n) {
            Some(i) => {
                self.0.remove(i);
                true
            }
            None => false,
        }
    }
    fn many(&mut self, n: &str) -> Vec<String> {
        let mut out = vec![];
        while let Some(v) = self.flag(n) {
            out.push(v);
        }
        out
    }
    fn get(&self, i: usize) -> Option<&str> {
        self.0.get(i).map(String::as_str)
    }
    fn rest(&self, from: usize) -> String {
        self.0.get(from..).map(|r| r.join(" ")).unwrap_or_default()
    }
}

fn pretty(x: &Value) -> String {
    match x {
        Value::String(s) => s.clone(),
        Value::Array(a) => a
            .iter()
            .map(|o| match o {
                Value::Object(m) => m
                    .iter()
                    .filter(|(_, v)| !(v.is_null() || v.as_str() == Some("") || v.as_array().map(|a| a.is_empty()).unwrap_or(false)))
                    .map(|(k, v)| {
                        let s = match v {
                            Value::Array(a) => a.iter().map(|x| x.as_str().map(String::from).unwrap_or_else(|| x.to_string())).collect::<Vec<_>>().join(" · "),
                            Value::String(s) => s.clone(),
                            Value::Object(_) => v.to_string(),
                            _ => v.to_string(),
                        };
                        format!("{k}: {s}")
                    })
                    .collect::<Vec<_>>()
                    .join("\n  "),
                Value::String(s) => s.clone(),
                _ => o.to_string(),
            })
            .collect::<Vec<_>>()
            .join("\n\n"),
        _ => serde_json::to_string_pretty(x).unwrap_or_default(),
    }
}

fn read_stdin() -> String {
    let mut s = String::new();
    if !std::io::stdin().is_terminal() {
        let _ = std::io::stdin().read_to_string(&mut s);
    }
    s
}

async fn with_logs<F: std::future::Future<Output = Result<Value>>>(c: &Client, course_id: Option<String>, f: F) -> Result<Value> {
    // print the daemon's log lines (for this course) while the call runs
    let mut ev = c.subscribe().await?;
    let printer = tokio::spawn(async move {
        let mut last: std::collections::HashMap<String, i64> = Default::default();
        while let Some(e) = ev.recv().await {
            let same = course_id.as_deref().map(|id| e["course"].as_str() == Some(id) || e["course"].is_null()).unwrap_or(true);
            match e["type"].as_str() {
                Some("log") if same => println!("{}", e["msg"].as_str().unwrap_or("")),
                Some("progress") if same && std::io::stdout().is_terminal() => {
                    let p = e["percent"].as_f64().unwrap_or(0.0);
                    let k = e["key"].as_str().unwrap_or("").to_string();
                    let step = (p / 10.0).floor() as i64 * 10;
                    if last.get(&k) != Some(&step) {
                        last.insert(k, step);
                        println!("     {:>3}% {}  {}", p.round(), e["speed"].as_str().unwrap_or(""), e["file"].as_str().unwrap_or(""));
                    }
                }
                Some("transcribe-start") => println!("🎙 {}", std::path::Path::new(e["video"].as_str().unwrap_or("")).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default()),
                Some("transcribe-done") => println!("  ✓ fatto"),
                Some("transcribe-error") => println!("  ✗ {}", e["error"].as_str().unwrap_or("")),
                Some("login-required") => print!("\x07"),
                _ => {}
            }
        }
    });
    let r = f.await;
    printer.abort();
    r
}

pub async fn run(argv: Vec<String>) -> Result<()> {
    let mut a = Args(argv);
    if a.0.is_empty() || matches!(a.get(0), Some("help" | "--help" | "-h")) {
        println!("{HELP}");
        return Ok(());
    }
    if matches!(a.get(0), Some("--version" | "-V")) {
        println!("polirec {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    let cmd = a.0.remove(0);
    let json_out = a.bool("--json");
    if cmd == "daemon" {
        return daemon(a.get(0).unwrap_or("status")).await;
    }
    let c = Client::connect("cli").await?;
    let api = |m: &str| format!("api:{m}");
    let out: Value = match cmd.as_str() {
        "status" => c.call(&api("status"), Value::Null).await?,
        "list" => {
            let cs = c.call(&api("courses"), Value::Null).await?;
            if json_out {
                cs
            } else {
                for x in cs.as_array().into_iter().flatten() {
                    println!("{}. {}  [{}/{} video, {} trascritti]\n   {}", x["n"], x["name"].as_str().unwrap_or(""), x["downloaded"], x["lessons"], x["transcribed"], x["dir"].as_str().unwrap_or(""));
                }
                return Ok(());
            }
        }
        "courses" => {
            let mut cs = c.call("webeep:courses", Value::Null).await?.as_array().cloned().unwrap_or_default();
            cs.sort_by_key(|x| std::cmp::Reverse(x["id"].as_i64().unwrap_or(0)));
            if json_out {
                json!(cs)
            } else {
                for x in cs {
                    println!("webeep:{}\t{}", x["id"], x["fullname"].as_str().unwrap_or(""));
                }
                return Ok(());
            }
        }
        "add" => {
            let materials = a.bool("--materials");
            let lang = a.flag("--lang").unwrap_or_default();
            let (Some(input), Some(dir)) = (a.get(0), a.get(1)) else { bail!("uso: add <corso> <cartella> [nome]") };
            let r = c.call(&api("addCourse"), json!({ "input": input, "dir": dir, "name": a.get(2).unwrap_or(""), "materials": materials, "language": lang })).await?;
            println!("Aggiunto: {} → {}", if r["name"].as_str().unwrap_or("").is_empty() { r["input"].as_str().unwrap_or("") } else { r["name"].as_str().unwrap_or("") }, r["dir"].as_str().unwrap_or(""));
            return Ok(());
        }
        "sync" => {
            let dry = a.bool("--dry-run");
            let par: Option<u64> = a.flag("-j").and_then(|x| x.parse().ok());
            let limit: Option<u64> = a.flag("--limit").and_then(|x| x.parse().ok());
            let only = a.bool("--only-materials");
            let mats = a.bool("--materials") || only;
            let courses = c.call(&api("courses"), Value::Null).await?;
            let sel: Vec<Value> = if a.0.is_empty() {
                courses.as_array().cloned().unwrap_or_default()
            } else {
                let mut v = vec![];
                for s in &a.0 {
                    let cs = courses.as_array().cloned().unwrap_or_default();
                    match s.parse::<usize>().ok().and_then(|n| cs.get(n.wrapping_sub(1)).cloned()).or_else(|| cs.iter().find(|x| x["name"].as_str().unwrap_or("").to_lowercase().contains(&s.to_lowercase())).cloned()) {
                        Some(x) => v.push(x),
                        None => eprintln!("✗ corso «{s}» non trovato"),
                    }
                }
                v
            };
            for x in sel {
                let id = x["id"].as_str().unwrap_or("").to_string();
                println!("\n━━ {} ━━", x["name"].as_str().unwrap_or(""));
                let p = json!({ "course": id, "dryRun": dry, "parallel": par, "limit": limit, "materials": if mats { json!(true) } else { Value::Null }, "onlyMaterials": only });
                match with_logs(&c, Some(id.clone()), c.call(&api("sync"), p)).await {
                    Ok(r) => println!("Risultato: {r}"),
                    Err(e) => eprintln!("✗ {e}"),
                }
            }
            return Ok(());
        }
        "transcribe" => {
            let courses = c.call(&api("courses"), Value::Null).await?;
            let list: Vec<String> = if a.0.is_empty() { courses.as_array().into_iter().flatten().filter_map(|x| x["id"].as_str().map(String::from)).collect() } else { a.0.clone() };
            for sel in list {
                let r = with_logs(&c, None, c.call(&api("transcribe"), json!({ "course": sel }))).await?;
                println!("{r}");
            }
            return Ok(());
        }
        "lessons" => c.call(&api("lessons"), json!({ "course": a.get(0), "all": a.bool("--all") })).await?,
        "lesson" => c.call(&api("lesson"), json!({ "course": a.get(0), "lesson": a.get(1) })).await?,
        "transcript" => {
            let ts = a.bool("--timestamps");
            c.call(&api("transcript"), json!({ "course": a.get(0), "lesson": a.get(1), "timestamps": ts })).await?["text"].clone()
        }
        "ainote" => {
            let generate = a.bool("--generate");
            let p = json!({ "course": a.get(0), "lesson": a.get(1), "kind": a.get(2) });
            let r = if generate { with_logs(&c, None, c.call(&api("generateAiNote"), p)).await? } else { c.call(&api("aiNote"), p).await? };
            if r["content"].is_string() { r["content"].clone() } else { r }
        }
        "search" => {
            let course = a.flag("--course");
            let k: u64 = a.flag("-k").and_then(|x| x.parse().ok()).unwrap_or(10);
            c.call(&api("search"), json!({ "query": a.rest(0), "course": course, "k": k })).await?
        }
        "ask" => {
            let course = a.flag("--course");
            let r = c.call(&api("ask"), json!({ "question": a.rest(0), "course": course })).await?;
            if json_out { r } else { json!(format!("{}\n\n{}", r["answer"].as_str().unwrap_or(""), polirec_core::util::str_list(r.get("sources")).join("\n"))) }
        }
        "notes" => c.call(&api("notes.list"), json!({ "course": a.get(0) })).await?,
        "note" => {
            let course = a.flag("--course");
            c.call(&api("notes.read"), json!({ "course": course, "file": a.get(0) })).await?["content"].clone()
        }
        "new-note" => {
            let course = a.flag("--course");
            let kind = a.flag("--kind").unwrap_or_else(|| "markdown".into());
            let lessons = a.many("--lesson");
            c.call(&api("notes.create"), json!({ "course": course, "title": a.rest(0), "kind": kind, "content": read_stdin(), "lessons": lessons })).await?
        }
        "todo" => {
            let course = a.flag("--course");
            let due = a.flag("--due");
            match a.get(0) {
                Some("add") => c.call(&api("todos.add"), json!({ "course": course, "text": a.rest(1), "due": due })).await?,
                Some("done") => c.call(&api("todos.done"), json!({ "course": course, "todo": a.rest(1) })).await?,
                other => c.call(&api("todos.list"), json!({ "course": other.map(String::from).or(course) })).await?,
            }
        }
        "timetable" => {
            let days: i64 = a.flag("--days").and_then(|x| x.parse().ok()).unwrap_or(7);
            let course = a.flag("--course");
            c.call(&api("events"), json!({ "days": days, "course": course })).await?
        }
        "rooms" => {
            let sede = a.flag("--sede").unwrap_or_else(|| "MIA".into());
            let from = a.flag("--from");
            let hours: f64 = a.flag("--hours").and_then(|x| x.parse().ok()).unwrap_or(2.0);
            let r = c.call(&api("freeRooms"), json!({ "sede": sede, "from": from, "hours": hours })).await?;
            if json_out {
                r
            } else {
                let lines: Vec<String> = r["free"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|x| format!("{:<14} {} · {} posti · libera fino {}", x["room"].as_str().unwrap_or(""), x["building"].as_str().unwrap_or(""), x["seats"].as_i64().map(|n| n.to_string()).unwrap_or_else(|| "?".into()), x["freeUntil"].as_str().unwrap_or("")))
                    .collect();
                json!(if lines.is_empty() { "Nessuna aula libera".to_string() } else { lines.join("\n") })
            }
        }
        // raw access to any daemon method: polirec call <method> [json]
        "call" => {
            let params: Value = a.get(1).map(serde_json::from_str).transpose()?.unwrap_or(Value::Null);
            c.call(a.get(0).unwrap_or(""), params).await?
        }
        _ => {
            println!("{HELP}");
            return Ok(());
        }
    };
    if json_out {
        println!("{}", serde_json::to_string_pretty(&out)?);
    } else {
        println!("{}", pretty(&out));
    }
    Ok(())
}

async fn daemon(sub: &str) -> Result<()> {
    match sub {
        "stop" => match polirec_core::rpc::connect_raw().await {
            Ok(_) => {
                let c = Client::connect("cli").await?;
                c.call("daemon:shutdown", Value::Null).await?;
                println!("polirecd fermato");
            }
            Err(_) => println!("polirecd non è attivo"),
        },
        "start" => {
            let c = Client::connect("cli").await?;
            let i = c.call("daemon:info", Value::Null).await?;
            println!("polirecd {} attivo (pid {})", i["version"].as_str().unwrap_or(""), i["pid"]);
        }
        _ => match polirec_core::rpc::connect_raw().await {
            Ok(_) => {
                let c = Client::connect("cli").await?;
                let i = c.call("daemon:info", Value::Null).await?;
                println!("polirecd {} attivo (pid {})\ndati:   {}\nsocket: {}", i["version"].as_str().unwrap_or(""), i["pid"], i["dataDir"].as_str().unwrap_or(""), i["socket"].as_str().unwrap_or(""));
            }
            Err(_) => println!("polirecd non è attivo (parte da solo al primo comando)"),
        },
    }
    Ok(())
}
