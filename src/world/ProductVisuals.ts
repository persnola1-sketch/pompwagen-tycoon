import * as THREE from 'three';
import { PRODUCTS, ProductDef, product } from '../core/Products';

/**
 * Per-product pallet load looks: every product gets its own printed side and
 * top texture (bottles, cans, cartons, rolls, tins, jugs) in its wrap colour,
 * plus a rack slot tag. All cached — one material set per product.
 */

const S = 256;

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** lighten (amt > 0) or darken (amt < 0) a #rrggbb colour */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function textColorFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? '#1b2230' : '#ffffff';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sheen(ctx: CanvasRenderingContext2D, strength: number): void {
  for (let i = 0; i < 10; i++) {
    const y = (i / 10) * S + ((i * 37) % 17);
    const g = ctx.createLinearGradient(0, y - 30, S, y + 30);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${strength * (0.5 + ((i * 13) % 7) / 10)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 30, S, 60);
  }
}

function drawTier(ctx: CanvasRenderingContext2D, p: ProductDef, y0: number, h: number): void {
  const wrap = p.wrap;
  const accent = p.accent;
  switch (p.box) {
    case 'bottles': {
      ctx.fillStyle = shade(wrap, -0.45);
      ctx.fillRect(0, y0, S, h);
      const n = 6;
      const w = S / n;
      for (let i = 0; i < n; i++) {
        const x = i * w;
        ctx.fillStyle = shade(wrap, 0.25);
        roundRect(ctx, x + 6, y0 + h * 0.3, w - 12, h * 0.66, 8);
        ctx.fill();
        ctx.fillRect(x + w * 0.36, y0 + h * 0.1, w * 0.28, h * 0.24);
        ctx.fillStyle = accent;
        ctx.fillRect(x + w * 0.33, y0 + h * 0.05, w * 0.34, h * 0.08);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(x + 6, y0 + h * 0.55, w - 12, h * 0.16);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 10, y0 + h * 0.34, 4, h * 0.56);
      }
      break;
    }
    case 'cans': {
      ctx.fillStyle = wrap;
      ctx.fillRect(0, y0, S, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo((i * S) / 8, y0 + 4);
        ctx.lineTo((i * S) / 8, y0 + h - 4);
        ctx.stroke();
      }
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, y0 + h * 0.62);
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y0 + h * (0.55 + Math.sin(x / 26) * 0.07));
      ctx.lineTo(S, y0 + h * 0.8);
      ctx.lineTo(0, y0 + h * 0.8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.round(h * 0.34)}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FIZZ!', S / 2, y0 + h * 0.3);
      break;
    }
    case 'cartons': {
      ctx.fillStyle = '#c89b66';
      ctx.fillRect(0, y0, S, h);
      for (let i = 0; i < 2; i++) {
        const x = (i * S) / 2;
        ctx.strokeStyle = 'rgba(80,50,20,0.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y0 + 2, S / 2 - 4, h - 4);
        ctx.fillStyle = wrap;
        roundRect(ctx, x + 18, y0 + h * 0.2, S / 2 - 36, h * 0.6, 10);
        ctx.fill();
        // chip bag icon
        ctx.fillStyle = accent;
        roundRect(ctx, x + S / 4 - 16, y0 + h * 0.28, 32, h * 0.44, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(x + 22, y0 + h * 0.46, S / 2 - 44, 3);
      }
      ctx.fillStyle = 'rgba(230,210,170,0.8)';
      ctx.fillRect(0, y0 + h * 0.05, S, 6);
      break;
    }
    case 'rolls': {
      ctx.fillStyle = wrap;
      ctx.fillRect(0, y0, S, h);
      for (let i = 0; i < 2; i++) {
        const x = (i * S) / 2;
        for (let r = 0; r < 3; r++) {
          const rx = x + 8 + (r * (S / 2 - 16)) / 3;
          const rw = (S / 2 - 16) / 3 - 4;
          const g = ctx.createLinearGradient(rx, 0, rx + rw, 0);
          g.addColorStop(0, '#d9dde2');
          g.addColorStop(0.5, '#ffffff');
          g.addColorStop(1, '#c9ced6');
          ctx.fillStyle = g;
          roundRect(ctx, rx, y0 + 8, rw, h - 16, 10);
          ctx.fill();
        }
        ctx.fillStyle = accent;
        ctx.fillRect(x + 6, y0 + h * 0.4, S / 2 - 12, h * 0.2);
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${Math.round(h * 0.14)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SOFT ×24', x + S / 4, y0 + h * 0.5);
      }
      ctx.strokeStyle = 'rgba(120,130,145,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S / 2, y0);
      ctx.lineTo(S / 2, y0 + h);
      ctx.stroke();
      break;
    }
    case 'tins': {
      ctx.fillStyle = '#4b535e';
      ctx.fillRect(0, y0, S, h);
      const n = 7;
      const w = S / n;
      for (let i = 0; i < n; i++) {
        const x = i * w;
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, '#8d96a2');
        g.addColorStop(0.45, '#e6ebf0');
        g.addColorStop(1, '#7c8591');
        ctx.fillStyle = g;
        ctx.fillRect(x + 3, y0 + h * 0.12, w - 6, h * 0.7);
        ctx.fillStyle = accent;
        ctx.fillRect(x + 3, y0 + h * 0.3, w - 6, h * 0.34);
        ctx.fillStyle = '#f2e3c2';
        ctx.fillRect(x + 7, y0 + h * 0.4, w - 14, h * 0.12);
      }
      ctx.fillStyle = '#39404a';
      ctx.fillRect(0, y0 + h * 0.8, S, h * 0.2);
      break;
    }
    case 'jugs':
    default: {
      ctx.fillStyle = shade(wrap, -0.5);
      ctx.fillRect(0, y0, S, h);
      const n = 5;
      const w = S / n;
      for (let i = 0; i < n; i++) {
        const x = i * w;
        ctx.fillStyle = wrap;
        roundRect(ctx, x + 5, y0 + h * 0.22, w - 10, h * 0.74, 10);
        ctx.fill();
        ctx.fillStyle = shade(wrap, -0.35);
        roundRect(ctx, x + w * 0.55, y0 + h * 0.3, w * 0.22, h * 0.22, 5);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.fillRect(x + w * 0.2, y0 + h * 0.08, w * 0.26, h * 0.16);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(x + 9, y0 + h * 0.6, w - 18, h * 0.2);
      }
      break;
    }
  }
}

