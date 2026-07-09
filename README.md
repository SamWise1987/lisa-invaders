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

## Deploy su Vercel

Il sito è pubblicato su [lisa-invaders.vercel.app](https://lisa-invaders.vercel.app).

### Deploy automatico da GitHub

Dopo ogni push su `master`, Vercel deve ricostruire il sito. Se il merge non aggiorna il sito live, di solito il progetto **non è collegato al repository GitHub** (deploy fatto solo da CLI o drag-and-drop).

**Per collegare il repo e ripristinare il deploy automatico:**

1. Apri [vercel.com/dashboard](https://vercel.com/dashboard) → progetto **lisa-invaders**
2. **Settings** → **Git** → **Connect Git Repository**
3. Scegli `SamWise1987/lisa-invaders` e branch di produzione **`master`**
4. Framework preset: **Other** (sito statico, nessuna build)
5. Root Directory: `.` (root del repo)
6. Salva, poi vai in **Deployments** → **Redeploy** sull’ultimo commit di `master`

**Verifica rapida:** nella pagina del deploy su Vercel deve comparire il commit `Migliora l'esperienza touch su mobile...`. Se vedi un commit più vecchio, il collegamento Git non è attivo.

### Deploy manuale (alternativa)

```bash
npx vercel --prod
```

Serve aver fatto `npx vercel link` al progetto la prima volta.


HTML5 Canvas + JavaScript vanilla, effetti sonori retrò generati con WebAudio (nessun file audio). Nessuna dipendenza, nessuna build: basta aprire `index.html` o servire la cartella con un qualsiasi server statico.

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

## Deploy su Vercel

Sito statico (HTML/JS, nessuna build). Su Vercel imposta **Framework Preset: Other** e lascia vuoto il **Build Command**.

Pubblicato su [lisa-invaders.vercel.app](https://lisa-invaders.vercel.app).

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
