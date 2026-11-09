# PoliRec

App desktop **gratuita** (macOS, Windows, Linux) per gli studenti del Politecnico di Milano. Ti permette di:

- scaricare le **registrazioni delle lezioni** e il **materiale** dei tuoi corsi WeBeep;
- **trascriverle** in locale, eliminando le esitazioni (ehm, mmm…);
- studiare con **appunti in Markdown, LaTeX o Typst** e un pannello AI;
- usare **calendario**, **aule libere**, **cose da fare** e **Pomodoro**, tutto nella stessa app.

> App **non ufficiale**, non affiliata al Politecnico di Milano. Usa le registrazioni solo per studio personale.
> Vedi [PRIVACY.md](PRIVACY.md).

Nata da [PoliWebex](https://github.com/sup3rgiu/PoliWebex) e dai progetti della community raccolti da
[PoliNetwork](https://polinetwork.org/it/projects/): crediti e licenze in [NOTICE.md](NOTICE.md) e nella
pagina *Community* dell'app.

## Provarla

```bash
cd ~/Documents/dev/polirec
npm install
npm start
```

Al primo avvio il **setup** analizza il computer e installa la trascrizione più adatta in un ambiente privato
(`~/.polirec/venv`, che non tocca il Python di sistema):

| Hardware | Motore | Modello consigliato |
|---|---|---|
| Mac Apple Silicon | mlx-whisper (GPU Metal), oppure Parakeet | large-v3-turbo (≥16 GB RAM) / small / base |
| GPU NVIDIA | faster-whisper (CUDA) | large-v3-turbo |
| Solo CPU | faster-whisper (int8) | small / base / tiny, in base a RAM e core |

Anche download in parallelo e modello vengono consigliati in Impostazioni in base all'hardware.
ffmpeg è incluso nell'app. I motori LaTeX (Tectonic) e Typst si scaricano con un clic la prima volta che servono.

## Funzioni

**Corsi e registrazioni**
- Dashboard dei corsi in ordine di priorità; **sincronizzazione automatica all'avvio** (e, se vuoi, ogni N ore).
- Le registrazioni vengono trovate ovunque siano: più archivi RecMan per corso, link WebEx diretti,
  annunci del forum, mp4 caricati, YouTube.
- Materiale del corso (slide, PDF, cartelle) organizzato per sezione, se lo vuoi.
- **Pagina del corso in stile Notion**: pagina libera in Markdown, cose da fare, ultime lezioni, prossime lezioni
  dall'orario, appunti, materiale, statistiche di studio.
- **Pagina della lezione**:
  - player interno: velocità fino a 3×, ±10 s, schermo intero, salto dei silenzi, ripresa da dove eri rimasto;
  - trascrizione sincronizzata e cercabile;
  - note AI e sommario.
- **Riepilogo del corso** `INDICE.html`: ogni lezione con descrizione degli argomenti e link rapidi.

**Trascrizione**
- Whisper large-v3-turbo o Parakeet (il modello usato da Handy), tutto in locale.
- **Pulizia automatica**: toglie ehm/mmm/uh, balbettii e frasi inventate da Whisper nei silenzi.
  Gli originali restano in `trascrizioni/.orig`.

**Appunti**: tre editor, con il formato predefinito scelto in Impostazioni.
- **Markdown**: anteprima live, formule `$…$`/`$$…$$` con KaTeX, checklist, immagini incollate, esportazione PDF.
- **LaTeX** con motore Tectonic incluso, anteprima PDF ed errori indicati sulla riga.
- **Typst** con motore incluso, anteprima PDF ed errori indicati sulla riga.

In tutti e tre:
- **pannello AI laterale** (migliora, continua, spiega, riassumi, formule, esercizi, domande libere);
  le risposte si inseriscono o sostituiscono la selezione;
- **dettatura** 🎙 trascritta in locale, in stile Handy.

**Studio**
- **Calendario** con l'orario importato dai Servizi Online (via polimi-schedule-js), file e URL `.ics`,
  scadenze delle cose da fare; esportazione `.ics` per Google o Apple Calendar.
- **Aule libere** in tempo reale dalle API pubbliche del Politecnico, con la timeline delle occupazioni.
- **Da fare** per corso e generale, con scadenze.
- **Pomodoro** nella barra laterale, assegnabile a un corso, con statistiche.

**AI** (Antigravity CLI predefinito, oppure Claude Code o Gemini CLI)
- Sommario automatico dopo la trascrizione.
- Appunti, riassunti, spiegazioni e flashcard per ogni lezione.
- Agente sull'intero corso: riassunto, guida d'esame, glossario, mappa slide↔lezioni.

**Aspetto**: tema Normale (stile macOS) o Developer, chiaro/scuro, font JetBrains Mono incluso.

## Distribuzione

1. **Configura** in `package.json` → `polirec`:
   ```json
   "polirec": { "donateUrl": "https://buymeacoffee.com/<tuo-utente>", "repo": "<utente>/polirec" }
   ```
   - `donateUrl` mostra il pulsante ☕ nella barra laterale e in Impostazioni.
   - `repo` attiva il controllo aggiornamenti dalle release di GitHub.

   Per pubblicare su GitHub aggiungi anche `"repository"` e `build.publish` con owner e repo.
2. **Pubblica una versione**: `npm version minor && git push --tags`. Il workflow
   `.github/workflows/build.yml` crea `.dmg`/`.zip` (macOS arm64+x64), `.exe` (Windows) e
   `.AppImage`/`.deb` (Linux) e li allega alla release.
3. **Firma** (consigliata ma a pagamento):
   - **macOS**: senza un certificato Apple Developer (99 $/anno) l'app va aperta la prima volta con
     *tasto destro → Apri*. Con il certificato imposta `CSC_LINK`/`CSC_KEY_PASSWORD` e la notarizzazione nel workflow.
   - **Windows**: senza firma compare l'avviso SmartScreen ("Ulteriori informazioni → Esegui comunque").

In locale: `npm run dist:mac`, `npm run dist:win`, `npm run dist:linux`, ognuno da eseguire sul proprio sistema operativo.

## Riga di comando

```bash
node src/cli.js courses | list | add <corso> <cartella> [nome] [--materials] [--lang en]
node src/cli.js sync [corso…] [--dry-run] [--limit N] [--materials] [--only-materials] [-j N]
node src/cli.js transcribe [corso]
node scripts/discover-all.js out.json      # verifica in sola lettura su tutti i tuoi corsi
```

Dati e configurazione in `~/.polirec/`; in caso di problemi, screenshot e HTML delle pagine sono in `~/.polirec/debug/`.
