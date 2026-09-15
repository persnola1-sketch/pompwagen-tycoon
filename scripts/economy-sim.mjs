#!/usr/bin/env node
/**
 * Economy pacing simulator (npm run sim).
 *
 * Reads the real gameplay numbers from src/config/*.json, derives walking and
 * truck times from layout.json, and plays the post-tutorial game with a greedy
 * "reasonable new player" many times. Prints milestone timings used in
 * docs/economy.md. The offer-generation rules mirror src/core/Orders.ts.
 *
 * Env: RUNS (default 400), MINUTES (default 30), SEED (default 1)
 */
import { readFileSync } from 'node:fs';

const cfg = (f) => JSON.parse(readFileSync(new URL(`../src/config/${f}`, import.meta.url), 'utf8'));
const economy = cfg('economy.json');
const layout = cfg('layout.json');
const vehicles = cfg('vehicles.json');
const { products } = cfg('products.json');

// Player-model assumptions. These describe the human, not the game, so they
// live here rather than in src/config.
const MODEL = {
  runs: Number(process.env.RUNS ?? 400),
  minutes: Number(process.env.MINUTES ?? 30),
  seed: Number(process.env.SEED ?? 1),
  dt: 0.1,
  reactionTime: 2.5, // s to read a popup and tap accept/decline
  detour: 1.25, // real path / straight line (steering the pompwagen around racks)
  maneuver: 1.5, // s lost per trip lining up with a pad or rack strip
};

// ---------------------------------------------------------------- geometry
const R = layout.rackRows;
const sections = Math.ceil(R.slotsPerRow / 2);
const rowLen = R.slotsPerRow * R.slotSpacing + (sections - 1) * R.sectionGap;
const P = layout.pads;
const T = layout.truck;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const stripPoint = (row, from) => {
  const r = R.rows[row];
  return { x: clamp(from.x, r.x - rowLen / 2, r.x + rowLen / 2), z: r.z + R.padOffsetZ };
};

function truckTimes() {
  const halfW = layout.warehouse.width / 2;
  const dockZ = layout.docks.doorZ[0];
  const c = T.inbound;
  const drive = Math.abs(c.spawn.z - (dockZ + T.turnInDistance)) / T.driveSpeed;
  const reverseDist = T.length + T.rearInsideDoor * 2;
  const arrival = drive + T.swingDuration + reverseDist / T.reverseSpeed;
  const departure = T.departDelay + T.pullOutDuration + Math.abs(dockZ - T.pullOutDistance - c.exit.z) / T.driveSpeed;
  void halfW;
  return { arrival, departure };
}
const TRUCK = truckTimes();

