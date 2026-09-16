# Pompwagen Tycoon — coding rules

Read `docs/game-design.md` (what to build) and `docs/mvp-plan.md` (how to build it) before changing gameplay.

## Rules
- TypeScript **strict mode**. Fix all type errors before committing.
- **No gameplay numbers hardcoded.** Prices, speeds, order sizes, costs, timers all live in `src/config/*.json`.
- **Game logic never imports Three.js.** Everything in `src/core/` is pure data + logic, communicating via `src/core/EventBus.ts`. Rendering lives in `src/world/`, DOM UI in `src/ui/`.
- Every feature must work on a phone-sized viewport (portrait first) — touch joystick, safe areas, `100dvh`, no pinch/double-tap zoom.
- Keep files small and focused; one system per file.
- After each feature: `npm run build` and fix every error before moving on.
- Performance budget: 60 fps target on mid-range phones, one shadow light, pixel ratio capped at 2, shared geometries/materials, textures ≤ 1024².
- Fictional brand names only (clients and suppliers live in `src/config/brands.json`).
- The old one-shot prototype is `reference/index.html` — reference only, never import from it.

## Commands
- `npm run dev` — dev server (add `--host` to test on a phone)
- `npm run build` — typecheck + production build
- `npm run preview` — serve the production build
