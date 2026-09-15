import * as THREE from 'three';
import layout from '../config/layout.json';
import { ROW_LENGTH, rowLetter, rowPadZ, slotPosition } from './Racks';

const W = layout.warehouse.width;
const D = layout.warehouse.depth;
const HALF_W = W / 2;
const HALF_D = D / 2;
const CW = 1024;
const CH = Math.round((CW * D) / W);
const PPM = CW / W;

/** ceiling lamp positions — shared with Warehouse so light pools match lamps */
export const LAMP_X = [-12, -4, 4, 12];
export const TRUSS_Z = [-10, -4, 2, 8];

/**
 * All painted floor markings in ONE transparent decal: lane lines, rack
 * footprints and interaction strips, hatched dock zones, arrows, EV bay,
 * light pools under the lamps. One texture, one draw call.
 */
export function buildFloorMarkings(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const ctx = c.getContext('2d')!;
  const px = (x: number): number => (x + HALF_W) * PPM;
  const pz = (z: number): number => (z + HALF_D) * PPM;
  const m = (v: number): number => v * PPM;

  const line = (x1: number, z1: number, x2: number, z2: number, width: number, color: string, dash: number[] = []): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = m(width);
    ctx.setLineDash(dash.map(m));
    ctx.beginPath();
    ctx.moveTo(px(x1), pz(z1));
    ctx.lineTo(px(x2), pz(z2));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const rect = (x0: number, z0: number, x1: number, z1: number, width: number, color: string, dash: number[] = []): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = m(width);
    ctx.setLineDash(dash.map(m));
    ctx.strokeRect(px(x0), pz(z0), m(x1 - x0), m(z1 - z0));
    ctx.setLineDash([]);
  };
  const text = (s: string, x: number, z: number, size: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.font = `900 ${m(size)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, px(x), pz(z));
  };

  // warm light pools under the ceiling lamps
  for (const lz of TRUSS_Z) {
    for (const lx of LAMP_X) {
      const g = ctx.createRadialGradient(px(lx), pz(lz), 0, px(lx), pz(lz), m(4.5));
      g.addColorStop(0, 'rgba(255,238,200,0.22)');
      g.addColorStop(1, 'rgba(255,238,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px(lx - 5), pz(lz - 5), m(10), m(10));
    }
  }

  // safety walkway along the walls
  const yellow = 'rgba(242,192,24,0.9)';
  rect(-HALF_W + 0.7, -HALF_D + 0.7, HALF_W - 0.7, HALF_D - 0.7, 0.1, 'rgba(242,192,24,0.55)', [0.8, 0.5]);

  // rack zone boundary
  const rows = layout.rackRows.rows;
  const minRowX = Math.min(...rows.map((r) => r.x)) - ROW_LENGTH / 2 - 0.9;
  const maxRowX = Math.max(...rows.map((r) => r.x)) + ROW_LENGTH / 2 + 0.9;
  const minRowZ = Math.min(...rows.map((r) => r.z)) - 1.1;
  const maxRowZ = Math.max(...rows.map((_, i) => rowPadZ(i))) + 1.0;
  rect(minRowX, minRowZ, maxRowX, maxRowZ, 0.12, yellow);

  // every rack row: footprint, slot boxes, interaction strip, row letter
  rows.forEach((r, row) => {
    const x0 = r.x - ROW_LENGTH / 2;
    rect(x0 - 0.3, r.z - 0.6, x0 + ROW_LENGTH + 0.3, r.z + 0.6, 0.07, 'rgba(255,255,255,0.55)', [0.4, 0.25]);
    for (let col = 0; col < layout.rackRows.slotsPerRow; col++) {
      const s = slotPosition(row * layout.rackRows.slotsPerRow + col);
      rect(s.x - 0.65, s.z - 0.47, s.x + 0.65, s.z + 0.47, 0.05, 'rgba(242,192,24,0.6)');
    }
    const sz = rowPadZ(row);
    const hd = layout.rackRows.stripHalfDepth;
    ctx.fillStyle = 'rgba(242,192,24,0.12)';
    ctx.fillRect(px(x0), pz(sz - hd), m(ROW_LENGTH), m(hd * 2));
    line(x0, sz + hd, x0 + ROW_LENGTH, sz + hd, 0.06, 'rgba(242,192,24,0.7)', [0.5, 0.3]);
    text(rowLetter(row), x0 - 0.75, sz, 0.8, 'rgba(255,255,255,0.75)');
  });

  // hatched keep-clear zones at every dock door
  for (const side of [-1, 1]) {
    for (const dz of layout.docks.doorZ) {
      const xa = side * HALF_W;
      const xb = side * (HALF_W - 3.6);
      const x0 = Math.min(xa, xb);
      const z0 = dz - 1.9;
      ctx.save();
      ctx.beginPath();
      ctx.rect(px(x0), pz(z0), m(3.6), m(3.8));
      ctx.clip();
      ctx.fillStyle = 'rgba(242,192,24,0.28)';
      ctx.fillRect(px(x0), pz(z0), m(3.6), m(3.8));
      ctx.strokeStyle = 'rgba(20,20,20,0.35)';
      ctx.lineWidth = m(0.18);
      for (let k = -4; k < 8; k += 0.6) {
        ctx.beginPath();
        ctx.moveTo(px(x0 + k), pz(z0));
        ctx.lineTo(px(x0 + k - 3.8), pz(z0 + 3.8));
        ctx.stroke();
      }
      ctx.restore();
      rect(x0, z0, x0 + 3.6, z0 + 3.8, 0.1, yellow);
    }
    text(side < 0 ? 'INBOUND' : 'OUTBOUND', side * (HALF_W - 3.0), layout.docks.doorZ[0] - 3.1, 0.75, 'rgba(255,255,255,0.7)');
  }

  // flow arrows along the main cross aisle (in → out)
  const aisleZ = (rowPadZ(1) + rows[4].z) / 2;
  for (const ax of [-13, -6.5, 0, 6.5, 13]) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(px(ax + 0.8), pz(aisleZ));
    ctx.lineTo(px(ax), pz(aisleZ - 0.55));
    ctx.lineTo(px(ax), pz(aisleZ - 0.2));
    ctx.lineTo(px(ax - 0.9), pz(aisleZ - 0.2));
    ctx.lineTo(px(ax - 0.9), pz(aisleZ + 0.2));
    ctx.lineTo(px(ax), pz(aisleZ + 0.2));
    ctx.lineTo(px(ax), pz(aisleZ + 0.55));
    ctx.closePath();
    ctx.fill();
  }

  // pedestrian lane in front of the office desk
  const p = layout.pads;
  line(-10, p.office.z - 1.6, 10, p.office.z - 1.6, 0.12, 'rgba(58,166,87,0.85)');
  for (let x = -9.5; x <= 9.5; x += 0.9) line(x, p.office.z - 1.9, x, p.office.z - 1.3, 0.35, 'rgba(58,166,87,0.45)');

  // EV charging bay behind the electric pompwagen pad
  rect(p.upgradeElectric.x - 1.6, p.upgradeElectric.z - 1.4, p.upgradeElectric.x + 3.3, HALF_D - 0.5, 0.1, 'rgba(60,140,230,0.85)');
  text('EV', p.upgradeElectric.x + 2.5, HALF_D - 1.2, 0.6, 'rgba(60,140,230,0.85)');

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.receiveShadow = true;
  return mesh;
}
