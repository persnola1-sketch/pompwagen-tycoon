import * as THREE from 'three';
import layout from '../config/layout.json';
import names from '../config/names.json';
import { GameState } from '../core/GameState';
import { AABB } from './Warehouse';
import { createPallet } from './Pallet';
import { textSprite } from './Textures';

const ORANGE = 0xd9651f;
const BLUE = 0x2a4d8f;

interface SlotVisual {
  pallet: THREE.Group;
  /** store/take pop animation */
  anim: number;
}

/**
 * Pallet racking: blue uprights, orange beams, visible floor-level slots.
 * Rows are built/unbuilt according to GameState.rackRows; pallets appear
 * in slots according to GameState.slots.
 */
export class Racks {
  readonly group = new THREE.Group();
  private rowGroups: THREE.Group[] = [];
  private slotVisuals: (SlotVisual | null)[] = [];
  private labels: { mesh: THREE.Mesh; row: number }[] = [];
  private uprightMat = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.55, metalness: 0.35 });
  private beamMat = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.5, metalness: 0.3 });
  private buildAnims: { row: number; t: number }[] = [];
  private colliderStore: AABB[][] = [];

  constructor(private state: GameState, private colliders: AABB[]) {
    const cfg = layout.rackRows;
    for (let r = 0; r < cfg.maxRows; r++) {
      const g = this.buildRow(r);
      g.visible = r < state.rackRows;
      this.rowGroups.push(g);
      this.group.add(g);
      if (r < state.rackRows) this.activateColliders(r);
    }
    this.slotVisuals = new Array(cfg.maxRows * cfg.slotsPerRow).fill(null);
    this.syncFromState();
  }

  slotPosition(index: number): { x: number; z: number } {
    const cfg = layout.rackRows;
    const row = Math.floor(index / cfg.slotsPerRow);
    const col = index % cfg.slotsPerRow;
    // slots split into sections of 2 with an upright between sections
    const sectionGap = 0.22;
    const section = Math.floor(col / 2);
    const x = cfg.firstSlotX + col * cfg.slotSpacing + section * sectionGap;
    return { x, z: cfg.rowZ[row] };
  }

  /** front-of-row interaction strip for a given row; the last row flips to its
   *  north side so its strip can't overlap the office/upgrade pads */
  rowPadZ(row: number): number {
    const flip = row === layout.rackRows.maxRows - 1 ? -1 : 1;
    return layout.rackRows.rowZ[row] + flip * layout.rackRows.padOffsetZ;
  }

  private buildRow(row: number): THREE.Group {
    const cfg = layout.rackRows;
    const g = new THREE.Group();
    const z = cfg.rowZ[row];
    const sections = cfg.slotsPerRow / 2;
    const sectionW = cfg.slotSpacing * 2;
    const gap = 0.22;
    const rowColliders: AABB[] = [];

    const uprightGeo = new THREE.BoxGeometry(0.1, 3.6, 1.0);
    const braceGeo = new THREE.BoxGeometry(0.05, 0.05, 0.95);
    const beamGeo = new THREE.BoxGeometry(sectionW - 0.14, 0.12, 0.08);

    for (let s = 0; s <= sections; s++) {
      const x = cfg.firstSlotX - cfg.slotSpacing / 2 + s * (sectionW + gap) - (s > 0 ? gap : 0) + (s > 0 ? gap : 0);
      const ux = cfg.firstSlotX - cfg.slotSpacing / 2 - 0.08 + s * (sectionW + gap);
      void x;
      const up = new THREE.Mesh(uprightGeo, this.uprightMat);
      up.position.set(ux, 1.8, z);
      up.castShadow = true;
      up.receiveShadow = true;
      g.add(up);
      // horizontal braces between the two upright legs
      for (const h of [0.5, 1.6, 2.7]) {
        const br = new THREE.Mesh(braceGeo, this.uprightMat);
        br.position.set(ux, h, z);
        g.add(br);
      }
    }

    // beams: two levels (floor-level pallets sit on the ground between beams)
    for (let s = 0; s < sections; s++) {
      const cx = cfg.firstSlotX + cfg.slotSpacing / 2 + s * (sectionW + gap);
      for (const h of [1.45, 2.9]) {
        for (const dz of [-0.42, 0.42]) {
          const beam = new THREE.Mesh(beamGeo, this.beamMat);
          beam.position.set(cx, h, z + dz);
          beam.castShadow = true;
          g.add(beam);
        }
      }
    }

    // rack collider: a slab slightly thinner than the rack, players collide with it
    const minX = cfg.firstSlotX - cfg.slotSpacing / 2 - 0.2;
    const maxX = cfg.firstSlotX + (cfg.slotsPerRow - 1) * cfg.slotSpacing + (sections - 1) * gap + cfg.slotSpacing / 2 + 0.2;
    rowColliders.push({ minX, maxX, minZ: z - 0.55, maxZ: z + 0.55 });
    this.colliderStore[row] = rowColliders;

    // painted slot outlines on the floor
    for (let c = 0; c < cfg.slotsPerRow; c++) {
      const pos = this.slotPositionRaw(row, c);
      const outline = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 0.9),
        new THREE.MeshBasicMaterial({ color: 0xf2c018, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      outline.rotation.x = -Math.PI / 2;
      outline.position.set(pos.x, 0.013, z);
      g.add(outline);
    }

    // row label sign
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.7),
      new THREE.MeshBasicMaterial({ map: textSprite(`${names.product.name.toUpperCase()} 0/${cfg.slotsPerRow}`, '#2a4d8f', '#ffffff', 512, 128, 56), transparent: true }),
    );
    label.position.set(0, 3.9, z);
    this.labels.push({ mesh: label, row });
    g.add(label);
    return g;
  }

  private slotPositionRaw(row: number, col: number): { x: number; z: number } {
    return this.slotPosition(row * layout.rackRows.slotsPerRow + col);
  }

  private activateColliders(row: number): void {
    for (const c of this.colliderStore[row] ?? []) this.colliders.push(c);
  }

  /** rebuild pallet visuals to match state (used at load and after transactions) */
  syncFromState(): void {
    const cfg = layout.rackRows;
    for (let i = 0; i < cfg.maxRows * cfg.slotsPerRow; i++) {
      const should = this.state.slots[i] && Math.floor(i / cfg.slotsPerRow) < this.state.rackRows;
      const has = !!this.slotVisuals[i];
      if (should && !has) {
        const p = createPallet();
        const pos = this.slotPosition(i);
        p.position.set(pos.x, 0, pos.z);
        this.group.add(p);
        this.slotVisuals[i] = { pallet: p, anim: 0 };
      } else if (!should && has) {
        this.group.remove(this.slotVisuals[i]!.pallet);
        this.slotVisuals[i] = null;
      }
    }
    this.updateLabels();
  }

  /** show a pallet appearing in a slot with a drop bounce */
  animateStore(index: number): void {
    this.syncFromState();
    const v = this.slotVisuals[index];
    if (v) v.anim = 1;
  }

  /** reveal a newly unlocked row with a build animation */
  revealRow(row: number): void {
    const g = this.rowGroups[row];
    if (!g) return;
    g.visible = true;
    g.scale.y = 0.01;
    this.buildAnims.push({ row, t: 0 });
    this.activateColliders(row);
    this.updateLabels();
  }

  private updateLabels(): void {
    const cfg = layout.rackRows;
    for (const { mesh, row } of this.labels) {
      if (row >= this.state.rackRows) continue;
      let count = 0;
      for (let c = 0; c < cfg.slotsPerRow; c++) if (this.state.slots[row * cfg.slotsPerRow + c]) count++;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.map = textSprite(`${names.product.name.toUpperCase()} ${count}/${cfg.slotsPerRow}`, '#2a4d8f', '#ffffff', 512, 128, 56);
      mat.needsUpdate = true;
    }
  }

  update(dt: number): void {
    for (const v of this.slotVisuals) {
      if (v && v.anim > 0) {
        v.anim = Math.max(0, v.anim - dt * 3);
        const s = 1 + Math.sin(v.anim * Math.PI) * 0.12;
        v.pallet.scale.set(s, 2 - s, s);
      }
    }
    for (let i = this.buildAnims.length - 1; i >= 0; i--) {
      const a = this.buildAnims[i];
      a.t += dt * 1.2;
      const g = this.rowGroups[a.row];
      const e = Math.min(1, a.t);
      // overshoot ease
      const s = e < 0.8 ? e / 0.8 : 1 + Math.sin((e - 0.8) / 0.2 * Math.PI) * 0.08;
      g.scale.y = Math.max(0.01, s);
      if (a.t >= 1) {
        g.scale.y = 1;
        this.buildAnims.splice(i, 1);
      }
    }
  }
}
