import * as THREE from 'three';
import cfg from '../config/workers.json';
import layout from '../config/layout.json';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { AABB, Point, dist } from '../core/Geometry';
import { Orders } from '../core/Orders';
import { NavGrid } from '../core/Pathfinding';
import { Workers } from '../core/workers/Workers';
import { Worker, WorkerStatus, speedMultiplier, traitDef } from '../core/workers/WorkerTypes';
import { Racks, rowPadZ, slotPosition } from '../world/Racks';
import { TOTAL_SLOTS, slotLevel, slotRow } from '../core/GameState';
import { resolveCircle } from '../world/Pompwagen';
import { WorkerActor } from '../world/workers/WorkerActor';
import { FallenPallets } from '../world/workers/FallenPallets';
import { Conveyors } from './Conveyors';

type Task =
  | { kind: 'idle' }
  | { kind: 'toUnload' }
  | { kind: 'toStore'; slot: number }
  | { kind: 'toPick'; slot: number; product: string }
  | { kind: 'toLoad' }
  | { kind: 'toBelt'; belt: 'in' | 'out' }
  | { kind: 'toBreak' }
  | { kind: 'toHome' };

interface Agent {
  worker: Worker;
  actor: WorkerActor;
  x: number;
  z: number;
  heading: number;
  speed: number;
  path: Point[];
  task: Task;
  cargo: string[];
  workTime: number;
  breakLeft: number;
  waitReason: string | null;
  replan: number;
  actionCooldown: number;
}

/**
 * Behaviour for hired workers: unloaders move pallets truck → racks, loaders
 * racks → customer trucks, using A* paths around racks, props and each other.
 * Handles breaks, drops (clumsy trait), supervisor/team-lead boosts, XP.
 */
export class WorkerAI {
  private agents: Agent[] = [];
  private grid: NavGrid;
  private reserved = new Set<number>();
  readonly group = new THREE.Group();
  /** clock in seconds, for break scheduling */
  private time = 0;
  private gridDirty = true;

  constructor(
    private state: GameState,
    private orders: Orders,
    private workers: Workers,
    private bus: EventBus,
    private racks: Racks,
    private fallen: FallenPallets,
    private colliders: AABB[],
    private conveyors: Conveyors,
    parent: THREE.Object3D,
  ) {
    const W = layout.warehouse.width / 2 + 6;
    const D = layout.warehouse.depth / 2 + 6;
    this.grid = new NavGrid(-W, -D, W, D, 0.5);
    parent.add(this.group);
    bus.on('workerHired', ({ workerId }) => this.spawn(workerId));
    bus.on('workerLeft', ({ workerId }) => this.despawn(workerId));
    bus.on('rackRowBuilt', () => {
      this.gridDirty = true;
    });
    bus.on('upgradeBought', ({ upgrade }) => {
      if (upgrade === 'conveyorIn' || upgrade === 'conveyorOut') this.gridDirty = true;
    });
    bus.on('workerLevelUp', ({ workerId }) => {
      const a = this.agents.find((x) => x.worker.id === workerId);
      a?.actor.character.celebrate();
    });
  }

  /** (re)create actors for every worker in the roster (after load) */
  sync(): void {
    for (const w of this.workers.workers) if (!this.agents.some((a) => a.worker.id === w.id)) this.spawn(w.id);
  }

  get list(): readonly Agent[] {
    return this.agents;
  }

  agentAt(worldPos: THREE.Vector3, r = 1.0): Worker | null {
    for (const a of this.agents) if (Math.hypot(a.x - worldPos.x, a.z - worldPos.z) < r) return a.worker;
    return null;
  }

  private spawn(id: number): void {
    const w = this.workers.byId(id);
    if (!w) return;
    const home = this.homeSpot(w);
    const actor = new WorkerActor(w, home.x, home.z);
    this.group.add(actor.group);
    this.agents.push({
      worker: w, actor, x: home.x, z: home.z + 2, heading: Math.PI, speed: 0, path: [], task: { kind: 'idle' },
      cargo: [], workTime: 0, breakLeft: 0, waitReason: null, replan: 0, actionCooldown: 0,
    });
  }

  private despawn(id: number): void {
    const i = this.agents.findIndex((a) => a.worker.id === id);
    if (i < 0) return;
    const a = this.agents[i];
    this.releaseTask(a);
    // drop whatever they carried back into a free slot, or on the floor
    for (const pid of a.cargo) {
      const slot = this.freeSlot(a);
      if (slot >= 0) this.state.setSlot(slot, pid);
      else this.fallen.drop(pid, a.x, a.z);
    }
    this.racks.syncFromState();
    this.group.remove(a.actor.group);
    this.agents.splice(i, 1);
  }

