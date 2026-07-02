# 🍺 LISA INVADERS

Un gioco stile *Space Invaders* dove **Lisa** — la lager italiana non filtrata di Birra del Borgo — difende la birra artigianale dall'invasione delle lager industriali: Bud, Beck's, Tennent's e Corona.

**🎮 Gioca online: https://lisa-invaders.vercel.app**

## Come si gioca

### 💻 Su PC
- `←` `→` oppure `A` `D` per muoverti
- `SPAZIO` per sparare
- `P` pausa · `M` muto · `R` riavvia

### 📱 Su iPhone / mobile
- Tocca lo schermo per iniziare
- Trascina il dito sul riquadro di gioco per muovere la Lisa
- Ogni tocco spara
- Usa i pulsanti sotto il gioco per suono, pausa e riavvio

## Punteggi

| Nemico | Punti |
|---|---|
| Bud | 40 |
| Beck's | 30 |
| Tennent's | 20 |
| Corona | 10 |

Il record viene salvato nel browser. A ogni ondata ripulita si sale di livello: i nemici diventano più veloci e sparano di più.

## Tecnologia

HTML5 Canvas + JavaScript vanilla, effetti sonori retrò generati con WebAudio (nessun file audio). Nessuna dipendenza, nessuna build: basta aprire `index.html` o servire la cartella con un qualsiasi server statico.

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```
