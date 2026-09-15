import * as THREE from 'three';
import layout from '../config/layout.json';
import { padPlateTexture } from './Textures';

export interface Pad {
  id: string;
  mesh: THREE.Group;
  radius: number;
  plateMat: THREE.MeshStandardMaterial;
  glow: THREE.Mesh;
  bar: THREE.Mesh | null;
  barBg: THREE.Mesh | null;
  active: boolean;
  accent: string;
}

const plateGeos = new Map<number, THREE.BoxGeometry>();

/**
 * Floor pads: inset steel plates with hazard-striped borders, painted labels,
 * a pulsing glow strip when active, and a fill bar for pay-by-standing pads.
 * Locked pads (future rack rows) are dimmed and don't react.
 */
export class Pads {
  readonly group = new THREE.Group();
  private pads = new Map<string, Pad>();
  private time = 0;

  create(id: string, x: number, z: number, lines: string[], accent: string, withBar: boolean, size = 2.2, locked = false): Pad {
    const g = new THREE.Group();
    const plateMat = new THREE.MeshStandardMaterial({
      map: padPlateTexture(lines, accent, locked),
      roughness: 0.55,
      metalness: 0.45,
    });
    let geo = plateGeos.get(size);
    if (!geo) {
      geo = new THREE.BoxGeometry(size, 0.05, size);
      plateGeos.set(size, geo);
    }
    const plate = new THREE.Mesh(geo, plateMat);
    plate.position.y = 0.028;
    plate.receiveShadow = true;
    g.add(plate);

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.68, size * 0.78, 4, 1),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.rotation.z = Math.PI / 4;
    glow.position.y = 0.06;
    g.add(glow);

    let bar: THREE.Mesh | null = null;
    let barBg: THREE.Mesh | null = null;
    if (withBar) {
      barBg = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 0.36),
        new THREE.MeshBasicMaterial({ color: 0x20242e, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      barBg.position.set(0, 1.9, 0);
      barBg.visible = false;
      barBg.renderOrder = 1;
      g.add(barBg);
      bar = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.24),
        new THREE.MeshBasicMaterial({ color: 0x53c15e, transparent: true, depthWrite: false }),
      );
      bar.position.set(0, 1.9, 0);
      bar.visible = false;
      bar.renderOrder = 2;
      g.add(bar);
    }

    g.position.set(x, 0, z);
    this.group.add(g);
    const pad: Pad = { id, mesh: g, radius: layout.pads.radius, plateMat, glow, bar, barBg, active: !locked, accent };
    this.pads.set(id, pad);
    return pad;
  }

  get(id: string): Pad | undefined {
    return this.pads.get(id);
  }

  has(id: string): boolean {
    return this.pads.has(id);
  }

  remove(id: string): void {
    const p = this.pads.get(id);
    if (!p) return;
    this.group.remove(p.mesh);
    p.plateMat.map?.dispose();
    p.plateMat.dispose();
    this.pads.delete(id);
  }

  setLabel(id: string, lines: string[], accent?: string, locked = false): void {
    const p = this.pads.get(id);
    if (!p) return;
    if (accent) p.accent = accent;
    (p.glow.material as THREE.MeshBasicMaterial).color.set(p.accent);
    p.plateMat.map?.dispose();
    p.plateMat.map = padPlateTexture(lines, p.accent, locked);
    p.plateMat.needsUpdate = true;
  }

  setActive(id: string, active: boolean): void {
    const p = this.pads.get(id);
    if (p) p.active = active;
  }

  setProgress(id: string, frac: number): void {
    const p = this.pads.get(id);
    if (!p || !p.bar) return;
    p.bar.scale.x = Math.max(0.0001, Math.min(1, frac));
    const show = frac > 0 && frac < 1;
    p.bar.visible = show;
    if (p.barBg) p.barBg.visible = show;
  }

  isOn(id: string, px: number, pz: number): boolean {
    const p = this.pads.get(id);
    if (!p || !p.active) return false;
    return Math.hypot(px - p.mesh.position.x, pz - p.mesh.position.z) < p.radius;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const pulse = 0.25 + Math.sin(this.time * 3.2) * 0.15;
    for (const p of this.pads.values()) {
      (p.glow.material as THREE.MeshBasicMaterial).opacity = p.active ? pulse : 0;
      if (p.bar && p.bar.visible && p.barBg) {
        // billboard the fill bar, growing from its left edge in screen space
        p.barBg.quaternion.copy(camera.quaternion);
        p.bar.quaternion.copy(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        p.bar.position.set(0, 1.9, 0).addScaledVector(right, -1.1 * (1 - p.bar.scale.x)).add(new THREE.Vector3(0, 0, 0.001));
      }
    }
  }
}
