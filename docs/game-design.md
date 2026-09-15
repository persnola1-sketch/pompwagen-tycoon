# Warehouse Tycoon – Game Design v2

> Put this file in the project as `docs/game-design.md`. Every prompt to the AI should point to it.

## 1. The pitch

You run a warehouse that works as a **middleman**. Supplier trucks bring pallets of products. You unload and store them. Stores send their trucks to buy stock. You load their trucks and earn the difference between what you paid and what they pay. Leftover stock stays in your racks for the next customer. Grow from one pompwagen and a few racks to a big distribution center.

## 2. Core loop (example with water bottles)

1. **Supplier offer pops up:** "AquaPure wants to deliver 10 pallets of water bottles for €8 per pallet. Free rack space: 14." → Accept / Decline.
2. Accepting costs money (€80). The supplier truck drives in and backs up to an **inbound dock door**.
3. Player drives the pompwagen to the truck and unloads pallets one by one onto the **Unload pad**, then stores them in rack slots. Racks visibly fill up.
4. **Customer order pops up:** "FreshMart needs 6 pallets of water bottles, pays €14 per pallet. In stock: 10 ✔" → Accept / Decline.
5. The customer truck arrives at an **outbound dock door** on the other side of the warehouse.
6. Player takes pallets from the racks and loads the customer truck. Truck leaves → money + profit popup ("+€84, profit €36").
7. The remaining 4 pallets stay in stock for the next order.
8. Spend profit on **upgrade pads**: more racks, second dock door, faster pompwagen, electric pompwagen, workers.

**What makes it a game:** decisions. Do I buy more stock now or wait? Do I have space? Can I fill this order in time? Is this customer worth it?

## 3. Scaling the grind

The manual pompwagen carries 1 pallet, so unloading 50 pallets is 50 trips. Early orders stay small and grow with your equipment:

| Stage | Equipment | Typical supplier delivery | Typical customer order |
|---|---|---|---|
| Start | Pompwagen | 4–8 pallets | 2–5 pallets |
| Upgrade 1 | Electric pompwagen | 8–15 | 5–10 |
| Upgrade 2 | Forklift (upper rack levels) | 15–30 | 10–20 |
| Later | Workers + reach truck | 30–60 | 20–40 |

## 4. Order system (popups)

**Supplier offer card**
- Supplier name + logo (fictional companies only)
- Product and pallet count
- Price per pallet and total cost
- Your free rack space for that product (red if not enough)
- Accept / Decline, offer expires after a timer

**Customer order card**
- Store name (fictional)
- Product and pallet count requested
- Price per pallet, total, and profit estimate
- **Stock check:** "In stock: 30 / needed: 20 ✔" or "In stock: 12 / needed: 20 ✖"
- Accept / Decline, deadline timer after accepting
- Reputation bonus for fast delivery, penalty for missing a deadline

**Order board:** small list on screen with active deliveries and orders (product, pallets done / total, time left).

## 5. Products

- **MVP:** 1 product, water bottles (blue shrink-wrapped pallets)
- **Soon after:** 2–3 products with different looks and margins (e.g. soft drinks, chips, toilet paper)
- Different products need their own rack slots, which makes space a real decision

Use fictional supplier and store names, not real brands.

## 6. Storage

- Real pallet racking: orange beams, blue/grey uprights, visible slots
- Each rack section has slots on the floor level (upper levels unlock with the forklift)
- Pallets are placed into specific slots and stay visible
- Label on each rack: product name and "12 / 20"
- **Storage expansion** = unlock new rack rows via upgrade pads

## 7. Floor pads (replaces the rings)

