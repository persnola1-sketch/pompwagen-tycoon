import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { woodTexture } from './Textures';
import { loadGeometry, loadMaterials } from './ProductVisuals';

/** height of the pallet deck — loads sit on top of this */
export const PALLET_TOP = 0.144;

let woodMat: THREE.MeshStandardMaterial | null = null;
let woodGeo: THREE.BufferGeometry | null = null;

export function palletWoodMaterial(): THREE.MeshStandardMaterial {
  if (!woodMat) woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9 });
  return woodMat;
}

/** EUR pallet 1.2 × 0.8 m (bottom boards, 9 blocks, stringers, top boards) as ONE geometry */
export function palletWoodGeometry(): THREE.BufferGeometry {
  if (woodGeo) return woodGeo;
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(g);
  };
  for (const z of [-0.35, 0, 0.35]) add(1.2, 0.022, 0.1, 0, 0.011, z); // bottom boards
  for (const x of [-0.55, 0, 0.55]) {
    for (const z of [-0.35, 0, 0.35]) add(0.14, 0.078, 0.1, x, 0.061, z); // blocks
    add(0.14, 0.022, 0.8, x, 0.111, 0); // stringer boards
  }
  for (const z of [-0.35, -0.175, 0, 0.175, 0.35]) add(1.2, 0.022, 0.1, 0, 0.133, z); // top boards
  woodGeo = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return woodGeo;
}

/** pallet with a product load, origin at floor; 2 draw calls (wood + load) */
export function createPallet(productId: string): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.Mesh(palletWoodGeometry(), palletWoodMaterial());
  wood.castShadow = true;
  const load = new THREE.Mesh(loadGeometry(productId, PALLET_TOP), loadMaterials(productId));
  load.castShadow = true;
  g.add(wood, load);
  g.userData.product = productId;
  return g;
}
