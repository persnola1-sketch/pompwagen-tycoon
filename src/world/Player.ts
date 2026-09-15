import * as THREE from 'three';
import vehicles from '../config/vehicles.json';
import layout from '../config/layout.json';
import { AABB } from './Warehouse';
import { createPallet } from './Pallet';

type VehicleCfg = typeof vehicles.pompwagen;

/**
 * Character walking forward holding the pompwagen handle behind them.
 * The pompwagen is a two-link trailer: the steering head follows the hands
 * via a rigid handle, and the body pivots around the fork rollers — it swings
 * wide in turns and can never stretch or detach (section 8 of the design).
 */
export class Player {
  readonly group = new THREE.Group();

  // logical state
  x: number;
  z: number;
  heading = Math.PI; // facing -z initially
  speed = 0;
  carrying = 0;

  private steerPos = new THREE.Vector2();
  private rollerPos = new THREE.Vector2();
  private cfg: VehicleCfg = vehicles.pompwagen;

  // visuals
  private character = new THREE.Group();
  private pompwagen = new THREE.Group();
  private handleMesh: THREE.Mesh;
  private legL!: THREE.Mesh;
  private legR!: THREE.Mesh;
  private walkT = 0;
  private steerHead = new THREE.Group();
  private forkWheels: THREE.Mesh[] = [];
  private steerWheels: THREE.Mesh[] = [];
  private palletMounts: THREE.Group[] = [];
  private manualParts = new THREE.Group();
  private electricParts = new THREE.Group();

