import * as THREE from 'three';
import { Worker, WorkerStatus } from '../../core/workers/WorkerTypes';
import { Character } from '../Character';
import { Pompwagen } from '../Pompwagen';
import { Forklift } from '../Forklift';
import { AABB } from '../../core/Geometry';
import { canvas } from '../Textures';

const STATUS_EMOJI: Record<WorkerStatus, string> = {
  idle: '💤',
  carrying: '📦',
  break: '☕',
  waiting: '❗',
  training: '🎓',
  walking: '',
  offduty: '🌙',
};

const spriteCache = new Map<string, THREE.SpriteMaterial>();
function statusMaterial(emoji: string): THREE.SpriteMaterial {
  let m = spriteCache.get(emoji);
  if (!m) {
    const [c, ctx] = canvas(128, 128);
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,24,32,0.85)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.font = '64px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false });
    spriteCache.set(emoji, m);
  }
  return m;
}

/**
 * 3D worker: a character in their own colours pulling a pompwagen, with a
 * status bubble (📦 ☕ ❗ 💤 🎓) above their head. Driven by WorkerAI.
 */
export class WorkerActor {
  readonly group = new THREE.Group();
  readonly character: Character;
  readonly pompwagen: Pompwagen;
  readonly forklift: Forklift | null = null;
  private bubble: THREE.Sprite;
  private status: WorkerStatus = 'idle';
  private popT = 0;

  constructor(public readonly worker: Worker, x: number, z: number) {
    this.character = new Character({
      skin: worker.look.skin,
      shirt: worker.look.shirt,
      pants: 0x3b4150,
      vest: worker.look.vest,
      hat: worker.look.hat,
      hatColor: worker.look.hatColor,
      hair: worker.look.hair,
      height: worker.look.height,
      mustache: worker.look.mustache,
    });
    this.pompwagen = new Pompwagen(x, z, worker.look.vest === 0xffb020 ? 0x2f6fb4 : 0xd9651f);
    this.bubble = new THREE.Sprite(statusMaterial('💤'));
    this.bubble.scale.setScalar(0.7);
    this.bubble.renderOrder = 15;
    this.group.add(this.bubble);
    if (worker.role === 'forklift') {
      this.forklift = new Forklift(0xe8562a);
      this.character.sitting = true;
      this.character.armMode = 'drive';
      this.character.group.position.copy(this.forklift.seat);
      this.character.group.scale.setScalar(0.9);
      this.forklift.group.add(this.character.group);
      this.group.add(this.forklift.group);
    } else {
      this.group.add(this.character.group, this.pompwagen.group);
    }
  }

  setStatus(s: WorkerStatus): void {
    if (s === this.status) return;
    this.status = s;
    const e = STATUS_EMOJI[s];
    this.bubble.visible = e !== '';
    if (e) this.bubble.material = statusMaterial(e);
    this.popT = 1;
  }

  /** place the actor and animate the rig */
  setCargo(products: string[]): void {
    if (this.forklift) this.forklift.setCargo(products);
    else this.pompwagen.setCargo(products);
  }

  liftTo(height: number): void {
    if (this.forklift && height > 0.01) this.forklift.liftTo(height);
  }

  update(dt: number, x: number, z: number, heading: number, speed: number, colliders: AABB[], electric: boolean): void {
    if (this.forklift) {
      this.forklift.place(dt, x, z, heading, 0, speed);
      this.character.animate(dt, 0);
    } else {
      this.character.group.position.set(x, 0, z);
      this.character.group.rotation.y = heading;
      this.character.animate(dt, speed);
      this.pompwagen.setElectric(electric);
      this.pompwagen.follow(dt, x, z, heading, speed, colliders);
    }
    if (this.popT > 0) this.popT = Math.max(0, this.popT - dt * 3);
    const s = 0.7 * (1 + Math.sin(this.popT * Math.PI) * 0.35);
    this.bubble.scale.setScalar(s);
    this.bubble.position.set(x, 2.15 * this.worker.look.height + Math.sin(performance.now() * 0.003) * 0.05, z);
  }

  /** hit test sphere for taps */
  get hitPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.character.group.position.x, 0.9, this.character.group.position.z);
  }
}
