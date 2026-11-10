# Riga di comando (`polidesk`)

La CLI è un programma nativo (Rust) che parla con **polideskd**, il server locale di PoliDesk: stesso motore, stessi
dati e stesse code dell'app. Si può usare con l'app aperta o chiusa; se il server non è attivo parte da solo.

## Come averla

**Con l'app installata** il binario è dentro l'app (`Resources/bin/polidesk`):
*Impostazioni → Assistenti AI e automazioni → Riga di comando → Copia alias*, poi incolla la riga in `~/.zshrc` o `~/.bashrc`.
Su macOS l'alias è del tipo:

```bash
alias polidesk=/Applications/PoliDesk.app/Contents/Resources/bin/polidesk
```

**Dal codice sorgente**:

```bash
npm run cli -- <comando>          # oppure: cargo run -p polidesk -- <comando>
cargo install --path crates/polidesk --locked && cargo install --path crates/polideskd --locked   # «polidesk» e «polideskd» nel PATH
```

### Il server `polideskd`

```bash
polidesk daemon            # stato: versione, pid, cartella dati, socket
polidesk daemon stop       # ferma il server (ripartirà al prossimo comando o all'apertura dell'app)
polidesk call <metodo> '<json>'   # chiamata diretta a un metodo del server (per script avanzati)
```

## Come indicare corsi e lezioni

- **Corso**: nome, anche parziale e senza maiuscole (`ANN`, `image`), oppure numero da `polidesk list` (`1`), oppure id.
- **Lezione**: numero (`3`, oppure `#3`; 1 = la più vecchia), data `AAAA-MM-GG`, parte del titolo (`backprop`), oppure chiave (`recman-163913`).
  Per i corsi con lezioni parallele contano solo i docenti seguiti.

Aggiungi **`--json`** ai comandi di lettura per avere l'output in JSON, utile negli script.

## Comandi

### Stato e corsi

| Comando | Descrizione |
|---|---|
| `polidesk status` | Versione, numero di corsi, strumenti AI installati, motore di trascrizione |
| `polidesk list` | Corsi configurati, con video scaricati e trascritti |
| `polidesk courses` | I tuoi corsi su WeBeep (serve il login) |
| `polidesk add <corso> <cartella> [nome] [--materials] [--lang it\|en\|auto]` | Aggiunge un corso (link WeBeep, codice, nome o `webeep:<id>`) |

### Download e trascrizione

| Comando | Descrizione |
|---|---|
| `polidesk sync [corso…]` | Cerca e scarica le nuove registrazioni (senza argomenti: tutti i corsi) |
| &nbsp;&nbsp;`--dry-run` | Mostra cosa troverebbe, senza scaricare |
| &nbsp;&nbsp;`--limit N` | Scarica al massimo N lezioni, a partire dalle più recenti |
| &nbsp;&nbsp;`-j N` | Download in parallelo |
| &nbsp;&nbsp;`--materials` / `--only-materials` | Scarica anche il materiale / solo il materiale |
| `polidesk transcribe [corso]` | Trascrive i video scaricati e non ancora trascritti |

`Ctrl+C` durante `sync` termina dopo i download in corso; premilo di nuovo per uscire subito.

### Lezioni e contenuti

| Comando | Descrizione |
|---|---|
| `polidesk lessons <corso> [--all]` | Lezioni con data, docente, sommario, argomenti e note AI (`--all`: anche gli altri docenti) |
| `polidesk lesson <corso> <lezione>` | Dettagli di una lezione, appunti collegati, percorso del video |
| `polidesk transcript <corso> <lezione> [--timestamps]` | Trascrizione: testo pulito, oppure con `[hh:mm:ss]` per riga |
| `polidesk ainote <corso> <lezione> <tipo> [--generate]` | Legge una nota AI; con `--generate` la genera o la rigenera |

Tipi di nota AI: `sommario`, `appunti`, `riassunto`, `spiegazione`, `flashcard`, `domande`.

### Ricerca e domande

| Comando | Descrizione |
|---|---|
| `polidesk search "<testo>" [--course X] [-k N]` | Ricerca semantica in lezioni, slide, sommari e appunti |
| `polidesk ask "<domanda>" [--course X]` | Risposta dell'AI basata sulle fonti del corso, con citazioni |

Richiedono la ricerca semantica installata (Impostazioni → AI). `ask` usa anche lo strumento AI configurato.

### Appunti

| Comando | Descrizione |
|---|---|
| `polidesk notes [corso]` | Elenca gli appunti (senza corso: quelli generali) |
| `polidesk note <file> [--course X]` | Stampa il contenuto di un appunto |
| `polidesk new-note "<titolo>" [--course X] [--lesson N]… [--kind markdown\|latex\|typst]` | Crea un appunto. Il contenuto arriva da stdin; ripeti `--lesson` per collegarlo a più lezioni |

### Attività, orario, aule

| Comando | Descrizione |
|---|---|
| `polidesk todo [corso]` | Attività da fare |
| `polidesk todo add "<testo>" [--course X] [--due AAAA-MM-GG]` | Aggiunge un'attività |
| `polidesk todo done "<testo o id>" [--course X]` | Segna un'attività come fatta |
| `polidesk timetable [--days N] [--course X]` | Lezioni in calendario nei prossimi giorni (default 7) |
| `polidesk rooms [--sede MIA] [--from HH:MM] [--hours N]` | Aule libere (default: Città Studi, da adesso, per 2 ore) |

Sedi per `--sede`: `MIA` Milano Città Studi, `MIB` Milano Bovisa, `MIF` Milano Tortona, `MID` Sesto Ulteriano,
`COE` Como, `LCF` Lecco, `CRG` Cremona, `MNI` Mantova, `PCL` Piacenza, `GEM` Genova.

### Assistenti AI

| Comando | Descrizione |
|---|---|
| `polidesk mcp` | Avvia il server MCP su stdin/stdout (vedi [Server MCP](Server-MCP.md)) |

## Esempi

```bash
# tutte le lezioni di ANN&DL in JSON
polidesk lessons ANN --json | jq '.[] | {n, date, title}'

# trascrizione della lezione del 19 ottobre in un file
polidesk transcript ANN 2026-10-19 > lstm.txt

# genera le domande d'esame dell'ultima lezione e salvale
polidesk ainote ANN 13 domande --generate > domande-lezione13.md

# appunto collegato alle lezioni 5 e 6, dal testo di un file
cat riassunto.md | polidesk new-note "Regolarizzazione" --course ANN --lesson 5 --lesson 6

# promemoria
polidesk todo add "Consegnare homework 2" --course ANN --due 2026-11-30

# dove studio oggi pomeriggio?
polidesk rooms --from 14:00 --hours 3

# scarica solo le ultime 2 lezioni di tutti i corsi
polidesk sync --limit 2
```

## Solo controllo, senza scaricare

```bash
polidesk sync --dry-run     # trova corsi, archivi e lezioni di tutti i corsi, senza scaricare nulla
```
