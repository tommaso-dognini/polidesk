# Crediti e licenze di terze parti

Copyright (C) 2026 Tommaso Dognini e contributori.

PoliRec è software libero: puoi ridistribuirlo e/o modificarlo secondo i termini della **GNU General Public License**
pubblicata dalla Free Software Foundation, versione 3 o (a tua scelta) qualsiasi versione successiva
(`GPL-3.0-or-later`, testo completo in `LICENSE`). È distribuito nella speranza che sia utile, ma SENZA ALCUNA GARANZIA.

PoliRec nasce dal lavoro della community studentesca del Politecnico di Milano, in particolare dai progetti raccolti da
[PoliNetwork](https://polinetwork.org/it/projects/). Il codice di terze parti incluso mantiene la propria licenza e la propria
nota di copyright, riportate qui sotto. Le licenze MIT, BSD, ISC e Apache-2.0 sono compatibili con la GPL-3.0.

> PoliRec è un'app **non ufficiale**: non è affiliata, approvata o supportata dal Politecnico di Milano.
> I marchi citati appartengono ai rispettivi proprietari.

## Codice della community incluso o derivato

| Progetto | Autore | Licenza | Uso in PoliRec |
|---|---|---|---|
| [PoliWebex](https://github.com/sup3rgiu/PoliWebex) | sup3rgiu | MIT | Base del motore di download WebEx. Il codice originale modificato è in `legacy/`, con la sua licenza (`legacy/LICENSE`, Copyright (c) 2020 SUPERGIU). |
| [polimi-schedule-js](https://github.com/bebora/polimi-schedule-js) | bebora | MIT | **Incluso** in `src/vendor/polimi-schedule-js/` (non modificato): conversione dell'orario dei Servizi Online in eventi/iCalendar. |
| [PoliDown](https://github.com/sup3rgiu/PoliDown) | sup3rgiu | MIT | Riferimento per il supporto futuro ai video Microsoft Stream/SharePoint. |
| [WebXDownloader](https://github.com/jacopo-j/WebXDownloader) | jacopo-j | MIT | Riferimento per le API di download WebEx. |

## Idee reimplementate da zero (nessun codice copiato)

Con la licenza GPL-3.0 il codice di questi progetti GPL potrà anche essere integrato direttamente in futuro, citandone gli autori.

| Progetto | Autore | Licenza | Idea |
|---|---|---|---|
| [WeBeepSync](https://github.com/toto04/webeep-sync) | Tommaso Morganti | GPL-3.0 | Sincronizzazione incrementale dei file WeBeep. |
| [PoliMi Webex Enhancer](https://github.com/fravagli/Polimi-webex-enhancer) | Francesco Vagli | GPL-3.0 | Player offline, salto dei silenzi, testo sincronizzato col video. |
| [@alpolimibot](https://github.com/riccardosalemme/alpolimibot) / [PoliAule](https://poliaule.com) | riccardosalemme / PoliNetwork | GPL-3.0 / — | Aule libere dalle API pubbliche del Politecnico (`maps_rest`), con un client scritto da zero; impaginazione (sede, giorno, fascia oraria, preferite, aule per edificio) ispirata a PoliAule. |
| [Handy](https://github.com/cjpais/Handy) | CJ Pais | MIT | Dettatura push-to-talk con trascrizione locale e uso del modello Parakeet. |

I progetti senza licenza (PoliAuth, PoliPlease, PoliDL-GUI, polimi-schedule, TdeMerger…) sono solo
linkati nella pagina *Community*: senza licenza il loro codice non può essere riutilizzato.

## Componenti inclusi nell'app

| Componente | Licenza |
|---|---|
| [Electron](https://www.electronjs.org/) | MIT |
| [puppeteer-core](https://pptr.dev/) | Apache-2.0 |
| [CodeMirror 6](https://codemirror.net/) | MIT |
| [@codemirror/merge](https://github.com/codemirror/merge) | MIT (revisione inline delle modifiche proposte dall'AI) |
| [markdown-it](https://github.com/markdown-it/markdown-it) | MIT |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | MIT (server MCP per gli assistenti AI) |
| [zod](https://zod.dev) | MIT |
| [Leaflet](https://leafletjs.com/) | BSD-2-Clause (`src/renderer/vendor/leaflet/LICENSE`) — mappa delle aule; forme degli edifici e foto delle aule dalle API pubbliche del Politecnico, nessuna tile di terze parti |
| [KaTeX](https://katex.org/) (codice e font) | MIT |
| [luxon](https://moment.github.io/luxon/), [uuid](https://github.com/uuidjs/uuid) | MIT |
| [immutable-ics](https://github.com/angeloashmore/immutable-ics) | ISC |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | SIL Open Font License 1.1 (`src/renderer/fonts/`) |
| [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) | GPL-3.0. È il binario FFmpeg, distribuito come programma separato e invocato come processo esterno. Licenza e note di build in `ffmpeg.LICENSE` / `ffmpeg.README` dentro `app.asar.unpacked/node_modules/ffmpeg-static/`. Sorgenti: https://ffmpeg.org/download.html |

## Scaricati al primo uso (non ridistribuiti)

| Componente | Licenza | Quando |
|---|---|---|
| [Typst](https://github.com/typst/typst) | Apache-2.0 | Editor Typst |
| [Tectonic](https://github.com/tectonic-typesetting/tectonic) | MIT. Il bundle TeX contiene pacchetti con licenze libere (LPPL ecc.) | Editor LaTeX |
| [mlx-whisper](https://github.com/ml-explore/mlx-examples) / [faster-whisper](https://github.com/SYSTRAN/faster-whisper) / [openai-whisper](https://github.com/openai/whisper) e pesi Whisper | MIT | Setup trascrizione |
| [parakeet-mlx](https://github.com/senstella/parakeet-mlx) | Apache-2.0 | Motore Parakeet (opzionale) |
| [NVIDIA Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) | CC-BY-4.0 (attribuzione: NVIDIA) | Motore Parakeet (opzionale) |
| [fastembed](https://github.com/qdrant/fastembed) | Apache-2.0 | Ricerca semantica |
| [paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) | Apache-2.0 | Ricerca semantica (modello di embedding) |
| [pypdf](https://github.com/py-pdf/pypdf) | BSD-3-Clause | Testo delle slide PDF per la ricerca |
| [uv](https://github.com/astral-sh/uv) | MIT / Apache-2.0 | Solo se non c'è un Python adatto |

Gli strumenti AI esterni (Antigravity CLI, Claude Code, Gemini CLI) non sono inclusi: PoliRec li richiama
solo se l'utente li ha installati, e valgono i loro termini d'uso.
