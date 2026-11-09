# Server MCP: PoliRec nel tuo assistente AI

PoliRec include un server [MCP](https://modelcontextprotocol.io) (Model Context Protocol). Con questo, Claude Code,
Claude Desktop o un altro assistente compatibile può leggere le tue lezioni, cercare nei contenuti, creare appunti e
attività, controllare orario e aule libere, con le stesse funzioni dell'app.

## Attivarlo

1. **Impostazioni → Assistenti AI e automazioni → Assistenti AI (MCP)**: attiva l'interruttore.
   È spento di default: finché è spento, ogni strumento risponde con un errore che chiede di attivarlo.
2. Registra il server nel tuo assistente:

### Claude Code
Premi **«Aggiungi a Claude Code»**, oppure copia ed esegui il comando mostrato:

```bash
claude mcp add polirec --scope user -e ELECTRON_RUN_AS_NODE=1 -- \
  "/Applications/PoliRec.app/Contents/MacOS/PoliRec" \
  "/Applications/PoliRec.app/Contents/Resources/app.asar/src/mcp.js"
```

Verifica con `claude mcp list`. Per toglierlo: `claude mcp remove polirec --scope user`.

### Claude Desktop e altri client
Premi **«Copia JSON»** e incollalo nella configurazione MCP del client.
Per Claude Desktop è `claude_desktop_config.json` (Impostazioni → Sviluppatore → Modifica configurazione):

```json
{
  "mcpServers": {
    "polirec": {
      "command": "/Applications/PoliRec.app/Contents/MacOS/PoliRec",
      "args": ["/Applications/PoliRec.app/Contents/Resources/app.asar/src/mcp.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

I percorsi dipendono dal sistema e da dove hai installato l'app: usa quelli copiati dall'app.
Dal codice sorgente puoi usare anche `node /percorso/polirec/src/mcp.js` (oppure `npm run mcp`).

## Strumenti

Corsi e lezioni si indicano come nella CLI: per il corso nome anche parziale, numero o id; per la lezione numero
(1 = la più vecchia), data `AAAA-MM-GG`, parte del titolo o chiave.

### Lettura

| Strumento | Parametri | Cosa fa |
|---|---|---|
| `polirec_status` | — | Versione, corsi, strumenti AI e trascrizione |
| `list_courses` | — | Corsi con lezioni, scaricate, trascritte, docenti seguiti |
| `list_lessons` | `course`, `include_other_teachers?` | Lezioni con sommario, argomenti, note AI disponibili |
| `get_lesson` | `course`, `lesson` | Dettagli e appunti collegati |
| `get_transcript` | `course`, `lesson`, `timestamps?`, `offset?`, `max_chars?` | Trascrizione, a pezzi (default 60.000 caratteri; `more: true` se continua) |
| `get_course_info` | `course` | Scheda del corso: descrizione, docenti, esame, orario |
| `get_ai_note` | `course`, `lesson`, `kind` | Nota AI: `sommario`, `appunti`, `riassunto`, `spiegazione`, `flashcard`, `domande` |
| `search` | `query`, `course?`, `k?` | Ricerca semantica: passaggi con lezione e minuto |
| `list_notes` | `course?` | Appunti dello studente (senza corso: generali) |
| `read_note` | `course?`, `file` | Contenuto di un appunto e lezioni collegate |
| `list_todos` | `course?`, `include_done?` | Attività |
| `timetable` | `from?`, `days?`, `course?` | Lezioni in calendario |
| `free_rooms` | `sede?`, `date?`, `from?`, `hours?` | Aule libere |
| `list_sedi` | — | Sedi per `free_rooms` |

### Scrittura e azioni

| Strumento | Parametri | Cosa fa |
|---|---|---|
| `ask` | `question`, `course?` | Risposta con citazioni generata dallo strumento AI di PoliRec |
| `generate_ai_note` | `course`, `lesson`, `kind` | Genera o rigenera una nota AI (1-2 minuti) |
| `create_note` | `course?`, `title`, `kind?`, `content?`, `lessons?` | Crea un appunto, anche già collegato a delle lezioni |
| `update_note` | `course?`, `file`, `content`, `mode?` (`replace`/`append`) | Modifica un appunto |
| `link_note` | `course?`, `file`, `lessons`, `lesson_course?` | Collega un appunto a delle lezioni |
| `add_todo` | `course?`, `text`, `due?` | Aggiunge un'attività |
| `complete_todo` | `course?`, `todo`, `done?` | Segna un'attività come fatta |
| `sync_course` | `course`, `limit?` | Scarica le nuove registrazioni (può aprire Chrome per il login) |
| `transcribe` | `course`, `lesson?` | Trascrive in locale |

Gli strumenti dichiarano al client se sono di sola lettura o se modificano dati: il client può chiederti conferma
prima di quelli che scrivono.

## Esempi di richieste

- «Quali lezioni di ANN&DL ho questa settimana e in che aula?»
- «Leggi la trascrizione della lezione sulle LSTM e fammi un riassunto di 10 righe con le formule principali.»
- «Cerca dove il prof parla di dropout e dimmi a che minuto.»
- «Crea un appunto "Regolarizzazione" collegato alle lezioni 5 e 6 con una tabella che confronta L1, L2 e dropout.»
- «Aggiungi alle cose da fare di ANN&DL: ripassare backpropagation entro venerdì.»
- «Trovami un'aula libera a Città Studi dalle 14 alle 17.»
- «Genera le domande d'esame per tutte le lezioni di ottobre.»

## Privacy

- Il server gira **sul tuo computer** e legge i dati in locale.
- Quello che l'assistente legge (trascrizioni, appunti…) viene inviato al suo fornitore, come qualsiasi testo che gli dai.
- Si disattiva in ogni momento dalle Impostazioni, senza riavviare nulla.
