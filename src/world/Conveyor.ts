import * as THREE from 'three';
import layout from '../config/layout.json';
import { AABB } from '../core/Geometry';
import { MergeBuilder, glow, mat } from './Merge';
import { PALLET_TOP, palletWoodGeometry, palletWoodMaterial } from './Pallet';
import { LoadInstances } from './ProductVisuals';
import { canvas, tex } from './Textures';

const C = layout.conveyors;
const MAX_ITEMS = 12;

export interface BeltItem {
  product: string;
  /** distance travelled along the path, in metres */
  dist: number;
}

let beltTex: THREE.CanvasTexture | null = null;
/** rubber belt with moulded chevrons; scrolled by offsetting the texture */
function beltTexture(): THREE.CanvasTexture {
  if (beltTex) return beltTex;
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#2b2e34';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 7;
  for (let y = -128; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(6, y);
    ctx.lineTo(64, y + 26);
    ctx.lineTo(122, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, 6, 128);
  ctx.fillRect(122, 0, 6, 128);
  beltTex = tex(c, 1);
  return beltTex;
}

interface Segment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  len: number;
  /** distance along the whole path where this segment starts */
  start: number;
  dx: number;
  dz: number;
}

/**
 * Powered roller conveyor along a polyline path: scrolling rubber belt,
 * spinning drums, side guides, legs, a corner transfer unit at each bend and
 * a motor with a running light at the discharge end. Pallets glide along the
 * belt and queue up at the end when the destination is full.
 */
export class Conveyor {
  readonly group = new THREE.Group();
  readonly colliders: AABB[] = [];
  readonly items: BeltItem[] = [];
  readonly totalLength: number;
  private segs: Segment[] = [];
  private drums: THREE.Mesh[] = [];
  private beltMats: THREE.MeshStandardMaterial[] = [];
  private wood: THREE.InstancedMesh;
  private loads = new LoadInstances(MAX_ITEMS, PALLET_TOP);
  private runLight: THREE.Mesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(0.92, 0.92, 0.92);
  private scroll = 0;
  /** true while at least one pallet is moving (drives the motor hum) */
  running = false;

