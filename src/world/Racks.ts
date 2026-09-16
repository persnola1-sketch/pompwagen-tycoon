import * as THREE from 'three';
import layout from '../config/layout.json';
import { GameState, TOTAL_SLOTS, slotCol, slotLevel, slotRow } from '../core/GameState';
import { AABB } from './Warehouse';
import { MergeBuilder, mat, unitBox } from './Merge';
import { PALLET_TOP, palletWoodGeometry, palletWoodMaterial } from './Pallet';
import { LoadInstances, TagInstances } from './ProductVisuals';
import { textSprite } from './Textures';

const R = layout.rackRows;
const SECTIONS = Math.ceil(R.slotsPerRow / 2);
export const ROW_LENGTH = R.slotsPerRow * R.slotSpacing + (SECTIONS - 1) * R.sectionGap;
const BEAM_LEVELS = [1.75, 3.3, 4.85];
const UPRIGHT_H = 5.4;
const HALF_DEPTH = 0.46;

export function rowLetter(row: number): string {
  return String.fromCharCode(65 + row);
}

export function slotPosition(index: number): { x: number; z: number; y: number } {
  const row = slotRow(index);
  const col = slotCol(index);
  const r = R.rows[row];
  const x = r.x - ROW_LENGTH / 2 + R.slotSpacing / 2 + col * R.slotSpacing + Math.floor(col / 2) * R.sectionGap;
  return { x, z: r.z, y: R.levelHeights[slotLevel(index)] };
}

/** z of the interaction strip in front (south side) of a row */
export function rowPadZ(row: number): number {
  return R.rows[row].z + R.padOffsetZ;
}

export function inRowStrip(row: number, px: number, pz: number): boolean {
  const r = R.rows[row];
  return Math.abs(px - r.x) < ROW_LENGTH / 2 + 0.3 && Math.abs(pz - rowPadZ(row)) < R.stripHalfDepth;
}

/**
 * Pallet racking: blue uprights with bracing, orange beams, row-end guards.
 * Each row's steel is merged; pallets, loads and per-slot product tags are
 * three InstancedMeshes (atlas-textured), so a full warehouse stays cheap.
 */
