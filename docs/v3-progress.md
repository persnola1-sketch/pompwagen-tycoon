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
| 7 Conveyors | todo | |
| 8 Quests | todo | |
| 9 City | todo | |
| 10 Clients & brands | todo | |
| 11 Shop menu | todo | |
| 12 Ad hooks | todo | |
| 13 Animations & effects | todo | |
| 14 UI overhaul | todo | |
| 15 Balance, save, perf | todo | |

## Testing

`scratchpad/smoke.mjs` (session scratchpad, not in repo) drives the built game headlessly with Playwright; the game exposes `window.__game.debugInfo()` with `?dev`.
