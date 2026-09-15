# Pompwagen Tycoon – Update v3 ("The Big One")

> Put this file in the project as `docs/update-v3.md`. The kickoff prompt tells the agent to build everything in it.

## 0. How to work

- Read `CLAUDE.md`, `docs/game-design.md`, `docs/economy.md`, and the current code first.
- Build ALL phases below in one continuous run. Don't stop between phases, don't ask questions, make reasonable choices.
- After each phase: run the build, fix all errors, check the phase goal, then **git commit** with a message like `v3 phase 4: workers`. This creates safe checkpoints.
- Keep all gameplay numbers in `src/config/*.json`. Update `docs/game-design.md` and `docs/economy.md` as you go.
- Keep the code modular. New systems get their own files/folders (e.g. `src/systems/quests/`, `src/systems/workers/`, `src/world/city/`).
- Everything must run smoothly on iPhone Safari and Android Chrome (Samsung).
- If you run out of context, write progress to `docs/v3-progress.md` so the next session can continue exactly where you stopped.

---

## Phase 1 – Playtest fixes (from screenshot review)

- **Unreadable floor pads:** pad text is too small at the default camera distance. Make pad labels large and readable on a phone at default zoom: bigger painted text, plus a floating label with icon + cost that always faces the camera.
- **Walls block the view:** make the camera-facing walls and roof beams fade to transparent (cutaway) when they block the player or interior.
- **Order board covers the world:** make it a collapsible panel. On mobile it collapses to a small badge by default.
- **Huge empty asphalt:** replaced by the city in Phase 9. Shrink the lot to a realistic yard size.
- **Camera:** keep zoom and overview, but default zoom slightly closer than now so the warehouse fills more of the screen.

---

## Phase 2 – New game start: empty plot + building the warehouse

- A new game starts on an **empty plot** in the city: fenced sand/gravel lot with a "FOR SALE" sign, a small site container, and the player standing there.
- Player starts with **€20,000**.
- **Guide character** (Phase 3) welcomes the player and explains the goal.
- A large floor pad: **"BUY WAREHOUSE – €15,000"**. Pay-by-standing like other unlock pads.
- After paying: **construction sequence (10 seconds)**
  - Construction fence and barrier tape appear
  - Foundation slab pours, steel frame rises piece by piece, wall panels slide in, roof closes, dock doors install
  - A crane and builder NPCs animate, dust particles, construction sounds, progress bar with countdown
  - Finish: small camera shake, confetti, "Warehouse opened!" banner, opening sound
- Player keeps ~€5,000 to buy first stock and first worker.
- **Existing saves:** players who already have a warehouse skip this intro. Migrate old saves.

---

## Phase 3 – Guide character + tutorial

- **Henk**, a retired warehouse legend who appears as a friendly floating hologram (glowing blue-ish, gentle bobbing, orange vest, mustache, clipboard).
- Floats near the player, turns toward them, points at targets with an arrow/beam.
- Speech bubbles with typewriter text, tap to continue, small voice "blip" sounds, short sentences.
- Skip button for the whole tutorial.

**Tutorial flow**
1. Henk welcomes: "Welcome to your plot! Let's build a warehouse."
2. Walk to the BUY WAREHOUSE pad → construction plays.
3. "Let's get some stock. Open the Orders menu and accept your first delivery."
4. Supplier truck drives through the city to the dock. Henk: "Unload it on the UNLOAD pad."
5. Store pallets in racks.
6. First customer order with stock check → load their truck → profit.
7. "Running around alone gets tiring. Let's hire your first worker!" → open Workers → pick a candidate (€100).
8. Watch the worker start working. Henk: "Now check your Quests for goals. See you around, boss!"

**After the tutorial:** Henk pops up briefly when new features unlock (first forklift, first conveyor, first construction), with a 1–2 line tip. Can be turned off in settings.

---

## Phase 4 – Workers (early upgrade)

Workers are one of the **first upgrades**, unlocked in the tutorial.

