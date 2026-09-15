import * as THREE from 'three';
import layout from '../config/layout.json';
import { padLabelTexture, padPlateTexture } from './Textures';

export interface Pad {
  id: string;
  mesh: THREE.Group;
  radius: number;
  plateMat: THREE.MeshStandardMaterial;
  glow: THREE.Mesh;
  ring: THREE.Mesh | null;
  bar: THREE.Mesh | null;
  barBg: THREE.Mesh | null;
  label: THREE.Mesh;
  labelMat: THREE.MeshBasicMaterial;
  active: boolean;
  accent: string;
  icon: string;
  size: number;
  pulse: number;
  ringStep: number;
}

export interface PadOptions {
  withBar?: boolean;
  size?: number;
  locked?: boolean;
  /** emoji shown on the floating label */
  icon?: string;
  /** hide the floating label (e.g. for plain interaction pads) */
  noLabel?: boolean;
}

const plateGeos = new Map<number, THREE.BoxGeometry>();
const LABEL_W = 3.2;
const LABEL_H = (LABEL_W * 176) / 512;
const labelGeo = new THREE.PlaneGeometry(LABEL_W, LABEL_H);
const ringGeo = new THREE.RingGeometry(0.86, 1.0, 40, 1, -Math.PI / 2, 0);

/**
 * Floor pads: inset steel plates with hazard-striped borders, big painted
 * labels, a floating billboard label (icon + cost) that always faces the
 * camera and grows with camera distance, a pulsing glow strip when active,
 * a fill ring for pay-by-standing pads and an unlock burst.
 */
export class Pads {
  readonly group = new THREE.Group();
  private pads = new Map<string, Pad>();
  private time = 0;
  private tmpRight = new THREE.Vector3();

  create(id: string, x: number, z: number, lines: string[], accent: string, opts: PadOptions = {}): Pad {
    const size = opts.size ?? 2.2;
    const locked = opts.locked ?? false;
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

    let ring: THREE.Mesh | null = null;
    let bar: THREE.Mesh | null = null;
    let barBg: THREE.Mesh | null = null;
    if (opts.withBar) {
      // fill ring on the floor around the pad
      ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0x53c15e, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.07;
      ring.scale.setScalar(size * 0.62);
      ring.visible = false;
      g.add(ring);
      barBg = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.4),
        new THREE.MeshBasicMaterial({ color: 0x20242e, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false }),
      );
      barBg.position.set(0, 1.35, 0);
      barBg.visible = false;
      barBg.renderOrder = 21;
      g.add(barBg);
      bar = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 0.28),
        new THREE.MeshBasicMaterial({ color: 0x53c15e, transparent: true, depthWrite: false, depthTest: false }),
      );
      bar.position.set(0, 1.35, 0);
      bar.visible = false;
      bar.renderOrder = 22;
      g.add(bar);
    }

    const icon = opts.icon ?? '';
    const labelMat = new THREE.MeshBasicMaterial({
      map: padLabelTexture(icon, lines[0] ?? '', lines[1] ?? '', accent, locked),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, 2.2, 0);
    label.renderOrder = 20;
    label.visible = !opts.noLabel;
    g.add(label);

    g.position.set(x, 0, z);
    this.group.add(g);
    const pad: Pad = {
      id, mesh: g, radius: layout.pads.radius, plateMat, glow, ring, bar, barBg, label, labelMat,
      active: !locked, accent, icon, size, pulse: 0, ringStep: -1,
    };
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
    p.labelMat.map?.dispose();
    p.labelMat.dispose();
    this.pads.delete(id);
  }

  setLabel(id: string, lines: string[], accent?: string, locked = false, icon?: string): void {
    const p = this.pads.get(id);
    if (!p) return;
    if (accent) p.accent = accent;
    if (icon !== undefined) p.icon = icon;
    (p.glow.material as THREE.MeshBasicMaterial).color.set(p.accent);
    p.plateMat.map?.dispose();
    p.plateMat.map = padPlateTexture(lines, p.accent, locked);
    p.plateMat.needsUpdate = true;
    p.labelMat.map?.dispose();
    p.labelMat.map = padLabelTexture(p.icon, lines[0] ?? '', lines[1] ?? '', p.accent, locked);
    p.labelMat.needsUpdate = true;
  }

  setActive(id: string, active: boolean): void {
    const p = this.pads.get(id);
    if (p) p.active = active;
  }

  setVisible(id: string, visible: boolean): void {
    const p = this.pads.get(id);
    if (p) p.mesh.visible = visible;
  }

  setProgress(id: string, frac: number): void {
    const p = this.pads.get(id);
    if (!p || !p.bar) return;
    const f = Math.max(0.0001, Math.min(1, frac));
    p.bar.scale.x = f;
    const show = frac > 0 && frac < 1;
    p.bar.visible = show;
    if (p.barBg) p.barBg.visible = show;
    if (p.ring) {
      p.ring.visible = show;
      const step = Math.round(f * 40);
      if (step !== p.ringStep) {
        p.ringStep = step;
        if (p.ring.geometry !== ringGeo) p.ring.geometry.dispose();
        p.ring.geometry = new THREE.RingGeometry(0.86, 1.0, Math.max(1, step), 1, Math.PI / 2, -Math.PI * 2 * (step / 40));
      }
    }
  }

  /** short burst when a pad completes */
  burst(id: string): void {
    const p = this.pads.get(id);
    if (p) p.pulse = 1;
  }

  isOn(id: string, px: number, pz: number): boolean {
    const p = this.pads.get(id);
    if (!p || !p.active || !p.mesh.visible) return false;
    return Math.hypot(px - p.mesh.position.x, pz - p.mesh.position.z) < p.radius;
  }

  update(dt: number, camera: THREE.Camera, cameraDistance: number): void {
    this.time += dt;
    const pulse = 0.25 + Math.sin(this.time * 3.2) * 0.15;
    // labels grow with distance so they stay readable when zoomed out
    const labelScale = THREE.MathUtils.clamp(cameraDistance / 26, 0.9, 2.6);
    this.tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const p of this.pads.values()) {
      if (!p.mesh.visible) continue;
      const glowMat = p.glow.material as THREE.MeshBasicMaterial;
      glowMat.opacity = p.active ? pulse : 0;
      if (p.pulse > 0) {
        p.pulse = Math.max(0, p.pulse - dt * 1.6);
        const s = 1 + (1 - p.pulse) * 1.6;
        p.glow.scale.setScalar(s);
        glowMat.opacity = p.pulse * 0.9;
      } else if (p.glow.scale.x !== 1) {
        p.glow.scale.setScalar(1);
      }
      if (p.label.visible) {
        p.label.quaternion.copy(camera.quaternion);
        p.label.scale.setScalar(labelScale);
        p.label.position.y = 1.9 + labelScale * 0.35 + Math.sin(this.time * 2 + p.mesh.position.x) * 0.05;
      }
      if (p.bar && p.bar.visible && p.barBg) {
        // billboard the fill bar, growing from its left edge in screen space
        p.barBg.quaternion.copy(camera.quaternion);
        p.bar.quaternion.copy(camera.quaternion);
        p.bar.position.set(0, 1.35, 0).addScaledVector(this.tmpRight, -1.25 * (1 - p.bar.scale.x));
      }
    }
  }
}
