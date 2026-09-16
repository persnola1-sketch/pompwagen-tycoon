import economy from '../config/economy.json';
import layout from '../config/layout.json';
import { Sound } from '../audio/Sound';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Orders } from '../core/Orders';
import { Pads } from '../world/Pads';
import { Player } from '../world/Player';
import { Racks, inRowStrip, slotPosition } from '../world/Racks';
import { slotIndex } from '../core/GameState';
import { FallenPallets } from '../world/workers/FallenPallets';

const PER_ROW = layout.rackRows.slotsPerRow;

/**
 * Auto pick-up / drop when standing on the UNLOAD pad, LOAD pad and rack row
 * strips. Pallets are product-specific: the forks keep what the active customer
 * still needs and store everything else.
 */
export class Interactions {
  onCargoChanged: (() => void) | null = null;
  onOffice: (() => void) | null = null;
  onParking: (() => void) | null = null;
  private parkingLatch = false;

  /** off while the warehouse is not built or during cutscenes */
  enabled = true;
  fallen: FallenPallets | null = null;
  private cooldown = 0;
  private officeLatch = false;

  constructor(
    private state: GameState,
    private orders: Orders,
    private bus: EventBus,
    private pads: Pads,
    private player: Player,
    private racks: Racks,
    private sound: Sound,
  ) {}

  update(dt: number): void {
    if (!this.enabled) return;
    const px = this.player.x;
    const pz = this.player.z;

    if (this.pads.isOn('office', px, pz)) {
      if (!this.officeLatch) {
        this.officeLatch = true;
        this.onOffice?.();
      }
    } else {
      this.officeLatch = false;
    }

    if (this.pads.isOn('parking', px, pz)) {
      if (!this.parkingLatch) {
        this.parkingLatch = true;
        this.onParking?.();
      }
    } else {
      this.parkingLatch = false;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0) return;
    if (this.tryPickFallen(px, pz)) return;
    if (this.tryUnload(px, pz) || this.tryLoad(px, pz)) return;
    for (let row = 0; row < this.state.rackRows; row++) {
      if (!inRowStrip(row, px, pz)) continue;
      if (this.tryStore(row, px) || this.tryTake(row, px)) return;
    }
  }

  private done(): void {
    this.cooldown = economy.interaction.actionCooldown;
    this.onCargoChanged?.();
  }

  /** only the boss can pick up pallets dropped by workers */
  private tryPickFallen(px: number, pz: number): boolean {
    if (!this.fallen || this.player.carrying >= this.player.capacity) return false;
    const pid = this.fallen.pickNear(px, pz, 1.1);
    if (!pid) return false;
    this.player.setCargo([...this.player.cargo, pid]);
    this.sound.palletUp();
    this.bus.emit('palletPicked', { from: 'rack', product: pid });
    this.done();
    return true;
  }

  private tryUnload(px: number, pz: number): boolean {
    if (!this.pads.isOn('unload', px, pz) || this.player.carrying >= this.player.capacity) return false;
    const pid = this.orders.tryUnloadPallet();
    if (!pid) return false;
    this.player.setCargo([...this.player.cargo, pid]);
    this.sound.palletUp();
    this.done();
    return true;
  }

  private tryLoad(px: number, pz: number): boolean {
    if (!this.pads.isOn('load', px, pz) || this.player.carrying === 0) return false;
    const cargo = this.player.cargo;
    for (let i = cargo.length - 1; i >= 0; i--) {
      if (this.orders.tryLoadPallet(cargo[i])) {
        this.player.setCargo(cargo.filter((_, k) => k !== i));
        this.sound.palletDown();
        this.done();
        return true;
      }
    }
    return false;
  }

  /** index of the top-most carried pallet the active customer doesn't need, or -1 */
  private surplusIndex(): number {
    const cargo = this.player.cargo;
    const count = new Map<string, number>();
    for (const pid of cargo) count.set(pid, (count.get(pid) ?? 0) + 1);
    for (let i = cargo.length - 1; i >= 0; i--) {
      if ((count.get(cargo[i]) ?? 0) > this.orders.customerNeed(cargo[i])) return i;
    }
    return -1;
  }

  private stillNeeded(pid: string): number {
    return this.orders.customerNeed(pid) - this.player.cargo.filter((c) => c === pid).length;
  }

  /** nearest matching slot in a row; the forklift reaches unlocked upper levels, pompwagens only the floor */
  private nearestSlot(row: number, px: number, match: (slot: string | null) => boolean): number {
    let best = -1;
    let bestD = Infinity;
    const levels = this.player.vehicle === 'forklift' ? 1 + this.state.upperLevels[row] : 1;
    for (let lv = 0; lv < levels; lv++) {
      for (let c = 0; c < PER_ROW; c++) {
        const i = slotIndex(row, c, lv);
        if (!match(this.state.slots[i])) continue;
        const d = Math.abs(slotPosition(i).x - px) + lv * 0.4;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  private tryStore(row: number, px: number): boolean {
    const idx = this.surplusIndex();
    if (idx < 0) return false;
    const slot = this.nearestSlot(row, px, (s) => !s);
    if (slot < 0) return false;
    const pid = this.player.cargo[idx];
    this.state.setSlot(slot, pid);
    this.racks.animateStore(slot);
    this.player.liftTo(slotPosition(slot).y);
    this.player.setCargo(this.player.cargo.filter((_, k) => k !== idx));
    this.sound.palletDown();
    this.bus.emit('palletStored', { slot, product: pid });
    this.done();
    return true;
  }

  private tryTake(row: number, px: number): boolean {
    if (this.player.carrying >= this.player.capacity) return false;
    const slot = this.nearestSlot(row, px, (s) => !!s && this.stillNeeded(s) > 0);
    if (slot < 0) return false;
    const pid = this.state.slots[slot]!;
    this.state.setSlot(slot, null);
    this.racks.syncFromState();
    this.player.liftTo(slotPosition(slot).y);
    this.player.setCargo([...this.player.cargo, pid]);
    this.sound.palletUp();
    this.bus.emit('palletPicked', { from: 'rack', product: pid });
    this.done();
    return true;
  }
}