**Hiring costs (one-time fee):** 1st €100 → 2nd €250 → 3rd €800 → then ×1.8 each (define in config). Plus a small wage per shift. Wages must never make the early game frustrating.

**Roles (unlock in this order)**
1. **Unloader:** supplier truck → racks (or onto a conveyor once built)
2. **Loader:** racks → customer trucks
3. **Office clerk:** auto-accepts offers using player rules (e.g. "buy water if stock < 10", "only accept orders if in stock", max spend per offer)
4. **Forklift driver:** needs a forklift + certification (training timer)
5. **Team leader:** nearby workers work faster (late game)

Workers use pathfinding around racks, trucks, conveyors, and each other. Never walk through objects.

**Candidate cards**
- The Office / Workers menu shows 3 candidates. Free refresh every few minutes, or pay a small fee.
- Card: name (mix of Dutch and Latvian names), portrait, role, hire cost, wage, trait, star rating.
- Traits: Fast but clumsy (sometimes drops a pallet), Coffee lover (longer breaks, better mood), Night owl (+25% night shift speed), Ex-forklift driver (half training time), Rookie (slow, cheap, levels fast), plus 3–5 more fun traits.
- Workers look different: vest colors, hair, skin tones, height, helmet or cap.

**Levels:** XP per pallet moved. Level ups give speed boosts, later electric pompwagens. Level-up popup with confetti. Worker list shows level, XP bar, trait, shift, stats.

**Status bubbles:** 📦 carrying, ☕ break, ❗ waiting for stock/truck, 💤 idle, 🎓 training. Tap a worker to see their card.

**Player role:** supervisor boost (nearby workers faster), player can still move pallets, problems only the player can fix (fallen pallet, blocked lane) where workers wait with ❗.

**Shifts + night shift:** assign day or night shift. Night workers earn offline (cap 8 hours) based on a simulation of real work rate, stock, and orders. On return: **Shift Report** screen (pallets moved, money earned, wages paid, level ups).

**Breaks:** coffee breaks; unlock coffee machine, then canteen, to shorten breaks.

**Temp workers:** pay a fee for an extra worker for 5 minutes during rushes.

---

## Phase 5 – Construction & delivery timers

Building and buying things takes real in-game time. The player can keep playing while waiting.

**Construction (racks, rack rows, conveyors, coffee machine, canteen, second dock)**
- Paying creates a **construction site**: barrier tape, cones, builder NPCs, sparks/welding effects, pieces assembling
- Floating progress bar with countdown above the site
- Timers scale up: first rack ~10 s, later expansions 30 s, 1 min, 3 min, etc. (config)
- Finish effect: dust puff, sparkle, sound, short Henk tip if new

**Deliveries (forklift, electric pompwagens for workers, reach truck later)**
- Buying creates a **delivery order**: a special truck drives through the city, docks, and a ramp animation rolls the vehicle out
- Delivery timer shown in the HUD (e.g. forklift ~60–90 s)

**Speed-ups:** "📺 Finish now" button using the AdService stub (Phase 12). Optionally a small money fee.

---

## Phase 6 – Forklift + high racks

- **Forklift** bought in the Shop → delivered (Phase 5).
- The player can switch vehicles at a **vehicle parking pad** (pompwagen / electric pompwagen / forklift).
- Forklift driving: sits in the seat, rear-wheel steering (turns from the back, realistic), faster than pompwagens.
- **Mast animation:** forks lift and lower smoothly, mast extends, pallet rises into upper slots.
- **Upper rack levels:** existing racks get level 2 and 3 slots, only reachable by forklift. Unlock upper levels per rack row.
- Forklift carries 1 pallet but is fast and unlocks vertical storage.
- Forklift driver workers need certification (training timer shown with 🎓).
- Reach truck: show as "Coming soon" in the shop.

---

## Phase 7 – Conveyor belts

