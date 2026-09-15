import economy from '../config/economy.json';
import names from '../config/names.json';
import { CustomerOffer, EventBus, OrderLine, SupplierOffer, TruckKind } from './EventBus';
import { GameState } from './GameState';
import { PRODUCTS, ProductDef, product } from './Products';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function weighted<T>(items: readonly T[], weight: (item: T) => number): T | null {
  const total = items.reduce((s, it) => s + weight(it), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1] ?? null;
}

export interface CustomerTotals {
  pallets: number;
  loaded: number;
  revenue: number;
  profit: number;
}

export function customerTotals(o: CustomerOffer): CustomerTotals {
  const t = { pallets: 0, loaded: 0, revenue: 0, profit: 0 };
  for (const l of o.lines) {
    t.pallets += l.pallets;
    t.loaded += l.loaded;
    t.revenue += l.pallets * l.pricePerPallet;
    t.profit += l.pallets * (l.pricePerPallet - l.costBasisPerPallet);
  }
  t.profit = Math.round(t.profit);
  return t;
}

export function supplierNames(productId: string): string[] {
  return (names.suppliers as Record<string, string[]>)[productId] ?? ['Groothandel BV'];
}

/**
 * Owns the full order lifecycle: random offer generation, accept/decline,
 * truck dock notifications, unload/load pallet transactions, deadlines.
 * Pure logic — the 3D truck controllers react to the events this emits.
 * scripts/economy-sim.mjs mirrors the generation rules; keep them in sync.
 */
export class Orders {
  /** random generation off during tutorial */
  auto = false;

  pendingSupplier: SupplierOffer | null = null;
  pendingCustomer: CustomerOffer | null = null;
  activeSupplier: SupplierOffer | null = null;
  activeCustomer: CustomerOffer | null = null;

  private nextId = 1;
  private supplierTimer: number = economy.supplier.firstOfferDelay;
  private customerTimer: number = economy.customer.firstOfferDelay;
  private avgCost: Record<string, number> = {};

  constructor(private state: GameState, private bus: EventBus) {
    for (const p of PRODUCTS) this.avgCost[p.id] = (p.buyMin + p.buyMax) / 2;
  }

  /** switch on random offers (after the tutorial or on load) using the short first-offer delays */
  startAuto(): void {
    this.auto = true;
    this.supplierTimer = economy.supplier.firstOfferDelay;
    this.customerTimer = economy.customer.firstOfferDelay;
  }

  update(dt: number): void {
    if (this.auto) {
      // timers keep running while the previous truck drives away; the next
      // offer pops as soon as the dock is free
      const s = this.activeSupplier;
      if (!this.pendingSupplier && (!s || s.state === 'done')) {
        this.supplierTimer -= dt;
        if (this.supplierTimer <= 0 && !s) this.generateSupplierOffer();
      }
      const c = this.activeCustomer;
      if (!this.pendingCustomer && (!c || c.state === 'done')) {
        this.customerTimer -= dt;
        if (this.customerTimer <= 0 && !c) this.generateCustomerOffer();
      }
    }

    if (this.pendingSupplier) {
      this.pendingSupplier.expiresIn -= dt;
      if (this.pendingSupplier.expiresIn <= 0) {
        this.bus.emit('supplierOfferExpired', { id: this.pendingSupplier.id });
        this.pendingSupplier = null;
        this.resetSupplierTimer();
        this.bus.emit('ordersChanged', {});
      }
    }
    if (this.pendingCustomer) {
      this.pendingCustomer.expiresIn -= dt;
      if (this.pendingCustomer.expiresIn <= 0) {
        this.bus.emit('customerOfferExpired', { id: this.pendingCustomer.id });
        this.pendingCustomer = null;
        this.resetCustomerTimer();
        this.bus.emit('ordersChanged', {});
      }
    }

    const c = this.activeCustomer;
    if (c && c.state !== 'done') {
      c.deadline -= dt;
      if (c.deadline <= 0) this.missCustomerOrder();
    }
  }

  // ---------- generation ----------

  private stage() {
    return economy.stages[Math.min(this.state.stageIndex, economy.stages.length - 1)];
  }

  private generateSupplierOffer(): void {
    const s = this.stage();
    // restock what is running low, weighted by demand
    const prod = weighted(this.state.unlocked, (p) => p.demand / (1 + this.state.stockOf(p.id))) ?? PRODUCTS[0];
    let pallets = randInt(s.supplierMin, s.supplierMax);
    let price = Math.round(rand(prod.buyMin, prod.buyMax));
    pallets = Math.min(pallets, Math.max(1, this.state.freeSpace));
    const afford = Math.floor(this.state.money / Math.max(1, price));
    if (afford >= 1) pallets = Math.min(pallets, afford);
    // soft-lock rescue: broke with empty racks → a deal you can always take
    if (this.state.stock === 0 && afford < 2) {
      pallets = Math.min(2, Math.max(1, this.state.freeSpace));
      price = Math.max(0, Math.floor(this.state.money / pallets));
    }
    this.offerSupplier({
      supplier: pick(supplierNames(prod.id)),
      product: prod.id,
      pallets,
      pricePerPallet: price,
      free: price === 0,
    });
  }

