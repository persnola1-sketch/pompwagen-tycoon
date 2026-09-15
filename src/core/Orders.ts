import economy from '../config/economy.json';
import names from '../config/names.json';
import { CustomerOffer, EventBus, SupplierOffer, TruckKind } from './EventBus';
import { GameState } from './GameState';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Owns the full order lifecycle: random offer generation, accept/decline,
 * truck dock notifications, unload/load pallet transactions, deadlines.
 * Pure logic — the 3D truck controllers react to the events this emits.
 */
export class Orders {
  /** random generation off during tutorial */
  auto = false;

  pendingSupplier: SupplierOffer | null = null;
  pendingCustomer: CustomerOffer | null = null;
  activeSupplier: SupplierOffer | null = null;
  activeCustomer: CustomerOffer | null = null;

  private nextId = 1;
  private supplierTimer = rand(economy.supplier.offerIntervalMin, economy.supplier.offerIntervalMax) * 0.4;
  private customerTimer = rand(economy.customer.offerIntervalMin, economy.customer.offerIntervalMax);
  private avgCost = economy.supplier.priceMin;

  constructor(private state: GameState, private bus: EventBus) {}

  update(dt: number): void {
    if (this.auto) {
      if (!this.pendingSupplier && !this.activeSupplier) {
        this.supplierTimer -= dt;
        if (this.supplierTimer <= 0) this.generateSupplierOffer();
      }
      if (!this.pendingCustomer && !this.activeCustomer) {
        this.customerTimer -= dt;
        if (this.customerTimer <= 0) this.generateCustomerOffer();
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
    let pallets = randInt(s.supplierMin, s.supplierMax);
    let price = Math.round(rand(economy.supplier.priceMin, economy.supplier.priceMax));
    pallets = Math.min(pallets, Math.max(1, this.state.freeSpace));
    // soft-lock rescue: with empty racks, always offer something affordable
    if (this.state.stock === 0) {
      const maxAfford = Math.floor(this.state.money / price);
      if (maxAfford >= 2) {
        pallets = Math.min(pallets, maxAfford);
      } else {
        pallets = 2;
        price = Math.max(0, Math.floor(this.state.money / 2));
      }
    }
    this.offerSupplier({
      supplier: pick(names.suppliers),
      pallets,
      pricePerPallet: price,
      free: price === 0,
    });
  }

  private generateCustomerOffer(): void {
    const s = this.stage();
    const stock = this.state.stock;
    if (stock <= 0) {
      this.customerTimer = 6;
      return;
    }
    // usually fillable, sometimes bigger than stock so declining is a real decision
    let pallets = randInt(s.customerMin, s.customerMax);
    if (Math.random() < 0.8) pallets = Math.min(pallets, stock);
    pallets = Math.max(1, pallets);
    const repBonus = 1 + this.state.reputation * economy.reputation.priceBonusPerStar;
    this.offerCustomer({
      store: pick(names.stores),
      pallets,
      pricePerPallet: Math.round(rand(economy.customer.priceMin, economy.customer.priceMax) * repBonus),
    });
  }

  offerSupplier(o: { supplier: string; pallets: number; pricePerPallet: number; free: boolean }): void {
    const offer: SupplierOffer = {
      id: this.nextId++,
      supplier: o.supplier,
      product: names.product.name,
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

  offerCustomer(o: { store: string; pallets: number; pricePerPallet: number }): void {
    const total = economy.customer.deadlineBase + economy.customer.deadlinePerPallet * o.pallets;
    const offer: CustomerOffer = {
      id: this.nextId++,
      store: o.store,
      product: names.product.name,
      pallets: o.pallets,
      pricePerPallet: o.pricePerPallet,
      costBasisPerPallet: this.avgCost,
      expiresIn: economy.customer.offerExpiry,
      deadline: total,
      deadlineTotal: total,
      loaded: 0,
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
    if (o.pallets > 0) {
      // weighted average purchase price for profit estimates
      const stock = this.state.stock + (this.activeSupplier?.remaining ?? 0);
      this.avgCost = (this.avgCost * stock + o.pricePerPallet * o.pallets) / Math.max(1, stock + o.pallets);
    }
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

  acceptCustomer(id: number): boolean {
    const o = this.pendingCustomer;
    if (!o || o.id !== id) return false;
    if (this.state.stock < o.pallets) {
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

  /** player stands on UNLOAD pad with free forks */
  tryUnloadPallet(): boolean {
    const o = this.activeSupplier;
    if (!o || o.state !== 'docked' || o.remaining <= 0) return false;
    o.remaining--;
    this.bus.emit('palletPicked', { from: 'truck' });
    if (o.remaining <= 0) {
      o.state = 'done';
      this.bus.emit('deliveryComplete', { orderId: o.id });
      this.bus.emit('truckLeaving', { kind: 'supplier', orderId: o.id });
    }
    this.bus.emit('ordersChanged', {});
    return true;
  }

  /** player stands on LOAD pad while carrying */
  tryLoadPallet(): boolean {
    const o = this.activeCustomer;
    if (!o || o.state !== 'docked' || o.loaded >= o.pallets) return false;
    o.loaded++;
    this.bus.emit('palletLoaded', { remaining: o.pallets - o.loaded });
    if (o.loaded >= o.pallets) this.completeCustomerOrder();
    this.bus.emit('ordersChanged', {});
    return true;
  }

  private completeCustomerOrder(): void {
    const o = this.activeCustomer;
    if (!o) return;
    o.state = 'done';
    const revenue = o.loaded * o.pricePerPallet;
    const profit = Math.round(revenue - o.loaded * o.costBasisPerPallet);
    const fast = o.deadline > o.deadlineTotal * economy.customer.fastDeliveryFraction;
    this.state.addMoney(revenue);
    this.state.stats.shipped += o.loaded;
    if (fast) this.state.addReputation(economy.customer.fastDeliveryRepBonus);
    this.bus.emit('orderShipped', { orderId: o.id, revenue, profit, fast });
    this.bus.emit('truckLeaving', { kind: 'customer', orderId: o.id });
  }

  private missCustomerOrder(): void {
    const o = this.activeCustomer;
    if (!o) return;
    o.state = 'done';
    const revenue = o.loaded * o.pricePerPallet;
    if (revenue > 0) this.state.addMoney(revenue);
    this.state.addReputation(-economy.customer.missedRepPenalty);
    this.bus.emit('orderMissed', { orderId: o.id });
    this.bus.emit('truckLeaving', { kind: 'customer', orderId: o.id });
    this.bus.emit('ordersChanged', {});
  }
}
