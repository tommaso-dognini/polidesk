//! Appunti PoliNetwork (gitlab.com/polinetwork): appunti, temi d'esame e materiale raccolti dagli studenti,
//! un repository per corso di laurea e anno, una cartella per insegnamento.
//!
//! Parla direttamente il protocollo git «smart HTTP» v2, senza bisogno di git installato: le API REST/GraphQL
//! di GitLab e i link «raw» sono limitati per IP per gli utenti anonimi (bastano una decina di chiamate per
//! ricevere un 429), i fetch git no.
//!  - indice: per ogni repo un fetch `filter tree:1` (commit + cartella radice, ~1 KB)
//!  - albero di un corso: un fetch `filter blob:none` (solo le cartelle, poche centinaia di KB)
//!  - file: fetch dei soli blob scelti, per id
//!
//! Sul disco: <corso>/materiale/PoliNetwork/<cartella>/<file>, più `.polinetwork.json` con l'id git di ogni
//! file scaricato (per riconoscere quelli aggiornati nel frattempo).
use crate::{library as lib, net, paths, util};
use anyhow::{anyhow, bail, Context, Result};
use flate2::{Decompress, FlushDecompress, Status};
use futures_util::StreamExt;
use regex::Regex;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

pub const GROUP: &str = "https://gitlab.com/polinetwork";
pub const SITE: &str = "https://polinetwork.org/it/materials/view/";
pub const LOCAL_DIR: &str = "PoliNetwork";
const SIDECAR: &str = ".polinetwork.json";

/// (repo, corso di laurea, anno). L'elenco dei progetti del gruppo richiederebbe l'API limitata, quindi sta qui.
const REPOS: &[(&str, &str, &str)] = &[
    ("info1y", "Ingegneria Informatica", "1° anno"),
    ("info2y", "Ingegneria Informatica", "2° anno"),
    ("info3y", "Ingegneria Informatica", "3° anno"),
    ("CompSc1", "Computer Science and Engineering (LM)", "1° anno"),
    ("CompSc2", "Computer Science and Engineering (LM)", "2° anno"),
    ("CompSc", "Computer Science and Engineering (LM)", ""),
    ("Bioinformatics", "Bioinformatics for Computational Genomics (LM)", ""),
    ("AES1y", "Ingegneria Aerospaziale", "1° anno"),
    ("AES2y", "Ingegneria Aerospaziale", "2° anno"),
    ("AES3y", "Ingegneria Aerospaziale", "3° anno"),
    ("AES_corsi6cfu", "Ingegneria Aerospaziale", "corsi da 6 CFU"),
    ("aero1y", "Aeronautical Engineering (LM)", "1° anno"),
    ("aero2y", "Aeronautical Engineering (LM)", "2° anno"),
    ("space1y", "Space Engineering (LM)", "1° anno"),
    ("space2y", "Space Engineering (LM)", "2° anno"),
    ("ambientale1y", "Ingegneria per l'Ambiente e il Territorio", "1° anno"),
    ("ambientale2y", "Ingegneria per l'Ambiente e il Territorio", "2° anno"),
    ("ambientale3y", "Ingegneria per l'Ambiente e il Territorio", "3° anno"),
    ("automazione1y", "Ingegneria dell'Automazione", "1° anno"),
    ("automazione2y", "Ingegneria dell'Automazione", "2° anno"),
    ("automazione3y", "Ingegneria dell'Automazione", "3° anno"),
    ("chimica1y", "Ingegneria Chimica", "1° anno"),
    ("chimica2y", "Ingegneria Chimica", "2° anno"),
    ("chimica3y", "Ingegneria Chimica", "3° anno"),
    ("elettronica1y", "Ingegneria Elettronica", "1° anno"),
    ("elettronica2y", "Ingegneria Elettronica", "2° anno"),
    ("elettronica3y", "Ingegneria Elettronica", "3° anno"),
    ("energetica1y", "Ingegneria Energetica", "1° anno"),
    ("energetica2y", "Ingegneria Energetica", "2° anno"),
    ("energetica3y", "Ingegneria Energetica", "3° anno"),
    ("Gest1y", "Ingegneria Gestionale", "1° anno"),
    ("Gest2y", "Ingegneria Gestionale", "2° anno"),
    ("Gest3y", "Ingegneria Gestionale", "3° anno"),
    ("Manag1y", "Management Engineering (LM)", "1° anno"),
    ("Manag2y", "Management Engineering (LM)", "2° anno"),
    ("matnano1y", "Ingegneria dei Materiali e delle Nanotecnologie", "1° anno"),
    ("matnano2y", "Ingegneria dei Materiali e delle Nanotecnologie", "2° anno"),
    ("matnano3y", "Ingegneria dei Materiali e delle Nanotecnologie", "3° anno"),
    ("meccanica1y", "Ingegneria Meccanica", "1° anno"),
    ("meccanica2y", "Ingegneria Meccanica", "2° anno"),
    ("meccanica3y", "Ingegneria Meccanica", "3° anno"),
    ("meccanica", "Ingegneria Meccanica", ""),
    ("Mech1y", "Mechanical Engineering (LM)", "1° anno"),
    ("Mech2y", "Mechanical Engineering (LM)", "2° anno"),
    ("mobilityMDy1", "Mobility Engineering (LM)", "1° anno"),
    ("mobilityMDy2", "Mobility Engineering (LM)", "2° anno"),
    ("DES-Prod", "Design del Prodotto Industriale", ""),
    ("DES-Comm", "Design della Comunicazione", ""),
    ("DES-Interni", "Design degli Interni", ""),
    ("DES-Moda", "Design della Moda", ""),
];

