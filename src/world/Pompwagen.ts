import * as THREE from 'three';
import vehicles from '../config/vehicles.json';
import { AABB } from './Warehouse';
import { createPallet } from './Pallet';
import { MergeBuilder, glow, mat, unitCylinder } from './Merge';

export type PompwagenCfg = typeof vehicles.pompwagen;

export function resolveCircle(nx: number, nz: number, r: number, colliders: AABB[]): { x: number; z: number } {
  let x = nx;
  let z = nz;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 1e-6;
      const push = (r - d) / d;
      if (d2 > 1e-9) {
        x += dx * push;
        z += dz * push;
      } else {
        z = c.maxZ + r;
      }
    }
  }
  return { x, z };
}

/**
 * Hand pallet truck (pompwagen) model with trailer physics: the steering head
 * follows the hands via a rigid handle and the body pivots around the fork
 * rollers, swinging wide in turns and never stretching or detaching. The
 * electric variant adds a battery hood, stand-on plate and beacon.
 */
export class Pompwagen {
  readonly group = new THREE.Group();
  cfg: PompwagenCfg = vehicles.pompwagen;
  /** product id per carried pallet */
  cargo: string[] = [];

  private body = new THREE.Group();
  private steerHead = new THREE.Group();
  private handle = new THREE.Group();
  private handleShaft: THREE.Mesh;
  private wheels: THREE.Mesh[] = [];
  private palletMounts: THREE.Group[] = [];
  private electricParts = new THREE.Group();
  private beacon: THREE.Mesh;
  private steerPos = new THREE.Vector2();
  private rollerPos = new THREE.Vector2();
  private squash = 0;

