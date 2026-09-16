# Economy & pacing (update v3)

All numbers live in `src/config/*.json`:

| File | What it sets |
|---|---|
| `economy.json` | start money, warehouse price, offer rules, pay-pad prices and their company-level gates |
| `products.json` | buy/sell bands, demand, product unlock thresholds |
| `workers.json` | hire costs, wages, speeds, breaks, roster cap per company level, offline shifts |
| `quests.json` | company level curve, XP per shipped pallet, quest and event rewards |
| `construction.json` | how long each build and delivery takes |
| `shop.json` | the shop catalogue and the company level each item needs |
| `layout.json`, `vehicles.json` | distances and vehicle speeds, which set the walking times |

Re-check any change with:

```bash
npm run sim                     # 400 runs, 30 simulated minutes
MINUTES=70 RUNS=200 npm run sim # the full curve up to the forklift
```

The script exits non-zero when a median misses its target band.

## The first two minutes

1. A new game starts on an **empty plot** with **€20,000**.
2. **BUY WAREHOUSE** costs €15,000 and the build takes 10 s, so the warehouse is
   standing well inside the first minute.
3. The tutorial delivery is 3 pallets at €30, the first customer pays €70 a
   pallet, and Henk's last step hires worker #1 for €100.
4. That leaves **€4,950 and one worker** when the tutorial ends — the state the
   simulator starts from.

## Pacing targets

Times below are measured **after the tutorial**, which itself takes about
1:40. Medians from 200 simulated runs:

| Goal | Target (after tutorial) | Median | p25–p75 |
|---|---|---|---|
| First profit (a customer truck pays) | < 1:30 | **0:33** | 0:33–0:33 |
| First storage expansion (row C, €300) | 1:30–12:00 | **2:20** | 1:52–3:03 |
| Second worker (€250) | 4:00–10:00 | **7:50** | 7:20–8:36 |
| Third worker (€800) | 10:00–20:00 | **15:20** | 14:36–15:58 |
| Electric pompwagen (€1,600) | 12:30–25:00 | **24:03** | 23:20–24:45 |
| First conveyor (€4,000) | 25:00–45:00 | **37:15** | 36:14–38:02 |
| Forklift delivered (€5,000) | 35:00–70:00 | **55:13** | 54:14–56:20 |

Add ~1:40 for the tutorial to compare these with the update-v3 table, which
counts from the first tap.

## Why starting money cannot skip the game

€20,000 would buy every early upgrade at once, so **money is never the only
gate**. Each of the big steps also needs a company level:

| Unlock | Company level | Roughly |
|---|---|---|
| Faster wheels, rack rows | 1 | from the start |
| Temp workers, boosts, chips licence | 2 | ~10 min |
| Electric pompwagen, coffee machine | 3 | ~15 min |
| Conveyors, LED lighting | 4 | ~22 min |
| Forklift, upper rack levels | 5 | ~30 min |
| Canteen, belt motors | 6 | ~35 min |
| Second dock door | 7 | ~45 min |

The **roster size** is capped the same way: `workers.maxWorkersPerLevel` allows
one worker per company level, so the team grows with the company rather than
with the bank balance.

Company XP comes from two places:

- **6 XP per shipped pallet** (`quests.xpPerPalletShipped`) — steady income
- **quest rewards** — 40 to 800 XP a piece, roughly another 50% on top

The level thresholds are `quests.companyLevelXp`: 120, 300, 560, 900, 1350,
1950, 2700 … so level *n* needs about 1.4× the XP of level *n-1*.

## Where the money comes from

Margins per pallet (`products.json`, +3% per reputation star, +4/8% from silver
and gold client loyalty):

| Product | Unlocks after | Buy (avg) | Sell (avg, 3★) | Profit / pallet |
|---|---|---|---|---|
| Water Bottles | start | €33 | €74 | ~€41 |
| Soft Drinks | start | €46 | €97 | ~€51 |
| Chips | 8 shipped (or a €600 licence) | €29 | €72 | ~€43 |
| Toilet Paper | 20 shipped (€1,400) | €25 | €65 | ~€40 |
| Canned Food | 40 shipped (€3,200) | €69 | €134 | ~€65 |
| Cleaning Products | 65 shipped (€5,000) | €58 | €120 | ~€62 |

Throughput is what changes over a run, not the margin:

| Stage | Who moves the pallets | Rough rate |
|---|---|---|
| Solo pompwagen | the boss only | ~2 pallets/min |
| + workers | each worker adds ~0.8 of a boss | ~2 × (1 + 0.8·(n−1)) |
| + conveyors | the belt does the long haul | +35% per belt |
| + forklift and upper levels | three levels of storage per row | bigger orders (`economy.stages`) |

Median simulated progress:

| Minute | Profit | Pallets shipped | Company level |
|---|---|---|---|
| 1 | €41 | 3 | 1 |
| 3 | €241 | 7 | 1 |
| 5 | €445 | 11 | 1 |
| 10 | €1,085 | 24 | 2 |
| 15 | €1,883 | 41 | 3 |
| 20 | €2,889 | 61 | 3 |
| 30 | €6,507 | 130 | 5 |

## Wages

A worker's wage is 8% of their hire cost (minimum €12) and is paid every
5 minutes of play. Worker #1 therefore costs €12 a shift against roughly €400
of profit in the same window — noticeable but never punishing, which is the
rule the design sets for the early game. Wages scale with the roster, so a big
team has to keep the trucks moving to pay for itself.

## Offer frequency

| Setting | Value | Why |
|---|---|---|
| `customer.firstOfferDelay` | 3 s | a sale right after the tutorial |
| `customer.offerIntervalMin/Max` | 4–9 s | a new order shortly after each truck leaves |
| `supplier.offerIntervalMin/Max` | 6–12 s | stock rarely blocks the player |
| second dock door | ×0.7 | both intervals shorten once it is built |
| rush hour event | ×0.5 intervals, ×1.25 price | for 90 seconds |

One supplier and one customer order run at a time, one truck per side. Supplier
offers restock what is running low (weighted by `demand / (1 + stock)`), clamped
to free rack space and to what the player can afford; if the player is broke
with empty racks a nearly free rescue delivery prevents a soft-lock.

## What the simulator models

`scripts/economy-sim.mjs` mirrors `src/core/Orders.ts` for offer generation and
adds:

- walking times from `layout.json` (straight line × 1.25, plus 1.5 s per trip)
- workers as parallel throughput, conveyors as a further multiplier
- company XP from shipped pallets plus ~50% again for quest rewards
- company-level gates on hiring, vehicles and conveyors
- construction and delivery timers before an upgrade actually lands
- wages every shift

It does **not** model: missed deadlines, client loyalty bonuses, random events,
rewarded-ad boosts, or a player who hoards cash. All of those make the real game
slightly faster than the table above, which is why the target bands are wide.
