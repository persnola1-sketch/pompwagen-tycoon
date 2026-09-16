import * as THREE from 'three';
import layout from '../../config/layout.json';
import { buildLoops, Loop } from './Loops';

const C = layout.city;
const COATS = [0x2c3e66, 0x8d4a38, 0x2f7d45, 0x6b4d8a, 0xc9a24a, 0x3a4150, 0xb8452c];

interface Walker {
  loop: Loop;
  dist: number;
  speed: number;
  color: THREE.Color;
  bob: number;
}

/**
 * People strolling the sidewalks: two instanced meshes (body and head) with a
 * little walking bob, so a dozen pedestrians cost two draw calls.
 */
export class Pedestrians {
  readonly group = new THREE.Group();
  private walkers: Walker[] = [];
  private body: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    const n = C.maxPedestrians;
    this.body = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(0.19, 0.62, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
      n,
    );
    this.body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe0ac85, roughness: 0.8 }), n);
    for (const mesh of [this.body, this.head]) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    const loops = buildLoops().walks;
    for (let i = 0; i < n; i++) {
      const loop = loops[i % loops.length];
      this.walkers.push({
        loop,
        dist: (loop.total * i) / n + Math.random() * 15,
        speed: C.walkSpeed * (0.8 + Math.random() * 0.5),
        color: new THREE.Color(COATS[i % COATS.length]),
        bob: Math.random() * 6,
      });
    }
  }

  update(dt: number): void {
    this.walkers.forEach((w, i) => {
      w.dist += w.speed * dt;
      w.bob += dt * w.speed * 5;
      const p = w.loop.poseAt(w.dist);
      const lift = Math.abs(Math.sin(w.bob)) * 0.05;
      this.q.setFromAxisAngle(this.up, p.heading);
      this.m.compose(this.v.set(p.x, 0.72 + lift, p.z), this.q, this.s);
      this.body.setMatrixAt(i, this.m);
      this.body.setColorAt(i, w.color);
      this.m.compose(this.v.set(p.x, 1.28 + lift, p.z), this.q, this.s);
      this.head.setMatrixAt(i, this.m);
    });
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }
}