  private homeSpot(w: Worker): Point {
    const p = layout.pads;
    switch (w.role) {
      case 'unloader':
        return { x: p.unload.x + 3, z: p.unload.z + 4 };
      case 'loader':
        return { x: p.load.x - 3, z: p.load.z + 4 };
      case 'clerk':
        return { x: p.office.x - 1.2, z: p.office.z - 0.6 };
      default:
        return { x: p.office.x + 3, z: p.office.z - 1.5 };
    }
  }

  private breakSpot(): Point {
    return layout.breakSpot;
  }

  // ---------- slots ----------

  private canReach(a: Agent, i: number): boolean {
    if (!this.state.slotUnlocked(i)) return false;
    return slotLevel(i) === 0 || a.worker.role === 'forklift';
  }

  private freeSlot(a: Agent): number {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (this.state.slots[i] || this.reserved.has(i) || !this.canReach(a, i)) continue;
      const d = dist(a, this.slotPoint(i));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private slotWith(a: Agent, product: string): number {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (this.state.slots[i] !== product || this.reserved.has(i) || !this.canReach(a, i)) continue;
      const d = dist(a, this.slotPoint(i));
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private slotPoint(slot: number): Point {
    const p = slotPosition(slot);
    return { x: p.x, z: rowPadZ(slotRow(slot)) };
  }

  /** pallets of a product the customer still needs beyond what agents already carry or are fetching */
  private needAvailable(product: string): number {
    let n = this.orders.customerNeed(product);
    for (const a of this.agents) {
      n -= a.cargo.filter((c) => c === product).length;
      if (a.task.kind === 'toPick' && a.task.product === product) n--;
    }
    return n;
  }

  private releaseTask(a: Agent): void {
    if (a.task.kind === 'toStore' || a.task.kind === 'toPick') this.reserved.delete(a.task.slot);
  }

  // ---------- planning ----------

  private setTask(a: Agent, task: Task, target: Point | null): void {
    this.releaseTask(a);
    a.task = task;
    a.waitReason = null;
    if (task.kind === 'toStore' || task.kind === 'toPick') this.reserved.add(task.slot);
    a.path = target ? this.grid.find(a, target) : [];
  }

  private think(a: Agent): void {
    const w = a.worker;
    if (w.trainingLeft > 0 || w.shift === 'night' || w.role === 'clerk' || w.role === 'teamlead' || !w.certified) {
      if (a.task.kind !== 'toHome') this.setTask(a, { kind: 'toHome' }, this.homeSpot(w));
      return;
    }
    if (a.breakLeft > 0) return;
    const t = traitDef(w.trait);
    if (a.workTime >= cfg.breaks.workSeconds * (this.workers.canteen ? 1.4 : 1)) {
      a.workTime = 0;
      let len = cfg.breaks.breakSeconds * (t.breakLen ?? 1);
      if (this.workers.canteen) len *= cfg.breaks.canteenFactor;
      else if (this.workers.coffeeMachine) len *= cfg.breaks.coffeeMachineFactor;
      a.breakLeft = len;
      this.setTask(a, { kind: 'toBreak' }, this.breakSpot());
      return;
    }

    const isUnloader = w.role === 'unloader' || w.role === 'forklift';
    const isLoader = w.role === 'loader' || w.role === 'forklift';

    // carrying something: deliver it
    if (a.cargo.length) {
      const top = a.cargo[a.cargo.length - 1];
      if (isLoader && this.orders.activeCustomer && this.orders.customerNeed(top) > 0) {
        // the outbound belt loads the truck by itself, so use it whenever it is not a long detour
        const inp = this.conveyors.inputPoint('out');
        if (inp && this.conveyors.canAccept('out') && dist(a, inp) < dist(a, layout.pads.load) * 1.35) {
          if (a.task.kind !== 'toBelt' || a.task.belt !== 'out') this.setTask(a, { kind: 'toBelt', belt: 'out' }, inp);
          return;
        }
        if (a.task.kind !== 'toLoad') this.setTask(a, { kind: 'toLoad' }, layout.pads.load);
        return;
      }
      // the inbound belt stores pallets for us: drop them at its loading end
      const beltIn = this.conveyors.inputPoint('in');
      if (beltIn && this.conveyors.canAccept('in') && this.freeSlot(a) >= 0) {
        const slot = this.freeSlot(a);
        if (dist(a, beltIn) < dist(a, this.slotPoint(slot)) * 1.35) {
          if (a.task.kind !== 'toBelt' || a.task.belt !== 'in') this.setTask(a, { kind: 'toBelt', belt: 'in' }, beltIn);
          return;
        }
      }
      const slot = this.freeSlot(a);
      if (slot < 0) {
        a.waitReason = 'no rack space';
        if (a.task.kind !== 'idle') this.setTask(a, { kind: 'idle' }, null);
        return;
      }
      this.setTask(a, { kind: 'toStore', slot }, this.slotPoint(slot));
      return;
    }

    // loaders: fetch what the customer needs
    if (isLoader) {
      const c = this.orders.activeCustomer;
      if (c && c.state !== 'done') {
        for (const line of c.lines) {
          if (this.needAvailable(line.product) <= 0) continue;
          const slot = this.slotWith(a, line.product);
          if (slot >= 0) {
            this.setTask(a, { kind: 'toPick', slot, product: line.product }, this.slotPoint(slot));
            return;
          }
        }
      }
    }
    // unloaders: empty the supplier truck
    if (isUnloader) {
      const s = this.orders.activeSupplier;
      if (s && s.state === 'docked' && s.remaining > 0) {
        if (this.state.freeSpace - this.reserved.size <= 0) {
          a.waitReason = 'racks full';
        } else {
          if (a.task.kind !== 'toUnload') this.setTask(a, { kind: 'toUnload' }, layout.pads.unload);
          return;
        }
      }
    }
    if (a.task.kind !== 'toHome' && a.task.kind !== 'idle') this.setTask(a, { kind: 'toHome' }, this.homeSpot(w));
    else if (a.task.kind === 'idle' && dist(a, this.homeSpot(w)) > 3) this.setTask(a, { kind: 'toHome' }, this.homeSpot(w));
  }

  // ---------- arrival actions ----------

  private arrive(a: Agent): void {
    const w = a.worker;
    const cap = this.workers.capacity(w);
    switch (a.task.kind) {
      case 'toUnload': {
        const pid = this.orders.tryUnloadPallet();
        if (!pid) {
          a.waitReason = 'waiting for truck';
          this.setTask(a, { kind: 'idle' }, null);
          return;
        }
        a.cargo.push(pid);
        a.actor.setCargo(a.cargo);
        this.state.stats.unloaded++;
        this.bus.emit('workerAction', { workerId: w.id, action: 'unload', product: pid, x: a.x, z: a.z });
        if (a.cargo.length < cap && this.orders.activeSupplier?.state === 'docked') {
          a.actionCooldown = 0.5;
          return; // stay on the pad for the next pallet
        }
        this.setTask(a, { kind: 'idle' }, null);
        break;
      }
      case 'toStore': {
        const slot = a.task.slot;
        const pid = a.cargo.pop();
        this.reserved.delete(slot);
        if (pid === undefined) break;
        const t = traitDef(w.trait);
        if (t.drop && Math.random() < t.drop) {
          this.fallen.drop(pid, a.x + 0.6, a.z + 0.8);
          w.stats.drops++;
          this.bus.emit('palletDropped', { workerId: w.id, product: pid });
          this.bus.emit('workerAction', { workerId: w.id, action: 'drop', product: pid, x: a.x, z: a.z });
        } else if (!this.state.slots[slot]) {
          this.state.setSlot(slot, pid);
          this.racks.animateStore(slot);
          a.actor.liftTo(slotPosition(slot).y);
          this.workers.addXp(w);
          this.bus.emit('workerAction', { workerId: w.id, action: 'store', product: pid, x: a.x, z: a.z });
        } else {
          a.cargo.push(pid); // someone took the slot: keep it and re-plan
        }
        a.actor.setCargo(a.cargo);
        a.task = { kind: 'idle' };
        break;
      }
      case 'toPick': {
        const slot = a.task.slot;
        this.reserved.delete(slot);
        const pid = this.state.slots[slot];
        if (pid && a.cargo.length < cap) {
          this.state.setSlot(slot, null);
          this.racks.syncFromState();
          a.actor.liftTo(slotPosition(slot).y);
          a.cargo.push(pid);
          a.actor.setCargo(a.cargo);
          this.bus.emit('workerAction', { workerId: w.id, action: 'pick', product: pid, x: a.x, z: a.z });
        }
        a.task = { kind: 'idle' };
        break;
      }
      case 'toLoad': {
        const c = this.orders.activeCustomer;
        if (!c || c.state !== 'docked') {
          a.waitReason = c ? 'truck arriving' : null;
          if (!c) a.task = { kind: 'idle' };
          a.actionCooldown = 0.6;
          return;
        }
        for (let i = a.cargo.length - 1; i >= 0; i--) {
          if (this.orders.tryLoadPallet(a.cargo[i])) {
            const pid = a.cargo[i];
            a.cargo.splice(i, 1);
            a.actor.setCargo(a.cargo);
            this.workers.addXp(w);
            this.bus.emit('workerAction', { workerId: w.id, action: 'load', product: pid, x: a.x, z: a.z });
            a.actionCooldown = 0.5;
            return;
          }
        }
        a.task = { kind: 'idle' };
        break;
      }
      case 'toBelt': {
        const belt = a.task.belt;
        const pid = a.cargo[a.cargo.length - 1];
        if (pid === undefined) {
          a.task = { kind: 'idle' };
          break;
        }
        if (!this.conveyors.push(belt, pid)) {
          a.waitReason = 'belt full';
          a.actionCooldown = 0.6;
          return;
        }
        a.cargo.pop();
        a.actor.setCargo(a.cargo);
        this.workers.addXp(w);
        this.bus.emit('workerAction', { workerId: w.id, action: 'store', product: pid, x: a.x, z: a.z });
        if (a.cargo.length) {
          a.actionCooldown = 0.45;
          return;
        }
        a.task = { kind: 'idle' };
        break;
      }
      case 'toBreak':
      case 'toHome':
        a.task = { kind: 'idle' };
        a.path = [];
        break;
      default:
        break;
    }
  }

  // ---------- per frame ----------

  private status(a: Agent): WorkerStatus {
    const w = a.worker;
    if (w.shift === 'night') return 'offduty';
    if (w.trainingLeft > 0) return 'training';
    if (a.breakLeft > 0) return 'break';
    if (a.waitReason) return 'waiting';
    if (a.cargo.length) return 'carrying';
    if (a.task.kind === 'idle' || a.task.kind === 'toHome') return 'idle';
    return 'walking';
  }

  update(dt: number, player: Point, rackColliders: AABB[]): void {
    this.time += dt;
    if (this.gridDirty) {
      this.grid.rebuild(rackColliders, 0.45);
      this.gridDirty = false;
    }
    const night = this.workers.night;
    for (const a of this.agents) {
      const w = a.worker;
      if (a.breakLeft > 0 && a.task.kind === 'idle') a.breakLeft -= dt;
      a.actionCooldown -= dt;
      a.replan -= dt;
      if (a.actionCooldown <= 0 && (a.task.kind === 'idle' || a.replan <= 0 || (a.task.kind === 'toLoad' && !a.path.length))) {
        a.replan = 0.8;
        if (a.task.kind === 'toLoad' && !a.path.length) this.arrive(a);
        else this.think(a);
      }

      // move along the path
      let moving = false;
      if (a.path.length) {
        const wp = a.path[0];
        const dx = wp.x - a.x;
        const dz = wp.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) {
          a.path.shift();
          if (!a.path.length) this.arrive(a);
        } else {
          moving = true;
          let mul = speedMultiplier(w, a.cargo.length > 0, night);
          if (dist(a, player) < cfg.supervisorRadius) mul *= 1 + cfg.supervisorBoost;
          for (const o of this.agents) {
            if (o === a) continue;
            const td = traitDef(o.worker.trait);
            const d2 = dist(a, o);
            if (o.worker.role === 'teamlead' && d2 < cfg.teamLeadRadius) mul *= 1 + cfg.teamLeadBoost;
            if (td.aura && d2 < cfg.teamLeadRadius) mul *= 1 + td.aura;
          }
          const speed = cfg.baseSpeed * mul * (a.cargo.length ? 0.85 : 1);
          const desired = Math.atan2(dx, dz);
          let diff = desired - a.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          a.heading += Math.max(-6 * dt, Math.min(6 * dt, diff));
          const step = Math.min(d, speed * dt);
          let nx = a.x + Math.sin(a.heading) * step;
          let nz = a.z + Math.cos(a.heading) * step;
          // keep a little distance from colleagues and the boss
          for (const o of this.agents) {
            if (o === a) continue;
            const ox = nx - o.x;
            const oz = nz - o.z;
            const od = Math.hypot(ox, oz);
            if (od < 0.7 && od > 0.001) {
              nx += (ox / od) * (0.7 - od) * 0.5;
              nz += (oz / od) * (0.7 - od) * 0.5;
            }
          }
          const r = resolveCircle(nx, nz, 0.3, this.colliders);
          a.x = r.x;
          a.z = r.z;
          a.speed = speed;
          a.workTime += dt;
        }
      }
      if (!moving) a.speed = Math.max(0, a.speed - 12 * dt);
      a.actor.setStatus(this.status(a));
      a.actor.update(dt, a.x, a.z, a.heading, a.speed, this.colliders, w.level >= cfg.electricLevel);
    }
  }
}
