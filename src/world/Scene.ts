import * as THREE from 'three';
import cam from '../config/camera.json';
import { CameraRig } from './CameraRig';

const SHADOW_MAP = 1024;

export class SceneRoot {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly rig: CameraRig;
  private sun: THREE.DirectionalLight;
  private fog: THREE.Fog;
  private shadowExtent = cam.shadowExtent;

  private pixelRatio: number;
  private fpsTime = 0;
  private fpsFrames = 0;
  private warmup = 5;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    const sky = 0xa9cdea;
    this.scene.background = new THREE.Color(sky);
    this.fog = new THREE.Fog(sky, cam.fogNear, cam.fogFar);
    this.scene.fog = this.fog;

    this.rig = new CameraRig(window.innerWidth / window.innerHeight);

    // the single shadow caster; follows the camera focus so shadows stay sharp
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.02;
    this.setShadowExtent(this.shadowExtent);
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x7a705f, 1.25));
    this.scene.add(new THREE.AmbientLight(0xffe8c8, 0.35));

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  private setShadowExtent(e: number): void {
    const c = this.sun.shadow.camera;
    c.left = -e;
    c.right = e;
    c.top = e;
    c.bottom = -e;
    c.near = 1;
    c.far = 120;
    c.updateProjectionMatrix();
    this.shadowExtent = e;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.rig.setAspect(w / h);
    this.renderer.setSize(w, h);
  }

  update(dt: number, player: THREE.Vector3): void {
    this.rig.update(dt, player);
    const dist = this.rig.currentDistance;

    const want = THREE.MathUtils.clamp(dist * 0.55, cam.shadowExtent, 80);
    if (Math.abs(want - this.shadowExtent) > 2) this.setShadowExtent(want);
    // snap to shadow texels to avoid shimmering while moving
    const texel = (this.shadowExtent * 2) / SHADOW_MAP;
    const f = this.rig.focusPoint;
    const fx = Math.round(f.x / texel) * texel;
    const fz = Math.round(f.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + 16, 34, fz + 10);

    this.fog.near = cam.fogNear + dist * 0.8;
    this.fog.far = cam.fogFar + dist * 1.6;

    this.adaptQuality(dt);
  }

  /** lower the pixel ratio step by step if the phone can't hold the target fps */
  private adaptQuality(dt: number): void {
    const q = cam.adaptiveQuality;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime < q.sampleSeconds) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    if (fps < q.lowFps && this.pixelRatio > q.minPixelRatio) {
      this.pixelRatio = Math.max(q.minPixelRatio, this.pixelRatio - q.step);
      this.renderer.setPixelRatio(this.pixelRatio);
    }
  }

  get currentPixelRatio(): number {
    return this.pixelRatio;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
