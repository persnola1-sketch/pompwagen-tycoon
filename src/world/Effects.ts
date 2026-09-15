import * as THREE from 'three';

interface Coin {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
}

interface Puff {
  mesh: THREE.Mesh;
  t: number;
  size: number;
}

interface Spark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  t: number;
}

/** Coin-fly effects, dust puffs, welding sparks and the bouncing guide arrow. */
export class Effects {
  readonly group = new THREE.Group();
  private coins: Coin[] = [];
  private puffs: Puff[] = [];
  private sparkList: Spark[] = [];
  private coinGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10);
  private coinMat = new THREE.MeshStandardMaterial({ color: 0xf2c018, roughness: 0.3, metalness: 0.7 });
  private puffGeo = new THREE.SphereGeometry(0.14, 6, 6);
  private puffMat = new THREE.MeshBasicMaterial({ color: 0xcfcabc, transparent: true, opacity: 0.5 });
  private sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
  private arrow: THREE.Mesh;
  private arrowTarget: THREE.Vector3 | null = null;
  private time = 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.lineTo(0.45, 0.1);
    shape.lineTo(0.18, 0.1);
    shape.lineTo(0.18, 0.6);
    shape.lineTo(-0.18, 0.6);
    shape.lineTo(-0.18, 0.1);
    shape.lineTo(-0.45, 0.1);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
    this.arrow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x38d15e }));
    this.arrow.rotation.x = Math.PI / 2;
    this.arrow.scale.setScalar(1.8);
    this.arrow.visible = false;
    this.group.add(this.arrow);
  }

  coinFly(from: THREE.Vector3, to: THREE.Vector3): void {
    if (this.coins.length > 24) return;
    const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
    mesh.position.copy(from);
    this.group.add(mesh);
    this.coins.push({ mesh, from: from.clone(), to: to.clone(), t: 0 });
  }

  dust(x: number, z: number, size = 1): void {
    if (this.puffs.length > 60) return;
    const mesh = new THREE.Mesh(this.puffGeo, this.puffMat.clone());
    mesh.position.set(x + (Math.random() - 0.5) * 0.3 * size, 0.08, z + (Math.random() - 0.5) * 0.3 * size);
    this.group.add(mesh);
    this.puffs.push({ mesh, t: 0, size });
  }

  sparks(x: number, y: number, z: number, n = 8): void {
    if (this.sparkList.length > 80) return;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      this.sparkList.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4),
        t: 0,
      });
    }
  }

  setGuide(target: THREE.Vector3 | null): void {
    this.arrowTarget = target;
    this.arrow.visible = !!target;
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt * 2.2;
      if (c.t >= 1) {
        this.group.remove(c.mesh);
        this.coins.splice(i, 1);
        continue;
      }
      const e = c.t;
      c.mesh.position.lerpVectors(c.from, c.to, e);
      c.mesh.position.y += Math.sin(e * Math.PI) * 0.9;
      c.mesh.rotation.y += dt * 12;
      c.mesh.rotation.x += dt * 8;
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt * 2.5;
      if (p.t >= 1) {
        this.group.remove(p.mesh);
        this.puffs.splice(i, 1);
        continue;
      }
      p.mesh.scale.setScalar((1 + p.t * 2) * p.size);
      p.mesh.position.y += dt * 0.6 * p.size;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - p.t);
    }
    for (let i = this.sparkList.length - 1; i >= 0; i--) {
      const s = this.sparkList[i];
      s.t += dt;
      if (s.t >= 0.7) {
        this.group.remove(s.mesh);
        this.sparkList.splice(i, 1);
        continue;
      }
      s.vel.y -= 9 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.scale.setScalar(1 - s.t);
    }
    if (this.arrowTarget) {
      this.arrow.position.set(this.arrowTarget.x, 2.6 + Math.sin(this.time * 4) * 0.35, this.arrowTarget.z);
    }
  }
}
