import * as THREE from 'three';
import layout from '../../config/layout.json';
import { MergeBuilder, mat } from '../Merge';
import { Loop, buildLoops } from './Loops';

const C = layout.city;

interface Mover {
  loop: Loop;
  dist: number;
  speed: number;
  maxSpeed: number;
  /** 0 = car, 1 = van, 2 = bike */
  kind: number;
  color: THREE.Color;
  x: number;
  z: number;
  heading: number;
  wheelSpin: number;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

const CAR_COLORS = [0xd9d9d9, 0x243b6b, 0xa8322d, 0x2f7d45, 0x1b1e24, 0xdca62c, 0x7a7f87, 0xe8e8ec];

/** one InstancedMesh per part, so the whole fleet costs a handful of draw calls */
class Fleet {
  readonly meshes: THREE.InstancedMesh[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(parent: THREE.Object3D, parts: { geo: THREE.BufferGeometry; mat: THREE.Material; colored?: boolean }[], capacity: number) {
    for (const p of parts) {
      const mesh = new THREE.InstancedMesh(p.geo, p.mat, capacity);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      if (p.colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.meshes.push(mesh);
      parent.add(mesh);
    }
  }

  /** place instance `i` of part `part` at a local offset from a mover pose */
  place(part: number, i: number, x: number, z: number, heading: number, ox: number, oy: number, oz: number, scale: THREE.Vector3, spin = 0): void {
    const mesh = this.meshes[part];
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    this.v.set(x + ox * cos + oz * sin, oy, z - ox * sin + oz * cos);
    this.q.setFromAxisAngle(this.up, heading);
    if (spin) {
      const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spin);
      this.q.multiply(spinQ);
    }
    this.m.compose(this.v, this.q, scale);
    mesh.setMatrixAt(i, this.m);
  }

  setColor(part: number, i: number, c: THREE.Color): void {
    this.meshes[part].setColorAt(i, c);
  }

  finish(counts: number[]): void {
    this.meshes.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.visible = counts[i] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  get scaleTmp(): THREE.Vector3 {
    return this.s;
  }
}

/**
 * City traffic: cars and vans circling the ring roads and cyclists on the red
 * bike lanes. Everyone brakes for whatever is in front of them — other
 * vehicles, the warehouse trucks, or a red light at the junction ahead — so
 * nothing ever drives through anything else.
 */
export class Traffic {
  readonly group = new THREE.Group();
  private movers: Mover[] = [];
  private cars: Fleet;
  private bikes: Fleet;
  private junctions: { x: number; z: number }[];
  private lightPhase = 0;
  private lightTimer = 0;
  /** trucks and other game objects the traffic must not hit */
  obstacles: Obstacle[] = [];
  private scale = new THREE.Vector3(1, 1, 1);
  /** how many movers are actually simulated (lowered on weak devices) */
  private limit = Infinity;

  constructor(parent: THREE.Object3D, junctions: { x: number; z: number }[]) {
    this.junctions = junctions;
    parent.add(this.group);

    const bodyGeo = new THREE.BoxGeometry(1.8, 0.75, 4.2);
    const cabGeo = new THREE.BoxGeometry(1.65, 0.72, 2.3);
    const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const carMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.45 });
    const glassMat = mat(0x1d2a38, 0.1, 0.7);
    const tyreMat = mat(0x1c1d21, 0.9);
    this.cars = new Fleet(this.group, [
      { geo: bodyGeo, mat: carMat, colored: true },
      { geo: cabGeo, mat: glassMat },
      { geo: wheelGeo, mat: tyreMat },
    ], C.maxCars * 4);

    // bike: frame, two wheels, a rider
    const frame = new MergeBuilder();
    frame.box(0.06, 0.06, 1.0, mat(0x333940, 0.5, 0.5), 0, 0.62, 0);
    frame.box(0.06, 0.34, 0.06, mat(0x333940, 0.5, 0.5), 0, 0.45, -0.3);
    frame.box(0.42, 0.05, 0.05, mat(0x22252b, 0.7), 0, 0.82, 0.35);
    const frameGeo = mergeFleetGroup(frame);
    const bikeWheel = new THREE.TorusGeometry(0.33, 0.035, 6, 12);
    bikeWheel.rotateY(Math.PI / 2);
    const riderGeo = new THREE.CapsuleGeometry(0.17, 0.5, 4, 8);
    this.bikes = new Fleet(this.group, [
      { geo: frameGeo, mat: mat(0x333940, 0.5, 0.5) },
      { geo: bikeWheel, mat: mat(0x22252b, 0.7) },
      { geo: riderGeo, mat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), colored: true },
    ], C.maxBikes * 2);

    const loops = buildLoops();
    for (let i = 0; i < C.maxCars; i++) {
      const loop = loops.cars[i % loops.cars.length];
      this.movers.push(this.spawn(loop, i / C.maxCars, Math.random() < 0.25 ? 1 : 0));
    }
    for (let i = 0; i < C.maxBikes; i++) {
      const loop = loops.bikes[i % loops.bikes.length];
      this.movers.push(this.spawn(loop, i / C.maxBikes, 2));
    }
  }

