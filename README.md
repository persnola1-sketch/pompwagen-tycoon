# Pompwagen Tycoon

Mobile-first 3D warehouse middleman tycoon: accept supplier deliveries, unload
pallets with your pompwagen, store them in racks, sell to customer trucks, and
grow the warehouse. Built with Vite + TypeScript + Three.js.

Design docs: `docs/game-design.md` and `docs/mvp-plan.md`.
Coding rules for AI agents: `CLAUDE.md`.

## Run locally

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL. WASD/arrow keys or mouse drag to
drive on desktop.

## Play on your phone (same Wi-Fi)

```bash
npm run dev -- --host
```

Vite prints a `Network:` URL like `http://192.168.x.x:5173` — open that in
Safari (iPhone) or Chrome (Android). Use Share → **Add to Home Screen** on
iPhone to play fullscreen. Drag anywhere on screen to drive.

## Build & preview production

```bash
npm run build          # typecheck + bundle to dist/
npm run preview -- --host   # serve dist/ on the network
```

Deploying `dist/` to Vercel/Netlify/GitHub Pages works as-is (static site,
relative paths).

## Dev tools

Open with `?dev` in the URL (e.g. `http://localhost:5173/?dev`) for the fps
counter, +€1000 button and save reset.

All gameplay numbers (prices, order sizes, upgrade costs, speeds, timers) live
in `src/config/*.json` — tune them there, never in code.
