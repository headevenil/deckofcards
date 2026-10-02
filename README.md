# JinxO Deck

A static web app that shuffles a deck of 200 JinxO topic cards and flips them one at a time. Built for a
phone lying flat on the table: each card shows one topic upright and the other rotated 180° for the
player across from you.

- Tap or swipe to flip; undo, rotate 180°, and reshuffle with a riffle animation
- Your shuffled order and position are saved on the device
- Works offline and installs to the home screen when served over HTTPS

## Files

```
index.html             the app (markup, styles, script — no build step)
cards.js               the deck: window.CARDS = [{ id, sentences: [top, rotated] }, …]
sw.js                  offline cache
manifest.webmanifest   home-screen install
icon*.{svg,png}        app icons
PLAN.md                design and animation notes
```

## Run locally

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://<your-computer's-ip>:8000` on a phone on the same Wi-Fi.

## Deploy

Host the repo root as a static site (Cloudflare Pages, GitHub Pages, Netlify). On Cloudflare Pages,
use framework preset **None**, an **empty** build command, and output directory **`/`**.

## Editing cards

Edit `cards.js`, then bump `VERSION` in `sw.js` (e.g. `jinxo-v1` → `jinxo-v2`) so phones that played
offline drop their cached copy.