// ---------------------------------------------------------------- rng
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- one run
function run(seed) {
  const rng = mulberry32(seed);
  const rand = (a, b) => a + rng() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const weighted = (items, w) => {
    const total = items.reduce((s, it) => s + w(it), 0);
    if (total <= 0) return null;
    let r = rng() * total;
    for (const it of items) {
      r -= w(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };

  const tut = economy.tutorial;
  const s = {
    t: 0,
    money: economy.startMoney + tut.customerPallets * tut.customerPricePerPallet + tut.completionBonus,
    rep: economy.reputation.start,
    rows: R.startRows,
    slots: new Array(R.rows.length * R.slotsPerRow).fill(null),
    speedLevel: 0,
    electric: false,
    shipped: tut.customerPallets,
    pos: { ...P.load },
    carrying: [],
    busyUntil: 0,
    after: null,
    profit: 0,
  };
  for (let i = 0; i < tut.freeDeliveryPallets - tut.customerPallets; i++) s.slots[i] = tut.product;

  const events = { firstShip: Infinity, purchases: [], unlocks: {}, moneyAt: {} };
  const capacity = () => s.rows * R.slotsPerRow;
  const stock = (pid) => {
    let n = 0;
    for (let i = 0; i < capacity(); i++) if (s.slots[i] && (!pid || s.slots[i] === pid)) n++;
    return n;
  };
  const unlocked = () => products.filter((p) => s.shipped >= p.unlockShipped);
  const stage = () => economy.stages[s.electric ? 1 : 0];
  const veh = () => (s.electric ? vehicles.electric : vehicles.pompwagen);
  const avgCost = {};
  for (const p of products) avgCost[p.id] = (p.buyMin + p.buyMax) / 2;

  // ---- orders (mirrors Orders.ts)
  let supTimer = economy.supplier.firstOfferDelay;
  let cusTimer = economy.customer.firstOfferDelay;
  let pendingSup = null;
  let pendingCus = null;
  let sup = null;
  // the tutorial's customer truck is still driving away when the sim starts
  let cus = { lines: [], state: 'leaving', at: TRUCK.departure };

  function genSupplier() {
    const st = stage();
    const prod = weighted(unlocked(), (p) => p.demand / (1 + stock(p.id)));
    let pallets = randInt(st.supplierMin, st.supplierMax);
    let price = Math.round(rand(prod.buyMin, prod.buyMax));
    const free = capacity() - stock();
    pallets = Math.min(pallets, Math.max(1, free));
    const afford = Math.floor(s.money / Math.max(1, price));
    if (afford >= 1) pallets = Math.min(pallets, afford);
    if (stock() === 0 && afford < 2) {
      pallets = Math.min(2, Math.max(1, free));
      price = Math.max(0, Math.floor(s.money / pallets));
    }
    pendingSup = { product: prod.id, pallets, price, shownAt: s.t };
  }

  function genCustomer() {
    const st = stage();
    if (stock() <= 0) {
      cusTimer = economy.customer.retryDelay;
      return;
    }
    let cands = unlocked();
    const fillable = rng() < economy.customer.fillableChance;
    if (fillable) cands = cands.filter((p) => stock(p.id) > 0);
    const total = randInt(st.customerMin, st.customerMax);
    const mixed = cands.length >= 2 && total >= 2 && rng() < economy.customer.mixedOrderChance;
    const first = weighted(cands, (p) => p.demand);
    const picks = [first];
    if (mixed) picks.push(weighted(cands.filter((p) => p !== first), (p) => p.demand));
    const sizes = mixed ? [Math.ceil(total / 2), Math.floor(total / 2)] : [total];
    const repBonus = 1 + s.rep * economy.reputation.priceBonusPerStar;
    let lines = picks.map((p, i) => ({
      product: p.id,
      pallets: fillable ? Math.min(sizes[i], stock(p.id)) : sizes[i],
      loaded: 0,
      price: Math.round(rand(p.sellMin, p.sellMax) * repBonus),
    }));
    lines = lines.filter((l) => l.pallets > 0);
    if (!lines.length) {
      cusTimer = economy.customer.retryDelay;
      return;
    }
    pendingCus = { lines, shownAt: s.t };
  }

  const resetSup = () => (supTimer = rand(economy.supplier.offerIntervalMin, economy.supplier.offerIntervalMax));
  const resetCus = () => (cusTimer = rand(economy.customer.offerIntervalMin, economy.customer.offerIntervalMax));

  function updateOrders(dt) {
    // timers run while the previous truck leaves; offers appear once the dock is free
    if (!pendingSup && (!sup || sup.state === 'leaving')) {
      supTimer -= dt;
      if (supTimer <= 0 && !sup) genSupplier();
    }
    if (!pendingCus && (!cus || cus.state === 'leaving')) {
      cusTimer -= dt;
      if (cusTimer <= 0 && !cus) genCustomer();
    }
    // player reads and answers popups
    if (pendingSup && s.t - pendingSup.shownAt >= MODEL.reactionTime) {
      const o = pendingSup;
      const cost = o.pallets * o.price;
      if (cost <= s.money && o.pallets <= capacity() - stock()) {
        s.money -= cost;
        const st = stock(o.product);
        avgCost[o.product] = (avgCost[o.product] * st + o.price * o.pallets) / Math.max(1, st + o.pallets);
        sup = { product: o.product, remaining: o.pallets, state: 'arriving', at: s.t + TRUCK.arrival };
      }
      resetSup();
      pendingSup = null;
    }
    if (pendingCus && s.t - pendingCus.shownAt >= MODEL.reactionTime) {
      const o = pendingCus;
      if (o.lines.every((l) => stock(l.product) >= l.pallets)) {
        const n = o.lines.reduce((a, l) => a + l.pallets, 0);
        const deadline = economy.customer.deadlineBase + economy.customer.deadlinePerPallet * n;
        cus = { lines: o.lines, state: 'arriving', at: s.t + TRUCK.arrival, deadline, deadlineTotal: deadline };
      }
      resetCus();
      pendingCus = null;
    }
    // trucks
    if (sup) {
      if (sup.state === 'arriving' && s.t >= sup.at) sup.state = 'docked';
      if (sup.state === 'leaving' && s.t >= sup.at) sup = null;
    }
    if (cus) {
      if (cus.state === 'arriving' && s.t >= cus.at) cus.state = 'docked';
      if (cus.state !== 'leaving') {
        cus.deadline -= dt;
        if (cus.deadline <= 0) finishCustomer(false);
      }
      if (cus && cus.state === 'leaving' && s.t >= cus.at) cus = null;
    }
  }

  function finishCustomer(complete) {
    let revenue = 0;
    let cost = 0;
    let n = 0;
    for (const l of cus.lines) {
      revenue += l.loaded * l.price;
      cost += l.loaded * avgCost[l.product];
      n += l.loaded;
    }
    const before = unlocked().length;
    s.money += revenue;
    s.profit += revenue - cost;
    s.shipped += n;
    if (unlocked().length > before) {
      for (const p of unlocked()) if (!(p.id in events.unlocks) && p.unlockShipped > 0) events.unlocks[p.id] = s.t;
    }
    if (complete) {
      if (events.firstShip === Infinity) events.firstShip = s.t;
      if (cus.deadline > cus.deadlineTotal * economy.customer.fastDeliveryFraction) {
        s.rep = Math.min(economy.reputation.max, s.rep + economy.customer.fastDeliveryRepBonus);
      }
    } else {
      s.rep = Math.max(economy.reputation.min, s.rep - economy.customer.missedRepPenalty);
    }
    cus.state = 'leaving';
    cus.at = s.t + TRUCK.departure;
  }

  // remaining need per product after what is already on the forks
  const lineNeed = (pid) => {
    if (!cus || cus.state === 'leaving') return 0;
    const l = cus.lines.find((x) => x.product === pid);
    if (!l) return 0;
    return l.pallets - l.loaded;
  };
  const needAfterCarry = (pid) => lineNeed(pid) - s.carrying.filter((c) => c === pid).length;

  // ---- player
  const speed = (loaded) => {
    const v = veh();
    return v.maxSpeed * (loaded ? v.loadedSpeedFactor : 1) * (1 + s.speedLevel * economy.payPads.speedUpgrade.speedBonusPerLevel);
  };
  function travel(target, onArrive) {
    const d = dist(s.pos, target);
    const time = d > 0.4 ? (d * MODEL.detour) / speed(s.carrying.length > 0) + MODEL.maneuver : 0;
    s.busyUntil = s.t + time;
    s.pos = { x: target.x, z: target.z };
    s.after = onArrive;
  }
  const busy = (sec) => (s.busyUntil = Math.max(s.busyUntil, s.t) + sec);
  const cooldown = economy.interaction.actionCooldown;

  function nearestRow(pred) {
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r < s.rows; r++) {
      if (!pred(r)) continue;
      const d = dist(s.pos, stripPoint(r, s.pos));
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }
  const rowSlots = (r) => Array.from({ length: R.slotsPerRow }, (_, c) => r * R.slotsPerRow + c);

  function purchaseOptions() {
    const opts = [];
    const su = economy.payPads.speedUpgrade;
    if (s.speedLevel < su.costs.length) opts.push({ what: `speed${s.speedLevel + 1}`, cost: su.costs[s.speedLevel], pad: P.upgradeSpeed });
    const ri = s.rows - R.startRows;
    if (s.rows < R.rows.length && ri < economy.payPads.rackRowCosts.length) opts.push({ what: `row${ri + 1}`, cost: economy.payPads.rackRowCosts[ri], pad: stripPoint(s.rows, s.pos) });
    if (!s.electric) opts.push({ what: 'electric', cost: economy.payPads.electricPompwagen, pad: P.upgradeElectric });
    return opts.sort((a, b) => a.cost - b.cost);
  }

  function decide() {
    const cap = veh().capacity;
    // a) store pallets nobody is waiting for
    const unneeded = s.carrying.filter((pid) => needAfterCarry(pid) < 0 || lineNeed(pid) === 0);
    if (unneeded.length) {
      const row = nearestRow((r) => rowSlots(r).some((i) => !s.slots[i]));
      if (row < 0) return busy(0.5);
      return travel(stripPoint(row, s.pos), () => {
        for (const pid of [...s.carrying]) {
          if (lineNeed(pid) > 0 && needAfterCarry(pid) >= 0) continue;
          const slot = rowSlots(row).find((i) => !s.slots[i]);
          if (slot === undefined) break;
          s.slots[slot] = pid;
          s.carrying.splice(s.carrying.indexOf(pid), 1);
          busy(cooldown);
        }
      });
    }
    // b) pick pallets the active customer still needs
    if (cus && cus.state !== 'leaving' && s.carrying.length < cap) {
      const wanted = (i) => s.slots[i] && needAfterCarry(s.slots[i]) > 0;
      const row = nearestRow((r) => rowSlots(r).some(wanted));
      if (row >= 0) {
        return travel(stripPoint(row, s.pos), () => {
          for (const i of rowSlots(row)) {
            if (s.carrying.length >= cap) break;
            if (!wanted(i)) continue;
            s.carrying.push(s.slots[i]);
            s.slots[i] = null;
            busy(cooldown);
          }
        });
      }
    }
    // c) bring needed pallets to the load pad (wait there if the truck is still coming)
    if (s.carrying.length) {
      if (dist(s.pos, P.load) > 0.4) return travel(P.load, null);
      if (cus && cus.state === 'docked') {
        for (const pid of [...s.carrying]) {
          const l = cus.lines.find((x) => x.product === pid && x.loaded < x.pallets);
          if (!l) continue;
          l.loaded++;
          s.carrying.splice(s.carrying.indexOf(pid), 1);
          busy(cooldown);
        }
        if (cus.lines.every((l) => l.loaded >= l.pallets)) finishCustomer(true);
        return;
      }
      return busy(0.3);
    }
    // d) unload the supplier truck
    if (sup && sup.state === 'docked' && sup.remaining > 0) {
      return travel(P.unload, () => {
        while (s.carrying.length < cap && sup.remaining > 0) {
          s.carrying.push(sup.product);
          sup.remaining--;
          busy(cooldown);
        }
        if (sup.remaining <= 0) {
          sup.state = 'leaving';
          sup.at = s.t + TRUCK.departure;
        }
      });
    }
    // e) spend money on the cheapest upgrade
    const opt = purchaseOptions()[0];
    if (opt && s.money >= opt.cost) {
      return travel(opt.pad, () => {
        if (s.money < opt.cost) return;
        const rate = Math.max(economy.payPads.minPayRatePerSecond, opt.cost / economy.payPads.payDuration);
        busy(opt.cost / rate);
        s.money -= opt.cost;
        if (opt.what.startsWith('speed')) s.speedLevel++;
        else if (opt.what.startsWith('row')) s.rows++;
        else s.electric = true;
        events.purchases.push({ what: opt.what, t: s.t, cost: opt.cost });
      });
    }
    return busy(0.25);
  }

  const end = MODEL.minutes * 60;
  let nextSample = 60;
  while (s.t < end) {
    updateOrders(MODEL.dt);
    if (s.t >= s.busyUntil) {
      const fn = s.after;
      s.after = null;
      if (fn) fn();
      if (s.t >= s.busyUntil) decide();
    }
    s.t += MODEL.dt;
    if (s.t >= nextSample) {
      events.moneyAt[nextSample / 60] = { profit: s.profit, shipped: s.shipped };
      nextSample += 60;
    }
  }
  return events;
}

// ---------------------------------------------------------------- report
function pct(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
}
const fmt = (sec) => (isFinite(sec) ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : 'never');

const results = [];
for (let i = 0; i < MODEL.runs; i++) results.push(run(MODEL.seed * 7919 + i));

const firstOf = (e, prefix) => e.purchases.find((p) => p.what.startsWith(prefix))?.t ?? Infinity;
const milestones = [
  ['First profit (customer truck paid)', (e) => e.firstShip, [0, 60]],
  ['First upgrade (any pad)', (e) => e.purchases[0]?.t ?? Infinity, [120, 180]],
  ['First storage expansion', (e) => firstOf(e, 'row'), [300, 420]],
  ['Electric pompwagen', (e) => firstOf(e, 'electric'), [900, 1200]],
];

// tutorial length estimate (same walking model)
function tutorialEstimate() {
  const v = vehicles.pompwagen;
  const tut = economy.tutorial;
  const row0 = stripPoint(0, P.unload);
  const leg = (a, b, loaded) => (dist(a, b) * MODEL.detour) / (v.maxSpeed * (loaded ? v.loadedSpeedFactor : 1)) + MODEL.maneuver;
  const cd = economy.interaction.actionCooldown;
  let t = 4; // drive around a bit
  t += MODEL.reactionTime + 3; // read + accept offer
  t += Math.max(TRUCK.arrival, leg(layout.playerStart, P.unload, false));
  for (let i = 0; i < tut.freeDeliveryPallets; i++) t += leg(P.unload, row0, true) + cd + (i < tut.freeDeliveryPallets - 1 ? leg(row0, P.unload, false) : 0);
  t += MODEL.reactionTime + 3;
  let pick = 0;
  for (let i = 0; i < tut.customerPallets; i++) pick += leg(P.load, stripPoint(0, P.load), false) + cd + leg(stripPoint(0, P.load), P.load, true) + cd;
  t += Math.max(TRUCK.arrival, pick);
  return t;
}

const out = [];
out.push(`Runs: ${MODEL.runs}, simulated ${MODEL.minutes} min after the tutorial`);
out.push(`Truck arrival ${TRUCK.arrival.toFixed(1)} s, departure ${TRUCK.departure.toFixed(1)} s`);
const v0 = vehicles.pompwagen;
const dUR = dist(P.unload, stripPoint(0, P.unload));
const dRL = dist(stripPoint(0, P.load), P.load);
out.push(`Distances: unload→row A ${dUR.toFixed(1)} m, row A→load ${dRL.toFixed(1)} m (×${MODEL.detour} detour)`);
const cyc = (d) => (d * MODEL.detour) / (v0.maxSpeed * v0.loadedSpeedFactor) + (d * MODEL.detour) / v0.maxSpeed + 2 * MODEL.maneuver + economy.interaction.actionCooldown;
out.push(`Round trip per pallet (pompwagen): unload↔rack ${cyc(dUR).toFixed(1)} s, rack↔load ${cyc(dRL).toFixed(1)} s`);
out.push(`Tutorial length estimate: ${fmt(tutorialEstimate())}`);
out.push('');
out.push('| Milestone (time after tutorial) | p25 | median | p75 | target | ok |');
out.push('|---|---|---|---|---|---|');
let allOk = true;
for (const [name, fn, [lo, hi]] of milestones) {
  const vals = results.map(fn);
  const med = pct(vals, 0.5);
  const ok = med >= lo && med <= hi;
  allOk &&= ok;
  out.push(`| ${name} | ${fmt(pct(vals, 0.25))} | ${fmt(med)} | ${fmt(pct(vals, 0.75))} | ${fmt(lo)}–${fmt(hi)} | ${ok ? '✔' : '✖'} |`);
}
out.push('');
out.push('| Minute | median profit | median pallets shipped |');
out.push('|---|---|---|');
for (const m of [1, 3, 5, 10, 15, 20, 30]) {
  if (m > MODEL.minutes) continue;
  out.push(`| ${m} | €${Math.round(pct(results.map((e) => e.moneyAt[m]?.profit ?? 0), 0.5))} | ${pct(results.map((e) => e.moneyAt[m]?.shipped ?? 0), 0.5)} |`);
}
out.push('');
out.push('| Purchase (cheapest-first order) | median time |');
out.push('|---|---|');
const whats = [...new Set(results.flatMap((e) => e.purchases.map((p) => p.what)))];
const order = whats
  .map((w) => [w, pct(results.map((e) => e.purchases.find((p) => p.what === w)?.t ?? Infinity), 0.5)])
  .sort((a, b) => a[1] - b[1]);
for (const [w, t] of order) out.push(`| ${w} | ${fmt(t)} |`);
out.push('');
out.push('| Product unlock | median time |');
out.push('|---|---|');
for (const p of products.filter((x) => x.unlockShipped > 0)) {
  out.push(`| ${p.name} (${p.unlockShipped} shipped) | ${fmt(pct(results.map((e) => e.unlocks[p.id] ?? Infinity), 0.5))} |`);
}
console.log(out.join('\n'));
process.exitCode = allOk ? 0 : 1;
