import * as THREE from 'three';
import layout from '../config/layout.json';
import { loadTexture } from './Assets';
import { MergeBuilder, glow, mat, unitBox, unitCylinder, uvPlane } from './Merge';
import { asphaltTexture, chainLinkTexture, textSprite } from './Textures';

const Y = layout.yard;
const HALF_W = layout.warehouse.width / 2;
const LANE_X = Math.abs(layout.truck.outbound.approach.x);
const ASPHALT_TILE = 8;

/**
 * The company's own yard: asphalt with parking and dock bays, a chain-link
 * fence with sliding gates, barrier arms that lift for arriving trucks, a
 * guard booth, floodlights, staff cars, bikes and spare trailers.
 */
export class Yard {
  readonly group = new THREE.Group();
  private barriers: THREE.Group[] = [];
  private barrierOpen = 0;
  private wantOpen = false;

  constructor() {
    const fallback = asphaltTexture();
    fallback.repeat.set(1, 1);
    const asphaltMat = new THREE.MeshStandardMaterial({ map: fallback, color: 0xc9c9c9, roughness: 0.95 });
    loadTexture('asphalt_diff', {}, (t) => {
      asphaltMat.map = t;
      asphaltMat.needsUpdate = true;
    });

    const ground = new MergeBuilder();
    ground.add(uvPlane(Y.fenceX * 2, Y.fenceZ * 2, ASPHALT_TILE), asphaltMat, 0, -0.02, 0, -Math.PI / 2, 0, 0);
    this.group.add(ground.build(false, true));

    const b = new MergeBuilder();
    this.buildMarkings(b);
    this.buildFence(b);
    this.buildGates(b);
    this.buildLights(b);
    this.buildParked(b);
    this.group.add(b.build());
  }

  // ---------- paint ----------
  private buildMarkings(b: MergeBuilder): void {
    const white = mat(0xf2f2ee, 0.6);
    const yellow = mat(0xf2c018, 0.6);
    const stripe = (w: number, d: number, x: number, z: number, m = white): void => b.box(w, 0.012, d, m, x, 0.0, z);

    for (const lx of [-LANE_X, LANE_X]) {
      for (let z = -Y.fenceZ + 4; z <= Y.fenceZ - 4; z += 6) stripe(0.2, 3, lx, z);
    }
    for (const side of [-1, 1]) {
      for (const dz of layout.docks.doorZ) {
        for (const e of [-1, 1]) stripe(13, 0.18, side * (HALF_W + 7), dz + e * 2.1);
        stripe(0.18, 4.2, side * (HALF_W + 13.5), dz, yellow);
      }
    }
    for (let i = 0; i <= 6; i++) stripe(0.14, 5, -Y.fenceX + 4 + i * 2.8, Y.fenceZ - 5.5);
    for (let i = 0; i <= 3; i++) stripe(0.18, 12, -9 + i * 6, -Y.fenceZ + 9);
  }

  // ---------- fence ----------
  private buildFence(b: MergeBuilder): void {
    const link = new THREE.MeshStandardMaterial({
      map: chainLinkTexture(),
      color: 0xc3c9cf,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.5,
    });
    const post = mat(0x6e7782, 0.5, 0.6);
    const fh = 2.3;
    const run = (a0: number, a1: number, fixed: number, alongX: boolean): void => {
      const len = a1 - a0;
      if (len <= 0.1) return;
      const mid = (a0 + a1) / 2;
      const geo = uvPlane(len, fh, 0.55);
      if (alongX) b.add(geo, link, mid, fh / 2, fixed);
      else b.add(geo, link, fixed, fh / 2, mid, 0, Math.PI / 2, 0);
      b.add(unitBox, post, alongX ? mid : fixed, fh, alongX ? fixed : mid, 0, alongX ? 0 : Math.PI / 2, 0, len, 0.05, 0.05);
      const n = Math.ceil(len / 3);
      for (let i = 0; i <= n; i++) {
        const a = a0 + (i / n) * len;
        b.add(unitCylinder, post, alongX ? a : fixed, fh / 2, alongX ? fixed : a, 0, 0, 0, 0.09, fh + 0.1, 0.09);
      }
    };
    const g = Y.gateHalfWidth;
    for (const zs of [-1, 1]) {
      const z = zs * Y.fenceZ;
      run(-Y.fenceX, -LANE_X - g, z, true);
      run(-LANE_X + g, LANE_X - g, z, true);
      run(LANE_X + g, Y.fenceX, z, true);
    }
    for (const xs of [-1, 1]) run(-Y.fenceZ, Y.fenceZ, xs * Y.fenceX, false);
  }

