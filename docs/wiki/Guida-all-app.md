# Guida all'app

## Dashboard
- **Card dei corsi**: lezioni, scaricate, trascritte, file. Le frecce ↑ ↓ sulla card cambiano l'ordine, che è anche la **priorità di sincronizzazione**.
- **⟳ Sincronizza tutto** aggiunge i corsi alla coda. Con *Impostazioni → Sincronizzazione automatica* parte anche all'avvio e ogni N ore.

## Pagina del corso

| Scheda | Contenuto |
|---|---|
| **Panoramica** | «Chiedi al corso» (risposte con citazioni), scheda del corso generata dall'AI (in breve, docenti, esame, orario), cose da fare, prossime lezioni, statistiche di studio, appunti e materiale |
| **Lezioni** | Indice per data e una scheda per lezione: sommario, argomenti, pulsanti rapidi (▶ Guarda, Trascrizione, note AI, appunti collegati) |
| **Materiale** | Slide e PDF divisi per sezione WeBeep |
| **Note AI** | Tutte le note generate dall'AI per il corso |
| **Impostazioni** | Nome, cartella, lingua, sync automatica, materiale, link extra, password video, **docenti seguiti** |

**Lezioni parallele**: se un corso ha registrazioni di più docenti, PoliDesk mostra *«Quale docente segui?»* e scarica solo quelle
scelte (puoi selezionarne più di uno). La scelta si cambia in *Impostazioni del corso → Docenti seguiti*, con l'opzione di spostare
nel Cestino i file dei docenti che togli. Nell'elenco lezioni il pulsante 👥 mostra o nasconde le lezioni degli altri docenti.

La **scheda del corso** è scritta dall'AI e si aggiorna da sola finché non la modifichi tu. «Rigenera» la riscrive.

## Pagina della lezione
- **Player**: play/pausa, ±10 s, velocità 0.75-3×, ⏭ salto dei silenzi (usa i tempi della trascrizione), schermo intero, ↗ apri con l'app di sistema. Riprende da dove eri rimasto.
- **Trascrizione** (a destra): segue il video, si clicca per saltare, si cerca. **⧉ Copia** copia tutto il testo senza tempi, in paragrafi.
- **Appunti** (a destra): appunti collegati a questa lezione, «＋ Nuovo appunto» (già collegato) e «🔗 Collega esistente».
- **Studia con l'AI** (sotto il video):

| Strumento | Cosa produce |
|---|---|
| 🃏 Flashcard | Mazzo interattivo: clic o spazio per girare, «La so» / «Da ripassare» |
| ❓ Domande d'esame | 8-12 domande con traccia di risposta, dalla più semplice alla più impegnativa |
| 📝 Appunti | Appunti completi con formule LaTeX, punti chiave e possibili domande |
| 💡 Spiegazioni | I concetti più difficili spiegati con intuizione, formule ed esempi |
| 📄 Riassunto | Una pagina |
| 💬 Chat | Domande libere sulla lezione. Ogni risposta si può copiare o salvare negli appunti |

Ogni risultato si può **copiare**, **rigenerare** o trasformare in un **appunto modificabile** collegato alla lezione.

## Appunti
Tre formati, ognuno con il suo editor:
- **Markdown**: anteprima live, formule `$…$` e `$$…$$` (KaTeX), checklist, immagini incollate, link `[[altro appunto]]`.
- **LaTeX**: si compila in PDF con Tectonic, gli errori sono segnati sulla riga.
- **Typst**: si compila in PDF con Typst, istantaneo.

Funzioni comuni:
- **Modalità**: Scrivi, Dividi o Leggi.
- **✨ AI**: chiedi una modifica e la vedi direttamente nel documento, da accettare (✓) o rifiutare (✕) una a una.
- **🎙 Detta**: la voce viene trascritta in locale.
- **🔗 Collega a lezioni**: un appunto può riferirsi a una o più lezioni, anche di corsi diversi.
- **Esporta**: PDF, più le app attivate in Impostazioni (Notion, Note di Apple, Goodnotes, Notability, Obsidian).
- **Elenco dei file**: si nasconde con ⇤ o ⌘⇧E.

