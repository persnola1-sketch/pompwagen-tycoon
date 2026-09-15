import * as THREE from 'three';
import layout from '../config/layout.json';
import { TruckKind } from '../core/EventBus';

export type TruckRole = TruckKind | 'delivery';
import { MergeBuilder, glow, mat, unitBox, unitCylinder } from './Merge';
import { PALLET_TOP, palletWoodGeometry, palletWoodMaterial } from './Pallet';
import { LoadInstances } from './ProductVisuals';
import { liveryTexture, plateTexture, textSprite } from './Textures';

const T = layout.truck;
const TRAILER_LEN = 9.0;
const KINGPIN_Z = 8.2;
const FLOOR_Y = 0.75;
const MAX_CARGO = T.maxVisibleCargo;

interface Segment {
  x0: number; z0: number; r0: number;
  x1: number; z1: number; r1: number;
  dur: number;
  reverse: boolean;
}

const LIVERIES: [number, string][] = [
  [0x2563b8, '#ffd23f'],
  [0xc2571f, '#ffffff'],
  [0x2f9e4f, '#ffe066'],
  [0x7b3fc2, '#ffd23f'],
  [0xb83a63, '#ffffff'],
  [0x1f8a8a, '#ffd23f'],
  [0x2f3642, '#f2c018'],
  [0xd6a21e, '#1b2230'],
];

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** add a truck wheel (tyre + rim + hub) to a merge builder, axis along x */
function addWheel(b: MergeBuilder, x: number, z: number, r: number, w: number): void {
  const tyre = mat(0x1c1d21, 0.92);
  const rim = mat(0xb9c0c8, 0.3, 0.8);
  const side = Math.sign(x);
  b.add(unitCylinder, tyre, x, r, z, 0, 0, Math.PI / 2, r * 2, w, r * 2);
  b.add(unitCylinder, rim, x + side * 0.01, r, z, 0, 0, Math.PI / 2, r * 1.2, w + 0.01, r * 1.2);
  b.add(unitCylinder, mat(0x3a3f48, 0.5, 0.6), x + side * 0.02, r, z, 0, 0, Math.PI / 2, r * 0.4, w + 0.03, r * 0.4);
}

/**
 * Articulated truck (tractor + box semi-trailer) in company colours. It drives
 * in from the road, swings around, reverses to the dock, opens its rear doors
 * while (un)loading, then drives away. Root origin = trailer rear, model faces +z.
 */
export class Truck {
  readonly group = new THREE.Group();
  kind: TruckRole;
  phase: 'hidden' | 'arriving' | 'docked' | 'leaving' = 'hidden';
  onDocked: (() => void) | null = null;
  onGone: (() => void) | null = null;
  onBeep: (() => void) | null = null;

  private segs: Segment[] = [];
  private segIndex = 0;
  private segT = 0;
  private beepTimer = 0;
  private side: number;

