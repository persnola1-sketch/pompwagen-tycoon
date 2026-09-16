# Pompwagen Tycoon – Game Design v3

> The living design doc. `docs/economy.md` holds the numbers, `docs/mvp-plan.md`
> the original plan, `docs/update-v3.md` the brief this version was built from,
> and `docs/v3-progress.md` what shipped in each phase.

## 1. The pitch

You run a warehouse that works as a **middleman**. Supplier trucks bring pallets
of products. You unload and store them. Shops send their trucks to buy stock.
You load their trucks and earn the difference. Leftover stock waits in your racks
for the next customer.

You start on an **empty plot in a Dutch city** with €20,000 and a retired
warehouse legend called Henk. You buy the warehouse, build the loop by hand,
then hire a team, automate with conveyors and a forklift, and grow into a
distribution centre while the city drives past outside.

## 2. Core loop

1. **Supplier offer**: "Vitalis Water — 6 pallets of water at €33. Free rack space: 14." Accept or decline.
2. The supplier truck drives through the city, in through the gate barrier, and reverses onto the **inbound dock**.
3. Pallets come off the truck at the **UNLOAD pad** and go into rack slots — by you, by your unloaders, or onto the inbound conveyor.
4. **Customer order**: "FreshMart needs 6 pallets of water, pays €74. In stock: 10 ✔"
5. Their truck docks on the outbound side; pallets go from the racks to the **LOAD pad** (or onto the outbound belt, which loads the truck itself).
6. Truck leaves → money, profit popup, company XP, client loyalty.
7. Profit buys upgrades: rack rows, workers, an electric pompwagen, conveyors, a forklift, upper rack levels.

**What makes it a game:** decisions. Buy stock now or save for a worker? Is
there space? Can I fill this order before the deadline? Is this client worth it?

## 3. Progression

| Stage | What you have | Typical delivery | Typical order |
|---|---|---|---|
| Plot | nothing but €20,000 | – | – |
| Start | pompwagen, 2 rack rows | 3–6 pallets | 2–4 |
| Team | 2–4 workers | 3–6 | 2–4 |
| Electric | electric pompwagen (2 pallets) | 6–12 | 4–8 |
| Automated | conveyors, forklift, 3 rack levels | 12–24 | 8–16 |

Everything meaningful is gated by **company level** as well as money, so the
€20,000 start cannot skip the game (`docs/economy.md`).

## 4. Henk and the tutorial

Henk is a friendly blue hologram with an orange vest, a mustache and a
clipboard. He floats near the player, turns to face them and points a beam at
the current target. His speech bubbles type themselves out with voice blips and
a skip button.

1. Welcome to the plot
2. Stand on **BUY WAREHOUSE – €15,000** → the 10-second construction sequence
3. Accept the first supplier delivery
4. Unload it on the UNLOAD pad
5. Store the pallets in the racks
6. Accept the first customer order
7. Load their truck → first profit
8. Hire the first worker (€100) → the tutorial ends

Afterwards Henk pops up once per new feature (first worker, first construction,
first forklift, first conveyor, first event) with a one-line tip. Tips can be
switched off in Settings.

## 5. Orders and clients

- Supplier and customer offers arrive as **cards**: brand logo, contact
  portrait, product lines with pallet counts and prices, stock checks with ✔/✖,
  the profit estimate and a countdown ring.
- **8 fictional clients and 6 suppliers** (`src/config/brands.json`) with
  code-generated SVG logos, brand colours, and contact people. Their livery is
  on the trucks, their sign is on their shop in the city.
- **Loyalty**: every on-time order raises a client's loyalty, a missed deadline
  lowers it. Bronze → Silver (+4% price) → Gold (+8%). Their card shows the
  history that earned it.
- Missing a deadline also costs reputation, which feeds the price bonus.

## 6. Products and storage

- Six products in `src/config/products.json`, each with its own pallet look,
  price band and demand. They unlock by pallets shipped, or instantly with a
  licence bought in the shop.
- Racks are real pallet racking: blue uprights, orange beams, visible slots,
  a product tag per slot and a row label with the fill count.
- **Three levels per rack row.** The floor level is for pompwagens; levels 2 and
  3 are unlocked per row and only reachable by forklift.

## 7. Floor pads

Inset steel plates with hazard borders, big painted text and a floating label
with an icon and the price that always faces the camera.

