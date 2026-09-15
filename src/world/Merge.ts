import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

/**
 * Collects many small static parts and bakes them into one mesh per material.
 * This is how detailed props stay within the phone draw-call budget.
 */
export class MergeBuilder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0, y = 0, z = 0,
    rx = 0, ry = 0, rz = 0,
    sx = 1, sy = 1, sz = 1,
  ): void {
    tmpEuler.set(rx, ry, rz);
    tmpQuat.setFromEuler(tmpEuler);
    tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(sx, sy, sz));
    this.addMatrix(geo, mat, tmpMatrix);
  }

  /** box shorthand: size + position (+ optional yaw) */
  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0): void {
    this.add(unitBox, mat, x, y, z, 0, ry, 0, w, h, d);
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.applyMatrix4(matrix);
    // flat-colour materials collapse into a few shared vertex-colour materials
    let target = mat;
    const info = flatInfo.get(mat);
    if (info) {
      target = vertexColorMaterial(info);
      const n = g.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3] = info.color.r;
        colors[i * 3 + 1] = info.color.g;
        colors[i * 3 + 2] = info.color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    let list = this.parts.get(target);
    if (!list) {
      list = [];
      this.parts.set(target, list);
    }
    list.push(g);
  }

  get empty(): boolean {
    return this.parts.size === 0;
  }

  build(castShadow = true, receiveShadow = true): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

export const unitBox = new THREE.BoxGeometry(1, 1, 1);

/** box whose UVs are in (metres / tile), so tiling textures keep their scale on any size */
export function uvBox(w: number, h: number, d: number, tile = 1): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const faces: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * faces[f][0]) / tile, (uv.getY(i) * faces[f][1]) / tile);
    }
  }
  return g;
}

/** plane (in the xy plane) whose UVs are in metres / tile */
export function uvPlane(w: number, h: number, tile = 1): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  return g;
}
export const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
export const unitCylinderLow = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
export const unitSphere = new THREE.SphereGeometry(0.5, 12, 8);

interface FlatInfo {
  color: THREE.Color;
  roughness: number;
  metalness: number;
  basic: boolean;
}
const flatInfo = new WeakMap<THREE.Material, FlatInfo>();
const vcCache = new Map<string, THREE.Material>();

/** one shared vertex-colour material per (roughness, metalness) bucket */
function vertexColorMaterial(info: FlatInfo): THREE.Material {
  const r = Math.round(info.roughness * 5) / 5;
  const m = Math.round(info.metalness * 2.5) / 2.5;
  const key = info.basic ? 'basic' : `${r}|${m}`;
  let material = vcCache.get(key);
  if (!material) {
    material = info.basic
      ? new THREE.MeshBasicMaterial({ vertexColors: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: m });
    vcCache.set(key, material);
  }
  return material;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** shared flat-color standard material (batched by MergeBuilder) */
export function mat(color: number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(key, m);
    flatInfo.set(m, { color: new THREE.Color(color), roughness, metalness, basic: false });
  }
  return m;
}

/** shared unlit emissive-looking material for lamps and lights */
const basicCache = new Map<number, THREE.MeshBasicMaterial>();
export function glow(color: number): THREE.MeshBasicMaterial {
  let m = basicCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    basicCache.set(color, m);
    flatInfo.set(m, { color: new THREE.Color(color), roughness: 1, metalness: 0, basic: true });
  }
  return m;
}
