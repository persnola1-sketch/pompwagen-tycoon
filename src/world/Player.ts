import * as THREE from 'three';
import vehicles from '../config/vehicles.json';
import layout from '../config/layout.json';
import { AABB } from './Warehouse';
import { createPallet } from './Pallet';
import { MergeBuilder, glow, mat, unitCylinder, unitSphere } from './Merge';

type VehicleCfg = typeof vehicles.pompwagen;

const limbCache = new Map<string, THREE.BufferGeometry>();
/** capsule with its centre at the origin, long axis along y */
function limb(radius: number, length: number): THREE.BufferGeometry {
  const key = `${radius}|${length}`;
  let g = limbCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(radius, length, 4, 10);
    limbCache.set(key, g);
  }
  return g;
}

const HIP_Y = 0.86;

// worker palette
const SKIN = mat(0xe0ac85, 0.75);
const SHIRT = mat(0x2c3e66, 0.85);
const PANTS = mat(0x3b4150, 0.85);
const VEST = mat(0xff7a1a, 0.55);
const REFLECT = mat(0xe9edf0, 0.25, 0.4);
const BOOT = mat(0x2b2420, 0.7);
const SOLE = mat(0x14120f, 0.9);
const TOE = mat(0x7b828b, 0.35, 0.7);
const HELMET = mat(0xffc61a, 0.35, 0.05);
const GLOVE = mat(0xc9a24a, 0.8);
const EYE = mat(0x141414, 0.4);

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
}

/**
 * Worker in hi-vis vest, hard hat and safety boots walking forward while pulling
 * the pompwagen handle behind. The pompwagen is a two-link trailer: the steering
 * head follows the hands via a rigid handle, and the body pivots around the fork
 * rollers — it swings wide in turns and can never stretch or detach.
 */
export class Player {
  readonly group = new THREE.Group();

  // logical state
  x: number;
  z: number;
  heading = Math.PI; // facing -z initially
  speed = 0;
  speedBonus = 0;
  /** product id of each pallet on the forks, bottom first */
  cargo: string[] = [];

  private steerPos = new THREE.Vector2();
  private rollerPos = new THREE.Vector2();
  private cfg: VehicleCfg = vehicles.pompwagen;

  // character rig
  private character = new THREE.Group();
  private upper = new THREE.Group();
  private legs: Leg[] = [];
  private shoulders: THREE.Group[] = [];
  private walkT = 0;
  private idleT = 0;

  // pompwagen
  private pompwagen = new THREE.Group();
  private handle = new THREE.Group();
  private handleShaft: THREE.Mesh;
  private steerHead = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private palletMounts: THREE.Group[] = [];
  private electricParts = new THREE.Group();
  private beacon: THREE.Mesh;

