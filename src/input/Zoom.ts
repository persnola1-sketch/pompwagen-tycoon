import cam from '../config/camera.json';
import { Joystick } from './Joystick';

function isUiTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && !!t.closest('.ui');
}

/**
 * Two-finger pinch and mouse-wheel zoom. A second finger cancels the joystick
 * and keeps it blocked until every finger is lifted, so pinching never drives.
 */
export class Zoom {
  /** factor > 1 = zoom out */
  onZoom: ((factor: number) => void) | null = null;

  private pinching = false;
  private lastDist = 0;

  constructor(private joystick: Joystick) {
    window.addEventListener('touchstart', this.onStart, { passive: false });
    window.addEventListener('touchmove', this.onMove, { passive: false });
    window.addEventListener('touchend', this.onEnd);
    window.addEventListener('touchcancel', this.onEnd);
    window.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private static spread(e: TouchEvent): number {
    const a = e.touches[0];
    const b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  private onStart = (e: TouchEvent): void => {
    if (e.touches.length < 2) return;
    this.joystick.cancel();
    this.pinching = true;
    this.lastDist = Zoom.spread(e);
    e.preventDefault();
  };

  private onMove = (e: TouchEvent): void => {
    if (!this.pinching || e.touches.length < 2) return;
    e.preventDefault();
    const d = Zoom.spread(e);
    if (d > 0 && this.lastDist > 0) this.onZoom?.(this.lastDist / d);
    this.lastDist = d;
  };

  private onEnd = (e: TouchEvent): void => {
    if (e.touches.length < 2) this.pinching = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (isUiTarget(e.target)) return;
    e.preventDefault();
    this.onZoom?.(Math.exp(e.deltaY * cam.wheelSensitivity));
  };
}
