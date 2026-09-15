import economy from '../config/economy.json';
import layout from '../config/layout.json';
import { EventBus } from './EventBus';

export interface SaveData {
  version: number;
  money: number;
  reputation: number;
  rackRows: number;
  /** slot occupancy per global slot index */
  slots: boolean[];
  electric: boolean;
  speedLevel: number;
  secondDock: boolean;
  tutorialDone: boolean;
  padProgress: Record<string, number>;
  stats: { shipped: number; earned: number; spent: number };
}

export class GameState {
  money: number;
  reputation: number;
  rackRows: number;
  slots: boolean[];
  electric = false;
  speedLevel = 0;
  secondDock = false;
  tutorialDone = false;
  padProgress: Record<string, number> = {};
  stats = { shipped: 0, earned: 0, spent: 0 };
  /** pallets currently on the forks */
  carrying = 0;

  constructor(private bus: EventBus) {
    this.money = economy.startMoney;
    this.reputation = economy.reputation.start;
    this.rackRows = layout.rackRows.startRows;
    this.slots = new Array(layout.rackRows.maxRows * layout.rackRows.slotsPerRow).fill(false);
  }

  get capacity(): number {
    return this.rackRows * layout.rackRows.slotsPerRow;
  }

  get stock(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.slots[i]) n++;
    return n;
  }

  get freeSpace(): number {
    return this.capacity - this.stock;
  }

  get stageIndex(): number {
    return this.electric ? 1 : 0;
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

  /** find first free slot in built rows, or -1 */
  firstFreeSlot(): number {
    for (let i = 0; i < this.capacity; i++) if (!this.slots[i]) return i;
    return -1;
  }

  setSlot(index: number, occupied: boolean): void {
    this.slots[index] = occupied;
    this.bus.emit('stockChanged', { stock: this.stock, capacity: this.capacity });
  }

  toSave(): SaveData {
    return {
      version: 1,
      money: this.money,
      reputation: this.reputation,
      rackRows: this.rackRows,
      slots: [...this.slots],
      electric: this.electric,
      speedLevel: this.speedLevel,
      secondDock: this.secondDock,
      tutorialDone: this.tutorialDone,
      padProgress: { ...this.padProgress },
      stats: { ...this.stats },
    };
  }

  loadFrom(d: SaveData): void {
    this.money = d.money;
    this.reputation = d.reputation;
    this.rackRows = d.rackRows;
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = !!d.slots[i];
    this.electric = d.electric;
    this.speedLevel = d.speedLevel;
    this.secondDock = d.secondDock;
    this.tutorialDone = d.tutorialDone;
    this.padProgress = d.padProgress ?? {};
    this.stats = d.stats ?? { shipped: 0, earned: 0, spent: 0 };
  }
}
