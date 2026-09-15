import * as THREE from 'three';
import { Character, DEFAULT_LOOK } from '../Character';
import { Effects } from '../Effects';
import { MergeBuilder, mat, unitBox } from '../Merge';
import { hazardTexture, textSprite } from '../Textures';

let tapeMat: THREE.MeshStandardMaterial | null = null;
function tape(): THREE.MeshStandardMaterial {
  if (!tapeMat) {
    const t = hazardTexture();
    t.repeat.set(6, 1);
    tapeMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  }
  return tapeMat;
}

/**
 * A small construction site for in-warehouse builds (rack rows, conveyors,
 * coffee machine …): barrier tape on posts, cones, a builder walking the
 * perimeter, a scaffold that rises with progress, sparks, and a floating
 * progress bar with countdown.
 */
export class ConstructionSite {
  readonly group = new THREE.Group();
  private scaffold: THREE.Group;
  private builder: Character;
  private walkT = 0;
  private bar: THREE.Mesh;
  private barBg: THREE.Mesh;
  private label: THREE.Mesh;
  private labelMat: THREE.MeshBasicMaterial;
  private lastSec = -1;
  private sparkTimer = 0;
  private time = 0;

  constructor(
    parent: THREE.Object3D,
    public readonly jobId: number,
    private x: number,
    private z: number,
    private w: number,
    private d: number,
    private effects: Effects,
    private title: string,
  ) {
    const b = new MergeBuilder();
    const post = mat(0x3b4351, 0.5, 0.4);
    const cone = mat(0xf25c1a, 0.5);
    const hw = w / 2 + 0.5;
    const hd = d / 2 + 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 1.0, 0.08, post, sx * hw, 0.5, sz * hd);
    b.add(unitBox, tape(), 0, 0.85, -hd, 0, 0, 0, hw * 2, 0.1, 0.02);
    b.add(unitBox, tape(), 0, 0.85, hd, 0, 0, 0, hw * 2, 0.1, 0.02);
    b.add(unitBox, tape(), -hw, 0.85, 0, 0, Math.PI / 2, 0, hd * 2, 0.1, 0.02);
    b.add(unitBox, tape(), hw, 0.85, 0, 0, Math.PI / 2, 0, hd * 2, 0.1, 0.02);
    for (let i = 0; i < 3; i++) {
      const cx = -hw + 0.6 + i * ((hw * 2 - 1.2) / 2);
      b.add(new THREE.ConeGeometry(0.16, 0.42, 8), cone, cx, 0.21, hd + 0.35);
    }
    this.group.add(b.build());

    // scaffold: steel frame that grows with progress
    const s = new MergeBuilder();
    const steel = mat(0x7d8794, 0.5, 0.6);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.box(0.06, 2.4, 0.06, steel, sx * (w / 2 - 0.2), 1.2, sz * (d / 2 - 0.1));
    for (const y of [0.8, 1.6, 2.4]) {
      s.box(w - 0.4, 0.05, 0.05, steel, 0, y, -(d / 2 - 0.1));
      s.box(w - 0.4, 0.05, 0.05, steel, 0, y, d / 2 - 0.1);
    }
    s.box(w - 0.6, 0.04, d - 0.4, mat(0xb08b5f, 0.9), 0, 1.62, 0);
    this.scaffold = s.build();
    this.scaffold.scale.y = 0.01;
    this.group.add(this.scaffold);

    this.builder = new Character({ ...DEFAULT_LOOK, vest: 0xffb020, shirt: 0x5a6b8a });
    this.builder.armMode = 'idle';
    this.group.add(this.builder.group);

    this.barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x20242e, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false }),
    );
    this.barBg.renderOrder = 21;
    this.bar = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.3), new THREE.MeshBasicMaterial({ color: 0xffb020, depthWrite: false, depthTest: false }));
    this.bar.renderOrder = 22;
    this.labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false });
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), this.labelMat);
    this.label.renderOrder = 23;
    this.group.add(this.barBg, this.bar, this.label);

    this.group.position.set(x, 0, z);
    parent.add(this.group);
  }

  private setLabel(sec: number): void {
    this.labelMat.map?.dispose();
    this.labelMat.map = textSprite(`🏗️ ${this.title} · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, 'rgba(20,24,32,0.9)', '#ffffff', 512, 128, 44);
    this.labelMat.needsUpdate = true;
  }

  update(dt: number, progress: number, secondsLeft: number, camera: THREE.Camera): void {
    this.time += dt;
    this.scaffold.scale.y = Math.max(0.01, Math.min(1, progress * 1.2));
    const sec = Math.ceil(secondsLeft);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.setLabel(sec);
    }
    // builder walks a loop around the site
    this.walkT += dt * 1.6;
    const per = 2 * (this.w + this.d) + 4;
    let t = this.walkT % per;
    const hw = this.w / 2 + 1.0;
    const hd = this.d / 2 + 1.0;
    let bx: number;
    let bz: number;
    let heading: number;
    if (t < this.w + 2) {
      bx = -hw + t;
      bz = hd;
      heading = Math.PI / 2;
    } else if ((t -= this.w + 2) < this.d + 2) {
      bx = hw;
      bz = hd - t;
      heading = Math.PI;
    } else if ((t -= this.d + 2) < this.w + 2) {
      bx = hw - t;
      bz = -hd;
      heading = -Math.PI / 2;
    } else {
      t -= this.w + 2;
      bx = -hw;
      bz = -hd + t;
      heading = 0;
    }
    this.builder.group.position.set(bx, 0, bz);
    this.builder.group.rotation.y = heading;
    this.builder.animate(dt, 1.6);

    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.5 + Math.random() * 0.6;
      this.effects.sparks(this.x + (Math.random() - 0.5) * this.w, 0.8 + Math.random() * 1.5, this.z + (Math.random() - 0.5) * this.d, 6);
      this.effects.dust(this.x + (Math.random() - 0.5) * this.w, this.z + (Math.random() - 0.5) * this.d, 0.8);
    }

    // billboard bar + label
    const y = 3.2;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    this.barBg.position.set(0, y, 0);
    this.barBg.quaternion.copy(camera.quaternion);
    this.bar.quaternion.copy(camera.quaternion);
    this.bar.scale.x = Math.max(0.001, progress);
    this.bar.position.set(0, y, 0).addScaledVector(right, -1.45 * (1 - progress));
    this.label.position.set(0, y + 0.75, 0);
    this.label.quaternion.copy(camera.quaternion);
  }

  /** finish effect: dust puff ring */
  finish(): void {
    for (let i = 0; i < 16; i++) this.effects.dust(this.x + (Math.random() - 0.5) * (this.w + 1), this.z + (Math.random() - 0.5) * (this.d + 1), 1.4);
    this.group.parent?.remove(this.group);
    this.labelMat.map?.dispose();
  }
}
