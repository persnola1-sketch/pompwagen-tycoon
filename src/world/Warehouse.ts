import * as THREE from 'three';
import layout from '../config/layout.json';
import { TruckKind } from '../core/EventBus';
import { loadTexture } from './Assets';
import { LAMP_X, TRUSS_Z, buildFloorMarkings } from './FloorMarkings';
import { MergeBuilder, glow, mat, unitBox, unitCylinder, unitSphere, uvBox } from './Merge';
import { palletWoodGeometry, palletWoodMaterial } from './Pallet';
import {
  SignKind,
  concreteTexture,
  corrugatedWallTexture,
  doorPanelTexture,
  hazardTexture,
  signAtlasTexture,
  signGeometry,
  textSprite,
} from './Textures';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const W = layout.warehouse.width;
const D = layout.warehouse.depth;
const H = layout.warehouse.wallHeight;
const ROOF = layout.warehouse.roofHeight;
const HALF_W = W / 2;
const HALF_D = D / 2;
const T = 0.3;
const WALL_TILE = 2.2;

/**
 * Warehouse interior: textured concrete floor with painted markings, metal wall
 * panels on a concrete plinth, steel columns, open roof trusses with high-bay
 * lamps, dock doors with rubber seals, levelers and dock lights, safety signs,
 * bollards, fire extinguishers and props. Static parts are merged per material.
 */
export class Warehouse {
  readonly group = new THREE.Group();
  readonly colliders: AABB[] = [];
  private dockLamps = new Map<TruckKind, { red: THREE.MeshBasicMaterial; green: THREE.MeshBasicMaterial }>();

  private wallMat: THREE.MeshStandardMaterial;
  private hazardMat: THREE.MeshStandardMaterial;
  private ceiling: THREE.Group;

  constructor() {
    this.wallMat = new THREE.MeshStandardMaterial({ color: 0xdde3ea, roughness: 0.55, metalness: 0.35 });
    const fallback = corrugatedWallTexture();
    fallback.repeat.set(1, 1);
    this.wallMat.map = fallback;
    loadTexture('metal_wall_diff', {}, (t) => {
      this.wallMat.map = t;
      this.wallMat.needsUpdate = true;
    });
    loadTexture('metal_wall_nor', { color: false }, (t) => {
      this.wallMat.normalMap = t;
      this.wallMat.normalScale.set(0.8, 0.8);
      this.wallMat.needsUpdate = true;
    });
    const hz = hazardTexture();
    hz.repeat.set(2, 2);
    this.hazardMat = new THREE.MeshStandardMaterial({ map: hz, roughness: 0.55 });

    this.buildFloor();
    const b = new MergeBuilder();
    this.buildWalls(b);
    this.buildDocks(b);
    this.buildSafety(b);
    this.buildProps(b);
    this.group.add(b.build());
    this.ceiling = this.buildCeiling();
    this.group.add(this.ceiling);
  }

  private collide(x: number, z: number, hw: number, hd: number): void {
    this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  // ---------- floor ----------
  private buildFloor(): void {
    const tex = concreteTexture();
    tex.repeat.set(W / 6, D / 6);
    const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, metalness: 0.02 });
    floorMat.color.setRGB(1.55, 1.52, 1.47);
    loadTexture('concrete_diff', { repeat: [W / 7, D / 7] }, (t) => {
      floorMat.map = t;
      floorMat.needsUpdate = true;
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor, buildFloorMarkings());
  }

  // ---------- walls, plinth, columns ----------
  private buildWalls(b: MergeBuilder): void {
    const plinth = mat(0x9ea2a8, 0.9);
    const column = mat(0x46546a, 0.5, 0.5);
    const eave = mat(0x2d333d, 0.6, 0.4);
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number, collide: boolean): void => {
      b.add(uvBox(w, h, d, WALL_TILE), this.wallMat, x, y, z);
      if (collide) this.collide(x, z, w / 2, d / 2);
    };

