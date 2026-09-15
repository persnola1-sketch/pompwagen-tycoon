import * as THREE from 'three';
import layout from '../config/layout.json';
import { TruckKind } from '../core/EventBus';
import { textSprite } from './Textures';
import { createPallet } from './Pallet';

interface Segment {
  x0: number; z0: number; r0: number;
  x1: number; z1: number; r1: number;
  dur: number;
  reverse: boolean;
}

/**
 * A box truck that visibly drives in from the road, swings around, reverses
 * to the dock door, waits while (un)loading, then drives away.
 * Model faces +z in local space; rotation.y=0 → forward (0,0,1).
 */
export class Truck {
  readonly group = new THREE.Group();
  kind: TruckKind;
  phase: 'hidden' | 'arriving' | 'docked' | 'leaving' = 'hidden';
  onDocked: (() => void) | null = null;
  onGone: (() => void) | null = null;
  onBeep: (() => void) | null = null;

  private segs: Segment[] = [];
  private segIndex = 0;
  private segT = 0;
  private wheels: THREE.Mesh[] = [];
  private nameMats: THREE.MeshBasicMaterial[] = [];
  private labelMat: THREE.MeshBasicMaterial;
  private label: THREE.Mesh;
  private cargo: THREE.Group[] = [];
  private cargoRoot = new THREE.Group();
  private beepTimer = 0;
  private side: number;
  private readonly length = 7.5;