  private generateCustomerOffer(): void {
    const s = this.stage();
    if (this.state.stock <= 0) {
      this.customerTimer = economy.customer.retryDelay;
      return;
    }
    // usually fillable, sometimes not so declining is a real decision
    let candidates: ProductDef[] = this.state.unlocked;
    const fillable = Math.random() < economy.customer.fillableChance;
    if (fillable) candidates = candidates.filter((p) => this.state.stockOf(p.id) > 0);
    const total = randInt(s.customerMin, s.customerMax);
    const mixed = candidates.length >= 2 && total >= 2 && Math.random() < economy.customer.mixedOrderChance;
    const first = weighted(candidates, (p) => p.demand);
    if (!first) {
      this.customerTimer = economy.customer.retryDelay;
      return;
    }
    const picks = [first];
    if (mixed) {
      const second = weighted(candidates.filter((p) => p !== first), (p) => p.demand);
      if (second) picks.push(second);
    }
    const sizes = picks.length > 1 ? [Math.ceil(total / 2), Math.floor(total / 2)] : [total];
    const repBonus = 1 + this.state.reputation * economy.reputation.priceBonusPerStar;
    const lines = picks
      .map((p, i) => ({
        product: p.id,
        pallets: fillable ? Math.min(sizes[i], this.state.stockOf(p.id)) : sizes[i],
        pricePerPallet: Math.round(rand(p.sellMin, p.sellMax) * repBonus),
      }))
      .filter((l) => l.pallets > 0);
    if (!lines.length) {
      this.customerTimer = economy.customer.retryDelay;
      return;
    }
    this.offerCustomer({ store: pick(names.stores), lines });
  }

  offerSupplier(o: { supplier: string; product: string; pallets: number; pricePerPallet: number; free: boolean }): void {
    const offer: SupplierOffer = {
      id: this.nextId++,
      supplier: o.supplier,
      product: o.product,
      pallets: o.pallets,
      pricePerPallet: o.free ? 0 : o.pricePerPallet,
      expiresIn: economy.supplier.offerExpiry,
      free: o.free,
      remaining: o.pallets,
      state: 'offered',
    };
    this.pendingSupplier = offer;
    this.bus.emit('supplierOffer', { offer });
    this.bus.emit('ordersChanged', {});
  }

  offerCustomer(o: { store: string; lines: { product: string; pallets: number; pricePerPallet: number }[] }): void {
    const lines: OrderLine[] = o.lines.map((l) => ({
      ...l,
      loaded: 0,
      costBasisPerPallet: this.avgCost[l.product] ?? 0,
    }));
    const pallets = lines.reduce((s, l) => s + l.pallets, 0);
    const total = economy.customer.deadlineBase + economy.customer.deadlinePerPallet * pallets;
    const offer: CustomerOffer = {
      id: this.nextId++,
      store: o.store,
      lines,
      expiresIn: economy.customer.offerExpiry,
      deadline: total,
      deadlineTotal: total,
      state: 'offered',
    };
    this.pendingCustomer = offer;
    this.bus.emit('customerOffer', { offer });
    this.bus.emit('ordersChanged', {});
  }

  private resetSupplierTimer(): void {
    this.supplierTimer = rand(economy.supplier.offerIntervalMin, economy.supplier.offerIntervalMax);
  }
  private resetCustomerTimer(): void {
    this.customerTimer = rand(economy.customer.offerIntervalMin, economy.customer.offerIntervalMax);
  }

  // ---------- accept / decline ----------

  acceptSupplier(id: number): boolean {
    const o = this.pendingSupplier;
    if (!o || o.id !== id) return false;
    const cost = o.pallets * o.pricePerPallet;
    if (cost > this.state.money) {
      this.bus.emit('toast', { text: 'Not enough money!', kind: 'bad' });
      return false;
    }
    if (o.pallets > this.state.freeSpace) {
      this.bus.emit('toast', { text: 'Not enough rack space!', kind: 'bad' });
      return false;
    }
    if (cost > 0) this.state.addMoney(-cost);
    // weighted average purchase price per product for profit estimates
    const stock = this.state.stockOf(o.product);
    const prev = this.avgCost[o.product] ?? o.pricePerPallet;
    this.avgCost[o.product] = (prev * stock + o.pricePerPallet * o.pallets) / Math.max(1, stock + o.pallets);
    o.state = 'accepted';
    this.pendingSupplier = null;
    this.activeSupplier = o;
    this.resetSupplierTimer();
    this.bus.emit('supplierAccepted', { offer: o });
    this.bus.emit('truckArriving', { kind: 'supplier', orderId: o.id });
    this.bus.emit('ordersChanged', {});
    return true;
  }

  declineSupplier(id: number): void {
    if (this.pendingSupplier?.id !== id) return;
    this.pendingSupplier = null;
    this.resetSupplierTimer();
    this.bus.emit('ordersChanged', {});
  }

