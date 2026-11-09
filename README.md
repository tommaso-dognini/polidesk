# PoliRec

App desktop (macOS, Windows, Linux) per gli studenti del Politecnico di Milano:
scarica le **registrazioni delle lezioni** e il **materiale** dei tuoi corsi WeBeep, le **trascrive**
con Whisper sul tuo computer e genera **sommari, appunti e flashcard** con Antigravity CLI,
Claude Code o Gemini CLI.

Nato da [PoliWebex](https://github.com/sup3rgiu/PoliWebex) e dai progetti della community raccolti da
[PoliNetwork](https://polinetwork.org/it/projects/): vedi [NOTICE.md](NOTICE.md) e la pagina *Community* dell'app.

## Provarla

```bash
cd ~/Documents/dev/polirec
npm install
npm start
```

Al primo avvio parte il **setup**: analizza il sistema e installa la trascrizione più adatta
in un ambiente privato (`~/.polirec/venv`, non tocca il Python di sistema):

| Hardware | Motore | Modello |
|---|---|---|
| Mac Apple Silicon | mlx-whisper (GPU Metal) | large-v3-turbo (≥16 GB RAM), small, base |
| GPU NVIDIA | faster-whisper (CUDA) | large-v3-turbo |
| Solo CPU | faster-whisper (int8) | small / base / tiny in base a RAM e core |

Se non trova un Python adatto installa [uv](https://github.com/astral-sh/uv), che scarica Python 3.12 da solo.
ffmpeg è incluso nell'app; aria2c è opzionale (c'è un downloader interno con connessioni parallele).
Per il login serve Google Chrome (o Edge/Chromium).

## Pacchetti installabili

```bash
npm run dist:mac      # .dmg + .zip (arm64 e x64)
npm run dist:win      # installer .exe (NSIS)
npm run dist:linux    # .AppImage + .deb
```

Ogni pacchetto va creato sul proprio sistema operativo (ffmpeg incluso è specifico della piattaforma).
Il workflow GitHub Actions in `.github/workflows/build.yml` li crea tutti e tre su tag `v*`.
Su macOS l'app non è firmata: al primo avvio usa *tasto destro → Apri*.

## Cosa fa

- **Dashboard** con tutti i corsi in ordine di priorità; **sync automatica all'avvio** (e ogni N ore) in quell'ordine.
- **Trova le registrazioni ovunque siano**: pagina del corso, tutte le sezioni, attività URL/Pagina,
  annunci del forum. Supporta più archivi RecMan per corso, link WebEx diretti (anche `ldr.php?RCID=`),
  mp4 caricati su WeBeep, YouTube (con `yt-dlp`).
- **Il corso si aggiunge come vuoi**: link di qualsiasi pagina WeBeep (anche `section.php`), codice
  (`054307`), nome, oppure dalla lista dei tuoi corsi.
- **Materiale del corso** (opzionale, chiesto quando aggiungi il corso): slide, PDF e cartelle per sezione,
  aggiornamento incrementale, link esterni raccolti in `materiale/LINK.md`.
- **Pagina della lezione**: player interno (play/pausa, ±10 s, velocità 0.75–3×, schermo intero,
  salto dei silenzi, riprende da dove eri rimasto), trascrizione sincronizzata e cercabile
  (clic su una frase → salta a quel punto), note, "Apri con app di sistema".
- **Riepilogo del corso** `INDICE.html` / `INDICE.md`: ogni lezione con breve descrizione degli argomenti
  (generata dall'AI dalla trascrizione) e link rapidi a video, WebEx, trascrizione e note.
- **AI**: sommario automatico dopo la trascrizione; appunti/riassunto/spiegazioni/flashcard per lezione;
  agente sul corso (riassunto dell'intero corso, guida d'esame, glossario, mappa slide↔lezioni).
- **Login una volta sola**: profilo Chrome dedicato + cookie (anche di sessione) salvati in `~/.polirec`.
  L'email PoliMi viene inserita automaticamente nel login WebEx.
- **Temi**: Normale (stile macOS) e Developer (JetBrains Mono, colori da editor), chiaro/scuro, font e dimensione.

## Struttura di un corso

```
<cartella corso>/
  video/          2026-09-16 - Lecture 1 - Course Introduction (Matteucci).mp4
  trascrizioni/   … .txt + .srt
  note/           … - sommario.md, - appunti.md, 00_riassunto_corso.md
  materiale/      00 - Introduzione/LECTURE SLIDES 2026/…pdf, LINK.md
  INDICE.html     riepilogo con link rapidi
  polirec.json    metadati e stato
```

## Riga di comando

Stesso motore e stessa configurazione dell'app:

```bash
node src/cli.js courses                                  # i tuoi corsi WeBeep
node src/cli.js add <link|codice|nome> <cartella> [nome] [--materials] [--lang en]
node src/cli.js list
node src/cli.js sync [corso…] [--dry-run] [--limit N] [--materials] [--only-materials] [-j N]
node src/cli.js transcribe [corso]
node scripts/discover-all.js out.json                    # verifica in sola lettura su tutti i tuoi corsi
```

Configurazione: `~/.polirec/config.json`. In caso di problemi, screenshot e HTML delle pagine
vengono salvati in `~/.polirec/debug/`.
