/** Floating touch joystick: appears where the thumb lands, anywhere on screen. */
export class Joystick {
  /** normalized direction, length 0..1 */
  x = 0;
  y = 0;
  active = false;

  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private originX = 0;
  private originY = 0;
  private touchId: number | null = null;
  private readonly radius = 52;

  constructor() {
    this.base = document.createElement('div');
    this.base.style.cssText =
      'position:fixed;width:104px;height:104px;border-radius:50%;border:2px solid rgba(255,255,255,0.35);' +
      'background:rgba(255,255,255,0.08);backdrop-filter:blur(2px);display:none;z-index:40;pointer-events:none;' +
      'transform:translate(-50%,-50%);';
    this.knob = document.createElement('div');
    this.knob.style.cssText =
      'position:absolute;left:50%;top:50%;width:46px;height:46px;border-radius:50%;' +
      'background:rgba(255,255,255,0.55);transform:translate(-50%,-50%);';
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);

    window.addEventListener('touchstart', this.onStart, { passive: false });
    window.addEventListener('touchmove', this.onMove, { passive: false });
    window.addEventListener('touchend', this.onEnd);
    window.addEventListener('touchcancel', this.onEnd);

    // desktop: mouse drag
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  private isUiTarget(t: EventTarget | null): boolean {
    return t instanceof HTMLElement && !!t.closest('.ui');
  }

  private begin(x: number, y: number): void {
    this.originX = x;
    this.originY = y;
    this.active = true;
    this.base.style.display = 'block';
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.knob.style.transform = 'translate(-50%,-50%)';
  }

  private track(x: number, y: number): void {
    let dx = x - this.originX;
    let dy = y - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.x = dx / this.radius;
    this.y = dy / this.radius;
  }

  private finish(): void {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.base.style.display = 'none';
    this.touchId = null;
  }

  private onStart = (e: TouchEvent): void => {
    if (this.isUiTarget(e.target)) return;
    e.preventDefault();
    if (this.touchId !== null) return;
    const t = e.changedTouches[0];
    this.touchId = t.identifier;
    this.begin(t.clientX, t.clientY);
  };

  private onMove = (e: TouchEvent): void => {
    if (this.touchId === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.touchId) {
        e.preventDefault();
        this.track(t.clientX, t.clientY);
      }
    }
  };

  private onEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.touchId) this.finish();
    }
  };

  private mouseDown = false;
  private onMouseDown = (e: MouseEvent): void => {
    if (this.isUiTarget(e.target)) return;
    this.mouseDown = true;
    this.begin(e.clientX, e.clientY);
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (this.mouseDown) this.track(e.clientX, e.clientY);
  };
  private onMouseUp = (): void => {
    if (this.mouseDown) {
      this.mouseDown = false;
      this.finish();
    }
  };
}
