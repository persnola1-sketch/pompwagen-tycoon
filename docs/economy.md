# Economy & pacing

All numbers live in `src/config/economy.json`, `src/config/products.json`,
`src/config/vehicles.json` and `src/config/layout.json`. This document explains
how they were chosen and how to check them again after tuning.

## Pacing targets (new player, times counted from the end of the tutorial)

Simulated with 500 runs of `scripts/economy-sim.mjs`:

| Goal | Target | Median | p25–p75 |
|---|---|---|---|
| First profit (a customer truck pays) | < 1 min | **0:33** | 0:33–0:33 |
| First upgrade (Faster Wheels €150) | 2–3 min | **2:42** | 2:28–3:49 |
| First storage expansion (rack row C €300) | 5–7 min | **6:17** | 5:18–7:20 |
| Electric pompwagen (€1,100) | 15–20 min | **17:20** | 16:23–18:25 |

The tutorial itself takes about 1.5 minutes (walking estimate below), so from
a fresh start everything lands roughly 1:30 later.

Re-check any change with:

```bash
npm run sim              # 400 runs, 30 simulated minutes
RUNS=1000 npm run sim    # tighter percentiles
```

The script exits non-zero when a median misses its target.

## Where the old economy went wrong

Before: water bought for €7–9 and sold for €13–16, so ~€6 profit per pallet.
With ~40 s of work per pallet that is ~€9/min. The €200 speed upgrade took
~20 minutes and the €1,500 electric pompwagen ~2.5 hours.

## Walking distances (from `layout.json`)

The warehouse is 36 × 26 m. Inbound docks are on the west wall, outbound on the east.

| Leg | Straight line | With 1.25 detour factor |
|---|---|---|
| UNLOAD pad (-15.4, -5) → row A strip | 5.5 m | 6.9 m |
| Row A strip → LOAD pad (15.4, -5) | 16.9 m | 21.1 m |

Pompwagen speed is 3.2 m/s empty and 2.6 m/s loaded (×0.82). Each trip also
loses 1.5 s lining up with a pad, plus the 0.45 s pick/drop cooldown.

- Unload → store round trip: **8.2 s per pallet**
- Pick → load round trip: **18.1 s per pallet**
- Total walking per pallet sold: **~26 s**

Truck timings come from the layout too. Arrival takes **12.9 s**: 62 m at
11 m/s, then a 2.4 s swing, then reversing 15.6 m at 3.2 m/s. Departure takes
**8.2 s**. The only overhead on top of walking is waiting for trucks and offers,
so effective throughput is about **2 pallets sold per minute** with the manual
pompwagen.

## Margins (`products.json`)

Sell prices get a +3% bonus per reputation star. New players start at 3 stars (+9%).

| Product | Unlocks after | Buy (avg) | Sell (avg, 3★) | Profit / pallet | Unlock time (median) |
|---|---|---|---|---|---|
| Water Bottles | start | €33 | €74 | ~€41 | – |
| Soft Drinks | start | €46 | €97 | ~€51 | – |
| Chips | 8 shipped | €29 | €72 | ~€43 | 3:25 |
| Toilet Paper | 20 shipped | €25 | €65 | ~€40 | 9:27 |
| Canned Food | 40 shipped | €69 | €134 | ~€65 | 18:39 |
| Cleaning Products | 65 shipped | €58 | €120 | ~€62 | 24:31 |

At ~2 pallets/min × ~€43 that is **~€85/min early on**, rising past €100/min
once Faster Wheels and the higher-margin products arrive. This is about 10× the
old rate.

| Minute after tutorial | 1 | 3 | 5 | 10 | 15 | 20 | 30 |
|---|---|---|---|---|---|---|---|
| Median total profit | €41 | €233 | €409 | €893 | €1,379 | €2,072 | €4,401 |
| Median pallets shipped | 3 | 7 | 11 | 21 | 31 | 45 | 89 |