fn repo_meta(repo: &str) -> Option<&'static (&'static str, &'static str, &'static str)> {
    REPOS.iter().find(|r| r.0 == repo)
}

/// Some folders were uploaded with a tool that escaped accents as `#U00e0`.
pub fn display_name(s: &str) -> String {
    static RX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"#U([0-9a-fA-F]{4})").unwrap());
    RX.replace_all(s, |c: &regex::Captures| u32::from_str_radix(&c[1], 16).ok().and_then(char::from_u32).map(String::from).unwrap_or_else(|| c[0].to_string())).into_owned()
}

pub fn web_url(repo: &str, branch: &str, path: &str) -> String {
    let b = if branch.is_empty() { "HEAD" } else { branch };
    format!("{GROUP}/{repo}/-/tree/{}/{}", util::encode_uri(b), util::encode_uri(path))
}

// ───────────────────────── git smart HTTP v2 ─────────────────────────

fn pkt(buf: &mut Vec<u8>, line: &str) {
    buf.extend(format!("{:04x}", line.len() + 4).as_bytes());
    buf.extend(line.as_bytes());
}

enum Pkt<'a> {
    Data(&'a [u8]),
    Flush,
    Delim,
}

fn pkts(mut data: &[u8]) -> Result<Vec<Pkt<'_>>> {
    let mut out = Vec::new();
    while !data.is_empty() {
        let len = std::str::from_utf8(data.get(..4).ok_or_else(|| anyhow!("risposta git troncata"))?).ok().and_then(|h| usize::from_str_radix(h, 16).ok()).ok_or_else(|| anyhow!("risposta git non valida"))?;
        match len {
            0 => out.push(Pkt::Flush),
            1 | 2 => out.push(Pkt::Delim),
            n if n >= 4 => out.push(Pkt::Data(data.get(4..n).ok_or_else(|| anyhow!("risposta git troncata"))?)),
            _ => bail!("risposta git non valida"),
        }
        data = &data[len.max(4)..];
    }
    Ok(out)
}

async fn upload_pack(repo: &str, body: Vec<u8>) -> Result<Vec<u8>> {
    let r = net::client()
        .post(format!("{GROUP}/{repo}.git/git-upload-pack"))
        .header("User-Agent", concat!("git/2.40 (PoliDesk ", env!("CARGO_PKG_VERSION"), ")"))
        .header("Content-Type", "application/x-git-upload-pack-request")
        .header("Accept", "application/x-git-upload-pack-result")
        .header("Git-Protocol", "version=2")
        .body(body)
        .send()
        .await
        .context("GitLab non raggiungibile")?;
    if !r.status().is_success() {
        bail!("GitLab: HTTP {} per {repo}", r.status().as_u16());
    }
    let mut out = Vec::new();
    let mut s = r.bytes_stream();
    while let Some(c) = s.next().await {
        out.extend_from_slice(&c?);
    }
    Ok(out)
}

/// (commit id, default branch) of the repo.
async fn head(repo: &str) -> Result<(String, String)> {
    let mut b = Vec::new();
    pkt(&mut b, "command=ls-refs\n");
    b.extend(b"0001");
    pkt(&mut b, "symrefs\n");
    pkt(&mut b, "ref-prefix HEAD\n");
    b.extend(b"0000");
    let out = upload_pack(repo, b).await?;
    for p in pkts(&out)? {
        if let Pkt::Data(l) = p {
            let l = String::from_utf8_lossy(l);
            let mut it = l.trim_end().split(' ');
            if let (Some(oid), Some("HEAD")) = (it.next(), it.next()) {
                let branch = it.find_map(|a| a.strip_prefix("symref-target:refs/heads/")).unwrap_or("").to_string();
                return Ok((oid.to_string(), branch));
            }
        }
    }
    bail!("{repo}: repository vuoto o non trovato")
}

