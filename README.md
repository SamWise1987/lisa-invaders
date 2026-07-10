# 🍺 Lisa Invaders

Arcade browser game responsive per desktop e mobile: Lisa difende la birra italiana da Bud, Beck's, Tennent's e Corona.

**Gioca online:** [lisa-invaders.vercel.app](https://lisa-invaders.vercel.app)

## Funzioni

- Modalità **Facile**, **Normale** e **Arcade**, con vite, velocità, frequenza di fuoco, drop e moltiplicatori diversi.
- Boss ogni 5 livelli con tre pattern ciclici: ventaglio, mira sul giocatore e pioggia di colpi.
- Tutorial interattivo di circa 10 secondi alla prima partita, ripetibile dalle opzioni.
- Missione giornaliera deterministica basata sulla data UTC: stessa configurazione per tutti.
- Obiettivi persistenti: combo ×4, livello senza danni, 20 nemici consecutivi, boss e missione giornaliera.
- Classifica locale top 10 e classifica online opzionale tramite Upstash Redis.
- Schermata finale con punteggio, livello, record, salvataggio nome e condivisione Web Share/clipboard.
- Gamepad su desktop, controlli touch con fuoco continuo e vibrazione mobile disattivabile.
- Accessibilità: movimento ridotto, screen shake disattivabile e modalità ad alto contrasto.
- PWA installabile, offline dopo il primo caricamento e pausa automatica in background.

## Comandi

### Desktop

- `←` `→` oppure `A` `D`: movimento
- `SPAZIO`, clic o pulsante A/grilletto del gamepad: fuoco
- `P` o Start gamepad: pausa
- `M`: audio
- `R`: riavvio

### Mobile

- Trascina Lisa nell'area di gioco.
- Tieni premuto **SPARA** per il fuoco continuo.
- Usa i pulsanti sotto il gioco per audio, pausa, riavvio e opzioni.

## Sviluppo locale

Non ci sono dipendenze o build step.

```bash
python3 -m http.server 8000
```

Apri `http://localhost:8000`.

## Classifica online

La funzione serverless `api/leaderboard.js` usa le API REST di Upstash Redis. Nel progetto Vercel devono essere presenti:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Se le variabili non sono configurate, il gioco continua a funzionare e mostra la classifica locale.

## Deploy Vercel

Il progetto è statico con una funzione serverless, quindi su Vercel usa **Framework Preset: Other**, root `.` e nessun Build Command.

```bash
vercel --prod
```

Il branch di produzione GitHub è `master`. Per verificare la versione pubblicata, nel sorgente cerca:

```html
<!-- deploy-check: advanced-gameplay-v1 -->
```
