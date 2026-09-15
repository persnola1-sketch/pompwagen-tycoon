import layout from '../config/layout.json';
import { EMPTY_STATS, GameState, SAVE_VERSION, SaveData, TOTAL_SLOTS } from './GameState';
import { PRODUCTS, isProduct } from './Products';

const KEY = 'pompwagen-tycoon-save';

/** a game system that persists its own slice of the save file */
export interface Saveable<T = unknown> {
  toSave(): T;
  loadFrom(data: T | undefined): void;
}

/** v1 saves had a single product and boolean slot occupancy in a different rack layout */
function migrateV1(raw: Record<string, unknown>): SaveData {
  const oldSlots = Array.isArray(raw.slots) ? raw.slots : [];
  const stock = oldSlots.filter(Boolean).length;
  const rackRows = Math.max(layout.rackRows.startRows, Math.min(layout.rackRows.rows.length, Number(raw.rackRows) || 0));
  const capacity = rackRows * layout.rackRows.slotsPerRow;
  const slots: (string | null)[] = new Array(TOTAL_SLOTS).fill(null);
  for (let i = 0; i < Math.min(stock, capacity); i++) slots[i] = PRODUCTS[0].id;
  return {
    version: SAVE_VERSION,
    money: Number(raw.money) || 0,
    reputation: Number(raw.reputation) || 0,
    rackRows,
    slots,
    electric: !!raw.electric,
    speedLevel: Number(raw.speedLevel) || 0,
    tutorialDone: !!raw.tutorialDone,
    warehouseBuilt: true,
    padProgress: {},
    stats: { ...EMPTY_STATS, ...((raw.stats as Partial<SaveData['stats']>) ?? {}) },
  };
}

/**
 * Versioned localStorage save. The core GameState is always saved; other
 * systems register themselves under a key and get their slice back on load
 * (registration restores immediately if a save was already read).
 */
export class SaveSystem {
  private modules = new Map<string, Saveable>();
  private loaded: Record<string, unknown> | null = null;
  /** wall-clock time of the last save (for offline shifts) */
  lastSeen = 0;

  constructor(private state: GameState) {}

  register<T>(key: string, mod: Saveable<T>): void {
    this.modules.set(key, mod as Saveable);
    if (this.loaded && key in this.loaded) mod.loadFrom(this.loaded[key] as T);
  }

  save(): void {
    try {
      const data: Record<string, unknown> = { ...this.state.toSave(), savedAt: Date.now() };
      for (const [k, m] of this.modules) data[k] = m.toSave();
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* private mode / quota — ignore */
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.version === 1) {
        this.state.loadFrom(migrateV1(data));
      } else if (typeof data.version === 'number' && data.version >= 2 && data.version <= SAVE_VERSION) {
        // v2 → v3: players with a warehouse skip the empty-plot intro
        const d = data as unknown as SaveData;
        if (data.version < 3) d.warehouseBuilt = true;
        d.slots = d.slots.map((s) => (isProduct(s) ? s : null));
        this.state.loadFrom(d);
      } else {
        return false;
      }
      this.loaded = data;
      this.lastSeen = Number(data.savedAt) || 0;
      for (const [k, m] of this.modules) if (k in data) m.loadFrom(data[k]);
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}
