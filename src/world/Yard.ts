import * as THREE from 'three';
import layout from '../config/layout.json';
import { loadModel, loadTexture, modelParts } from './Assets';
import { MergeBuilder, glow, mat, unitBox, unitCylinder, uvBox, uvPlane } from './Merge';
import { asphaltTexture, chainLinkTexture, corrugatedWallTexture, grassTexture, textSprite } from './Textures';

const Y = layout.yard;
const HALF_W = layout.warehouse.width / 2;
const LANE_X = Math.abs(layout.truck.outbound.approach.x);
const ROAD_Z = Y.fenceZ + Y.roadOffset;
const ASPHALT_TILE = 8;

interface Placement {
  x: number;
  z: number;
  ry: number;
  s: number;
}

/** tiny deterministic RNG so the yard looks the same every load */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

/**
 * Truck yard and surroundings: asphalt with parking lines, roads with
 * sidewalks, chain-link fence with gates, barrier arms and a guard booth,
 * streetlights, parked cars and trailers, neighbouring halls, and CC0 Kenney
 * trees and city buildings (instanced) once they load.
 */
export class Yard {
  readonly group = new THREE.Group();
  private asphaltMat: THREE.MeshStandardMaterial;
  private roadMat: THREE.MeshStandardMaterial;

  constructor() {
    const fallback = asphaltTexture();
    fallback.repeat.set(1, 1);
    this.asphaltMat = new THREE.MeshStandardMaterial({ map: fallback, color: 0xc9c9c9, roughness: 0.95 });
    this.roadMat = new THREE.MeshStandardMaterial({ map: fallback, color: 0x8a8a8a, roughness: 0.9 });
    loadTexture('asphalt_diff', {}, (t) => {
      for (const m of [this.asphaltMat, this.roadMat]) {
        m.map = t;
        m.needsUpdate = true;
      }
    });

    this.buildGround();
    const b = new MergeBuilder();
    this.buildMarkings(b);
    this.buildFence(b);
    this.buildGates(b);
    this.buildLights(b);
    this.buildParked(b);
    this.buildHalls(b);
    this.group.add(b.build());
    void this.loadScenery();
  }

