import * as THREE from 'three';
import layout from '../../config/layout.json';
import { Character, CharacterLook, DEFAULT_LOOK } from '../Character';
import { Effects } from '../Effects';
import { MergeBuilder, mat, unitBox, unitCylinder } from '../Merge';
import { Warehouse } from '../Warehouse';
import { hazardTexture } from '../Textures';

const W = layout.warehouse.width;
const D = layout.warehouse.depth;
const HALF_W = W / 2;
const HALF_D = D / 2;

const smooth = (t: number): number => t * t * (3 - 2 * t);
const win = (u: number, a: number, b: number): number => THREE.MathUtils.clamp((u - a) / (b - a), 0, 1);
const overshoot = (t: number): number => (t < 1 ? 1 + Math.sin(t * Math.PI) * 0.12 * (1 - t) + (t - 1) : 1);

interface Builder {
  ch: Character;
  x0: number;
  x1: number;
  z: number;
  t: number;
  dir: number;
}

/**
 * The 10-second warehouse construction cutscene: construction fence and tape,
 * the slab pours, the steel frame rises, wall panels slide in, the roof
 * closes, dock doors install, while a tower crane swings, builders walk about,
 * dust puffs and sparks fly. Drives the Warehouse part groups directly.
 */
export class WarehouseBuild {
  readonly group = new THREE.Group();
  private t = 0;
  private duration: number;
  private done = false;
  private onDone: (() => void) | null = null;
  private jib = new THREE.Group();
  private hook = new THREE.Group();
  private builders: Builder[] = [];
  private tape: THREE.Group;
  private dustTimer = 0;
  private sparkTimer = 0;
  private soundTimer = 0;
  /** progress 0..1 and seconds left, for the HUD bar */
  progress = 0;
  secondsLeft = 0;
  onTick: ((kind: 'hammer' | 'weld' | 'thud') => void) | null = null;

  constructor(parent: THREE.Object3D, private warehouse: Warehouse, private effects: Effects, duration: number) {
    this.duration = duration;
    this.tape = this.buildFence();
    this.group.add(this.tape);
    this.buildCrane();
    this.buildBuilders();
    parent.add(this.group);
    this.group.visible = false;
  }

