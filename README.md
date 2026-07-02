# 🍺 LISA INVADERS

Un gioco stile *Space Invaders* dove **Lisa** — la lager italiana non filtrata di Birra del Borgo — difende la birra artigianale dall'invasione delle lager industriali: Bud, Beck's, Tennent's e Corona.

**🎮 Gioca online: https://lisa-invaders.vercel.app**

## Come si gioca

### 💻 Su PC (tastiera e mouse)
- `←` `→` oppure `A` `D` per muoverti
- `SPAZIO` per sparare
- Clic sul gioco per sparare, trascina con il mouse per muoverti
- `P` pausa · `M` muto · `R` riavvia

### 📱 Su iPhone / telefono
- Tocca il riquadro di gioco per iniziare
- Tieni il dito sullo schermo e trascina per muovere la Lisa
- Ogni tocco spara
- Usa i pulsanti sotto il gioco per suono, pausa e riavvio
- Consiglio: aggiungi la pagina alla schermata Home (Safari → Condividi → Aggiungi a Home) per evitare zoom e scroll del browser

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

## Deploy su Vercel

Sito pubblicato su [lisa-invaders.vercel.app](https://lisa-invaders.vercel.app).

### Dopo il merge su `master`

1. Vercel → progetto **lisa-invaders** → **Deployments**
2. Verifica che il deploy più recente abbia commit su `master` e stato **Production**
3. Se il deploy è solo **Preview**: menu **⋯** → **Promote to Production**
4. Controlla che **Settings → Git → Production Branch** sia **`master`**

### Verifica che il deploy sia aggiornato

Apri il sorgente della pagina e cerca il commento:

```html
<!-- deploy-check: unified-desktop-mobile -->
```

Se non compare, il sito live non ha ancora l'ultima versione.

### Deploy manuale (alternativa)

```bash
npx vercel --prod
```