  constructor(parent: THREE.Object3D, path: number[][]) {
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, z0] = path[i];
      const [x1, z1] = path[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      this.segs.push({ x0, z0, x1, z1, len, start: acc, dx: (x1 - x0) / len, dz: (z1 - z0) / len });
      acc += len;
    }
    this.totalLength = acc;
    for (const seg of this.segs) this.buildSegment(seg);
    this.runLight = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow(0x46e38a));
    const end = this.pointAt(this.totalLength);
    this.runLight.position.set(end.x, C.height + 0.55, end.z);
    this.group.add(this.runLight);

    this.wood = new THREE.InstancedMesh(palletWoodGeometry(), palletWoodMaterial(), MAX_ITEMS);
    this.wood.castShadow = true;
    this.wood.frustumCulled = false;
    this.wood.count = 0;
    this.group.add(this.wood, this.loads.mesh);
    parent.add(this.group);
  }

  private buildSegment(seg: Segment): void {
    const yaw = Math.atan2(seg.dx, seg.dz);
    const g = new THREE.Group();
    g.position.set((seg.x0 + seg.x1) / 2, 0, (seg.z0 + seg.z1) / 2);
    g.rotation.y = yaw;
    const W = C.beltWidth;
    const H = C.height;
    const L = seg.len;

    const b = new MergeBuilder();
    const frame = mat(0x2f6fb4, 0.5, 0.4);
    const steel = mat(0x8b939e, 0.45, 0.6);
    const dark = mat(0x23262c, 0.7);
    // side guides and frame beams
    for (const sx of [-1, 1]) {
      b.box(0.08, 0.22, L, frame, sx * (W / 2 + 0.04), H + 0.04, 0);
      b.box(0.06, 0.12, L, steel, sx * (W / 2 + 0.04), H - 0.16, 0);
    }
    // legs every ~2.2 m
    const legs = Math.max(2, Math.round(L / 2.2));
    for (let i = 0; i <= legs; i++) {
      const z = -L / 2 + (i / legs) * L;
      for (const sx of [-1, 1]) b.box(0.07, H - 0.12, 0.07, steel, sx * (W / 2 - 0.02), (H - 0.12) / 2, z);
      b.box(W, 0.05, 0.07, steel, 0, 0.12, z);
    }
    // deck under the belt
    b.box(W, 0.1, L, dark, 0, H - 0.1, 0);
    g.add(b.build());

    // moving belt surface
    const beltMat = new THREE.MeshStandardMaterial({ map: beltTexture().clone(), roughness: 0.75, metalness: 0.05 });
    beltMat.map!.wrapS = beltMat.map!.wrapT = THREE.RepeatWrapping;
    beltMat.map!.repeat.set(1, L / W);
    beltMat.map!.needsUpdate = true;
    this.beltMats.push(beltMat);
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(W, L), beltMat);
    belt.rotation.x = -Math.PI / 2;
    belt.position.y = H;
    belt.receiveShadow = true;
    g.add(belt);

    // drive drums at both ends
    const drumGeo = new THREE.CylinderGeometry(0.11, 0.11, W + 0.06, 14);
    drumGeo.rotateZ(Math.PI / 2);
    for (const sz of [-1, 1]) {
      const d = new THREE.Mesh(drumGeo, mat(0x9aa3ad, 0.4, 0.7));
      d.position.set(0, H - 0.05, sz * (L / 2 - 0.05));
      g.add(d);
      this.drums.push(d);
    }
    // motor box on the discharge end
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.42), mat(0x3a4350, 0.5, 0.5));
    motor.position.set(W / 2 + 0.24, H - 0.12, L / 2 - 0.4);
    g.add(motor);

    this.group.add(g);
    const hw = Math.abs(seg.dz) > 0.5 ? W / 2 + 0.12 : L / 2;
    const hd = Math.abs(seg.dz) > 0.5 ? L / 2 : W / 2 + 0.12;
    this.colliders.push({
      minX: (seg.x0 + seg.x1) / 2 - hw,
      maxX: (seg.x0 + seg.x1) / 2 + hw,
      minZ: (seg.z0 + seg.z1) / 2 - hd,
      maxZ: (seg.z0 + seg.z1) / 2 + hd,
    });
  }

  /** world position at a distance along the path */
  pointAt(dist: number): { x: number; z: number } {
    const d = Math.max(0, Math.min(this.totalLength, dist));
    for (const s of this.segs) {
      if (d <= s.start + s.len || s === this.segs[this.segs.length - 1]) {
        const t = d - s.start;
        return { x: s.x0 + s.dx * t, z: s.z0 + s.dz * t };
      }
    }
    return { x: this.segs[0].x0, z: this.segs[0].z0 };
  }

  /** yaw of the belt at a distance along the path */
  private yawAt(dist: number): number {
    for (const s of this.segs) {
      if (dist <= s.start + s.len || s === this.segs[this.segs.length - 1]) return Math.atan2(s.dx, s.dz);
    }
    return 0;
  }

  get inputPoint(): { x: number; z: number } {
    return this.pointAt(0);
  }

  get outputPoint(): { x: number; z: number } {
    return this.pointAt(this.totalLength);
  }

  /** free space at the loading end for another pallet */
  canAccept(): boolean {
    if (this.items.length >= MAX_ITEMS) return false;
    const last = this.items[this.items.length - 1];
    return !last || last.dist >= C.spacing;
  }

  push(product: string): boolean {
    if (!this.canAccept()) return false;
    this.items.push({ product, dist: 0 });
    return true;
  }

  /** product of the pallet waiting at the discharge end, if any */
  get ready(): string | null {
    const first = this.items[0];
    return first && first.dist >= this.totalLength - 0.02 ? first.product : null;
  }

  /** take the pallet waiting at the discharge end */
  take(): string | null {
    if (!this.ready) return null;
    return this.items.shift()!.product;
  }

  update(dt: number, speed: number): void {
    // pallets ride the belt and queue up behind each other
    let moved = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const ahead = this.items[i - 1];
      const limit = ahead ? ahead.dist - C.spacing : this.totalLength;
      const next = Math.min(limit, it.dist + speed * dt);
      if (next > it.dist + 1e-4) moved = true;
      it.dist = next;
    }
    this.running = moved;
    this.scroll += speed * dt;
    for (const m of this.beltMats) if (m.map) m.map.offset.y = -this.scroll / C.beltWidth;
    const spin = (speed * dt) / 0.11;
    for (const d of this.drums) d.rotation.x += spin;
    (this.runLight.material as THREE.MeshBasicMaterial).color.setHex(moved ? 0x46e38a : 0x2a5f3f);

    this.loads.begin();
    let n = 0;
    for (const it of this.items) {
      const p = this.pointAt(it.dist);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yawAt(it.dist) + Math.PI / 2);
      this.m.compose(this.v.set(p.x, C.height + 0.02, p.z), this.q, this.s);
      this.wood.setMatrixAt(n++, this.m);
      this.loads.push(it.product, this.m);
    }
    this.wood.count = n;
    this.wood.visible = n > 0;
    this.wood.instanceMatrix.needsUpdate = true;
    this.loads.end();
  }

  toSave(): BeltItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  loadFrom(items: BeltItem[] | undefined): void {
    this.items.length = 0;
    for (const i of items ?? []) this.items.push({ ...i });
  }
}
