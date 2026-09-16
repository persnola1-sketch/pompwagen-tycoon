import * as THREE from 'three';
import layout from '../../config/layout.json';
import { MergeBuilder, glow, mat, unitBox, unitCylinder, uvBox } from '../Merge';
import { canvas, corrugatedWallTexture, textSprite, tex } from '../Textures';
import { drawMark } from '../../ui/Logo';

const C = layout.city;
const EDGE = C.roadWidth / 2 + C.bikeLane + 0.25 + C.sidewalk;

export interface StoreBrand {
  name: string;
  color: string;
  accent?: string;
  mark?: string;
}

/** deterministic RNG so the city looks the same on every load */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

const BRICK = [0xa8553a, 0x8d4a38, 0xb56b4a, 0x7e4634, 0xc07a55, 0x6d5548];
const ROOF = [0x3c3f47, 0x5a4038, 0x2f333a];

/**
 * The buildings that make up the city: Dutch terraced houses with stepped and
 * triangular gables, shops with awnings and brand signs (the client stores),
 * offices, a supermarket, a petrol station and neighbouring industrial halls.
 * Everything is merged per material; only the brand signs are separate planes.
 */
export class Buildings {
  readonly group = new THREE.Group();
  /** street-front positions of the client stores, for the map/labels later */
  readonly storeSpots: { name: string; x: number; z: number }[] = [];
  private b = new MergeBuilder();
  private rand = rng(90210);

