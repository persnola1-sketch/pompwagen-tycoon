import * as THREE from 'three';
import layout from '../config/layout.json';
import { canvas, tex } from './Textures';

const W = layout.warehouse.width;
const D = layout.warehouse.depth;

/**
 * Small touches that make the world feel alive: dust motes floating in the
 * light from the roof lamps, and a flock of birds circling over the city.
 */
export class Ambience {
  readonly group = new THREE.Group();
  private motes: THREE.Points;
  private birds: THREE.InstancedMesh;
  private birdPhase: number[] = [];
  private time = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);

    // dust motes inside the hall
    const count = 160;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * W;
      pos[i * 3 + 1] = 0.6 + Math.random() * 5.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * D;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const [c, ctx] = canvas(32);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,245,215,0.9)');
    g.addColorStop(1, 'rgba(255,245,215,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.09, map: tex(c), transparent: true, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending }),
    );
    this.motes.frustumCulled = false;
    this.group.add(this.motes);

    // birds: a flat V that flaps as it circles
    const bird = new THREE.BufferGeometry();
    const verts = new Float32Array([0, 0, 0.18, -0.55, 0.06, -0.2, 0.55, 0.06, -0.2]);
    bird.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    bird.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(
      bird,
      new THREE.MeshBasicMaterial({ color: 0x3a4150, side: THREE.DoubleSide }),
      9,
    );
    this.birds.frustumCulled = false;
    for (let i = 0; i < 9; i++) this.birdPhase.push(Math.random() * Math.PI * 2);
    this.group.add(this.birds);
  }

  setMotesVisible(on: boolean): void {
    this.motes.visible = on;
  }

  update(dt: number): void {
    this.time += dt;
    // motes drift slowly upward and wrap around
    const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * 0.12;
      if (y > 6) y = 0.5;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(this.time * 0.4 + i) * dt * 0.06);
    }
    pos.needsUpdate = true;

    for (let i = 0; i < this.birds.count; i++) {
      const p = this.birdPhase[i];
      const r = 55 + (i % 3) * 18;
      const a = this.time * (0.12 + (i % 4) * 0.015) + p;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.7 - 10;
      const y = 26 + Math.sin(this.time * 0.5 + p) * 3 + (i % 3) * 2;
      const flap = Math.sin(this.time * 7 + p) * 0.5;
      this.q.setFromEuler(new THREE.Euler(flap * 0.5, -a + Math.PI / 2, 0));
      this.m.compose(this.v.set(x, y, z), this.q, this.s.set(1.6, 1.6, 1.6));
      this.birds.setMatrixAt(i, this.m);
    }
    this.birds.instanceMatrix.needsUpdate = true;
  }
}
