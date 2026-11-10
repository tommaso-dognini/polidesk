//! Note-app integrations: Notion (official API), Apple Notes (AppleScript, macOS),
//! Goodnotes/Notability (PDF hand-off), Obsidian (obsidian:// URI when the file is in a vault).
use crate::{net, util};
use anyhow::{anyhow, bail, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

// ───────── Notion ─────────
const NOTION: &str = "https://api.notion.com/v1";

pub fn page_id_from(s: &str) -> Option<String> {
    static END: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)([0-9a-f]{32})(?:\?|$|#)").unwrap());
    static ANY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)([0-9a-f]{32})").unwrap());
    let t = s.replace('-', "");
    END.captures(&t).or_else(|| ANY.captures(&t)).map(|m| m[1].to_string())
}

async fn notion(token: &str, method: reqwest::Method, url: &str, body: Option<Value>) -> Result<Value> {
    let mut rq = net::client().request(method, format!("{NOTION}{url}")).bearer_auth(token).header("Notion-Version", "2022-06-28");
    if let Some(b) = body {
        rq = rq.json(&b);
    }
    let r = rq.send().await?;
    let status = r.status();
    let j: Value = r.json().await.unwrap_or(json!({}));
    if !status.is_success() {
        let msg = if util::s(&j, "message").is_empty() { status.as_u16().to_string() } else { util::s(&j, "message").to_string() };
        bail!("Notion: {msg}{}", if status.as_u16() == 404 { " — condividi la pagina con l'integrazione (••• → Connessioni)" } else { "" });
    }
    Ok(j)
}

fn chunks(s: &str, n: usize) -> Vec<String> {
    let c: Vec<char> = s.chars().collect();
    if c.is_empty() {
        return vec![String::new()];
    }
    c.chunks(n).map(|x| x.iter().collect()).collect()
}

/// Inline markdown → Notion rich_text (bold, italic, code, links, $math$).
pub fn rich_text(s: &str) -> Vec<Value> {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\$[^$\n]+\$)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))").unwrap());
    static LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap());
    let mut out = vec![];
    let push = |out: &mut Vec<Value>, content: &str, ann: Value, link: Option<&str>| {
        for c in chunks(content, 1900) {
            if c.is_empty() && !content.is_empty() {
                continue;
            }
            out.push(json!({ "type": "text", "text": { "content": c, "link": link.map(|u| json!({ "url": u })) }, "annotations": ann }));
        }
    };
    let mut last = 0;
    for m in RX.captures_iter(s) {
        let all = m.get(0).unwrap();
        if all.start() > last {
            push(&mut out, &s[last..all.start()], json!({}), None);
        }
        let t = all.as_str();
        let inner = |a: usize, b: usize| &t[a..t.len() - b];
        if m.get(1).is_some() {
            out.push(json!({ "type": "equation", "equation": { "expression": inner(1, 1) } }));
        } else if m.get(2).is_some() {
            push(&mut out, inner(2, 2), json!({ "bold": true }), None);
        } else if m.get(3).is_some() {
            push(&mut out, inner(1, 1), json!({ "italic": true }), None);
        } else if m.get(4).is_some() {
            push(&mut out, inner(1, 1), json!({ "code": true }), None);
        } else if let Some(l) = LINK.captures(t) {
            let url = l.get(2).unwrap().as_str();
            push(&mut out, &l[1], json!({}), (url.starts_with("http:") || url.starts_with("https:")).then_some(url));
        }
        last = all.end();
    }
    if last < s.len() {
        push(&mut out, &s[last..], json!({}), None);
    }
    if out.is_empty() {
        out.push(json!({ "type": "text", "text": { "content": "" } }));
    }
    out
}

