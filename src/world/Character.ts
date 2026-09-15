import * as THREE from 'three';
import { MergeBuilder, mat, unitCylinder, unitSphere } from './Merge';

export interface CharacterLook {
  skin: number;
  shirt: number;
  pants: number;
  vest: number;
  hat: 'helmet' | 'cap' | 'none';
  hatColor: number;
  hair: number;
  /** 0.9 – 1.1 */
  height: number;
  mustache?: boolean;
}

export const DEFAULT_LOOK: CharacterLook = {
  skin: 0xe0ac85,
  shirt: 0x2c3e66,
  pants: 0x3b4150,
  vest: 0xff7a1a,
  hat: 'helmet',
  hatColor: 0xffc61a,
  hair: 0x4a2f1c,
  height: 1,
};

const limbCache = new Map<string, THREE.BufferGeometry>();
/** capsule with its centre at the origin, long axis along y */
function limb(radius: number, length: number): THREE.BufferGeometry {
  const key = `${radius}|${length}`;
  let g = limbCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(radius, length, 4, 10);
    limbCache.set(key, g);
  }
  return g;
}

export const HIP_Y = 0.86;

const REFLECT = mat(0xe9edf0, 0.25, 0.4);
const BOOT = mat(0x2b2420, 0.7);
const SOLE = mat(0x14120f, 0.9);
const TOE = mat(0x7b828b, 0.35, 0.7);
const GLOVE = mat(0xc9a24a, 0.8);
const EYE = mat(0x141414, 0.4);

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
}

/**
 * Low-poly warehouse worker rig: hi-vis vest, boots, hard hat or cap, with hip,
 * knee, shoulder and elbow pivots. Walk/run cycle, carry pose, idle stretches
 * and a celebration jump. Shared by the player, workers, builders and Henk.
 */
export class Character {
  readonly group = new THREE.Group();
  readonly upper = new THREE.Group();
  private legs: Leg[] = [];
  private shoulders: THREE.Group[] = [];
  private elbows: THREE.Group[] = [];
  private walkT = 0;
  private idleT = Math.random() * 10;
  private celebrateT = 0;
  /** arms reach back (pulling a handle) or forward (carrying) */
  armMode: 'pull' | 'carry' | 'idle' = 'pull';

  constructor(look: CharacterLook = DEFAULT_LOOK) {
    this.build(look);
    this.group.scale.setScalar(look.height);
  }

