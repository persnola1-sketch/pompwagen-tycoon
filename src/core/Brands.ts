import cfg from '../config/brands.json';
import { EventBus } from './EventBus';

export interface Brand {
  id: string;
  name: string;
  color: string;
  accent: string;
  mark: string;
  contact: string;
  favourites?: string[];
  products?: string[];
}

export interface LoyaltyLevel {
  id: string;
  name: string;
  emoji: string;
  at: number;
  priceBonus: number;
}

export interface ClientRecord {
  points: number;
  orders: number;
  onTime: number;
  missed: number;
  pallets: number;
  spent: number;
}

export interface BrandsSave {
  clients: Record<string, ClientRecord>;
}

export const CLIENTS: Brand[] = cfg.clients;
export const SUPPLIERS: Brand[] = cfg.suppliers;
export const LEVELS: LoyaltyLevel[] = cfg.loyalty.levels;

const byName = new Map<string, Brand>([...CLIENTS, ...SUPPLIERS].map((b) => [b.name, b]));
const byId = new Map<string, Brand>([...CLIENTS, ...SUPPLIERS].map((b) => [b.id, b]));

export function brandByName(name: string): Brand | undefined {
  return byName.get(name);
}

export function brand(id: string): Brand | undefined {
  return byId.get(id);
}

/** suppliers that carry a product */
export function suppliersFor(productId: string): Brand[] {
  const list = SUPPLIERS.filter((s) => s.products?.includes(productId));
  return list.length ? list : SUPPLIERS;
}

/** clients that like a product, or everyone if nobody does */
export function clientsFor(productId: string): Brand[] {
  const list = CLIENTS.filter((c) => c.favourites?.includes(productId));
  return list.length ? list : CLIENTS;
}

const EMPTY: ClientRecord = { points: 0, orders: 0, onTime: 0, missed: 0, pallets: 0, spent: 0 };

/**
 * Client relationships: every completed order on time raises loyalty, every
 * missed deadline lowers it. Higher loyalty means the client pays more, and
 * their card shows their history.
 */
export class Loyalty {
  private records = new Map<string, ClientRecord>();

  constructor(private bus: EventBus) {}

  record(id: string): ClientRecord {
    let r = this.records.get(id);
    if (!r) {
      r = { ...EMPTY };
      this.records.set(id, r);
    }
    return r;
  }

  level(id: string): LoyaltyLevel {
    const p = this.record(id).points;
    let lvl = LEVELS[0];
    for (const l of LEVELS) if (p >= l.at) lvl = l;
    return lvl;
  }

  /** extra fraction a loyal client pays per pallet */
  bonus(id: string): number {
    return this.level(id).priceBonus;
  }

  /** points still needed for the next level, or null at the top */
  toNext(id: string): { need: number; next: LoyaltyLevel } | null {
    const p = this.record(id).points;
    const next = LEVELS.find((l) => l.at > p);
    return next ? { need: next.at - p, next } : null;
  }

  finishOrder(id: string, onTime: boolean, pallets: number, revenue: number): void {
    const r = this.record(id);
    const before = this.level(id).id;
    r.orders++;
    r.pallets += pallets;
    r.spent += revenue;
    if (onTime) {
      r.onTime++;
      r.points += cfg.loyalty.onTimePoints;
    } else {
      r.missed++;
      r.points = Math.max(0, r.points + cfg.loyalty.missedPoints);
    }
    const after = this.level(id);
    if (after.id !== before && onTime) {
      this.bus.emit('loyaltyUp', { clientId: id, level: after.name });
    }
    this.bus.emit('clientsChanged', {});
  }

  /** clients sorted by how much business they have given us */
  ranked(): { brand: Brand; record: ClientRecord; level: LoyaltyLevel }[] {
    return CLIENTS.map((b) => ({ brand: b, record: this.record(b.id), level: this.level(b.id) })).sort(
      (a, b) => b.record.spent - a.record.spent,
    );
  }

  toSave(): BrandsSave {
    const clients: Record<string, ClientRecord> = {};
    for (const [k, v] of this.records) clients[k] = { ...v };
    return { clients };
  }

  loadFrom(s: BrandsSave | undefined): void {
    if (!s?.clients) return;
    for (const [k, v] of Object.entries(s.clients)) this.records.set(k, { ...EMPTY, ...v });
  }
}
