//! WeBeep (Moodle). All scraping runs fetch() *inside* the logged-in page: fast, and it keeps the session.
use crate::browser::{self, done, Session};
use anyhow::{anyhow, bail, Result};
use regex::Regex;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;
use std::time::Duration;

pub const WEBEEP: &str = "https://webeep.polimi.it";
/// aunicalogin services that are NOT recording archives (e.g. 2292 = "Assistenza WeBeep")
const NON_RECORDING_SERVICES: [&str; 1] = ["2292"];

pub async fn ensure_logged_in(s: &Session) -> Result<()> {
    let page = s.start().await?;
    let is_done = done(|u: String, p| async move {
        u.starts_with(WEBEEP) && browser::eval(&p, "!!(window.M && M.cfg && M.cfg.sesskey) && !document.body.classList.contains('notloggedin')").await.ok().and_then(|v| v.as_bool()).unwrap_or(false)
    });
    s.goto(&page, &format!("{WEBEEP}/my/courses.php"), &is_done, Duration::from_secs(45)).await?;
    s.save_cookies().await;
    Ok(())
}

pub async fn enrolled_courses(s: &Session) -> Result<Vec<Value>> {
    ensure_logged_in(s).await?;
    let page = s.page().await?;
    let res = browser::eval(&page, r#"(async () => {
        const r = await fetch(M.cfg.wwwroot + '/lib/ajax/service.php?sesskey=' + M.cfg.sesskey, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ index: 0, methodname: 'core_course_get_enrolled_courses_by_timeline_classification', args: { offset: 0, limit: 0, classification: 'all', sort: 'fullname' } }])
        });
        return r.json();
    })()"#).await?;
    let first = &res[0];
    if first.is_null() || crate::util::b(first, "error") {
        bail!("Impossibile leggere i corsi WeBeep: {}", first.get("exception").map(|e| e.to_string()).unwrap_or_default());
    }
    Ok(first["data"]["courses"].as_array().into_iter().flatten().map(|c| json!({
        "id": c["id"], "fullname": c["fullname"], "shortname": c["shortname"], "idnumber": c["idnumber"],
        "url": c["viewurl"], "image": c["courseimage"], "hidden": c["hidden"],
    })).collect())
}

enum Input {
    Id(String),
    PageUrl(String),
    Url,
    Query(String),
}
fn parse_course_input(input: &str) -> Input {
    let input = input.trim();
    if let Some(id) = input.strip_prefix("webeep:").filter(|x| x.chars().all(|c| c.is_ascii_digit()) && !x.is_empty()) {
        return Input::Id(id.into());
    }
    if let Ok(u) = reqwest::Url::parse(input) {
        if u.host_str().map(|h| h.contains("webeep.polimi.it")).unwrap_or(false) {
            let id = u.query_pairs().find(|(k, _)| k == "id").map(|(_, v)| v.to_string());
            if u.path().contains("/course/view.php") {
                if let Some(id) = id {
                    let t = id.trim_start_matches('0');
                    return Input::Id(if t.is_empty() { id.clone() } else { t.to_string() });
                }
            }
            // any other WeBeep page (section.php, mod/*/view.php, …): the course id is read from the page
            return Input::PageUrl(input.into());
        }
        return Input::Url;
    }
    Input::Query(input.into())
}

