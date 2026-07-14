# Sprite nemici — file sorgente

Metti qui le **4 foto prodotto su sfondo bianco** (quelle corrette, a fuoco):

- `lustweiser.png` — bottiglia Lustweiser
- `necks.png` — bottiglia Neck's
- `borona.png` — bottiglia Borona Extra
- `bennets.png` — lattina Bennets

Poi genera gli sprite per il gioco:

```bash
python3 scripts/prepare-enemy-sprites.py
```

Lo script rimuove lo sfondo bianco, ritaglia e ridimensiona a 600px di altezza (come gli sprite originali).
