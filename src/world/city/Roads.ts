import * as THREE from 'three';
import layout from '../../config/layout.json';
import { loadTexture } from '../Assets';
import { MergeBuilder, mat, uvPlane } from '../Merge';
import { asphaltTexture, canvas, grassTexture, tex } from '../Textures';

const C = layout.city;
const Y = layout.yard;
const HALF_ROAD = C.roadWidth / 2;

/** Dutch bike lane: red asphalt */
function bikeTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#8e3b2a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const v = Math.floor(Math.random() * 40) - 20;
    ctx.fillStyle = `rgba(${150 + v},${70 + v},${50 + v},0.5)`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return tex(c, 4);
}

export interface RoadLine {
  /** true for an east-west street (constant z), false for north-south */
  horizontal: boolean;
  /** the fixed coordinate (z for horizontal streets, x for vertical) */
  at: number;
  from: number;
  to: number;
}

/**
 * The street grid around the plot: asphalt carriageways with centre dashes,
 * red Dutch bike lanes, raised sidewalks with kerbs, zebra crossings at every
 * junction and a roundabout. Everything is merged into a handful of meshes.
 */
export class Roads {
  readonly group = new THREE.Group();
  readonly lines: RoadLine[] = [];

  constructor() {
    const asphalt = asphaltTexture();
    const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, color: 0x8f8f8f, roughness: 0.92 });
    loadTexture('asphalt_diff', {}, (t) => {
      roadMat.map = t;
      roadMat.needsUpdate = true;
    });
    const grass = grassTexture();
    grass.repeat.set(70, 70);
    const grassMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
    const bikeMat = new THREE.MeshStandardMaterial({ map: bikeTexture(), roughness: 0.9 });

    // streets: the ring around the plot and the outer ring
    for (const z of [C.ringZ, -C.ringZ]) this.lines.push({ horizontal: true, at: z, from: -C.outerX, to: C.outerX });
    for (const x of [C.ringX, -C.ringX]) this.lines.push({ horizontal: false, at: x, from: -C.outerZ, to: C.outerZ });
    for (const z of [C.outerZ, -C.outerZ]) this.lines.push({ horizontal: true, at: z, from: -C.outerX, to: C.outerX });
    for (const x of [C.outerX, -C.outerX]) this.lines.push({ horizontal: false, at: x, from: -C.outerZ, to: C.outerZ });
    // the two gate driveways joining the plot to the south street
    for (const x of [-28, 28]) this.lines.push({ horizontal: false, at: x, from: Y.fenceZ, to: C.ringZ });

    const ground = new MergeBuilder();
    const flat = (geo: THREE.PlaneGeometry, material: THREE.Material, x: number, y: number, z: number): void =>
      ground.add(geo, material, x, y, z, -Math.PI / 2, 0, 0);
    flat(new THREE.PlaneGeometry(900, 900), grassMat, 0, -0.08, 0);
    for (const l of this.lines) {
      const len = l.to - l.from;
      const mid = (l.from + l.to) / 2;
      const w = C.roadWidth;
      if (l.horizontal) {
        flat(uvPlane(len, w, 8), roadMat, mid, -0.03, l.at);
        for (const s of [-1, 1]) flat(uvPlane(len, C.bikeLane, 4), bikeMat, mid, -0.025, l.at + s * (HALF_ROAD + C.bikeLane / 2));
      } else {
        flat(uvPlane(w, len, 8), roadMat, l.at, -0.03, mid);
        for (const s of [-1, 1]) flat(uvPlane(C.bikeLane, len, 4), bikeMat, l.at + s * (HALF_ROAD + C.bikeLane / 2), -0.025, mid);
      }
    }
    // the yard apron in front of both gates
    for (const x of [-28, 28]) flat(uvPlane(11, C.ringZ - Y.fenceZ + 1, 8), roadMat, x, -0.028, (Y.fenceZ + C.ringZ) / 2);
    this.group.add(ground.build(false, true));

    const b = new MergeBuilder();
    this.markings(b);
    this.kerbs(b);
    this.roundabout(b);
    this.group.add(b.build(false, true));
  }

  /** every junction of the grid, used for crossings and traffic lights */
  get junctions(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const h of this.lines.filter((l) => l.horizontal)) {
      for (const v of this.lines.filter((l) => !l.horizontal)) {
        if (h.at >= v.from && h.at <= v.to && v.at >= h.from && v.at <= h.to) out.push({ x: v.at, z: h.at });
      }
    }
    return out;
  }

  private markings(b: MergeBuilder): void {
    const white = mat(0xf2f2ee, 0.65);
    const junctions = this.junctions;
    const nearJunction = (x: number, z: number): boolean => junctions.some((j) => Math.abs(j.x - x) < HALF_ROAD + 4 && Math.abs(j.z - z) < HALF_ROAD + 4);
    for (const l of this.lines) {
      // dashed centre line
      for (let t = l.from + 3; t < l.to - 3; t += 7) {
        const x = l.horizontal ? t : l.at;
        const z = l.horizontal ? l.at : t;
        if (nearJunction(x, z)) continue;
        if (l.horizontal) b.box(3.4, 0.014, 0.16, white, x, 0.005, z);
        else b.box(0.16, 0.014, 3.4, white, x, 0.005, z);
      }
      // edge lines beside the bike lanes
      const len = l.to - l.from;
      const mid = (l.from + l.to) / 2;
      for (const s of [-1, 1]) {
        if (l.horizontal) b.box(len, 0.014, 0.12, white, mid, 0.005, l.at + s * (HALF_ROAD - 0.25));
        else b.box(0.12, 0.014, len, white, l.at + s * (HALF_ROAD - 0.25), 0.005, mid);
      }
    }
    // zebra crossings on every junction approach
    for (const j of junctions) {
      for (const s of [-1, 1]) {
        for (let i = -3; i <= 3; i++) {
          b.box(0.5, 0.016, 3.0, white, j.x + i * 0.9, 0.006, j.z + s * (HALF_ROAD + C.bikeLane + 0.4));
          b.box(3.0, 0.016, 0.5, white, j.x + s * (HALF_ROAD + C.bikeLane + 0.4), 0.006, j.z + i * 0.9);
        }
      }
    }
  }

  private kerbs(b: MergeBuilder): void {
    const kerb = mat(0xb9b6ae, 0.9);
    const tile = mat(0xa9a49a, 0.95);
    const edge = HALF_ROAD + C.bikeLane;
    for (const l of this.lines) {
      const len = l.to - l.from;
      const mid = (l.from + l.to) / 2;
      for (const s of [-1, 1]) {
        if (l.horizontal) {
          b.box(len, 0.16, 0.25, kerb, mid, 0.06, l.at + s * (edge + 0.12));
          b.box(len, 0.14, C.sidewalk, tile, mid, 0.05, l.at + s * (edge + 0.25 + C.sidewalk / 2));
        } else {
          b.box(0.25, 0.16, len, kerb, l.at + s * (edge + 0.12), 0.06, mid);
          b.box(C.sidewalk, 0.14, len, tile, l.at + s * (edge + 0.25 + C.sidewalk / 2), 0.05, mid);
        }
      }
    }
  }

  private roundabout(b: MergeBuilder): void {
    const r = C.roundabout;
    const kerb = mat(0xb9b6ae, 0.9);
    const grass = mat(0x5f8f45, 1);
    const white = mat(0xf2f2ee, 0.65);
    b.add(new THREE.CylinderGeometry(r.radius * 0.55, r.radius * 0.55, 0.3, 24), grass, r.x, 0.15, r.z);
    b.add(new THREE.TorusGeometry(r.radius * 0.55, 0.16, 6, 28), kerb, r.x, 0.28, r.z, Math.PI / 2, 0, 0);
    b.add(new THREE.TorusGeometry(r.radius, 0.1, 6, 36), white, r.x, 0.02, r.z, Math.PI / 2, 0, 0);
    // a little tree island in the middle
    b.add(new THREE.CylinderGeometry(0.25, 0.3, 2.4, 8), mat(0x6e5138, 0.9), r.x, 1.35, r.z);
    b.add(new THREE.IcosahedronGeometry(2.2, 1), mat(0x4c8a3f, 0.95), r.x, 3.6, r.z);
  }
}
