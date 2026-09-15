import { GameState } from '../core/GameState';
import { SaveSystem } from '../core/SaveSystem';

/** fps counter + cheats, shown only with ?dev in the URL. */
export class DevPanel {
  private fpsEl: HTMLElement | null = null;
  private frames = 0;
  private acc = 0;

  constructor(state: GameState, save: SaveSystem) {
    if (!location.search.includes('dev')) return;
    const el = document.createElement('div');
    el.id = 'dev-panel';
    el.className = 'ui';
    el.innerHTML = `<span class="fps">-- fps</span><button data-a="money">+€1000</button><button data-a="reset">Reset save</button>`;
    document.body.appendChild(el);
    this.fpsEl = el.querySelector('.fps');
    el.querySelector('[data-a="money"]')!.addEventListener('click', () => state.addMoney(1000));
    el.querySelector('[data-a="reset"]')!.addEventListener('click', () => {
      save.reset();
      location.reload();
    });
  }

  frame(dt: number): void {
    if (!this.fpsEl) return;
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.acc)} fps`;
      this.frames = 0;
      this.acc = 0;
    }
  }
}
