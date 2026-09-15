import layout from '../config/layout.json';
import { GameState, SAVE_VERSION, SaveData, TOTAL_SLOTS } from './GameState';
import { PRODUCTS, isProduct } from './Products';

const KEY = 'pompwagen-tycoon-save';

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
    stats: (raw.stats as SaveData['stats']) ?? { shipped: 0, earned: 0, spent: 0 },
  };
}

export class SaveSystem {
  constructor(private state: GameState) {}

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state.toSave()));
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
