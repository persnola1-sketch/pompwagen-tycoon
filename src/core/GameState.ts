import economy from '../config/economy.json';
import layout from '../config/layout.json';
import { EventBus } from './EventBus';
import { PRODUCTS, ProductDef, unlockedProducts } from './Products';

export const SAVE_VERSION = 3;
export const TOTAL_SLOTS = layout.rackRows.rows.length * layout.rackRows.slotsPerRow;

export interface Stats {
  shipped: number;
  earned: number;
  spent: number;
}

export interface SaveData {
  version: number;
  money: number;
  reputation: number;
  rackRows: number;
  /** product id per global slot index, null = empty */
  slots: (string | null)[];
  electric: boolean;
  speedLevel: number;
  tutorialDone: boolean;
  /** false on a fresh game: the player starts on an empty plot */
  warehouseBuilt: boolean;
  padProgress: Record<string, number>;
  stats: Stats;
}

export class GameState {
  money: number = economy.startMoney;
  reputation: number = economy.reputation.start;
  rackRows: number = layout.rackRows.startRows;
  slots: (string | null)[] = new Array(TOTAL_SLOTS).fill(null);
  electric = false;
  speedLevel = 0;
  tutorialDone = false;
  warehouseBuilt = false;
  padProgress: Record<string, number> = {};
  stats: Stats = { shipped: 0, earned: 0, spent: 0 };

  constructor(private bus: EventBus) {}

  get capacity(): number {
    return this.rackRows * layout.rackRows.slotsPerRow;
  }

  /** pallets in built racks, optionally of one product */
  stockOf(productId?: string): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (s && (!productId || s === productId)) n++;
    }
    return n;
  }

  get stock(): number {
    return this.stockOf();
  }

  get freeSpace(): number {
    return this.capacity - this.stock;
  }

  get stageIndex(): number {
    return this.electric ? 1 : 0;
  }

  get unlocked(): ProductDef[] {
    return unlockedProducts(this.stats.shipped);
  }

  addMoney(delta: number): void {
    this.money += delta;
    if (delta > 0) this.stats.earned += delta;
    else this.stats.spent -= delta;
    this.bus.emit('moneyChanged', { money: this.money, delta });
  }

  addReputation(delta: number): void {
    const { min, max } = economy.reputation;
    this.reputation = Math.max(min, Math.min(max, this.reputation + delta));
    this.bus.emit('reputationChanged', { rep: this.reputation });
  }

  /** count shipped pallets and announce products that just unlocked */
  addShipped(n: number): void {
    const before = this.stats.shipped;
    this.stats.shipped += n;
    for (const p of PRODUCTS) {
      if (p.unlockShipped > before && p.unlockShipped <= this.stats.shipped) {
        this.bus.emit('productUnlocked', { product: p.id });
      }
    }
  }

  setSlot(index: number, productId: string | null): void {
    this.slots[index] = productId;
    this.bus.emit('stockChanged', { stock: this.stock, capacity: this.capacity });
  }

  toSave(): SaveData {
    return {
      version: SAVE_VERSION,
      money: this.money,
      reputation: this.reputation,
      rackRows: this.rackRows,
      slots: [...this.slots],
      electric: this.electric,
      speedLevel: this.speedLevel,
      tutorialDone: this.tutorialDone,
      warehouseBuilt: this.warehouseBuilt,
      padProgress: { ...this.padProgress },
      stats: { ...this.stats },
    };
  }

  loadFrom(d: SaveData): void {
    this.money = d.money;
    this.reputation = d.reputation;
    this.rackRows = Math.max(layout.rackRows.startRows, Math.min(layout.rackRows.rows.length, d.rackRows));
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = d.slots[i] ?? null;
    this.electric = d.electric;
    this.speedLevel = Math.min(d.speedLevel, economy.payPads.speedUpgrade.costs.length);
    this.tutorialDone = d.tutorialDone;
    // saves from before the plot intro already have a warehouse
    this.warehouseBuilt = d.warehouseBuilt ?? true;
    this.padProgress = d.padProgress ?? {};
    this.stats = d.stats ?? { shipped: 0, earned: 0, spent: 0 };
  }
}
