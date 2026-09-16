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
      `<button id="settings-toggle" aria-label="Settings">⚙️</button>` +
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
    btns.querySelector('#settings-toggle')!.addEventListener('click', () => this.onSettings?.());

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

    bus.on('moneyChanged', ({ money, delta }) => {
      this.rollTo(money);
      if (delta > 0) this.coinBurst(Math.min(8, 2 + Math.floor(delta / 120)));
      const chip = document.getElementById('money-chip')!;
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    });
    bus.on('reputationChanged', ({ rep }) => this.setRep(rep));
    bus.on('stockChanged', ({ stock, capacity }) => {
      this.stockEl.textContent = `${stock}/${capacity}`;
    });

    this.shown = state.money;
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

  private shown = 0;
  private target = 0;
  private raf = 0;

  /** roll the money counter up (or down) instead of snapping */
  private rollTo(value: number): void {
    this.target = value;
    if (this.raf) return;
    let last = performance.now();
    const step = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const diff = this.target - this.shown;
      this.shown += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 9);
      this.moneyEl.textContent = Math.floor(this.shown).toLocaleString('en');
      if (Math.abs(this.target - this.shown) < 0.5) {
        this.shown = this.target;
        this.moneyEl.textContent = Math.floor(this.shown).toLocaleString('en');
        this.raf = 0;
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** coins flying from the middle of the screen into the money chip */
  private coinBurst(n: number): void {
    const chip = document.getElementById('money-chip');
    if (!chip) return;
    const to = chip.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'flycoin';
      const fromX = window.innerWidth / 2 + (Math.random() - 0.5) * 120;
      const fromY = window.innerHeight * 0.45 + (Math.random() - 0.5) * 80;
      el.style.left = `${fromX}px`;
      el.style.top = `${fromY}px`;
      document.body.appendChild(el);
      const dx = to.left + to.width / 2 - fromX;
      const dy = to.top + to.height / 2 - fromY;
      requestAnimationFrame(() => {
        el.style.transitionDelay = `${i * 0.045}s`;
        el.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
        el.style.opacity = '0.2';
      });
      setTimeout(() => el.remove(), 900 + i * 45);
    }
  }

  /** the settings button sits with the other HUD buttons */
  onSettings: (() => void) | null = null;

  private setRep(rep: number): void {
    const full = Math.round(rep);
    this.repEl.textContent = '★'.repeat(full) + '☆'.repeat(5 - full);
  }
}