- Unlockable in the Shop after a quest milestone.
- **Inbound conveyor:** unloaders drop pallets at the dock end, pallets ride the belt to a storage drop point near the racks.
- **Outbound conveyor:** from a pick point near the racks to the outbound dock.
- Visuals: moving belt texture, spinning rollers, pallets gliding smoothly, small queue if the end is full, motor hum sound.
- Upgrades: belt speed levels.
- Workers and the player use conveyor end points automatically when efficient.
- Build it through construction (Phase 5).

---

## Phase 8 – Quest system

Quests fix the "running around nonstop is boring" problem by always giving the player a goal and a reward.

**Quest types**
- **Story quests (Henk):** guide progression. Examples: "Hire your first worker", "Sell 20 pallets", "Unlock soft drinks", "Buy the forklift", "Build your first conveyor", "Serve 3 different clients in one shift".
- **Daily quests:** 3 per day, reset daily. Examples: "Unload 30 pallets", "Complete 5 orders on time", "Earn €2,000 profit", "Level a worker up".
- **Client quests:** special requests from clients. Example: "FreshMart needs 15 chips in 5 minutes for a party – double pay!"
- **Achievements:** long-term milestones with badges. Examples: "1,000 pallets moved", "10 workers", "5-star reputation".

**Rewards:** money, company XP, reputation, cosmetic items, unlock tokens for shop items.

**Company level:** company XP from quests and orders raises the company level. Shop items and features unlock by company level, so starting money can't skip progression.

**UI:** Quest panel with tabs (Story / Daily / Achievements), progress bars, claim button with coin-burst animation, notification dot when a reward is ready, small tracked-quest widget on the HUD.

**Random events** (every few minutes, config): Rush hour (more orders, higher pay), Surprise inspection (clean up fallen pallets for a bonus), VIP client (big order, great reward), Late supplier (delivery delayed, offer a discount).

---

## Phase 9 – City environment

Replace the empty asphalt with a living city around the warehouse plot.

- **Road network:** streets around the plot, intersections, crosswalks, sidewalks, bike lanes (Dutch style, red asphalt), roundabout.
- **Buildings:** low-poly shops, row houses with Dutch-style gables, offices, a supermarket, other warehouses, a gas station, parks with trees. Make the client stores exist as buildings in the city.
- **Traffic:** cars, vans, and bikes driving along lanes with waypoints, stopping at intersections (simple traffic lights or right-of-way), never driving through each other. Pedestrians walking on sidewalks.
- **Trucks** drive through the city streets to reach the warehouse gate, then into the yard and to the docks.
- **Yard:** realistic size, gate with barrier that opens, truck parking, fence.
- **Performance:** instanced meshes, a limited number of moving vehicles (e.g. 15–25 active, config), hide/simplify distant objects, fog at the city edge.
- **Optional:** day/night lighting cycle, streetlights on at night (config toggle, off by default on low-end devices).

---

## Phase 10 – Clients & brands

- **Fictional brands only** (no real companies). Create 6–8 clients and 4–6 suppliers, for example:
  - Clients: FreshMart, QuickShop, BuurtSuper, Polderhal, CityCorner, BikeBite Café
  - Suppliers: Vitalis Water, CrunchCo, NordPaper, SodaWave, CanDo Foods, SparkClean
- **Logos generated in code** as SVG (simple shapes, initials, colors). Consistent brand colors.
- Logos and colors appear on: trucks (trailer livery), order popups, order board, client profile cards, quest cards, and the matching city store building.
- **Client profiles:** logo, contact person portrait + name, favorite products, loyalty level (bronze → silver → gold) with price bonus, order history.
- **Loyalty:** on-time orders raise loyalty; missed deadlines lower it.

---

## Phase 11 – Shop menu

Bottom navigation on mobile: **Shop · Workers · Quests · Orders · Map**. Same menu available on desktop.

