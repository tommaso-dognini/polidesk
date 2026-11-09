# Crediti e licenze di terze parti

PoliRec nasce dal lavoro della community studentesca del Politecnico di Milano
(progetti raccolti da [PoliNetwork](https://polinetwork.org/it/projects/)).

## Codice derivato / integrato

| Progetto | Autore | Licenza | Uso in PoliRec |
|---|---|---|---|
| [PoliWebex](https://github.com/sup3rgiu/PoliWebex) | sup3rgiu | MIT | Base del motore di download WebEx (API `recordings/<id>/stream`, fallback di download). Il codice originale modificato è in `legacy/`. |
| [PoliDown](https://github.com/sup3rgiu/PoliDown) | sup3rgiu | MIT | Riferimento per il supporto ai video Microsoft Stream/SharePoint (in programma). |
| [WebXDownloader](https://github.com/jacopo-j/WebXDownloader) | jacopo-j | MIT | Riferimento per le API di download WebEx. |
| [polimi-schedule-js](https://github.com/bebora/polimi-schedule-js) | bebora | MIT | Conversione orario → .ics (integrazione pianificata). |

## Idee reimplementate (nessun codice copiato)

| Progetto | Autore | Licenza | Idea |
|---|---|---|---|
| [WeBeepSync](https://github.com/toto04/webeep-sync) | Tommaso Morganti | GPL-3.0 | Sincronizzazione incrementale dei file WeBeep. In programma: accesso tramite token dell'app mobile Moodle. |
| [PoliMi Webex Enhancer](https://github.com/fravagli/Polimi-webex-enhancer) | Francesco Vagli | GPL-3.0 | Player offline, salto dei silenzi, testo sincronizzato col video. |

I progetti senza licenza (PoliAuth, PoliPlease, PoliDL-GUI, polimi-schedule, TdeMerger…) sono solo
linkati nella pagina *Community* dell'app: senza una licenza non è possibile riutilizzarne il codice.

## Componenti inclusi

- [Electron](https://www.electronjs.org/) — MIT
- [Puppeteer](https://pptr.dev/) (puppeteer-core) — Apache-2.0
- [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) — GPL-3.0 (binario FFmpeg distribuito come programma separato)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — SIL Open Font License 1.1 (`src/renderer/fonts/`)
- Whisper / mlx-whisper / faster-whisper — MIT, installati dal setup nell'ambiente privato dell'utente