export class Racks {
  readonly group = new THREE.Group();
  private rowGroups: THREE.Group[] = [];
  private buildAnims: { row: number; t: number }[] = [];
  private colliderStore: AABB[] = [];
  private wood: THREE.InstancedMesh;
  private loads = new LoadInstances(TOTAL_SLOTS, PALLET_TOP);
  private tags = new TagInstances(TOTAL_SLOTS, 0.66, 0.22);
  private slotAnim = new Float32Array(TOTAL_SLOTS);
  private labels: THREE.Mesh[] = [];
  private labelText: string[] = [];

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private tagQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0, 0));
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private state: GameState, private colliders: AABB[]) {
    for (let r = 0; r < R.rows.length; r++) {
      const g = this.buildRow(r);
      g.visible = r < state.rackRows;
      this.rowGroups.push(g);
      this.group.add(g);
      if (r < state.rackRows) this.colliders.push(this.colliderStore[r]);
    }

    this.wood = new THREE.InstancedMesh(palletWoodGeometry(), palletWoodMaterial(), TOTAL_SLOTS);
    this.wood.castShadow = true;
    this.wood.receiveShadow = true;
    this.wood.frustumCulled = false;
    this.wood.count = 0;
    this.group.add(this.wood, this.loads.mesh, this.tags.mesh);
    this.syncFromState();
  }

  private buildRow(row: number): THREE.Group {
    const b = new MergeBuilder();
    const up = mat(0x2a55a0, 0.5, 0.4);
    const beam = mat(0xe0661c, 0.45, 0.35);
    const guard = mat(0xf2c018, 0.55, 0.2);
    const plate = mat(0x3a3f48, 0.6, 0.5);
    const { x: cx, z } = R.rows[row];
    const x0 = cx - ROW_LENGTH / 2;
    const sectionW = 2 * R.slotSpacing;

    // upright frames at both ends and between sections
    const frameXs: number[] = [x0 - 0.05];
    for (let s = 1; s < SECTIONS; s++) frameXs.push(x0 + s * (sectionW + R.sectionGap) - R.sectionGap / 2);
    frameXs.push(x0 + ROW_LENGTH + 0.05);
    const braceH = [0.3, 1.3, 2.3, 3.3, 4.3];
    const diag = Math.atan2(HALF_DEPTH * 2 - 0.1, 1.0);
    const diagLen = Math.hypot(1.0, HALF_DEPTH * 2 - 0.1);
    for (const fx of frameXs) {
      for (const dz of [-HALF_DEPTH, HALF_DEPTH]) {
        b.box(0.09, UPRIGHT_H, 0.09, up, fx, UPRIGHT_H / 2, z + dz);
        b.box(0.18, 0.02, 0.18, plate, fx, 0.01, z + dz);
      }
      for (const h of braceH) b.box(0.045, 0.045, HALF_DEPTH * 2, up, fx, h, z);
      for (let i = 0; i < braceH.length - 1; i++) {
        b.add(unitBox, up, fx, (braceH[i] + braceH[i + 1]) / 2, z, i % 2 ? diag : -diag, 0, 0, 0.035, diagLen, 0.035);
      }
    }
    // beam pairs per section
    for (let s = 0; s < SECTIONS; s++) {
      const sx0 = x0 + s * (sectionW + R.sectionGap);
      const slots = Math.min(2, R.slotsPerRow - s * 2);
      const w = slots * R.slotSpacing;
      for (const h of BEAM_LEVELS) {
        for (const dz of [-HALF_DEPTH, HALF_DEPTH]) b.box(w, 0.12, 0.06, beam, sx0 + w / 2, h, z + dz);
      }
    }
    // row-end guards (yellow corner protectors)
    for (const ex of [x0 - 0.3, x0 + ROW_LENGTH + 0.3]) {
      for (const dz of [-HALF_DEPTH, HALF_DEPTH]) b.box(0.14, 0.55, 0.14, guard, ex, 0.275, z + dz);
      b.box(0.1, 0.12, HALF_DEPTH * 2 + 0.14, guard, ex, 0.45, z);
    }

    const g = b.build();
    this.colliderStore[row] = { minX: x0 - 0.38, maxX: x0 + ROW_LENGTH + 0.38, minZ: z - 0.55, maxZ: z + 0.55 };

    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ transparent: true }));
    label.position.set(cx, UPRIGHT_H + 0.45, z);
    label.rotation.x = -0.6;
    g.add(label);
    this.labels[row] = label;
    this.labelText[row] = '';
    return g;
  }

  /** rebuild pallet + tag instances to match state (cheap: ≤ TOTAL_SLOTS instances) */
  syncFromState(): void {
    this.writeInstances();
    this.updateLabels();
  }

  private writeInstances(): void {
    let woodCount = 0;
    this.loads.begin();
    this.tags.begin();
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const row = slotRow(i);
      if (!this.state.slotUnlocked(i)) continue;
      const rs = this.rowGroups[row].scale.y;
      const pos = slotPosition(i);
      const pid = this.state.slots[i];
      const level = slotLevel(i);

      this.m.compose(this.v.set(pos.x, BEAM_LEVELS[level] * rs, pos.z + HALF_DEPTH + 0.05), this.tagQ, this.s.set(1, rs, 1));
      this.tags.push(pid, this.m);
      if (!pid) continue;

      const bounce = 1 + Math.sin(this.slotAnim[i] * Math.PI) * 0.12;
      this.m.compose(this.v.set(pos.x, pos.y * rs, pos.z), this.q.identity(), this.s.set(bounce, (2 - bounce) * rs, bounce));
      this.wood.setMatrixAt(woodCount++, this.m);
      this.loads.push(pid, this.m);
    }
    this.wood.count = woodCount;
    this.wood.visible = woodCount > 0;
    this.wood.instanceMatrix.needsUpdate = true;
    this.loads.end();
    this.tags.end();
  }

  animateStore(index: number): void {
    this.slotAnim[index] = 1;
    this.syncFromState();
  }

  /** an upper level was unlocked: refresh tags/pallets */
  refresh(): void {
    this.syncFromState();
  }

  /** reveal a newly unlocked row with a build animation */
  revealRow(row: number): void {
    const g = this.rowGroups[row];
    if (!g) return;
    g.visible = true;
    g.scale.y = 0.01;
    this.buildAnims.push({ row, t: 0 });
    this.colliders.push(this.colliderStore[row]);
    this.syncFromState();
  }

  private updateLabels(): void {
    for (let row = 0; row < this.state.rackRows; row++) {
      let count = 0;
      let cap = 0;
      for (let i = 0; i < TOTAL_SLOTS; i++) {
        if (slotRow(i) !== row || !this.state.slotUnlocked(i)) continue;
        cap++;
        if (this.state.slots[i]) count++;
      }
      const text = `ROW ${rowLetter(row)} · ${count}/${cap}`;
      if (text === this.labelText[row]) continue;
      this.labelText[row] = text;
      const m = this.labels[row].material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = textSprite(text, count >= cap ? '#b8452c' : '#23427c', '#ffffff', 384, 96, 52);
      m.needsUpdate = true;
    }
  }

  update(dt: number): void {
    let changed = false;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (this.slotAnim[i] > 0) {
        this.slotAnim[i] = Math.max(0, this.slotAnim[i] - dt * 3);
        changed = true;
      }
    }
    for (let i = this.buildAnims.length - 1; i >= 0; i--) {
      const a = this.buildAnims[i];
      a.t += dt * 1.2;
      const e = Math.min(1, a.t);
      const s = e < 0.8 ? e / 0.8 : 1 + Math.sin(((e - 0.8) / 0.2) * Math.PI) * 0.08;
      this.rowGroups[a.row].scale.y = Math.max(0.01, s);
      if (a.t >= 1) {
        this.rowGroups[a.row].scale.y = 1;
        this.buildAnims.splice(i, 1);
      }
      changed = true;
    }
    if (changed) this.writeInstances();
  }
}
