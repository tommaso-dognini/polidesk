# Contribuire a PoliDesk

Grazie per voler dare una mano! PoliDesk è un progetto di studenti per studenti: ogni contributo conta, anche
piccolo. Una segnalazione chiara di un bug, una correzione nella documentazione o una traduzione sono utili quanto
una nuova funzione.

## Come puoi aiutare

- **Segnalare un bug**: apri una [issue](https://github.com/tommaso-dognini/polidesk/issues) con
  - cosa hai fatto, cosa ti aspettavi e cosa è successo;
  - sistema operativo e versione di PoliDesk (Impostazioni → Informazioni);
  - le righe utili del registro Attività (⌘J / Ctrl+J), **senza** dati personali (email, cookie, nomi di altri studenti).
- **Proporre un'idea**: apri una issue e descrivi il problema che vuoi risolvere, prima della soluzione. Per le
  modifiche grandi parliamone prima di scrivere codice, così nessuno lavora a vuoto.
- **Scrivere codice o documentazione**: scegli una issue (quelle con l'etichetta `good first issue` sono adatte
  per iniziare) e scrivi un commento per dire che ci stai lavorando.

## Preparare l'ambiente

Requisiti: Node.js 22+, Rust stable (via [rustup](https://rustup.rs)), Google Chrome.

```bash
git clone https://github.com/tommaso-dognini/polidesk.git && cd polidesk
npm install
npm start                # avvia l'app (compila l'editor e il backend Rust)
```

**Non fare prove con i tuoi dati reali.** `POLIDESK_HOME` sposta configurazione, profilo e daemon in una cartella a
parte:

```bash
POLIDESK_HOME=/tmp/polidesk-test npm start
```

Architettura, struttura delle cartelle, screenshot automatici e variabili d'ambiente:
**[docs/wiki/Sviluppo.md](docs/wiki/Sviluppo.md)**.

In breve:
- `crates/polidesk-core`: tutta la logica (WeBeep, download, trascrizione, AI, materiale, temi d'esame…);
- `crates/polideskd`: il daemon sempre attivo, che espone i metodi all'app, alla CLI e al server MCP;
- `crates/polidesk`: CLI e server MCP;
- `src/`: l'app Electron (`main.js`) e l'interfaccia (`src/renderer`, JavaScript senza framework).

## Flusso di lavoro

1. Fai un fork e crea un branch dal `main`: `git checkout -b fix/descrizione-breve`.
2. Fai modifiche piccole e mirate: una pull request per argomento.
3. Prima di aprire la PR:
   ```bash
   cargo build && cargo test          # backend
   node --check src/renderer/*.js     # sintassi dell'interfaccia
   ```
   Se tocchi l'interfaccia, prova l'app (`npm start` con `POLIDESK_HOME`) e allega uno screenshot alla PR.
4. Apri la pull request verso `main`. Spiega cosa cambia e perché, e collega la issue (`Closes #123`).

## Stile

- **Lingua**: l'interfaccia e la documentazione per gli utenti sono in italiano, chiaro e senza gergo. I commenti
  nel codice possono essere in italiano o in inglese.
- **Rust**: `cargo fmt` prima di fare commit; niente `unwrap()` su dati che arrivano da rete o disco.
- **JavaScript**: segui lo stile dei file esistenti (funzioni piccole, helper `$`/`$$`, `esc()` su ogni testo
  inserito nell'HTML).
- **Commit**: un messaggio breve che dica cosa cambia per chi usa l'app (ad esempio «Materiale: tasto elimina
  per file e cartelle»).

## Regole importanti

- **Privacy**: PoliDesk non ha server e non raccoglie dati. Non aggiungere telemetria, analytics o chiamate a servizi
  esterni non necessarie. Credenziali e cookie non escono mai dal computer dello studente. Vedi [PRIVACY.md](PRIVACY.md).
- **Uso responsabile**: niente funzioni che aggirino protezioni (password dei video, chiavi d'iscrizione, limiti
  di accesso) o che scarichino contenuti a cui lo studente non ha diritto.
- **Dipendenze e codice di terzi**: verifica che la licenza sia compatibile con la GPL-3.0 (MIT, BSD, Apache-2.0,
  GPL-3.0 sì; codice senza licenza no) e aggiungi il componente a [NOTICE.md](NOTICE.md).

## Licenza dei contributi

PoliDesk è distribuito con licenza **[GPL-3.0-or-later](LICENSE)**. Inviando una pull request accetti che il tuo
contributo sia distribuito con la stessa licenza.

## Comportamento

Sii gentile e rispettoso: siamo tutti studenti con poco tempo. Critica il codice, non le persone.