/// Accepts a WeBeep URL, a course id, a PoliMi course code (e.g. 054307) or part of the name.
pub async fn resolve_course(s: &Session, input: &str) -> Result<Value> {
    let parsed = parse_course_input(input);
    let courses = enrolled_courses(s).await?;
    let id_of = |c: &Value| c["id"].as_i64().map(|i| i.to_string()).unwrap_or_else(|| c["id"].to_string());
    let mut query: Option<String> = None;
    let id = match parsed {
        Input::PageUrl(u) => Some(course_id_from_page(s, &u).await?.ok_or_else(|| anyhow!("Impossibile ricavare il corso dalla pagina {u}"))?.to_string()),
        Input::Id(i) => Some(i),
        Input::Url => bail!("URL non riconosciuto: usa il link WeBeep del corso, il codice o il nome."),
        Input::Query(q) => {
            query = Some(q);
            None
        }
    };
    if let Some(id) = id {
        if let Some(c) = courses.iter().find(|c| id_of(c) == id) {
            return Ok(c.clone());
        }
        // might be a valid course the student is not enrolled in
        let title = fetch_title(s, &format!("{WEBEEP}/course/view.php?id={id}")).await.unwrap_or_default();
        let low = title.to_lowercase();
        if !title.is_empty() && !low.starts_with("errore") && !low.starts_with("error") {
            static T: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^Corso:\s*|\s*\|\s*WeBeep$").unwrap());
            return Ok(json!({ "id": id.parse::<i64>().unwrap_or(0), "fullname": T.replace_all(&title, ""), "url": format!("{WEBEEP}/course/view.php?id={id}") }));
        }
        // the "id" was probably a PoliMi course code (e.g. view.php?id=054307): search for it
        query = Some(id);
    }
    let q0 = query.unwrap_or_default();
    let q = q0.to_lowercase();
    if let Some(c) = courses.iter().find(|c| id_of(c) == q) {
        return Ok(c.clone());
    }
    let text = |c: &Value| [crate::util::s(c, "fullname"), crate::util::s(c, "shortname"), crate::util::s(c, "idnumber")].join(" ").to_lowercase();
    let mut matches: Vec<&Value> = courses.iter().filter(|c| text(c).contains(&q)).collect();
    if matches.is_empty() {
        let words: Vec<&str> = q.split_whitespace().collect();
        matches = courses.iter().filter(|c| words.iter().all(|w| crate::util::s(c, "fullname").to_lowercase().contains(w))).collect();
    }
    if matches.is_empty() {
        bail!("Nessun corso WeBeep trovato per \"{q0}\" tra i tuoi corsi.");
    }
    // most recent edition (e.g. [2026-27] over [2025-26])
    matches.sort_by_key(|c| std::cmp::Reverse(c["id"].as_i64().unwrap_or(0)));
    Ok(matches[0].clone())
}

async fn course_id_from_page(s: &Session, url: &str) -> Result<Option<i64>> {
    let v = browser::call(&s.page().await?, r#"async url => {
        const r = await fetch(url, { credentials: 'include' });
        const html = await r.text();
        const m = html.match(/"courseId"\s*:\s*(\d+)/) || html.match(/course\/view\.php\?id=(\d+)/);
        return m && Number(m[1]) > 1 ? Number(m[1]) : null;
    }"#, &json!(url)).await?;
    Ok(v.as_i64())
}
async fn fetch_title(s: &Session, url: &str) -> Result<String> {
    let v = browser::call(&s.page().await?, r#"async url => {
        const r = await fetch(url, { credentials: 'include' });
        const d = new DOMParser().parseFromString(await r.text(), 'text/html');
        return d.title;
    }"#, &json!(url)).await?;
    Ok(v.as_str().unwrap_or("").to_string())
}

/// Fetch several pages in-browser and return their links (scoped to the main content when present).
pub async fn fetch_links(s: &Session, urls: &[String]) -> Result<serde_json::Map<String, Value>> {
    let v = browser::call(&s.page().await?, r#"async urls => {
        const out = {};
        await Promise.all(urls.map(async url => {
            try {
                const r = await fetch(url, { credentials: 'include' });
                const d = new DOMParser().parseFromString(await r.text(), 'text/html');
                const scope = d.querySelector('#region-main, #page-content, [role="main"]') || d;
                const base = new URL(r.url);
                const links = [...scope.querySelectorAll('a[href], iframe[src]')].map(a => {
                    const raw = a.getAttribute('href') || a.getAttribute('src');
                    let href; try { href = new URL(raw, base).href; } catch (e) { return null; }
                    const act = a.closest('li.activity, [data-for="cmitem"]');
                    const name = act && act.querySelector('.instancename, .activityname');
                    const label = (name ? name.textContent : (a.textContent || a.title || '')).replace(/\s+/g, ' ').trim().replace(/\s+(URL|File|Pagina|Page|Cartella|Folder)$/, '');
                    const oc = a.getAttribute('onclick') || '';
                    const m = oc.match(/window\.open\('([^']+)'/);
                    return { href: m ? new URL(m[1], base).href : href, label };
                }).filter(Boolean);
                out[url] = { finalUrl: r.url, title: d.title, links };
            } catch (e) { out[url] = { error: String(e), links: [] }; }
        }));
        return out;
    }"#, &json!(urls)).await?;
    Ok(v.as_object().cloned().unwrap_or_default())
}

