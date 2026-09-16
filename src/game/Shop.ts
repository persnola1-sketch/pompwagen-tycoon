import shopCfg from '../config/shop.json';
import economy from '../config/economy.json';
import layout from '../config/layout.json';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Timers } from '../core/Timers';
import { PRODUCTS, product } from '../core/Products';
import { Workers } from '../core/workers/Workers';
import { rowLetter } from '../world/Racks';

export interface ShopItem {
  id: string;
  tab: string;
  name: string;
  desc: string;
  icon: string;
  kind: string;
  level: number;
  price?: number;
  dynamic?: string;
  product?: string;
}

export interface ShopEntry {
  item: ShopItem;
  price: number;
  /** extra line under the description, e.g. "Row C · builds in 30 s" */
  note: string;
  locked: boolean;
  owned: boolean;
  busy: boolean;
  affordable: boolean;
  /** why it cannot be bought right now */
  reason: string;
}

const PP = economy.payPads;
export const SHOP_ITEMS: ShopItem[] = shopCfg.items as ShopItem[];
export const SHOP_TABS = shopCfg.tabs;

const secs = (n: number): string => (n >= 60 ? `${Math.round(n / 60)} min` : `${Math.round(n)} s`);

/**
 * The shop: prices, company-level gates and what each item does when bought.
 * Everything that takes time starts a construction or delivery job, so buying
 * here behaves exactly like paying at a floor pad.
 */
export class Shop {
  /** set by the game: extra handlers that need world objects */
  onProduct: ((id: string) => void) | null = null;
  onTemp: ((free: boolean) => void) | null = null;
  onRush: ((free: boolean) => void) | null = null;
  onFinishAll: (() => void) | null = null;
  onCosmetic: ((kind: string) => void) | null = null;

  constructor(private state: GameState, private bus: EventBus, private timers: Timers, private workers: Workers) {}

  /** the next rack row that can be built, or -1 */
  private nextRow(): number {
    let row = this.state.rackRows;
    while (row < layout.rackRows.rows.length && this.timers.has('rackRow', row)) row++;
    return row < layout.rackRows.rows.length && PP.rackRowCosts[row - layout.rackRows.startRows] !== undefined ? row : -1;
  }

  private nextUpper(): { row: number; level: number } | null {
    let best = -1;
    for (let r = 0; r < this.state.rackRows; r++) {
      if (this.timers.has('upperLevel', r)) continue;
      if (this.state.upperLevels[r] >= layout.rackRows.levels - 1) continue;
      if (best < 0 || this.state.upperLevels[r] < this.state.upperLevels[best]) best = r;
    }
    return best < 0 ? null : { row: best, level: this.state.upperLevels[best] + 1 };
  }

  /** price, availability and the note shown on a card */
  entry(item: ShopItem): ShopEntry {
    const s = this.state;
    let price = item.price ?? 0;
    let note = '';
    let owned = false;
    let busy = false;
    let reason = '';

    switch (item.dynamic) {
      case 'electric':
        price = PP.electricPompwagen;
        owned = s.electric;
        busy = this.timers.has('electric');
        note = `Delivered in ${secs(this.timers.deliverySeconds('electric'))}`;
        break;
      case 'forklift':
        price = PP.forklift;
        owned = s.forklift;
        busy = this.timers.has('forklift');
        note = `Delivered in ${secs(this.timers.deliverySeconds('forklift'))}`;
        break;
      case 'speed': {
        const lvl = s.speedLevel;
        owned = lvl >= PP.speedUpgrade.costs.length;
        price = owned ? 0 : PP.speedUpgrade.costs[lvl];
        note = owned ? 'Fully upgraded' : `Level ${lvl + 1} of ${PP.speedUpgrade.costs.length} · instant`;
        break;
      }
      case 'beltSpeed': {
        const lvl = s.conveyorSpeedLevel;
        owned = lvl >= layout.conveyors.maxSpeedLevel;
        price = 1800 + lvl * 1400;
        note = owned ? 'Fully upgraded' : `Level ${lvl + 1} of ${layout.conveyors.maxSpeedLevel} · instant`;
        if (!s.conveyorIn && !s.conveyorOut) reason = 'Build a conveyor first';
        break;
      }
      case 'rackRow': {
        const row = this.nextRow();
        owned = row < 0;
        price = row < 0 ? 0 : PP.rackRowCosts[row - layout.rackRows.startRows];
        note = row < 0 ? 'Every row is built' : `Row ${rowLetter(row)} · builds in ${secs(this.timers.constructionSeconds('rackRow', row - layout.rackRows.startRows))}`;
        break;
      }
      case 'upperLevel': {
        const up = this.nextUpper();
        owned = !up;
        price = up ? PP.upperLevelCosts[up.level - 1] ?? 0 : 0;
        note = up ? `Row ${rowLetter(up.row)} level ${up.level + 1} · builds in ${secs(this.timers.constructionSeconds('upperLevel'))}` : 'Every row is stacked';
        if (!s.forklift) reason = 'Needs the forklift';
        break;
      }
      case 'conveyorIn':
      case 'conveyorOut': {
        const isIn = item.dynamic === 'conveyorIn';
        owned = isIn ? s.conveyorIn : s.conveyorOut;
        busy = this.timers.has(isIn ? 'conveyorIn' : 'conveyorOut');
        price = isIn ? PP.conveyorIn : PP.conveyorOut;
        note = `Builds in ${secs(this.timers.constructionSeconds(isIn ? 'conveyorIn' : 'conveyorOut'))}`;
        break;
      }
      default:
        break;
    }

    switch (item.kind) {
      case 'secondDock':
        owned = s.secondDock;
        busy = this.timers.has('secondDock');
        note = `Builds in ${secs(this.timers.constructionSeconds('secondDock'))}`;
        break;
      case 'coffeeMachine':
        owned = this.workers.coffeeMachine;
        busy = this.timers.has('coffeeMachine');
        note = `Builds in ${secs(this.timers.constructionSeconds('coffeeMachine'))}`;
        break;
      case 'canteen':
        owned = this.workers.canteen;
        busy = this.timers.has('canteen');
        note = `Builds in ${secs(this.timers.constructionSeconds('canteen'))}`;
        break;
      case 'lighting':
        owned = s.lighting;
        busy = this.timers.has('lighting');
        note = `Builds in ${secs(this.timers.constructionSeconds('lighting'))}`;
        break;
      case 'product': {
        const p = product(item.product!);
        owned = s.unlocked.some((u) => u.id === p.id);
        note = owned ? 'Trading now' : `Or ship ${Math.max(0, p.unlockShipped - s.stats.shipped)} more pallets`;
        break;
      }
      case 'temp':
      case 'tempAd':
        note = 'Five extra minutes of help';
        break;
      case 'rush':
      case 'rushAd':
        note = `${shopCfg.rushBoost.seconds} seconds of speed`;
        break;
      case 'finishAd':
        note = this.timers.jobs.length ? `${this.timers.jobs.length} job(s) running` : 'Nothing is building';
        if (!this.timers.jobs.length) reason = 'Nothing to finish';
        break;
      case 'soon':
        note = 'Coming in a later update';
        reason = 'Coming soon';
        break;
      default:
        break;
    }

    const locked = s.companyLevel < item.level;
    if (locked) reason = `Company level ${item.level}`;
    return {
      item,
      price,
      note,
      locked,
      owned,
      busy,
      affordable: s.money >= price,
      reason,
    };
  }

