#!/usr/bin/env python3
"""
Non-interactive wrapper around video_transcription.py, used by the PoliRec app.

  python3 transcribe_cli.py --model small --language it --formats txt,srt --out-dir DIR video1.mp4 [video2.mp4 ...]

Emits one JSON object per line on stdout:
  {"event": "start", "video": ...} / {"event": "progress", "video": ..., "percent": 42.0}
  {"event": "done", "video": ..., "files": [...]} / {"event": "error", "video": ..., "error": ...}
The model is loaded once for all videos. Uses mlx-whisper on Apple Silicon when installed
(much faster), otherwise openai-whisper.
"""
import argparse, json, os, sys, re, threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from video_transcription import format_as_srt, format_as_vtt  # reuse the original formatters


def emit(**kw):
    sys.stdout.write(json.dumps(kw, ensure_ascii=False) + "\n")
    sys.stdout.flush()


class TqdmCapture:
    """Whisper reports progress through tqdm on stderr; turn it into JSON events."""
    def __init__(self, video):
        self.video = video
        self.last = -1

    def write(self, s):
        m = re.findall(r"(\d{1,3})%\|", s)
        if m:
            p = int(m[-1])
            if p != self.last:
                self.last = p
                emit(event="progress", video=self.video, percent=p)

    def flush(self):
        pass


MLX_REPOS = {
    "tiny": "mlx-community/whisper-tiny-mlx", "base": "mlx-community/whisper-base-mlx",
    "small": "mlx-community/whisper-small-mlx", "medium": "mlx-community/whisper-medium-mlx",
    "large": "mlx-community/whisper-large-v3-mlx", "large-v3": "mlx-community/whisper-large-v3-mlx",
    "large-v3-turbo": "mlx-community/whisper-large-v3-turbo", "turbo": "mlx-community/whisper-large-v3-turbo",
}


def load_engine(engine, model, device="auto"):
    """Returns (name, run(path, language) -> {"text", "segments", "language"})."""
    import importlib.util as iu
    if engine == "auto":
        engine = "mlx" if iu.find_spec("mlx_whisper") else "faster" if iu.find_spec("faster_whisper") else "whisper"

    if engine == "parakeet":
        # NVIDIA Parakeet TDT v3 (CC-BY-4.0) via parakeet-mlx (Apache-2.0) — the engine used by Handy.
        # Multilingual (25 EU languages, auto-detected); verbatim (fillers are removed by PoliRec's cleaner).
        from parakeet_mlx import from_pretrained
        repo = model if "/" in model else "mlx-community/parakeet-tdt-0.6b-v3"
        m = from_pretrained(repo)
        def run(path, language):
            r = m.transcribe(path, chunk_duration=120, overlap_duration=15)
            segs = []
            for sent in r.sentences:
                toks = getattr(sent, "tokens", None) or []
                if not toks or sent.end - sent.start < 12:
                    segs.append({"start": sent.start, "end": sent.end, "text": sent.text.strip()})
                    continue
                cur, start = "", None
                prev_end = None
                for tk in toks:
                    # cut before a new word once the segment is ~6 s long (tokens carry their leading space)
                    if start is not None and tk.start - start > 6 and tk.text.startswith(" "):
                        segs.append({"start": start, "end": prev_end, "text": cur.strip()})
                        cur, start = "", None
                    if start is None:
                        start = tk.start
                    cur += tk.text
                    prev_end = tk.end
                if cur.strip():
                    segs.append({"start": start, "end": toks[-1].end, "text": cur.strip()})
            return {"text": " ".join(s["text"] for s in segs), "segments": segs, "language": language or "auto"}
        return "parakeet-mlx", run

    if engine == "mlx":
        import mlx_whisper
        repo = model if "/" in model else MLX_REPOS.get(model, f"mlx-community/whisper-{model}-mlx")
        def run(path, language):
            return mlx_whisper.transcribe(path, path_or_hf_repo=repo, language=language, verbose=False)
        return "mlx-whisper", run

    if engine == "faster":
        from faster_whisper import WhisperModel
        dev = device
        if dev == "auto":
            try:
                import ctranslate2
                dev = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
            except Exception:
                dev = "cpu"
        m = WhisperModel(model, device=dev, compute_type="float16" if dev == "cuda" else "int8")
        def run(path, language):
            segs, info = m.transcribe(path, language=language, vad_filter=True, beam_size=5)
            total = info.duration or 1
            out, last = [], -1
            for sg in segs:
                out.append({"start": sg.start, "end": sg.end, "text": sg.text})
                p = int(min(100, sg.end / total * 100))
                if p != last:
                    last = p
                    emit(event="progress", video=CURRENT[0], percent=p)
            return {"text": "".join(s["text"] for s in out).strip(), "segments": out, "language": info.language}
        return f"faster-whisper ({dev})", run

    import whisper
    m = whisper.load_model(model)
    def run(path, language):
        opts = {"verbose": False, "fp16": False}
        if language:
            opts["language"] = language
        return m.transcribe(path, **opts)
    return "openai-whisper", run


CURRENT = [""]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="*")
    ap.add_argument("--warmup", action="store_true", help="only download/load the model")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default="it", help="'auto' for autodetect")
    ap.add_argument("--formats", default="txt,srt")
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--engine", default="auto", choices=["auto", "mlx", "faster", "whisper", "parakeet"])
    a = ap.parse_args()
    language = None if a.language in ("auto", "", None) else a.language
    formats = [f.strip() for f in a.formats.split(",") if f.strip()]

    emit(event="loading", model=a.model)
    try:
        engine, run = load_engine(a.engine, a.model, a.device)
    except Exception as e:
        emit(event="fatal", error=f"Impossibile caricare Whisper: {e}")
        sys.exit(2)
    emit(event="loaded", engine=engine, model=a.model)
    if a.warmup:
        # run once on 1 s of silence so lazy engines (mlx) actually download the weights
        import wave, tempfile
        tmp = os.path.join(tempfile.gettempdir(), "polirec_warmup.wav")
        with wave.open(tmp, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b"\x00\x00" * 16000)
        run(tmp, "en")
        emit(event="warm", engine=engine, model=a.model)
        return

    for v in a.videos:
        vp = Path(v)
        out_dir = Path(a.out_dir) if a.out_dir else vp.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        CURRENT[0] = str(vp)
        emit(event="start", video=str(vp))
        old_err = sys.stderr
        sys.stderr = TqdmCapture(str(vp))
        try:
            result = run(str(vp), language)
        except Exception as e:
            sys.stderr = old_err
            emit(event="error", video=str(vp), error=str(e))
            continue
        finally:
            sys.stderr = old_err
        files = []
        stem = vp.stem
        writers = {
            "txt": lambda: result["text"].strip() + "\n",
            "srt": lambda: format_as_srt(result["segments"]),
            "vtt": lambda: format_as_vtt(result["segments"]).replace(",", "."),
            "json": lambda: json.dumps(result, ensure_ascii=False, indent=1),
        }
        for f in formats:
            if f in writers:
                p = out_dir / f"{stem}.{f}"
                tmp = p.with_suffix(p.suffix + ".tmp")
                tmp.write_text(writers[f](), encoding="utf-8")
                os.replace(tmp, p)
                files.append(str(p))
        emit(event="done", video=str(vp), files=files, language=result.get("language"), words=len(result["text"].split()))


if __name__ == "__main__":
    main()