**Shop tabs**
- **Equipment:** electric pompwagen, forklift, reach truck (coming soon), vehicle upgrades
- **Warehouse:** rack rows, upper rack levels, conveyors, second dock, coffee machine, canteen, lighting upgrade
- **Products:** unlock new product types
- **Boosts:** temp workers, rush speed boost, "📺" ad-based boosts
- **Cosmetics:** company name + logo builder, truck livery color, vest colors, pompwagen/forklift skins, warehouse wall color

Each shop card: icon/3D preview, name, short description, price, required company level (locked state with 🔒), build or delivery time.

---

## Phase 12 – Monetization hooks (no real ads yet)

- `AdService` stub simulating a rewarded ad (short fake countdown screen), returns success, easy to replace with real ads later.
- Buttons: 📺 Double shift report, 📺 Finish construction/delivery/training, 📺 Free temp worker, 📺 Double quest reward.
- Always optional. Never forced ads.

---

## Phase 13 – Animations & effects

- **Pallets:** squash-and-stretch when picked up/dropped, shrink-wrap shine
- **Trucks:** indicators blink, reverse beeping, trailer doors open, dock doors roll up and down
- **Characters:** walk and run cycles, carrying pose, idle animations (stretch, check phone), celebration on level up
- **Money:** coins fly to the money counter, counter rolls up, profit popups
- **Pads:** fill ring while paying, glow pulse, unlock burst
- **Construction:** dust, sparks, pieces sliding into place
- **Forklift:** mast lift, fork tilt, warning light
- **Conveyors:** moving belts, spinning rollers
- **World:** floating dust in warehouse light beams, birds, flag waving at the gate
- **UI:** smooth panel slide-ins, button press bounce, notification badges, confetti on quest claims
- **Sounds** for all of the above, plus light background music with a toggle

---

## Phase 14 – Menu & UI design overhaul

- A consistent **design system**: color tokens, rounded cards, soft shadows, one display font + one UI font (Google Fonts with fallbacks), icon set.
- **Style:** clean and friendly mobile-game look. Dark navy panels with bright accent colors (warehouse orange + safety yellow), big touch targets (min 44 px), readable on phones.
- Order popups redesigned as **cards**: client logo, contact portrait, product icons with pallet count, stock check with ✔/✖, price and profit, countdown ring, big Accept/Decline buttons.
- Worker candidate cards, shop cards, quest cards, and shift report all use the same card style.
- HUD: money with coin icon, company level badge with XP bar, reputation stars, tracked quest widget, notification dots.
- Respect iPhone safe areas. Works in portrait and landscape.

---

## Phase 15 – Balance, save, performance, final check

**Economy pacing targets (new player)**
| Moment | Target time |
|---|---|
| Warehouse built | < 1 min |
| First profit | ~2 min |
| First worker hired (€100) | during tutorial, ~3 min |
| Second worker (€250) | ~6–8 min |
| Third worker (€800) | ~15 min |
| Electric pompwagen | ~15–20 min |
| First conveyor | ~30–40 min |
| Forklift delivered | ~45–60 min |

Document the math in `docs/economy.md`. Starting €20,000 must not let players skip progression (company level locks).

**Save:** save/load everything (plot state, construction/delivery timers, workers, quests, clients, cosmetics, offline time). Migrate old saves.

**Performance:** 60 fps target on iPhone and mid-range Samsung with the city, 10+ workers, and conveyors. Add a graphics quality setting (Low / Medium / High) that auto-selects based on fps.

**Dev panel (`?dev`):** +€10,000, +company level, finish all timers, skip tutorial, spawn event, reset save.

## Done when

- A new game starts on an empty plot with Henk, the warehouse gets built, and the tutorial teaches the full loop plus hiring a worker.
- Workers, forklift, conveyors, construction/delivery timers, quests, events, clients with logos, shop, and the city with traffic all work together.
- Menus look polished and consistent, with client logos everywhere.
- The game runs smoothly and without errors on iPhone and Samsung.
- All phases are committed. Final message: list what was built, what's left in `docs/v3-progress.md` (if anything), and assumptions made.