function sideCanvas(p: ProductDef): HTMLCanvasElement {
  const [c, ctx] = canvas(S);
  const tiers = p.box === 'rolls' || p.box === 'cartons' ? 3 : 4;
  const h = S / tiers;
  for (let t = 0; t < tiers; t++) {
    drawTier(ctx, p, t * h, h);
    // cardboard tier sheet
    ctx.fillStyle = '#b8895a';
    ctx.fillRect(0, t * h + h - 4, S, 4);
  }
  sheen(ctx, p.box === 'cartons' ? 0.05 : 0.16);
  // shipping label sticker
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(S * 0.62, S * 0.06, S * 0.32, S * 0.13);
  ctx.fillStyle = '#1b2230';
  ctx.font = '800 14px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.short, S * 0.78, S * 0.1, S * 0.3);
  ctx.fillRect(S * 0.66, S * 0.15, S * 0.24, 3);
  return c;
}

function topCanvas(p: ProductDef): HTMLCanvasElement {
  const [c, ctx] = canvas(S);
  const grid = (cols: number, rows: number, draw: (cx: number, cy: number, r: number) => void): void => {
    const cw = S / cols;
    const ch = S / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) draw(cw * (i + 0.5), ch * (j + 0.5), Math.min(cw, ch) * 0.42);
  };
  const circle = (x: number, y: number, r: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (p.box) {
    case 'bottles':
      ctx.fillStyle = shade(p.wrap, -0.35);
      ctx.fillRect(0, 0, S, S);
      grid(7, 5, (x, y, r) => {
        circle(x, y, r, shade(p.wrap, 0.2));
        circle(x, y, r * 0.45, p.accent);
      });
      break;
    case 'cans':
      ctx.fillStyle = shade(p.wrap, -0.3);
      ctx.fillRect(0, 0, S, S);
      grid(9, 6, (x, y, r) => {
        circle(x, y, r, '#c9d0d8');
        circle(x, y, r * 0.7, '#9ea7b2');
        circle(x + r * 0.2, y - r * 0.2, r * 0.18, '#5d6670');
      });
      break;
    case 'cartons':
      ctx.fillStyle = '#c89b66';
      ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(80,50,20,0.5)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) ctx.strokeRect((i * S) / 2 + 2, (j * S) / 2 + 2, S / 2 - 4, S / 2 - 4);
      ctx.fillStyle = 'rgba(230,210,170,0.9)';
      ctx.fillRect(S / 4 - 8, 0, 16, S);
      ctx.fillRect((3 * S) / 4 - 8, 0, 16, S);
      break;
    case 'rolls':
      ctx.fillStyle = p.wrap;
      ctx.fillRect(0, 0, S, S);
      grid(6, 4, (x, y, r) => {
        circle(x, y, r, '#ffffff');
        circle(x, y, r * 0.3, '#b9bec6');
      });
      break;
    case 'tins':
      ctx.fillStyle = '#4b535e';
      ctx.fillRect(0, 0, S, S);
      grid(8, 6, (x, y, r) => {
        circle(x, y, r, '#dfe4ea');
        circle(x, y, r * 0.78, '#aab3bd');
        circle(x, y, r * 0.55, '#cfd6dd');
      });
      break;
    default:
      ctx.fillStyle = shade(p.wrap, -0.4);
      ctx.fillRect(0, 0, S, S);
      grid(5, 4, (x, y, r) => {
        circle(x, y, r, p.wrap);
        circle(x - r * 0.3, y - r * 0.3, r * 0.3, p.accent);
      });
  }
  sheen(ctx, 0.1);
  return c;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial[]>();