  entries(tab: string): ShopEntry[] {
    return SHOP_ITEMS.filter((i) => i.tab === tab).map((i) => this.entry(i));
  }

  /** anything the player could buy right now (for the shop badge) */
  get affordableCount(): number {
    return SHOP_ITEMS.map((i) => this.entry(i)).filter((e) => !e.locked && !e.owned && !e.busy && !e.reason && e.affordable && e.price > 0).length;
  }

  /** attempt a purchase; returns false with a toast when it cannot happen */
  buy(id: string): boolean {
    const item = SHOP_ITEMS.find((i) => i.id === id);
    if (!item) return false;
    const e = this.entry(item);
    if (e.locked || e.owned || e.busy || e.reason) {
      this.bus.emit('toast', { text: e.reason || 'Already yours', kind: 'info' });
      return false;
    }
    const free = e.price === 0;
    if (!free && !e.affordable) {
      this.bus.emit('toast', { text: 'Not enough money!', kind: 'bad' });
      return false;
    }
    if (!free) this.state.addMoney(-e.price);

    switch (item.kind) {
      case 'vehicle':
        this.timers.start('delivery', item.dynamic!, 0, item.name);
        this.bus.emit('toast', { text: `${item.name} ordered — the truck is on its way`, kind: 'good' });
        break;
      case 'speed':
        this.state.speedLevel++;
        this.bus.emit('upgradeBought', { upgrade: 'speed' });
        this.bus.emit('toast', { text: `Faster wheels — level ${this.state.speedLevel}!`, kind: 'good' });
        break;
      case 'conveyorSpeed':
        this.state.conveyorSpeedLevel++;
        this.bus.emit('upgradeBought', { upgrade: 'beltSpeed' });
        this.bus.emit('toast', { text: `Belts now run at level ${this.state.conveyorSpeedLevel}`, kind: 'good' });
        break;
      case 'rackRow': {
        const row = this.nextRow();
        this.timers.start('construction', 'rackRow', row, `Rack row ${rowLetter(row)}`, this.timers.constructionSeconds('rackRow', row - layout.rackRows.startRows));
        break;
      }
      case 'upperLevel': {
        const up = this.nextUpper()!;
        this.timers.start('construction', 'upperLevel', up.row, `Rack level ${up.level + 1} · row ${rowLetter(up.row)}`);
        break;
      }
      case 'conveyor':
        this.timers.start('construction', item.dynamic!, 0, item.name);
        break;
      case 'secondDock':
      case 'coffeeMachine':
      case 'canteen':
      case 'lighting':
        this.timers.start('construction', item.kind, 0, item.name);
        break;
      case 'product':
        this.onProduct?.(item.product!);
        break;
      case 'temp':
        this.onTemp?.(false);
        break;
      case 'tempAd':
        this.onTemp?.(true);
        break;
      case 'rush':
        this.onRush?.(false);
        break;
      case 'rushAd':
        this.onRush?.(true);
        break;
      case 'finishAd':
        this.onFinishAll?.();
        break;
      case 'company':
      case 'vest':
      case 'paint':
      case 'walls':
        this.onCosmetic?.(item.kind);
        break;
      default:
        break;
    }
    this.bus.emit('shopChanged', {});
    return true;
  }

  /** products the player has bought a licence for, on top of the shipped unlocks */
  static allProducts(): typeof PRODUCTS {
    return PRODUCTS;
  }
}
