import * as THREE from 'three';
import layout from '../config/layout.json';
import { AABB } from './Warehouse';
import { Character, DEFAULT_LOOK } from './Character';
import { Forklift } from './Forklift';
import { Pompwagen, resolveCircle } from './Pompwagen';

export type VehicleKind = 'pompwagen' | 'forklift';

/**
 * The boss. On foot they pull the (electric) pompwagen behind them; in the
 * forklift they sit in the seat and steer from the rear wheels, so the tail
 * swings out through turns. Movement is joystick-driven with limited turn
 * speed, short acceleration and braking, and heavier handling when loaded.
 */
export class Player {
  readonly group = new THREE.Group();

  x: number;
  z: number;
  heading = Math.PI; // facing -z initially
  speed = 0;
  speedBonus = 0;
  /** frozen during cutscenes (construction) */
  frozen = false;
  vehicle: VehicleKind = 'pompwagen';

  readonly character = new Character(DEFAULT_LOOK);
  readonly pompwagen: Pompwagen;
  readonly forklift = new Forklift();
  private steer = 0;

  constructor(parent: THREE.Object3D) {
    this.x = layout.playerStart.x;
    this.z = layout.playerStart.z;
    this.pompwagen = new Pompwagen(this.x, this.z);
    this.forklift.group.visible = false;
    this.group.add(this.character.group, this.pompwagen.group, this.forklift.group);
    parent.add(this.group);
  }

  setElectric(on: boolean): void {
    this.pompwagen.setElectric(on);
  }

  /** show the forklift parked once it is owned */
  setForkliftOwned(on: boolean): void {
    this.forklift.group.visible = on;
    if (on && this.vehicle !== 'forklift') this.parkForklift();
  }

  private parkForklift(): void {
    const p = layout.parkingSpots.forklift;
    this.forklift.place(0, p.x, p.z, Math.PI, 0, 0);
  }

  private parkPompwagen(): void {
    const p = layout.parkingSpots.pompwagen;
    this.pompwagen.reset(p.x, p.z, 0);
    this.pompwagen.follow(0.016, p.x, p.z, 0, 0, []);
  }

  /** switch vehicle at the parking pad; cargo must be empty */
  setVehicle(v: VehicleKind): void {
    if (v === this.vehicle) return;
    this.vehicle = v;
    if (v === 'forklift') {
      this.parkPompwagen();
      this.character.sitting = true;
      this.character.armMode = 'drive';
      this.character.group.position.set(0, 0, 0);
      this.forklift.group.add(this.character.group);
      this.character.group.position.copy(this.forklift.seat);
      this.character.group.rotation.set(0, 0, 0);
      this.character.group.scale.setScalar(0.9);
      this.speed = 0;
    } else {
      this.parkForklift();
      this.character.sitting = false;
      this.character.armMode = 'pull';
      this.group.add(this.character.group);
      this.character.group.scale.setScalar(1);
      this.pompwagen.reset(this.x, this.z, this.heading);
    }
  }

  get capacity(): number {
    return this.vehicle === 'forklift' ? this.forklift.capacity : this.pompwagen.capacity;
  }

  get cargo(): string[] {
    return this.vehicle === 'forklift' ? this.forklift.cargo : this.pompwagen.cargo;
  }

  get carrying(): number {
    return this.cargo.length;
  }

  get position(): THREE.Vector3 {
    return new THREE.Vector3(this.x, 0, this.z);
  }

  setCargo(products: string[]): void {
    if (this.vehicle === 'forklift') this.forklift.setCargo(products);
    else this.pompwagen.setCargo(products);
  }

  /** forklift mast animation when storing/taking on a rack level */
  liftTo(height: number): void {
    if (this.vehicle === 'forklift' && height > 0.01) this.forklift.liftTo(height);
  }

  /** teleport (construction, vehicle swaps) */
  teleport(x: number, z: number, heading = Math.PI): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.pompwagen.reset(x, z, heading);
  }

  update(dt: number, inputX: number, inputY: number, colliders: AABB[]): void {
    const loaded = this.carrying > 0;
    const fk = this.vehicle === 'forklift';
    const cfg = fk ? this.forklift.cfg : this.pompwagen.cfg;
    const maxSpeed = cfg.maxSpeed * (loaded ? cfg.loadedSpeedFactor : 1) * (1 + (fk ? 0 : this.speedBonus));
    const turnSpeed = cfg.turnSpeed * (loaded ? cfg.loadedTurnFactor : 1);
    const mag = this.frozen ? 0 : Math.min(1, Math.hypot(inputX, inputY));

    let turned = 0;
    if (mag > 0.05) {
      const desired = Math.atan2(inputX, inputY);
      let diff = desired - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // the forklift only turns while rolling, from the rear axle
      const maxTurn = turnSpeed * dt * (fk ? Math.min(1, 0.25 + this.speed / maxSpeed) : 1);
      turned = Math.max(-maxTurn, Math.min(maxTurn, diff));
      this.heading += turned;
      this.speed = Math.min(maxSpeed * mag, this.speed + cfg.accel * dt);
    } else {
      this.speed = Math.max(0, this.speed - cfg.brake * dt);
    }

    if (this.speed > 0.001) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      const resolved = resolveCircle(nx, nz, fk ? 0.6 : 0.35, colliders);
      this.x = resolved.x;
      this.z = resolved.z;
    }

    if (fk) {
      // rear wheel steering angle follows the turn rate
      const want = THREE.MathUtils.clamp((turned / Math.max(1e-3, dt)) * 0.35, -0.6, 0.6);
      this.steer += (want - this.steer) * Math.min(1, dt * 8);
      // the rear of the forklift must also clear obstacles
      const wb = this.forklift.cfg.wheelbase;
      const rx = this.x - Math.sin(this.heading) * wb;
      const rz = this.z - Math.cos(this.heading) * wb;
      const rr = resolveCircle(rx, rz, 0.55, colliders);
      if (Math.abs(rr.x - rx) > 1e-4 || Math.abs(rr.z - rz) > 1e-4) {
        this.x += rr.x - rx;
        this.z += rr.z - rz;
      }
      this.forklift.place(dt, this.x, this.z, this.heading, this.steer, this.speed);
      this.character.animate(dt, 0);
    } else {
      this.character.group.position.set(this.x, 0, this.z);
      this.character.group.rotation.y = this.heading;
      this.character.animate(dt, this.speed);
      this.pompwagen.follow(dt, this.x, this.z, this.heading, this.speed, colliders);
      if (this.forklift.group.visible) this.forklift.place(dt, this.forklift.group.position.x, this.forklift.group.position.z, this.forklift.group.rotation.y, 0, 0);
    }
  }
}