    // north wall (solid) and low south parapet so the camera sees in
    wall(W + T * 2, H, T, 0, H / 2, -HALF_D - T / 2, true);
    const sh = layout.warehouse.southWallHeight;
    wall(W + T * 2, sh, T, 0, sh / 2, HALF_D + T / 2, true);
    b.box(W + T * 2, 0.1, T + 0.1, mat(0xf2c018, 0.5), 0, sh + 0.05, HALF_D + T / 2);

    // west/east walls with door openings
    const { doorZ, doorWidth, doorHeight } = layout.docks;
    for (const side of [-1, 1]) {
      const x = side * (HALF_W + T / 2);
      const edges = [-HALF_D, doorZ[0] - doorWidth / 2, doorZ[0] + doorWidth / 2, doorZ[1] - doorWidth / 2, doorZ[1] + doorWidth / 2, HALF_D];
      for (let i = 0; i < edges.length - 1; i += 2) {
        const z0 = edges[i];
        const z1 = edges[i + 1];
        if (z1 - z0 > 0.01) wall(T, H, z1 - z0, x, H / 2, (z0 + z1) / 2, true);
      }
      for (const dz of doorZ) wall(T, H - doorHeight, doorWidth, x, doorHeight + (H - doorHeight) / 2, dz, false);
      // plinth segments
      for (let i = 0; i < edges.length - 1; i += 2) {
        const z0 = edges[i];
        const z1 = edges[i + 1];
        if (z1 - z0 > 0.01) b.box(0.12, 1.0, z1 - z0, plinth, side * (HALF_W - 0.06), 0.5, (z0 + z1) / 2);
      }
      for (const cz of [-11, 0, 11]) {
        b.box(0.3, H, 0.3, column, side * (HALF_W - 0.18), H / 2, cz);
        b.box(0.5, 0.03, 0.5, eave, side * (HALF_W - 0.18), 0.015, cz);
      }
    }
    b.box(W, 1.0, 0.12, plinth, 0, 0.5, -HALF_D + 0.06);
    for (const cx of [-15, -9, -3, 3, 9, 15]) {
      b.box(0.3, H, 0.3, column, cx, H / 2, -HALF_D + 0.18);
      b.box(0.5, 0.03, 0.5, eave, cx, 0.015, -HALF_D + 0.18);
    }
    // eave beam on top of the tall walls
    b.box(W + T * 2, 0.3, T + 0.1, eave, 0, H + 0.15, -HALF_D - T / 2);
    for (const side of [-1, 1]) b.box(T + 0.1, 0.3, D, eave, side * (HALF_W + T / 2), H + 0.15, 0);
  }

  // ---------- dock doors ----------
  private buildDocks(b: MergeBuilder): void {
    const { doorZ, doorWidth, doorHeight } = layout.docks;
    const rubber = mat(0x1e1f23, 0.95);
    const steel = mat(0x5d6673, 0.45, 0.6);
    const doorMat = new THREE.MeshStandardMaterial({ map: doorPanelTexture(), roughness: 0.5, metalness: 0.3 });
    const housing = mat(0x2a2e36, 0.6);
    for (const side of [-1, 1]) {
      const inner = side * (HALF_W - 0.02);
      const outer = side * (HALF_W + T);
      doorZ.forEach((dz, idx) => {
        const active = idx === 0;
        // steel frame
        for (const e of [-1, 1]) b.box(0.14, doorHeight, 0.14, steel, inner - side * 0.07, doorHeight / 2, dz + e * (doorWidth / 2 + 0.07));
        // rubber seal pads outside + bumpers
        for (const e of [-1, 1]) {
          b.box(0.4, doorHeight + 0.4, 0.35, rubber, outer + side * 0.2, (doorHeight + 0.4) / 2, dz + e * (doorWidth / 2 + 0.05));
          b.box(0.16, 0.45, 0.3, rubber, outer + side * 0.08, 0.55, dz + e * 1.05);
        }
        b.box(0.4, 0.6, doorWidth + 0.8, rubber, outer + side * 0.2, doorHeight + 0.3, dz);
        // sectional door: rolled up on the active dock, closed on the spare
        if (active) {
          b.add(uvBox(0.6, 0.55, doorWidth - 0.1, 1), doorMat, inner - side * 0.4, doorHeight - 0.32, dz);
          for (const e of [-1, 1]) b.box(2.4, 0.06, 0.06, steel, side * (HALF_W - 1.2), doorHeight - 0.05, dz + e * (doorWidth / 2 - 0.05));
        } else {
          b.add(unitBox, doorMat, side * (HALF_W + 0.02), doorHeight / 2, dz, 0, 0, 0, 0.08, doorHeight, doorWidth);
        }
        // dock leveler with striped edges
        b.box(2.2, 0.05, doorWidth - 0.6, steel, side * (HALF_W - 1.1), 0.025, dz);
        for (const e of [-1, 1]) b.add(unitBox, this.hazardMat, side * (HALF_W - 1.1), 0.03, dz + e * (doorWidth / 2 - 0.25), 0, 0, 0, 2.2, 0.06, 0.14);
        // yellow guard posts either side of the door
        for (const e of [-1, 1]) {
          const gz = dz + e * (doorWidth / 2 + 0.35);
          b.add(unitCylinder, this.hazardMat, side * (HALF_W - 0.45), 0.6, gz, 0, 0, 0, 0.24, 1.2, 0.24);
          this.collide(side * (HALF_W - 0.45), gz, 0.14, 0.14);
        }
        // outside flood lamp
        b.box(0.06, 0.06, 0.8, housing, outer + side * 0.4, doorHeight + 1.0, dz);
        b.box(0.3, 0.14, 0.3, housing, outer + side * 0.75, doorHeight + 0.95, dz);
        b.box(0.26, 0.02, 0.26, glow(0xfff1c9), outer + side * 0.75, doorHeight + 0.87, dz);

        // collider: doorway + where a docked trailer pokes in
        this.colliders.push({
          minX: Math.min(side * HALF_W - side * 1.7, side * HALF_W + side * 0.3),
          maxX: Math.max(side * HALF_W - side * 1.7, side * HALF_W + side * 0.3),
          minZ: dz - doorWidth / 2,
          maxZ: dz + doorWidth / 2,
        });

        // dock number sign above the door, facing inside
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(1.9, 0.5),
          new THREE.MeshBasicMaterial({ map: textSprite(`DOCK ${idx + 1} · ${side < 0 ? 'IN' : 'OUT'}`, side < 0 ? '#2563b8' : '#c2571f', '#ffffff', 384, 100, 54) }),
        );
        sign.position.set(inner - side * 0.03, doorHeight + 0.75, dz);
        sign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.group.add(sign);

        if (active) {
          // traffic light: red = no truck, green = docked
          const lx = side * (HALF_W - 0.2);
          const lz = dz - (doorWidth / 2 + 0.9);
          b.box(0.16, 0.46, 0.2, housing, lx, 2.2, lz);
          const red = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
          const green = new THREE.MeshBasicMaterial({ color: 0x1f3a26 });
          const lampGeo = new THREE.SphereGeometry(0.07, 10, 8);
          const r = new THREE.Mesh(lampGeo, red);
          r.position.set(lx - side * 0.09, 2.31, lz);
          const g = new THREE.Mesh(lampGeo, green);
          g.position.set(lx - side * 0.09, 2.09, lz);
          this.group.add(r, g);
          this.dockLamps.set(side < 0 ? 'supplier' : 'customer', { red, green });
        }
      });
    }
  }

  setDockLight(kind: TruckKind, docked: boolean): void {
    const l = this.dockLamps.get(kind);
    if (!l) return;
    l.red.color.setHex(docked ? 0x3a1614 : 0xff3b30);
    l.green.color.setHex(docked ? 0x35e06a : 0x1f3a26);
  }

  // ---------- signs, bollards, extinguishers ----------
  private buildSafety(b: MergeBuilder): void {
    const signMat = new THREE.MeshBasicMaterial({ map: signAtlasTexture() });
    const signGeos = new Map<SignKind, THREE.PlaneGeometry>();
    const sign = (kind: SignKind, x: number, y: number, z: number, ry: number, scale = 0.9): void => {
      let geo = signGeos.get(kind);
      if (!geo) {
        geo = signGeometry(kind);
        signGeos.set(kind, geo);
      }
      b.add(geo, signMat, x, y, z, 0, ry, 0, scale, scale, 1);
    };
    const northZ = -HALF_D + 0.35;
    sign('forklift', -12, 3.4, northZ, 0);
    sign('hivis', -6, 3.4, northZ, 0);
    sign('speed', 0, 3.4, northZ, 0);
    sign('helmet', 6, 3.4, northZ, 0);
    sign('nosmoking', 12, 3.4, northZ, 0);
    for (const side of [-1, 1]) {
      sign('forklift', side * (HALF_W - 0.35), 3.2, -8.5, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0.8);
      sign('speed', side * (HALF_W - 0.35), 3.2, 8.5, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0.8);
    }

    // personnel exit door in the north-east corner
    const doorX = 16.3;
    b.box(1.3, 2.35, 0.1, mat(0x2d333d, 0.6, 0.4), doorX, 1.175, -HALF_D + 0.05);
    b.box(1.05, 2.15, 0.12, mat(0x7c8796, 0.5, 0.3), doorX, 1.075, -HALF_D + 0.06);
    b.box(0.2, 0.04, 0.06, mat(0xd6dce2, 0.2, 0.9), doorX + 0.35, 1.05, -HALF_D + 0.14);
    sign('exit', doorX, 2.95, -HALF_D + 0.2, 0, 0.7);

    // fire extinguishers on columns and walls
    const red = mat(0xc4221f, 0.35, 0.1);
    const black = mat(0x1c1c1c, 0.6);
    const ext = (x: number, z: number, ry: number): void => {
      const fx = x + Math.sin(ry) * 0.2;
      const fz = z + Math.cos(ry) * 0.2;
      b.add(unitCylinder, red, fx, 0.95, fz, 0, 0, 0, 0.2, 0.55, 0.2);
      b.add(unitSphere, red, fx, 1.22, fz, 0, 0, 0, 0.2, 0.14, 0.2);
      b.box(0.08, 0.1, 0.08, black, fx, 1.33, fz);
      b.box(0.14, 0.04, 0.12, black, fx, 1.34, fz + Math.cos(ry) * 0.06);
      b.box(0.28, 0.06, 0.06, black, x + Math.sin(ry) * 0.08, 1.0, z + Math.cos(ry) * 0.08, ry);
      sign('fire', x + Math.sin(ry) * 0.05, 1.95, z + Math.cos(ry) * 0.05, ry, 0.45);
    };
    ext(-9, -HALF_D + 0.33, 0);
    ext(9, -HALF_D + 0.33, 0);
    ext(-HALF_W + 0.33, -11, Math.PI / 2);
    ext(HALF_W - 0.33, 11, -Math.PI / 2);

    // bollards: yellow with black stripes
    const bollard = (x: number, z: number): void => {
      b.add(unitCylinder, this.hazardMat, x, 0.5, z, 0, 0, 0, 0.26, 1.0, 0.26);
      b.add(unitSphere, mat(0x1c1c1c, 0.5), x, 1.0, z, 0, 0, 0, 0.26, 0.14, 0.26);
      this.collide(x, z, 0.15, 0.15);
    };
    const p = layout.pads;
    for (const bx of [-11.8, 11.8]) {
      bollard(bx, -11.6);
      bollard(bx, 5.4);
    }
    bollard(p.office.x - 1.7, HALF_D - 1.9);
    bollard(p.office.x + 1.7, HALF_D - 1.9);
    bollard(p.upgradeElectric.x + 3.6, HALF_D - 2.4);
  }

  // ---------- props: office desk, charger, pallets, wrapper, bins ----------
  private buildProps(b: MergeBuilder): void {
    const p = layout.pads;
    const desk = mat(0x9a7b52, 0.7);
    const dark = mat(0x23262c, 0.6);
    const grey = mat(0x8b939e, 0.5, 0.4);
    const deskZ = HALF_D - 1.0;

    // office desk with monitor, keyboard, chair, cabinet, water cooler
    b.box(2.4, 0.06, 0.85, desk, p.office.x, 0.76, deskZ);
    for (const dx of [-1.1, 1.1]) b.box(0.06, 0.73, 0.8, grey, p.office.x + dx, 0.37, deskZ);
    b.box(0.7, 0.42, 0.04, dark, p.office.x - 0.3, 1.1, deskZ + 0.15);
    b.box(0.64, 0.36, 0.01, glow(0x5aa9e6), p.office.x - 0.3, 1.1, deskZ + 0.125);
    b.box(0.06, 0.2, 0.06, dark, p.office.x - 0.3, 0.87, deskZ + 0.18);
    b.box(0.45, 0.02, 0.15, dark, p.office.x - 0.3, 0.8, deskZ - 0.15);
    b.box(0.5, 0.05, 0.5, dark, p.office.x - 0.3, 0.48, deskZ - 0.65);
    b.box(0.5, 0.55, 0.06, dark, p.office.x - 0.3, 0.78, deskZ - 0.9);
    b.box(0.06, 0.45, 0.06, grey, p.office.x - 0.3, 0.23, deskZ - 0.65);
    b.box(0.5, 1.2, 0.6, grey, p.office.x + 1.8, 0.6, deskZ);
    for (const y of [0.3, 0.7, 1.05]) b.box(0.2, 0.03, 0.02, dark, p.office.x + 1.8, y, deskZ - 0.31);
    b.box(0.35, 1.0, 0.35, mat(0xeef1f4, 0.4), p.office.x - 1.8, 0.5, deskZ);
    b.add(unitCylinder, mat(0x6fb6ea, 0.2, 0.1), p.office.x - 1.8, 1.2, deskZ, 0, 0, 0, 0.28, 0.4, 0.28);
    this.collide(p.office.x, deskZ, 2.1, 0.6);
    // name plate lying on top of the parapet so it never hides the pad
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.5),
      new THREE.MeshBasicMaterial({ map: textSprite('ORDERS & OFFICE', '#ffffff', '#23427c', 384, 80, 40) }),
    );
    board.position.set(p.office.x, layout.warehouse.southWallHeight + 0.12, HALF_D + T / 2);
    board.rotation.x = -Math.PI / 2 + 0.25;
    this.group.add(board);

    // EV charger for the electric pompwagen
    const cx = p.upgradeElectric.x + 2.5;
    const cz = HALF_D - 0.5;
    b.box(0.6, 1.5, 0.35, mat(0xeef1f4, 0.4), cx, 0.75, cz);
    b.box(0.62, 0.3, 0.37, mat(0x2f8f5b, 0.4), cx, 1.35, cz);
    b.box(0.34, 0.22, 0.02, glow(0x46e38a), cx, 1.0, cz - 0.18);
    b.add(new THREE.TorusGeometry(0.22, 0.03, 6, 12, Math.PI * 1.5), dark, cx + 0.34, 0.8, cz - 0.1, 0, Math.PI / 2, 0);
    this.collide(cx, cz, 0.4, 0.3);

    // stacks of empty pallets between the inbound doors
    const wood = palletWoodMaterial();
    const pw = palletWoodGeometry();
    for (const [sz, n] of [[-1.6, 7], [0.1, 4], [1.7, 9]] as [number, number][]) {
      for (let i = 0; i < n; i++) b.add(pw, wood, -HALF_W + 0.75, i * 0.145, sz, 0, Math.PI / 2 + (i % 2) * 0.04, 0);
      this.collide(-HALF_W + 0.75, sz, 0.45, 0.65);
    }

    // stretch-wrap machine on the outbound side
    const wx = HALF_W - 1.6;
    const wz = 0.2;
    b.add(unitCylinder, grey, wx, 0.06, wz, 0, 0, 0, 1.9, 0.12, 1.9);
    b.box(0.25, 2.4, 0.25, mat(0x2f6fb4, 0.5, 0.3), wx + 1.1, 1.2, wz);
    b.box(0.35, 0.3, 0.35, mat(0x2f6fb4, 0.5, 0.3), wx + 1.1, 1.3, wz);
    b.add(unitCylinder, mat(0xe9f1f7, 0.2), wx + 0.85, 1.3, wz, 0, 0, 0, 0.14, 0.5, 0.14);
    b.box(0.4, 1.1, 0.3, mat(0xeef1f4, 0.5), wx + 1.1, 0.55, wz - 0.9);
    b.box(0.3, 0.18, 0.02, glow(0x5aa9e6), wx + 1.1, 0.9, wz - 1.06);
    this.collide(wx, wz, 1.1, 1.1);

    // wheelie bins in the south-west corner
    for (const [bx, col] of [[-HALF_W + 0.7, 0x2f7d45], [-HALF_W + 1.5, 0x7a7f87]] as [number, number][]) {
      b.box(0.62, 1.0, 0.7, mat(col, 0.7), bx, 0.5, HALF_D - 0.6);
      b.box(0.66, 0.06, 0.74, mat(col, 0.6), bx, 1.03, HALF_D - 0.62);
    }
    this.collide(-HALF_W + 1.1, HALF_D - 0.6, 0.8, 0.4);
  }

  // ---------- roof trusses + high-bay lamps (no shadows, merged) ----------
  private buildCeiling(): THREE.Group {
    const b = new MergeBuilder();
    const steel = mat(0x6b7585, 0.6, 0.5);
    const housing = mat(0xa3abb5, 0.4, 0.4);
    const depth = 0.8;
    const panel = 1.5;
    const diag = Math.atan2(panel, depth);
    const diagLen = Math.hypot(panel, depth);
    for (const tz of TRUSS_Z) {
      b.box(W, 0.14, 0.14, steel, 0, ROOF, tz);
      b.box(W, 0.1, 0.1, steel, 0, ROOF - depth, tz);
      let i = 0;
      for (let x = -HALF_W; x < HALF_W - 0.01; x += panel, i++) {
        b.box(0.06, depth, 0.06, steel, x, ROOF - depth / 2, tz);
        b.add(unitBox, steel, x + panel / 2, ROOF - depth / 2, tz, 0, 0, i % 2 ? diag : -diag, 0.05, diagLen, 0.05);
      }
      for (const lx of LAMP_X) {
        b.add(unitCylinder, housing, lx, ROOF - depth - 0.25, tz, 0, 0, 0, 0.025, 0.5, 0.025);
        b.add(new THREE.CylinderGeometry(0.07, 0.22, 0.22, 12), housing, lx, ROOF - depth - 0.6, tz);
        b.add(unitCylinder, glow(0xfff1c9), lx, ROOF - depth - 0.72, tz, 0, 0, 0, 0.4, 0.02, 0.4);
      }
    }
    return b.build(false, false);
  }

  /** hide roof trusses when zoomed in so they never cover the worker */
  setCeilingVisible(visible: boolean): void {
    this.ceiling.visible = visible;
  }
}
