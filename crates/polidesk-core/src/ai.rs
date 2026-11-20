//! Notes, summaries and answers through the student's own AI CLI: Antigravity (agy), Claude Code, GitHub Copilot CLI,
//! ChatGPT Codex CLI or OpenCode. Codex and OpenCode can also use local models served by Ollama (nothing leaves the computer).
//! Nothing is sent anywhere by PoliDesk itself: the CLI the student logged into does the work.
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
pub const PROVIDERS: [Provider; 5] = [
    Provider { id: "agy", bin: "agy", label: "Antigravity CLI" },
    Provider { id: "claude", bin: "claude", label: "Claude Code" },
    Provider { id: "copilot", bin: "copilot", label: "GitHub Copilot CLI" },
    Provider { id: "codex", bin: "codex", label: "ChatGPT Codex CLI" },
    Provider { id: "opencode", bin: "opencode", label: "OpenCode" },
];
/// How to install (official installers: a terminal one-liner) and log in, shown when a tool is missing.
pub fn install_hint(id: &str) -> Value {
    let win = cfg!(windows);
    let (unix, windows, login, url) = match id {
        "agy" => ("curl -fsSL https://antigravity.google/cli/install.sh | bash", "irm https://antigravity.google/cli/install.ps1 | iex", "agy", "https://antigravity.google"),
        "claude" => ("curl -fsSL https://claude.ai/install.sh | bash", "irm https://claude.ai/install.ps1 | iex", "claude (poi /login)", "https://claude.com/claude-code"),
        "copilot" => ("curl -fsSL https://gh.io/copilot-install | bash", "winget install GitHub.Copilot", "copilot (poi /login: serve un piano GitHub Copilot, anche Free)", "https://github.com/features/copilot/cli"),
        "codex" => ("npm install -g @openai/codex", "npm install -g @openai/codex", "codex (poi «Sign in with ChatGPT»; con Ollama funziona anche senza account)", "https://developers.openai.com/codex/cli"),
        "opencode" => ("curl -fsSL https://opencode.ai/install | bash", "npm install -g opencode-ai", "opencode auth login (oppure solo i modelli locali di Ollama, senza account)", "https://opencode.ai"),
        _ => return Value::Null,
    };
    json!({ "cmd": if win { windows } else { unix }, "shell": if win { "PowerShell" } else { "Terminale" }, "login": login, "url": url })
}
/// Pick order when the chosen tool is not installed.
pub const ORDER: [&str; 5] = ["agy", "claude", "copilot", "codex", "opencode"];
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
    Value::Object(PROVIDERS.iter().map(|p| (p.id.to_string(), json!({ "bin": p.bin, "label": p.label, "path": tools::which(p.bin), "install": install_hint(p.id) }))).collect())
}

/// Provider to use: the one chosen in settings if installed, otherwise the first installed one.
pub fn pick(settings: &Value) -> Result<String> {
    let want = util::s(&settings["ai"], "provider");
    if let Ok(p) = provider(want) {
        if tools::which(p.bin).is_some() {
            return Ok(want.to_string());
        }
    }
    for id in ORDER {
        if tools::which(provider(id)?.bin).is_some() {
            return Ok(id.to_string());
        }
    }
    bail!("Nessuno strumento AI installato: installa Antigravity CLI, Claude Code, GitHub Copilot CLI, ChatGPT Codex CLI o OpenCode da Impostazioni → AI")
}
pub fn label(id: &str) -> &'static str {
    provider(id).map(|p| p.label).unwrap_or("AI")
}
pub fn installed(id: &str) -> bool {
    provider(id).map(|p| tools::which(p.bin).is_some()).unwrap_or(false)
}

/// Model chosen for a tool ("" = the CLI's default). `ai.model` is the old single setting, valid for `ai.provider`.
pub fn model_for(settings: &Value, provider_id: &str) -> String {
    let ai = &settings["ai"];
    if let Some(m) = ai["models"].get(provider_id).and_then(Value::as_str) {
        return m.to_string();
    }
    if util::s(ai, "provider") == provider_id {
        return util::s(ai, "model").to_string();
    }
    String::new()
}

// ───────── local models (Ollama) ─────────