/// What kind of recording source a link is (None = not a recording).
pub fn classify(href: &str) -> Option<Value> {
    let u = reqwest::Url::parse(href).ok()?;
    let h = u.host_str().unwrap_or("");
    let p = u.path();
    let q = |k: &str| u.query_pairs().find(|(a, _)| a == k).map(|(_, v)| v.to_string());
    let r = |t: &str, c: &str| Some(json!({ "type": t, "confidence": c }));
    static WEBEX_P: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"recordingservice|/recording/|playback|/ldr\.php|/lsr\.php").unwrap());
    static YT_BAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"channel|/c/|/@").unwrap());
    static MS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)web\.microsoftstream\.com|sharepoint\.com.*\.mp4|stream\.aspx").unwrap());
    static GD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"drive\.google\.com/(file|drive/folders)").unwrap());
    static DIRECT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\.(mp4|m4v|mov|mkv|webm|m3u8)(\?|$)").unwrap());
    static OTHER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"panopto|kaltura|vimeo\.com").unwrap());
    if h == "aunicalogin.polimi.it" && p.contains("getservizio") {
        let sid = q("id_servizio").unwrap_or_default();
        if NON_RECORDING_SERVICES.contains(&sid.as_str()) {
            return None;
        }
        // 2294 = RecMan "Archivio registrazioni"; unknown services are probed later
        return r("recman", if sid == "2294" || q("c_classe_webeep").is_some() { "high" } else { "low" });
    }
    if h.contains("onlineservices.polimi.it") && p.contains("recman") {
        return r("recman", "high");
    }
    if h.ends_with(".webex.com") && (WEBEX_P.is_match(p) || q("RCID").is_some() || q("rcid").is_some()) {
        return r("webex", "high");
    }
    if (h.contains("youtube.com") || h.contains("youtu.be")) && !YT_BAD.is_match(p) {
        return r("youtube", "medium");
    }
    if MS.is_match(href) {
        return r("msstream", "medium");
    }
    if GD.is_match(href) {
        return r("gdrive", "low");
    }
    if DIRECT.is_match(p) {
        return r("direct", "high");
    }
    if OTHER.is_match(h) {
        return r("other-video", "medium");
    }
    None
}

fn no_hash(s: &str) -> String {
    s.split('#').next().unwrap_or("").to_string()
}

