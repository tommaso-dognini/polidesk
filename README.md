# PoliRec

Scarica, trascrive e organizza le registrazioni delle lezioni del Politecnico di Milano
(WeBeep → Archivio registrazioni RecMan → WebEx) e genera appunti con Claude Code,
Antigravity CLI o Gemini CLI.

Nato da [PoliWebex](https://github.com/sup3rgiu/PoliWebex) (MIT, @sup3rgiu): il codice originale
con le modifiche V2 è in [`legacy/`](legacy/).

## Cosa fa

- **Trova le registrazioni ovunque siano nel corso**: scansiona la pagina del corso, *tutte* le
  sezioni e l'interno di ogni attività URL/Pagina. Supporta più archivi per corso (es. un archivio
  per docente), link WebEx diretti, mp4 caricati su WeBeep e YouTube (con `yt-dlp`).
- **Accetta il corso in qualsiasi forma**: link WeBeep, codice PoliMi (`054307`), nome, oppure
  scelto dalla lista dei tuoi corsi.
- **Login una volta sola**: usa il tuo Chrome con un profilo dedicato (`~/.polirec/chrome-profile`)
  e salva *tutti* i cookie (anche di sessione) in `~/.polirec/cookies.json`. Quando serve un nuovo
  login SPID, l'app te lo segnala e aspetta che tu lo completi.
- **Download incrementali e paralleli** con aria2c (ffmpeg per HLS), ripresa dei download interrotti,
  file `.part` finché non sono completi.
- **Trascrizione automatica** con Whisper (il tuo `video_transcription.py`, usato tramite
  `python/transcribe_cli.py`; usa `mlx-whisper` se installato, molto più veloce su Apple Silicon).
- **Note AI** per ogni lezione (appunti, riassunto, spiegazione, flashcard) oppure **agente sul corso**
  che lavora su tutte le trascrizioni (riassunto del corso, guida d'esame, glossario…).

## Struttura di un corso

```
<cartella corso>/
  video/          2026-09-16 - Lecture 1 Course Introduction (Matteucci).mp4
  trascrizioni/   … .txt + .srt
  note/           … - appunti.md, - riassunto.md, 00_riassunto_corso.md
  polirec.json    metadati e stato di ogni registrazione
  INDICE.md       indice con link a video, trascrizioni e note
```

## Requisiti

- Node.js ≥ 18, Google Chrome
- `aria2c` e `ffmpeg` (`brew install aria2 ffmpeg`)
- Python 3 con `openai-whisper` (o `mlx-whisper`)
- opzionali: `claude` (Claude Code), `agy` (Antigravity), `gemini`, `yt-dlp`

## Uso

```bash
npm install
npm start                 # app
```

Da terminale (stesso motore e stessa configurazione dell'app):

```bash
node src/cli.js courses                       # i tuoi corsi WeBeep
node src/cli.js add 054307 "/Volumes/SSD/ANN&DL" "ANN&DL"
node src/cli.js list
node src/cli.js sync                          # tutti i corsi (o: sync 1 / sync ann)
node src/cli.js sync 1 --dry-run              # mostra cosa scaricherebbe
node src/cli.js transcribe 1
```

Configurazione in `~/.polirec/config.json`. Se un corso tiene le registrazioni in un posto che
PoliRec non trova da solo, aggiungi il link nelle *Impostazioni corso → Link extra*.
In caso di problemi, screenshot e HTML delle pagine vengono salvati in `~/.polirec/debug/`.