/** BoxGeometry face order: +x, -x, +y, -y, +z, -z */
export function loadMaterials(productId: string): THREE.MeshStandardMaterial[] {
  let mats = materialCache.get(productId);
  if (!mats) {
    const p = product(productId);
    const glossy = p.box === 'cartons' ? 0.85 : 0.4;
    const side = new THREE.MeshStandardMaterial({ map: toTexture(sideCanvas(p)), roughness: glossy, metalness: 0.02 });
    const top = new THREE.MeshStandardMaterial({ map: toTexture(topCanvas(p)), roughness: glossy, metalness: 0.02 });
    mats = [side, side, top, side, side, side];
    materialCache.set(productId, mats);
  }
  return mats;
}

const loadGeoCache = new Map<string, THREE.BufferGeometry>();

/** load block sized for a EUR pallet, origin at the floor under the pallet */
export function loadGeometry(productId: string, palletTop: number): THREE.BufferGeometry {
  let g = loadGeoCache.get(productId);
  if (!g) {
    const h = product(productId).loadHeight;
    g = new THREE.BoxGeometry(1.1, h, 0.74);
    g.translate(0, palletTop + h / 2, 0);
    loadGeoCache.set(productId, g);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Atlas instancing: every product load (and every slot tag) shares ONE
// material; a per-instance tile index picks the product inside the atlas.
// Racks and trucks draw all their pallets in a single call this way.
// ---------------------------------------------------------------------------

export function productIndex(id: string | null): number {
  const i = id ? PRODUCTS.findIndex((p) => p.id === id) : -1;
  return i < 0 ? PRODUCTS.length : i;
}

const LOAD_GRID = 4;
let loadAtlasMat: THREE.MeshStandardMaterial | null = null;
let loadAtlasGeo: THREE.BufferGeometry | null = null;

function loadAtlasMaterial(): THREE.MeshStandardMaterial {
  if (loadAtlasMat) return loadAtlasMat;
  const [c, ctx] = canvas(S * LOAD_GRID);
  PRODUCTS.forEach((p, i) => {
    [sideCanvas(p), topCanvas(p)].forEach((img, kind) => {
      const tile = i * 2 + kind;
      ctx.drawImage(img, (tile % LOAD_GRID) * S, Math.floor(tile / LOAD_GRID) * S);
    });
  });
  const m = new THREE.MeshStandardMaterial({ map: toTexture(c), roughness: 0.5, metalness: 0.02 });
  m.onBeforeCompile = (shader): void => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float faceKind;\nattribute float tileIndex;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          float tile = tileIndex * 2.0 + faceKind;
          vec2 cell = vec2(mod(tile, 4.0), floor(tile / 4.0));
          vMapUv = (MAP_UV * 0.96 + 0.02 + vec2(cell.x, 3.0 - cell.y)) / 4.0;
        }`,
      );
  };
  loadAtlasMat = m;
  return m;
}

/** unit-height EUR load block, bottom at y=0; faceKind 1 marks top/bottom faces */
function loadAtlasGeometry(): THREE.BufferGeometry {
  if (loadAtlasGeo) return loadAtlasGeo;
  const g = new THREE.BoxGeometry(1.1, 1, 0.74);
  g.translate(0, 0.5, 0);
  const kinds = new Float32Array(24);
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) kinds[f * 4 + v] = f === 2 || f === 3 ? 1 : 0;
  g.setAttribute('faceKind', new THREE.BufferAttribute(kinds, 1));
  g.clearGroups();
  loadAtlasGeo = g;
  return g;
}

/** all product loads of a rack or trailer in one InstancedMesh */
export class LoadInstances {
  readonly mesh: THREE.InstancedMesh;
  private tiles: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private n = 0;

  constructor(capacity: number, private palletTop: number) {
    const geo = loadAtlasGeometry().clone();
    this.tiles = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.tiles.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('tileIndex', this.tiles);
    this.mesh = new THREE.InstancedMesh(geo, loadAtlasMaterial(), capacity);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  begin(): void {
    this.n = 0;
  }

  /** `pallet` = transform of the pallet's floor origin */
  push(productId: string, pallet: THREE.Matrix4): void {
    this.m.makeScale(1, product(productId).loadHeight, 1).setPosition(0, this.palletTop, 0).premultiply(pallet);
    this.mesh.setMatrixAt(this.n, this.m);
    this.tiles.setX(this.n, productIndex(productId));
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tiles.needsUpdate = true;
  }
}

const TAG_W = 256;
const TAG_H = 64;
const TAG_ROWS = 8;
let tagMat: THREE.MeshBasicMaterial | null = null;

function tagAtlasMaterial(): THREE.MeshBasicMaterial {
  if (tagMat) return tagMat;
  const [c, ctx] = canvas(TAG_W, TAG_H * TAG_ROWS);
  const keys: (string | null)[] = [...PRODUCTS.map((p) => p.id), null];
  keys.forEach((id, row) => {
    const y = row * TAG_H;
    const p = id ? product(id) : null;
    ctx.fillStyle = p ? p.wrap : '#3a4150';
    ctx.fillRect(0, y, TAG_W, TAG_H);
    if (p) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y + 52, TAG_W, 12);
    }
    ctx.fillStyle = p ? textColorFor(p.wrap) : '#9aa3b5';
    ctx.font = `900 ${p ? 30 : 26}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p ? p.short : 'EMPTY', TAG_W / 2, y + 29, TAG_W - 16);
    ctx.strokeStyle = '#11151c';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, y + 3, TAG_W - 6, TAG_H - 6);
  });
  const m = new THREE.MeshBasicMaterial({ map: toTexture(c) });
  m.onBeforeCompile = (shader): void => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tileIndex;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vMapUv = vec2(MAP_UV.x, (MAP_UV.y * 0.9 + 0.05 + (${TAG_ROWS - 1}.0 - tileIndex)) / ${TAG_ROWS}.0);`,
      );
  };
  tagMat = m;
  return m;
}

/** rack slot labels (product colour + name, or EMPTY) in one InstancedMesh */
export class TagInstances {
  readonly mesh: THREE.InstancedMesh;
  private tiles: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(capacity: number, width: number, height: number) {
    const geo = new THREE.PlaneGeometry(width, height);
    this.tiles = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.tiles.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('tileIndex', this.tiles);
    this.mesh = new THREE.InstancedMesh(geo, tagAtlasMaterial(), capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(): void {
    this.n = 0;
  }

  push(productId: string | null, matrix: THREE.Matrix4): void {
    this.mesh.setMatrixAt(this.n, matrix);
    this.tiles.setX(this.n, productIndex(productId));
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tiles.needsUpdate = true;
  }
}