Higher-margin products cost more up front, so restocking them is a working-capital decision.

## Money timeline

1. **End of tutorial.** You have €80 start money plus 2 × €70 from the first sale, so **€220 cash and 1 water pallet**.
2. **First profit.** The first supplier offer comes 8 s after the tutorial (`supplier.firstOfferDelay`). The first customer offer (`customer.firstOfferDelay`, 3 s) pops the moment the tutorial's truck has left the dock, about 9 s. One pallet, reaction time and one truck arrival give the first profit at 0:33.
3. **Faster Wheels €150.** Most of the post-tutorial cash goes into the first restock (3–6 pallets × ~€33–46), so the upgrade becomes affordable after 2–3 sales, at about 2:40.
4. **Rack row C €300.** Two rows (12 slots) fill up once chips unlock at ~3:30 and there are three products to hold. About 3.5 minutes of ~€90/min after the upgrade gives 6:17.
5. **Electric pompwagen €1,100.** It carries 2 pallets (halving trips) and moves the game to the next stage with bigger orders. At ~€95/min after row C, reaching it takes ~11 more minutes, so 17:20.
6. **Later goals.** Faster Wheels LV2 (€1,300), row D (€1,400) and beyond are deliberately priced above the electric pompwagen. A new player's natural cheapest-first path is then speed → rack row → electric, which is what the targets assume. They become the goals of the electric stage (LV2 at ~25 min in the sim).

## Offer frequency

| Setting | Value | Why |
|---|---|---|
| `customer.firstOfferDelay` | 3 s | first sale right after the tutorial |
| `customer.offerIntervalMin/Max` | 4–9 s | a new order shortly after each truck leaves |
| `customer.fillableChance` | 0.85 | most orders can be filled; some force a decline |
| `customer.mixedOrderChance` | 0.3 | about one order in three asks for two products |
| `supplier.firstOfferDelay` | 8 s | restock before the first pallet runs out |
| `supplier.offerIntervalMin/Max` | 6–12 s | stock rarely blocks the player |
| `stages[0]` sizes | supplier 3–6, customer 2–4 | small enough for a 1-pallet pompwagen |

Only one supplier and one customer order run at a time, one truck per side.
- Each interval restarts when an offer is accepted, declined or expires.
- It keeps counting while the previous truck drives away, so the next offer appears as soon as the dock is free.

Supplier offers restock products weighted by `demand / (1 + stock)`. They are
clamped to your free rack space and to what you can afford. If you are broke
with empty racks, a nearly free "rescue" delivery prevents soft-locks.

## Pay pads

Pads charge `max(minPayRatePerSecond, cost / payDuration)` per second, so any
purchase completes in ≤ 1.8 s of standing.

## The simulation model (`scripts/economy-sim.mjs`)

- It mirrors the offer rules of `src/core/Orders.ts`: generation, clamping, the rescue delivery and timer behaviour. Keep the two in sync when changing generation logic.
- It starts in the real post-tutorial state: €220, 1 water pallet in stock, and the tutorial customer truck still pulling away.
- The player is greedy but reasonable:
  - reads and answers each popup in 2.5 s
  - accepts every delivery that fits and is affordable
  - accepts every order it can fill
  - works in this priority: store unneeded pallets → pick pallets for the active customer → bring them to LOAD (waiting if the truck is still arriving) → unload the supplier truck → buy the cheapest upgrade it can afford
- Walking time is straight-line distance × 1.25 at the vehicle's (loaded) speed, plus 1.5 s per trip.
- Pay pads, truck arrival/departure, reputation bonuses, product unlocks and upgrade effects (speed bonus, electric capacity and stage) are all simulated.

The model does not include:
- missed deadlines (customer deadlines of 90 s + 20 s per pallet are generous)
- time spent reading the order board
- a player who hoards cash

Real players will vary around the simulated p25–p75 band.