/// Models installed in Ollama (empty if Ollama is not running).
pub async fn ollama_models() -> Vec<String> {
    let r = crate::net::client().get("http://127.0.0.1:11434/api/tags").timeout(std::time::Duration::from_secs(2)).send().await;
    let Ok(r) = r else { return vec![] };
    let v: Value = r.json().await.unwrap_or(Value::Null);
    v["models"].as_array().into_iter().flatten().filter_map(|m| m["name"].as_str().map(String::from)).collect()
}
/// OpenCode config with the Ollama models, passed with OPENCODE_CONFIG (merged with the student's own
/// config, which is never touched).
async fn opencode_config() -> Option<std::path::PathBuf> {
    let models = ollama_models().await;
    if models.is_empty() {
        return None;
    }
    let p = crate::paths::app_dir().join("opencode-ollama.json");
    let cfg = json!({
        "$schema": "https://opencode.ai/config.json",
        "provider": { "ollama": {
            "npm": "@ai-sdk/openai-compatible", "name": "Ollama (locale)",
            "options": { "baseURL": "http://127.0.0.1:11434/v1" },
            "models": Value::Object(models.iter().map(|m| (m.clone(), json!({ "name": m }))).collect()),
        } },
    });
    util::write_json(&p, &cfg).ok()?;
    Some(p)
}
/// Codex model id "ollama:<name>" = local model through Codex's open-source provider.
fn model_args(provider_id: &str, model: &str) -> Vec<String> {
    if model.is_empty() {
        return vec![];
    }
    match (provider_id, model.strip_prefix("ollama:")) {
        ("codex", Some(m)) => ["--oss", "--local-provider", "ollama", "-c", "model_provider=ollama", "-m", m].iter().map(|s| s.to_string()).collect(),
        _ => vec!["--model".into(), model.into()],
    }
}
fn strip_ansi(s: &str) -> String {
    use regex::Regex;
    use std::sync::LazyLock;
    static ANSI: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").unwrap());
    ANSI.replace_all(s, "").into_owned()
}

/// Models a tool offers: [{ id, label, group }]. Models of the same `group` share one quota
/// (Antigravity: Gemini models / Claude and GPT models), so on a quota error a model of another group still works.
pub async fn models(provider_id: &str) -> Value {
    use std::sync::{LazyLock, Mutex};
    static CACHE: LazyLock<Mutex<std::collections::HashMap<String, (i64, Value)>>> = LazyLock::new(Default::default);
    if let Some((at, v)) = CACHE.lock().unwrap().get(provider_id) {
        if util::now_ms() - at < 30 * 60_000 {
            return v.clone();
        }
    }
    let list: Vec<Value> = match provider_id {
        "agy" => {
            let out = match tools::which("agy") {
                Some(bin) => tokio::time::timeout(std::time::Duration::from_secs(30), tools::command(bin).arg("models").stdin(Stdio::null()).output()).await.ok().and_then(|r| r.ok()),
                None => None,
            };
            let text = out.map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
            text.lines()
                .filter_map(|l| l.split_once('\t'))
                .map(|(id, label)| (id.trim(), label.trim()))
                .filter(|(id, _)| !id.is_empty() && !id.contains(' '))
                .map(|(id, label)| json!({ "id": id, "label": label, "group": if id.starts_with("gemini") { "Gemini" } else { "Claude e GPT" } }))
                .collect()
        }
        // aliases that Claude Code keeps pointing at the latest model of each family
        "claude" => [("sonnet", "Sonnet (ultimo)"), ("opus", "Opus (ultimo)"), ("haiku", "Haiku (ultimo)")].iter().map(|(id, l)| json!({ "id": id, "label": l, "group": id })).collect(),
        "copilot" => vec![json!({ "id": "auto", "label": "Auto (sceglie Copilot)", "group": "copilot" })],
        // the ChatGPT account's models (default) + local Ollama models
        "codex" => {
            let mut v = vec![json!({ "id": "gpt-5-codex", "label": "GPT-5 Codex", "group": "ChatGPT" }), json!({ "id": "gpt-5", "label": "GPT-5", "group": "ChatGPT" })];
            v.extend(ollama_models().await.into_iter().map(|m| json!({ "id": format!("ollama:{m}"), "label": format!("{m} (locale)"), "group": "Ollama, sul tuo computer" })));
            v
        }
        // `opencode models`: every provider the student configured, plus Ollama's local models
        "opencode" => {
            let cfg = opencode_config().await;
            let out = match tools::which("opencode") {
                Some(bin) => {
                    let mut c = tools::command(bin);
                    c.arg("models").stdin(Stdio::null());
                    if let Some(p) = &cfg {
                        c.env("OPENCODE_CONFIG", p);
                    }
                    tokio::time::timeout(std::time::Duration::from_secs(30), c.output()).await.ok().and_then(|r| r.ok())
                }
                None => None,
            };
            let text = out.map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
            let mut v: Vec<Value> = strip_ansi(&text)
                .lines()
                .map(str::trim)
                .filter_map(|l| l.split_once('/').map(|(p, m)| (l, p, m)))
                .filter(|(l, _, _)| !l.contains(' '))
                .map(|(l, p, m)| {
                    let local = p == "ollama";
                    json!({ "id": l, "label": if local { format!("{m} (locale)") } else { m.to_string() }, "group": if local { "Ollama, sul tuo computer".to_string() } else { p.to_string() } })
                })
                .collect();
            // local models first: free and private
            v.sort_by_key(|m| util::s(m, "group") != "Ollama, sul tuo computer");
            v
        }
        _ => vec![],
    };
    let v = json!(list);
    if !list.is_empty() {
        CACHE.lock().unwrap().insert(provider_id.to_string(), (util::now_ms(), v.clone()));
    }
    v
}