/// `fetch` command: returns the packfile.
async fn fetch(repo: &str, wants: &[String], args: &[&str]) -> Result<Vec<u8>> {
    let mut b = Vec::new();
    pkt(&mut b, "command=fetch\n");
    b.extend(b"0001");
    pkt(&mut b, "ofs-delta\n");
    pkt(&mut b, "no-progress\n");
    for a in args {
        pkt(&mut b, &format!("{a}\n"));
    }
    for w in wants {
        pkt(&mut b, &format!("want {w}\n"));
    }
    pkt(&mut b, "done\n");
    b.extend(b"0000");
    let out = upload_pack(repo, b).await?;
    let mut pack = Vec::new();
    let mut in_pack = false;
    for p in pkts(&out)? {
        let Pkt::Data(l) = p else { continue };
        if !in_pack {
            if l.starts_with(b"ERR ") {
                bail!("GitLab: {}", String::from_utf8_lossy(&l[4..]).trim());
            }
            in_pack = l == b"packfile\n";
            continue;
        }
        match l.first() {
            Some(1) => pack.extend_from_slice(&l[1..]),
            Some(3) => bail!("GitLab: {}", String::from_utf8_lossy(&l[1..]).trim()),
            _ => {}
        }
    }
    if !in_pack {
        bail!("{repo}: GitLab non ha restituito dati");
    }
    Ok(pack)
}

type Oid = [u8; 20];

fn hex(o: &[u8]) -> String {
    o.iter().map(|b| format!("{b:02x}")).collect()
}
fn unhex(s: &str) -> Option<Oid> {
    let s = s.as_bytes();
    if s.len() != 40 {
        return None;
    }
    let mut o = [0u8; 20];
    for i in 0..20 {
        o[i] = u8::from_str_radix(std::str::from_utf8(&s[i * 2..i * 2 + 2]).ok()?, 16).ok()?;
    }
    Some(o)
}

fn inflate(input: &[u8], size: usize) -> Result<(Vec<u8>, usize)> {
    let mut d = Decompress::new(true);
    let mut out = Vec::with_capacity(size + 1);
    loop {
        let (before_in, before_out) = (d.total_in(), out.len());
        let st = d.decompress_vec(&input[d.total_in() as usize..], &mut out, FlushDecompress::Finish)?;
        if st == Status::StreamEnd {
            return Ok((out, d.total_in() as usize));
        }
        if out.len() == out.capacity() {
            out.reserve(64 * 1024);
        } else if d.total_in() == before_in && out.len() == before_out {
            bail!("pacchetto git troncato");
        }
    }
}

fn apply_delta(base: &[u8], d: &[u8]) -> Result<Vec<u8>> {
    let bad = || anyhow!("delta git non valido");
    let mut p = 0usize;
    let byte = |p: &mut usize| -> Result<u8> {
        let b = *d.get(*p).ok_or_else(bad)?;
        *p += 1;
        Ok(b)
    };
    let varint = |p: &mut usize| -> Result<usize> {
        let (mut v, mut shift) = (0usize, 0);
        loop {
            let c = byte(p)?;
            v |= ((c & 0x7f) as usize) << shift;
            shift += 7;
            if c & 0x80 == 0 {
                return Ok(v);
            }
        }
    };
    if varint(&mut p)? != base.len() {
        return Err(bad());
    }
    let dst = varint(&mut p)?;
    let mut out = Vec::with_capacity(dst);
    while p < d.len() {
        let op = d[p];
        p += 1;
        if op & 0x80 != 0 {
            let (mut off, mut sz) = (0usize, 0usize);
            for i in 0..4 {
                if op & (1 << i) != 0 {
                    off |= (*d.get(p).ok_or_else(bad)? as usize) << (8 * i);
                    p += 1;
                }
            }
            for i in 0..3 {
                if op & (0x10 << i) != 0 {
                    sz |= (*d.get(p).ok_or_else(bad)? as usize) << (8 * i);
                    p += 1;
                }
            }
            if sz == 0 {
                sz = 0x10000;
            }
            out.extend_from_slice(base.get(off..off + sz).ok_or_else(bad)?);
        } else if op != 0 {
            out.extend_from_slice(d.get(p..p + op as usize).ok_or_else(bad)?);
            p += op as usize;
        } else {
            return Err(bad());
        }
    }
    if out.len() != dst {
        return Err(bad());
    }
    Ok(out)
}

enum Base {
    None,
    Ofs(usize),
    Ref(Oid),
}