  private spawn(loop: Loop, frac: number, kind: number): Mover {
    const maxSpeed = kind === 2 ? C.bikeSpeed : C.carSpeedMin + Math.random() * (C.carSpeedMax - C.carSpeedMin);
    const dist = loop.total * frac + Math.random() * 20;
    const pose = loop.poseAt(dist);
    return {
      loop,
      dist,
      speed: maxSpeed,
      maxSpeed,
      kind,
      color: new THREE.Color(kind === 2 ? 0xff7a1a : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]),
      x: pose.x,
      z: pose.z,
      heading: pose.heading,
      wheelSpin: 0,
    };
  }

  /** is anything blocking the mover within `gap` metres ahead? */
  private blocked(m: Mover, gap: number): boolean {
    const fx = Math.sin(m.heading);
    const fz = Math.cos(m.heading);
    for (const o of this.movers) {
      if (o === m) continue;
      const dx = o.x - m.x;
      const dz = o.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d > gap || d < 0.001) continue;
      if ((dx * fx + dz * fz) / d > 0.55) return true;
    }
    for (const o of this.obstacles) {
      const dx = o.x - m.x;
      const dz = o.z - m.z;
      const d = Math.hypot(dx, dz) - o.r;
      if (d > gap || d < -o.r) continue;
      const dot = (dx * fx + dz * fz) / Math.max(0.001, Math.hypot(dx, dz));
      if (dot > 0.2) return true;
    }
    return false;
  }

  /** red light on the junction ahead? */
  private redAhead(m: Mover): boolean {
    const ns = Math.abs(Math.cos(m.heading)) > 0.7;
    if ((this.lightPhase === 0) === ns) return false; // our axis is green
    const fx = Math.sin(m.heading);
    const fz = Math.cos(m.heading);
    for (const j of this.junctions) {
      const dx = j.x - m.x;
      const dz = j.z - m.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 2 || ahead > 9) continue;
      const side = Math.abs(dx * fz - dz * fx);
      if (side < 6) return true;
    }
    return false;
  }

  /** fewer cars and bikes on low graphics settings */
  setLimit(fraction: number): void {
    this.limit = Math.max(2, Math.round(this.movers.length * fraction));
  }

  update(dt: number): void {
    this.lightTimer += dt;
    if (this.lightTimer >= C.lightSeconds) {
      this.lightTimer = 0;
      this.lightPhase = 1 - this.lightPhase;
    }

    let carN = 0;
    let wheelN = 0;
    let bikeN = 0;
    let bikeWheelN = 0;
    const active = Math.min(this.movers.length, this.limit);
    for (let mi = 0; mi < active; mi++) {
      const m = this.movers[mi];
      const gap = m.kind === 2 ? C.bikeGap : C.carGap;
      const stop = this.blocked(m, gap) || this.redAhead(m);
      const target = stop ? 0 : m.maxSpeed;
      const rate = stop ? 14 : 4;
      m.speed += Math.max(-rate * dt, Math.min(rate * dt, target - m.speed));
      m.speed = Math.max(0, m.speed);
      m.dist += m.speed * dt;
      const pose = m.loop.poseAt(m.dist);
      m.x = pose.x;
      m.z = pose.z;
      // corners are sharp; turn smoothly toward the new heading
      let diff = pose.heading - m.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      m.heading += Math.max(-3.5 * dt, Math.min(3.5 * dt, diff));
      m.wheelSpin += (m.speed * dt) / 0.33;

      if (m.kind === 2) {
        this.bikes.place(0, bikeN, m.x, m.z, m.heading, 0, 0, 0, this.scale);
        this.bikes.place(2, bikeN, m.x, m.z, m.heading, 0, 1.15, -0.1, this.scale);
        this.bikes.setColor(2, bikeN, m.color);
        bikeN++;
        for (const oz of [-0.5, 0.5]) {
          this.bikes.place(1, bikeWheelN++, m.x, m.z, m.heading, 0, 0.33, oz, this.scale, m.wheelSpin);
        }
      } else {
        const van = m.kind === 1;
        const s = van ? this.scale.set(1.08, 1.5, 1.15) : this.scale.set(1, 1, 1);
        this.cars.place(0, carN, m.x, m.z, m.heading, 0, van ? 0.95 : 0.72, 0, s);
        this.cars.setColor(0, carN, m.color);
        this.cars.place(1, carN, m.x, m.z, m.heading, 0, van ? 1.75 : 1.42, van ? 0.2 : -0.35, van ? this.scale.set(1.05, 1.3, 1.6) : this.scale.set(1, 1, 1));
        carN++;
        this.scale.set(1, 1, 1);
        for (const ox of [-0.82, 0.82]) {
          for (const oz of [-1.35, 1.35]) this.cars.place(2, wheelN++, m.x, m.z, m.heading, ox, 0.33, oz, this.scale, m.wheelSpin);
        }
      }
    }
    this.cars.finish([carN, carN, wheelN]);
    this.bikes.finish([bikeN, bikeWheelN, bikeN]);
  }
}

/** bake a MergeBuilder group down to a single geometry for instancing */
function mergeFleetGroup(b: MergeBuilder): THREE.BufferGeometry {
  const g = b.build(false, false);
  const mesh = g.children[0] as THREE.Mesh;
  return mesh.geometry;
}
