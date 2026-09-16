import * as THREE from 'three';
import layout from '../config/layout.json';
import cfg from '../config/construction.json';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Job, Timers } from '../core/Timers';
import { Workers } from '../core/workers/Workers';
import { Effects } from '../world/Effects';
import { Player } from '../world/Player';
import { Pompwagen } from '../world/Pompwagen';
import { Forklift } from '../world/Forklift';
import { ROW_LENGTH, Racks, rowLetter, rowPadZ } from '../world/Racks';
import { Truck } from '../world/Truck';
import { ConstructionSite } from '../world/construction/ConstructionSite';

/**
 * Turns timer jobs into world objects and effects: a construction site while
 * something is being built, a delivery truck with a ramp roll-out for
 * vehicles, and the actual unlock when the job completes.
 */
export class Construction {
  private sites = new Map<number, ConstructionSite>();
  private truck: Truck;
  private truckJob: Job | null = null;
  private departWhenDocked = false;
  /** custom vehicle model builders per delivery item (forklift registers itself in phase 6) */
  vehicleModels: Record<string, () => THREE.Object3D> = {};
  /** extra completion handlers per item (conveyors, amenities …) */
  onItemDone: Record<string, (job: Job) => void> = {};
  onRefreshPads: (() => void) | null = null;
  onSound: ((kind: 'build' | 'horn' | 'brake' | 'beep') => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private state: GameState,
    private bus: EventBus,
    private timers: Timers,
    private racks: Racks,
    private workers: Workers,
    private player: Player,
    private effects: Effects,
  ) {
    this.truck = new Truck('delivery', scene);
    this.truck.onBeep = (): void => this.onSound?.('beep');
    this.truck.onDocked = (): void => {
      this.onSound?.('brake');
      if (this.departWhenDocked) {
        this.departWhenDocked = false;
        this.truck.startDeparture();
      }
    };
    this.truck.onGone = (): void => {
      this.truckJob = null;
    };
    bus.on('jobStarted', ({ job }) => this.onStarted(job));
    bus.on('deliveryDispatched', ({ job }) => this.dispatch(job));
    bus.on('jobDone', ({ job }) => this.onDone(job));
    this.vehicleModels.electric = (): THREE.Object3D => {
      const p = new Pompwagen(0, 0);
      p.setElectric(true);
      p.follow(0.016, 0, 0, 0, 0, []);
      return p.group;
    };
    this.vehicleModels.forklift = (): THREE.Object3D => {
      const f = new Forklift();
      f.place(0.016, 0, 0, 0, 0, 0);
      f.group.position.set(0, 0, 1.2);
      return f.group;
    };
    // restore sites for jobs loaded from the save
    for (const j of timers.jobs) this.onStarted(j);
  }

  /** where a construction item is built and how big its site is */
  private footprint(job: Job): { x: number; z: number; w: number; d: number } {
    switch (job.item) {
      case 'rackRow':
      case 'upperLevel': {
        const r = layout.rackRows.rows[job.index];
        return { x: r.x, z: (r.z + rowPadZ(job.index)) / 2, w: ROW_LENGTH + 0.8, d: 2.8 };
      }
      case 'coffeeMachine':
        return { x: layout.breakSpot.x, z: layout.breakSpot.z, w: 2.2, d: 1.6 };
      case 'canteen':
        return { x: layout.breakSpot.x - 3, z: layout.breakSpot.z, w: 4.5, d: 2.6 };
      case 'secondDock':
        return { x: layout.docks.outboundX - 2, z: layout.docks.doorZ[1], w: 3.5, d: layout.docks.doorWidth + 1 };
      case 'conveyorIn':
        return { x: layout.conveyors.inbound.x, z: layout.conveyors.inbound.z, w: layout.conveyors.length + 1, d: 2 };
      case 'conveyorOut':
        return { x: layout.conveyors.outbound.x, z: layout.conveyors.outbound.z, w: layout.conveyors.length + 1, d: 2 };
      default:
        return { x: 0, z: 0, w: 3, d: 3 };
    }
  }

