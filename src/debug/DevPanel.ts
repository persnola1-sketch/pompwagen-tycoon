import * as THREE from 'three';
import { GameState } from '../core/GameState';
import { SaveSystem } from '../core/SaveSystem';

/** fps / draw calls / pixel ratio + cheats, shown only with ?dev in the URL. */
export class DevPanel {
  onLevel: (() => void) | null = null;
  onFinishTimers: (() => void) | null = null;
  onEvent: (() => void) | null = null;
  onSkipTutorial: (() => void) | null = null;
  private fpsEl: HTMLElement | null = null;
  private frames = 0;
  private acc = 0;

  constructor(state: GameState, save: SaveSystem, private renderer: THREE.WebGLRenderer) {
    if (!location.search.includes('dev')) return;
    const el = document.createElement('div');
    el.id = 'dev-panel';
    el.className = 'ui';
    el.innerHTML =
      `<span class="fps">-- fps</span>` +
      `<button data-a="money">+€10k</button>` +
      `<button data-a="ship">+10 shipped</button>` +
      `<button data-a="level">+LV</button>` +
      `<button data-a="timers">Finish timers</button>` +
      `<button data-a="event">Event</button>` +
      `<button data-a="skip">Skip tut</button>` +
      `<button data-a="reset">Reset save</button>`;
    document.body.appendChild(el);
    this.fpsEl = el.querySelector('.fps');
    el.querySelector('[data-a="money"]')!.addEventListener('click', () => state.addMoney(10000));
    el.querySelector('[data-a="ship"]')!.addEventListener('click', () => state.addShipped(10));
    el.querySelector('[data-a="level"]')!.addEventListener('click', () => this.onLevel?.());
    el.querySelector('[data-a="timers"]')!.addEventListener('click', () => this.onFinishTimers?.());
    el.querySelector('[data-a="event"]')!.addEventListener('click', () => this.onEvent?.());
    el.querySelector('[data-a="skip"]')!.addEventListener('click', () => this.onSkipTutorial?.());
    el.querySelector('[data-a="reset"]')!.addEventListener('click', () => {
      save.reset();
      window.onbeforeunload = null;
      location.reload();
    });
  }

  frame(dt: number): void {
    if (!this.fpsEl) return;
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      const info = this.renderer.info.render;
      this.fpsEl.textContent = `${Math.round(this.frames / this.acc)} fps · ${info.calls} calls · ${Math.round(info.triangles / 1000)}k tris · dpr ${this.renderer.getPixelRatio()}`;
      this.frames = 0;
      this.acc = 0;
    }
  }
}
