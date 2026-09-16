# Pompwagen Tycoon – Update v4: "Grow the Warehouse"

v4 has two goals:
1. Make what exists solid: nothing gets stuck, the warehouse feels open, and v3 is finished.
2. Change the player's role over time: at first you do all the work yourself; later you run a
   growing, oddly shaped warehouse with a team, a manager and jobs only the boss can handle.

Read `docs/game-design.md`, `docs/update-v3.md`, `docs/economy.md` and the current code before
starting.

---

## How to work through this document

- Work top to bottom: Part 0 → Part 1 → Part 2 → Part 3.
- Keep a checklist in `docs/progress.md` with one line per numbered item (0.1, 0.2, 1.1 …).
  Tick an item as soon as it is committed.
- **If `docs/progress.md` already exists when you start, skip every ticked item and continue from
  the first unticked one.** Sessions may be cut off halfway, so resuming must always work.
- After every item: run the build, fix errors, make a git commit with a clear message.
- Don't ask questions. Make reasonable choices and write assumptions in `docs/progress.md`.
- If something already exists in code, fix or finish that version. Never build a second copy.
- All prices, timers and balance numbers go in `src/config`, not hardcoded.
- World UI rule: **no floating signs above pads.** Costs and labels live on the floor pads only.
  If any floating world labels are still in the code, remove them and move their state onto the
  pad (price, lock, affordable/not affordable, progress fill).
- Every system must work with touch on iPhone and Samsung, and keep 60 fps on phones.
- Bump the save version and migrate v3 saves (see section 4).

---

## PART 0 – Finish v3

Leftovers from the v3 build report.

### 0.1 Multiple active orders and a real second dock
- The order system runs one supplier order and one customer order at a time. Change it to
  support several active orders: one per active dock, plus a queue.
- Each order gets its own truck, dock, loading state and timer. Workers and the manager pick
  tasks across all active orders.
- Remove the "second dock door = 30% faster turnaround" upgrade. The second dock is a real bay
  where a second truck parks. Players who already bought the old upgrade get the dock for free.
- A locked dock shows a floor pad with its price. Once bought, trucks spread over all docks.
- Supplier trucks use the inbound docks the same way.

### 0.2 Trucks drive through the city
- Trucks currently appear just outside the ring road and drive straight to the gate. Make them
  enter from the edge of the map, drive along the city street and turn into the gate, then
  leave the same way. Traffic keeps yielding to them.

### 0.3 Streetlights at night
- Streetlights, yard lamps and warehouse ceiling lamps use emissive materials that fade on at
  dusk and off at dawn.
- Fake the light pools with glow decals on the ground, not real lights.

### 0.4 Shop card previews
- Replace the emoji icons on shop cards with rendered previews of the real models. Render them to
  images once at load and cache them. No live 3D per card.

### 0.5 Quest rewards
- Some quests reward cosmetics (vest colors, helmet colors, pompwagen and forklift skins) or
  **unlock tokens**. An unlock token skips one unlock requirement (for example a company level
  lock), but never the price.
- Show the reward type clearly on the quest card. Cosmetics stay buyable in the shop too.

### 0.6 Worker card and level-up popup
- Tapping a worker in the world opens that worker's own card (name, trait, level, XP bar, role,
  upgrades, stats), not just the Team tab.
- A worker level up shows a small dedicated popup with confetti. Several level ups at once are
  queued, never stacked on top of each other.

### 0.7 Dropped from v3
- The carrying pose is dropped: nobody walks without a vehicle. Note this in
  `docs/game-design.md`.

---

## PART 1 – Playtest fixes

### 1.1 Joystick gets stuck (Android)
- The joystick sometimes keeps moving after the finger is lifted.
- Track the touch by pointerId and only react to that pointer.
- Reset on pointerup, pointercancel, lostpointercapture, window blur, visibilitychange and
  orientation change.
- `touch-action: none` on the joystick area. UI panels or popups opening mid-drag must not
  swallow the release.
- Safety net: if there are no active touches, force the joystick to center.
- Pinch-to-zoom must never trigger the joystick.

### 1.2 Player gets stuck with pompwagen and forklift
- Use a capsule or circle collider for player plus vehicle, and slide along walls, racks and
  props instead of stopping dead.
- Rounded collision on corners and rack ends, with a small auto-steer around edges.
- Check that every aisle fits the forklift turning circle, including in new wings. Widen the
  layout where it doesn't.
