import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';

/** Top bar: money, reputation stars, stock count, overview and order-board toggles. */
export class Hud {
  private moneyEl: HTMLElement;
  private repEl: HTMLElement;
  private stockEl: HTMLElement;
  private overviewBtn: HTMLButtonElement;
  private boardBadge: HTMLElement;
  private workerBadge: HTMLElement;
  onWorkersToggle: (() => void) | null = null;
  onBoardToggle: (() => void) | null = null;
  onOverviewToggle: (() => void) | null = null;

  constructor(state: GameState, bus: EventBus) {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = 'ui';
    hud.innerHTML =
      `<div class="chip" id="money-chip">€<span>0</span></div>` +
      `<div class="chip" id="rep-chip"></div>` +
      `<div class="chip" id="stock-chip">📦 <span>0/0</span></div>` +
      `<div class="hud-btns">` +
      `<button id="overview-toggle" aria-label="Overview">🗺️</button>` +
      `<button id="workers-toggle" aria-label="Workers">👷<span class="badge count" hidden>0</span></button>` +
      `<button id="board-toggle">📋<span class="badge" hidden>0</span></button>` +
      `</div>`;
    document.body.appendChild(hud);
    this.moneyEl = hud.querySelector('#money-chip span')!;
    this.repEl = hud.querySelector('#rep-chip')!;
    this.stockEl = hud.querySelector('#stock-chip span')!;
    this.overviewBtn = hud.querySelector('#overview-toggle')!;
    this.boardBadge = hud.querySelector('#board-toggle .badge')!;
    this.workerBadge = hud.querySelector('#workers-toggle .badge')!;
    hud.querySelector('#workers-toggle')!.addEventListener('click', () => this.onWorkersToggle?.());
    hud.querySelector('#board-toggle')!.addEventListener('click', () => this.onBoardToggle?.());
    this.overviewBtn.addEventListener('click', () => this.onOverviewToggle?.());

    bus.on('moneyChanged', ({ money }) => {
      this.moneyEl.textContent = Math.floor(money).toLocaleString('en');
      const chip = document.getElementById('money-chip')!;
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    });
    bus.on('reputationChanged', ({ rep }) => this.setRep(rep));
    bus.on('stockChanged', ({ stock, capacity }) => {
      this.stockEl.textContent = `${stock}/${capacity}`;
    });

    this.moneyEl.textContent = Math.floor(state.money).toLocaleString('en');
    this.setRep(state.reputation);
    this.stockEl.textContent = `${state.stock}/${state.capacity}`;
  }

  setWorkerCount(n: number): void {
    this.workerBadge.hidden = n === 0;
    this.workerBadge.textContent = String(n);
  }

  setBoardCount(n: number): void {
    this.boardBadge.hidden = n === 0;
    this.boardBadge.textContent = String(n);
  }

  setOverview(on: boolean): void {
    this.overviewBtn.classList.toggle('on', on);
    this.overviewBtn.textContent = on ? '✕' : '🗺️';
    document.body.classList.toggle('overview', on);
  }

  private setRep(rep: number): void {
    const full = Math.round(rep);
    this.repEl.textContent = '★'.repeat(full) + '☆'.repeat(5 - full);
  }
}
