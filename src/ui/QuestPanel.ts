import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Quest, QuestTab, Quests } from '../core/quests/Quests';

const eur = (n: number): string => `€${n.toLocaleString('en')}`;
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.max(0, Math.ceil(s % 60)) % 60).padStart(2, '0')}`;

/**
 * Quest panel with Story / Daily / Achievements tabs, progress bars, claim
 * buttons and the company level bar. Timed client requests sit at the top of
 * the story tab so they are impossible to miss.
 */
export class QuestPanel {
  private el: HTMLElement;
  private body: HTMLElement;
  private tab: QuestTab = 'story';
  onClose: (() => void) | null = null;
  onClaim: ((q: Quest, el: HTMLElement, doubled: boolean) => void) | null = null;

  constructor(private quests: Quests, private state: GameState, bus: EventBus) {
    this.el = document.createElement('div');
    this.el.id = 'quest-panel';
    this.el.className = 'ui sheet';
    this.el.innerHTML =
      `<div class="sheet-head"><div class="tabs">` +
      `<button data-tab="story" class="on">Story</button><button data-tab="daily">Daily</button><button data-tab="achievements">Badges</button>` +
      `</div><button class="close" aria-label="Close">✕</button></div>` +
      `<div class="level-bar"><span class="lv"></span><div class="xp"><i></i><span></span></div></div>` +
      `<div class="sheet-body"></div>`;
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('.sheet-body')!;
    this.el.hidden = true;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close());
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.tabs button')) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as QuestTab;
        for (const o of this.el.querySelectorAll('.tabs button')) o.classList.toggle('on', o === b);
        this.render();
      });
    }
    this.body.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-claim]');
      if (!btn) return;
      const q = this.quests.all.find((x) => x.defId === btn.dataset.claim);
      if (q) this.onClaim?.(q, btn, btn.dataset.double === '1');
    });
    bus.on('questsChanged', () => this.render());
    bus.on('companyXpChanged', () => this.renderLevel());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(tab?: QuestTab): void {
    if (tab) {
      this.tab = tab;
      for (const o of this.el.querySelectorAll<HTMLButtonElement>('.tabs button')) o.classList.toggle('on', o.dataset.tab === tab);
    }
    this.el.hidden = false;
    this.render();
  }

  close(): void {
    this.el.hidden = true;
    this.onClose?.();
  }

  toggle(): void {
    if (this.el.hidden) this.open();
    else this.close();
  }

  /** once a second: client quest countdowns */
  tick(): void {
    if (this.el.hidden) return;
    for (const el of this.body.querySelectorAll<HTMLElement>('[data-timer]')) {
      const q = this.quests.client.find((c) => c.defId === el.dataset.timer);
      el.textContent = q ? `⏱ ${clock(q.expiresIn ?? 0)}` : '';
    }
  }

  private renderLevel(): void {
    const { into, need } = this.quests.levelProgress();
    (this.el.querySelector('.level-bar .lv') as HTMLElement).textContent = `LV ${this.state.companyLevel}`;
    const bar = this.el.querySelector('.level-bar .xp i') as HTMLElement;
    const txt = this.el.querySelector('.level-bar .xp span') as HTMLElement;
    bar.style.width = `${Math.min(100, (into / need) * 100)}%`;
    txt.textContent = `${into} / ${need} XP`;
  }

  render(): void {
    if (this.el.hidden) return;
    this.renderLevel();
    const list = this.tab === 'story' ? [...this.quests.client, ...this.quests.story] : this.tab === 'daily' ? this.quests.daily : this.quests.achievements;
    const rows = list.filter((q) => !(q.claimed && q.tab !== 'achievements')).map((q) => this.row(q));
    this.body.innerHTML = rows.length ? rows.join('') : `<div class="note">${this.tab === 'story' ? 'Every story goal is done — legend!' : 'Nothing here right now.'}</div>`;
  }

  private row(q: Quest): string {
    const p = this.quests.progress(q);
    const done = p >= q.target;
    const pct = Math.round((p / q.target) * 100);
    const timer = q.tab === 'client' ? `<span class="qtimer" data-timer="${q.defId}">⏱ ${clock(q.expiresIn ?? 0)}</span>` : '';
    const reward = `<span class="qreward">${eur(q.money)} · ${q.xp} XP${q.rep ? ` · +${q.rep}★` : ''}</span>`;
    const button = q.claimed
      ? `<button disabled class="claimed">✔</button>`
      : done
        ? `<div class="qclaim"><button class="ad" data-claim="${q.defId}" data-double="1">📺 ×2</button><button class="primary" data-claim="${q.defId}">Claim</button></div>`
        : `<button disabled>${pct}%</button>`;
    return `<div class="qcard ${done && !q.claimed ? 'ready' : ''} ${q.tab === 'client' ? 'client' : ''}">
      <div class="qinfo">
        <div class="qtitle">${q.badge ? `${q.badge} ` : ''}${esc(q.title)} ${timer}</div>
        <div class="qdesc">${esc(q.desc)}</div>
        <div class="qbar"><i style="width:${pct}%"></i><span>${p.toLocaleString('en')} / ${q.target.toLocaleString('en')}</span></div>
        ${reward}
      </div>
      ${button}
    </div>`;
  }
}
