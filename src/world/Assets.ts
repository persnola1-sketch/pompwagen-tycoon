import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loads the downloaded CC0 assets (see CREDITS.md): GPU-compressed KTX2
 * textures and GLB models. Everything is optional — callers keep their
 * canvas/code fallback until (and if) the asset arrives.
 */
const BASE = import.meta.env.BASE_URL;
let ktx2: KTX2Loader | null = null;
const gltf = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Object3D | null>>();

export function initAssets(renderer: THREE.WebGLRenderer): void {
  ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}basis/`).detectSupport(renderer);
}

export interface TextureOptions {
  repeat?: [number, number];
  color?: boolean;
}

/** load textures/<name>.ktx2 and hand it over once transcoded */
export function loadTexture(name: string, opts: TextureOptions, apply: (tex: THREE.Texture) => void): void {
  if (!ktx2) return;
  ktx2.load(
    `${BASE}textures/${name}.ktx2`,
    (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
      tex.colorSpace = opts.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      apply(tex);
    },
    undefined,
    () => {
      /* keep the canvas fallback */
    },
  );
}

/** load models/<name>.glb once; resolves null if it fails */
export function loadModel(name: string): Promise<THREE.Object3D | null> {
  let p = modelCache.get(name);
  if (!p) {
    p = gltf
      .loadAsync(`${BASE}models/${name}.glb`)
      .then((g) => g.scene as THREE.Object3D)
      .catch(() => null);
    modelCache.set(name, p);
  }
  return p;
}

export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** flatten a loaded model into (geometry, material) pairs with node transforms baked in */
export function modelParts(root: THREE.Object3D): ModelPart[] {
  const parts: ModelPart[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geometry = m.geometry.clone();
    geometry.applyMatrix4(m.matrixWorld);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    parts.push({ geometry, material: mats[0] });
  });
  return parts;
}
