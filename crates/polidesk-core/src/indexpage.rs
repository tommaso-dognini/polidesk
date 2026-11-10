//! Self-contained course overview page: <course>/INDICE.html
//! One card per recording with date, teacher, duration, summary and quick links.
use crate::library::{strip_bullet, Dirs, DIR_NOTES, DIR_TRANSCRIPTS, DIR_VIDEO};
use crate::util::{self, html_esc as esc};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::Path;

pub struct Summary {
    pub text: String,
    pub bullets: Vec<String>,
}

pub fn read_summary(d: &Dirs, rec: &Value) -> Option<Summary> {
    let f = util::str_list(rec.get("notes")).into_iter().find(|n| n.ends_with(" - sommario.md"))?;
    let md = std::fs::read_to_string(d.notes.join(f)).ok()?;
    let lines: Vec<&str> = md.trim().split('\n').map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')).collect();
    let bullets = lines.iter().filter_map(|l| strip_bullet(l)).map(|l| l.replace("**", "")).collect();
    let text = lines.iter().filter(|l| strip_bullet(l).is_none()).copied().collect::<Vec<_>>().join(" ").replace("**", "");
    Some(Summary { text, bullets })
}

pub fn list_materials(root: &Path) -> Vec<String> {
    fn walk(d: &Path, rel: &str, out: &mut Vec<String>) {
        let Ok(rd) = std::fs::read_dir(d) else { return };
        let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
        entries.sort_by(|a, b| util::natural_cmp(&a.file_name().to_string_lossy(), &b.file_name().to_string_lossy()));
        for e in entries {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name.ends_with(".part") {
                continue;
            }
            let r = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                walk(&e.path(), &r, out);
            } else {
                out.push(r);
            }
        }
    }
    let mut out = vec![];
    walk(root, "", &mut out);
    out
}

fn href(p: &str) -> String {
    p.split('/').map(util::encode_component).collect::<Vec<_>>().join("/")
}

