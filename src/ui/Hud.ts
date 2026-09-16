import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';

/** Top bar: money, reputation stars, stock count, overview and order-board toggles. */
export class Hud {
  /** container for the small stacked widgets on the left */
  static leftStack: HTMLElement | null = null;
  private moneyEl: HTMLElement;
  private repEl: HTMLElement;
  private stockEl: HTMLElement;
  private overviewBtn: HTMLButtonElement;
  private boardBadge: HTMLElement;
  private workerBadge: HTMLElement;
  private questBadge!: HTMLElement;
  private levelEl!: HTMLElement;
  private levelBar!: HTMLElement;
  private tracked!: HTMLElement;
  onQuestsToggle: (() => void) | null = null;
  onWorkersToggle: (() => void) | null = null;
  onBoardToggle: (() => void) | null = null;
  onOverviewToggle: (() => void) | null = null;

  constructor(state: GameState, bus: EventBus) {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = 'ui';
    hud.innerHTML =
      `<div class="chips">` +
      `<div class="chip" id="money-chip">€<span>0</span></div>` +
      `<div class="chip" id="level-chip">LV <span>1</span><i class="lvbar"><b></b></i></div>` +
      `<div class="chip" id="rep-chip"></div>` +
      `<div class="chip" id="stock-chip">📦 <span>0/0</span></div>` +
      `</div><div class="hud-btns ui">` +
      `<button id="overview-toggle" aria-label="Overview">🗺️</button>` +
      `<button id="workers-toggle" aria-label="Workers">👷<span class="badge count" hidden>0</span></button>` +
      `<button id="quests-toggle" aria-label="Quests">🎯<span class="badge" hidden>0</span></button>` +
      `<button id="board-toggle">📋<span class="badge" hidden>0</span></button>` +
      `</div>`;
    document.body.appendChild(hud);
    // the button column lives outside the chip row so both stay clear of the cards
    const btns = hud.querySelector('.hud-btns') as HTMLElement;
    document.body.appendChild(btns);
    this.moneyEl = hud.querySelector('#money-chip span')!;
    this.repEl = hud.querySelector('#rep-chip')!;
    this.stockEl = hud.querySelector('#stock-chip span')!;
    this.levelEl = hud.querySelector('#level-chip span')!;
    this.levelBar = hud.querySelector('#level-chip .lvbar b')!;
    this.overviewBtn = btns.querySelector('#overview-toggle')!;
    this.boardBadge = btns.querySelector('#board-toggle .badge')!;
    this.workerBadge = btns.querySelector('#workers-toggle .badge')!;
    this.questBadge = btns.querySelector('#quests-toggle .badge')!;
    btns.querySelector('#workers-toggle')!.addEventListener('click', () => this.onWorkersToggle?.());
    btns.querySelector('#quests-toggle')!.addEventListener('click', () => this.onQuestsToggle?.());
    btns.querySelector('#board-toggle')!.addEventListener('click', () => this.onBoardToggle?.());

    // left stack: construction timers and the tracked quest, above the joystick
    const stack = document.createElement('div');
    stack.id = 'left-stack';
    stack.className = 'ui';
    document.body.appendChild(stack);
    Hud.leftStack = stack;

    this.tracked = document.createElement('div');
    this.tracked.id = 'tracked-quest';
    this.tracked.hidden = true;
    this.tracked.addEventListener('click', () => this.onQuestsToggle?.());
    stack.appendChild(this.tracked);
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

  setQuestCount(n: number): void {
    this.questBadge.hidden = n === 0;
    this.questBadge.textContent = String(n);
  }

  setLevel(level: number, into: number, need: number): void {
    this.levelEl.textContent = String(level);
    this.levelBar.style.width = `${Math.min(100, (into / need) * 100)}%`;
  }

  /** the small tracked-quest widget under the HUD */
  setTracked(title: string | null, progress: number, target: number, ready: boolean): void {
    if (!title) {
      this.tracked.hidden = true;
      return;
    }
    this.tracked.hidden = false;
    this.tracked.classList.toggle('ready', ready);
    const pct = Math.min(100, Math.round((progress / target) * 100));
    this.tracked.innerHTML =
      `<div class="tq-title">🎯 ${title}</div>` +
      `<div>${ready ? 'Reward ready — tap to claim!' : `${progress.toLocaleString('en')} / ${target.toLocaleString('en')}`}</div>` +
      `<div class="tq-bar"><i style="width:${pct}%"></i></div>`;
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