Call them **floor pads** (in the genre they're often called action or unlock pads). They're built into the floor like inset steel plates:
- Slightly raised metal plate with yellow-black hazard striped border
- Icon and text painted on the plate, readable from the camera
- Subtle glow or light strip when active, not a floating ring

**Pad types**
| Pad | Text on pad | What it does |
|---|---|---|
| Unload pad | "UNLOAD" + truck icon | Standing here takes a pallet off the docked supplier truck |
| Load pad | "LOAD" + truck icon | Standing here puts a carried pallet into the customer truck |
| Rack pad | Product name + "12 / 20" | Standing here stores or takes a pallet |
| Unlock pad | "NEW RACK ROW – €500" | Stand on it and money flows in until paid, then the rack builds with an animation |
| Upgrade pad | "ELECTRIC POMPWAGEN – €1,500" | Same pay-by-standing, unlocks the upgrade |
| Office pad | "OFFICE" | Opens the order board and upgrade menu |

Pay-by-standing: coins fly from the player into the pad, a fill bar shows progress, stepping off pauses it.

## 8. Pompwagen movement

- Character walks forward holding the handle behind them
- Rigid handle with fixed length, pivots at the steering wheels
- Trailer physics: the body rotates around the fork rollers and swings wide in turns, never stretches, detaches, or spins on the spot
- Steering wheels turn toward the handle, all wheels spin
- Limited turn speed, short acceleration and braking
- Heavier (slower acceleration, wider turns) when loaded
- Pompwagen body collides with walls, racks, and trucks
- Fallback if it's frustrating on phones: push mode with forks in front

## 9. Visual direction: "realistic-leaning"

Photorealistic graphics aren't realistic for phones in a browser, or for a two-person team. The target is a **clean, realistic-leaning look** like a polished mobile tycoon game:
- Real proportions (standard pallet 120×80 cm, rack beams, dock doors, truck size)
- Materials with texture: concrete floor with painted lane markings, corrugated metal walls, shrink-wrap on pallets, rubber dock seals
- Warm interior lighting with ceiling lamps, daylight through dock doors, soft shadows
- Ambient details: safety signs, fire extinguishers, yellow bollards, floor arrows

**Environment**
- Warehouse interior with inbound docks on one side, outbound docks on the other
- Outside: truck yard with parking lines, road, fence and gate, a few low-detail buildings and trees in the background
- Trucks drive in, reverse to the dock, and drive away
- Full city comes much later; the yard is enough for now

**Asset approach**
- Use real 3D models (glTF/GLB) instead of code-generated boxes for trucks, racks, pallets, and the character
- Sources: free and paid asset packs (check licenses), or AI 3D model generators for custom pieces
- Keep phone performance: compressed models and textures, baked lighting where possible, one shadow light

## 10. Tutorial v2

1. "Drag to move your pompwagen"
2. Supplier offer pops up (free first delivery): "Accept your first delivery!"
3. "The truck is at the dock. Stand on the UNLOAD pad"
4. "Store the pallet in the rack" (repeat for 3 small pallets, arrows guide)
5. Customer order pops up: "FreshMart needs 2 pallets. You have 3 ✔. Accept!"
6. "Load their truck at the outbound dock"
7. Truck leaves, "+€28 profit!"
8. "1 pallet is still in stock for the next customer. Now expand: stand on the NEW RACK ROW pad"
9. "You're the boss now. Keep the trucks moving!"

## 11. Build order

Rebuild as a proper multi-file project (Vite + TypeScript + Three.js, as in the MVP plan). The one-shot `index.html` stays as a reference.

| Step | What | Done when |
|---|---|---|
| 1 | Project setup, warehouse + yard layout with placeholder shapes, pompwagen movement (section 8) | Driving feels good on iPhone and Samsung |
| 2 | Racks with real slots, pallets, floor pads with text | Can store and take pallets from slots |
| 3 | Supplier offers, trucks arrive and dock, unloading | A full delivery can be unloaded |
| 4 | Customer orders with stock check, customer trucks, loading, profit | Full buy → store → sell loop works |
| 5 | Money, pay-by-standing unlock pads, rack expansion, pompwagen upgrades | Profit can be turned into growth |
| 6 | Save/load, tutorial v2 | New player learns the loop without help |
| 7 | Visual upgrade: real 3D models, textures, lighting, yard details | Screenshot looks like a real game |
| 8 | Sounds, polish, playtest on both phones | Arturs and friends keep playing |

## 12. Open decisions (defaults chosen, change anytime)

- **Customer vehicles:** trucks and vans (default) vs buses
- **Buying stock:** you pay suppliers upfront (default) vs pay after selling
- **Missed deadlines:** reputation drop (default) vs money fine
- **Offers:** random arrivals (default) vs choosing from an order board
- **Camera:** angled top-down follow (default), first-person later
