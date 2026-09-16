import economy from '../config/economy.json';
import layout from '../config/layout.json';
import { EventBus } from './EventBus';
import { PRODUCTS, ProductDef } from './Products';

export const SAVE_VERSION = 3;
const R = layout.rackRows;
export const PER_ROW = R.slotsPerRow;
export const ROWS = R.rows.length;
export const LEVELS = R.levels;
/** slots on one level across all rows; upper levels come after in the slot array */
export const ROW_SLOTS = ROWS * PER_ROW;
export const TOTAL_SLOTS = ROW_SLOTS * LEVELS;

export function slotLevel(i: number): number {
  return Math.floor(i / ROW_SLOTS);
}
export function slotRow(i: number): number {
  return Math.floor((i % ROW_SLOTS) / PER_ROW);
}
export function slotCol(i: number): number {
  return i % PER_ROW;
}
export function slotIndex(row: number, col: number, level: number): number {
  return level * ROW_SLOTS + row * PER_ROW + col;
}

export interface Stats {
  shipped: number;
  earned: number;
  spent: number;
  /** pallets moved by workers */
  workerMoved: number;
  ordersDone: number;
  ordersOnTime: number;
  unloaded: number;
}

export const EMPTY_STATS: Stats = { shipped: 0, earned: 0, spent: 0, workerMoved: 0, ordersDone: 0, ordersOnTime: 0, unloaded: 0 };

export interface Cosmetics {
  companyName: string;
  logoMark: string;
  logoColor: string;
  vest: string;
  paint: string;
  walls: string;
}

export const DEFAULT_COSMETICS: Cosmetics = {
  companyName: 'Pompwagen BV',
  logoMark: 'box',
  logoColor: '#ff7a1a',
  vest: '#ff7a1a',
  paint: '#d9651f',
  walls: '#dde3ea',
};

export interface Settings {
  henkTips: boolean;
  sound: boolean;
  music: boolean;
}

export const DEFAULT_SETTINGS: Settings = { henkTips: true, sound: true, music: true };

export interface SaveData {
  version: number;
  settings?: Settings;
  tipsSeen?: string[];
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
  forklift?: boolean;
  vehicle?: string;
  conveyorIn?: boolean;
  conveyorOut?: boolean;
  conveyorSpeedLevel?: number;
  companyXp?: number;
  companyLevel?: number;
  secondDock?: boolean;
  lighting?: boolean;
  licences?: string[];
  cosmetics?: Cosmetics;
  /** unlocked upper levels per rack row (0–2) */
  upperLevels?: number[];
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
  settings: Settings = { ...DEFAULT_SETTINGS };
  tipsSeen: string[] = [];
  padProgress: Record<string, number> = {};
  forklift = false;
  vehicle: 'pompwagen' | 'forklift' = 'pompwagen';
  conveyorIn = false;
  conveyorOut = false;
  conveyorSpeedLevel = 0;
  companyXp = 0;
  companyLevel = 1;
  secondDock = false;
  lighting = false;
  /** products unlocked by buying a licence in the shop */
  licences: string[] = [];
  cosmetics: Cosmetics = { ...DEFAULT_COSMETICS };
  upperLevels: number[] = new Array(ROWS).fill(0);
  stats: Stats = { ...EMPTY_STATS };

  constructor(private bus: EventBus) {}

  get capacity(): number {
    let n = 0;
    for (let r = 0; r < this.rackRows; r++) n += PER_ROW * (1 + this.upperLevels[r]);
    return n;
  }

  /** a slot in a built row on an unlocked level */
  slotUnlocked(i: number): boolean {
    const row = slotRow(i);
    return row < this.rackRows && slotLevel(i) <= this.upperLevels[row];
  }

  /** pallets in built racks, optionally of one product */
  stockOf(productId?: string): number {
    let n = 0;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const s = this.slots[i];
      if (s && (!productId || s === productId) && this.slotUnlocked(i)) n++;
    }
    return n;
  }

  /** highest number of levels unlocked in any row (1–3) */
  get maxLevels(): number {
    let m = 1;
    for (let r = 0; r < this.rackRows; r++) m = Math.max(m, 1 + this.upperLevels[r]);
    return m;
  }

  get stock(): number {
    return this.stockOf();
  }

  get freeSpace(): number {
    return this.capacity - this.stock;
  }

  get stageIndex(): number {
    return this.forklift ? 2 : this.electric ? 1 : 0;
  }

  get unlocked(): ProductDef[] {
    return PRODUCTS.filter((p) => this.stats.shipped >= p.unlockShipped || this.licences.includes(p.id));
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
      forklift: this.forklift,
      vehicle: this.vehicle,
      conveyorIn: this.conveyorIn,
      conveyorOut: this.conveyorOut,
      conveyorSpeedLevel: this.conveyorSpeedLevel,
      companyXp: this.companyXp,
      companyLevel: this.companyLevel,
      secondDock: this.secondDock,
      lighting: this.lighting,
      licences: [...this.licences],
      cosmetics: { ...this.cosmetics },
      upperLevels: [...this.upperLevels],
      settings: { ...this.settings },
      tipsSeen: [...this.tipsSeen],
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
    this.settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) };
    this.tipsSeen = d.tipsSeen ?? [];
    this.padProgress = d.padProgress ?? {};
    this.stats = { ...EMPTY_STATS, ...(d.stats ?? {}) };
    this.forklift = d.forklift ?? false;
    this.conveyorIn = d.conveyorIn ?? false;
    this.conveyorOut = d.conveyorOut ?? false;
    this.conveyorSpeedLevel = d.conveyorSpeedLevel ?? 0;
    this.companyXp = d.companyXp ?? 0;
    this.companyLevel = Math.max(1, d.companyLevel ?? 1);
    this.secondDock = d.secondDock ?? false;
    this.lighting = d.lighting ?? false;
    this.licences = d.licences ?? [];
    this.cosmetics = { ...DEFAULT_COSMETICS, ...(d.cosmetics ?? {}) };
    this.vehicle = d.vehicle === 'forklift' && this.forklift ? 'forklift' : 'pompwagen';
    this.upperLevels = new Array(ROWS).fill(0).map((_, i) => Math.min(LEVELS - 1, d.upperLevels?.[i] ?? 0));
  }
}