  constructor(x: number, z: number, color = 0xd9651f) {
    this.steerPos.set(x, z + 1.2);
    this.rollerPos.set(x, z + 2.6);
    this.build(color);
    this.handleShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 8), mat(color, 0.45, 0.4));
    this.handleShaft.castShadow = true;
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), mat(0x22252b, 0.8));
    grip.rotation.y = Math.PI / 2;
    this.handle.add(grip);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(0xff9a1a));
    this.beacon.position.set(0, 0.95, 0.3);
    this.electricParts.add(this.beacon);
    this.group.add(this.body, this.handleShaft, this.handle);
    this.setElectric(false);
  }

  private build(color: number): void {
    const orange = mat(color, 0.45, 0.4);
    const steel = mat(0x565d68, 0.4, 0.6);
    const chrome = mat(0xcfd5dc, 0.2, 0.9);
    const rubber = mat(0x24262c, 0.9);

    const head = new MergeBuilder();
    head.add(unitCylinder, orange, 0, 0.3, 0, 0, 0, 0, 0.16, 0.34, 0.16);
    head.add(unitCylinder, chrome, 0, 0.52, 0, 0, 0, 0, 0.06, 0.12, 0.06);
    head.box(0.3, 0.05, 0.16, steel, 0, 0.14, 0);
    this.steerHead.add(head.build());
    const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, rubber);
      w.position.set(sx * 0.1, 0.09, 0);
      this.steerHead.add(w);
      this.wheels.push(w);
    }
    this.body.add(this.steerHead);

    const body = new MergeBuilder();
    body.box(0.6, 0.2, 0.16, orange, 0, 0.2, -0.16);
    body.box(0.5, 0.03, 0.12, steel, 0, 0.31, -0.16);
    for (const sx of [-1, 1]) {
      body.box(0.16, 0.07, 1.15, orange, sx * 0.2, 0.12, -0.8);
      body.box(0.12, 0.05, 0.14, orange, sx * 0.2, 0.1, -1.42);
      body.box(0.1, 0.02, 1.0, steel, sx * 0.2, 0.08, -0.8);
    }
    this.body.add(body.build());
    const rollGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10);
    rollGeo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) {
      for (const z of [-1.3, -0.3]) {
        const roll = new THREE.Mesh(rollGeo, rubber);
        roll.position.set(sx * 0.2, 0.05, z);
        this.body.add(roll);
        this.wheels.push(roll);
      }
    }

    for (let i = 0; i < vehicles.electric.capacity; i++) {
      const m = new THREE.Group();
      m.position.set(0, 0.16 + i * 1.18, -0.8);
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(0.95);
      m.visible = false;
      this.body.add(m);
      this.palletMounts.push(m);
    }

    const e = new MergeBuilder();
    e.box(0.62, 0.55, 0.42, mat(0x2f8f5b, 0.4, 0.3), 0, 0.42, 0.24);
    e.box(0.64, 0.05, 0.44, mat(0x1d2127, 0.6), 0, 0.72, 0.24);
    e.box(0.64, 0.08, 0.02, mat(0xf2c018, 0.5), 0, 0.5, 0.455);
    e.box(0.55, 0.04, 0.34, steel, 0, 0.07, 0.62);
    e.add(unitCylinder, mat(0x1d2127, 0.6), 0, 0.84, 0.3, 0, 0, 0, 0.08, 0.2, 0.08);
    this.electricParts.add(e.build());
    this.body.add(this.electricParts);
  }

  setElectric(on: boolean): void {
    this.cfg = on ? vehicles.electric : vehicles.pompwagen;
    this.electricParts.visible = on;
  }

  get capacity(): number {
    return this.cfg.capacity;
  }

  /** world position of the steering head (for effects) */
  get headPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.steerPos.x, 0.3, this.steerPos.y);
  }

  /** update carried pallet visuals (one product id per pallet) */
  setCargo(products: string[]): void {
    if (products.length !== this.cargo.length) this.squash = 1;
    this.cargo = [...products];
    this.palletMounts.forEach((m, i) => {
      const pid = products[i];
      m.visible = !!pid;
      if (!pid || m.userData.product === pid) return;
      m.clear();
      m.add(createPallet(pid));
      m.userData.product = pid;
    });
  }

  /** snap the trailer behind a new position (teleports) */
  reset(x: number, z: number, heading: number): void {
    this.steerPos.set(x - Math.sin(heading) * 1.4, z - Math.cos(heading) * 1.4);
    this.rollerPos.set(x - Math.sin(heading) * 2.8, z - Math.cos(heading) * 2.8);
  }

  /**
   * Follow the hands at (x, z) facing `heading`. Applies trailer links and
   * places every part. `speed` spins the wheels.
   */
  follow(dt: number, x: number, z: number, heading: number, speed: number, colliders: AABB[]): void {
    const hx = x - Math.sin(heading) * 0.34;
    const hz = z - Math.cos(heading) * 0.34;
    let dx = hx - this.steerPos.x;
    let dz = hz - this.steerPos.y;
    let len = Math.hypot(dx, dz) || 1e-6;
    this.steerPos.set(hx - (dx / len) * this.cfg.handleLength, hz - (dz / len) * this.cfg.handleLength);
    const sp = resolveCircle(this.steerPos.x, this.steerPos.y, 0.3, colliders);
    this.steerPos.set(sp.x, sp.z);
    dx = this.steerPos.x - this.rollerPos.x;
    dz = this.steerPos.y - this.rollerPos.y;
    len = Math.hypot(dx, dz) || 1e-6;
    this.rollerPos.set(this.steerPos.x - (dx / len) * this.cfg.bodyLength, this.steerPos.y - (dz / len) * this.cfg.bodyLength);
    const rp = resolveCircle(this.rollerPos.x, this.rollerPos.y, 0.3, colliders);
    this.rollerPos.set(rp.x, rp.z);

    const bodyYaw = Math.atan2(this.steerPos.x - this.rollerPos.x, this.steerPos.y - this.rollerPos.y);
    this.body.position.set(this.steerPos.x, 0, this.steerPos.y);
    this.body.rotation.y = bodyYaw;
    const handleYaw = Math.atan2(hx - this.steerPos.x, hz - this.steerPos.y);
    this.steerHead.rotation.y = handleYaw - bodyYaw;

    const hand = new THREE.Vector3(hx, 0.86, hz);
    const pivot = new THREE.Vector3(this.steerPos.x, 0.34, this.steerPos.y);
    const dir = hand.clone().sub(pivot);
    this.handleShaft.position.copy(hand).add(pivot).multiplyScalar(0.5);
    this.handleShaft.scale.set(1, dir.length(), 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.handleShaft.quaternion.copy(q);
    this.handle.position.copy(hand);
    this.handle.quaternion.copy(q);

    const spin = speed * dt * 10;
    for (const w of this.wheels) w.rotation.x += spin;
    this.beacon.visible = Math.sin(performance.now() * 0.012) > 0;

    // squash-and-stretch on pick up / drop
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 4);
      const s = 1 + Math.sin(this.squash * Math.PI) * 0.16;
      for (const m of this.palletMounts) m.scale.set(0.95 * s, 0.95 * (2 - s), 0.95 * s);
    }
  }
}