/// Markdown → Notion blocks (headings, lists, todos, quotes, code, $$equations$$, dividers, paragraphs).
pub fn md_to_blocks(md: &str) -> Vec<Value> {
    static H13: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(#{1,3})\s+(.*)").unwrap());
    static H46: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^#{4,6}\s+(.*)").unwrap());
    static TODO: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*[-*]\s+\[([ xX])\]\s+(.*)").unwrap());
    static UL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*[-*•]\s+(.*)").unwrap());
    static OL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*\d+[.)]\s+(.*)").unwrap());
    static QUOTE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^>\s?(.*)").unwrap());
    static HR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(-{3,}|\*{3,})$").unwrap());
    static BREAK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(#|\s*[-*•]\s|\s*\d+[.)]\s|>|```|\$\$)").unwrap());
    static LANG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(python|javascript|java|c|c\+\+|latex|bash|json|markdown|typescript|sql|r|matlab)$").unwrap());
    let md = md.replace('\r', "");
    let lines: Vec<&str> = md.split('\n').collect();
    let mut blocks = vec![];
    let mut b = |t: &str, data: Value| blocks.push(json!({ "object": "block", "type": t, t: data }));
    let mut i = 0;
    while i < lines.len() {
        let l = lines[i];
        if l.trim().is_empty() {
            i += 1;
            continue;
        }
        if let Some(rest) = l.strip_prefix("```") {
            let lang = if rest.trim().is_empty() { "plain text".to_string() } else { rest.trim().to_string() };
            let mut code = vec![];
            i += 1;
            while i < lines.len() && !lines[i].starts_with("```") {
                code.push(lines[i]);
                i += 1;
            }
            let rt: Vec<Value> = rich_text(&code.join("\n")).into_iter().map(|mut r| { r["annotations"] = json!({}); r }).collect();
            b("code", json!({ "language": if LANG.is_match(&lang) { lang.to_lowercase() } else { "plain text".into() }, "rich_text": rt }));
            i += 1;
            continue;
        }
        if l.trim().starts_with("$$") {
            let mut expr = l.trim()[2..].to_string();
            if expr.ends_with("$$") {
                expr.truncate(expr.len() - 2);
            } else {
                i += 1;
                while i < lines.len() && !lines[i].trim().ends_with("$$") {
                    expr += &format!("\n{}", lines[i]);
                    i += 1;
                }
                if i < lines.len() {
                    let t = lines[i].trim();
                    expr += &format!("\n{}", &t[..t.len() - 2]);
                }
            }
            b("equation", json!({ "expression": expr.trim() }));
            i += 1;
            continue;
        }
        if let Some(m) = H13.captures(l) {
            b(&format!("heading_{}", m[1].len()), json!({ "rich_text": rich_text(&m[2]) }));
        } else if let Some(m) = H46.captures(l) {
            b("heading_3", json!({ "rich_text": rich_text(&m[1]) }));
        } else if let Some(m) = TODO.captures(l) {
            b("to_do", json!({ "checked": &m[1] != " ", "rich_text": rich_text(&m[2]) }));
        } else if let Some(m) = UL.captures(l) {
            b("bulleted_list_item", json!({ "rich_text": rich_text(&m[1]) }));
        } else if let Some(m) = OL.captures(l) {
            b("numbered_list_item", json!({ "rich_text": rich_text(&m[1]) }));
        } else if let Some(m) = QUOTE.captures(l) {
            b("quote", json!({ "rich_text": rich_text(&m[1]) }));
        } else if HR.is_match(l.trim()) {
            b("divider", json!({}));
        } else {
            let mut para = l.to_string();
            while i + 1 < lines.len() && !lines[i + 1].trim().is_empty() && !BREAK.is_match(lines[i + 1]) {
                i += 1;
                para += &format!(" {}", lines[i].trim());
            }
            b("paragraph", json!({ "rich_text": rich_text(&para) }));
        }
        i += 1;
    }
    blocks
}

pub async fn export_to_notion(token: &str, parent: &str, title: &str, markdown: &str, kind: &str) -> Result<String> {
    if token.is_empty() {
        bail!("Configura il token Notion in Impostazioni → Integrazioni");
    }
    let pid = page_id_from(parent).ok_or_else(|| anyhow!("Configura la pagina Notion di destinazione in Impostazioni → Integrazioni"))?;
    let blocks: Vec<Value> = if kind == "markdown" {
        md_to_blocks(markdown)
    } else {
        let mut v = vec![json!({ "object": "block", "type": "callout", "callout": { "icon": { "emoji": "📄" }, "rich_text": rich_text(&format!("Sorgente {} esportata da PoliDesk", if kind == "latex" { "LaTeX" } else { "Typst" })) } })];
        v.extend(chunks(markdown, 1900).into_iter().map(|c| json!({ "object": "block", "type": "code", "code": { "language": if kind == "latex" { "latex" } else { "plain text" }, "rich_text": [{ "type": "text", "text": { "content": c } }] } })));
        v
    };
    let first: Vec<Value> = blocks.iter().take(100).cloned().collect();
    let page = notion(token, reqwest::Method::POST, "/pages", Some(json!({
        "parent": { "page_id": pid }, "icon": { "emoji": "📝" },
        "properties": { "title": { "title": [{ "type": "text", "text": { "content": util::take(title, 200) } }] } },
        "children": first,
    }))).await?;
    for ch in blocks[blocks.len().min(100)..].chunks(100) {
        notion(token, reqwest::Method::PATCH, &format!("/blocks/{}/children", util::s(&page, "id")), Some(json!({ "children": ch }))).await?;
    }
    Ok(util::s(&page, "url").to_string())
}

pub async fn test_notion(token: &str, parent: &str) -> Result<String> {
    let pid = page_id_from(parent).ok_or_else(|| anyhow!("Link della pagina non valido"))?;
    let p = notion(token, reqwest::Method::GET, &format!("/pages/{pid}"), None).await?;
    let t = p["properties"].as_object().and_then(|m| m.values().find(|x| util::s(x, "type") == "title")).map(|t| t["title"].as_array().into_iter().flatten().map(|x| util::s(x, "plain_text")).collect::<String>()).unwrap_or_default();
    Ok(if t.is_empty() { "pagina".into() } else { t })
}

// ───────── Apple Notes (macOS) ─────────
pub async fn export_to_apple_notes(title: &str, html: &str) -> Result<bool> {
    if !cfg!(target_os = "macos") {
        bail!("Note di Apple è disponibile solo su macOS");
    }
    let f = std::env::temp_dir().join(format!("polidesk-note-{}.html", util::now_ms()));
    std::fs::write(&f, format!("<h1>{}</h1>{html}", title.replace('<', "&lt;")))?;
    let script = format!("set b to read POSIX file \"{}\" as «class utf8»\ntell application \"Notes\"\n  activate\n  make new note with properties {{body:b}}\nend tell", f.display());
    let out = tokio::process::Command::new("osascript").arg("-e").arg(script).output().await?;
    let _ = std::fs::remove_file(&f);
    if !out.status.success() {
        bail!("{}", String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(true)
}

// ───────── PDF hand-off (Goodnotes, Notability, Preview…) ─────────
fn app_names(app: &str) -> Vec<&str> {
    match app {
        "goodnotes" => vec!["Goodnotes", "GoodNotes 5", "GoodNotes"],
        "notability" => vec!["Notability"],
        x => vec![x],
    }
}
pub async fn open_pdf_in(app: &str, pdf: &Path) -> Result<String> {
    if !cfg!(target_os = "macos") {
        crate::sys::open_path(pdf)?;
        return Ok("sistema".into());
    }
    let names = app_names(app);
    for n in &names {
        if tokio::process::Command::new("open").arg("-a").arg(n).arg(pdf).status().await.map(|s| s.success()).unwrap_or(false) {
            return Ok(n.to_string());
        }
    }
    bail!("{} non è installato", names[0])
}
pub fn installed_apps() -> Value {
    if !cfg!(target_os = "macos") {
        return json!({});
    }
    let dirs = [PathBuf::from("/Applications"), crate::paths::home().join("Applications")];
    let has = |n: &str| dirs.iter().any(|d| d.join(format!("{n}.app")).exists());
    json!({ "goodnotes": app_names("goodnotes").iter().any(|n| has(n)), "notability": has("Notability"), "obsidian": has("Obsidian"), "notion": has("Notion"), "notes": true })
}

// ───────── Obsidian ─────────
pub fn obsidian_vault(file: &Path) -> Option<PathBuf> {
    let mut d = file.parent()?.to_path_buf();
    for _ in 0..12 {
        if d.join(".obsidian").exists() {
            return Some(d);
        }
        if !d.pop() {
            break;
        }
    }
    None
}
pub fn obsidian_url(file: &Path) -> String {
    format!("obsidian://open?path={}", util::encode_component(&file.to_string_lossy()))
}
