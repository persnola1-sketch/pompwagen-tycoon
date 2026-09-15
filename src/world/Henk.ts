import * as THREE from 'three';
import { Character } from './Character';

/**
 * Henk, the retired warehouse legend: a friendly blue hologram (orange vest,
 * mustache, clipboard) that floats near the player, gently bobs, turns toward
 * them and points a light beam at the current tutorial target.
 */
export class Henk {
  readonly group = new THREE.Group();
  private character: Character;
  private holo: THREE.MeshStandardMaterial;
  private disc: THREE.Mesh;
  private beam: THREE.Mesh;
  private beamTip: THREE.Mesh;
  private time = 0;
  private target: THREE.Vector3 | null = null;
  private pos = new THREE.Vector3();
  private visibleGoal = 0;
  private fade = 0;

  constructor(parent: THREE.Object3D) {
    this.character = new Character({
      skin: 0xe0ac85, shirt: 0x2c3e66, pants: 0x3b4150, vest: 0xff7a1a,
      hat: 'cap', hatColor: 0xff7a1a, hair: 0x9a9a9a, height: 0.98, mustache: true,
    });
    this.character.armMode = 'idle';
    this.holo = new THREE.MeshStandardMaterial({
      color: 0x8fd4ff, emissive: 0x2f8fe8, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.0, depthWrite: false, roughness: 0.4, metalness: 0.1,
    });
    this.character.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = this.holo;
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    // clipboard in the left hand
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.02), this.holo);
    clip.position.set(-0.28, 0.35, 0.22);
    clip.rotation.set(-0.5, 0, 0.2);
    this.character.upper.add(clip);
    this.group.add(this.character.group);

    this.disc = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 32),
      new THREE.MeshBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.03;
    this.group.add(this.disc);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.09, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.visible = false;
    this.beamTip = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, 32),
      new THREE.MeshBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beamTip.rotation.x = -Math.PI / 2;
    this.beamTip.visible = false;
    parent.add(this.group, this.beam, this.beamTip);
    this.group.visible = false;
  }

  show(on: boolean): void {
    this.visibleGoal = on ? 1 : 0;
    if (on) this.group.visible = true;
  }

  /** point the beam at a world position (null = no target) */
  setTarget(t: THREE.Vector3 | null): void {
    this.target = t;
  }

  update(dt: number, player: THREE.Vector3, playerHeading: number): void {
    this.time += dt;
    this.fade += (this.visibleGoal - this.fade) * Math.min(1, dt * 4);
    if (this.fade < 0.01 && this.visibleGoal === 0) {
      this.group.visible = false;
      this.beam.visible = false;
      this.beamTip.visible = false;
      return;
    }
    // float beside the player, on the side facing the camera
    const side = new THREE.Vector3(Math.cos(playerHeading), 0, -Math.sin(playerHeading));
    const goal = player.clone().addScaledVector(side, 2.0).add(new THREE.Vector3(0, 0, 0.6));
    if (this.target) {
      // stand between the player and the target so the beam reads well
      const toT = this.target.clone().sub(player).setY(0);
      const d = toT.length();
      if (d > 3) goal.copy(player).addScaledVector(toT.normalize(), 2.2).addScaledVector(side, 0.8);
    }
    this.pos.lerp(goal, Math.min(1, dt * 3));
    const bob = 0.55 + Math.sin(this.time * 1.8) * 0.12;
    this.group.position.set(this.pos.x, bob, this.pos.z);
    this.group.scale.setScalar(0.85 + this.fade * 0.15);
    const face = this.target ?? player;
    this.group.rotation.y = Math.atan2(face.x - this.pos.x, face.z - this.pos.z);
    this.character.animate(dt, 0);
    const flicker = 0.62 + Math.sin(this.time * 23) * 0.04 + Math.sin(this.time * 7) * 0.04;
    this.holo.opacity = flicker * this.fade;
    (this.disc.material as THREE.MeshBasicMaterial).opacity = 0.5 * this.fade;
    this.disc.position.y = -bob + 0.03;
    this.disc.scale.setScalar(1 + Math.sin(this.time * 3) * 0.08);

    if (this.target && this.fade > 0.3) {
      const from = new THREE.Vector3(this.pos.x, bob + 0.9, this.pos.z);
      const to = new THREE.Vector3(this.target.x, 0.3, this.target.z);
      const dir = to.clone().sub(from);
      const len = dir.length();
      this.beam.position.copy(from).add(to).multiplyScalar(0.5);
      this.beam.scale.set(1, len, 1);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.beam.visible = true;
      (this.beam.material as THREE.MeshBasicMaterial).opacity = (0.35 + Math.sin(this.time * 6) * 0.1) * this.fade;
      this.beamTip.position.set(this.target.x, 0.05, this.target.z);
      this.beamTip.scale.setScalar(1 + ((this.time * 1.5) % 1) * 0.6);
      (this.beamTip.material as THREE.MeshBasicMaterial).opacity = (1 - ((this.time * 1.5) % 1)) * 0.8 * this.fade;
      this.beamTip.visible = true;
    } else {
      this.beam.visible = false;
      this.beamTip.visible = false;
    }
  }
}