  constructor(kind: TruckKind, parent: THREE.Object3D) {
    this.kind = kind;
    this.side = kind === 'supplier' ? -1 : 1;
    this.buildModel(kind === 'supplier' ? 0x2563b8 : 0xc2571f);
    this.group.visible = false;
    parent.add(this.group);

    this.labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.0), this.labelMat);
    this.label.position.set(0, 4.6, 2.5);
    this.label.visible = false;
    this.group.add(this.label);
    this.group.add(this.cargoRoot);
  }

  private buildModel(color: number): void {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8eaee, roughness: 0.5, metalness: 0.15 });
    const cabMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.85 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9cc4e0, roughness: 0.15, metalness: 0.6 });

    // trailer box with an open rear (rear at z=0.15) so cargo shows at the dock
    const panels: [number, number, number, number, number, number][] = [
      [2.5, 0.08, 5.4, 0, 3.21, 2.85], // roof
      [2.5, 0.08, 5.4, 0, 0.59, 2.85], // floor
      [0.07, 2.7, 5.4, -1.22, 1.9, 2.85], // left
      [0.07, 2.7, 5.4, 1.22, 1.9, 2.85], // right
      [2.5, 2.7, 0.07, 0, 1.9, 5.52], // front
    ];
    for (const [w, h, d, x, y, z] of panels) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      p.position.set(x, y, z);
      p.castShadow = true;
      this.group.add(p);
    }
    // rolled-up rear shutter hint
    const shutter = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.25, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x8d939c, roughness: 0.5, metalness: 0.5 }),
    );
    shutter.position.set(0, 3.0, 0.3);
    this.group.add(shutter);

    // company name planes on both trailer sides
    for (const sx of [-1, 1]) {
      const m = new THREE.MeshBasicMaterial({ transparent: true });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.4), m);
      p.position.set(sx * 1.26, 2.1, 2.85);
      p.rotation.y = sx * Math.PI / 2;
      this.group.add(p);
      this.nameMats.push(m);
    }

    // chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 6.6), darkMat);
    chassis.position.set(0, 0.7, 3.4);
    this.group.add(chassis);

    // cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 1.7), cabMat);
    cab.position.set(0, 1.55, 6.55);
    cab.castShadow = true;
    this.group.add(cab);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.06), glassMat);
    windshield.position.set(0, 1.9, 7.42);
    this.group.add(windshield);
    // bumper + lights
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.25), darkMat);
    bumper.position.set(0, 0.55, 7.45);
    this.group.add(bumper);
    for (const sx of [-1, 1]) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.18, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
      );
      light.position.set(sx * 0.9, 0.85, 7.5);
      this.group.add(light);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xd23b3b }),
      );
      tail.position.set(sx * 1.05, 0.85, 0.12);
      this.group.add(tail);
    }

    // wheels
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const wz of [1.1, 2.2, 6.3]) {
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(wheelGeo, darkMat);
        w.position.set(sx * 1.15, 0.5, wz);
        this.group.add(w);
        this.wheels.push(w);
      }
    }
  }

  /** show pallets stacked inside the (roofless-when-docked) trailer via count label + rear stack */
  setCargoCount(n: number): void {
    while (this.cargo.length > n) {
      const p = this.cargo.pop()!;
      this.cargoRoot.remove(p);
    }
    while (this.cargo.length < n) {
      const i = this.cargo.length;
      const p = createPallet();
      p.scale.setScalar(0.92);
      const col = i % 2;
      const row = Math.floor(i / 2) % 4;
      const lvl = Math.floor(i / 8);
      p.position.set(-0.55 + col * 1.1, 0.64 + lvl * 1.1, 0.75 + row * 1.28);
      p.rotation.y = Math.PI / 2;
      this.cargoRoot.add(p);
      this.cargo.push(p);
    }
  }

  setLabel(text: string): void {
    this.labelMat.map?.dispose();
    this.labelMat.map = textSprite(text, 'rgba(20,24,32,0.75)', '#ffffff', 512, 192, 56);
    this.labelMat.needsUpdate = true;
    this.label.visible = true;
  }

  startArrival(companyName: string, cargoCount: number): void {
    const cfg = this.kind === 'supplier' ? layout.truck.inbound : layout.truck.outbound;
    const wallX = this.side * (layout.warehouse.width / 2);
    const dockZ = layout.docks.doorZ[0];
    const laneX = cfg.approach.x;
    // heading: driving south (0,-1) → ry = PI ; facing away from warehouse: ry = side * PI/2
    const away = this.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    const v = layout.truck.driveSpeed;
    // rear pokes through the dock door so the docked truck is visible inside
    const rearAtDock = wallX - this.side * 1.2;
    const preDockX = wallX + this.side * (this.length + 1.2);

    for (const m of this.nameMats) {
      m.map?.dispose();
      m.map = textSprite(companyName, 'rgba(255,255,255,0)', this.kind === 'supplier' ? '#2563b8' : '#c2571f', 512, 160, 72);
      m.needsUpdate = true;
    }
    this.setCargoCount(cargoCount);

    this.segs = [
      { x0: cfg.spawn.x, z0: cfg.spawn.z, r0: Math.PI, x1: laneX, z1: dockZ + 9, r1: Math.PI, dur: Math.abs(cfg.spawn.z - (dockZ + 9)) / v, reverse: false },
      // swing around to face away from the warehouse
      { x0: laneX, z0: dockZ + 9, r0: Math.PI, x1: preDockX, z1: dockZ, r1: away + (this.side < 0 ? Math.PI * 2 : 0), dur: 2.2, reverse: false },
      // reverse to the dock
      { x0: preDockX, z0: dockZ, r0: away + (this.side < 0 ? Math.PI * 2 : 0), x1: rearAtDock, z1: dockZ, r1: away + (this.side < 0 ? Math.PI * 2 : 0), dur: Math.abs(preDockX - rearAtDock) / layout.truck.reverseSpeed, reverse: true },
    ];
    this.segIndex = 0;
    this.segT = 0;
    this.phase = 'arriving';
    this.group.visible = true;
    this.applyPose(this.segs[0], 0);
  }

  startDeparture(): void {
    const cfg = this.kind === 'supplier' ? layout.truck.inbound : layout.truck.outbound;
    const dockZ = layout.docks.doorZ[0];
    const away = this.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    const wallX = this.side * (layout.warehouse.width / 2);
    const rearAtDock = wallX - this.side * 1.2;
    const laneX = cfg.approach.x;
    const v = layout.truck.driveSpeed;
    this.label.visible = false;

    // south-facing heading chosen so the nose swings away from the warehouse
    const south = this.side < 0 ? -Math.PI : Math.PI;
    this.segs = [
      // pull away from the dock, swinging toward the exit lane
      { x0: rearAtDock, z0: dockZ, r0: away, x1: laneX, z1: dockZ - 6, r1: south, dur: 2.4, reverse: false },
      { x0: laneX, z0: dockZ - 6, r0: south, x1: cfg.exit.x, z1: cfg.exit.z, r1: south, dur: Math.abs(dockZ - 6 - cfg.exit.z) / v, reverse: false },
    ];
    this.segIndex = 0;
    this.segT = 0;
    this.phase = 'leaving';
  }

  private applyPose(s: Segment, t: number): void {
    // smoothstep ease within a segment
    const e = t * t * (3 - 2 * t);
    this.group.position.set(s.x0 + (s.x1 - s.x0) * e, 0, s.z0 + (s.z1 - s.z0) * e);
    this.group.rotation.y = s.r0 + (s.r1 - s.r0) * e;
  }

  update(dt: number): void {
    if (this.phase === 'hidden' || this.phase === 'docked') return;
    const s = this.segs[this.segIndex];
    if (!s) return;
    this.segT += dt / s.dur;
    const speed = Math.hypot(s.x1 - s.x0, s.z1 - s.z0) / s.dur;
    for (const w of this.wheels) w.rotation.x += (s.reverse ? -1 : 1) * speed * dt * 2;
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
          this.onDocked?.();
        } else {
          this.phase = 'hidden';
          this.group.visible = false;
          this.setCargoCount(0);
          this.onGone?.();
        }
      }
    } else {
      this.applyPose(s, this.segT);
    }
  }
}