  constructor(parent: THREE.Object3D) {
    this.x = layout.playerStart.x;
    this.z = layout.playerStart.z;
    this.steerPos.set(this.x, this.z + 1.2);
    this.rollerPos.set(this.x, this.z + 2.6);

    this.buildCharacter();
    this.buildPompwagen();
    this.handleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5, metalness: 0.5 }),
    );
    this.group.add(this.character, this.pompwagen, this.handleMesh);
    parent.add(this.group);
    this.setElectric(false);
  }

  setElectric(on: boolean): void {
    this.cfg = on ? vehicles.electric : vehicles.pompwagen;
    this.manualParts.visible = !on;
    this.electricParts.visible = on;
  }

  get capacity(): number {
    return this.cfg.capacity;
  }

  get position(): THREE.Vector3 {
    return new THREE.Vector3(this.x, 0, this.z);
  }

  // ---------- models ----------

  private buildCharacter(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48a, roughness: 0.8 });
    const vest = new THREE.MeshStandardMaterial({ color: 0xf07818, roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x4a566e, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2e3442, roughness: 0.85 });

    // legs
    const legGeo = new THREE.BoxGeometry(0.14, 0.42, 0.16);
    this.legL = new THREE.Mesh(legGeo, pants);
    this.legL.position.set(-0.1, 0.21, 0);
    this.legR = new THREE.Mesh(legGeo, pants);
    this.legR.position.set(0.1, 0.21, 0);
    // torso with hi-vis vest
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), vest);
    torso.position.y = 0.67;
    torso.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.07, 0.27), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5 }));
    stripe.position.y = 0.72;
    // arms reaching back to the handle
    const armGeo = new THREE.BoxGeometry(0.09, 0.4, 0.09);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, shirt);
      arm.position.set(sx * 0.26, 0.68, 0.12);
      arm.rotation.x = -0.9;
      this.character.add(arm);
    }
    // head + cap
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.22), skin);
    head.position.y = 1.06;
    head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.09, 0.25), new THREE.MeshStandardMaterial({ color: 0x2563b8, roughness: 0.7 }));
    cap.position.y = 1.2;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.03, 0.12), new THREE.MeshStandardMaterial({ color: 0x2563b8, roughness: 0.7 }));
    brim.position.set(0, 1.16, -0.17);
    this.character.add(this.legL, this.legR, torso, stripe, head, cap, brim);
  }

  private buildPompwagen(): void {
    const orange = new THREE.MeshStandardMaterial({ color: 0xd9651f, roughness: 0.45, metalness: 0.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x565d68, roughness: 0.4, metalness: 0.6 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.9 });

    // steering head at group origin: hydraulic pump body + steering wheels
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.34, 10), orange);
    pump.position.y = 0.26;
    this.steerHead.add(pump);
    const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, rubber);
      w.position.set(sx * 0.1, 0.09, 0);
      this.steerHead.add(w);
      this.steerWheels.push(w);
    }
    this.pompwagen.add(this.steerHead);

    // forks extending backward (-z local)
    const forkGeo = new THREE.BoxGeometry(0.17, 0.08, 1.2);
    for (const sx of [-1, 1]) {
      const fork = new THREE.Mesh(forkGeo, orange);
      fork.position.set(sx * 0.2, 0.14, -0.72);
      fork.castShadow = true;
      this.pompwagen.add(fork);
      // fork tip rollers
      const rollGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.1, 10);
      rollGeo.rotateZ(Math.PI / 2);
      const roll = new THREE.Mesh(rollGeo, rubber);
      roll.position.set(sx * 0.2, 0.055, -1.25);
      this.pompwagen.add(roll);
      this.forkWheels.push(roll);
    }
    // cross member
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.14), orange);
    cross.position.set(0, 0.16, -0.14);
    this.pompwagen.add(cross);

    // pallet mount points on the forks (second one stacks for the electric model)
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Group();
      m.position.set(0, 0.19 + i * 1.12, -0.72);
      m.visible = false;
      this.pompwagen.add(m);
      this.palletMounts.push(m);
      const pallet = createPallet();
      pallet.scale.setScalar(0.95);
      pallet.rotation.y = Math.PI / 2;
      m.add(pallet);
    }

    // electric variant extras: battery chassis + platform
    const battery = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.42), new THREE.MeshStandardMaterial({ color: 0x38a169, roughness: 0.4, metalness: 0.3 }));
    battery.position.set(0, 0.34, 0.26);
    battery.castShadow = true;
    this.electricParts.add(battery);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), steel);
    platform.position.set(0, 0.1, 0.55);
    this.electricParts.add(platform);
    this.pompwagen.add(this.electricParts);
    this.pompwagen.add(this.manualParts);
  }

  /** update carried pallet visuals */
  setCarrying(n: number): void {
    this.carrying = n;
    this.palletMounts.forEach((m, i) => (m.visible = i < n));
  }

  // ---------- movement ----------

  update(dt: number, inputX: number, inputY: number, colliders: AABB[]): void {
    const loaded = this.carrying > 0;
    const maxSpeed = this.cfg.maxSpeed * (loaded ? this.cfg.loadedSpeedFactor : 1) * (1 + (this.speedBonus ?? 0));
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
    // hands / hitch point slightly behind the character
    const hx = this.x - Math.sin(this.heading) * 0.3;
    const hz = this.z - Math.cos(this.heading) * 0.3;
    // link 1: steering head follows the hitch at handleLength
    let dx = hx - this.steerPos.x;
    let dz = hz - this.steerPos.y;
    let len = Math.hypot(dx, dz) || 1e-6;
    this.steerPos.set(hx - (dx / len) * this.cfg.handleLength, hz - (dz / len) * this.cfg.handleLength);
    // keep the pompwagen out of walls too
    const sp = this.resolve(this.steerPos.x, this.steerPos.y, 0.3, colliders);
    this.steerPos.set(sp.x, sp.z);
    // link 2: body pivots around the fork rollers
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

    // steering head turns toward the handle
    const handleYaw = Math.atan2(hx - this.steerPos.x, hz - this.steerPos.y);
    this.steerHead.rotation.y = handleYaw - bodyYaw;

    // handle mesh between hands (high) and steering head (low)
    const hand = new THREE.Vector3(hx, 0.82, hz);
    const pivot = new THREE.Vector3(this.steerPos.x, 0.32, this.steerPos.y);
    const mid = hand.clone().add(pivot).multiplyScalar(0.5);
    this.handleMesh.position.copy(mid);
    const dir = hand.clone().sub(pivot);
    this.handleMesh.scale.set(1, dir.length(), 1);
    this.handleMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());

    // wheels spin with speed, legs walk
    const spin = this.speed * dt * 10;
    for (const w of [...this.steerWheels, ...this.forkWheels]) w.rotation.x += spin;
    this.walkT += this.speed * dt * 6;
    const swing = this.speed > 0.2 ? Math.sin(this.walkT) * 0.5 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
  }

  speedBonus = 0;

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
          z = c.maxZ + r; // degenerate: push out along +z
        }
      }
    }
    return { x, z };
  }
}
