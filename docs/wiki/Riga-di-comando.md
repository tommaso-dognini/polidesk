# Riga di comando (`polirec`)

La CLI usa lo stesso motore e gli stessi dati dell'app (`~/.polirec` e le cartelle dei corsi). Si può usare anche con
l'app aperta: ogni scrittura salva un file intero alla volta, in modo atomico.

## Come averla

**Con l'app installata**, non serve Node.js:
*Impostazioni → Assistenti AI e automazioni → Riga di comando → Copia alias*, poi incolla la riga in `~/.zshrc` o `~/.bashrc`.
L'alias è del tipo:

```bash
alias polirec='ELECTRON_RUN_AS_NODE=1 "/Applications/PoliRec.app/Contents/MacOS/PoliRec" "/Applications/PoliRec.app/Contents/Resources/app.asar/src/cli.js"'
```

**Dal codice sorgente**:

```bash
npm run cli -- <comando>      # oppure: node src/cli.js <comando>
npm link                      # installa il comando «polirec» nel PATH
```

## Come indicare corsi e lezioni

- **Corso**: nome, anche parziale e senza maiuscole (`ANN`, `image`), oppure numero da `polirec list` (`1`), oppure id.
- **Lezione**: numero (`3`, oppure `#3`; 1 = la più vecchia), data `AAAA-MM-GG`, parte del titolo (`backprop`), oppure chiave (`recman-163913`).
  Per i corsi con lezioni parallele contano solo i docenti seguiti.

Aggiungi **`--json`** ai comandi di lettura per avere l'output in JSON, utile negli script.

## Comandi

### Stato e corsi

| Comando | Descrizione |
|---|---|
| `polirec status` | Versione, numero di corsi, strumenti AI installati, motore di trascrizione |
| `polirec list` | Corsi configurati, con video scaricati e trascritti |
| `polirec courses` | I tuoi corsi su WeBeep (serve il login) |
| `polirec add <corso> <cartella> [nome] [--materials] [--lang it\|en\|auto]` | Aggiunge un corso (link WeBeep, codice, nome o `webeep:<id>`) |

### Download e trascrizione

| Comando | Descrizione |
|---|---|
| `polirec sync [corso…]` | Cerca e scarica le nuove registrazioni (senza argomenti: tutti i corsi) |
| &nbsp;&nbsp;`--dry-run` | Mostra cosa troverebbe, senza scaricare |
| &nbsp;&nbsp;`--limit N` | Scarica al massimo N lezioni, a partire dalle più recenti |
| &nbsp;&nbsp;`-j N` | Download in parallelo |
| &nbsp;&nbsp;`--materials` / `--only-materials` | Scarica anche il materiale / solo il materiale |
| `polirec transcribe [corso]` | Trascrive i video scaricati e non ancora trascritti |

`Ctrl+C` durante `sync` termina dopo i download in corso; premilo di nuovo per uscire subito.

### Lezioni e contenuti

| Comando | Descrizione |
|---|---|
| `polirec lessons <corso> [--all]` | Lezioni con data, docente, sommario, argomenti e note AI (`--all`: anche gli altri docenti) |
| `polirec lesson <corso> <lezione>` | Dettagli di una lezione, appunti collegati, percorso del video |
| `polirec transcript <corso> <lezione> [--timestamps]` | Trascrizione: testo pulito, oppure con `[hh:mm:ss]` per riga |
| `polirec ainote <corso> <lezione> <tipo> [--generate]` | Legge una nota AI; con `--generate` la genera o la rigenera |

Tipi di nota AI: `sommario`, `appunti`, `riassunto`, `spiegazione`, `flashcard`, `domande`.

### Ricerca e domande

| Comando | Descrizione |
|---|---|
| `polirec search "<testo>" [--course X] [-k N]` | Ricerca semantica in lezioni, slide, sommari e appunti |
| `polirec ask "<domanda>" [--course X]` | Risposta dell'AI basata sulle fonti del corso, con citazioni |

Richiedono la ricerca semantica installata (Impostazioni → AI). `ask` usa anche lo strumento AI configurato.

### Appunti

| Comando | Descrizione |
|---|---|
| `polirec notes [corso]` | Elenca gli appunti (senza corso: quelli generali) |
| `polirec note <file> [--course X]` | Stampa il contenuto di un appunto |
| `polirec new-note "<titolo>" [--course X] [--lesson N]… [--kind markdown\|latex\|typst]` | Crea un appunto. Il contenuto arriva da stdin; ripeti `--lesson` per collegarlo a più lezioni |

### Attività, orario, aule

| Comando | Descrizione |
|---|---|
| `polirec todo [corso]` | Attività da fare |
| `polirec todo add "<testo>" [--course X] [--due AAAA-MM-GG]` | Aggiunge un'attività |
| `polirec todo done "<testo o id>" [--course X]` | Segna un'attività come fatta |
| `polirec timetable [--days N] [--course X]` | Lezioni in calendario nei prossimi giorni (default 7) |
| `polirec rooms [--sede MIA] [--from HH:MM] [--hours N]` | Aule libere (default: Città Studi, da adesso, per 2 ore) |

Sedi per `--sede`: `MIA` Milano Città Studi, `MIB` Milano Bovisa, `MIF` Milano Tortona, `MID` Sesto Ulteriano,
`COE` Como, `LCF` Lecco, `CRG` Cremona, `MNI` Mantova, `PCL` Piacenza, `GEM` Genova.

### Assistenti AI

| Comando | Descrizione |
|---|---|
| `polirec mcp` | Avvia il server MCP su stdin/stdout (vedi [Server MCP](Server-MCP.md)) |

## Esempi

```bash
# tutte le lezioni di ANN&DL in JSON
polirec lessons ANN --json | jq '.[] | {n, date, title}'

# trascrizione della lezione del 19 ottobre in un file
polirec transcript ANN 2026-10-19 > lstm.txt

# genera le domande d'esame dell'ultima lezione e salvale
polirec ainote ANN 13 domande --generate > domande-lezione13.md

# appunto collegato alle lezioni 5 e 6, dal testo di un file
cat riassunto.md | polirec new-note "Regolarizzazione" --course ANN --lesson 5 --lesson 6

# promemoria
polirec todo add "Consegnare homework 2" --course ANN --due 2026-11-30

# dove studio oggi pomeriggio?
polirec rooms --from 14:00 --hours 3

# scarica solo le ultime 2 lezioni di tutti i corsi
polirec sync --limit 2
```

## Script di verifica

```bash
node scripts/discover-all.js out.json   # sola lettura: trova le sorgenti di tutti i tuoi corsi WeBeep, senza scaricare
```
