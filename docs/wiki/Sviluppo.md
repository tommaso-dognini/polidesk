# Sviluppo

## Avvio da sorgente

```bash
git clone <repo> polirec && cd polirec
npm install
npm start
```

Requisiti: **Node.js 22+**, **Rust** stable ([rustup](https://rustup.rs)), **Google Chrome**, Git. Per la trascrizione il setup dell'app crea `~/.polirec/venv` (Python 3.10+, oppure uv).

## Script npm

| Comando | Cosa fa |
|---|---|
| `npm start` | Compila l'editor e il backend Rust (`prestart`) e avvia l'app Electron |
| `npm run build:rust` | Compila `polirecd` e `polirec` in release |
| `npm run daemon` | Avvia `polirecd` in primo piano (log sul terminale) |
| `npm run cli -- <comando>` | Riga di comando (vedi [Riga di comando](Riga-di-comando.md)) |
| `npm run mcp` | Server MCP su stdio (vedi [Server MCP](Server-MCP.md)) |
| `npm run build:editor` | Crea il bundle CodeMirror, markdown-it e KaTeX in `src/renderer/vendor/editor.js` (esbuild) |
| `npm run dist` | Installer per il sistema corrente: compila il backend (su macOS binari universali arm64 + x64, `scripts/build-rust.js`) e lo include in `resources/bin` |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Installer per una piattaforma, da eseguire su quel sistema |

## Architettura

```
 Electron (interfaccia)      polirec (CLI)      polirec mcp (Claude & co.)
          │                       │                        │
          └──────── socket locale, JSON a righe ───────────┘
                                  │
                       polirecd (Rust, sempre attivo)
     configurazione · corsi · appunti · code di sync, trascrizione e AI · indice semantico
          │                 │                    │                    │
   Chrome via CDP     aria2c / ffmpeg     worker Python        CLI AI (agy, claude, gemini)
   (login, WeBeep)    (download)          (Whisper, fastembed)
```

**polirecd** fa tutto ciò che non è interfaccia. Parte da solo alla prima richiesta (app, CLI o MCP) e resta attivo
anche a finestra chiusa, così download, trascrizioni e note AI continuano. Un solo processo possiede code, profilo
di Chrome e indice: app, CLI e MCP vedono sempre lo stesso stato. In memoria occupa circa 12 MB.

Protocollo (`crates/polirec-core/src/rpc.rs`): un oggetto JSON per riga su un socket Unix (`~/.polirec/polirecd.sock`,
permessi 0600) o una named pipe su Windows.

```
→ {"id": 7, "method": "notes:list", "params": "<id corso>"}
← {"id": 7, "result": [...]}          oppure  {"id": 7, "error": {"message": "..."}}
← {"event": {"type": "log", ...}}     eventi, dopo "subscribe"
```

I metodi hanno lo stesso nome dei canali IPC dell'interfaccia (`course:add`, `notes:read`…), quindi `src/main.js`
li inoltra senza tradurli. CLI e MCP usano i metodi `api:*`.

## Struttura

```
crates/
├── polirec-core/        tutta la logica (libreria)
│   ├── rpc.rs           protocollo e client del server
│   ├── config.rs · library.rs · indexpage.rs   configurazione, manifest, INDICE.html
│   ├── browser.rs       Chrome via DevTools Protocol (chromiumoxide), profilo persistente, login assistito
│   ├── webeep.rs · recman.rs · webex.rs · materials.rs   ricerca delle sorgenti e del materiale
│   ├── sync.rs · downloader.rs   sincronizzazione, download paralleli (aria2c, downloader interno, ffmpeg per HLS)
│   ├── transcriber.rs · cleaner.rs · setup.rs   coda di trascrizione, pulizia, setup per l'hardware
│   ├── ai.rs · search.rs         strumenti AI, ricerca semantica (worker Python)
│   ├── schedule.rs · timetable.rs · rooms.rs     orario (port di polimi-schedule-js), calendario, aule libere
│   ├── notes.rs · workspace.rs · cloud.rs · integrations.rs
│   └── api.rs           funzioni per CLI e MCP
├── polirecd/            il server: socket, metodi, code (sync → trascrizione → AI → indice)
└── polirec/             CLI e server MCP (client del server)
src/
├── main.js              Electron: finestra, dialoghi, PDF, protocollo media://, ponte verso polirecd
├── daemon-client.js     client del socket: avvia, aggiorna e riconnette polirecd
├── preload.js           API esposta al renderer (window.polirec)
├── renderer/            interfaccia (HTML, CSS e JS senza framework)
└── renderer-src/editor.js   sorgente del bundle dell'editor
python/
├── transcribe_cli.py    mlx-whisper, faster-whisper, openai-whisper, Parakeet
└── semantic.py          indice e ricerca semantica (fastembed, pypdf)
```

Regole:
- tutto ciò che non è interfaccia va in `crates/polirec-core`, esposto da un metodo di `polirecd`;
- un nuovo canale dell'interfaccia è un metodo con lo stesso nome in `crates/polirecd/src/dispatch.rs` o `methods.rs`:
  `src/main.js` lo inoltra da solo;
- le funzioni per CLI e MCP stanno in `api.rs` e passano dai metodi `api:*`.

## Test con dati isolati

Non usare mai la tua configurazione reale per le prove. `POLIREC_HOME` sposta tutti i dati dell'app in una cartella a scelta:

```bash
POLIREC_HOME=/tmp/polirec-test npm start
POLIREC_HOME=/tmp/polirec-test npm run cli -- list    # ogni POLIREC_HOME ha il suo polirecd
```

### Screenshot automatici (smoke test)

```bash
POLIREC_HOME=/tmp/polirec-test \
POLIREC_SMOKE=/tmp/shot.png \
POLIREC_SMOKE_JS="(async()=>{ go({name:'rooms'}); await new Promise(r=>setTimeout(r,3000)) })()" \
npx electron .
```

L'app si apre senza sincronizzare. Esegue il codice di `POLIREC_SMOKE_JS` nella pagina, salva lo screenshot ed esce.
Gli errori del renderer compaiono nel terminale come `[renderer] …`.

### Variabili d'ambiente

| Variabile | Effetto |
|---|---|
| `POLIREC_HOME` | Cartella dei dati al posto di `~/.polirec` |
| `POLIREC_CHROME` | Percorso di Chrome, se non viene trovato da solo |
| `POLIREC_SHOW_BROWSER` | Chrome visibile invece che in background (come l'opzione «Mostra il browser») |
| `POLIREC_NO_ARIA2` | Usa il downloader interno anche se `aria2c` è installato |
| `POLIREC_SMOKE`, `POLIREC_SMOKE_JS` | Screenshot automatico (vedi sopra) |
| `POLIREC_APP_ROOT`, `POLIREC_FFMPEG` | Cartella dell'app (script `python/`) e ffmpeg incluso; di solito le scrive l'app in `~/.polirec/runtime.json` |
| `POLIRECD` | Percorso di `polirecd` da usare al posto di quello incluso |

Test del backend: `cargo test`. Gli strumenti in `crates/polirec-core/examples/` confrontano parser dell'orario e pulizia delle trascrizioni con i file di prova.

## Rilascio

1. In `package.json` → `polirec` imposta:
   - `donateUrl`: link «Buy me a coffee»;
   - `repo`: `utente/polirec`, per il controllo degli aggiornamenti.

   Aggiungi anche `repository` e `build.publish`.
2. `npm version minor && git push --tags`: il workflow `.github/workflows/build.yml` crea gli installer per macOS
   (arm64 e x64), Windows e Linux e li allega alla release.
3. **Firma** (facoltativa, a pagamento):
   - **macOS**: certificato Apple Developer, con `CSC_LINK`/`CSC_KEY_PASSWORD` e la notarizzazione;
   - **Windows**: un certificato di firma del codice.

## Pubblicare questa wiki su GitHub

Le pagine sono in `docs/wiki/`. Per copiarle nella wiki della repository (va prima creata una pagina dal sito):

```bash
scripts/publish-wiki.sh <utente>/polirec
```

## Licenza dei contributi

Il progetto è distribuito con licenza **GPL-3.0-or-later**: inviando una pull request accetti che il tuo contributo
sia distribuito con la stessa licenza.

Prima di includere codice di terzi verifica che la sua licenza sia compatibile con la GPL-3.0 (MIT, BSD, Apache-2.0, GPL-3.0 sì; codice
senza licenza no) e aggiungilo a `NOTICE.md`.
