import * as THREE from 'three';
import cam from '../config/camera.json';
import layout from '../config/layout.json';
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
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private clock = 0;
  /** 0 = noon, 0.5 = midnight; only used when the day/night cycle is on */
  dayNight = layout.city.dayNight;
  /** 'auto' lets the fps sampler pick the pixel ratio */
  quality: 'auto' | 'low' | 'medium' | 'high' = 'auto';

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

    this.hemi = new THREE.HemisphereLight(0xd6e8ff, 0x7a705f, 1.25);
    this.ambient = new THREE.AmbientLight(0xffe8c8, 0.35);
    this.scene.add(this.hemi, this.ambient);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  /** graphics quality: pixel ratio and shadows */
  setQuality(q: 'auto' | 'low' | 'medium' | 'high'): void {
    this.quality = q;
    if (q === 'auto') return;
    const ratios = { low: 1, medium: 1.5, high: Math.min(window.devicePixelRatio, 2) };
    this.pixelRatio = ratios[q];
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
  }

  /** the LED lighting upgrade brightens the hall */
  setBrightInterior(on: boolean): void {
    this.ambient.intensity = on ? 0.55 : 0.35;
    this.hemi.intensity = on ? 1.5 : 1.25;
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
    this.updateDayNight(dt);
  }

  /** slow sun/sky cycle; the street and dock lamps are unlit materials so they read as lit at night */
  private updateDayNight(dt: number): void {
    if (!this.dayNight) return;
    this.clock = (this.clock + dt / layout.city.dayLengthSeconds) % 1;
    // a soft cosine day: bright at 0, dark at 0.5
    const day = (Math.cos(this.clock * Math.PI * 2) + 1) / 2;
    const dusk = Math.pow(1 - day, 2);
    this.sun.intensity = 0.25 + day * 2.1;
    this.sun.color.setRGB(1, 0.94 - dusk * 0.25, 0.86 - dusk * 0.35);
    this.hemi.intensity = 0.25 + day * 1.0;
    this.ambient.intensity = 0.12 + day * 0.25;
    const sky = new THREE.Color().setRGB(0.05 + day * 0.61, 0.07 + day * 0.73, 0.16 + day * 0.76);
    (this.scene.background as THREE.Color).copy(sky);
    this.fog.color.copy(sky);
  }

  /** lower the pixel ratio step by step if the phone can't hold the target fps */
  private adaptQuality(dt: number): void {
    if (this.quality !== 'auto') return;
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
