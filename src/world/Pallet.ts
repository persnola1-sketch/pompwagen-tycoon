import * as THREE from 'three';
import names from '../config/names.json';
import { shrinkWrapTexture, woodTexture } from './Textures';

// Shared geometry/materials — pallets are the most numerous object in the game.
let woodMat: THREE.MeshStandardMaterial | null = null;
let wrapMat: THREE.MeshStandardMaterial | null = null;
let slatGeo: THREE.BoxGeometry | null = null;
let blockGeo: THREE.BoxGeometry | null = null;
let deckGeo: THREE.BoxGeometry | null = null;
let loadGeo: THREE.BoxGeometry | null = null;

/** EUR pallet 1.2 × 0.8 m with a shrink-wrapped product load, origin at floor. */
export function createPallet(): THREE.Group {
  if (!woodMat) {
    woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9 });
    wrapMat = new THREE.MeshStandardMaterial({
      map: shrinkWrapTexture(names.product.color),
      roughness: 0.35,
      metalness: 0.05,
    });
    slatGeo = new THREE.BoxGeometry(1.2, 0.022, 0.1);
    blockGeo = new THREE.BoxGeometry(0.1, 0.078, 0.1);
    deckGeo = new THREE.BoxGeometry(1.2, 0.022, 0.8);
    loadGeo = new THREE.BoxGeometry(1.1, 0.95, 0.72);
  }
  const g = new THREE.Group();

  // bottom deck
  const bottom = new THREE.Mesh(deckGeo!, woodMat);
  bottom.position.y = 0.011;
  g.add(bottom);
  // blocks
  for (const x of [-0.55, 0, 0.55]) {
    for (const z of [-0.35, 0, 0.35]) {
      const b = new THREE.Mesh(blockGeo!, woodMat);
      b.position.set(x, 0.061, z);
      g.add(b);
    }
  }
  // top slats
  for (const z of [-0.35, -0.117, 0.117, 0.35]) {
    const s = new THREE.Mesh(slatGeo!, woodMat);
    s.position.set(0, 0.111, z);
    s.castShadow = true;
    g.add(s);
  }
  // shrink-wrapped load
  const load = new THREE.Mesh(loadGeo!, wrapMat!);
  load.position.y = 0.122 + 0.475;
  load.castShadow = true;
  g.add(load);
  return g;
}