- If the player hasn't moved for ~1.5 s while pushing the joystick, nudge them to the nearest
  free spot.

### 1.3 Workers get stuck and run around
- Grid-based A* pathfinding. Rebuild the grid whenever the layout changes (racks, conveyors,
  expansions, docks).
- Local avoidance: workers yield to each other and to the player.
- Task reservation: a worker locks the pallet, rack slot or truck it is going for, so two
  workers never chase the same job. Release the lock when the task is cancelled.
- Stuck detection: no progress for 2 s → repath. After 3 failed repaths → move the worker to the
  nearest free cell and pick a new task.
- Dev-only toggle that draws the nav grid, worker paths and reservations.

### 1.4 The warehouse feels stuffed
- Keep conveyors, but don't place them by default. They are bought and placed by the player.
- Conveyors go along walls or in dedicated lanes, never across main aisles.
- The player can sell or remove a conveyor for a 50% refund.
- Review other default props and decorations inside the hall. Move clutter to walls and corners
  so the floor reads as open space with clear lanes.

### 1.5 Reset progress
- "Reset progress" button in settings with a two-step confirm.
- Wipes the save and starts a fresh game with the intro and Henk.

---

## PART 2 – v4 features

### 2.1 New game intro with Henk
Finish or rebuild the intro from `update-v3.md` so a new game plays like this:
1. The player spawns on an **empty plot** next to the street. Henk (floating hologram guide)
   appears.
2. Henk explains the idea in 2–3 short bubbles: you're a middleman, buy from suppliers, store,
   sell to customers.
3. Walk to the BUY WAREHOUSE pad → construction animation.
4. First supplier delivery → unload → store in racks.
5. First customer order → load the truck → profit.
6. Hire the first worker.
7. Henk: "Check your quests. See you around, boss!"

- Speech bubbles with typewriter text, tap to continue, arrow pointing at the next target, skip
  button.
- After the tutorial, Henk pops up with a 1–2 line tip the first time each v4 feature unlocks
  (second dock, forklift driver, manager, building expansion, rush orders). Can be turned off
  in settings.
- Existing saves skip the intro.

### 2.2 Building expansions: a unique warehouse shape
The starting hall stays a compact rectangle. The building grows by adding **wings**, so the
footprint turns from a square into an L, then a T, then a U-like shape. Never just scale the
square up.

- Expansion pads sit on the outside of the wall where the wing will go (floor pad style, price
  on the pad, lock icon when requirements aren't met).
- Buying one plays a construction sequence: fencing and scaffold, wall section opens up, floor,
  walls, roof beams and lamps extend. Workers and trucks keep working during it.
- The nav grid, collision and camera bounds update when the wing is done.

**Wings (in this order):**
| Wing | Shape after | Purpose |
|------|-------------|---------|
| 1. Bulk Wing | L | Wide aisles and taller racks built for forklifts. New rack pads. |
| 2. Dock Wing | T | Dock 3 and 4 with staging lanes in front of the doors. |
| 3. Staff Wing | U-like | Break room (shorter worker breaks), manager office upgrade, locker room (cosmetics menu). |

- Each wing has its own look so it's recognizable (floor paint color for lanes, wall signs with
  the wing name painted on the wall, not floating).
- Design the layout so walking from the far end of any wing to the docks never feels painfully
  long.

### 2.3 Worker upgrades
Global upgrades per role in the Workers menu, with cost and current level:
- **Pallets per trip:** 1 → 2 → 3 (pompwagen workers). Pallets stack visibly.
- **Walking speed:** 5 levels.
- **Breaks:** fewer and shorter breaks, 3 levels.
- Upgrades apply immediately to all workers of that role, including future hires.

### 2.4 Forklift driver worker
- Hireable role. Needs at least one owned forklift. One driver per forklift, and buying more
  forklifts allows more drivers.
- Moves pallets between trucks, racks and conveyors with the same pathfinding and task
  reservation. Prefers the Bulk Wing's tall racks.
- Uses the worker card system (name, trait, level). The "Ex-forklift driver" trait halves
  training time.

### 2.5 Forklift carries two pallets
- Forklift upgrade "Double stack": carry two stacked pallets.
- Applies to the player's forklift and forklift driver workers.
- Pallets stack visibly on the forks, with a slight sway when turning.
- The pompwagen stays at two pallets for the player, as it is now.

### 2.6 Manager
- Hireable manager who works from the office and auto-accepts customer orders and supplier
  offers.
