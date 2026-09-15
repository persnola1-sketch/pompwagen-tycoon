import * as THREE from 'three';
import cam from '../config/camera.json';

const DEG = Math.PI / 180;

/**
 * Angled top-down follow camera with pinch/wheel zoom (clamped) and an
 * overview mode that frames the whole yard. Distances are derived from the
 * configured visible ground width (portrait) or depth (landscape).
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  overview = false;

  private zoom = 1;
  private focus = new THREE.Vector3();
  private distance: number;
  private pitch = cam.pitchDeg * DEG;
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(cam.fov, aspect, 0.5, cam.far);
    this.distance = this.followDistance();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** distance that shows `width` metres across (portrait) or `depth` metres (landscape) */
  private fit(width: number, depth: number): number {
    const tanV = Math.tan((cam.fov * DEG) / 2);
    const tanH = tanV * this.camera.aspect;
    return this.camera.aspect < 1 ? width / 2 / tanH : depth / 2 / tanV;
  }

  private baseDistance(): number {
    return this.fit(cam.portraitViewWidth, cam.landscapeViewDepth);
  }

  private followDistance(): number {
    return THREE.MathUtils.clamp(this.baseDistance() * this.zoom, cam.minDistance, cam.maxDistance);
  }

  private overviewDistance(): number {
    return this.fit(cam.overview.viewWidthPortrait, cam.overview.viewDepthLandscape);
  }

  /** factor > 1 zooms out */
  zoomBy(factor: number): void {
    if (this.overview) return;
    const base = this.baseDistance();
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, cam.minDistance / base, cam.maxDistance / base);
  }

  toggleOverview(): void {
    this.overview = !this.overview;
  }

  get currentDistance(): number {
    return this.distance;
  }

  get focusPoint(): THREE.Vector3 {
    return this.focus;
  }

  update(dt: number, player: THREE.Vector3): void {
    const goalFocus = this.overview
      ? new THREE.Vector3(cam.overview.x, 0, cam.overview.z)
      : new THREE.Vector3(player.x, 0, player.z + cam.lookAheadZ);
    const goalDist = this.overview ? this.overviewDistance() : this.followDistance();
    const goalPitch = (this.overview ? cam.overview.pitchDeg : cam.pitchDeg) * DEG;

    if (!this.initialized) {
      this.focus.copy(goalFocus);
      this.distance = goalDist;
      this.initialized = true;
    }
    const kf = Math.min(1, dt * (this.overview ? 3 : cam.followLerp));
    const kz = Math.min(1, dt * cam.zoomLerp * (this.overview ? 0.5 : 1));
    this.focus.lerp(goalFocus, kf);
    this.distance += (goalDist - this.distance) * kz;
    this.pitch += (goalPitch - this.pitch) * kz;

    this.camera.position.set(
      this.focus.x,
      Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.pitch) * this.distance,
    );
    this.camera.lookAt(this.focus);
  }
}
