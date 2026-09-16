import cfg from '../config/quests.json';
import { CLIENTS } from './Brands';
import { EventBus } from './EventBus';
import { GameState } from './GameState';
import { Orders } from './Orders';
import { Quests } from './quests/Quests';

const E = cfg.events;

export interface EventType {
  id: string;
  title: string;
  desc: string;
  emoji: string;
  seconds: number;
  weight: number;
  intervalFactor?: number;
  priceFactor?: number;
  supplierPriceFactor?: number;
  pallets?: number;
  minPallets?: number;
  maxPallets?: number;
  money?: number;
  xp?: number;
  rep?: number;
}

export interface ActiveEvent {
  type: EventType;
  title: string;
  desc: string;
  left: number;
}

export interface EventsSave {
  timer: number;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Random events that shake up the shift: rush hour (more orders, better
 * prices), a surprise inspection (clean up the fallen pallets), a VIP client
 * (big timed order at double pay) and a late supplier (discounted delivery).
 * World-side work — spawning fallen pallets — happens through `onInspection`.
 */
export class Events {
  active: ActiveEvent | null = null;
  private timer = E.firstDelaySeconds;
  /** called with the number of pallets an inspection should scatter */
  onInspection: ((pallets: number) => void) | null = null;
  /** returns how many fallen pallets are still on the floor */
  fallenCount: (() => number) | null = null;
  private inspectionTarget = 0;

  constructor(private state: GameState, private orders: Orders, private quests: Quests, private bus: EventBus) {}

  private reset(): void {
    this.timer = E.intervalMinSeconds + Math.random() * (E.intervalMaxSeconds - E.intervalMinSeconds);
  }

  /** start a specific event (dev panel) or a random one */
  trigger(id?: string): void {
    if (this.active) return;
    const types = E.types as EventType[];
    const type = id ? types.find((t) => t.id === id) ?? types[0] : this.weighted(types);
    let title = `${type.emoji} ${type.title}`;
    let desc = type.desc;

    if (type.intervalFactor) this.orders.intervalFactor = type.intervalFactor;
    if (type.priceFactor && type.id === 'rush') this.orders.priceFactor = type.priceFactor;
    if (type.supplierPriceFactor) this.orders.supplierPriceFactor = type.supplierPriceFactor;
    desc = desc.replace('{bonus}', String(Math.round(((type.priceFactor ?? 1) - 1) * 100)));

    if (type.id === 'inspection') {
      const n = type.pallets ?? 3;
      this.onInspection?.(n);
      this.inspectionTarget = this.fallenCount?.() ?? n;
    }

    if (type.id === 'vip') {
      const products = this.state.unlocked;
      const product = pick(products);
      const client = pick(CLIENTS);
      const store = client.name;
      const pallets = Math.min(
        Math.max(type.minPallets ?? 6, Math.round((type.minPallets ?? 6) + Math.random() * ((type.maxPallets ?? 12) - (type.minPallets ?? 6)))),
        Math.max(3, this.state.capacity),
      );
      desc = desc.replace('{store}', store).replace('{target}', String(pallets)).replace('{product}', product.name);
      this.quests.addClientQuest(
        {
          id: `vip-${Date.now()}`,
          title: `${store}: ${pallets}× ${product.name}`,
          desc: `Ship ${pallets} pallets of ${product.name} before the deadline`,
          metric: 'shipped',
          target: pallets,
          money: type.money ?? 500,
          xp: type.xp ?? 150,
        },
        type.seconds,
      );
      // a matching order lands straight away at double pay
      this.orders.offerCustomer({
        store,
        clientId: client.id,
        lines: [
          {
            product: product.id,
            pallets: Math.min(pallets, Math.max(1, this.state.stockOf(product.id))),
            pricePerPallet: Math.round(((product.sellMin + product.sellMax) / 2) * (type.priceFactor ?? 2)),
          },
        ],
      });
      title = `${type.emoji} VIP: ${store}`;
    }

    this.active = { type, title, desc, left: type.seconds };
    this.bus.emit('eventStarted', { id: type.id, title, desc, seconds: type.seconds });
  }

  private weighted(types: EventType[]): EventType {
    const total = types.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of types) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return types[types.length - 1];
  }

  private end(success: boolean): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.orders.intervalFactor = 1;
    this.orders.priceFactor = 1;
    if (a.type.id !== 'late') this.orders.supplierPriceFactor = 1;
    if (a.type.id === 'inspection' && success) {
      this.state.addMoney(a.type.money ?? 0);
      if (a.type.rep) this.state.addReputation(a.type.rep);
      this.bus.emit('toast', { text: `Inspection passed! +€${a.type.money ?? 0}`, kind: 'good' });
    }
    this.bus.emit('eventEnded', { id: a.type.id, success });
    this.reset();
  }

  update(dt: number): void {
    if (this.active) {
      this.active.left -= dt;
      if (this.active.type.id === 'inspection' && (this.fallenCount?.() ?? 0) === 0 && this.inspectionTarget > 0) {
        this.end(true);
        return;
      }
      if (this.active.left <= 0) this.end(false);
      return;
    }
    if (this.state.companyLevel < E.minCompanyLevel || !this.state.tutorialDone) return;
    this.timer -= dt;
    if (this.timer <= 0) this.trigger();
  }

  toSave(): EventsSave {
    return { timer: this.timer };
  }

  loadFrom(s: EventsSave | undefined): void {
    if (s) this.timer = Math.max(30, s.timer ?? E.firstDelaySeconds);
  }
}
