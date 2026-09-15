import * as THREE from 'three';
import layout from '../config/layout.json';
import { padPlateTexture } from './Textures';

export interface Pad {
  id: string;
  mesh: THREE.Group;
  x: number;
  z: number;
  radius: number;
  plateMat: THREE.MeshStandardMaterial;
  glow: THREE.Mesh;
  bar: THREE.Mesh | null;
  barBg: THREE.Mesh | null;
  active: boolean;
  accent: string;
}

/**
 * Floor pads: inset steel plates with hazard-striped borders, painted labels,
 * a subtle glow strip when active, and a fill bar for pay-by-standing pads.
 */
export class Pads {
  readonly group = new THREE.Group();
  private pads = new Map<string, Pad>();
  private time = 0;

  create(id: string, x: number, z: number, lines: string[], accent: string, withBar: boolean, size = 2.2): Pad {
    const g = new THREE.Group();
    const plateMat = new THREE.MeshStandardMaterial({
      map: padPlateTexture(lines, accent),
      roughness: 0.55,
      metalness: 0.45,
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(size, 0.05, size), plateMat);
    plate.position.y = 0.028;
    plate.receiveShadow = true;
    g.add(plate);

    // glow strip around the plate
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(size * 0.68, size * 0.78, 4, 1),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.rotation.z = Math.PI / 4;
    glow.position.y = 0.06;
    g.add(glow);

    let bar: THREE.Mesh | null = null;
    let barBg: THREE.Mesh | null = null;
    if (withBar) {
      barBg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 0.26),
        new THREE.MeshBasicMaterial({ color: 0x20242e, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      barBg.position.set(0, 1.35, 0);
      g.add(barBg);
      bar = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x53c15e, depthWrite: false }),
      );
      bar.position.set(0, 1.35, 0.001);
      bar.scale.x = 0.0001;
      g.add(bar);
    }

    g.position.set(x, 0, z);
    this.group.add(g);
    const pad: Pad = { id, mesh: g, x, z, radius: layout.pads.radius, plateMat, glow, bar, barBg, active: true, accent };
    this.pads.set(id, pad);
    return pad;
  }

  get(id: string): Pad | undefined {
    return this.pads.get(id);
  }

  remove(id: string): void {
    const p = this.pads.get(id);
    if (p) {
      this.group.remove(p.mesh);
      this.pads.delete(id);
    }
  }

  setLabel(id: string, lines: string[], accent?: string): void {
    const p = this.pads.get(id);
    if (!p) return;
    if (accent) p.accent = accent;
    p.plateMat.map?.dispose();
    p.plateMat.map = padPlateTexture(lines, p.accent);
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
    p.bar.position.x = -0.9 * (1 - p.bar.scale.x);
    const show = frac > 0 && frac < 1;
    p.bar.visible = show;
    if (p.barBg) p.barBg.visible = show;
  }

  isOn(id: string, px: number, pz: number): boolean {
    const p = this.pads.get(id);
    if (!p || !p.active) return false;
    return Math.hypot(px - p.mesh.position.x, pz - p.mesh.position.z) < p.radius;
  }

  moveTo(id: string, x: number, z: number): void {
    const p = this.pads.get(id);
    if (p) p.mesh.position.set(x, 0, z);
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const pulse = 0.25 + Math.sin(this.time * 3.2) * 0.15;
    for (const p of this.pads.values()) {
      (p.glow.material as THREE.MeshBasicMaterial).opacity = p.active ? pulse : 0;
      if (p.bar && p.bar.visible) {
        // billboard the bar to the camera
        const q = camera.quaternion;
        p.bar.quaternion.copy(q);
        p.barBg?.quaternion.copy(q);
      }
    }
  }
}