  private buildFence(): THREE.Group {
    const b = new MergeBuilder();
    const panel = mat(0xc7ccd3, 0.5, 0.5);
    const foot = mat(0x4a4f57, 0.8);
    const hz = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 });
    const cone = mat(0xf25c1a, 0.5);
    const hx = HALF_W + 3;
    const hzz = HALF_D + 3;
    const seg = 3.5;
    const place = (x: number, z: number, ry: number): void => {
      b.box(seg - 0.2, 2.0, 0.05, panel, x, 1.05, z, ry);
      b.add(unitBox, foot, x, 0.08, z, 0, ry, 0, 0.7, 0.16, 0.3);
      b.add(unitBox, hz, x, 1.1, z, 0, ry, 0, seg - 0.2, 0.12, 0.06);
    };
    for (let x = -hx + seg / 2; x < hx; x += seg) {
      place(x, -hzz, 0);
      place(x, hzz, 0);
    }
    for (let z = -hzz + seg / 2; z < hzz; z += seg) {
      place(-hx, z, Math.PI / 2);
      place(hx, z, Math.PI / 2);
    }
    for (let i = 0; i < 8; i++) {
      b.add(new THREE.ConeGeometry(0.22, 0.55, 8), cone, -8 + i * 2.3, 0.27, hzz - 1.2);
      b.box(0.5, 0.05, 0.5, mat(0x1c1c1c, 0.8), -8 + i * 2.3, 0.025, hzz - 1.2);
    }
    const g = b.build();
    return g;
  }

  private buildCrane(): void {
    const b = new MergeBuilder();
    const yellow = mat(0xf2c018, 0.5, 0.2);
    const dark = mat(0x3a3f48, 0.6, 0.4);
    const cx = HALF_W + 6;
    const cz = -HALF_D - 4;
    const h = 16;
    b.box(2.2, 0.6, 2.2, dark, cx, 0.3, cz);
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.55]) b.box(0.12, h, 0.12, yellow, cx + sx, h / 2, cz + sz);
    for (let y = 1; y < h; y += 1.5) {
      b.box(1.2, 0.08, 0.08, yellow, cx, y, cz - 0.55);
      b.box(1.2, 0.08, 0.08, yellow, cx, y, cz + 0.55);
      b.box(0.08, 0.08, 1.2, yellow, cx - 0.55, y, cz);
      b.box(0.08, 0.08, 1.2, yellow, cx + 0.55, y, cz);
    }
    this.group.add(b.build());

    const j = new MergeBuilder();
    const jibLen = 24;
    j.box(1.4, 1.3, 1.4, dark, 0, 0.6, 0); // slewing unit
    j.box(1.6, 1.6, 2.0, mat(0xeef1f4, 0.5), 0.9, 1.4, -0.6); // cab
    j.box(1.6, 0.9, 0.05, mat(0x1d3347, 0.1, 0.8), 0.9, 1.6, 0.42);
    j.box(0.14, 0.14, jibLen, yellow, 0, 1.2, jibLen / 2);
    j.box(0.14, 0.14, jibLen, yellow, -0.5, 1.2, jibLen / 2);
    j.box(0.14, 0.14, jibLen, yellow, 0.5, 1.2, jibLen / 2);
    for (let z = 1; z < jibLen; z += 1.5) j.box(1.0, 0.08, 0.08, yellow, 0, 1.2, z);
    j.box(0.14, 0.14, 7, yellow, 0, 1.2, -3.5); // counter jib
    j.box(1.6, 1.4, 1.6, dark, 0, 1.2, -6.5); // counterweight
    j.box(0.1, 4, 0.1, yellow, 0, 3.2, 0); // apex
    this.jib.add(j.build());
    this.jib.position.set(cx, h, cz);
    this.group.add(this.jib);

    const hk = new MergeBuilder();
    hk.box(0.5, 0.35, 0.5, dark, 0, 0, 0);
    hk.add(new THREE.TorusGeometry(0.28, 0.06, 6, 12, Math.PI * 1.3), dark, 0, -0.45, 0, 0, 0, Math.PI * 1.15);
    hk.box(3.2, 0.25, 1.2, mat(0xdde3ea, 0.55, 0.35), 0, -1.1, 0); // wall panel on the hook
    this.hook.add(hk.build());
    const cable = new THREE.Mesh(unitCylinder, mat(0x1c1c1c, 0.8));
    cable.name = 'cable';
    this.hook.add(cable);
    this.jib.add(this.hook);
    this.hook.position.set(0, 1.2, 14);
  }

  private buildBuilders(): void {
    const looks: CharacterLook[] = [
      { ...DEFAULT_LOOK, vest: 0xffb020, shirt: 0x5a6b8a, skin: 0xc98a5b },
      { ...DEFAULT_LOOK, vest: 0xff7a1a, shirt: 0x3d4b5e, skin: 0x8d5a3b, height: 1.06 },
      { ...DEFAULT_LOOK, vest: 0xffb020, shirt: 0x6b4d3a, skin: 0xf0c9a8, height: 0.95, hatColor: 0xffffff },
    ];
    const lanes = [
      { x0: -12, x1: 12, z: HALF_D + 4.2 },
      { x0: -HALF_W - 1.5, x1: HALF_W + 1.5, z: HALF_D + 1.6 },
      { x0: -6, x1: 14, z: -HALF_D - 1.5 },
    ];
    looks.forEach((look, i) => {
      const ch = new Character(look);
      ch.armMode = 'idle';
      this.group.add(ch.group);
      this.builders.push({ ch, ...lanes[i], t: i * 0.3, dir: 1 });
    });
  }

  start(onDone: () => void): void {
    this.onDone = onDone;
    this.t = 0;
    this.done = false;
    this.group.visible = true;
    this.warehouse.group.visible = true;
    this.apply(0);
  }

  get active(): boolean {
    return this.group.visible && !this.done;
  }

  /** place every warehouse part for normalized time u (0..1) */
  private apply(u: number): void {
    const wh = this.warehouse;
    const fence = win(u, 0, 0.06);
    this.tape.scale.set(1, Math.max(0.01, fence), 1);
    this.tape.visible = u < 0.985;

    const slab = smooth(win(u, 0.05, 0.25));
    wh.slab.visible = slab > 0;
    wh.slab.position.y = -0.6 * (1 - slab);
    wh.slab.scale.set(1, Math.max(0.05, slab), 1);

    const frame = smooth(win(u, 0.22, 0.45));
    wh.frame.visible = frame > 0;
    wh.frame.scale.set(1, Math.max(0.01, frame), 1);

    const wallStart = 0.4;
    const wallEnd = 0.72;
    const n = wh.wallSegments.length;
    wh.walls.visible = u > wallStart;
    wh.wallSegments.forEach((seg, i) => {
      const a = wallStart + (i / n) * (wallEnd - wallStart) * 0.7;
      const k = smooth(win(u, a, a + (wallEnd - wallStart) * 0.3));
      const off = 9 * (1 - k);
      seg.mesh.position.x = (seg.mesh.userData.x0 ?? (seg.mesh.userData.x0 = seg.mesh.position.x)) + seg.outX * off;
      seg.mesh.position.z = (seg.mesh.userData.z0 ?? (seg.mesh.userData.z0 = seg.mesh.position.z)) + seg.outZ * off;
      seg.mesh.visible = k > 0;
    });

    const roof = smooth(win(u, 0.66, 0.86));
    wh.roof.visible = roof > 0;
    wh.roof.position.y = 16 * (1 - roof);

    const docks = win(u, 0.82, 0.93);
    wh.docks.visible = docks > 0;
    wh.docks.scale.setScalar(Math.max(0.01, overshoot(docks)));

    const props = smooth(win(u, 0.88, 0.99));
    wh.props.visible = props > 0;
    wh.props.scale.set(1, Math.max(0.01, props), 1);
  }

  update(dt: number): void {
    if (!this.group.visible || this.done) return;
    this.t += dt;
    const u = Math.min(1, this.t / this.duration);
    this.progress = u;
    this.secondsLeft = Math.max(0, this.duration - this.t);
    this.apply(u);

    // crane swings, hook lowers a panel over the site
    this.jib.rotation.y = -0.6 + Math.sin(this.t * 0.55) * 1.1;
    this.hook.position.y = 1.2 - 4 - Math.sin(this.t * 1.3) * 3.5;
    const cable = this.hook.getObjectByName('cable') as THREE.Mesh;
    const len = 1.2 - this.hook.position.y;
    cable.scale.set(0.04, len, 0.04);
    cable.position.y = len / 2;

    for (const b of this.builders) {
      const span = b.x1 - b.x0;
      b.t += dt * b.dir * 2.6;
      if (b.t > span) {
        b.dir = -1;
        b.t = span;
      } else if (b.t < 0) {
        b.dir = 1;
        b.t = 0;
      }
      b.ch.group.position.set(b.x0 + b.t, 0, b.z);
      b.ch.group.rotation.y = b.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      b.ch.animate(dt, 2.6);
    }

    this.dustTimer -= dt;
    if (this.dustTimer <= 0) {
      this.dustTimer = 0.12;
      const edge = Math.random() < 0.5;
      const x = edge ? (Math.random() - 0.5) * W : (Math.random() < 0.5 ? -HALF_W : HALF_W);
      const z = edge ? (Math.random() < 0.5 ? -HALF_D : HALF_D) : (Math.random() - 0.5) * D;
      this.effects.dust(x, z, 1.8);
    }
    this.sparkTimer -= dt;
    if (u > 0.2 && u < 0.9 && this.sparkTimer <= 0) {
      this.sparkTimer = 0.25;
      this.effects.sparks((Math.random() - 0.5) * W * 0.8, 2 + Math.random() * 4, (Math.random() - 0.5) * D * 0.8);
    }
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) {
      this.soundTimer = 0.32 + Math.random() * 0.2;
      this.onTick?.(u < 0.25 ? 'thud' : u < 0.7 ? 'hammer' : 'weld');
    }

    if (u >= 1) {
      this.done = true;
      this.finish();
    }
  }

  private finish(): void {
    const wh = this.warehouse;
    wh.slab.position.y = 0;
    wh.slab.scale.set(1, 1, 1);
    wh.frame.scale.set(1, 1, 1);
    wh.roof.position.y = 0;
    wh.docks.scale.setScalar(1);
    wh.props.scale.set(1, 1, 1);
    for (const seg of wh.wallSegments) {
      seg.mesh.position.x = seg.mesh.userData.x0 ?? seg.mesh.position.x;
      seg.mesh.position.z = seg.mesh.userData.z0 ?? seg.mesh.position.z;
      seg.mesh.visible = true;
    }
    for (const g of [wh.slab, wh.frame, wh.walls, wh.docks, wh.roof, wh.props]) g.visible = true;
    for (let i = 0; i < 40; i++) this.effects.dust((Math.random() - 0.5) * (W + 4), (Math.random() - 0.5) * (D + 4), 2.5);
    for (const b of this.builders) b.ch.celebrate();
    this.group.visible = false;
    this.onDone?.();
  }
}

