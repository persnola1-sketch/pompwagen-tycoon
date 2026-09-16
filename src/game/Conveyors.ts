import * as THREE from 'three';
import layout from '../config/layout.json';
import { EventBus } from '../core/EventBus';
import { GameState, TOTAL_SLOTS } from '../core/GameState';
import { AABB, Point } from '../core/Geometry';
import { Orders } from '../core/Orders';
import { BeltItem, Conveyor } from '../world/Conveyor';
import { Racks, slotPosition } from '../world/Racks';

const C = layout.conveyors;

export type BeltKind = 'in' | 'out';

export interface ConveyorsSave {
  in: BeltItem[];
  out: BeltItem[];
}

/**
 * The two conveyor lines. The inbound belt runs from the receiving dock to the
 * racks and pushes its pallets straight into a free rack slot; the outbound
 * belt runs from the racks to the shipping dock and loads the waiting truck.
 * Workers and the player drop pallets at the loading end, which is far closer
 * than the far side of the building — that is the whole upgrade.
 */
export class Conveyors {
  private belts = new Map<BeltKind, Conveyor>();
  private wasRunning = false;
  /** colliders of built belts, appended to the shared warehouse list */
  constructor(
    private scene: THREE.Scene,
    private state: GameState,
    private orders: Orders,
    private bus: EventBus,
    private racks: Racks,
    private colliders: AABB[],
  ) {}

  get speed(): number {
    return C.speed + this.state.conveyorSpeedLevel * C.speedPerLevel;
  }

  has(kind: BeltKind): boolean {
    return this.belts.has(kind);
  }

  get(kind: BeltKind): Conveyor | undefined {
    return this.belts.get(kind);
  }

  /** (re)create belts to match the saved state */
  sync(): void {
    for (const kind of ['in', 'out'] as BeltKind[]) {
      const owned = kind === 'in' ? this.state.conveyorIn : this.state.conveyorOut;
      if (owned && !this.belts.has(kind)) this.build(kind);
    }
  }

  private build(kind: BeltKind): void {
    const path = kind === 'in' ? C.inbound.path : C.outbound.path;
    const belt = new Conveyor(this.scene, path);
    this.belts.set(kind, belt);
    for (const c of belt.colliders) this.colliders.push(c);
  }

  /** where a worker or the player drops a pallet onto a belt */
  inputPoint(kind: BeltKind): Point | null {
    const b = this.belts.get(kind);
    return b ? b.inputPoint : null;
  }

  canAccept(kind: BeltKind): boolean {
    return this.belts.get(kind)?.canAccept() ?? false;
  }

  /** put a pallet on a belt; returns false when the belt is full or missing */
  push(kind: BeltKind, product: string): boolean {
    const b = this.belts.get(kind);
    if (!b || !b.push(product)) return false;
    this.bus.emit('conveyorLoaded', { kind, product });
    return true;
  }

  /** is somebody standing on the loading end of a belt? */
  atInput(kind: BeltKind, x: number, z: number, r = 1.3): boolean {
    const p = this.inputPoint(kind);
    return !!p && Math.hypot(p.x - x, p.z - z) < r;
  }

  private freeSlot(): number {
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (!this.state.slots[i] && this.state.slotUnlocked(i)) return i;
    }
    return -1;
  }

  update(dt: number): void {
    let running = false;
    for (const [kind, belt] of this.belts) {
      belt.update(dt, this.speed);
      running ||= belt.running;
      const ready = belt.ready;
      if (!ready) continue;
      if (kind === 'in') {
        // the discharge end pushes the pallet straight into a free rack slot
        const slot = this.freeSlot();
        if (slot < 0) continue;
        const product = belt.take()!;
        this.state.setSlot(slot, product);
        this.racks.animateStore(slot);
        this.bus.emit('palletStored', { slot, product });
        this.bus.emit('conveyorDelivered', { kind, product, x: slotPosition(slot).x, z: slotPosition(slot).z });
      } else {
        // the discharge end loads the docked customer truck
        if (!this.orders.tryLoadPallet(ready)) continue;
        const product = belt.take()!;
        const p = belt.outputPoint;
        this.bus.emit('conveyorDelivered', { kind, product, x: p.x, z: p.z });
      }
    }
    if (running !== this.wasRunning) {
      this.wasRunning = running;
      this.bus.emit('conveyorRunning', { running });
    }
  }

  toSave(): ConveyorsSave {
    return { in: this.belts.get('in')?.toSave() ?? [], out: this.belts.get('out')?.toSave() ?? [] };
  }

  loadFrom(s: ConveyorsSave | undefined): void {
    if (!s) return;
    this.sync();
    this.belts.get('in')?.loadFrom(s.in);
    this.belts.get('out')?.loadFrom(s.out);
  }
}
