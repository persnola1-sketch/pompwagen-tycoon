import * as THREE from 'three';
import layout from '../config/layout.json';
import { asphaltTexture, concreteTexture, corrugatedWallTexture, textSprite } from './Textures';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Static environment: interior, walls with dock doors, truck yard, details. */
export class Warehouse {
  readonly group = new THREE.Group();
  readonly colliders: AABB[] = [];

  constructor() {
    const W = layout.warehouse.width;
    const D = layout.warehouse.depth;
    const H = layout.warehouse.wallHeight;

    // ---- yard ground ----
    const yard = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 110),
      new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }),
    );
    yard.rotation.x = -Math.PI / 2;
    yard.position.y = -0.02;
    yard.receiveShadow = true;
    this.group.add(yard);

    // ---- interior concrete floor ----
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    this.paintFloorMarkings(W, D);
    this.buildWalls(W, D, H);
    this.buildDockDetails();
    this.buildYardDetails();
    this.buildInteriorDetails(W, D, H);
  }

  private mat(color: number, rough = 0.8, metal = 0): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, collide = false, castShadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (collide) this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return mesh;
  }

  // ---------- painted lane markings ----------
  private stripe(w: number, d: number, x: number, z: number, color = 0xf2c018, opacity = 0.85): void {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    this.group.add(m);
  }

  private paintFloorMarkings(W: number, _D: number): void {
    // main aisle lanes
    this.stripe(W - 6, 0.12, 0, -11);
    this.stripe(0.12, 4, -14, -6.4);
    this.stripe(0.12, 4, 14, -6.4);
    // pedestrian walkway near office
    this.stripe(10, 0.12, 0, 9.0, 0x3aa657);
    this.stripe(10, 0.12, 0, 11.4, 0x3aa657);
    // direction arrows in the main aisle
    for (const x of [-9, 0, 9]) {
      const arrow = new THREE.Mesh(
        new THREE.ShapeGeometry(this.arrowShape()),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }),
      );
      arrow.rotation.x = -Math.PI / 2;
      arrow.rotation.z = Math.PI / 2;
      arrow.position.set(x, 0.012, -11);
      this.group.add(arrow);
    }
  }

  private arrowShape(): THREE.Shape {
    const s = new THREE.Shape();
    s.moveTo(0, 0.8);
    s.lineTo(0.5, 0);
    s.lineTo(0.2, 0);
    s.lineTo(0.2, -0.8);
    s.lineTo(-0.2, -0.8);
    s.lineTo(-0.2, 0);
    s.lineTo(-0.5, 0);
    s.closePath();
    return s;
  }

  // ---------- walls with dock door openings ----------
  private buildWalls(W: number, D: number, H: number): void {
    const wallMat = new THREE.MeshStandardMaterial({ map: corrugatedWallTexture(), roughness: 0.7, metalness: 0.25 });
    const t = 0.4;
    const halfW = W / 2;
    const halfD = D / 2;

    // north wall — solid
    this.box(W + t * 2, H, t, wallMat, 0, H / 2, -halfD - t / 2, true);
    // south wall — low parapet so the camera can see over it
    this.box(W + t * 2, 1.4, t, wallMat, 0, 0.7, halfD + t / 2, true);

    // west / east walls with two door openings each
    const { doorZ, doorWidth, doorHeight } = layout.docks;
    for (const side of [-1, 1]) {
      const x = side * (halfW + t / 2);
      const edges = [-halfD, doorZ[0] - doorWidth / 2, doorZ[0] + doorWidth / 2, doorZ[1] - doorWidth / 2, doorZ[1] + doorWidth / 2, halfD];
      // wall segments between openings
      for (let i = 0; i < edges.length - 1; i += 2) {
        const z0 = edges[i];
        const z1 = edges[i + 1];
        if (z1 - z0 > 0.01) this.box(t, H, z1 - z0, wallMat, x, H / 2, (z0 + z1) / 2, true);
      }
      // headers above the doors + rolled shutter + rubber dock seal
      for (const dz of doorZ) {
        this.box(t, H - doorHeight, doorWidth, wallMat, x, doorHeight + (H - doorHeight) / 2, dz, false);
        const shutter = this.box(0.5, 0.5, doorWidth - 0.2, this.mat(0x8d939c, 0.5, 0.5), x, doorHeight - 0.25, dz, false);
        shutter.rotation.z = 0;
        // black rubber seals on the outside
        this.box(0.25, doorHeight, 0.35, this.mat(0x22242a, 0.95), x + side * 0.35, doorHeight / 2, dz - doorWidth / 2 + 0.18, false);
        this.box(0.25, doorHeight, 0.35, this.mat(0x22242a, 0.95), x + side * 0.35, doorHeight / 2, dz + doorWidth / 2 - 0.18, false);
        this.box(0.25, 0.4, doorWidth - 0.2, this.mat(0x22242a, 0.95), x + side * 0.35, doorHeight - 0.2, dz, false);
        // dock number sign
        const num = side < 0 ? (dz < 0 ? 'IN 1' : 'IN 2') : (dz < 0 ? 'OUT 1' : 'OUT 2');
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(1.3, 0.65),
          new THREE.MeshBasicMaterial({ map: textSprite(num, side < 0 ? '#2563b8' : '#c2571f', '#ffffff') }),
        );
        sign.position.set(x + side * 0.5, doorHeight + 0.7, dz);
        sign.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
        this.group.add(sign);
      }
    }
  }

  private buildDockDetails(): void {
    const { doorZ } = layout.docks;
    const bollardMat = this.mat(0xf2c018, 0.6);
    for (const side of [-1, 1]) {
      const x = side * (layout.warehouse.width / 2 - 1.1);
      for (const dz of doorZ) {
        for (const off of [-1, 1]) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 10), bollardMat);
          b.position.set(x, 0.4, dz + off * 2.05);
          b.castShadow = true;
          this.group.add(b);
          this.colliders.push({ minX: b.position.x - 0.15, maxX: b.position.x + 0.15, minZ: b.position.z - 0.15, maxZ: b.position.z + 0.15 });
        }
      }
    }
  }

  // ---------- yard: parking lines, fence, gate, trees, buildings ----------
  private buildYardDetails(): void {
    // truck lane markings outside each dock side
    for (const side of [-1, 1]) {
      const laneX = side * 26;
      for (let z = -32; z <= 34; z += 6) this.stripe(0.25, 3, laneX, z, 0xffffff, 0.5);
      // parking bays in front of the docks
      for (const dz of layout.docks.doorZ) {
        this.stripe(9, 0.18, side * 21.5, dz - 2.2, 0xffffff, 0.7);
        this.stripe(9, 0.18, side * 21.5, dz + 2.2, 0xffffff, 0.7);
      }
    }

    // perimeter fence
    const fenceMat = this.mat(0x7a8494, 0.6, 0.5);
    const postGeo = new THREE.BoxGeometry(0.12, 2.2, 0.12);
    const railGeo = new THREE.BoxGeometry(0.05, 0.05, 4);
    const addFenceRun = (x: number, z0: number, z1: number, alongZ: boolean): void => {
      const len = Math.abs(z1 - z0);
      const n = Math.floor(len / 4);
      for (let i = 0; i <= n; i++) {
        const p = new THREE.Mesh(postGeo, fenceMat);
        const c = z0 + (i / Math.max(1, n)) * (z1 - z0);
        p.position.set(alongZ ? x : c, 1.1, alongZ ? c : x);
        this.group.add(p);
        if (i < n) {
          for (const h of [0.6, 1.4, 2.0]) {
            const r = new THREE.Mesh(railGeo, fenceMat);
            const rc = z0 + ((i + 0.5) / Math.max(1, n)) * (z1 - z0);
            r.position.set(alongZ ? x : rc, h, alongZ ? rc : x);
            if (!alongZ) r.rotation.y = Math.PI / 2;
            this.group.add(r);
          }
        }
      }
    };
    // fence with gaps where the truck lanes cross (|x|=26) on north and south
    addFenceRun(-45, -40, 40, true);
    addFenceRun(45, -40, 40, true);
    for (const zSide of [-1, 1]) {
      const z = zSide * 40;
      addFenceRun(z, -45, -30, false);
      addFenceRun(z, -22, 22, false);
      addFenceRun(z, 30, 45, false);
      // gate posts at the lane gaps
      for (const gx of [-30, -22, 22, 30]) {
        const gp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), this.mat(0x3b4351, 0.5, 0.4));
        gp.position.set(gx, 1.3, z);
        this.group.add(gp);
      }
    }

    // trees
    const trunkMat = this.mat(0x6e5138, 0.9);
    const leafMat = this.mat(0x4c8a3f, 0.9);
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 7);
    const leafGeo = new THREE.IcosahedronGeometry(1.25, 1);
    const treeSpots: [number, number][] = [
      [-40, -34], [-36, 30], [-42, 12], [40, -30], [38, 26], [42, -8], [-38, -12], [36, 8],
    ];
    for (const [tx, tz] of treeSpots) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 0.8, tz);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(tx, 2.3, tz);
      leaves.castShadow = true;
      const s = 0.8 + Math.random() * 0.5;
      leaves.scale.setScalar(s);
      this.group.add(trunk, leaves);
    }

    // background buildings beyond the fence
    const bldgSpots: [number, number, number, number, number][] = [
      [-58, -20, 10, 8, 14], [-56, 18, 8, 6, 10], [58, -14, 12, 10, 16], [56, 22, 9, 7, 12], [0, -58, 24, 9, 12],
    ];
    const bldgMat = this.mat(0x8e97a6, 0.85);
    for (const [bx, bz, w, h, d] of bldgSpots) {
      this.box(w, h, d, bldgMat, bx, h / 2, bz, false, false);
    }

    // parked bikes near the office side (Dutch flavor): simple frames
    for (let i = 0; i < 3; i++) {
      const bike = new THREE.Group();
      const wheelGeo = new THREE.TorusGeometry(0.3, 0.04, 6, 14);
      const frameMat = this.mat(0x333940, 0.5, 0.5);
      const w1 = new THREE.Mesh(wheelGeo, frameMat);
      w1.position.set(-0.45, 0.3, 0);
      const w2 = new THREE.Mesh(wheelGeo, frameMat);
      w2.position.set(0.45, 0.3, 0);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), frameMat);
      bar.position.set(0, 0.62, 0);
      bar.rotation.z = 0.18;
      bike.add(w1, w2, bar);
      bike.position.set(4 + i * 1.1, 0, 14.5);
      bike.rotation.y = 0.3;
      this.group.add(bike);
    }
  }

  // ---------- interior details ----------
  private buildInteriorDetails(_W: number, D: number, H: number): void {
    // warm wall-mounted lamps on the north wall (nothing hangs in the camera's
    // sightline — the follow camera looks in from above)
    for (const lx of [-12, -4, 4, 12]) {
      const bracket = this.box(0.5, 0.12, 0.5, this.mat(0x3c4454, 0.5, 0.6), lx, H - 1.0, -D / 2 + 0.45, false, false);
      bracket.rotation.x = 0.3;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe9b8 }),
      );
      bulb.position.set(lx, H - 1.15, -D / 2 + 0.55);
      this.group.add(bulb);
    }

    // safety signs on the north wall
    const signs: [string, string][] = [
      ['⚠ FORKLIFTS', '#f2c018'],
      ['EXIT →', '#2f9e4f'],
      ['MAX 5 KM/H', '#d24545'],
    ];
    signs.forEach(([txt, colr], i) => {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 1.1),
        new THREE.MeshBasicMaterial({ map: textSprite(txt, colr, '#ffffff', 256, 112, 40) }),
      );
      s.position.set(-8 + i * 8, 3.1, -D / 2 + 0.22);
      this.group.add(s);
    });

    // fire extinguisher on the north wall
    const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), this.mat(0xc22b2b, 0.5));
    ext.position.set(-14, 1.1, -D / 2 + 0.35);
    this.group.add(ext);

    // office corner: desk + boards near the office pad
    const deskMat = this.mat(0x9a7b52, 0.7);
    this.box(2.2, 0.08, 0.9, deskMat, 0, 0.78, 11.2, false);
    this.box(0.1, 0.75, 0.8, deskMat, -1.0, 0.38, 11.2, false);
    this.box(0.1, 0.75, 0.8, deskMat, 1.0, 0.38, 11.2, false);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.4),
      new THREE.MeshBasicMaterial({ map: textSprite('ORDERS', '#ffffff', '#2563b8', 256, 128, 52) }),
    );
    board.position.set(0, 2.2, 11.9);
    board.rotation.y = Math.PI;
    this.group.add(board);
  }
}