  constructor(stores: StoreBrand[]) {
    const wallTex = corrugatedWallTexture();
    wallTex.repeat.set(1, 1);
    this.hallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xb7c3cf, roughness: 0.6, metalness: 0.3 });

    // south street: shops for the client stores, facing north toward the plot
    let sx = -70;
    for (const s of stores.slice(0, 4)) {
      this.shop(sx, C.ringZ + EDGE + 6, Math.PI, s);
      sx += 22;
    }
    // north street: the rest of the clients plus offices
    let nx = -62;
    for (const s of stores.slice(4, 8)) {
      this.shop(nx, -(C.ringZ + EDGE + 6), 0, s);
      nx += 22;
    }

    // terraces along the outer streets
    this.terrace(-80, C.outerZ - EDGE - 5, 0, 7, Math.PI);
    this.terrace(10, C.outerZ - EDGE - 5, 0, 8, Math.PI);
    this.terrace(-78, -(C.outerZ - EDGE - 5), 0, 8, 0);
    this.terrace(22, -(C.outerZ - EDGE - 5), 0, 6, 0);
    this.terrace(C.outerX - EDGE - 5, -40, Math.PI / 2, 7, -Math.PI / 2);
    this.terrace(-(C.outerX - EDGE - 5), 10, Math.PI / 2, 7, Math.PI / 2);

    // offices on the east ring
    this.office(C.ringX + EDGE + 8, -8, -Math.PI / 2, 5);
    this.office(C.ringX + EDGE + 8, 14, -Math.PI / 2, 4);
    this.office(-(C.ringX + EDGE + 9), -22, Math.PI / 2, 6);

    this.supermarket(-(C.ringX + EDGE + 14), 22, Math.PI / 2);
    this.gasStation(C.ringX + EDGE + 12, C.ringZ - 22, -Math.PI / 2);
    this.hall(-(C.ringX + EDGE + 16), -52, 30, 11, 26, 'NOORD LOGISTIEK');
    this.hall(C.ringX + EDGE + 18, -50, 26, 9, 24, 'KOELHUIS DELTA');
    this.park(0, -(C.ringZ + EDGE + 14), 34, 16);
    this.park(-24, C.outerZ - EDGE - 22, 26, 14);

    this.group.add(this.b.build());
  }

  private hallMat: THREE.MeshStandardMaterial;

  private sign(text: string, bg: string, fg: string, x: number, y: number, z: number, ry: number, w = 5, h = 1.1): void {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textSprite(text, bg, fg, 512, Math.round((512 * h) / w), 76) }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.group.add(m);
  }

  /** shop fascia: the brand mark next to its name */
  private brandSign(b: StoreBrand, x: number, y: number, z: number, ry: number, w: number, h: number): void {
    const W = 512;
    const H = Math.round((W * h) / w);
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = b.color;
    ctx.fillRect(0, 0, W, H);
    const size = H * 0.8;
    drawMark(ctx, b.mark ?? 'circle', 10, (H - size) / 2, size, b.accent ?? '#ffffff');
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(H * 0.62)}px -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.name, size + 22, H / 2, W - size - 34);
    const t = tex(c, 1);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.group.add(m);
  }

  /** a shop with a glass front, awning and a lit brand sign */
  private shop(x: number, z: number, facing: number, brand: StoreBrand): void {
    const b = this.b;
    const w = 13;
    const d = 9;
    const h = 5.2;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const wall = mat(0xe8e2d8, 0.8);
    const trim = mat(parseInt(brand.color.slice(1), 16), 0.5, 0.2);
    b.add(uvBox(w, h, d, 3), wall, x, h / 2, z, 0, facing, 0);
    b.box(w + 0.5, 0.35, d + 0.5, mat(ROOF[0], 0.8), x, h + 0.15, z, facing);
    // glass shopfront on the street side
    b.add(unitBox, mat(0x1d3347, 0.15, 0.8), x + fx * (d / 2 + 0.03), 1.9, z + fz * (d / 2 + 0.03), 0, facing, 0, w - 1.6, 2.6, 0.1);
    // awning
    b.add(unitBox, trim, x + fx * (d / 2 + 0.7), 3.5, z + fz * (d / 2 + 0.7), 0.25 * fz, facing, -0.25 * fx, w - 1.2, 0.12, 1.6);
    b.box(w, 0.9, 0.2, trim, x + fx * (d / 2 + 0.05), 4.3, z + fz * (d / 2 + 0.05), facing);
    this.brandSign(brand, x + fx * (d / 2 + 0.16), 4.3, z + fz * (d / 2 + 0.16), facing, w - 1.2, 0.85);
    this.storeSpots.push({ name: brand.name, x: x + fx * (d / 2 + 3), z: z + fz * (d / 2 + 3) });
  }

  /** a run of narrow Dutch houses with alternating gables */
  private terrace(x: number, z: number, axis: number, count: number, facing: number): void {
    const b = this.b;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const ax = Math.cos(axis);
    const az = -Math.sin(axis);
    for (let i = 0; i < count; i++) {
      const w = 5 + this.rand() * 1.4;
      const h = 7 + Math.floor(this.rand() * 3) * 1.6;
      const d = 8;
      const hx = x + ax * (i * 6.2);
      const hz = z + az * (i * 6.2);
      const brick = mat(BRICK[Math.floor(this.rand() * BRICK.length)], 0.92);
      b.add(uvBox(w, h, d, 2), brick, hx, h / 2, hz, 0, facing, 0);
      // stepped or triangular gable facing the street
      if (this.rand() < 0.5) {
        for (let s = 0; s < 3; s++) {
          const sw = w - s * 1.4;
          b.add(unitBox, brick, hx, h + 0.4 + s * 0.8, hz, 0, facing, 0, Math.max(0.8, sw), 0.8, d * 0.5);
        }
      } else {
        b.add(new THREE.CylinderGeometry(0.01, w * 0.72, 2.6, 4), mat(ROOF[Math.floor(this.rand() * ROOF.length)], 0.85), hx, h + 1.3, hz, 0, facing + Math.PI / 4, 0, 1, 1, (d * 0.7) / (w * 0.72));
      }
      // windows and a door on the street face
      const glass = mat(0x2a4a63, 0.2, 0.6);
      for (let f = 0; f < Math.floor(h / 2.6); f++) {
        for (const s of [-1, 1]) {
          b.add(unitBox, glass, hx + fx * (d / 2 + 0.03) + ax * s * 1.2, 1.6 + f * 2.6, hz + fz * (d / 2 + 0.03) + az * s * 1.2, 0, facing, 0, 1.1, 1.5, 0.08);
        }
      }
      b.add(unitBox, mat(0x4a3a2c, 0.8), hx + fx * (d / 2 + 0.04), 1.05, hz + fz * (d / 2 + 0.04), 0, facing, 0, 1.0, 2.1, 0.1);
      // a bike leaning on the front wall
      if (this.rand() < 0.6) {
        const bx = hx + fx * (d / 2 + 0.6) + ax * 1.8;
        const bz = hz + fz * (d / 2 + 0.6) + az * 1.8;
        const frame = mat(0x333940, 0.5, 0.5);
        for (const o of [-0.45, 0.45]) {
          b.add(new THREE.TorusGeometry(0.3, 0.035, 5, 12), frame, bx + ax * o, 0.32, bz + az * o, 0, facing + Math.PI / 2, 0);
        }
        b.add(unitBox, frame, bx, 0.62, bz, 0, facing + Math.PI / 2, 0, 0.05, 0.05, 0.9);
      }
    }
  }

  private office(x: number, z: number, facing: number, floors: number): void {
    const b = this.b;
    const w = 14;
    const d = 12;
    const h = floors * 3.2;
    b.add(uvBox(w, h, d, 3), mat(0xc9ccd2, 0.6, 0.2), x, h / 2, z, 0, facing, 0);
    b.box(w + 0.6, 0.4, d + 0.6, mat(0x3c3f47, 0.8), x, h + 0.2, z, facing);
    const glass = mat(0x2a4a63, 0.15, 0.7);
    for (let f = 0; f < floors; f++) {
      for (const s of [-1, 1]) {
        b.add(unitBox, glass, x + Math.sin(facing) * s * (d / 2 + 0.03), 1.9 + f * 3.2, z + Math.cos(facing) * s * (d / 2 + 0.03), 0, facing, 0, w - 1.4, 1.9, 0.08);
        b.add(unitBox, glass, x + Math.cos(facing) * s * (w / 2 + 0.03), 1.9 + f * 3.2, z - Math.sin(facing) * s * (w / 2 + 0.03), 0, facing + Math.PI / 2, 0, d - 1.4, 1.9, 0.08);
      }
    }
    // roof plant and aerial
    b.box(3, 1.2, 3, mat(0x9aa3ad, 0.6, 0.4), x, h + 0.9, z, facing);
    b.add(unitCylinder, mat(0x8b939e, 0.5, 0.6), x + 4, h + 2.2, z + 3, 0, 0, 0, 0.12, 4, 0.12);
  }

  private supermarket(x: number, z: number, facing: number): void {
    const b = this.b;
    const w = 26;
    const d = 18;
    const h = 6.5;
    b.add(uvBox(w, h, d, 3), mat(0xeef1f4, 0.7), x, h / 2, z, 0, facing, 0);
    b.box(w + 1, 0.5, d + 1, mat(0x2f6fb4, 0.7), x, h + 0.25, z, facing);
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    b.add(unitBox, mat(0x1d3347, 0.15, 0.8), x + fx * (d / 2 + 0.03), 2.2, z + fz * (d / 2 + 0.03), 0, facing, 0, w - 4, 3.2, 0.1);
    this.sign('POLDERHAL', '#2f6fb4', '#ffffff', x + fx * (d / 2 + 0.2), 5.4, z + fz * (d / 2 + 0.2), facing, 12, 2);
    // trolley shelter and parked cars
    b.box(6, 0.15, 3, mat(0x9aa3ad, 0.6, 0.4), x + fx * (d / 2 + 5), 2.6, z + fz * (d / 2 + 5), facing);
    for (const o of [-2, 0, 2]) b.box(0.12, 2.5, 0.12, mat(0x8b939e, 0.5, 0.6), x + fx * (d / 2 + 5) + Math.cos(facing) * o, 1.3, z + fz * (d / 2 + 5) - Math.sin(facing) * o, facing);
  }

  private gasStation(x: number, z: number, facing: number): void {
    const b = this.b;
    const canopy = mat(0xf2f2ee, 0.6);
    const red = mat(0xc8302c, 0.5);
    b.box(14, 0.6, 10, canopy, x, 5.4, z, facing);
    b.box(14.2, 0.35, 10.2, red, x, 5.0, z, facing);
    for (const sx of [-5, 5]) for (const sz of [-3, 3]) b.box(0.4, 5, 0.4, mat(0xb9bfc6, 0.5, 0.5), x + sx, 2.5, z + sz, facing);
    for (const sz of [-2.2, 2.2]) {
      b.box(1.1, 1.8, 0.8, mat(0xdfe3e8, 0.5), x, 0.9, z + sz, facing);
      b.box(0.9, 0.5, 0.06, glow(0x46e38a), x, 1.5, z + sz + 0.42, facing);
    }
    b.add(uvBox(8, 3.6, 7, 2), canopy, x + Math.sin(facing) * 11, 1.8, z + Math.cos(facing) * 11, 0, facing, 0);
    b.box(8.4, 0.3, 7.4, red, x + Math.sin(facing) * 11, 3.7, z + Math.cos(facing) * 11, facing);
    this.sign('TANKSTOP', '#c8302c', '#ffffff', x + Math.sin(facing) * 11 + Math.sin(facing) * 3.55, 2.8, z + Math.cos(facing) * 11 + Math.cos(facing) * 3.55, facing, 5, 1);
  }

  private hall(x: number, z: number, w: number, h: number, d: number, name: string): void {
    const b = this.b;
    b.add(uvBox(w, h, d, 2.5), this.hallMat, x, h / 2, z);
    b.box(w + 0.6, 0.4, d + 0.6, mat(0x4a4f57, 0.8), x, h + 0.2, z);
    const face = x > 0 ? x - w / 2 - 0.02 : x + w / 2 + 0.02;
    for (let k = -1; k <= 1; k++) b.box(0.1, 4, 3.4, mat(0x5b6576, 0.5, 0.4), face, 2, z + k * (d / 4));
    this.sign(name, '#23427c', '#ffffff', face + (x > 0 ? -0.05 : 0.05), h - 1.6, z, x > 0 ? -Math.PI / 2 : Math.PI / 2, 10, 1.6);
  }

  private park(x: number, z: number, w: number, d: number): void {
    const b = this.b;
    b.box(w, 0.06, d, mat(0x6f9a4a, 1), x, 0.02, z);
    // path, benches and a pond
    b.box(w, 0.05, 2.2, mat(0xc6b89a, 0.95), x, 0.04, z);
    for (const o of [-w / 4, w / 4]) {
      b.box(1.6, 0.08, 0.5, mat(0x8b6a44, 0.9), x + o, 0.45, z + 1.8);
      for (const s of [-0.7, 0.7]) b.box(0.12, 0.42, 0.12, mat(0x4a4f57, 0.7), x + o + s, 0.21, z + 1.8);
    }
    b.add(unitCylinder, mat(0x2f6f9e, 0.3, 0.2), x - w / 3, 0.05, z - d / 3, 0, 0, 0, 6, 0.06, 4);
  }
}
