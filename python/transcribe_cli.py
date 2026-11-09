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


def load_engine(engine, model):
    if engine in ("auto", "mlx"):
        try:
            import mlx_whisper  # noqa
            repo = model if "/" in model else f"mlx-community/whisper-{model}-mlx" if model != "large" else "mlx-community/whisper-large-v3-mlx"
            def run(path, language):
                import mlx_whisper
                return mlx_whisper.transcribe(path, path_or_hf_repo=repo, language=language, verbose=False)
            return "mlx", run
        except ImportError:
            if engine == "mlx":
                raise
    import whisper
    m = whisper.load_model(model)
    def run(path, language):
        opts = {"verbose": False, "fp16": False}
        if language:
            opts["language"] = language
        return m.transcribe(path, **opts)
    return "openai-whisper", run


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default="it", help="'auto' for autodetect")
    ap.add_argument("--formats", default="txt,srt")
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--engine", default="auto", choices=["auto", "mlx", "whisper"])
    a = ap.parse_args()
    language = None if a.language in ("auto", "", None) else a.language
    formats = [f.strip() for f in a.formats.split(",") if f.strip()]

    emit(event="loading", model=a.model)
    try:
        engine, run = load_engine(a.engine, a.model)
    except Exception as e:
        emit(event="fatal", error=f"Impossibile caricare Whisper: {e}")
        sys.exit(2)
    emit(event="loaded", engine=engine, model=a.model)

    for v in a.videos:
        vp = Path(v)
        out_dir = Path(a.out_dir) if a.out_dir else vp.parent
        out_dir.mkdir(parents=True, exist_ok=True)
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
