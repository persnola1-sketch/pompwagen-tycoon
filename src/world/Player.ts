import * as THREE from 'three';
import layout from '../config/layout.json';
import { AABB } from './Warehouse';
import { Character, DEFAULT_LOOK } from './Character';
import { Pompwagen, resolveCircle } from './Pompwagen';

/**
 * The boss: a worker in hi-vis walking forward while pulling the pompwagen
 * handle behind. Movement is joystick-driven with limited turn speed, short
 * acceleration and braking, and heavier handling when loaded.
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

  readonly character = new Character(DEFAULT_LOOK);
  readonly pompwagen: Pompwagen;

  constructor(parent: THREE.Object3D) {
    this.x = layout.playerStart.x;
    this.z = layout.playerStart.z;
    this.pompwagen = new Pompwagen(this.x, this.z);
    this.group.add(this.character.group, this.pompwagen.group);
    parent.add(this.group);
  }

  setElectric(on: boolean): void {
    this.pompwagen.setElectric(on);
  }

  get capacity(): number {
    return this.pompwagen.capacity;
  }

  get cargo(): string[] {
    return this.pompwagen.cargo;
  }

  get carrying(): number {
    return this.pompwagen.cargo.length;
  }

  get position(): THREE.Vector3 {
    return new THREE.Vector3(this.x, 0, this.z);
  }

  setCargo(products: string[]): void {
    this.pompwagen.setCargo(products);
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
    const cfg = this.pompwagen.cfg;
    const loaded = this.carrying > 0;
    const maxSpeed = cfg.maxSpeed * (loaded ? cfg.loadedSpeedFactor : 1) * (1 + this.speedBonus);
    const turnSpeed = cfg.turnSpeed * (loaded ? cfg.loadedTurnFactor : 1);
    const mag = this.frozen ? 0 : Math.min(1, Math.hypot(inputX, inputY));

    if (mag > 0.05) {
      const desired = Math.atan2(inputX, inputY);
      let diff = desired - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = turnSpeed * dt;
      this.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
      this.speed = Math.min(maxSpeed * mag, this.speed + cfg.accel * dt);
    } else {
      this.speed = Math.max(0, this.speed - cfg.brake * dt);
    }

    if (this.speed > 0.001) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      const resolved = resolveCircle(nx, nz, 0.35, colliders);
      this.x = resolved.x;
      this.z = resolved.z;
    }

    this.character.group.position.set(this.x, 0, this.z);
    this.character.group.rotation.y = this.heading;
    this.character.animate(dt, this.speed);
    this.pompwagen.follow(dt, this.x, this.z, this.heading, this.speed, colliders);
  }
}
