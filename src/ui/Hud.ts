import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';

/** Top bar: money, reputation stars, stock count, order-board toggle. */
export class Hud {
  private moneyEl: HTMLElement;
  private repEl: HTMLElement;
  private stockEl: HTMLElement;
  onBoardToggle: (() => void) | null = null;

  constructor(state: GameState, bus: EventBus) {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = 'ui';
    hud.innerHTML =
      `<div class="chip" id="money-chip">€<span>0</span></div>` +
      `<div class="chip" id="rep-chip"></div>` +
      `<div class="chip" id="stock-chip">📦 <span>0/0</span></div>` +
      `<button id="board-toggle">Orders ▾</button>`;
    document.body.appendChild(hud);
    this.moneyEl = hud.querySelector('#money-chip span')!;
    this.repEl = hud.querySelector('#rep-chip')!;
    this.stockEl = hud.querySelector('#stock-chip span')!;
    hud.querySelector('#board-toggle')!.addEventListener('click', () => this.onBoardToggle?.());

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

  private setRep(rep: number): void {
    const full = Math.round(rep);
    this.repEl.textContent = '★'.repeat(full) + '☆'.repeat(5 - full);
  }
}