/// Scan the whole course (main page, every section, every URL/page activity, announcements) and
/// return all places where recordings may live.
pub async fn find_recording_sources(s: &Session, course: &Value, log: &(dyn Fn(String) + Send + Sync)) -> Result<Vec<Value>> {
    ensure_logged_in(s).await?;
    let course_url = format!("{WEBEEP}/course/view.php?id={}", course["id"]);
    let mut found: Vec<Value> = vec![];
    let mut index: HashMap<String, usize> = HashMap::new();
    let mut add = |href: &str, label: &str, from: &str| {
        let Some(c) = classify(href) else { return };
        let key = no_hash(href);
        match index.get(&key) {
            None => {
                index.insert(key.clone(), found.len());
                found.push(crate::util::merge(&c, &json!({ "url": key, "label": label, "from": from })));
            }
            Some(&i) => {
                if !label.is_empty() && crate::util::s(&found[i], "label").is_empty() {
                    found[i]["label"] = json!(label);
                }
            }
        }
    };
    let links_of = |d: &Value| d["links"].as_array().cloned().unwrap_or_default();

    // 1. course page + 2. all section pages
    let first = fetch_links(s, std::slice::from_ref(&course_url)).await?;
    static SEC1: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/course/section\.php\?id=\d+").unwrap());
    static SEC2: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/course/view\.php\?id=\d+&section=\d+").unwrap());
    let mut section_urls: Vec<String> = vec![];
    let main_links = first.get(&course_url).map(&links_of).unwrap_or_default();
    for l in &main_links {
        let h = crate::util::s(l, "href");
        if SEC1.is_match(h) || SEC2.is_match(h) {
            let u = no_hash(h);
            if !section_urls.contains(&u) {
                section_urls.push(u);
            }
        }
    }
    log(format!("  • Pagina corso: {} link, {} sezioni", main_links.len(), section_urls.len()));
    let mut all: serde_json::Map<String, Value> = first;
    if !section_urls.is_empty() {
        all.extend(fetch_links(s, &section_urls).await?);
    }

    // activities to inspect
    static ACT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/mod/(url|page|label|book|lti|resource|forum)/view\.php\?id=(\d+)").unwrap());
    let mut activities: Vec<(String, String, String, String)> = vec![]; // (type, id, label, href)
    let mut seen_act = HashSet::new();
    for (page_url, d) in &all {
        for l in links_of(d) {
            let (h, lab) = (crate::util::s(&l, "href"), crate::util::s(&l, "label"));
            add(h, lab, page_url);
            if let Some(m) = ACT.captures(h) {
                if seen_act.insert(m[2].to_string()) {
                    activities.push((m[1].to_string(), m[2].to_string(), lab.to_string(), no_hash(h)));
                }
            }
        }
    }

    // 3. open every url/page/book activity and look inside
    let to_fetch: Vec<String> = activities.iter().filter(|a| ["url", "page", "book"].contains(&a.0.as_str())).map(|a| if a.0 == "url" { format!("{WEBEEP}/mod/url/view.php?id={}&forceview=1", a.1) } else { a.3.clone() }).collect();
    log(format!("  • Attività da ispezionare: {}", to_fetch.len()));
    static IDQ: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"id=(\d+)").unwrap());
    for batch in to_fetch.chunks(8) {
        for (page_url, d) in fetch_links(s, batch).await? {
            let act_id = IDQ.captures(&page_url).map(|m| m[1].to_string()).unwrap_or_default();
            let act_label = activities.iter().find(|a| a.1 == act_id).map(|a| a.2.clone()).unwrap_or_default();
            let fin = crate::util::s(&d, "finalUrl");
            // an external redirect of the fetch itself (mod/url with automatic redirect)
            if !fin.is_empty() && !fin.starts_with(WEBEEP) {
                add(fin, &act_label, &page_url);
            }
            for l in links_of(&d) {
                let h = crate::util::s(&l, "href");
                if h.starts_with(WEBEEP) && !h.contains("pluginfile") {
                    continue;
                }
                add(h, if act_label.is_empty() { crate::util::s(&l, "label") } else { &act_label }, &page_url);
            }
        }
    }
    // 4. announcement forums: teachers often post recording links there
    static ANN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)annunc|announc|news|avvisi|comunicazioni").unwrap());
    static DISC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/mod/forum/discuss\.php\?d=\d+$").unwrap());
    static TITLE_PFX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[^:]*:\s*").unwrap());
    let forums: Vec<String> = activities.iter().filter(|a| a.0 == "forum" && ANN.is_match(&a.2)).map(|a| format!("{WEBEEP}/mod/forum/view.php?id={}", a.1)).collect();
    if !forums.is_empty() {
        let views = fetch_links(s, &forums).await?;
        let mut discussions: Vec<String> = vec![];
        for v in views.values() {
            for l in links_of(v) {
                let h = no_hash(crate::util::s(&l, "href"));
                if DISC.is_match(&h) && !discussions.contains(&h) {
                    discussions.push(h);
                }
            }
        }
        discussions.truncate(120);
        log(format!("  • Annunci: {} discussioni da controllare", discussions.len()));
        for batch in discussions.chunks(10) {
            for (u, d) in fetch_links(s, batch).await? {
                let title = TITLE_PFX.replace(crate::util::s(&d, "title").split('|').next().unwrap_or(""), "").trim().to_string();
                for l in links_of(&d) {
                    let lab = crate::util::s(&l, "label");
                    let label = if lab.chars().count() > 3 && !lab.starts_with("http:") && !lab.starts_with("https:") { lab.to_string() } else { format!("Annuncio: {title}") };
                    add(crate::util::s(&l, "href"), &label, &u);
                }
            }
        }
    }
    Ok(found)
}