  constructor(parent: THREE.Object3D) {
    this.x = layout.playerStart.x;
    this.z = layout.playerStart.z;
    this.steerPos.set(this.x, this.z + 1.2);
    this.rollerPos.set(this.x, this.z + 2.6);

    this.buildCharacter();
    this.buildPompwagen();
    this.handleShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 8), mat(0xd9651f, 0.45, 0.4));
    this.handleShaft.castShadow = true;
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), mat(0x22252b, 0.8));
    grip.rotation.y = Math.PI / 2;
    this.handle.add(grip);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(0xff9a1a));
    this.beacon.position.set(0, 0.95, 0.3);
    this.electricParts.add(this.beacon);
    this.group.add(this.character, this.pompwagen, this.handleShaft, this.handle);
    parent.add(this.group);
    this.setElectric(false);
  }

  setElectric(on: boolean): void {
    this.cfg = on ? vehicles.electric : vehicles.pompwagen;
    this.electricParts.visible = on;
  }

  get capacity(): number {
    return this.cfg.capacity;
  }

  get carrying(): number {
    return this.cargo.length;
  }

  get position(): THREE.Vector3 {
    return new THREE.Vector3(this.x, 0, this.z);
  }

  // ---------- models ----------

  private buildCharacter(): void {
    // legs with hip + knee pivots
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.1, HIP_Y, 0);
      const thigh = new THREE.Mesh(limb(0.078, 0.28), PANTS);
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      const lower = new MergeBuilder();
      lower.add(limb(0.066, 0.26), PANTS, 0, -0.18, 0);
      lower.box(0.13, 0.11, 0.27, BOOT, 0, -0.38, 0.05);
      lower.box(0.14, 0.03, 0.29, SOLE, 0, -0.44, 0.05);
      lower.box(0.135, 0.06, 0.06, TOE, 0, -0.4, 0.18);
      knee.add(lower.build());
      hip.add(thigh, knee);
      this.character.add(hip);
      this.legs.push({ hip, knee });
    }

    // torso, vest, head and helmet merged into one static group
    this.upper.position.y = HIP_Y;
    const b = new MergeBuilder();
    b.box(0.3, 0.14, 0.19, PANTS, 0, 0.03, 0);
    b.box(0.32, 0.05, 0.2, SOLE, 0, 0.1, 0); // belt
    b.add(limb(0.16, 0.24), SHIRT, 0, 0.32, 0, 0, 0, 0, 1, 1, 0.72);
    b.add(limb(0.172, 0.22), VEST, 0, 0.3, 0, 0, 0, 0, 1.02, 1, 0.8);
    for (const y of [0.2, 0.33]) b.box(0.35, 0.035, 0.29, REFLECT, 0, y, 0);
    for (const sx of [-1, 1]) b.box(0.035, 0.34, 0.29, REFLECT, sx * 0.08, 0.36, 0);
    b.add(unitCylinder, SKIN, 0, 0.57, 0, 0, 0, 0, 0.1, 0.1, 0.1);
    b.add(unitSphere, SKIN, 0, 0.71, 0, 0, 0, 0, 0.23, 0.24, 0.23);
    for (const sx of [-1, 1]) b.add(unitSphere, EYE, sx * 0.042, 0.725, 0.105, 0, 0, 0, 0.03, 0.03, 0.02);
    b.box(0.03, 0.04, 0.03, SKIN, 0, 0.7, 0.118);
    b.add(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), HELMET, 0, 0.745, 0);
    b.add(unitCylinder, HELMET, 0, 0.75, 0.025, 0, 0, 0, 0.33, 0.02, 0.34);
    b.box(0.035, 0.03, 0.25, HELMET, 0, 0.875, 0);
    this.upper.add(b.build());

    // arms reaching back to the handle: shoulder + elbow pivots
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.215, 0.49, 0);
      shoulder.rotation.set(0.5, 0, -sx * 0.14);
      const upperArm = new THREE.Mesh(limb(0.056, 0.2), SHIRT);
      upperArm.position.y = -0.15;
      upperArm.castShadow = true;
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      elbow.rotation.x = -0.25;
      const fore = new MergeBuilder();
      fore.add(limb(0.05, 0.18), SHIRT, 0, -0.13, 0);
      fore.add(unitSphere, GLOVE, 0, -0.29, 0, 0, 0, 0, 0.11, 0.12, 0.11);
      elbow.add(fore.build());
      shoulder.add(upperArm, elbow);
      this.upper.add(shoulder);
      this.shoulders.push(shoulder);
    }
    this.character.add(this.upper);
  }

  private buildPompwagen(): void {
    const orange = mat(0xd9651f, 0.45, 0.4);
    const steel = mat(0x565d68, 0.4, 0.6);
    const chrome = mat(0xcfd5dc, 0.2, 0.9);
    const rubber = mat(0x24262c, 0.9);

    // steering head at group origin: pump, ram, wheel fork
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
    this.pompwagen.add(this.steerHead);

    // chassis + forks extending backward (-z local)
    const body = new MergeBuilder();
    body.box(0.6, 0.2, 0.16, orange, 0, 0.2, -0.16);
    body.box(0.5, 0.03, 0.12, steel, 0, 0.31, -0.16);
    for (const sx of [-1, 1]) {
      body.box(0.16, 0.07, 1.15, orange, sx * 0.2, 0.12, -0.8);
      body.box(0.12, 0.05, 0.14, orange, sx * 0.2, 0.1, -1.42);
      body.box(0.1, 0.02, 1.0, steel, sx * 0.2, 0.08, -0.8);
    }
    const bodyGroup = body.build();
    this.pompwagen.add(bodyGroup);
    const rollGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10);
    rollGeo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) {
      for (const z of [-1.3, -0.3]) {
        const roll = new THREE.Mesh(rollGeo, rubber);
        roll.position.set(sx * 0.2, 0.05, z);
        this.pompwagen.add(roll);
        this.wheels.push(roll);
      }
    }

    // pallet mount points on the forks (second stacks for the electric model)
    for (let i = 0; i < vehicles.electric.capacity; i++) {
      const m = new THREE.Group();
      m.position.set(0, 0.16 + i * 1.18, -0.8);
      m.rotation.y = Math.PI / 2;
      m.scale.setScalar(0.95);
      m.visible = false;
      this.pompwagen.add(m);
      this.palletMounts.push(m);
    }

    // electric variant: battery hood, stand-on plate, control head
    const e = new MergeBuilder();
    e.box(0.62, 0.55, 0.42, mat(0x2f8f5b, 0.4, 0.3), 0, 0.42, 0.24);
    e.box(0.64, 0.05, 0.44, mat(0x1d2127, 0.6), 0, 0.72, 0.24);
    e.box(0.64, 0.08, 0.02, mat(0xf2c018, 0.5), 0, 0.5, 0.455);
    e.box(0.55, 0.04, 0.34, steel, 0, 0.07, 0.62);
    e.add(unitCylinder, mat(0x1d2127, 0.6), 0, 0.84, 0.3, 0, 0, 0, 0.08, 0.2, 0.08);
    this.electricParts.add(e.build());
    this.pompwagen.add(this.electricParts);
  }

  /** update carried pallet visuals (one product id per pallet) */
  setCargo(products: string[]): void {
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

  // ---------- movement ----------

  update(dt: number, inputX: number, inputY: number, colliders: AABB[]): void {
    const loaded = this.cargo.length > 0;
    const maxSpeed = this.cfg.maxSpeed * (loaded ? this.cfg.loadedSpeedFactor : 1) * (1 + this.speedBonus);
    const turnSpeed = this.cfg.turnSpeed * (loaded ? this.cfg.loadedTurnFactor : 1);
    const mag = Math.min(1, Math.hypot(inputX, inputY));

    if (mag > 0.05) {
      // heading measured like rotation.y: forward = (sin h, cos h) in (x,z)
      const desired = Math.atan2(inputX, inputY);
      let diff = desired - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = turnSpeed * dt;
      this.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
      this.speed = Math.min(maxSpeed * mag, this.speed + this.cfg.accel * dt);
    } else {
      this.speed = Math.max(0, this.speed - this.cfg.brake * dt);
    }

    if (this.speed > 0.001) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      const resolved = this.resolve(nx, nz, 0.35, colliders);
      this.x = resolved.x;
      this.z = resolved.z;
    }

    // --- trailer links ---
    const hx = this.x - Math.sin(this.heading) * 0.34;
    const hz = this.z - Math.cos(this.heading) * 0.34;
    let dx = hx - this.steerPos.x;
    let dz = hz - this.steerPos.y;
    let len = Math.hypot(dx, dz) || 1e-6;
    this.steerPos.set(hx - (dx / len) * this.cfg.handleLength, hz - (dz / len) * this.cfg.handleLength);
    const sp = this.resolve(this.steerPos.x, this.steerPos.y, 0.3, colliders);
    this.steerPos.set(sp.x, sp.z);
    dx = this.steerPos.x - this.rollerPos.x;
    dz = this.steerPos.y - this.rollerPos.y;
    len = Math.hypot(dx, dz) || 1e-6;
    this.rollerPos.set(
      this.steerPos.x - (dx / len) * this.cfg.bodyLength,
      this.steerPos.y - (dz / len) * this.cfg.bodyLength,
    );
    const rp = this.resolve(this.rollerPos.x, this.rollerPos.y, 0.3, colliders);
    this.rollerPos.set(rp.x, rp.z);

    // --- apply visuals ---
    this.character.position.set(this.x, 0, this.z);
    this.character.rotation.y = this.heading;

    const bodyYaw = Math.atan2(this.steerPos.x - this.rollerPos.x, this.steerPos.y - this.rollerPos.y);
    this.pompwagen.position.set(this.steerPos.x, 0, this.steerPos.y);
    this.pompwagen.rotation.y = bodyYaw;
    const handleYaw = Math.atan2(hx - this.steerPos.x, hz - this.steerPos.y);
    this.steerHead.rotation.y = handleYaw - bodyYaw;

    // handle between the hands (high) and the steering head (low)
    const hand = new THREE.Vector3(hx, 0.86, hz);
    const pivot = new THREE.Vector3(this.steerPos.x, 0.34, this.steerPos.y);
    const dir = hand.clone().sub(pivot);
    this.handleShaft.position.copy(hand).add(pivot).multiplyScalar(0.5);
    this.handleShaft.scale.set(1, dir.length(), 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.handleShaft.quaternion.copy(q);
    this.handle.position.copy(hand);
    this.handle.quaternion.copy(q);

    // wheels spin with speed
    const spin = this.speed * dt * 10;
    for (const w of this.wheels) w.rotation.x += spin;

    this.animateWalk(dt);
    this.beacon.visible = Math.sin(performance.now() * 0.012) > 0;
  }

  private animateWalk(dt: number): void {
    const moving = Math.min(1, this.speed / 2);
    this.walkT += this.speed * dt * 4.2;
    this.idleT += dt;
    const s = Math.sin(this.walkT);
    const amp = 0.55 * moving;
    this.legs.forEach((leg, i) => {
      const side = i === 0 ? 1 : -1;
      leg.hip.rotation.x = s * amp * side;
      leg.knee.rotation.x = Math.max(0, Math.sin(this.walkT * side + 1.2 * side)) * amp * 1.2;
    });
    this.shoulders.forEach((sh, i) => {
      const side = i === 0 ? 1 : -1;
      sh.rotation.x = 0.5 - s * 0.08 * moving * side;
    });
    this.upper.position.y = HIP_Y + Math.abs(Math.cos(this.walkT)) * 0.03 * moving + Math.sin(this.idleT * 2) * 0.004;
    this.upper.rotation.x = 0.1 * moving;
  }

  private resolve(nx: number, nz: number, r: number, colliders: AABB[]): { x: number; z: number } {
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
}