/// Quota / rate limit / login problems of an AI CLI: { kind: "quota" | "auth", resetsInSec? }.
/// Then retrying is pointless: the queue pauses and the student picks another tool.
pub fn limit_info(err: &str) -> Option<Value> {
    use regex::Regex;
    use std::sync::LazyLock;
    static QUOTA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)quota|rate.?limit|usage limit|limit (reached|exceeded)|too many requests|\b429\b|resource.?exhausted|insufficient (credit|balance)|credit balance|upgrade your (plan|subscription)|out of credits|exceeded your").unwrap());
    static AUTH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)not (logged|signed) in|please (log ?in|sign ?in|authenticate)|login required|unauthori[sz]ed|\b401\b|invalid api key|authentication (failed|required)|no (valid )?credentials").unwrap());
    static RESET: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)(?:resets?|try again|retry) in\s*(?:(\d+)\s*d(?:ays?)?)?\s*(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?)?)?").unwrap());
    let kind = if QUOTA.is_match(err) { "quota" } else if AUTH.is_match(err) { "auth" } else { return None };
    let mut v = json!({ "kind": kind });
    if let Some(m) = RESET.captures(err) {
        let n = |i: usize| m.get(i).and_then(|x| x.as_str().parse::<i64>().ok()).unwrap_or(0);
        let secs = n(1) * 86400 + n(2) * 3600 + n(3) * 60 + n(4);
        if secs > 0 {
            v["resetsInSec"] = json!(secs);
        }
    }
    Some(v)
}

async fn run(p: &Provider, args: Vec<String>, cwd: &Path, stdin_text: &str, on_chunk: OnChunk<'_>, ok_empty: bool) -> Result<String> {
    let bin = tools::which(p.bin).ok_or_else(|| anyhow!("{} non trovato nel PATH", p.label))?;
    let mut c = tools::command(bin);
    if p.id == "opencode" {
        if let Some(cfg) = opencode_config().await {
            c.env("OPENCODE_CONFIG", cfg);
        }
    }
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
        "copilot" => {
            // text only: inline the input, no shell and no file writes, never wait for the user
            let full = if stdin.is_empty() { prompt.to_string() } else { format!("{prompt}\n\n<trascrizione>\n{stdin}\n</trascrizione>") };
            stdin.clear();
            vec!["-p".into(), full, "-s".into(), "--no-ask-user".into(), "--deny-tool=shell".into(), "--deny-tool=write".into()]
        }
        // read-only sandbox, no session saved; the text arrives on stdin (appended as a <stdin> block)
        "codex" => vec!["exec".into(), "--skip-git-repo-check".into(), "--sandbox".into(), "read-only".into(), "--color".into(), "never".into(), "--ephemeral".into()],
        "opencode" => {
            let full = if stdin.is_empty() { prompt.to_string() } else { format!("{prompt}\n\n<trascrizione>\n{stdin}\n</trascrizione>") };
            stdin.clear();
            let mut a = vec!["run".to_string()];
            a.extend(model_args(p.id, model));
            a.push(full);
            a
        }
        _ => vec!["-p".into(), prompt.into()],
    };
    match p.id {
        "opencode" => {}
        "codex" => {
            args.extend(model_args(p.id, model));
            args.push(prompt.into());
        }
        _ => args.extend(model_args(p.id, model)),
    }
    let out = run(p, args, cwd, &stdin, on_chunk, false).await?;
    Ok(format!("{}\n", strip_ansi(&out).trim()))
}