/// Parse a packfile into id → (type, content). Types: 1 commit, 2 tree, 3 blob, 4 tag.
fn parse_pack(pack: &[u8]) -> Result<HashMap<Oid, (u8, Vec<u8>)>> {
    if pack.len() < 12 || &pack[..4] != b"PACK" {
        bail!("pacchetto git non valido");
    }
    let n = u32::from_be_bytes(pack[8..12].try_into().unwrap()) as usize;
    let mut pos = 12;
    let mut raw: Vec<(u8, Base, Vec<u8>)> = Vec::with_capacity(n);
    let mut at: HashMap<usize, usize> = HashMap::new();
    let get = |p: usize| pack.get(p).copied().ok_or_else(|| anyhow!("pacchetto git troncato"));
    for i in 0..n {
        let start = pos;
        let mut c = get(pos)?;
        pos += 1;
        let kind = (c >> 4) & 7;
        let mut size = (c & 15) as usize;
        let mut shift = 4;
        while c & 0x80 != 0 {
            c = get(pos)?;
            pos += 1;
            size |= ((c & 0x7f) as usize) << shift;
            shift += 7;
        }
        let base = match kind {
            6 => {
                let mut c = get(pos)?;
                pos += 1;
                let mut off = (c & 0x7f) as usize;
                while c & 0x80 != 0 {
                    c = get(pos)?;
                    pos += 1;
                    off = ((off + 1) << 7) | (c & 0x7f) as usize;
                }
                Base::Ofs(*at.get(&start.checked_sub(off).ok_or_else(|| anyhow!("delta git non valido"))?).ok_or_else(|| anyhow!("delta git non valido"))?)
            }
            7 => {
                let o: Oid = pack.get(pos..pos + 20).ok_or_else(|| anyhow!("pacchetto git troncato"))?.try_into().unwrap();
                pos += 20;
                Base::Ref(o)
            }
            1..=4 => Base::None,
            _ => bail!("oggetto git di tipo {kind} non supportato"),
        };
        let (data, used) = inflate(&pack[pos..], size)?;
        pos += used;
        at.insert(start, i);
        raw.push((kind, base, data));
    }
    // resolve deltas (bases may come later in the pack for REF_DELTA)
    let mut done: Vec<Option<(u8, Vec<u8>)>> = vec![None; raw.len()];
    let mut ids: HashMap<Oid, usize> = HashMap::new();
    let oid_of = |kind: u8, data: &[u8]| -> Oid {
        let name = match kind {
            1 => "commit",
            2 => "tree",
            3 => "blob",
            _ => "tag",
        };
        let mut h = Sha1::new();
        h.update(format!("{name} {}\0", data.len()).as_bytes());
        h.update(data);
        h.finalize().into()
    };
    loop {
        let mut progress = false;
        for i in 0..raw.len() {
            if done[i].is_some() {
                continue;
            }
            let resolved = match &raw[i].1 {
                Base::None => Some((raw[i].0, std::mem::take(&mut raw[i].2))),
                Base::Ofs(b) => done[*b].as_ref().map(|(k, d)| apply_delta(d, &raw[i].2).map(|x| (*k, x))).transpose()?,
                Base::Ref(o) => ids.get(o).and_then(|b| done[*b].as_ref()).map(|(k, d)| apply_delta(d, &raw[i].2).map(|x| (*k, x))).transpose()?,
            };
            if let Some((k, d)) = resolved {
                ids.insert(oid_of(k, &d), i);
                done[i] = Some((k, d));
                progress = true;
            }
        }
        if !progress {
            break;
        }
    }
    let mut out = HashMap::new();
    for (oid, i) in ids {
        if let Some(x) = done[i].take() {
            out.insert(oid, x);
        }
    }
    Ok(out)
}

/// Tree entries: (is_dir, name, id). Submodules and symlinks are skipped.
fn tree_entries(data: &[u8]) -> Vec<(bool, String, Oid)> {
    let mut out = Vec::new();
    let mut p = 0;
    while p < data.len() {
        let Some(sp) = data[p..].iter().position(|&b| b == b' ') else { break };
        let Some(nul) = data[p + sp..].iter().position(|&b| b == 0) else { break };
        let mode = &data[p..p + sp];
        let name = String::from_utf8_lossy(&data[p + sp + 1..p + sp + nul]).into_owned();
        let o = p + sp + nul + 1;
        let Some(id) = data.get(o..o + 20) else { break };
        p = o + 20;
        let is_dir = mode == b"40000";
        if is_dir || mode.starts_with(b"100") {
            out.push((is_dir, name, id.try_into().unwrap()));
        }
    }
    out
}

fn root_tree(objs: &HashMap<Oid, (u8, Vec<u8>)>, commit: &str) -> Result<Oid> {
    let c = unhex(commit).and_then(|o| objs.get(&o)).filter(|(k, _)| *k == 1).ok_or_else(|| anyhow!("commit mancante"))?;
    let line = String::from_utf8_lossy(&c.1);
    line.lines().next().and_then(|l| l.strip_prefix("tree ")).and_then(unhex).ok_or_else(|| anyhow!("commit non valido"))
}

// ───────────────────────── index & trees (cached) ─────────────────────────

