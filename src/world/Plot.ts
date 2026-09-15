import * as THREE from 'three';
import layout from '../config/layout.json';
import { AABB } from './Warehouse';
import { MergeBuilder, mat, unitBox, unitCylinder, uvBox, uvPlane } from './Merge';
import { canvas, tex, textSprite } from './Textures';

const W = layout.warehouse.width;
const D = layout.warehouse.depth;
const HALF_W = W / 2;
const HALF_D = D / 2;
const MARGIN = 4;

function sandTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#c9b48a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const v = Math.floor(Math.random() * 50) - 25;
    ctx.fillStyle = `rgba(${170 + v},${150 + v},${110 + v},0.6)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // gravel patches
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(120,118,112,${0.3 + Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c, 1);
}

/**
 * The empty plot a new game starts on: fenced sand/gravel lot with a FOR SALE
 * sign, a site container, tyre tracks and weeds. Hidden once the warehouse
 * is built.
 */
export class Plot {
  readonly group = new THREE.Group();
  /** everything except the sand, hidden the moment construction starts */
  readonly dressing = new THREE.Group();
  readonly colliders: AABB[] = [];

  constructor() {
    const sand = sandTexture();
    sand.repeat.set(1, 1);
    const ground = new THREE.Mesh(
      uvPlane(W + MARGIN * 2, D + MARGIN * 2, 5),
      new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.005;
    ground.receiveShadow = true;
    this.group.add(ground, this.dressing);

    const b = new MergeBuilder();
    this.buildFence(b);
    this.buildSign(b);
    this.buildContainer(b);
    this.buildWeeds(b);
    this.dressing.add(b.build());
  }

  private buildFence(b: MergeBuilder): void {
    const wood = mat(0x8b6a44, 0.9);
    const hx = HALF_W + MARGIN - 0.4;
    const hz = HALF_D + MARGIN - 0.4;
    const post = (x: number, z: number): void => b.box(0.14, 1.1, 0.14, wood, x, 0.55, z);
    const rail = (x0: number, z0: number, x1: number, z1: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.45, 0.9]) b.add(unitBox, wood, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, ry, 0, 0.05, 0.1, len);
    };
    const step = 3;
    for (let x = -hx; x <= hx + 0.01; x += step) {
      post(x, -hz);
      post(x, hz);
    }
    for (let z = -hz + step; z < hz; z += step) {
      post(-hx, z);
      post(hx, z);
    }
    rail(-hx, -hz, hx, -hz);
    rail(-hx, hz, -3, hz); // gap in the south fence for the entrance
    rail(3, hz, hx, hz);
    rail(-hx, -hz, -hx, hz);
    rail(hx, -hz, hx, hz);
  }

  private buildSign(b: MergeBuilder): void {
    const p = layout.plot.sign;
    const post = mat(0x6e5138, 0.9);
    for (const dx of [-1.1, 1.1]) b.box(0.12, 2.6, 0.12, post, p.x + dx, 1.3, p.z);
    b.box(2.6, 1.3, 0.08, mat(0xf4f4f0, 0.6), p.x, 2.0, p.z);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 1.2),
      new THREE.MeshBasicMaterial({ map: textSprite('FOR SALE', '#f4f4f0', '#c8302c', 512, 246, 96) }),
    );
    board.position.set(p.x, 2.0, p.z + 0.05);
    this.dressing.add(board);
    const sub = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.4),
      new THREE.MeshBasicMaterial({ map: textSprite(`INDUSTRIAL PLOT · ${W}×${D} m`, '#23427c', '#ffffff', 512, 86, 40) }),
    );
    sub.position.set(p.x, 1.2, p.z + 0.05);
    this.dressing.add(sub);
    this.colliders.push({ minX: p.x - 1.3, maxX: p.x + 1.3, minZ: p.z - 0.2, maxZ: p.z + 0.2 });
  }

  private buildContainer(b: MergeBuilder): void {
    const c = layout.plot.container;
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f5fa8, roughness: 0.6, metalness: 0.3 });
    const dark = mat(0x1f2a3a, 0.7);
    b.add(uvBox(6, 2.6, 2.4, 1), blue, c.x, 1.3 + 0.1, c.z);
    b.box(6.1, 0.1, 2.5, dark, c.x, 0.05, c.z);
    b.box(6.1, 0.08, 2.5, dark, c.x, 2.72, c.z);
    for (let i = 0; i < 9; i++) b.box(0.06, 2.4, 0.04, dark, c.x - 2.8 + i * 0.7, 1.4, c.z + 1.21);
    b.box(0.05, 0.4, 0.05, mat(0xd6dce2, 0.2, 0.9), c.x + 3.02, 1.3, c.z + 0.4);
    b.box(0.05, 0.4, 0.05, mat(0xd6dce2, 0.2, 0.9), c.x + 3.02, 1.3, c.z - 0.4);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.7),
      new THREE.MeshBasicMaterial({ map: textSprite('SITE OFFICE', '#2f5fa8', '#ffffff', 384, 84, 46) }),
    );
    label.position.set(c.x, 1.9, c.z + 1.23);
    this.dressing.add(label);
    this.colliders.push({ minX: c.x - 3.1, maxX: c.x + 3.1, minZ: c.z - 1.3, maxZ: c.z + 1.3 });
    // a pallet of bricks and a wheelbarrow next to it
    b.box(1.2, 0.7, 0.8, mat(0xa8553a, 0.9), c.x + 4.2, 0.45, c.z + 0.2);
    b.box(1.2, 0.12, 0.8, mat(0xb08b5f, 0.9), c.x + 4.2, 0.06, c.z + 0.2);
    b.box(0.7, 0.4, 1.0, mat(0x2f7d45, 0.6), c.x + 4.4, 0.45, c.z - 1.2);
    b.add(unitCylinder, mat(0x1c1d21, 0.9), c.x + 4.4, 0.2, c.z - 1.75, 0, 0, Math.PI / 2, 0.4, 0.12, 0.4);
  }

  private buildWeeds(b: MergeBuilder): void {
    const green = mat(0x6f9a4a, 0.95);
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 40; i++) {
      const x = (rnd() - 0.5) * (W + 6);
      const z = (rnd() - 0.5) * (D + 6);
      b.add(new THREE.ConeGeometry(0.18, 0.35, 5), green, x, 0.17, z, 0, rnd() * 3, 0, 1 + rnd(), 1 + rnd() * 1.5, 1 + rnd());
    }
    // tyre tracks: dark stripes in the sand
    const track = mat(0xa9977a, 1);
    for (const dx of [-0.9, 0.9]) b.box(0.3, 0.012, D + 6, track, 2 + dx, 0.01, 0, 0);
  }
}