  private onStarted(job: Job): void {
    if (job.kind === 'construction') {
      const f = this.footprint(job);
      this.sites.set(job.id, new ConstructionSite(this.scene, job.id, f.x, f.z, f.w, f.d, this.effects, job.label));
      this.onSound?.('build');
    }
    this.onRefreshPads?.();
  }

  private dispatch(job: Job): void {
    if (this.truckJob) return; // one delivery truck at a time; the next waits for the timer
    this.truckJob = job;
    const build = this.vehicleModels[job.item];
    this.truck.setVehicle(build ? build() : new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 2), new THREE.MeshStandardMaterial({ color: 0x8b6a44 })));
    this.truck.startArrival(job.item === 'forklift' ? 'HefTruck Service' : 'Pompwagen Parts', [], 1);
    this.onSound?.('horn');
  }

  private onDone(job: Job): void {
    const site = this.sites.get(job.id);
    if (site) {
      site.finish();
      this.sites.delete(job.id);
    }
    if (job.kind === 'delivery' && this.truckJob?.id === job.id) {
      if (this.truck.phase === 'docked') {
        this.truck.rollOut(cfg.delivery.rollOutSeconds, () => {
          this.apply(job);
          this.truck.startDeparture();
        });
        return;
      }
      if (this.truck.phase === 'arriving') this.departWhenDocked = true;
      else this.truckJob = null;
    }
    this.apply(job);
  }

  private apply(job: Job): void {
    switch (job.item) {
      case 'rackRow': {
        const row = job.index;
        if (row >= this.state.rackRows) this.state.rackRows = row + 1;
        this.racks.revealRow(row);
        this.bus.emit('rackRowBuilt', { rowIndex: row });
        this.bus.emit('stockChanged', { stock: this.state.stock, capacity: this.state.capacity });
        this.bus.emit('toast', { text: `Rack row ${rowLetter(row)} built! +${layout.rackRows.slotsPerRow} slots`, kind: 'good' });
        break;
      }
      case 'upperLevel': {
        const row = job.index;
        this.state.upperLevels[row] = Math.min(layout.rackRows.levels - 1, this.state.upperLevels[row] + 1);
        this.racks.refresh();
        this.bus.emit('stockChanged', { stock: this.state.stock, capacity: this.state.capacity });
        this.bus.emit('upgradeBought', { upgrade: 'upperLevel' });
        this.bus.emit('toast', { text: `Rack row ${rowLetter(row)} now has ${1 + this.state.upperLevels[row]} levels! Forklift only`, kind: 'good' });
        break;
      }
      case 'electric':
        this.state.electric = true;
        this.player.setElectric(true);
        this.bus.emit('upgradeBought', { upgrade: 'electric' });
        this.bus.emit('toast', { text: 'Electric pompwagen delivered! Carries 2 pallets, bigger orders arrive', kind: 'good' });
        break;
      case 'forklift':
        this.state.forklift = true;
        this.player.setForkliftOwned(true);
        this.bus.emit('upgradeBought', { upgrade: 'forklift' });
        this.bus.emit('toast', { text: 'Forklift delivered! Switch vehicles at the parking pad', kind: 'good' });
        break;
      case 'coffeeMachine':
        this.workers.coffeeMachine = true;
        this.bus.emit('upgradeBought', { upgrade: 'coffeeMachine' });
        this.bus.emit('toast', { text: 'Coffee machine installed — shorter breaks ☕', kind: 'good' });
        break;
      case 'canteen':
        this.workers.canteen = true;
        this.bus.emit('upgradeBought', { upgrade: 'canteen' });
        this.bus.emit('toast', { text: 'Canteen opened — happy, fast workers 🍲', kind: 'good' });
        break;
      default:
        break;
    }
    this.onItemDone[job.item]?.(job);
    this.onSound?.('build');
    this.onRefreshPads?.();
  }

  update(dt: number, camera: THREE.Camera): void {
    for (const j of this.timers.jobs) {
      const s = this.sites.get(j.id);
      if (s) s.update(dt, 1 - j.left / j.total, j.left, camera);
    }
    this.truck.update(dt, camera);
  }
}