fn cache() -> PathBuf {
    paths::cache_dir().join("polinetwork")
}

async fn indexed_root(i: usize) -> (usize, Result<Value>) {
    (i, root_folders(REPOS[i].0).await)
}

async fn root_folders(repo: &'static str) -> Result<Value> {
    let (commit, branch) = head(repo).await?;
    let objs = parse_pack(&fetch(repo, &[commit.clone()], &["deepen 1", "filter tree:1"]).await?)?;
    let root = root_tree(&objs, &commit)?;
    let tree = objs.get(&root).ok_or_else(|| anyhow!("cartella radice mancante"))?;
    let courses: Vec<String> = tree_entries(&tree.1).into_iter().filter(|(d, n, _)| *d && !n.starts_with('.')).map(|(_, n, _)| n).collect();
    Ok(json!({ "repo": repo, "head": commit, "branch": branch, "courses": courses }))
}

/// Every course folder of every repo. Cached for 7 days; a repo that fails keeps its previous entry.
pub async fn index(force: bool) -> Result<Value> {
    let f = cache().join("index.json");
    let old = util::read_json(&f).unwrap_or(json!({}));
    let fresh = old["at"].as_i64().map(|t| util::now_ms() - t < 7 * 86_400_000).unwrap_or(false);
    if fresh && !force && old["repos"].is_array() {
        return Ok(old);
    }
    let prev: HashMap<String, Value> = old["repos"].as_array().into_iter().flatten().map(|r| (util::s(r, "repo").to_string(), r.clone())).collect();
    let futs: Vec<_> = (0..REPOS.len()).map(indexed_root).collect();
    let results: Vec<(usize, Result<Value>)> = futures_util::stream::iter(futs).buffer_unordered(8).collect().await;
    let mut results = results;
    results.sort_by_key(|(i, _)| *i);
    let mut repos = Vec::new();
    let mut errors = 0;
    for (i, r) in results {
        let (repo, degree, year) = REPOS[i];
        match r {
            Ok(mut v) => {
                v["degree"] = json!(degree);
                v["year"] = json!(year);
                repos.push(v);
            }
            Err(_) => {
                errors += 1;
                if let Some(p) = prev.get(repo) {
                    repos.push(p.clone());
                }
            }
        }
    }
    if repos.is_empty() {
        bail!("Archivio PoliNetwork non raggiungibile: controlla la connessione");
    }
    let out = json!({ "at": util::now_ms(), "repos": repos });
    std::fs::create_dir_all(cache())?;
    if errors == 0 || !prev.is_empty() {
        util::write_json(&f, &out)?;
    }
    Ok(out)
}

/// All files of a repo: [[path, blob id], …]. Re-fetched only when the repo has new commits (checked at most hourly).
async fn repo_files(repo: &str) -> Result<(Value, String)> {
    let f = cache().join(format!("{}.json", lib::sanitize(repo, 60)));
    let old = util::read_json(&f);
    if let Some(o) = &old {
        if o["at"].as_i64().map(|t| util::now_ms() - t < 3_600_000).unwrap_or(false) {
            return Ok((o["files"].clone(), util::s(o, "branch").to_string()));
        }
    }
    let (commit, branch) = match head(repo).await {
        Ok(h) => h,
        Err(e) => match old {
            Some(o) => return Ok((o["files"].clone(), util::s(&o, "branch").to_string())), // offline: last known tree
            None => return Err(e),
        },
    };
    if let Some(mut o) = old.filter(|o| util::s(o, "head") == commit) {
        o["at"] = json!(util::now_ms());
        let _ = util::write_json(&f, &o);
        return Ok((o["files"].clone(), branch));
    }
    let objs = parse_pack(&fetch(repo, &[commit.clone()], &["deepen 1", "filter blob:none"]).await?)?;
    let mut files = Vec::new();
    let mut stack = vec![(String::new(), root_tree(&objs, &commit)?)];
    while let Some((prefix, t)) = stack.pop() {
        let Some((2, data)) = objs.get(&t).map(|(k, d)| (*k, d)) else { continue };
        for (is_dir, name, id) in tree_entries(data) {
            let p = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
            if is_dir {
                stack.push((p, id));
            } else {
                files.push(json!([p, hex(&id)]));
            }
        }
    }
    files.sort_by(|a, b| util::natural_cmp(a[0].as_str().unwrap_or(""), b[0].as_str().unwrap_or("")));
    let v = json!({ "at": util::now_ms(), "head": commit, "branch": branch, "files": files });
    std::fs::create_dir_all(cache())?;
    util::write_json(&f, &v)?;
    Ok((v["files"].clone(), branch))
}

// ───────────────────────── matching a course to folders ─────────────────────────

