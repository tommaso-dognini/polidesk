# Installazione e primo avvio

## Requisiti

| | Minimo | Consigliato |
|---|---|---|
| Sistema | macOS 12, Windows 10, Linux x64 (glibc) | macOS con Apple Silicon o PC con GPU NVIDIA |
| RAM | 8 GB | 16 GB (per il modello large-v3-turbo) |
| Disco | ~3 GB per motore e modelli, più ~150-250 MB per ora di lezione | un disco esterno per i video |
| Altro | **Google Chrome** (serve per il login PoliMi/SPID) | — |

Gli strumenti AI sono **facoltativi**: Antigravity CLI (`agy`), [Claude Code](https://claude.com/claude-code)
o [Gemini CLI](https://github.com/google-gemini/gemini-cli). PoliRec usa quello scelto in Impostazioni → AI, oppure il primo che trova installato.

## Installazione

1. Scarica l'installer dalla pagina **Releases** della repository.
2. Installa:
   - **macOS**: apri il `.dmg` e trascina PoliRec in Applicazioni. Al primo avvio usa *tasto destro → Apri*, perché l'app non è firmata con un certificato Apple.
   - **Windows**: esegui il `.exe`. Se compare SmartScreen: *Ulteriori informazioni → Esegui comunque*.
   - **Linux**: rendi eseguibile l'`.AppImage` (`chmod +x PoliRec-*.AppImage`) oppure installa il `.deb`.

## Primo avvio: il setup

Il setup analizza il computer (sistema, CPU, GPU, RAM) e installa la trascrizione più adatta in un ambiente Python
privato (`~/.polirec/venv`), senza toccare il Python di sistema. Se Python manca, scarica [uv](https://github.com/astral-sh/uv).

| Hardware | Motore | Modello consigliato |
|---|---|---|
| Mac Apple Silicon | mlx-whisper (GPU Metal), in alternativa Parakeet | large-v3-turbo (con ≥16 GB di RAM), altrimenti small o base |
| GPU NVIDIA | faster-whisper (CUDA) | large-v3-turbo |
| Solo CPU | faster-whisper (int8) | small, base o tiny, in base a RAM e core |

Motore, modello e download in parallelo si possono cambiare in **Impostazioni → Trascrizione**, dove trovi anche i valori
consigliati per il tuo hardware.

Componenti scaricati solo quando servono:
- motori **Typst** e **Tectonic** (LaTeX), al primo appunto in quel formato;
- **ricerca semantica** (~250 MB), da Impostazioni → AI.

## Aggiungere il primo corso

1. Dashboard → **＋ Aggiungi corso**. Nel campo «Corso» puoi mettere:
   - il link WeBeep, anche di una singola sezione (`…/course/section.php?id=…`);
   - il codice del corso (es. `054307`);
   - una parte del nome.

   In alternativa scegli dall'elenco dei tuoi corsi WeBeep.
2. Scegli la **cartella** di destinazione e se scaricare anche il **materiale** (slide, PDF).
3. Premi **⟳ Sincronizza**. Alla prima sincronizzazione si apre Chrome per il login PoliMi/SPID; la sessione viene ricordata.
4. Se il corso ha **lezioni parallele di più docenti**, PoliRec chiede quale segui prima di scaricare.

## Dove finiscono i file

Per ogni corso, nella cartella che hai scelto:

```
<cartella del corso>/
├── video/               registrazioni .mp4
├── trascrizioni/        .txt e .srt (gli originali prima della pulizia in .orig/)
├── note/                note AI: «<lezione> - sommario.md», «- appunti.md», «- flashcard.md», «- domande.md»…
├── materiale/           slide e PDF, divisi per sezione WeBeep
├── appunti/             i tuoi appunti (.md, .tex, .typ) e .polirec-links.json (collegamenti alle lezioni)
├── polirec-workspace.json   pagina del corso, cose da fare, statistiche Pomodoro
├── polirec.json         elenco delle registrazioni trovate
└── INDICE.html / INDICE.md  riepilogo con link rapidi e sommari
```

Dati dell'app in `~/.polirec/`:

| Percorso | Contenuto |
|---|---|
| `config.json` | Impostazioni ed elenco dei corsi |
| `chrome-profile/`, `cookies.json` | Sessione di login, mai la password |
| `venv/` | Motore di trascrizione |
| `bin/` | Motori Typst e Tectonic |
| `index/` | Indice della ricerca semantica |
| `timetable.json`, `orario.ics` | Orario delle lezioni |
| `cache/` | Mappe e foto delle aule |
| `debug/` | Screenshot e HTML delle pagine se qualcosa va storto |

Con la **sincronizzazione cloud** attiva, appunti, pagine dei corsi e impostazioni vengono salvati in `<cartella cloud>/PoliRec/`.