  // ---------- ground (merged, receives but never casts shadows) ----------
  private buildGround(): void {
    const b = new MergeBuilder();
    const flat = (geo: THREE.PlaneGeometry, material: THREE.Material, x: number, y: number, z: number): void =>
      b.add(geo, material, x, y, z, -Math.PI / 2, 0, 0);
    const grass = grassTexture();
    grass.repeat.set(60, 60);
    flat(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }), 0, -0.06, 0);
    flat(uvPlane(Y.fenceX * 2, Y.fenceZ * 2, ASPHALT_TILE), this.asphaltMat, 0, -0.02, 0);
    for (const zs of [-1, 1]) {
      flat(uvPlane(700, Y.roadWidth, ASPHALT_TILE), this.roadMat, 0, -0.03, zs * ROAD_Z);
      for (const lx of [-LANE_X, LANE_X]) {
        flat(uvPlane(Y.gateHalfWidth * 2, Y.roadOffset, ASPHALT_TILE), this.asphaltMat, lx, -0.025, zs * (Y.fenceZ + Y.roadOffset / 2));
      }
    }
    this.group.add(b.build(false, true));
  }

  // ---------- paint ----------
  private buildMarkings(b: MergeBuilder): void {
    const white = mat(0xf2f2ee, 0.6);
    const yellow = mat(0xf2c018, 0.6);
    const stripe = (w: number, d: number, x: number, z: number, m = white): void => b.box(w, 0.012, d, m, x, 0.0, z);

    // truck lanes
    for (const lx of [-LANE_X, LANE_X]) {
      for (let z = -Y.fenceZ + 4; z <= Y.fenceZ - 4; z += 6) stripe(0.2, 3, lx, z);
    }
    // dock bays in front of every door
    for (const side of [-1, 1]) {
      for (const dz of layout.docks.doorZ) {
        for (const e of [-1, 1]) stripe(15, 0.18, side * (HALF_W + 7.8), dz + e * 2.1);
        stripe(0.18, 4.2, side * (HALF_W + 15.3), dz, yellow);
      }
    }
    // roads: centre dashes and edge lines
    for (const zs of [-1, 1]) {
      const z = zs * ROAD_Z;
      for (let x = -340; x < 340; x += 7) stripe(3.2, 0.16, x, z);
      for (const e of [-1, 1]) stripe(680, 0.14, 0, z + e * (Y.roadWidth / 2 - 0.4));
      // stop bars at the gates
      for (const lx of [-LANE_X, LANE_X]) stripe(Y.gateHalfWidth * 2 - 1, 0.35, lx, zs * (Y.fenceZ - 1.2));
    }
    // car park (south-west) and trailer park (north)
    for (let i = 0; i <= 6; i++) stripe(0.14, 5, -Y.fenceX + 4 + i * 2.8, Y.fenceZ - 5.5);
    for (let i = 0; i <= 3; i++) stripe(0.18, 12, -9 + i * 6, -Y.fenceZ + 9);

    // sidewalks (split around the gate aprons)
    const curb = mat(0xb9b6ae, 0.9);
    for (const zs of [-1, 1]) {
      const z = zs * (ROAD_Z - Y.roadWidth / 2 - 1.1);
      const cuts = [-340, -LANE_X - Y.gateHalfWidth, -LANE_X + Y.gateHalfWidth, LANE_X - Y.gateHalfWidth, LANE_X + Y.gateHalfWidth, 340];
      for (let i = 0; i < cuts.length - 1; i += 2) {
        b.box(cuts[i + 1] - cuts[i], 0.14, 2.2, curb, (cuts[i] + cuts[i + 1]) / 2, 0.05, z);
      }
    }
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
        // raised barrier arm with red/white segments
        const bx = lx - (lx > 0 ? 1 : -1) * (g - 0.6);
        b.box(0.5, 1.0, 0.5, mat(0xf2c018, 0.5), bx, 0.5, z - zs * 1.0);
        for (let i = 0; i < 6; i++) {
          const y = 1.2 + i * 0.75;
          b.add(unitBox, i % 2 ? white : red, bx, y, z - zs * 1.0, 0, 0, 0, 0.12, 0.75, 0.12);
        }
      }
    }
    // guard booth by the south-east entrance
    const hx = LANE_X + g + 3.2;
    const hz = Y.fenceZ - 3.5;
    b.box(3, 2.6, 2.6, mat(0xeef1f4, 0.6), hx, 1.3, hz);
    b.box(3.02, 0.8, 2.62, mat(0x24394d, 0.1, 0.7), hx, 1.75, hz);
    b.box(3.6, 0.18, 3.2, mat(0x2d333d, 0.6), hx, 2.7, hz);
    b.box(0.9, 1.9, 0.04, mat(0x7c8796, 0.5), hx - 0.6, 0.95, hz - 1.31);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.55),
      new THREE.MeshBasicMaterial({ map: textSprite('GATE · CHECK-IN', '#23427c', '#ffffff', 384, 80, 44) }),
    );
    sign.position.set(hx, 3.1, hz + 1.3);
    this.group.add(sign);
  }

  // ---------- streetlights ----------
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
      for (const z of [-36, -18, 0, 18, 36]) light(xs * (LANE_X + 6.5), z, -xs, 0);
    }
    for (const zs of [-1, 1]) {
      for (let x = -75; x <= 75; x += 25) light(x, zs * (ROAD_Z - Y.roadWidth / 2 - 1.1), 0, zs);
    }
  }

  // ---------- parked cars and trailers ----------
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
    // bikes by the booth (Dutch flavour)
    const frame = mat(0x333940, 0.5, 0.5);
    for (let i = 0; i < 4; i++) {
      const x = LANE_X + Y.gateHalfWidth + 1.2 + i * 0.7;
      const z = Y.fenceZ - 6.3;
      for (const dz of [-0.45, 0.45]) b.add(new THREE.TorusGeometry(0.3, 0.035, 6, 14), frame, x, 0.32, z + dz, 0, Math.PI / 2, 0);
      b.box(0.05, 0.05, 0.9, frame, x, 0.62, z);
      b.box(0.05, 0.4, 0.05, frame, x, 0.5, z + 0.2);
    }
    // spare trailers in the north trailer park
    const white = mat(0xe9edf1, 0.5, 0.1);
    const alu = mat(0xaeb5bd, 0.35, 0.75);
    const dark = mat(0x24272d, 0.8);
    for (const tx of [-6, 0, 6]) {
      if (tx === 0) continue;
      const z = -Y.fenceZ + 9;
      b.box(2.5, 2.7, 9, white, tx, 2.1, z);
      b.box(2.55, 0.12, 9, alu, tx, 3.45, z);
      b.box(2.55, 0.18, 9, alu, tx, 0.8, z);
      for (const wz of [z + 2.5, z + 3.8]) for (const wx of [-0.95, 0.95]) b.add(unitCylinder, dark, tx + wx, 0.48, wz, 0, 0, Math.PI / 2, 0.96, 0.4, 0.96);
      for (const wx of [-0.85, 0.85]) b.box(0.1, 0.7, 0.1, dark, tx + wx, 0.35, z - 3.2);
    }
  }

  // ---------- neighbouring industrial halls ----------
  private buildHalls(b: MergeBuilder): void {
    const wallTex = corrugatedWallTexture();
    wallTex.repeat.set(1, 1);
    const walls = [
      new THREE.MeshStandardMaterial({ map: wallTex, color: 0xb7c3cf, roughness: 0.6, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: wallTex, color: 0xd8cfc0, roughness: 0.6, metalness: 0.3 }),
    ];
    const roof = mat(0x4a4f57, 0.8);
    const doorMat = mat(0x5b6576, 0.5, 0.4);
    const halls: [number, number, number, number, number, string][] = [
      [-(Y.fenceX + 22), -10, 28, 11, 50, 'NOORD LOGISTIEK'],
      [Y.fenceX + 22, 12, 28, 9, 44, 'KOELHUIS DELTA'],
      [-(Y.fenceX + 18), 44, 20, 8, 22, 'PAKKET CENTRUM'],
    ];
    halls.forEach(([x, z, w, h, d, name], i) => {
      b.add(uvBox(w, h, d, 2.5), walls[i % 2], x, h / 2, z);
      b.box(w + 0.6, 0.4, d + 0.6, roof, x, h + 0.2, z);
      const face = x > 0 ? x - w / 2 - 0.02 : x + w / 2 + 0.02;
      for (let k = -1; k <= 1; k++) b.box(0.1, 4, 3.4, doorMat, face, 2, z + k * (d / 4));
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 1.6),
        new THREE.MeshBasicMaterial({ map: textSprite(name, '#ffffff', '#23427c', 512, 80, 46) }),
      );
      sign.position.set(face + (x > 0 ? -0.05 : 0.05), h - 1.6, z);
      sign.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.group.add(sign);
    });
  }

  // ---------- Kenney CC0 scenery ----------
  private async loadScenery(): Promise<void> {
    const rand = rng(1234);
    const trees: Record<string, Placement[]> = {
      tree_oak: [], tree_default: [], tree_detailed: [], tree_pineRoundA: [], tree_pineTallC: [],
    };
    const treeNames = Object.keys(trees);
    const plant = (x: number, z: number, s = 4.6): void => {
      trees[treeNames[Math.floor(rand() * treeNames.length)]].push({ x, z, ry: rand() * Math.PI * 2, s: s * (0.8 + rand() * 0.45) });
    };
    // rows along the fence outside, between fence and sidewalk
    for (let z = -Y.fenceZ + 4; z <= Y.fenceZ - 4; z += 8) {
      plant(-Y.fenceX - 4, z + rand() * 3);
      plant(Y.fenceX + 4, z + rand() * 3);
    }
    for (let x = -Y.fenceX; x <= Y.fenceX; x += 11) {
      if (Math.abs(Math.abs(x) - LANE_X) < Y.gateHalfWidth + 3) continue;
      plant(x + rand() * 3, Y.fenceZ + 3);
      plant(x + rand() * 3, -Y.fenceZ - 3);
    }
    // loose clusters further out
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = 90 + rand() * 60;
      plant(Math.cos(a) * r, Math.sin(a) * r, 5.5);
    }
    const bushes: Placement[] = [];
    for (let x = -Y.fenceX + 3; x < Y.fenceX; x += 4.5) {
      if (Math.abs(Math.abs(x) - LANE_X) < Y.gateHalfWidth + 2) continue;
      bushes.push({ x, z: Y.fenceZ - 1.2, ry: rand() * 6, s: 3 + rand() * 1.5 });
    }

    const farZ = ROAD_Z + Y.roadWidth / 2 + 12;
    const shops: Record<string, Placement[]> = {
      'building-e': [{ x: -44, z: farZ, ry: Math.PI, s: 12 }, { x: 20, z: farZ, ry: Math.PI, s: 12 }],
      'building-k': [{ x: -12, z: farZ, ry: Math.PI, s: 10 }, { x: 52, z: farZ + 2, ry: Math.PI, s: 10 }],
      'low-detail-building-wide-a': [{ x: -40, z: -farZ - 4, ry: 0, s: 22 }, { x: 36, z: -farZ - 4, ry: 0, s: 20 }],
      'low-detail-building-wide-b': [{ x: 0, z: -farZ - 6, ry: 0, s: 22 }, { x: 80, z: farZ + 8, ry: Math.PI, s: 20 }],
      'low-detail-building-a': [{ x: -90, z: -farZ - 30, ry: 0, s: 18 }, { x: 110, z: -farZ - 40, ry: 0.4, s: 18 }],
      'low-detail-building-d': [{ x: -70, z: farZ + 30, ry: 0, s: 18 }, { x: 60, z: -farZ - 50, ry: 0, s: 16 }],
      'low-detail-building-h': [{ x: -130, z: -20, ry: 0, s: 18 }, { x: 140, z: 30, ry: 1, s: 18 }],
      'low-detail-building-j': [{ x: 0, z: -farZ - 70, ry: 0, s: 20 }, { x: -20, z: farZ + 60, ry: 0, s: 18 }],
    };

    const jobs: Promise<boolean>[] = [];
    for (const [name, list] of Object.entries(trees)) jobs.push(this.instance(name, list, false));
    jobs.push(this.instance('plant_bushDetailed', bushes, false));
    for (const [name, list] of Object.entries(shops)) jobs.push(this.instance(name, list, false));
    const ok = await Promise.all(jobs);
    if (!ok[0]) this.fallbackTrees(Object.values(trees).flat());
  }

  /** place every copy of a GLB model as instanced meshes (one per model part) */
  private async instance(name: string, list: Placement[], shadows = true): Promise<boolean> {
    if (!list.length) return true;
    const root = await loadModel(name);
    if (!root) return false;
    const parts = modelParts(root);
    const box = new THREE.Box3();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((pl, i) => {
        q.setFromAxisAngle(up, pl.ry);
        m.compose(new THREE.Vector3(pl.x, -box.min.y * pl.s, pl.z), q, new THREE.Vector3(pl.s, pl.s, pl.s));
        mesh.setMatrixAt(i, m);
      });
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    return true;
  }

  private fallbackTrees(list: Placement[]): void {
    const b = new MergeBuilder();
    for (const t of list) {
      b.add(unitCylinder, mat(0x6e5138, 0.9), t.x, t.s * 0.35, t.z, 0, 0, 0, 0.35, t.s * 0.7, 0.35);
      b.add(new THREE.IcosahedronGeometry(1, 1), mat(0x4c8a3f, 0.9), t.x, t.s * 1.1, t.z, 0, 0, 0, t.s * 0.45, t.s * 0.55, t.s * 0.45);
    }
    this.group.add(b.build());
  }
}