const STOP: &[&str] = &[
    "di", "de", "del", "della", "delle", "dei", "degli", "dello", "e", "ed", "per", "la", "il", "lo", "le", "gli", "l", "a", "al", "alla", "ai", "agli", "in", "nel", "nella", "nei", "nelle", "con", "su", "da", "of", "and",
    "the", "for", "to", "on", "with", "an", "prof", "corso", "course", "modulo", "module", "parte", "part", "c", "i",
];

fn fold(c: char) -> char {
    match c {
        'à' | 'á' | 'â' | 'ä' => 'a',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ò' | 'ó' | 'ô' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        _ => c,
    }
}

fn tokens(s: &str) -> Vec<String> {
    static RX_BR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[[^\]]*\]|\([^)]*\)|\b\d{5,}\b").unwrap());
    let s = display_name(s).to_lowercase();
    let s = RX_BR.replace_all(&s, " ");
    let mut t: Vec<String> = s.chars().map(fold).collect::<String>().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(String::from).collect();
    // roman numerals at the end: "Analisi II" == "Analisi 2"
    if let Some(last) = t.last_mut() {
        if let Some(n) = ["i", "ii", "iii", "iv", "v"].iter().position(|r| r == last) {
            if t.len() > 1 {
                *t.last_mut().unwrap() = (n + 1).to_string();
            }
        }
    }
    t.into_iter().filter(|w| !STOP.contains(&w.as_str())).collect()
}

fn same_word(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    // calcolatori / calcolatore, statistic / statistics
    let (ca, cb): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let common = ca.iter().zip(&cb).take_while(|(x, y)| x == y).count();
    common >= 6 && common + 2 >= ca.len().max(cb.len())
}

fn lev(a: &[char], b: &[char]) -> usize {
    let mut row: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut prev = row[0];
        row[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cur = row[j + 1];
            row[j + 1] = (prev + (ca != cb) as usize).min(row[j] + 1).min(row[j + 1] + 1);
            prev = cur;
        }
    }
    row[b.len()]
}

/// 0..1: how well a course name matches a folder name.
pub fn score(course: &str, folder: &str) -> f64 {
    let (a, b) = (tokens(course), tokens(folder));
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let (ja, jb) = (a.concat(), b.concat());
    if ja == jb {
        return 1.0;
    }
    let mut best: f64 = 0.0;
    // acronyms: ACSO = Architettura dei Calcolatori e Sistemi Operativi
    let initials = |t: &[String]| t.iter().filter_map(|w| w.chars().next()).collect::<String>();
    if (a.len() >= 3 && initials(&a) == jb) || (b.len() >= 3 && initials(&b) == ja) {
        best = 0.92;
    }
    // shared words
    let shared = a.iter().filter(|x| b.iter().any(|y| same_word(x, y))).count();
    let dice = 2.0 * shared as f64 / (a.len() + b.len()) as f64;
    best = best.max(dice);
    // one name contained in the other: "Analisi 2" in "Analisi Matematica 2"
    let (small, big) = if a.len() <= b.len() { (&a, &b) } else { (&b, &a) };
    if small.iter().all(|x| big.iter().any(|y| same_word(x, y))) && small.iter().any(|w| w.len() >= 4) {
        best = best.max(0.6 + 0.3 * small.len() as f64 / big.len() as f64);
    }
    // short spellings: ANN&DL ~ AN2DL
    let (ca, cb): (Vec<char>, Vec<char>) = (ja.chars().collect(), jb.chars().collect());
    let m = ca.len().max(cb.len());
    if m >= 4 {
        best = best.max(0.95 * (1.0 - lev(&ca, &cb) as f64 / m as f64));
    }
    // Analisi 1 ≠ Analisi 2, Fisica I ≠ Fisica II
    let nums = |t: &[String]| t.iter().filter(|w| w.chars().all(|c| c.is_ascii_digit())).cloned().collect::<Vec<_>>();
    let (na, nb) = (nums(&a), nums(&b));
    if !na.is_empty() && !nb.is_empty() && na != nb {
        best = best.min(0.45);
    }
    best
}

