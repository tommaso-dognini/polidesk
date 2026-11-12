//! Course material (slides, PDFs, folders…) from WeBeep, organized by course section.
//!   <course>/materiale/<NN - Section name>/<file>
//!   <course>/materiale/LINK.md   external links (Drive, GitHub, …) that can't be downloaded directly
use crate::browser::{self, Session};
use crate::downloader::{self, Headers};
use crate::library as lib;
use crate::webeep::{self, WEBEEP};
use crate::{net, util};
use anyhow::{bail, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

const INVENTORY_JS: &str = r#"async ({ courseId, WEBEEP }) => {
    const get = async u => { const r = await fetch(u, { credentials: 'include' }); return { url: r.url, doc: new DOMParser().parseFromString(await r.text(), 'text/html') }; };
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const textOf = el => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('.accesshide, .sr-only, .visually-hidden').forEach(x => x.remove()); return clean(c.textContent); };
    const sectionTitle = (sec, doc) => {
        const t = textOf(sec.querySelector && sec.querySelector('h3.sectionname, .sectionname, .section-title'));
        if (t) return t;
        const m = (doc.title || '').match(/Sezione:\s*(.+?)\s*\|/) || (doc.title || '').match(/Section:\s*(.+?)\s*\|/);
        return m ? clean(m[1]) : '';
    };
    const main = await get(`${WEBEEP}/course/view.php?id=${courseId}`);
    const sectionUrls = [...new Set([...main.doc.querySelectorAll('a[href*="/course/section.php?id="]')].map(a => a.href.replace(/#.*/, '')))];
    const pages = [main, ...(await Promise.all(sectionUrls.map(get)))];
    const items = new Map();
    let secIndex = 0;
    for (const p of pages) {
        const secEls = p.doc.querySelectorAll('li.section, .course-section, [data-for="section"]');
        const groups = secEls.length ? [...secEls] : [p.doc];
        for (const sec of groups) {
            const numAttr = sec.getAttribute && sec.getAttribute('data-number');
            const num = numAttr != null ? Number(numAttr) : secIndex++;
            const section = sectionTitle(sec, p.doc) || (num === 0 ? 'Generale' : `Sezione ${num}`);
            for (const act of sec.querySelectorAll('li.activity, [data-for="cmitem"]')) {
                const a = act.querySelector('a[href*="/mod/"]');
                const name = textOf(act.querySelector('.instancename') || act.querySelector('.activityname') || a).replace(/\s+(File|Cartella|Folder|URL|Pagina|Page)$/, '');
                if (a) {
                    const m = a.href.match(/\/mod\/(resource|folder|url|page)\/view\.php\?id=(\d+)/);
                    if (m && !items.has('cm' + m[2])) items.set('cm' + m[2], { kind: m[1], cmid: m[2], name, section, num, href: a.href });
                }
                for (const l of act.querySelectorAll('a[href*="pluginfile.php"]')) {
                    if (!items.has(l.href)) items.set(l.href, { kind: 'file', url: l.href, name: clean(l.textContent), section, num });
                }
            }
        }
    }
    const out = [], external = [];
    await Promise.all([...items.values()].map(async it => {
        try {
            if (it.kind === 'folder') {
                const { doc } = await get(`${WEBEEP}/mod/folder/view.php?id=${it.cmid}`);
                for (const l of doc.querySelectorAll('a[href*="pluginfile.php"][href*="mod_folder/content"]')) {
                    const after = decodeURIComponent(new URL(l.href).pathname.split('/mod_folder/content/')[1] || '');
                    const rel = after.split('/').slice(1).join('/');
                    out.push({ url: l.href.replace(/\?forcedownload=1$/, ''), section: it.section, num: it.num, folder: it.name, rel: rel || clean(l.textContent) });
                }
            } else if (it.kind === 'resource') {
                out.push({ url: `${WEBEEP}/mod/resource/view.php?id=${it.cmid}&redirect=1`, section: it.section, num: it.num, name: it.name, resolve: true });
            } else if (it.kind === 'file') {
                out.push({ url: it.url, section: it.section, num: it.num, name: it.name });
            } else if (it.kind === 'url') {
                const { doc } = await get(`${WEBEEP}/mod/url/view.php?id=${it.cmid}&forceview=1`);
                const l = doc.querySelector('.urlworkaround a, #region-main a[href^="http"]:not([href*="webeep.polimi.it"])');
                if (l) external.push({ url: l.href, name: it.name, section: it.section });
            } else if (it.kind === 'page') {
                const { doc } = await get(it.href);
                for (const l of doc.querySelectorAll('#region-main a[href*="pluginfile.php"]')) out.push({ url: l.href, section: it.section, num: it.num, name: clean(l.textContent) });
            }
        } catch (e) { }
    }));
    return { files: out, external };
}"#;

/// Inventory of downloadable material, grouped by section.
pub async fn inventory(s: &Session, course_id: &Value) -> Result<Value> {
    webeep::ensure_logged_in(s).await?; // page must be on webeep for same-origin fetch()
    browser::call(&s.page().await?, INVENTORY_JS, &json!({ "courseId": course_id, "WEBEEP": WEBEEP })).await
}

fn section_dir(f: &Value) -> String {
    let n = f["num"].as_f64().unwrap_or(0.0) as i64;
    lib::sanitize(&format!("{n:02} - {}", util::s(f, "section")), 80)
}

pub(crate) fn file_name_from(cd: &str, url: &reqwest::Url) -> String {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?"#).unwrap());
    let raw = RX.captures(cd).and_then(|m| m.get(1).or(m.get(2)).map(|x| x.as_str().to_string())).unwrap_or_else(|| url.path_segments().and_then(|mut s| s.next_back()).unwrap_or("file").to_string());
    percent_encoding::percent_decode_str(&raw).decode_utf8_lossy().into_owned()
}

/// Download course material incrementally. Files already present with the same size are skipped;
/// the manifest remembers url → path.
pub async fn sync_materials(s: &Session, course_dir: &Path, manifest: &mut Value, log: &(dyn Fn(String) + Send + Sync), should_stop: &(dyn Fn() -> bool + Send + Sync)) -> Result<Value> {
    let root = course_dir.join("materiale");
    std::fs::create_dir_all(&root)?;
    log("📎 Cerco il materiale del corso...".into());
    let inv = inventory(s, &manifest["course"]["id"]).await?;
    if !manifest["materials"].is_object() {
        manifest["materials"] = json!({});
    }
    let cookie = s.cookie_header_for(&format!("{WEBEEP}/")).await?;
    let files = inv["files"].as_array().cloned().unwrap_or_default();
    let external = inv["external"].as_array().cloned().unwrap_or_default();
    let (mut downloaded, mut skipped, mut failed) = (0, 0, 0);
    log(format!("  • {} file, {} link esterni", files.len(), external.len()));
    for f in &files {
        if should_stop() {
            break;
        }
        let furl = util::s(f, "url").to_string();
        let known = manifest["materials"].get(&furl).cloned();
        // deleted by the student in the app: never downloaded again
        if known.as_ref().map(|k| util::b(k, "deleted")).unwrap_or(false) {
            skipped += 1;
            continue;
        }
        let r: Result<Option<String>> = async {
            // resolve the real file name (resources redirect to pluginfile)
            let head = net::client().head(&furl).header("Cookie", &cookie).send().await?;
            if !head.status().is_success() {
                if known.is_some() {
                    return Ok(None); // skipped
                }
                bail!("HTTP {}", head.status().as_u16());
            }
            let url = head.url().clone();
            let size: Option<u64> = head.headers().get("content-length").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok()).filter(|n| *n > 0);
            let cd = head.headers().get("content-disposition").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
            let ctype = head.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
            let name = file_name_from(&cd, &url);
            let lname = name.to_lowercase();
            if ctype.contains("text/html") && !(lname.ends_with(".html") || lname.ends_with(".htm")) {
                bail!("non è un file scaricabile");
            }
            let rel: String = match known.as_ref().map(|k| util::s(k, "path").to_string()).filter(|p| !p.is_empty()) {
                Some(p) => p,
                None => {
                    let mut p = PathBuf::from(section_dir(f));
                    if !util::s(f, "folder").is_empty() {
                        p.push(lib::sanitize(util::s(f, "folder"), 80));
                    }
                    let relf = util::s(f, "rel");
                    if !relf.is_empty() {
                        for part in relf.split('/') {
                            p.push(lib::sanitize(part, 120));
                        }
                    } else {
                        p.push(lib::sanitize(&name, 150));
                    }
                    p.to_string_lossy().into_owned()
                }
            };
            let dest = root.join(&rel);
            if dest.exists() && size.map(|sz| std::fs::metadata(&dest).map(|m| m.len() == sz).unwrap_or(false)).unwrap_or(true) {
                manifest["materials"][&furl] = json!({ "path": rel, "size": size });
                return Ok(None);
            }
            let headers: Headers = vec![("Cookie".into(), cookie.clone())];
            downloader::http_download(url.as_str(), &dest, &headers, Arc::new(|_| {}), 1).await?;
            manifest["materials"][&furl] = json!({ "path": rel, "size": size, "downloadedAt": util::now_iso() });
            Ok(Some(rel))
        }
        .await;
        match r {
            Ok(Some(rel)) => {
                downloaded += 1;
                log(format!("  ✓ {rel}"));
            }
            Ok(None) => skipped += 1,
            Err(e) => {
                failed += 1;
                let label = [util::s(f, "name"), util::s(f, "rel"), &furl].into_iter().find(|x| !x.is_empty()).unwrap_or("").to_string();
                log(format!("  ✗ {label}: {e}"));
            }
        }
    }
    // external links → LINK.md
    if !external.is_empty() {
        let mut md = String::from("# Link esterni\n\nRisorse del corso fuori da WeBeep (non scaricate automaticamente).\n\n");
        let mut last = String::new();
        for e in &external {
            let sec = util::s(e, "section");
            if sec != last {
                md += &format!("\n## {sec}\n\n");
                last = sec.into();
            }
            md += &format!("- [{}]({})\n", util::s(e, "name"), util::s(e, "url"));
        }
        std::fs::write(root.join("LINK.md"), md)?;
    }
    log(format!("📎 Materiale: {downloaded} nuovi, {skipped} già presenti, {failed} errori"));
    Ok(json!({ "downloaded": downloaded, "skipped": skipped, "failed": failed, "external": external.len() }))
}