pub fn render(course: Option<&Value>, recs: &[Value], d: &Dirs) -> String {
    let title = course.map(|c| util::s(c, "fullname")).filter(|s| !s.is_empty()).unwrap_or("Registrazioni");
    let mut sorted: Vec<&Value> = recs.iter().collect();
    sorted.sort_by(|a, b| util::s(b, "isoDate").cmp(util::s(a, "isoDate")));
    let mats: Vec<String> = list_materials(&d.root.join("materiale")).into_iter().filter(|f| f != "LINK.md").collect();
    let mut by_section: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut order: Vec<String> = vec![];
    for m in &mats {
        let s = if m.contains('/') { m.split('/').next().unwrap().to_string() } else { "Generale".into() };
        if !by_section.contains_key(&s) {
            order.push(s.clone());
        }
        by_section.entry(s).or_default().push(m.clone());
    }
    let has_links = d.root.join("materiale").join("LINK.md").exists();

    let cards: Vec<String> = sorted
        .iter()
        .map(|r| {
            let sum = read_summary(d, r);
            let mut links = vec![];
            if util::b(r, "videoExists") {
                links.push(format!(r#"<a class="btn primary" href="{}">▶ Video</a>"#, href(&format!("{DIR_VIDEO}/{}", util::s(r, "file")))));
            }
            if !util::s(r, "webexUrl").is_empty() {
                links.push(format!(r#"<a class="btn" href="{}" target="_blank">WebEx</a>"#, esc(util::s(r, "webexUrl"))));
            }
            if !util::s(r, "transcript").is_empty() {
                links.push(format!(r#"<a class="btn" href="{}">Trascrizione</a>"#, href(&format!("{DIR_TRANSCRIPTS}/{}", util::s(r, "transcript")))));
            }
            for n in util::str_list(r.get("notes")) {
                if n.ends_with(" - sommario.md") {
                    continue;
                }
                let label = n.rsplit(" - ").next().unwrap_or(&n).trim_end_matches(".md").to_string();
                links.push(format!(r#"<a class="btn" href="{}">{}</a>"#, href(&format!("{DIR_NOTES}/{n}")), esc(&label)));
            }
            let day = util::parse_date(util::s(r, "isoDate")).map(|x| util::it_day_short(x.with_timezone(&chrono::Local))).unwrap_or_default();
            let search = [
                util::s(r, "displayTitle").to_string(),
                util::s(r, "teacher").to_string(),
                util::s(r, "type").to_string(),
                sum.as_ref().map(|s| s.text.clone()).unwrap_or_default(),
                sum.as_ref().map(|s| s.bullets.join(" ")).unwrap_or_default(),
            ]
            .join(" ")
            .to_lowercase();
            let (teacher, typ, dur) = (util::s(r, "teacher"), util::s(r, "type"), util::s(r, "duration"));
            let meta = format!(
                "<span>{}</span>{}{}{}",
                esc(&day),
                if teacher.is_empty() { String::new() } else { format!("<span>· {}</span>", esc(teacher)) },
                if typ.is_empty() { String::new() } else { format!(r#"<span class="tag">{}</span>"#, esc(typ)) },
                if dur.is_empty() { String::new() } else { format!("<span>· {}</span>", esc(dur)) }
            );
            let h2 = [util::s(r, "displayTitle"), util::s(r, "topic"), util::s(r, "file")].into_iter().find(|x| !x.is_empty()).unwrap_or("");
            let body = match &sum {
                Some(s) => format!(
                    "{}{}",
                    if s.text.is_empty() { String::new() } else { format!(r#"<p class="sum">{}</p>"#, esc(&s.text)) },
                    if s.bullets.is_empty() { String::new() } else { format!("<ul>{}</ul>", s.bullets.iter().map(|b| format!("<li>{}</li>", esc(b))).collect::<String>()) }
                ),
                None => format!(
                    r#"<p class="sum muted">{}</p>"#,
                    if !util::s(r, "transcript").is_empty() {
                        "Sommario non ancora generato."
                    } else if util::b(r, "videoExists") {
                        "In attesa di trascrizione."
                    } else {
                        "Video non scaricato."
                    }
                ),
            };
            format!(
                "<article class=\"card\" data-search=\"{}\" id=\"{}\">\n  <div class=\"meta\">{}</div>\n  <h2>{}</h2>\n  {}\n  <div class=\"links\">{}</div>\n</article>",
                esc(&search),
                esc(util::s(r, "key")),
                meta,
                esc(h2),
                body,
                if links.is_empty() { r#"<span class="muted">—</span>"#.to_string() } else { links.concat() }
            )
        })
        .collect();

    let toc: String = sorted
        .iter()
        .map(|r| {
            let iso = util::s(r, "isoDate");
            let dm: String = if iso.len() >= 10 { util::take(&iso[5..], 5).split('-').rev().collect::<Vec<_>>().join("/") } else { String::new() };
            format!(r##"<a href="#{}"><span>{}</span>{}</a>"##, esc(util::s(r, "key")), esc(&dm), esc(util::s(r, "displayTitle")))
        })
        .collect();

    let mat_html = if !order.is_empty() || has_links {
        let secs: Vec<String> = order
            .iter()
            .map(|s| {
                let files = &by_section[s];
                format!(
                    r#"<details><summary>{} <span class="muted">({})</span></summary><ul>{}</ul></details>"#,
                    esc(s),
                    files.len(),
                    files
                        .iter()
                        .map(|f| {
                            let rest = f.split('/').skip(1).collect::<Vec<_>>().join("/");
                            format!(r#"<li><a href="{}">{}</a></li>"#, href(&format!("materiale/{f}")), esc(if rest.is_empty() { f } else { &rest }))
                        })
                        .collect::<String>()
                )
            })
            .collect();
        format!(
            "<section class=\"materials\"><h2 class=\"sec\">Materiale del corso</h2>\n{}\n{}</section>",
            secs.join("\n"),
            if has_links { r#"<p><a class="btn" href="materiale/LINK.md">Link esterni</a></p>"# } else { "" }
        )
    } else {
        String::new()
    };

    let downloaded = recs.iter().filter(|r| util::b(r, "videoExists")).count();
    let transcribed = recs.iter().filter(|r| !util::s(r, "transcript").is_empty()).count();
    format!(
        r#"<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
{CSS}
</style></head><body><div class="wrap">
<header><h1>{title}</h1><div class="sub">{n} registrazioni · {downloaded} scaricate · {transcribed} trascritte · aggiornato {now}</div>
<input id="q" placeholder="Cerca per argomento, docente, parola chiave…" autocomplete="off"></header>
<nav>{toc}</nav>
<main>{cards}{mat_html}</main>
</div>
<script>
document.getElementById('q').addEventListener('input',e=>{{const q=e.target.value.toLowerCase().trim();document.querySelectorAll('.card').forEach(c=>{{c.style.display=!q||c.dataset.search.includes(q)?'':'none'}})}});
</script></body></html>"#,
        title = esc(title),
        n = recs.len(),
        now = util::it_datetime(chrono::Local::now()),
        cards = if cards.is_empty() { r#"<p class="muted">Nessuna registrazione.</p>"#.to_string() } else { cards.join("\n") },
    )
}

const CSS: &str = r#":root{--bg:#f5f5f7;--card:#fff;--text:#1d1d1f;--muted:#6e6e73;--line:#e5e5ea;--accent:#0071e3;--tag:#f0f0f3}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#1c1c1e;--text:#f5f5f7;--muted:#98989d;--line:#2c2c2e;--accent:#2997ff;--tag:#2c2c2e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:40px 16px 80px;display:grid;grid-template-columns:240px 1fr;gap:32px}
header{grid-column:1/-1}h1{font-size:30px;letter-spacing:-.02em;margin:0 0 6px}.sub{color:var(--muted)}
input{width:100%;margin-top:18px;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit}
nav{position:sticky;top:20px;align-self:start;max-height:calc(100vh - 40px);overflow:auto;font-size:13px}
nav a{display:block;padding:6px 8px;border-radius:8px;color:var(--text);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
nav a:hover{background:var(--card)}nav a span{color:var(--muted);margin-right:8px;font-variant-numeric:tabular-nums}
.card{background:var(--card);border-radius:16px;padding:20px 22px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.card h2{font-size:18px;margin:4px 0 8px;letter-spacing:-.01em}.meta{display:flex;gap:6px;flex-wrap:wrap;color:var(--muted);font-size:13px;align-items:center}
.tag{background:var(--tag);border-radius:6px;padding:1px 7px;font-size:12px}.sum{margin:6px 0}ul{margin:6px 0 4px;padding-left:20px}li{margin:2px 0}
.muted{color:var(--muted)}.links{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.btn{display:inline-block;padding:6px 12px;border-radius:980px;background:var(--tag);color:var(--text);text-decoration:none;font-size:13px}
.btn.primary{background:var(--accent);color:#fff}.btn:hover{filter:brightness(.95)}
.sec{font-size:20px;margin:36px 0 12px}details{background:var(--card);border-radius:12px;padding:12px 16px;margin-bottom:8px}
summary{cursor:pointer;font-weight:600}details a{color:var(--accent);text-decoration:none}
@media (max-width:760px){.wrap{grid-template-columns:1fr}nav{display:none}}"#;