- Manager settings menu:
  - Only accept customer orders when stock is available (on by default)
  - Minimum profit per order
  - Restock rule per product: buy when stock drops below X
  - Max spend per supplier offer
  - Check interval, with a faster interval as an upgrade
  - Pause switch
- Every decision shows a short notification ("Manager accepted SuperDeal – est. profit €52"). A
  log in the manager menu lists the last 20 decisions.
- The player can still accept orders manually at any time. If the v3 "office clerk" exists,
  turn it into the manager instead of adding a second role.

### 2.7 Things only the boss can do
Once workers run the basic loop, the player needs their own jobs. These unlock once the player has
3 or more workers.

- **Rush / VIP orders:** a special client with a short timer and a big bonus payout (2–3× normal
  profit). Workers never touch these; only the player can load them. Some need the forklift.
- **Blockers workers can't solve:** fallen pallet (already exists), jammed conveyor, pallet stuck
  in a rack, truck parked wrong at a dock. Workers show ❗ and wait. The player walks there and
  holds on the spot for a few seconds to fix it.
- **Damaged pallet:** a pallet arrives damaged. Bring it to a new repair/scrap floor pad: repair
  for a small cost and sell it normally, or scrap it for a little money.
- **Surprise inspection:** an inspector walks in; the player checks 3 highlighted rack spots
  within a time limit. Pass for a reputation bonus.
- **Special delivery truck:** an oversized delivery with a bonus; only the player can unload it.
- **Boss nearby:** workers within a small radius of the player work 15% faster (soft glow ring on
  the floor). Standing around in one spot is never the best play.
- Active boss jobs and blockers appear on the minimap and as a small list in the HUD. Tap an
  entry to show an arrow to it.
- Tie them into quests ("Complete 5 rush orders", "Pass an inspection").
- Frequency must feel lively but never spammy: at most 2 boss jobs active at once, and a
  cooldown in config.

---

## PART 3 – Performance and balance

### 3.1 Performance pass
- Target: under 100 draw calls in the default view with all three wings built and several
  trucks active.
- Merge static geometry per wing, use instancing for racks, pallets, lamps and props, and share
  materials and texture atlases.
- On-screen stats overlay (fps, draw calls, triangles) that can be switched on from settings in
  normal builds, so it can be read on real phones.
- Make sure Low / Medium / High really change shadows, pixel ratio and prop density. Report draw
  calls per setting in `docs/progress.md`.

### 3.2 Pacing
Update the pacing simulation in `docs/economy.md` with v4 systems, and include loyalty bonuses and
average random events this time. Tune config until a new player roughly hits:

| Milestone | Target play time |
|-----------|------------------|
| First sale | ~1 min after tutorial |
| First worker | in the tutorial |
| Electric pompwagen | 15–20 min |
| Second dock | 20–30 min |
| Pallets per trip level 2 | 25–35 min |
| Boss jobs unlock (3 workers) | 30–40 min |
| Forklift | 35–45 min |
| Manager | 45–60 min |
| Forklift driver | 50–70 min |
| Bulk Wing | 60–75 min |
| Double stack | 70–90 min |
| Dock Wing | ~2 h |
| Staff Wing | ~3–3.5 h |

- Existing v3 unlocks (conveyors at company level 4 + 60 pallets shipped, starting money, hiring
  cost curve) keep working. Adjust only if they clash with this table, and write down why.

---

## 4. Save migration
- Bump the save version. v3 saves load without losing money, stock, workers, upgrades or quests.
- Old "second dock door" upgrade → free second dock.
- Conveyors already placed in old saves stay, but get moved off main aisles if they block the new
  nav grid. Refund any that can't be placed.
- Old saves skip the intro. Reset progress starts a v4 new game.

---

## Done when
- The joystick never sticks, and the player and workers don't get stuck.
- The warehouse feels open, and the building can grow into a non-square shape with three wings.
- Several trucks run at once over all docks, driving in through the city.
- A new game starts on an empty plot with Henk, and reset progress works.
- Worker upgrades, forklift drivers, double stack and the manager all work.
- The player always has something useful to do once workers take over.
- v3 leftovers are done, and the build is under 100 draw calls in the default view.
- `docs/game-design.md` and `docs/economy.md` are updated.
- Final report in `docs/progress.md`: what changed, assumptions, draw calls per quality setting,
  pacing table from the simulation, and anything that couldn't be done.