| Pad | What it does |
|---|---|
| BUY WAREHOUSE | pay-by-standing, starts the construction sequence |
| UNLOAD / LOAD | takes a pallet off the supplier truck / puts one in the customer truck |
| Rack strips | store or take pallets (the forklift also reaches the upper levels) |
| NEW RACK ROW | pay-by-standing, then a construction site builds the row |
| FASTER WHEELS | instant speed upgrade, three levels |
| ELECTRIC / FORKLIFT | orders the vehicle; a delivery truck brings it |
| RACK LEVEL | unlocks the next level of a rack row |
| INBOUND / OUTBOUND BELT | builds a conveyor |
| PARKING | swap between pompwagen and forklift |
| OFFICE | opens the order board |

Pay-by-standing: coins fly from the player into the pad, a ring fills around it,
stepping off pauses it.

## 8. Workers

Workers are the first real upgrade, hired during the tutorial.

- **Costs**: €100, €250, €800, then ×1.8. Wages are 8% of the hire cost (min €12) per 5-minute shift.
- **Roles**: unloader, loader, office clerk (auto-accepts by your rules), forklift driver (needs certification), team leader (speeds up nearby workers).
- **Candidate cards**: name (Dutch and Latvian), portrait, role, trait, star rating, cost. Three at a time, free refresh every 3 minutes or €50.
- **Traits**: fast but clumsy, coffee lover, night owl, ex-forklift driver, rookie, steady hands, sprinter, chatty, veteran.
- **Levels**: XP per pallet moved; higher levels are faster and from level 5 drive electric pompwagens.
- **Status bubbles**: 📦 carrying, ☕ break, ❗ waiting, 💤 idle, 🎓 training.
- **Pathfinding**: A* around racks, props, conveyors and each other.
- **The player** is a supervisor: nearby workers go faster, and only the boss can pick up a pallet a clumsy worker dropped.
- **Shifts**: day or night. Night workers keep earning offline (8 h cap) and the Shift Report shows what they did.
- **Roster cap**: one worker per company level.

## 9. Automation

- **Conveyors**: the inbound belt runs from the dock to the racks and pushes pallets straight into a free slot; the outbound belt runs from the racks to the shipping dock and loads the waiting truck. Pallets queue at the end when the destination is full. Belt speed is upgradable.
- **Forklift**: rear-wheel steering, a two-stage mast that lifts pallets into the upper rack levels, and a warning light. Swap vehicles at the parking pad.
- **Timers**: rack rows, conveyors and amenities are built by a construction site with builders, tape and sparks; vehicles arrive on a delivery truck and roll down a ramp. Both can be finished early with a fee or a rewarded ad.

## 10. Quests, levels and events

- **Story quests** guide progression one at a time; **3 daily quests** reset every day; **achievements** are long-term badges; **client quests** are timed VIP requests.
- **Company level** rises with 6 XP per shipped pallet plus quest rewards, and gates shop items, pads and the roster size.
- **Random events** every few minutes: rush hour (more orders, better prices), surprise inspection (clean up the dropped pallets), VIP client (big timed order at double pay), late supplier (discounted delivery).

## 11. The city

The plot sits in a Dutch city block: ring roads with red bike lanes, sidewalks,
zebra crossings and a roundabout; terraced houses with stepped gables, offices, a
supermarket, a petrol station, parks and neighbouring halls; client shops with
their own brand signs. Cars, vans and cyclists drive the lanes and stop for each
other, the lights and the warehouse trucks; pedestrians walk the sidewalks. The
yard has a fence, sliding gates, barriers that lift for arriving trucks, staff
cars and a company flag.

## 12. UI

Bottom navigation: **Shop · Workers · Quests · Orders · Map**, one panel at a
time, each with a notification badge. The HUD shows money with a rolling
counter, company level with an XP bar, reputation stars, stock, the tracked
quest and running build timers. Dark navy panels, warehouse orange and safety
yellow accents, 44 px touch targets, Baloo 2 and Nunito, iPhone safe areas,
portrait and landscape.

## 13. Monetisation hooks

`AdService` is a stub that plays a short fake "sponsored break" and resolves
true. It backs: finish a construction, delivery or training; a free temp worker;
a free rush boost; double a quest reward; double the night shift. Always
optional, never forced.

## 14. Visual direction

Clean, realistic-leaning mobile-tycoon look: real proportions (EUR pallets,
rack beams, dock doors, truck sizes), textured concrete and corrugated metal,
warm interior light, one shadow-casting sun. Everything static is merged per
material or instanced; the performance budget is 60 fps on a mid-range phone,
pixel ratio capped at 2, textures ≤ 1024².
