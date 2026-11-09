# Sviluppo

## Avvio da sorgente

```bash
git clone <repo> polirec && cd polirec
npm install
npm start
```

Requisiti: **Node.js 22+**, **Google Chrome**, Git. Per la trascrizione il setup dell'app crea `~/.polirec/venv` (Python 3.10+, oppure uv).

## Script npm

| Comando | Cosa fa |
|---|---|
| `npm start` | Compila l'editor (`prestart`) e avvia l'app Electron |
| `npm run cli -- <comando>` | Riga di comando (vedi [Riga di comando](Riga-di-comando.md)) |
| `npm run mcp` | Server MCP su stdio (vedi [Server MCP](Server-MCP.md)) |
| `npm run build:editor` | Crea il bundle CodeMirror, markdown-it e KaTeX in `src/renderer/vendor/editor.js` (esbuild) |
| `npm run build:vendor` | Converte polimi-schedule-js (ESM) in un bundle CommonJS |
| `npm run dist` | Installer per il sistema corrente (electron-builder) |
| `npm run dist:mac` / `dist:win` / `dist:linux` | Installer per una piattaforma, da eseguire su quel sistema |

## Struttura

```
src/
├── main.js            processo principale: finestre, IPC, code di sync, trascrizione e AI, protocollo media://
├── ipc-extra.js       IPC di appunti, calendario, aule, cloud, integrazioni, assistenti
├── preload.js         API esposta al renderer (window.polirec)
├── cli.js             riga di comando
├── mcp.js             server MCP (stdio)
├── core/              logica senza Electron, usabile da app, CLI e MCP
│   ├── api.js         livello di servizio condiviso da CLI e MCP
│   ├── browser.js     Chrome (puppeteer-core) con profilo persistente e login assistito
│   ├── webeep.js · recman.js · webex.js · materials.js   ricerca delle sorgenti e del materiale
│   ├── sync.js · downloader.js    sincronizzazione e download in parallelo (aria2c o downloader interno)
│   ├── transcriber.js · cleaner.js · setup.js            trascrizione, pulizia, setup per l'hardware
│   ├── ai.js · search.js          strumenti AI (agy/claude/gemini), ricerca semantica (worker Python)
│   ├── library.js · indexpage.js  configurazione, manifest, INDICE.html
│   ├── notes.js · workspace.js · cloud.js · integrations.js
│   └── timetable.js · rooms.js    orario e aule libere
├── renderer/          interfaccia (HTML, CSS e JS senza framework)
│   ├── app.js         router, dashboard, corso, lezione, impostazioni
│   ├── views.js       appunti, calendario, Pomodoro, impostazioni aggiuntive
│   ├── ai-ui.js       ricerca, command palette, coda AI
│   └── rooms-ui.js    aule libere con mappa (Leaflet)
├── renderer-src/editor.js   sorgente del bundle dell'editor
└── vendor/polimi-schedule-js/
python/
├── transcribe_cli.py  mlx-whisper, faster-whisper, openai-whisper, Parakeet
└── semantic.py        indice e ricerca semantica (fastembed, pypdf)
```

Regole:
- tutto ciò che non è interfaccia va in `src/core/`, senza dipendenze da Electron, così CLI e MCP lo possono riusare;
- le nuove funzioni di CLI e MCP passano da `src/core/api.js`.

## Test con dati isolati

Non usare mai la tua configurazione reale per le prove. `POLIREC_HOME` sposta tutti i dati dell'app in una cartella a scelta:

```bash
POLIREC_HOME=/tmp/polirec-test npm start
POLIREC_HOME=/tmp/polirec-test node src/cli.js list
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
| `POLIREC_NO_ARIA2` | Usa il downloader interno anche se `aria2c` è installato |
| `POLIREC_SMOKE`, `POLIREC_SMOKE_JS` | Screenshot automatico (vedi sopra) |
| `ELECTRON_RUN_AS_NODE=1` | Esegue CLI e MCP con il runtime dell'app installata |

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