  private tractor = new THREE.Group();
  private articulation = 0;
  private lastYaw = 0;
  private paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.3 });
  private liveryMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
  private plateMat = new THREE.MeshBasicMaterial();
  private doors: THREE.Group[] = [];
  private doorOpen = 0;
  private labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  private label: THREE.Mesh;

  private woodInst: THREE.InstancedMesh;
  private loads = new LoadInstances(MAX_CARGO, PALLET_TOP);
  private dockIndex = 0;
  /** vehicle delivered on the trailer floor (forklift, electric pompwagen) */
  private vehicleMount = new THREE.Group();
  private ramp: THREE.Mesh;
  private rollT = -1;
  private rollDur = 2.6;
  private onRolled: (() => void) | null = null;

  constructor(kind: TruckRole, parent: THREE.Object3D) {
    this.kind = kind;
    this.side = kind === 'customer' ? 1 : -1;
    this.vehicleMount.position.set(0, FLOOR_Y, TRAILER_LEN / 2);
    this.vehicleMount.rotation.y = Math.PI;
    this.group.add(this.vehicleMount);
    this.ramp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 2.4), mat(0x8b939e, 0.5, 0.5));
    this.ramp.position.set(0, FLOOR_Y / 2, -1.1);
    this.ramp.rotation.x = Math.atan2(FLOOR_Y, 2.2);
    this.ramp.visible = false;
    this.group.add(this.ramp);
    this.buildTrailer();
    this.buildTractor();
    this.tractor.position.z = KINGPIN_Z;
    this.group.add(this.tractor);

    this.label = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), this.labelMat);
    this.label.position.set(0, 5.2, 3.5);
    this.label.visible = false;
    this.label.renderOrder = 10;
    this.group.add(this.label);

    this.woodInst = new THREE.InstancedMesh(palletWoodGeometry(), palletWoodMaterial(), MAX_CARGO);
    this.woodInst.count = 0;
    this.woodInst.visible = false;
    this.woodInst.frustumCulled = false;
    this.woodInst.castShadow = true;
    this.group.add(this.woodInst, this.loads.mesh);

    this.group.visible = false;
    parent.add(this.group);
  }

  // ---------- model ----------

  private buildTrailer(): void {
    const b = new MergeBuilder();
    const white = mat(0xeef1f4, 0.45, 0.1);
    const alu = mat(0xaeb5bd, 0.35, 0.75);
    const dark = mat(0x24272d, 0.8);
    const L = TRAILER_LEN;
    const H = 2.65;

    b.box(2.5, 0.16, L, dark, 0, FLOOR_Y - 0.08, L / 2);
    b.box(2.36, 0.02, L - 0.2, mat(0x6b5a45, 0.9), 0, FLOOR_Y + 0.01, L / 2);
    for (const sx of [-1, 1]) {
      b.box(0.05, H, L, white, sx * 1.225, FLOOR_Y + H / 2, L / 2);
      b.box(0.08, 0.1, L, alu, sx * 1.24, FLOOR_Y + H, L / 2);
      b.box(0.09, 0.2, L, alu, sx * 1.24, FLOOR_Y + 0.06, L / 2);
      b.box(0.12, H + 0.1, 0.12, alu, sx * 1.21, FLOOR_Y + H / 2, 0.06);
      b.box(0.1, H, 0.1, alu, sx * 1.21, FLOOR_Y + H / 2, L - 0.05);
      b.box(0.04, 0.5, 3.6, dark, sx * 1.16, FLOOR_Y - 0.4, 6.3); // side skirt
      b.box(0.1, 0.72, 0.1, dark, sx * 0.85, (FLOOR_Y - 0.1) / 2, 7.3); // landing gear
      b.box(0.25, 0.04, 0.25, dark, sx * 0.85, 0.02, 7.3);
      b.box(0.5, 0.5, 0.02, dark, sx * 0.95, 0.4, 0.75); // mud flap
      b.box(0.34, 0.14, 0.04, glow(0xd23b3b), sx * 0.9, 0.55, 0.12); // tail light
      b.box(0.1, 0.1, 0.04, glow(0xffa21a), sx * 1.15, 0.55, 0.12);
      for (let z = 2; z < L - 0.5; z += 2) b.box(0.03, 0.06, 0.1, glow(0xffa21a), sx * 1.29, FLOOR_Y + 0.06, z);
    }
    b.box(2.5, 0.06, L, white, 0, FLOOR_Y + H + 0.03, L / 2);
    b.box(2.5, H, 0.05, white, 0, FLOOR_Y + H / 2, L - 0.03);
    b.box(2.5, 0.22, 0.12, alu, 0, FLOOR_Y + H - 0.05, 0.06);
    b.box(2.5, 0.16, 0.14, dark, 0, FLOOR_Y - 0.02, 0.07);
    b.box(2.3, 0.14, 0.12, mat(0xd8d8d0, 0.5, 0.4), 0, 0.42, 0.15); // underride bar
    for (const z of [1.5, 2.8, 4.1]) {
      for (const sx of [-1, 1]) addWheel(b, sx * 0.95, z, 0.48, 0.42);
      b.box(1.6, 0.12, 0.12, dark, 0, 0.48, z);
    }
    this.group.add(b.build());

    // company livery on both sides
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.6, H - 0.35), this.liveryMat);
      p.position.set(sx * 1.253, FLOOR_Y + H / 2, L / 2);
      p.rotation.y = (sx * Math.PI) / 2;
      this.group.add(p);
    }
    const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), this.plateMat);
    rearPlate.position.set(0, 0.62, 0.08);
    rearPlate.rotation.y = Math.PI;
    this.group.add(rearPlate);

    // rear doors hinged at the corners
    const doorGeo = new THREE.BoxGeometry(1.22, H - 0.1, 0.04);
    const doorMat = mat(0xdfe3e8, 0.5, 0.15);
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(sx * 1.27, FLOOR_Y + H / 2, -0.02);
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.x = -sx * 0.61;
      door.castShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.3, 0.045), this.paint);
      stripe.position.set(-sx * 0.61, -0.7, 0);
      const bars = new THREE.Mesh(new THREE.BoxGeometry(0.05, H - 0.2, 0.08), mat(0xaeb5bd, 0.35, 0.75));
      bars.position.set(-sx * 0.35, 0, -0.03);
      hinge.add(door, stripe, bars);
      this.group.add(hinge);
      this.doors.push(hinge);
    }
  }

  private buildTractor(): void {
    const b = new MergeBuilder();
    const dark = mat(0x24272d, 0.8);
    const chrome = mat(0xd6dce2, 0.2, 0.9);
    const glass = mat(0x1d3347, 0.1, 0.8);
    const p = this.paint;

    b.box(0.9, 0.25, 5.4, dark, 0, 0.75, 1.9);
    b.box(1.3, 0.1, 1.2, mat(0x3a3f48, 0.6, 0.5), 0, 0.95, 0);
    b.box(2.3, 0.08, 1.4, dark, 0, 1.12, 0); // rear fenders
    b.add(unitCylinder, chrome, 1.0, 0.72, 2.0, Math.PI / 2, 0, 0, 0.55, 1.2, 0.55); // fuel tank
    b.box(0.45, 0.5, 0.8, dark, -1.0, 0.75, 2.0); // battery box
    // cab
    b.box(2.45, 1.35, 2.05, p, 0, 1.78, 3.85);
    b.box(2.45, 1.2, 1.9, p, 0, 3.05, 3.78);
    b.add(unitBox, p, 0, 3.92, 3.35, -0.3, 0, 0, 2.3, 0.45, 1.3); // roof fairing
    b.box(2.2, 0.1, 1.9, p, 0, 3.68, 3.78);
    b.add(unitBox, glass, 0, 3.08, 4.74, -0.07, 0, 0, 2.2, 1.0, 0.05);
    for (const sx of [-1, 1]) {
      b.box(0.04, 0.7, 0.9, glass, sx * 1.23, 3.12, 4.2);
      b.box(0.04, 0.08, 0.25, chrome, sx * 1.235, 2.3, 3.6); // door handle
      b.box(0.06, 0.06, 0.4, dark, sx * 1.36, 3.25, 4.55); // mirror arm
      b.box(0.08, 0.48, 0.22, dark, sx * 1.56, 3.05, 4.62); // mirror
      b.box(0.22, 0.05, 0.5, mat(0xaeb5bd, 0.35, 0.75), sx * 1.28, 1.02, 3.3); // steps
      b.box(0.22, 0.05, 0.5, mat(0xaeb5bd, 0.35, 0.75), sx * 1.28, 0.62, 3.3);
      b.box(0.5, 0.1, 1.2, dark, sx * 1.02, 1.12, 3.4); // front fender
      b.box(0.45, 0.16, 0.05, glow(0xfff4d6), sx * 0.85, 1.18, 4.93); // headlight
      b.box(0.14, 0.1, 0.05, glow(0xffa21a), sx * 1.12, 1.18, 4.93);
      addWheel(b, sx * 1.02, 3.4, 0.5, 0.36);
      addWheel(b, sx * 0.95, 0, 0.5, 0.5);
    }
    b.box(2.3, 0.08, 0.32, dark, 0, 3.64, 4.88); // sun visor
    for (let i = 0; i < 5; i++) b.box(0.12, 0.06, 0.06, glow(0xffa21a), -0.8 + i * 0.4, 3.72, 4.7);
    b.box(1.55, 0.95, 0.05, dark, 0, 1.95, 4.9); // grille
    for (let i = 0; i < 5; i++) b.box(1.45, 0.04, 0.03, chrome, 0, 1.6 + i * 0.18, 4.93);
    b.box(2.5, 0.36, 0.3, dark, 0, 0.82, 4.95); // bumper
    this.tractor.add(b.build());

    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), this.plateMat);
    plate.position.set(0, 0.84, 5.11);
    this.tractor.add(plate);
  }

  private applyCompany(name: string): void {
    const [primary, accent] = LIVERIES[hash(name) % LIVERIES.length];
    this.paint.color.setHex(primary);
    this.liveryMat.map?.dispose();
    this.liveryMat.map = liveryTexture(name, hex(primary), accent);
    this.liveryMat.needsUpdate = true;
    const h = hash(name + this.kind);
    const letters = 'BDFGHJKLNPRSTVXZ';
    const plate = `${letters[h % 16]}${letters[(h >> 4) % 16]}-${100 + (h % 900)}-${letters[(h >> 8) % 16]}`;
    this.plateMat.map?.dispose();
    this.plateMat.map = plateTexture(plate);
    this.plateMat.needsUpdate = true;
  }

  // ---------- cargo ----------

  /** pallets inside the trailer, one product id each, front first */
  setCargo(products: string[]): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const s = new THREE.Vector3(0.92, 0.92, 0.92);
    const v = new THREE.Vector3();
    const perRow = 2;
    const rows = 7;
    const list = products.slice(0, MAX_CARGO);
    this.loads.begin();
    list.forEach((pid, i) => {
      const lvl = Math.floor(i / (perRow * rows));
      const k = i % (perRow * rows);
      const row = Math.floor(k / perRow);
      const col = k % perRow;
      v.set(-0.58 + col * 1.16, FLOOR_Y + lvl * 1.3, TRAILER_LEN - 0.75 - row * 1.22);
      m.compose(v, q, s);
      this.woodInst.setMatrixAt(i, m);
      this.loads.push(pid, m);
    });
    this.woodInst.count = list.length;
    this.woodInst.visible = list.length > 0;
    this.woodInst.instanceMatrix.needsUpdate = true;
    this.loads.end();
  }

  /** put a vehicle model in the trailer (null clears it) */
  setVehicle(obj: THREE.Object3D | null): void {
    this.vehicleMount.clear();
    this.vehicleMount.position.set(0, FLOOR_Y, TRAILER_LEN / 2);
    if (obj) this.vehicleMount.add(obj);
  }

  /** ramp animation: the vehicle rolls out of the rear doors into the warehouse */
  rollOut(seconds: number, onDone: () => void): void {
    this.rollDur = seconds;
    this.rollT = 0;
    this.onRolled = onDone;
    this.ramp.visible = true;
  }

  setLabel(text: string): void {
    this.labelMat.map?.dispose();
    this.labelMat.map = textSprite(text, 'rgba(20,24,32,0.8)', '#ffffff', 512, 160, 52);
    this.labelMat.needsUpdate = true;
    this.label.visible = true;
  }

  // ---------- driving ----------

  startArrival(companyName: string, cargo: string[], dockIndex = 0): void {
    this.dockIndex = dockIndex;
    const cfg = this.side < 0 ? T.inbound : T.outbound;
    const wallX = this.side * (layout.warehouse.width / 2);
    const dockZ = layout.docks.doorZ[dockIndex];
    const laneX = cfg.approach.x;
    const away = this.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    const awayWrapped = away + (this.side < 0 ? Math.PI * 2 : 0);
    const v = T.driveSpeed;
    const rearAtDock = wallX - this.side * T.rearInsideDoor;
    const preDockX = wallX + this.side * (T.length + T.rearInsideDoor);
    const turnZ = dockZ + T.turnInDistance;

    this.applyCompany(companyName);
    this.setCargo(cargo);
    this.label.visible = false;

    this.segs = [
      { x0: cfg.spawn.x, z0: cfg.spawn.z, r0: Math.PI, x1: laneX, z1: turnZ, r1: Math.PI, dur: Math.abs(cfg.spawn.z - turnZ) / v, reverse: false },
      { x0: laneX, z0: turnZ, r0: Math.PI, x1: preDockX, z1: dockZ, r1: awayWrapped, dur: T.swingDuration, reverse: false },
      { x0: preDockX, z0: dockZ, r0: awayWrapped, x1: rearAtDock, z1: dockZ, r1: awayWrapped, dur: Math.abs(preDockX - rearAtDock) / T.reverseSpeed, reverse: true },
    ];
    this.segIndex = 0;
    this.segT = 0;
    this.phase = 'arriving';
    this.group.visible = true;
    this.articulation = 0;
    this.applyPose(this.segs[0], 0);
    this.lastYaw = this.group.rotation.y;
  }

  startDeparture(): void {
    const cfg = this.side < 0 ? T.inbound : T.outbound;
    const dockZ = layout.docks.doorZ[this.dockIndex];
    this.ramp.visible = false;
    this.rollT = -1;
    const away = this.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    const wallX = this.side * (layout.warehouse.width / 2);
    const rearAtDock = wallX - this.side * T.rearInsideDoor;
    const laneX = cfg.approach.x;
    const outZ = dockZ - T.pullOutDistance;
    this.label.visible = false;
    const south = this.side < 0 ? -Math.PI : Math.PI;
    this.segs = [
      { x0: rearAtDock, z0: dockZ, r0: away, x1: laneX, z1: outZ, r1: south, dur: T.pullOutDuration, reverse: false },
      { x0: laneX, z0: outZ, r0: south, x1: cfg.exit.x, z1: cfg.exit.z, r1: south, dur: Math.abs(outZ - cfg.exit.z) / T.driveSpeed, reverse: false },
    ];
    this.segIndex = 0;
    this.segT = 0;
    this.phase = 'leaving';
    this.group.rotation.y = away;
    this.lastYaw = away;
  }

  private applyPose(s: Segment, t: number): void {
    const e = t * t * (3 - 2 * t);
    this.group.position.set(s.x0 + (s.x1 - s.x0) * e, 0, s.z0 + (s.z1 - s.z0) * e);
    this.group.rotation.y = s.r0 + (s.r1 - s.r0) * e;
  }

  update(dt: number, camera: THREE.Camera): void {
    // doors open while docked
    const wantOpen = this.phase === 'docked' ? 1 : 0;
    this.doorOpen += (wantOpen - this.doorOpen) * Math.min(1, dt * 2.5);
    this.doors.forEach((d, i) => {
      const sx = i === 0 ? -1 : 1;
      d.rotation.y = sx * -1 * this.doorOpen * Math.PI * 1.45;
    });
    if (this.label.visible) {
      this.group.updateMatrixWorld();
      const parentQ = new THREE.Quaternion();
      this.group.getWorldQuaternion(parentQ);
      this.label.quaternion.copy(parentQ.invert().multiply(camera.quaternion));
    }

    if (this.rollT >= 0) {
      this.rollT += dt / this.rollDur;
      const e = Math.min(1, this.rollT);
      const k = e * e * (3 - 2 * e);
      this.vehicleMount.position.z = TRAILER_LEN / 2 - (TRAILER_LEN / 2 + 3.2) * k;
      this.vehicleMount.position.y = FLOOR_Y * Math.max(0, 1 - Math.max(0, (k - 0.6) / 0.35));
      if (e >= 1) {
        this.rollT = -1;
        this.ramp.visible = false;
        this.vehicleMount.clear();
        const cb = this.onRolled;
        this.onRolled = null;
        cb?.();
      }
    }
    if (this.phase === 'hidden' || this.phase === 'docked') return;
    const s = this.segs[this.segIndex];
    if (!s) return;
    this.segT += dt / s.dur;
    if (s.reverse) {
      this.beepTimer -= dt;
      if (this.beepTimer <= 0) {
        this.beepTimer = 0.55;
        this.onBeep?.();
      }
    }
    if (this.segT >= 1) {
      this.applyPose(s, 1);
      this.segIndex++;
      this.segT = 0;
      if (this.segIndex >= this.segs.length) {
        if (this.phase === 'arriving') {
          this.phase = 'docked';
          this.articulation = 0;
          this.tractor.rotation.y = 0;
          this.onDocked?.();
        } else {
          this.phase = 'hidden';
          this.group.visible = false;
          this.setCargo([]);
          this.onGone?.();
        }
        return;
      }
    } else {
      this.applyPose(s, this.segT);
    }

    // fake articulation: the tractor leads the trailer through turns
    const yaw = this.group.rotation.y;
    const rate = dt > 0 ? (yaw - this.lastYaw) / dt : 0;
    this.lastYaw = yaw;
    const target = THREE.MathUtils.clamp(rate * 0.55 * (s.reverse ? -1 : 1), -0.6, 0.6);
    this.articulation += (target - this.articulation) * Math.min(1, dt * 4);
    this.tractor.rotation.y = this.articulation;
  }
}