## Cerca
Ricerca semantica in trascrizioni, slide, sommari e appunti: trova i concetti anche con parole diverse o in un'altra lingua.
Ogni risultato apre la lezione al minuto giusto. «Chiedi all'AI» risponde usando le fonti trovate, con citazioni [1], [2]…

## Calendario
- **Orario**: si importa dai Servizi Online (Calendario → Importa orario), oppure da file o URL `.ics`.
- **Scadenze**: compaiono anche quelle delle cose da fare.
- **Esportazione**: un `.ics` da aggiungere a Google o Apple Calendar.

## Aule libere
- **Filtri**: sede, giorno, fascia oraria (barra delle ore e durata).
- **Elenco**: aule raggruppate per edificio, con foto, stato (LIBERA / PARZIALE), posti, «libera fino alle…» e timeline del giorno.
- **★ Preferite**: aule ed edifici preferiti, sempre in cima.
- **Mappa**: edifici colorati per disponibilità; cliccando un edificio vedi le sue aule.

Dati pubblici del Politecnico. Idea di PoliAule e @alpolimibot.

## Da fare e Pomodoro
- **Da fare**: per corso o generali, con scadenza; compaiono nel calendario.
- **Pomodoro**: nella barra laterale. Si può assegnare a un corso e le statistiche compaiono nella Panoramica. Durate in Impostazioni.

## Attività in background

La barra in fondo alla finestra è sempre visibile. A sinistra c'è l'ultima operazione, a destra quello che sta girando:
download (⬇ con percentuale), trascrizioni (🎙), AI (✨), elementi in pausa e dischi esterni non collegati.

**Attività** (o ⌘J) apre il pannello:
- **In corso**: sincronizzazione, download, trascrizioni e coda AI. Ogni download e ogni trascrizione si mette in
  pausa e si riprende singolarmente (⏸ / ▶), oppure tutti insieme. Un download in pausa riparte da dove si era fermato;
  una trascrizione in pausa riparte dall'inizio. Le pause restano valide anche dopo aver chiuso l'app.
- **Registro**: tutto quello che è successo, anche a finestra chiusa, con filtri (problemi, sincronizzazione, download,
  trascrizioni, AI), ricerca e copia.

Le operazioni continuano anche chiudendo la finestra: le esegue il motore di PoliDesk (`polideskd`) in background.

## Login e browser

La sincronizzazione usa Chrome **in background, senza finestre**. Quando il Politecnico (PoliMi, SPID, WebEx) chiede di
accedere, si apre la finestra **«Accedi al Politecnico»** di PoliDesk. Fai il login lì: la finestra si chiude da sola e
la sincronizzazione riprende. Se usi solo la riga di comando o un assistente AI, al suo posto si apre una piccola
finestra di Chrome senza schede, solo per l'accesso. Per vedere Chrome mentre lavora (utile se qualcosa non va):
*Impostazioni → Sincronizzazione → Mostra il browser*.

## Corsi su un disco esterno

Se la cartella di un corso è su un disco esterno scollegato, PoliDesk non mostra errori e non scrive altrove. Compare
**«Collega il disco»** con i corsi coinvolti, e la dashboard e la pagina del corso lo segnalano. Quando colleghi il
disco, PoliDesk se ne accorge in pochi secondi e risincronizza quei corsi da solo.

## Impostazioni (principali)
| Sezione | Cosa si regola |
|---|---|
| Aspetto | Tema Normale o Developer, chiaro/scuro, font (JetBrains Mono incluso), dimensione del testo |
| Trascrizione | Motore, modello, lingua, trascrizione automatica, pulizia dei testi |
| Download | Cartella predefinita, download in parallelo, sync automatica |
| AI | Strumento (Antigravity, Claude Code, Gemini), sommari/appunti automatici, scheda del corso automatica, ricerca semantica |
| Appunti | Formato predefinito, cartella degli appunti generali, motori LaTeX e Typst |
| Sincronizzazione cloud | iCloud Drive, Google Drive, Dropbox, OneDrive o una cartella a scelta |
| Integrazioni | Notion, Note di Apple, Goodnotes, Notability, Obsidian (tutte da attivare) |
| Assistenti AI e automazioni | Server MCP e riga di comando (vedi [Server MCP](Server-MCP.md)) |
