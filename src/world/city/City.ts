import * as THREE from 'three';
import layout from '../../config/layout.json';
import { loadModel, modelParts } from '../Assets';
import { MergeBuilder, glow, mat, unitCylinder } from '../Merge';
import { Buildings, StoreBrand } from './Buildings';
import { Pedestrians } from './Pedestrians';
import { Roads } from './Roads';
import { Obstacle, Traffic } from './Traffic';

const C = layout.city;
const Y = layout.yard;

interface Placement {
  x: number;
  z: number;
  ry: number;
  s: number;
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a - 1) / 2147483646;
  };
}

/**
 * The living city around the plot: street grid, buildings, street furniture,
 * trees, moving traffic and pedestrians. Distant objects are hidden by the fog, and everything static is merged or instanced to keep draw calls low.
 */
export class City {
  readonly group = new THREE.Group();
  readonly roads: Roads;
  readonly buildings: Buildings;
  readonly traffic: Traffic;
  readonly pedestrians: Pedestrians;
  private movers = new THREE.Group();
  private time = 0;

  constructor(stores: StoreBrand[]) {
    this.roads = new Roads();
    this.buildings = new Buildings(stores);
    this.group.add(this.roads.group, this.buildings.group, this.movers);
    this.traffic = new Traffic(this.movers, this.roads.junctions);
    this.pedestrians = new Pedestrians(this.movers);
    this.group.add(this.streetFurniture());
    void this.loadTrees();
  }

  /** streetlights, bins and benches along the ring road */
  private streetFurniture(): THREE.Group {
    const b = new MergeBuilder();
    const pole = mat(0x4a525d, 0.5, 0.6);
    const head = mat(0x2d333d, 0.5, 0.5);
    const lamp = glow(0xfff3d1);
    const edge = C.roadWidth / 2 + C.bikeLane + 0.25 + C.sidewalk / 2;
    const light = (x: number, z: number, dirX: number, dirZ: number): void => {
      b.add(unitCylinder, pole, x, 3.2, z, 0, 0, 0, 0.14, 6.4, 0.14);
      b.box(Math.abs(dirX) * 1.5 + 0.08, 0.08, Math.abs(dirZ) * 1.5 + 0.08, pole, x + dirX * 0.75, 6.35, z + dirZ * 0.75);
      b.box(0.6, 0.14, 0.28, head, x + dirX * 1.5, 6.3, z + dirZ * 1.5, dirZ !== 0 ? Math.PI / 2 : 0);
      b.box(0.48, 0.02, 0.2, lamp, x + dirX * 1.5, 6.22, z + dirZ * 1.5, dirZ !== 0 ? Math.PI / 2 : 0);
    };
    for (let x = -C.ringX + 8; x <= C.ringX - 8; x += 24) {
      light(x, C.ringZ + edge, 0, -1);
      light(x + 12, -(C.ringZ + edge), 0, 1);
    }
    for (let z = -C.ringZ + 10; z <= C.ringZ - 10; z += 24) {
      light(C.ringX + edge, z, -1, 0);
      light(-(C.ringX + edge), z + 12, 1, 0);
    }
    // bins and benches
    for (const [x, z] of [[-20, C.ringZ + edge], [24, C.ringZ + edge], [-30, -(C.ringZ + edge)], [18, -(C.ringZ + edge)]] as [number, number][]) {
      b.add(unitCylinder, mat(0x3a4f3a, 0.8), x, 0.45, z, 0, 0, 0, 0.5, 0.9, 0.5);
      b.box(1.6, 0.1, 0.45, mat(0x8b6a44, 0.9), x + 2.5, 0.45, z);
      for (const s of [-0.7, 0.7]) b.box(0.12, 0.45, 0.12, mat(0x4a4f57, 0.7), x + 2.5 + s, 0.22, z);
    }
    return b.build();
  }

  /** CC0 Kenney trees, instanced along the streets and in the parks */
  private async loadTrees(): Promise<void> {
    const rand = rng(4242);
    const names = ['tree_oak', 'tree_default', 'tree_detailed', 'tree_pineRoundA', 'tree_pineTallC'];
    const trees: Record<string, Placement[]> = {};
    for (const n of names) trees[n] = [];
    const plant = (x: number, z: number, s = 4.4): void => {
      trees[names[Math.floor(rand() * names.length)]].push({ x, z, ry: rand() * Math.PI * 2, s: s * (0.8 + rand() * 0.4) });
    };
    const edge = C.roadWidth / 2 + C.bikeLane + 0.25 + C.sidewalk + 1.6;
    for (let x = -C.ringX + 14; x <= C.ringX - 14; x += 12) {
      plant(x, C.ringZ + edge);
      plant(x + 6, -(C.ringZ + edge));
    }
    for (let z = -C.ringZ + 14; z <= C.ringZ - 14; z += 12) {
      plant(C.ringX + edge, z);
      plant(-(C.ringX + edge), z + 6);
    }
    // parks and the green belt just outside the fence
    for (let i = 0; i < 26; i++) plant(-17 + rand() * 34, -(C.ringZ + 10 + rand() * 12), 5);
    for (let i = 0; i < 18; i++) plant(-37 + rand() * 26, C.outerZ - 26 + rand() * 12, 5);
    for (let i = 0; i < 20; i++) {
      const a = rand() * Math.PI * 2;
      const r = 110 + rand() * 70;
      plant(Math.cos(a) * r, Math.sin(a) * r, 5.5);
    }
    const bushes: Placement[] = [];
    for (let x = -Y.fenceX + 3; x < Y.fenceX; x += 5) {
      if (Math.abs(Math.abs(x) - Math.abs(layout.truck.outbound.approach.x)) < Y.gateHalfWidth + 2) continue;
      bushes.push({ x, z: Y.fenceZ + 1.6, ry: rand() * 6, s: 2.6 + rand() * 1.2 });
    }

    const ok = await Promise.all([
      ...Object.entries(trees).map(([name, list]) => this.instance(name, list)),
      this.instance('plant_bushDetailed', bushes),
    ]);
    if (!ok[0]) this.fallbackTrees(Object.values(trees).flat());
  }

  private async instance(name: string, list: Placement[]): Promise<boolean> {
    if (!list.length) return true;
    const root = await loadModel(name);
    if (!root) return false;
    const parts = modelParts(root);
    const box = new THREE.Box3();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((pl, i) => {
        q.setFromAxisAngle(up, pl.ry);
        m.compose(new THREE.Vector3(pl.x, -box.min.y * pl.s, pl.z), q, new THREE.Vector3(pl.s, pl.s, pl.s));
        mesh.setMatrixAt(i, m);
      });
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    return true;
  }

  private fallbackTrees(list: Placement[]): void {
    const b = new MergeBuilder();
    for (const t of list) {
      b.add(unitCylinder, mat(0x6e5138, 0.9), t.x, t.s * 0.35, t.z, 0, 0, 0, 0.35, t.s * 0.7, 0.35);
      b.add(new THREE.IcosahedronGeometry(1, 1), mat(0x4c8a3f, 0.9), t.x, t.s * 1.1, t.z, 0, 0, 0, t.s * 0.45, t.s * 0.55, t.s * 0.45);
    }
    this.group.add(b.build());
  }

  /** the warehouse trucks, so traffic gives way to them */
  setObstacles(obs: Obstacle[]): void {
    this.traffic.obstacles = obs;
  }

  update(dt: number): void {
    this.time += dt;
    this.traffic.update(dt);
    this.pedestrians.update(dt);
  }
}
