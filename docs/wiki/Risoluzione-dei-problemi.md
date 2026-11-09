# Risoluzione dei problemi

Il pannello **Attività** in fondo alla finestra (freccia ⌃ in basso a destra) mostra il log in tempo reale.
Se una pagina del Politecnico non si comporta come previsto, screenshot e HTML vengono salvati in `~/.polirec/debug/`.

## Login e sincronizzazione

| Problema | Soluzione |
|---|---|
| «Login richiesto» e si apre Chrome | Normale alla prima sincronizzazione o quando la sessione scade: completa l'accesso PoliMi/SPID nella finestra di Chrome |
| «Google Chrome non trovato» | Installa Chrome, oppure avvia con `POLIREC_CHROME=/percorso/di/chrome` |
| Il profilo di Chrome è «in uso» | Un'altra sincronizzazione (app o CLI) sta usando il profilo: PoliRec attende che finisca. Se rimane bloccato, chiudi le finestre di Chrome aperte da PoliRec |
| Nessuna registrazione trovata | Controlla che il corso abbia un archivio delle registrazioni (RecMan o link WebEx). Puoi aggiungere i link a mano in *Impostazioni del corso → Link extra* |
| Video protetto da password | *Impostazioni del corso → Password video* |
| Il corso scarica le lezioni di un altro docente | *Impostazioni del corso → Docenti seguiti* |
| Download lento o interrotto | Riduci i download in parallelo (Impostazioni). I download interrotti riprendono alla sincronizzazione successiva |

## Trascrizione

| Problema | Soluzione |
|---|---|
| «Completa prima il setup» | *Impostazioni → Trascrizione → Rifai il setup…* |
| Troppo lenta | Scegli un modello più piccolo (small o base) o, su Apple Silicon, Parakeet |
| Frasi ripetute o inventate nei silenzi | Lezioni → ⋯ Altro → «Pulisci trascrizioni» (gli originali restano in `trascrizioni/.orig`) |
| Lingua sbagliata | *Impostazioni del corso → Lingua delle lezioni* |

## AI

| Problema | Soluzione |
|---|---|
| «Nessuno strumento AI installato» | Installa Antigravity CLI, Claude Code o Gemini CLI, accedi una volta dal terminale e sceglilo in *Impostazioni → AI* |
| Le note non compaiono | Controlla il log Attività. La generazione richiede 1-2 minuti per lezione e avviene una alla volta (indicatore «AI» nella barra laterale) |
| «Indice vuoto» nella ricerca | *Impostazioni → AI → Ricerca semantica → Installa*, poi «Aggiorna indice» |

## Assistenti AI (MCP) e CLI

| Problema | Soluzione |
|---|---|
| «Accesso degli assistenti AI disattivato» | Attiva *Impostazioni → Assistenti AI e automazioni → Assistenti AI (MCP)* |
| Claude non vede gli strumenti | `claude mcp list` deve mostrare `polirec`. Se hai spostato l'app, registrala di nuovo con il comando aggiornato |
| `polirec: command not found` | Copia l'alias dalle Impostazioni nel tuo `~/.zshrc` o `~/.bashrc` e apri un nuovo terminale |
| «polirecd non risponde» | `polirec daemon stop`, poi riapri l'app (o rilancia il comando): il server riparte da solo |
| «Corso non trovato» | `polirec list` mostra i nomi e i numeri validi |

## macOS

| Problema | Soluzione |
|---|---|
| «PoliRec non può essere aperto» | La prima volta: *tasto destro sull'app → Apri* |
| I file di un disco esterno non si vedono | Concedi a PoliRec l'accesso ai dischi in *Impostazioni di Sistema → Privacy e sicurezza → File e cartelle* |
