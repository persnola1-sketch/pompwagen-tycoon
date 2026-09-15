import * as THREE from 'three';
import { createPallet } from '../Pallet';

interface Fallen {
  mesh: THREE.Group;
  product: string;
  x: number;
  z: number;
}

/** Pallets dropped by clumsy workers; only the boss can pick them up again. */
export class FallenPallets {
  readonly group = new THREE.Group();
  private list: Fallen[] = [];

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
  }

  get count(): number {
    return this.list.length;
  }

  drop(product: string, x: number, z: number): void {
    const mesh = createPallet(product);
    mesh.position.set(x, 0, z);
    mesh.rotation.set(0.35, Math.random() * Math.PI, 0.15);
    mesh.position.y = 0.2;
    this.group.add(mesh);
    this.list.push({ mesh, product, x, z });
  }

  /** product of a fallen pallet within `r` of (x, z), removing it */
  pickNear(x: number, z: number, r = 1.0): string | null {
    for (let i = 0; i < this.list.length; i++) {
      const f = this.list[i];
      if (Math.hypot(f.x - x, f.z - z) < r) {
        this.group.remove(f.mesh);
        this.list.splice(i, 1);
        return f.product;
      }
    }
    return null;
  }

  /** nearest fallen pallet position (for the guide beam) */
  nearest(x: number, z: number): { x: number; z: number } | null {
    let best: Fallen | null = null;
    let bd = Infinity;
    for (const f of this.list) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best ? { x: best.x, z: best.z } : null;
  }
}