/// Folders of the index that could be this course, best first.
/// `names`: course name(s) as the student sees them; `prefer`: repos already used by the student's other courses.
pub fn candidates(idx: &Value, names: &[String], prefer: &HashSet<String>, limit: usize) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    for r in idx["repos"].as_array().into_iter().flatten() {
        let repo = util::s(r, "repo");
        for f in r["courses"].as_array().into_iter().flatten().filter_map(Value::as_str) {
            let mut s = names.iter().map(|n| score(n, f)).fold(0.0, f64::max);
            if s < 0.5 {
                continue;
            }
            if prefer.contains(repo) {
                s = (s + 0.05).min(1.0);
            }
            out.push(json!({
                "repo": repo, "folder": f, "name": display_name(f), "degree": r["degree"], "year": r["year"], "score": (s * 100.0).round() / 100.0,
                "web": web_url(repo, util::s(r, "branch"), f),
            }));
        }
    }
    out.sort_by(|a, b| b["score"].as_f64().partial_cmp(&a["score"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
    out.truncate(limit);
    out
}

pub fn describe(repo: &str, folder: &str) -> Value {
    let (degree, year) = repo_meta(repo).map(|m| (m.1, m.2)).unwrap_or(("", ""));
    json!({ "repo": repo, "folder": folder, "name": display_name(folder), "degree": degree, "year": year })
}

// ───────────────────────── files of a course ─────────────────────────

fn local_root(course_dir: &Path) -> PathBuf {
    course_dir.join("materiale").join(LOCAL_DIR)
}

fn sidecar(course_dir: &Path) -> Value {
    util::read_json(&local_root(course_dir).join(SIDECAR)).filter(Value::is_object).unwrap_or_else(|| json!({}))
}

/// Local folder name for a linked source: the course folder name, disambiguated when two sources share it.
fn source_dir(links: &[Value], repo: &str, folder: &str) -> String {
    let name = display_name(folder);
    let clash = links.iter().filter(|l| display_name(util::s(l, "folder")) == name).count() > 1;
    lib::sanitize(&if clash { format!("{name} ({repo})") } else { name }, 120)
}

/// `a/b/c.pdf` → safe relative path (no `..`, no illegal characters).
fn safe_rel(p: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for part in p.split('/') {
        let s = lib::sanitize(&display_name(part), 150);
        if s.is_empty() || s == "." || s == ".." {
            return None;
        }
        out.push(s);
    }
    Some(out)
}

/// Downloaded PoliNetwork files of a course, relative to materiale/ (for the Materiale tab).
pub fn local_files(course_dir: &Path) -> Vec<String> {
    sidecar(course_dir).as_object().map(|o| o.keys().map(|k| format!("{LOCAL_DIR}/{k}")).collect()).unwrap_or_default()
}

/// Files of the linked folders, with their local state (`new`, `local`, `updated`).
pub async fn course_tree(course_dir: &Path, links: &[Value]) -> Result<Value> {
    let side = sidecar(course_dir);
    let root = local_root(course_dir);
    let mut sources = Vec::new();
    for l in links {
        let (repo, folder) = (util::s(l, "repo"), util::s(l, "folder"));
        let mut src = describe(repo, folder);
        match repo_files(repo).await {
            Ok((files, branch)) => {
                let dir = source_dir(links, repo, folder);
                let prefix = format!("{folder}/");
                let list: Vec<Value> = files
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|f| {
                        let p = f[0].as_str()?.strip_prefix(&prefix)?;
                        let base = p.rsplit('/').next().unwrap_or(p);
                        if base.starts_with('.') || base.eq_ignore_ascii_case("Thumbs.db") || base.eq_ignore_ascii_case("desktop.ini") {
                            return None;
                        }
                        let oid = f[1].as_str()?;
                        let rel = safe_rel(p)?;
                        let key = format!("{dir}/{}", rel.to_string_lossy().replace('\\', "/"));
                        let exists = root.join(&key).exists();
                        let state = match side.get(&key).map(|x| util::s(x, "oid")) {
                            Some(o) if exists && o == oid => "local",
                            Some(_) if exists => "updated",
                            _ if exists => "local",
                            _ => "new",
                        };
                        Some(json!({ "path": p, "oid": oid, "state": state, "local": key }))
                    })
                    .collect();
                src["web"] = json!(web_url(repo, &branch, folder));
                src["files"] = json!(list);
            }
            Err(e) => {
                src["web"] = json!(web_url(repo, "", folder));
                src["error"] = json!(e.to_string());
                src["files"] = json!([]);
            }
        }
        sources.push(src);
    }
    Ok(json!({ "sources": sources }))
}

/// Download the chosen files (`[{repo, folder, path, oid}]`), a few blobs per request.
/// `on(done, total, file)` reports progress; returns (downloaded, failed).
pub async fn download(course_dir: &Path, links: &[Value], items: &[Value], on: &(dyn Fn(usize, usize, &str) + Send + Sync), stop: &(dyn Fn() -> bool + Send + Sync)) -> Result<(usize, usize)> {
    lib::ensure_drive(course_dir)?;
    let root = local_root(course_dir);
    std::fs::create_dir_all(&root)?;
    let mut by_repo: HashMap<String, Vec<(String, PathBuf, String, String)>> = HashMap::new();
    for it in items {
        let (repo, folder, p, oid) = (util::s(it, "repo"), util::s(it, "folder"), util::s(it, "path"), util::s(it, "oid"));
        let (Some(rel), Some(_)) = (safe_rel(p), unhex(oid)) else { continue };
        let key = format!("{}/{}", source_dir(links, repo, folder), rel.to_string_lossy().replace('\\', "/"));
        by_repo.entry(repo.to_string()).or_default().push((oid.to_string(), root.join(&key), key, format!("{folder}/{p}")));
    }
    let total: usize = by_repo.values().map(Vec::len).sum();
    let (mut done, mut failed) = (0, 0);
    on(0, total, "");
    for (repo, files) in by_repo {
        for chunk in files.chunks(8) {
            if stop() {
                return Ok((done, failed));
            }
            let wants: Vec<String> = chunk.iter().map(|f| f.0.clone()).collect::<HashSet<_>>().into_iter().collect();
            let objs = match fetch(&repo, &wants, &[]).await.and_then(|p| parse_pack(&p)) {
                Ok(o) => o,
                Err(_) => {
                    failed += chunk.len();
                    continue;
                }
            };
            let mut side = sidecar(course_dir);
            for (oid, dest, key, src) in chunk {
                let blob = unhex(oid).and_then(|o| objs.get(&o)).filter(|(k, _)| *k == 3);
                match blob.map(|(_, data)| {
                    if let Some(d) = dest.parent() {
                        std::fs::create_dir_all(d)?;
                    }
                    util::write_atomic(dest, data)
                }) {
                    Some(Ok(())) => {
                        side[key.as_str()] = json!({ "repo": repo, "path": src, "oid": oid, "at": util::now_iso() });
                        done += 1;
                    }
                    _ => failed += 1,
                }
                on(done + failed, total, key);
            }
            util::write_json(&root.join(SIDECAR), &side)?;
        }
    }
    Ok((done, failed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matching() {
        assert!(score("Architettura dei Calcolatori e Sistemi Operativi", "ACSO") > 0.9);
        assert!(score("ANALISI MATEMATICA II", "ANALISI 2") >= 0.75);
        assert!(score("MACHINE LEARNING", "Machine Learning") == 1.0);
        assert!(score("ANN&DL", "AN2DL") >= 0.75);
        assert!(score("Complessità nei Sistemi e nelle Reti", "Complessit#U00e0 nei Sistemi e nelle Reti") == 1.0);
        assert!(score("Image Analysis", "Computer Graphics") < 0.5);
        assert!(score("Fisica Tecnica", "Fisica I") < 0.8);
        assert!(score("CS", "CORSI A SCELTA") < 0.5);
        assert!(score("Analisi 2", "ANALISI I") < 0.5);
    }

    #[test]
    fn delta() {
        let base = b"hello world";
        // src 11, dst 11, copy 0..6 ("hello "), insert "there"
        let d = [11u8, 11, 0x80 | 0x10, 6, 5, b't', b'h', b'e', b'r', b'e'];
        assert_eq!(apply_delta(base, &d).unwrap(), b"hello there");
    }

    /// cargo test -p polidesk-core polinetwork -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live() {
        let (files, branch) = repo_files("info2y").await.unwrap();
        let n = files.as_array().unwrap().len();
        println!("info2y@{branch}: {n} file");
        assert!(n > 100);
        let f = files.as_array().unwrap().iter().find(|f| f[0].as_str().unwrap().ends_with(".pdf")).unwrap().clone();
        let oid = f[1].as_str().unwrap().to_string();
        let objs = parse_pack(&fetch("info2y", &[oid.clone()], &[]).await.unwrap()).unwrap();
        let (k, data) = objs.get(&unhex(&oid).unwrap()).unwrap();
        assert_eq!(*k, 3);
        assert!(data.starts_with(b"%PDF"));
        println!("{} → {} byte", f[0], data.len());
    }
}

#[cfg(test)]
mod live_index {
    /// cargo test -p polidesk-core live_index -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn index_and_match() {
        let t = std::time::Instant::now();
        let idx = super::index(true).await.unwrap();
        let n: usize = idx["repos"].as_array().unwrap().iter().map(|r| r["courses"].as_array().unwrap().len()).sum();
        println!("{} repo, {n} cartelle in {:?}", idx["repos"].as_array().unwrap().len(), t.elapsed());
        for names in [vec!["ANN&DL", "ARTIFICIAL NEURAL NETWORKS AND DEEP LEARNING"], vec!["DIMA"], vec!["Image Analysis"], vec!["MACHINE LEARNING"], vec!["CS", "COMPUTER SECURITY"], vec!["Architettura dei calcolatori e sistemi operativi"], vec!["Analisi Matematica I"]] {
            let names: Vec<String> = names.into_iter().map(String::from).collect();
            let c = super::candidates(&idx, &names, &Default::default(), 4);
            println!("{:?} → {}", names, c.iter().map(|x| format!("{}/{} ({})", x["repo"].as_str().unwrap(), x["name"].as_str().unwrap(), x["score"])).collect::<Vec<_>>().join(" · "));
        }
    }
}
