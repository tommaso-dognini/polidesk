#!/usr/bin/env python3
"""
PoliDesk semantic search worker (long-running, JSON lines on stdin/stdout).

Embeddings: fastembed (Apache-2.0, ONNX runtime — no PyTorch) with the multilingual model
sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 (Apache-2.0), so Italian queries
find English lectures and vice versa. PDF text: pypdf (BSD).

Commands:
  {"id":1,"cmd":"index","scope":"<id>","dir":"<index dir>","chunks":[{"id":..,"text":..,"meta":{..}}, {"pdf":"/path.pdf","meta":{..}}]}
      → {"id":1,"ok":true,"total":N,"added":M,"removed":K}
  {"id":2,"cmd":"query","dirs":["<index dir>",...],"text":"...","k":20}
      → {"id":2,"ok":true,"results":[{"score":0.53,"text":..,"meta":{..}}]}
  {"id":3,"cmd":"ping"}
"""
import sys, os, json, hashlib, re

MODEL = os.environ.get("POLIDESK_EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
_model = None
_cache = {}   # dir -> (meta list, matrix)


def out(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(MODEL)
    return _model


def embed(texts):
    import numpy as np
    if not texts:
        return np.zeros((0, 384), dtype="float32")
    v = np.array(list(model().embed(texts, batch_size=64)), dtype="float32")
    v /= (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
    return v


def pdf_chunks(path, meta):
    from pypdf import PdfReader
    try:
        r = PdfReader(path)
    except Exception:
        return []
    out_ = []
    for i, p in enumerate(r.pages):
        try:
            t = p.extract_text() or ""
        except Exception:
            t = ""
        t = re.sub(r"\s+", " ", t).strip()
        if len(t) < 40:
            continue
        for j in range(0, len(t), 1200):
            part = t[j:j + 1400]
            m = dict(meta, page=i + 1)
            out_.append({"id": hashlib.sha1((path + str(i) + str(j) + part).encode()).hexdigest(), "text": part, "meta": m})
    return out_


def load(d):
    import numpy as np
    if d in _cache:
        return _cache[d]
    try:
        meta = json.load(open(os.path.join(d, "chunks.json"), encoding="utf-8"))
        mat = np.load(os.path.join(d, "vectors.npy"))
    except Exception:
        meta, mat = [], np.zeros((0, 384), dtype="float32")
    _cache[d] = (meta, mat)
    return _cache[d]


def save(d, meta, mat):
    import numpy as np
    os.makedirs(d, exist_ok=True)
    json.dump(meta, open(os.path.join(d, "chunks.json.tmp"), "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(os.path.join(d, "chunks.json.tmp"), os.path.join(d, "chunks.json"))
    np.save(os.path.join(d, "vectors.tmp.npy"), mat)
    os.replace(os.path.join(d, "vectors.tmp.npy"), os.path.join(d, "vectors.npy"))
    _cache[d] = (meta, mat)


def cmd_index(req):
    import numpy as np
    d = req["dir"]
    chunks = []
    pdf_cache_path = os.path.join(d, "pdf-cache.json")
    try:
        pdf_cache = json.load(open(pdf_cache_path, encoding="utf-8"))
    except Exception:
        pdf_cache = {}
    for c in req["chunks"]:
        if "pdf" in c:
            p = c["pdf"]
            try:
                mt = str(os.path.getmtime(p))
            except OSError:
                continue
            key = p + "|" + mt
            if key not in pdf_cache:
                pdf_cache[key] = pdf_chunks(p, c.get("meta", {}))
            chunks.extend(pdf_cache[key])
        else:
            if not c.get("id"):
                c["id"] = hashlib.sha1((c["text"] + json.dumps(c.get("meta", {}), sort_keys=True)).encode()).hexdigest()
            chunks.append(c)
    # keep only current pdf entries in cache
    live = {c["pdf"] + "|" + str(os.path.getmtime(c["pdf"])) for c in req["chunks"] if "pdf" in c and os.path.exists(c["pdf"])}
    pdf_cache = {k: v for k, v in pdf_cache.items() if k in live}
    os.makedirs(d, exist_ok=True)
    json.dump(pdf_cache, open(pdf_cache_path, "w", encoding="utf-8"), ensure_ascii=False)

    old_meta, old_mat = load(d)
    old_idx = {m["id"]: i for i, m in enumerate(old_meta)}
    new_ids = [c["id"] for c in chunks]
    keep = [old_idx[i] for i in new_ids if i in old_idx]
    todo = [c for c in chunks if c["id"] not in old_idx]
    vecs = embed([c["text"] for c in todo])
    meta = [old_meta[i] for i in keep] + [{"id": c["id"], "text": c["text"], "meta": c.get("meta", {})} for c in todo]
    mat = np.vstack([old_mat[keep] if len(keep) else np.zeros((0, vecs.shape[1] if len(vecs) else 384), dtype="float32"), vecs]) if (len(keep) or len(vecs)) else np.zeros((0, 384), dtype="float32")
    save(d, meta, mat)
    return {"total": len(meta), "added": len(todo), "removed": len(old_meta) - len(keep)}


def cmd_query(req):
    import numpy as np
    q = embed([req["text"]])[0]
    words = [w for w in re.findall(r"\w{3,}", req["text"].lower())]
    res = []
    for d in req["dirs"]:
        meta, mat = load(d)
        if not len(meta):
            continue
        s = mat @ q
        # small lexical boost: exact words from the query
        if words:
            for i, m in enumerate(meta):
                t = m["text"].lower()
                hits = sum(1 for w in words if w in t)
                if hits:
                    s[i] += 0.04 * hits
        top = np.argsort(-s)[: req.get("k", 20)]
        for i in top:
            res.append({"score": float(s[i]), "text": meta[i]["text"], "meta": meta[i]["meta"]})
    res.sort(key=lambda r: -r["score"])
    return {"results": res[: req.get("k", 20)]}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            continue
        rid = req.get("id")
        try:
            if req["cmd"] == "ping":
                model()
                out({"id": rid, "ok": True})
            elif req["cmd"] == "index":
                out({"id": rid, "ok": True, **cmd_index(req)})
            elif req["cmd"] == "query":
                out({"id": rid, "ok": True, **cmd_query(req)})
            elif req["cmd"] == "drop":
                _cache.pop(req["dir"], None)
                out({"id": rid, "ok": True})
        except Exception as e:
            out({"id": rid, "ok": False, "error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    main()
