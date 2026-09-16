import * as THREE from 'three';
import vehicles from '../config/vehicles.json';
import { createPallet } from './Pallet';
import { MergeBuilder, glow, mat, unitBox, unitCylinder } from './Merge';

export type ForkliftCfg = typeof vehicles.forklift;

/**
 * Counterbalance forklift: body with counterweight, overhead guard, two-stage
 * mast with a carriage that lifts smoothly, forks, rear steering wheels,
 * orange warning light. Origin at the front axle; the body extends backward
 * (-z local) so the rear swings out when steering, like the real thing.
 */
export class Forklift {
  readonly group = new THREE.Group();
  readonly cfg: ForkliftCfg = vehicles.forklift;
  /** local seat position for the driver */
  readonly seat = new THREE.Vector3(0, 0.95, -1.05);
  cargo: string[] = [];

  private mast = new THREE.Group();
  private stage2 = new THREE.Group();
  private carriage = new THREE.Group();
  private palletMount = new THREE.Group();
  private frontWheels: THREE.Mesh[] = [];
  private rearWheels: THREE.Group[] = [];
  private light: THREE.Mesh;
  private lift = 0;
  private liftGoal = 0;
  private liftHold = 0;
  private squash = 0;
  private time = 0;

  constructor(color = 0xf2b418) {
    this.build(color);
    this.light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0xff9a1a));
    this.light.position.set(0, 2.32, -1.4);
    this.group.add(this.light);
  }

  private build(color: number): void {
    const paint = mat(color, 0.4, 0.3);
    const dark = mat(0x23262c, 0.7);
    const steel = mat(0x5d6673, 0.45, 0.6);
    const chrome = mat(0xcfd5dc, 0.2, 0.9);
    const rubber = mat(0x1c1d21, 0.92);

    const b = new MergeBuilder();
    // chassis + counterweight (behind the rear axle)
    b.box(1.1, 0.5, 1.9, paint, 0, 0.55, -1.15);
    b.box(1.14, 0.55, 0.6, dark, 0, 0.5, -2.2);
    b.box(1.0, 0.25, 0.5, paint, 0, 0.95, -2.15);
    b.box(1.14, 0.06, 1.2, dark, 0, 0.82, -0.9); // floor plate
    b.box(0.5, 0.35, 0.5, dark, 0, 1.0, -1.05); // seat base
    b.box(0.5, 0.5, 0.12, dark, 0, 1.45, -1.3); // seat back
    b.add(unitCylinder, dark, 0, 1.28, -0.55, 0.9, 0, 0, 0.36, 0.04, 0.36); // steering wheel
    b.add(unitCylinder, steel, 0, 1.1, -0.6, 0.6, 0, 0, 0.05, 0.5, 0.05);
    // overhead guard
    for (const sx of [-0.5, 0.5]) {
      b.box(0.06, 1.6, 0.06, steel, sx, 1.7, -0.5);
      b.box(0.06, 1.55, 0.06, steel, sx, 1.7, -1.7);
      b.box(0.06, 0.06, 1.3, steel, sx, 2.25, -1.1);
    }
    for (let z = -1.6; z <= -0.6; z += 0.25) b.box(1.06, 0.04, 0.05, steel, 0, 2.25, z);
    b.box(1.06, 0.05, 1.3, mat(0xf2b418, 0.4, 0.3), 0, 2.28, -1.1);
    // mast base (outer channels, fixed)
    for (const sx of [-0.45, 0.45]) b.box(0.1, 2.2, 0.16, steel, sx, 1.1, 0.25);
    b.box(1.0, 0.1, 0.16, steel, 0, 2.15, 0.25);
    b.box(1.0, 0.1, 0.16, steel, 0, 0.35, 0.25);
    // rear lights + plate
    for (const sx of [-0.4, 0.4]) b.box(0.18, 0.08, 0.03, glow(0xd23b3b), sx, 0.7, -2.51);
    b.box(0.3, 0.12, 0.02, mat(0xf6c800, 0.5), 0, 0.5, -2.51);
    // front lights
    for (const sx of [-0.42, 0.42]) b.box(0.16, 0.1, 0.03, glow(0xfff4d6), sx, 1.0, -0.2);
    this.group.add(b.build());

    // second mast stage + carriage with forks
    const s2 = new MergeBuilder();
    for (const sx of [-0.35, 0.35]) s2.box(0.08, 2.2, 0.12, chrome, sx, 1.1, 0.34);
    s2.box(0.8, 0.08, 0.12, chrome, 0, 2.15, 0.34);
    this.stage2.add(s2.build());
    this.mast.add(this.stage2);

    const car = new MergeBuilder();
    car.box(0.9, 0.5, 0.08, steel, 0, 0.35, 0.44);
    car.box(0.9, 0.06, 0.08, dark, 0, 0.62, 0.44);
    for (const sx of [-0.28, 0.28]) {
      car.box(0.12, 0.5, 0.06, dark, sx, 0.3, 0.5);
      car.box(0.12, 0.04, 1.15, dark, sx, 0.06, 1.08);
    }
    this.carriage.add(car.build());
    this.palletMount.position.set(0, 0.08, 1.1);
    this.palletMount.rotation.y = Math.PI / 2;
    this.palletMount.scale.setScalar(0.95);
    this.palletMount.visible = false;
    this.carriage.add(this.palletMount);
    this.mast.add(this.carriage);
    this.mast.rotation.x = 0.03; // slight back tilt
    this.group.add(this.mast);

    const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 16);
    tyre.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(0.18, 0.18, 0.31, 12);
    rim.rotateZ(Math.PI / 2);
    for (const sx of [-0.62, 0.62]) {
      const w = new THREE.Mesh(tyre, rubber);
      w.add(new THREE.Mesh(rim, chrome));
      w.position.set(sx, 0.34, 0);
      w.castShadow = true;
      this.group.add(w);
      this.frontWheels.push(w);
      const rg = new THREE.Group();
      rg.position.set(sx * 0.82, 0.3, -1.5);
      const rw = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 14).rotateZ(Math.PI / 2), rubber);
      rw.castShadow = true;
      rg.add(rw);
      this.group.add(rg);
      this.rearWheels.push(rg);
    }
    void unitBox;
  }

  get capacity(): number {
    return this.cfg.capacity;
  }

  setCargo(products: string[]): void {
    if (products.length !== this.cargo.length) this.squash = 1;
    this.cargo = [...products];
    const pid = products[0];
    this.palletMount.visible = !!pid;
    if (pid && this.palletMount.userData.product !== pid) {
      this.palletMount.clear();
      this.palletMount.add(createPallet(pid));
      this.palletMount.userData.product = pid;
    }
  }

  /** raise the forks to a rack level, hold, and lower again */
  liftTo(height: number): void {
    this.liftGoal = height;
    this.liftHold = 0.7;
  }

  /**
   * Place the forklift: (x, z) is the front axle, `heading` the body yaw,
   * `steer` the rear-wheel angle (radians), `speed` spins the wheels.
   */
  place(dt: number, x: number, z: number, heading: number, steer: number, speed: number): void {
    this.time += dt;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    for (const rg of this.rearWheels) rg.rotation.y = -steer;
    const spin = speed * dt / 0.34;
    for (const w of this.frontWheels) w.rotation.x += spin;
    for (const rg of this.rearWheels) (rg.children[0] as THREE.Mesh).rotation.x += spin;
    this.light.visible = Math.sin(this.time * 9) > 0.2;

    // mast animation
    if (this.liftHold > 0) {
      this.liftHold -= dt;
      if (this.liftHold <= 0) this.liftGoal = 0;
    }
    const d = this.liftGoal - this.lift;
    const step = this.cfg.liftSpeed * dt;
    this.lift += Math.abs(d) < step ? d : Math.sign(d) * step;
    this.carriage.position.y = this.lift;
    this.stage2.position.y = Math.max(0, this.lift - 1.6);
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 4);
      const s = 1 + Math.sin(this.squash * Math.PI) * 0.16;
      this.palletMount.scale.set(0.95 * s, 0.95 * (2 - s), 0.95 * s);
    }
  }
}
