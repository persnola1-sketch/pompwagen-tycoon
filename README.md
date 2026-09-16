# Pompwagen Tycoon

Mobile-first 3D warehouse middleman tycoon. Start on an empty plot in a Dutch
city, buy and build your warehouse, then accept supplier deliveries, store
pallets in racks, sell to customer trucks, hire a team, and automate with
conveyors and a forklift. Built with Vite + TypeScript + Three.js.

Design docs: `docs/game-design.md`, `docs/economy.md`, `docs/v3-progress.md`
(what shipped per phase), `docs/mvp-plan.md` (the original plan).
Coding rules for AI agents: `CLAUDE.md`. Asset licenses: `CREDITS.md`.

## Run locally

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

**Desktop controls:**
- WASD/arrow keys or mouse drag to drive
- mouse wheel to zoom
- 🗺️ button for the overview

## Play on your phone (same Wi-Fi)

```bash
npm run dev -- --host
```

Vite prints a `Network:` URL like `http://192.168.x.x:5173` — open that in
Safari (iPhone) or Chrome (Android). Use Share → **Add to Home Screen** on
iPhone to play fullscreen.

**Phone controls:**
- drag anywhere to drive
- pinch with two fingers to zoom (this never moves the pompwagen)
- tap 🗺️ for the whole-map overview; tap the world to return
- bottom bar: Shop · Workers · Quests · Orders · Map
- ⚙️ for sound, music, tips and graphics quality

## Dev tools

Add `?dev` to the URL for the fps/draw-call readout plus buttons for money,
company level, finishing timers, spawning an event, skipping the tutorial and
resetting the save.

```bash
npm run sim   # economy pacing simulation; exits non-zero if a median misses its band
```

## Build & preview production

```bash
npm run build          # typecheck + bundle to dist/
npm run preview -- --host   # serve dist/ on the network
```

Deploying `dist/` to Vercel/Netlify/GitHub Pages works as-is (static site,
relative paths).

## Dev tools

Open with `?dev` in the URL (e.g. `http://localhost:5173/?dev`) for:
- fps, draw-call, triangle and pixel-ratio readout
- +€1000 and +10 shipped (unlocks products) buttons
- save reset

All gameplay numbers (prices, products, order sizes, upgrade costs, speeds,
timers, camera limits) live in `src/config/*.json`. Tune them there, never in
code. After changing the economy, run `npm run sim` to check the pacing targets
(see `docs/economy.md`).

## Assets

- `public/textures/` holds KTX2 (Basis Universal) textures made from CC0 Poly
  Haven photos. They are transcoded by `public/basis/`.
- `public/models/` holds CC0 Kenney GLB models.
- Everything else (trucks, worker, racks, pallets, props) is built in code from
  merged/instanced geometry. Every asset has a canvas fallback, so the game
  still runs if a download fails.
