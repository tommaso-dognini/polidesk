//! Notes, summaries and answers through the student's own AI CLI: Antigravity (agy), Claude Code or Gemini CLI.
//! Nothing is sent anywhere by PoliRec itself: the CLI the student logged into does the work.
use crate::{tools, util};
use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};
use std::path::Path;
use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub type OnChunk<'a> = &'a (dyn Fn(String) + Send + Sync);

pub struct Provider {
    pub id: &'static str,
    pub bin: &'static str,
    pub label: &'static str,
}
pub const PROVIDERS: [Provider; 3] = [
    Provider { id: "claude", bin: "claude", label: "Claude Code" },
    Provider { id: "agy", bin: "agy", label: "Antigravity CLI" },
    Provider { id: "gemini", bin: "gemini", label: "Gemini CLI" },
];
fn provider(id: &str) -> Result<&'static Provider> {
    PROVIDERS.iter().find(|p| p.id == id).ok_or_else(|| anyhow!("Provider sconosciuto: {id}"))
}

pub struct Template {
    pub id: &'static str,
    pub label: &'static str,
    pub suffix: &'static str,
    pub prompt: &'static str,
}
pub const TEMPLATES: [Template; 6] = [
    Template {
        id: "sommario",
        label: "Sommario breve (per l'indice)",
        suffix: "sommario",
        prompt: "Riceverai la trascrizione automatica di una lezione universitaria. Scrivi in Markdown, nella lingua della lezione:\n1. UNA frase (max 30 parole) che descrive di cosa tratta la lezione;\n2. da 3 a 6 bullet (\"- \") con gli argomenti principali, max 12 parole ciascuno.\nNiente titoli, niente introduzioni, niente altro testo.",
    },
    Template {
        id: "appunti",
        label: "Appunti strutturati",
        suffix: "appunti",
        prompt: "Sei un tutor universitario del Politecnico di Milano. Riceverai la trascrizione automatica di una lezione, che può contenere errori di riconoscimento vocale.\nScrivi APPUNTI COMPLETI e ben strutturati in Markdown, nella stessa lingua della lezione:\n- titolo, poi indice degli argomenti;\n- sezioni con titoli, definizioni, formule in LaTeX ($...$ / $$...$$), passaggi chiave, esempi fatti dal docente;\n- correggi gli errori evidenti della trascrizione usando il contesto, senza inventare contenuti;\n- segnala con \"⚠️ Da verificare\" i punti poco chiari;\n- chiudi con \"Punti chiave\" (5-10 bullet) e \"Possibili domande d'esame\".\nRispondi SOLO con il Markdown degli appunti.",
    },
    Template {
        id: "riassunto",
        label: "Riassunto breve",
        suffix: "riassunto",
        prompt: "Riceverai la trascrizione automatica di una lezione universitaria. Scrivi un RIASSUNTO in Markdown (max ~1 pagina), nella lingua della lezione: argomenti trattati, concetti principali, collegamenti con lezioni precedenti/successive se menzionati. Rispondi SOLO con il Markdown.",
    },
    Template {
        id: "spiegazione",
        label: "Spiegazione dei concetti difficili",
        suffix: "spiegazione",
        prompt: "Riceverai la trascrizione automatica di una lezione universitaria. Individua i 3-6 concetti più difficili e spiegali in modo chiaro e intuitivo in Markdown, nella lingua della lezione: intuizione, formalizzazione (LaTeX), esempio numerico o pratico, errori comuni. Rispondi SOLO con il Markdown.",
    },
    Template {
        id: "domande",
        label: "Domande d'esame",
        suffix: "domande",
        prompt: "Riceverai la trascrizione automatica di una lezione universitaria. Scrivi 8-12 possibili DOMANDE D'ESAME sugli argomenti della lezione, nella lingua della lezione, dalle più semplici alle più impegnative (teoria, dimostrazioni/derivazioni, esercizi). Per ognuna una traccia di risposta. Formato Markdown esatto:\n### D: domanda\nR: traccia di risposta (punti chiave, formule in LaTeX)\nRispondi SOLO con il Markdown.",
    },
    Template {
        id: "flashcard",
        label: "Flashcard / domande",
        suffix: "flashcard",
        prompt: "Riceverai la trascrizione automatica di una lezione universitaria. Crea 15-25 flashcard in Markdown per ripassare, nella lingua della lezione, nel formato:\n### D: domanda\nR: risposta concisa\nIncludi sia domande teoriche sia di applicazione. Rispondi SOLO con il Markdown.",
    },
];
pub fn template(id: &str) -> &'static Template {
    TEMPLATES.iter().find(|t| t.id == id).unwrap_or(&TEMPLATES[1])
}
pub fn template_labels() -> Value {
    Value::Object(TEMPLATES.iter().map(|t| (t.id.to_string(), json!(t.label))).collect())
}

pub fn available() -> Value {
    Value::Object(PROVIDERS.iter().map(|p| (p.id.to_string(), json!({ "bin": p.bin, "label": p.label, "path": tools::which(p.bin) }))).collect())
}

/// Provider to use: the one chosen in settings if installed, otherwise the first installed one.
pub fn pick(settings: &Value) -> Result<String> {
    let want = util::s(&settings["ai"], "provider");
    if let Ok(p) = provider(want) {
        if tools::which(p.bin).is_some() {
            return Ok(want.to_string());
        }
    }
    for id in ["agy", "claude", "gemini"] {
        if tools::which(provider(id)?.bin).is_some() {
            return Ok(id.to_string());
        }
    }
    bail!("Nessuno strumento AI installato: installa Antigravity CLI, Claude Code o Gemini CLI e sceglilo in Impostazioni → AI")
}