  private build(look: CharacterLook): void {
    const SKIN = mat(look.skin, 0.75);
    const SHIRT = mat(look.shirt, 0.85);
    const PANTS = mat(look.pants, 0.85);
    const VEST = mat(look.vest, 0.55);
    const HAT = mat(look.hatColor, 0.35, 0.05);
    const HAIR = mat(look.hair, 0.9);

    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.1, HIP_Y, 0);
      const thigh = new THREE.Mesh(limb(0.078, 0.28), PANTS);
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      const lower = new MergeBuilder();
      lower.add(limb(0.066, 0.26), PANTS, 0, -0.18, 0);
      lower.box(0.13, 0.11, 0.27, BOOT, 0, -0.38, 0.05);
      lower.box(0.14, 0.03, 0.29, SOLE, 0, -0.44, 0.05);
      lower.box(0.135, 0.06, 0.06, TOE, 0, -0.4, 0.18);
      knee.add(lower.build());
      hip.add(thigh, knee);
      this.group.add(hip);
      this.legs.push({ hip, knee });
    }

    this.upper.position.y = HIP_Y;
    const b = new MergeBuilder();
    b.box(0.3, 0.14, 0.19, PANTS, 0, 0.03, 0);
    b.box(0.32, 0.05, 0.2, SOLE, 0, 0.1, 0);
    b.add(limb(0.16, 0.24), SHIRT, 0, 0.32, 0, 0, 0, 0, 1, 1, 0.72);
    b.add(limb(0.172, 0.22), VEST, 0, 0.3, 0, 0, 0, 0, 1.02, 1, 0.8);
    for (const y of [0.2, 0.33]) b.box(0.35, 0.035, 0.29, REFLECT, 0, y, 0);
    for (const sx of [-1, 1]) b.box(0.035, 0.34, 0.29, REFLECT, sx * 0.08, 0.36, 0);
    b.add(unitCylinder, SKIN, 0, 0.57, 0, 0, 0, 0, 0.1, 0.1, 0.1);
    b.add(unitSphere, SKIN, 0, 0.71, 0, 0, 0, 0, 0.23, 0.24, 0.23);
    for (const sx of [-1, 1]) b.add(unitSphere, EYE, sx * 0.042, 0.725, 0.105, 0, 0, 0, 0.03, 0.03, 0.02);
    b.box(0.03, 0.04, 0.03, SKIN, 0, 0.7, 0.118);
    if (look.mustache) b.box(0.1, 0.03, 0.03, HAIR, 0, 0.675, 0.12);
    // hair cap under the hat / visible with a cap
    b.add(new THREE.SphereGeometry(0.118, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), HAIR, 0, 0.74, 0);
    if (look.hat === 'helmet') {
      b.add(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), HAT, 0, 0.745, 0);
      b.add(unitCylinder, HAT, 0, 0.75, 0.025, 0, 0, 0, 0.33, 0.02, 0.34);
      b.box(0.035, 0.03, 0.25, HAT, 0, 0.875, 0);
    } else if (look.hat === 'cap') {
      b.add(new THREE.SphereGeometry(0.126, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), HAT, 0, 0.745, 0);
      b.box(0.2, 0.02, 0.14, HAT, 0, 0.75, 0.15);
    }
    this.upper.add(b.build());

    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.215, 0.49, 0);
      shoulder.rotation.set(0.5, 0, -sx * 0.14);
      const upperArm = new THREE.Mesh(limb(0.056, 0.2), SHIRT);
      upperArm.position.y = -0.15;
      upperArm.castShadow = true;
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      elbow.rotation.x = -0.25;
      const fore = new MergeBuilder();
      fore.add(limb(0.05, 0.18), SHIRT, 0, -0.13, 0);
      fore.add(unitSphere, GLOVE, 0, -0.29, 0, 0, 0, 0, 0.11, 0.12, 0.11);
      elbow.add(fore.build());
      shoulder.add(upperArm, elbow);
      this.upper.add(shoulder);
      this.shoulders.push(shoulder);
      this.elbows.push(elbow);
    }
    this.group.add(this.upper);
  }

  /** short jump + arm wave (level ups, warehouse opening) */
  celebrate(): void {
    this.celebrateT = 1.2;
  }

  /** drive the walk cycle; `speed` in m/s */
  animate(dt: number, speed: number): void {
    const moving = Math.min(1, speed / 2);
    const run = Math.min(1, Math.max(0, (speed - 3.4) / 2));
    this.walkT += speed * dt * 4.2;
    this.idleT += dt;
    const s = Math.sin(this.walkT);
    const amp = (0.55 + run * 0.3) * moving;
    this.legs.forEach((leg, i) => {
      const side = i === 0 ? 1 : -1;
      leg.hip.rotation.x = s * amp * side;
      leg.knee.rotation.x = Math.max(0, Math.sin(this.walkT * side + 1.2 * side)) * amp * 1.2;
    });
    const idleStretch = moving < 0.05 ? Math.max(0, Math.sin(this.idleT * 0.7)) * 0.25 : 0;
    this.shoulders.forEach((sh, i) => {
      const side = i === 0 ? 1 : -1;
      if (this.armMode === 'pull') {
        sh.rotation.x = 0.5 - s * 0.08 * moving * side;
        this.elbows[i].rotation.x = -0.25;
      } else if (this.armMode === 'carry') {
        sh.rotation.x = -1.1;
        this.elbows[i].rotation.x = -0.9;
      } else {
        sh.rotation.x = -s * 0.5 * moving * side - idleStretch * 2.6;
        this.elbows[i].rotation.x = -0.3 - moving * 0.6;
      }
    });
    let bob = HIP_Y + Math.abs(Math.cos(this.walkT)) * 0.03 * moving + Math.sin(this.idleT * 2) * 0.004;
    if (this.celebrateT > 0) {
      this.celebrateT -= dt;
      const t = 1.2 - this.celebrateT;
      const jump = Math.max(0, Math.sin(t * Math.PI * 2.5)) * 0.35;
      bob += jump;
      this.shoulders.forEach((sh, i) => {
        sh.rotation.x = -2.6 + Math.sin(t * 14 + i) * 0.5;
      });
      this.legs.forEach((leg) => {
        leg.hip.rotation.x = -jump * 0.6;
        leg.knee.rotation.x = jump * 1.4;
      });
    }
    this.upper.position.y = bob;
    this.upper.rotation.x = 0.1 * moving * (this.armMode === 'carry' ? 0.4 : 1);
    this.legs.forEach((leg) => {
      leg.hip.position.y = bob;
    });
  }
}
