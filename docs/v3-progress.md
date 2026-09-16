# Update v3 progress

Tracks what is built per phase of `docs/update-v3.md`, so a new session can continue.

| Phase | Status | Notes |
|---|---|---|
| 1 Playtest fixes | done | big pad labels + floating billboard labels (`Pads.ts`), wall/roof cutaway (`Cutaway.ts`), collapsible order board with badge, yard shrunk, closer camera |
| 2 Empty plot + construction | done | `Plot.ts`, BUY WAREHOUSE pad (€15,000), `construction/WarehouseBuild.ts` 10 s sequence (crane, builders, dust, sparks, progress HUD, shake, confetti, banner), save v3 migration |
| 3 Henk + tutorial | done | `world/Henk.ts` hologram with beam, `ui/GuideBubble.ts` typewriter + skip, `core/Tutorial.ts` new flow, one-time tips (`tutorial.json`), `settings.henkTips` |
| 4 Workers | done | `core/workers/*` (roster, candidates, XP/levels, wages, temp workers, clerk rules, offline shift), `core/Pathfinding.ts` A*, `game/WorkerAI.ts`, `world/workers/*` actors + status bubbles + fallen pallets, `ui/WorkersPanel.ts`, `ui/ShiftReport.ts` |
| 5 Construction & delivery timers | done | `core/Timers.ts` jobs (saved), `game/Construction.ts` (sites, delivery truck roll-out, effects), `world/construction/ConstructionSite.ts`, `ui/TimersHud.ts` finish-now (ad stub `services/AdService.ts` or fee), `construction.json` |
| 6 Forklift + high racks | done | `world/Forklift.ts` (rear-wheel steering, 2-stage mast), 3 rack levels in `GameState` slot indexing + `Racks.ts`, parking pad switches vehicle, upper-level pads per row, forklift-driver workers drive one too, reach truck shown "coming soon" |
| 7 Conveyors | done | `world/Conveyor.ts` (polyline belts, scrolling texture, drums, instanced pallets, queueing), `game/Conveyors.ts` (inbound auto-stores into racks, outbound auto-loads the truck), pads gated on shipped count, built through construction timers, motor hum |
| 8 Quests | done | `core/quests/*` (story chain, 3 daily with baselines + daily reset, achievements, timed client quests, company XP/levels), `core/Events.ts` (rush hour, inspection, VIP client, late supplier), `ui/QuestPanel.ts`, HUD level chip + tracked widget + claim badge, dev panel buttons |
| 9 City | done | `world/city/*`: `Roads.ts` (ring + outer grid, bike lanes, kerbs, zebras, roundabout), `Buildings.ts` (Dutch terraces with gables, client shops with signs, offices, supermarket, petrol station, halls, parks), `Traffic.ts` (instanced cars/vans/bikes on lane loops, braking, traffic lights, gives way to trucks), `Pedestrians.ts`, `City.ts`; `Yard.ts` trimmed to the plot with animated gate barriers and a waving flag; optional day/night in `Scene.ts`
| 10 Clients & brands | done | `config/brands.json` (8 clients, 6 suppliers), `core/Brands.ts` (lookup + loyalty tiers bronze/silver/gold with price bonus), `ui/Logo.ts` (SVG + canvas marks), logos on order cards, order board, truck liveries, city shop fascias, `ui/ClientsPanel.ts` profiles with contact, favourites and history
| 11 Shop menu | done | `config/shop.json` + `game/Shop.ts` (prices, company-level gates, purchase effects), `ui/ShopPanel.ts` (5 tabs, cards with build/delivery times, lock states), `ui/BottomNav.ts` (Shop · Workers · Quests · Orders · Map with badges, one panel at a time), `ui/MapPanel.ts` live city map, cosmetics (company name/logo, vest, vehicle paint, wall colour) applied to the world
| 12 Ad hooks | done | `services/AdService.ts` fake rewarded break; 📺 buttons for finish construction/delivery (`TimersHud`), finish training + free temp worker (`WorkersPanel`), double quest reward (`QuestPanel`), double night shift (`ShiftReport`), free rush boost and finish-all (shop Boosts). All optional, never forced
| 13 Animations & effects | done | rolling dock doors, blinking truck indicators, money counter roll-up + coins flying to the HUD, `world/Ambience.ts` (dust motes, birds), idle phone check, forklift mast tilt, button press bounce, procedural background music with a toggle, `ui/SettingsPanel.ts` (sound, music, tips, graphics quality, reset)
| 14 UI overhaul | done | design tokens (navy surfaces, orange/yellow accents, radii, shadows, 44 px targets), Baloo 2 + Nunito from Google Fonts with fallbacks, order cards rebuilt (logo, contact portrait, product lines, stock checks, countdown ring, big buttons), coin icon on the money chip, landscape media query
| 15 Balance, save, perf | done | economy retuned and gated by company level (`npm run sim` passes every band, see `docs/economy.md`), sim rewritten for workers/levels/timers, save covers every system with v1→v3 migration, graphics quality (auto/low/medium/high) also scales traffic and pedestrians, dev panel has money/level/timers/event/skip/reset, tutorial made robust when the player runs ahead

## Testing

`scratchpad/smoke.mjs` (session scratchpad, not in repo) drives the built game headlessly with Playwright; the game exposes `window.__game.debugInfo()` with `?dev`.
