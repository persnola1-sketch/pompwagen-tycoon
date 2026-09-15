import * as THREE from 'three';

interface Entry {
  box: THREE.Box3;
  mats: THREE.Material[];
  /** opacity while blocking the view */
  faded: number;
  current: number;
}

const ray = new THREE.Ray();
const dir = new THREE.Vector3();
const hit = new THREE.Vector3();

/**
 * Fades walls and roof parts to transparent when they sit between the camera
 * and the player (or the interior focus point), so the building never hides
 * the action. Materials must be created with `transparent: true`.
 */
export class Cutaway {
  private entries: Entry[] = [];

  add(box: THREE.Box3, mats: THREE.Material[], faded = 0.12): void {
    for (const m of mats) {
      m.transparent = true;
      m.depthWrite = true;
    }
    this.entries.push({ box, mats, faded, current: 1 });
  }

  clear(): void {
    this.entries.length = 0;
  }

  update(dt: number, camera: THREE.Camera, target: THREE.Vector3): void {
    const k = Math.min(1, dt * 6);
    dir.copy(target).sub(camera.position);
    const len = dir.length();
    dir.normalize();
    ray.set(camera.position, dir);
    for (const e of this.entries) {
      const h = ray.intersectBox(e.box, hit);
      const blocking = !!h && h.distanceTo(camera.position) < len - 0.5;
      const want = blocking ? e.faded : 1;
      if (Math.abs(want - e.current) < 0.005) continue;
      e.current += (want - e.current) * k;
      for (const m of e.mats) m.opacity = e.current;
    }
  }
}