async fn run(p: &Provider, args: Vec<String>, cwd: &Path, stdin_text: &str, on_chunk: OnChunk<'_>, ok_empty: bool) -> Result<String> {
    let bin = tools::which(p.bin).ok_or_else(|| anyhow!("{} non trovato nel PATH", p.label))?;
    let mut c = tools::command(bin);
    c.args(&args).current_dir(cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = c.spawn()?;
    let mut stdin = child.stdin.take().unwrap();
    let input = stdin_text.to_string();
    let writer = async move {
        let _ = stdin.write_all(input.as_bytes()).await;
        drop(stdin);
    };
    let mut so = child.stdout.take().unwrap();
    let mut se = child.stderr.take().unwrap();
    let reader = async {
        let mut out = Vec::new();
        let mut buf = vec![0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            let n = so.read(&mut buf).await.unwrap_or(0);
            if n == 0 {
                break;
            }
            out.extend_from_slice(&buf[..n]);
            pending.extend_from_slice(&buf[..n]);
            // emit only complete UTF-8 sequences
            let valid = match std::str::from_utf8(&pending) {
                Ok(_) => pending.len(),
                Err(e) => e.valid_up_to(),
            };
            if valid > 0 {
                on_chunk(String::from_utf8_lossy(&pending[..valid]).into_owned());
                pending.drain(..valid);
            }
        }
        String::from_utf8_lossy(&out).into_owned()
    };
    let err_reader = async {
        let mut s = String::new();
        let _ = se.read_to_string(&mut s).await;
        s
    };
    let (_, out, err) = tokio::join!(writer, reader, err_reader);
    let st = child.wait().await?;
    if st.success() && (ok_empty || !out.trim().is_empty()) {
        Ok(out)
    } else {
        let msg = if err.trim().is_empty() { &out } else { &err };
        bail!("{} exit {}: {}", p.label, st.code().unwrap_or(-1), util::tail(msg, 500))
    }
}

/// Pure text-in / markdown-out run: text on stdin (inlined for agy), prompt as argument, no tools.
pub async fn run_prompt(provider_id: &str, prompt: &str, stdin_text: &str, model: &str, cwd: &Path, on_chunk: OnChunk<'_>) -> Result<String> {
    let p = provider(provider_id)?;
    let mut stdin = stdin_text.to_string();
    let mut args: Vec<String> = match p.id {
        "claude" => vec!["-p".into(), prompt.into(), "--output-format".into(), "text".into()],
        "agy" => {
            // agy's print mode does not read stdin as text: inline it in the prompt
            let full = if stdin.is_empty() { prompt.to_string() } else { format!("{prompt}\n\n<trascrizione>\n{stdin}\n</trascrizione>") };
            stdin.clear();
            vec!["-p".into(), full, "--output-format".into(), "text".into()]
        }
        _ => vec!["-p".into(), prompt.into()],
    };
    if !model.is_empty() {
        args.push(if p.id == "gemini" { "-m".into() } else { "--model".into() });
        args.push(model.into());
    }
    let out = run(p, args, cwd, &stdin, on_chunk, false).await?;
    Ok(format!("{}\n", out.trim()))
}

/// Agentic run inside the course folder: the CLI may read transcripts/slides and write files.
pub async fn run_agent(provider_id: &str, prompt: &str, course_dir: &Path, model: &str, on_chunk: OnChunk<'_>) -> Result<String> {
    let p = provider(provider_id)?;
    let mut args: Vec<String> = match p.id {
        "claude" => vec!["-p", prompt, "--permission-mode", "acceptEdits", "--allowedTools", "Read,Glob,Grep,Write,Edit"].into_iter().map(String::from).collect(),
        "agy" => vec!["-p", prompt, "--mode", "accept-edits"].into_iter().map(String::from).collect(),
        _ => vec!["-p", prompt, "--approval-mode", "auto_edit"].into_iter().map(String::from).collect(),
    };
    if !model.is_empty() {
        args.push(if p.id == "gemini" { "-m".into() } else { "--model".into() });
        args.push(model.into());
    }
    run(p, args, course_dir, "", on_chunk, true).await
}

/// Generate a note for one transcript and save it in <course>/note/. Returns the file name.
pub async fn generate_note(provider_id: &str, model: &str, template_id: &str, transcript: &Path, notes_dir: &Path, title: &str, on_chunk: OnChunk<'_>) -> Result<String> {
    let t = template(template_id);
    let text = tokio::fs::read_to_string(transcript).await?;
    let header = if title.is_empty() { String::new() } else { format!("Lezione: {title}\n\n") };
    tokio::fs::create_dir_all(notes_dir).await?;
    let md = run_prompt(provider_id, t.prompt, &format!("{header}{text}"), model, notes_dir, on_chunk).await?;
    let name = transcript.file_name().unwrap().to_string_lossy().to_string();
    let stem = ["txt", "srt", "vtt", "json"].iter().find_map(|e| name.strip_suffix(&format!(".{e}"))).unwrap_or(&name).to_string();
    let file = format!("{stem} - {}.md", t.suffix);
    tokio::fs::write(notes_dir.join(&file), md).await?;
    Ok(file)
}
