import * as THREE from 'three';

export class SceneRoot {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private followTarget = new THREE.Vector3();
  private camGoal = new THREE.Vector3();

  /** camera offset: angled top-down (~55°), pulled back further in portrait */
  private baseOffset = new THREE.Vector3(0, 14, 9.5);

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x9fc4e8);
    this.scene.fog = new THREE.Fog(0x9fc4e8, 60, 140);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.5, 220);
    this.camera.position.set(0, 16, 12);
    this.camera.lookAt(0, 0, 0);

    // warm interior key light (single shadow caster)
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    sun.position.set(10, 22, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -26;
    sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 26;
    sun.shadow.camera.bottom = -26;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);
    this.scene.add(sun.target);

    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b6458, 1.05);
    this.scene.add(hemi);

    const amb = new THREE.AmbientLight(0xffe8c8, 0.4);
    this.scene.add(amb);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // pull back more in portrait so the aisle width fits
    const portrait = h > w;
    this.baseOffset.set(0, portrait ? 13 : 11, portrait ? 12 : 10);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  follow(target: THREE.Vector3, dt: number): void {
    this.followTarget.lerp(target, Math.min(1, dt * 5));
    this.camGoal.copy(this.followTarget).add(this.baseOffset);
    this.camera.position.lerp(this.camGoal, Math.min(1, dt * 5));
    this.camera.lookAt(this.followTarget.x, this.followTarget.y, this.followTarget.z - 1.5);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