/// Agentic run inside the course folder: the CLI may read transcripts/slides and write files.
pub async fn run_agent(provider_id: &str, prompt: &str, course_dir: &Path, model: &str, on_chunk: OnChunk<'_>) -> Result<String> {
    let p = provider(provider_id)?;
    let mut args: Vec<String> = match p.id {
        "claude" => vec!["-p", prompt, "--permission-mode", "acceptEdits", "--allowedTools", "Read,Glob,Grep,Write,Edit"].into_iter().map(String::from).collect(),
        "agy" => vec!["-p", prompt, "--mode", "accept-edits"].into_iter().map(String::from).collect(),
        // may read and write in the course folder only
        "codex" => vec!["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--color", "never", "--ephemeral"].into_iter().map(String::from).collect(),
        "opencode" => vec!["run".to_string()],
        _ => vec!["-p", prompt, "-s", "--no-ask-user", "--allow-all-tools", "--deny-tool=shell"].into_iter().map(String::from).collect(),
    };
    args.extend(model_args(p.id, model));
    if matches!(p.id, "codex" | "opencode") {
        args.push(prompt.into());
    }
    run(p, args, course_dir, "", on_chunk, true).await.map(|o| strip_ansi(&o))
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits() {
        let e = "Antigravity CLI exit 3: error: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 157h40m36s.";
        let v = limit_info(e).unwrap();
        assert_eq!(v["kind"], "quota");
        assert_eq!(v["resetsInSec"], 157 * 3600 + 40 * 60 + 36);
        assert_eq!(limit_info("Claude Code exit 1: Invalid API key · Please run /login").unwrap()["kind"], "auth");
        assert_eq!(limit_info("429 Too Many Requests, try again in 30s").unwrap()["resetsInSec"], 30);
        assert!(limit_info("exit 1: transcript too long").is_none());
    }
    #[test]
    fn model_per_tool() {
        let s = json!({ "ai": { "provider": "agy", "model": "old", "models": { "claude": "opus" } } });
        assert_eq!(model_for(&s, "claude"), "opus");
        assert_eq!(model_for(&s, "agy"), "old"); // legacy single setting
        assert_eq!(model_for(&s, "copilot"), "");
    }
}

#[cfg(test)]
mod local_tests {
    use super::*;
    /// Needs Codex, OpenCode and Ollama with a model: `cargo test -p polidesk-core local_ai -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn local_ai() {
        let m = ollama_models().await;
        let local = m.first().expect("un modello in Ollama").clone();
        for p in ["codex", "opencode"] {
            let list = models(p).await;
            println!("{p}: {} modelli, locali: {:?}", list.as_array().unwrap().len(), list.as_array().unwrap().iter().filter(|x| util::s(x, "group").starts_with("Ollama")).map(|x| util::s(x, "id").to_string()).collect::<Vec<_>>());
            let id = if p == "codex" { format!("ollama:{local}") } else { format!("ollama/{local}") };
            let out = run_prompt(p, "Rispondi con una sola frase in italiano: di cosa parla il testo?", "Oggi parliamo di integrali e somme di Riemann.", &id, &std::env::temp_dir(), &|_| {}).await.unwrap();
            println!("{p} → {}", out.trim());
            assert!(!out.trim().is_empty());
        }
    }
}