  // ---------- gates, barriers, guard booth ----------
  private buildGates(b: MergeBuilder): void {
    const postMat = mat(0x3b4351, 0.5, 0.4);
    const red = mat(0xd23b3b, 0.5);
    const white = mat(0xf4f4f4, 0.5);
    const g = Y.gateHalfWidth;
    for (const zs of [-1, 1]) {
      for (const lx of [-LANE_X, LANE_X]) {
        const z = zs * Y.fenceZ;
        for (const e of [-1, 1]) b.box(0.4, 2.9, 0.4, postMat, lx + e * g, 1.45, z);
        // sliding gate parked open along the fence
        const gx = lx + (lx > 0 ? 1 : -1) * (g + 4.2);
        b.box(8, 0.08, 0.08, postMat, gx, 2.1, z + zs * 0.35);
        b.box(8, 0.08, 0.08, postMat, gx, 0.25, z + zs * 0.35);
        for (let i = 0; i <= 8; i++) b.box(0.05, 1.85, 0.05, postMat, gx - 4 + i, 1.18, z + zs * 0.35);
        // barrier arm: its own group so it can lift for a truck
        const bx = lx - (lx > 0 ? 1 : -1) * (g - 0.6);
        const bz = z - zs * 1.0;
        b.box(0.5, 1.0, 0.5, mat(0xf2c018, 0.5), bx, 0.5, bz);
        const arm = new THREE.Group();
        const ab = new MergeBuilder();
        for (let i = 0; i < 6; i++) {
          ab.add(unitBox, i % 2 ? white : red, 0, 0, 0.45 + i * 0.75, 0, 0, 0, 0.12, 0.12, 0.75);
        }
        arm.add(ab.build());
        arm.position.set(bx, 1.05, bz);
        arm.rotation.y = lx > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.group.add(arm);
        this.barriers.push(arm);
      }
    }
    // guard booth by the south-east entrance
    const hx = LANE_X + g + 3.2;
    const hz = Y.fenceZ - 3.5;
    b.box(3, 2.6, 2.6, mat(0xeef1f4, 0.6), hx, 1.3, hz);
    b.box(3.02, 0.8, 2.62, mat(0x24394d, 0.1, 0.7), hx, 1.75, hz);
    b.box(3.6, 0.18, 3.2, mat(0x2d333d, 0.6), hx, 2.7, hz);
    b.box(0.9, 1.9, 0.04, mat(0x7c8796, 0.5), hx - 0.6, 0.95, hz - 1.31);
    this.signMat = new THREE.MeshBasicMaterial({ map: textSprite('GATE · CHECK-IN', '#23427c', '#ffffff', 384, 80, 44) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), this.signMat);
    sign.position.set(hx, 3.1, hz + 1.3);
    this.group.add(sign);
    // company flag by the gate
    b.add(unitCylinder, mat(0xd6dce2, 0.3, 0.8), hx - 6, 4, hz + 1, 0, 0, 0, 0.12, 8, 0.12);
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4, 8, 1), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8, side: THREE.DoubleSide }));
    this.flag.position.set(hx - 4.9, 7.1, hz + 1);
    this.group.add(this.flag);
  }

  private flag: THREE.Mesh | null = null;
  private signMat: THREE.MeshBasicMaterial | null = null;

  /** the company's name on the gate sign and its colour on the flag */
  setCompany(name: string, color: string): void {
    if (this.signMat) {
      this.signMat.map?.dispose();
      this.signMat.map = textSprite(name.toUpperCase(), color, '#ffffff', 384, 80, 40);
      this.signMat.needsUpdate = true;
    }
    if (this.flag) (this.flag.material as THREE.MeshStandardMaterial).color.set(color);
  }

  // ---------- floodlights ----------
  private buildLights(b: MergeBuilder): void {
    const pole = mat(0x4a525d, 0.5, 0.6);
    const head = mat(0x2d333d, 0.5, 0.5);
    const lamp = glow(0xfff3d1);
    const light = (x: number, z: number, dirX: number, dirZ: number): void => {
      b.add(unitCylinder, pole, x, 4, z, 0, 0, 0, 0.18, 8, 0.18);
      b.add(unitCylinder, pole, x, 0.2, z, 0, 0, 0, 0.35, 0.4, 0.35);
      const ax = x + dirX * 0.9;
      const az = z + dirZ * 0.9;
      b.box(Math.abs(dirX) * 1.8 + 0.08, 0.08, Math.abs(dirZ) * 1.8 + 0.08, pole, ax, 7.95, az);
      const hx = x + dirX * 1.8;
      const hz = z + dirZ * 1.8;
      b.box(0.7, 0.16, 0.34, head, hx, 7.9, hz, dirZ !== 0 ? Math.PI / 2 : 0);
      b.box(0.56, 0.02, 0.24, lamp, hx, 7.81, hz, dirZ !== 0 ? Math.PI / 2 : 0);
    };
    for (const xs of [-1, 1]) {
      for (const z of [-24, -8, 8, 24]) light(xs * (LANE_X + 5.5), z, -xs, 0);
    }
  }

  // ---------- parked cars, bikes and trailers ----------
  private buildParked(b: MergeBuilder): void {
    const colors = [mat(0xd9d9d9, 0.3, 0.5), mat(0x243b6b, 0.3, 0.5), mat(0xa8322d, 0.3, 0.5)];
    const glass = mat(0x1d2a38, 0.1, 0.7);
    const tyre = mat(0x1c1d21, 0.9);
    for (let i = 0; i < 6; i++) {
      if (i === 3) continue;
      const x = -Y.fenceX + 5.4 + i * 2.8;
      const z = Y.fenceZ - 5.5;
      const body = colors[i % colors.length];
      b.box(1.75, 0.6, 4.2, body, x, 0.55, z);
      b.box(1.55, 0.55, 2.2, body, x, 1.1, z - 0.2);
      b.box(1.58, 0.42, 2.0, glass, x, 1.12, z - 0.2);
      for (const wx of [-0.82, 0.82]) for (const wz of [-1.3, 1.3]) b.add(unitCylinder, tyre, x + wx, 0.32, z + wz, 0, 0, Math.PI / 2, 0.64, 0.24, 0.64);
    }
    const frame = mat(0x333940, 0.5, 0.5);
    for (let i = 0; i < 4; i++) {
      const x = LANE_X + Y.gateHalfWidth + 1.2 + i * 0.7;
      const z = Y.fenceZ - 6.3;
      for (const dz of [-0.45, 0.45]) b.add(new THREE.TorusGeometry(0.3, 0.035, 6, 14), frame, x, 0.32, z + dz, 0, Math.PI / 2, 0);
      b.box(0.05, 0.05, 0.9, frame, x, 0.62, z);
      b.box(0.05, 0.4, 0.05, frame, x, 0.5, z + 0.2);
    }
    const white = mat(0xe9edf1, 0.5, 0.1);
    const alu = mat(0xaeb5bd, 0.35, 0.75);
    const dark = mat(0x24272d, 0.8);
    for (const tx of [-6, 6]) {
      const z = -Y.fenceZ + 9;
      b.box(2.5, 2.7, 9, white, tx, 2.1, z);
      b.box(2.55, 0.12, 9, alu, tx, 3.45, z);
      b.box(2.55, 0.18, 9, alu, tx, 0.8, z);
      for (const wz of [z + 2.5, z + 3.8]) for (const wx of [-0.95, 0.95]) b.add(unitCylinder, dark, tx + wx, 0.48, wz, 0, 0, Math.PI / 2, 0.96, 0.4, 0.96);
      for (const wx of [-0.85, 0.85]) b.box(0.1, 0.7, 0.1, dark, tx + wx, 0.35, z - 3.2);
    }
  }

  /** lift the barriers while a truck is near a gate */
  setBarriers(open: boolean): void {
    this.wantOpen = open;
  }

  update(dt: number, time: number): void {
    const goal = this.wantOpen ? 1 : 0;
    this.barrierOpen += (goal - this.barrierOpen) * Math.min(1, dt * 2.5);
    for (const arm of this.barriers) arm.rotation.x = -this.barrierOpen * Math.PI * 0.42;
    if (this.flag) {
      const pos = this.flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getX(i) + 1.1) / 2.2;
        pos.setZ(i, Math.sin(time * 4 + t * 6) * 0.22 * t);
      }
      pos.needsUpdate = true;
    }
  }
}