  canFill(o: CustomerOffer): boolean {
    return o.lines.every((l) => this.state.stockOf(l.product) >= l.pallets);
  }

  acceptCustomer(id: number): boolean {
    const o = this.pendingCustomer;
    if (!o || o.id !== id) return false;
    if (!this.canFill(o)) {
      this.bus.emit('toast', { text: 'Not enough stock!', kind: 'bad' });
      return false;
    }
    o.state = 'accepted';
    this.pendingCustomer = null;
    this.activeCustomer = o;
    this.resetCustomerTimer();
    this.bus.emit('customerAccepted', { offer: o });
    this.bus.emit('truckArriving', { kind: 'customer', orderId: o.id });
    this.bus.emit('ordersChanged', {});
    return true;
  }

  declineCustomer(id: number): void {
    if (this.pendingCustomer?.id !== id) return;
    this.pendingCustomer = null;
    this.resetCustomerTimer();
    this.bus.emit('ordersChanged', {});
  }

  // ---------- truck lifecycle (called by the 3D truck controllers) ----------

  truckDocked(kind: TruckKind): void {
    if (kind === 'supplier' && this.activeSupplier) {
      this.activeSupplier.state = 'docked';
      this.bus.emit('truckDocked', { kind, orderId: this.activeSupplier.id });
    } else if (kind === 'customer' && this.activeCustomer) {
      this.activeCustomer.state = 'docked';
      this.bus.emit('truckDocked', { kind, orderId: this.activeCustomer.id });
    }
    this.bus.emit('ordersChanged', {});
  }

  truckGone(kind: TruckKind): void {
    if (kind === 'supplier') this.activeSupplier = null;
    else this.activeCustomer = null;
    this.bus.emit('ordersChanged', {});
  }

  // ---------- pallet transactions ----------

  /** pallets of a product the active customer still needs (not counting what's on the forks) */
  customerNeed(productId: string): number {
    const c = this.activeCustomer;
    if (!c || c.state === 'done') return 0;
    const l = c.lines.find((x) => x.product === productId);
    return l ? l.pallets - l.loaded : 0;
  }

  /** player stands on UNLOAD pad with free forks; returns the product taken */
  tryUnloadPallet(): string | null {
    const o = this.activeSupplier;
    if (!o || o.state !== 'docked' || o.remaining <= 0) return null;
    o.remaining--;
    this.bus.emit('palletPicked', { from: 'truck', product: o.product });
    if (o.remaining <= 0) {
      o.state = 'done';
      this.bus.emit('deliveryComplete', { orderId: o.id });
      this.bus.emit('truckLeaving', { kind: 'supplier', orderId: o.id });
    }
    this.bus.emit('ordersChanged', {});
    return o.product;
  }

  /** player stands on LOAD pad carrying a pallet of this product */
  tryLoadPallet(productId: string): boolean {
    const o = this.activeCustomer;
    if (!o || o.state !== 'docked') return false;
    const line = o.lines.find((l) => l.product === productId && l.loaded < l.pallets);
    if (!line) return false;
    line.loaded++;
    const t = customerTotals(o);
    this.bus.emit('palletLoaded', { remaining: t.pallets - t.loaded, product: productId });
    if (t.loaded >= t.pallets) this.completeCustomerOrder();
    this.bus.emit('ordersChanged', {});
    return true;
  }

  private settle(o: CustomerOffer): { revenue: number; profit: number } {
    let revenue = 0;
    let profit = 0;
    let loaded = 0;
    for (const l of o.lines) {
      revenue += l.loaded * l.pricePerPallet;
      profit += l.loaded * (l.pricePerPallet - l.costBasisPerPallet);
      loaded += l.loaded;
    }
    if (revenue > 0) this.state.addMoney(revenue);
    this.state.addShipped(loaded);
    return { revenue, profit: Math.round(profit) };
  }

  private completeCustomerOrder(): void {
    const o = this.activeCustomer;
    if (!o) return;
    o.state = 'done';
    const fast = o.deadline > o.deadlineTotal * economy.customer.fastDeliveryFraction;
    const { revenue, profit } = this.settle(o);
    if (fast) this.state.addReputation(economy.customer.fastDeliveryRepBonus);
    this.bus.emit('orderShipped', { orderId: o.id, revenue, profit, fast });
    this.bus.emit('truckLeaving', { kind: 'customer', orderId: o.id });
  }

  private missCustomerOrder(): void {
    const o = this.activeCustomer;
    if (!o) return;
    o.state = 'done';
    this.settle(o);
    this.state.addReputation(-economy.customer.missedRepPenalty);
    this.bus.emit('orderMissed', { orderId: o.id });
    this.bus.emit('truckLeaving', { kind: 'customer', orderId: o.id });
    this.bus.emit('ordersChanged', {});
  }

  /** productName helper for UI strings */
  static productName(id: string): string {
    return product(id).name;
  }
}
