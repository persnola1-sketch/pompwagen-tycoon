import economy from '../config/economy.json';
import layout from '../config/layout.json';
import { Sound } from '../audio/Sound';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Orders } from '../core/Orders';
import { Pads } from '../world/Pads';
import { Player } from '../world/Player';
import { Racks, inRowStrip, slotPosition } from '../world/Racks';

const PER_ROW = layout.rackRows.slotsPerRow;

/**
 * Auto pick-up / drop when standing on the UNLOAD pad, LOAD pad and rack row
 * strips. Pallets are product-specific: the forks keep what the active customer
 * still needs and store everything else.
 */
export class Interactions {
  onCargoChanged: (() => void) | null = null;
  onOffice: (() => void) | null = null;

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

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0) return;
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

  private nearestSlot(row: number, px: number, match: (slot: string | null) => boolean): number {
    let best = -1;
    let bestD = Infinity;
    for (let c = 0; c < PER_ROW; c++) {
      const i = row * PER_ROW + c;
      if (!match(this.state.slots[i])) continue;
      const d = Math.abs(slotPosition(i).x - px);
      if (d < bestD) {
        bestD = d;
        best = i;
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
    this.player.setCargo([...this.player.cargo, pid]);
    this.sound.palletUp();
    this.bus.emit('palletPicked', { from: 'rack', product: pid });
    this.done();
    return true;
  }
}
