import cfg from '../config/workers.json';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Workers } from '../core/workers/Workers';
import { Worker, roleDef, traitDef, xpForLevel } from '../core/workers/WorkerTypes';
import { portraitSvg, stars } from './Portrait';

const eur = (n: number): string => `€${n.toLocaleString('en')}`;
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * Workers menu: candidate cards to hire (free refresh timer or a fee), the
 * team list with level / XP bar / trait / shift / stats, temp workers and
 * the office clerk's rules.
 */
export class WorkersPanel {
  private el: HTMLElement;
  private body: HTMLElement;
  private tab: 'hire' | 'team' = 'hire';
  onClose: (() => void) | null = null;
  onAction: (() => void) | null = null;
  onTempAd: (() => void) | null = null;
  onTrainAd: ((workerId: number) => void) | null = null;

  constructor(private workers: Workers, private state: GameState, bus: EventBus) {
    this.el = document.createElement('div');
    this.el.id = 'workers-panel';
    this.el.className = 'ui sheet';
    this.el.innerHTML =
      `<div class="sheet-head"><div class="tabs"><button data-tab="hire" class="on">Hire</button><button data-tab="team">Team</button></div>` +
      `<button class="close" aria-label="Close">✕</button></div><div class="sheet-body"></div>`;
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('.sheet-body')!;
    this.el.hidden = true;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close());
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.tabs button')) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as 'hire' | 'team';
        for (const o of this.el.querySelectorAll('.tabs button')) o.classList.toggle('on', o === b);
        this.render();
      });
    }
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('change', (e) => this.onChange(e));
    bus.on('workersChanged', () => this.render());
    bus.on('moneyChanged', () => {
      if (!this.el.hidden) this.refreshAffordable();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(tab?: 'hire' | 'team'): void {
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

  /** once a second: refresh timer + training countdowns */
  tick(): void {
    if (this.el.hidden) return;
    const t = this.body.querySelector('.refresh-timer');
    if (t) t.textContent = this.refreshLabel();
    for (const el of this.body.querySelectorAll<HTMLElement>('[data-training]')) {
      const w = this.workers.byId(Number(el.dataset.training));
      if (w) el.textContent = w.trainingLeft > 0 ? `🎓 training ${Math.ceil(w.trainingLeft)}s` : '✔ certified';
    }
  }

  private refreshLabel(): string {
    const s = Math.ceil(this.workers.refreshLeft);
    return `free in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private refreshAffordable(): void {
    for (const b of this.body.querySelectorAll<HTMLButtonElement>('button[data-cost]')) {
      b.disabled = Number(b.dataset.cost) > this.state.money;
    }
  }

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const id = Number(b.dataset.id ?? -1);
    if (a === 'hire') this.workers.hire(id);
    else if (a === 'refresh') this.workers.refreshCandidates(this.state.forklift, true);
    else if (a === 'temp') this.workers.hireTemp();
    else if (a === 'tempAd') this.onTempAd?.();
    else if (a === 'trainAd') this.onTrainAd?.(id);
    else if (a === 'fire' && confirm('Let this worker go?')) this.workers.fire(id);
    else if (a === 'shift') this.workers.setShift(id, b.dataset.shift as 'day' | 'night');
    this.onAction?.();
    this.render();
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement;
    const rule = el.dataset.rule;
    if (!rule) return;
    const r = this.workers.clerkRules as unknown as Record<string, number | boolean>;
    r[rule] = el.type === 'checkbox' ? el.checked : Number(el.value);
    this.onAction?.();
  }

  render(): void {
    if (this.el.hidden) return;
    this.body.innerHTML = this.tab === 'hire' ? this.renderHire() : this.renderTeam();
    this.refreshAffordable();
  }

  private renderHire(): string {
    const w = this.workers;
    const cards = w.candidates.map((c, i) => {
      const t = traitDef(c.trait);
      const role = roleDef(c.role);
      return `<div class="wcard">
        <div class="portrait">${portraitSvg(c.look, 52)}</div>
        <div class="info">
          <div class="name">${esc(c.name)} <span class="stars">${stars(c.stars)}</span></div>
          <div class="role">${role.emoji} ${role.name} <span class="muted">· ${role.desc}</span></div>
          <div class="trait">${t.emoji} <b>${t.name}</b> <span class="muted">${t.desc}</span></div>
          <div class="meta">Level ${c.level} · wage ${eur(c.wage)} / shift</div>
        </div>
        <button class="primary" data-a="hire" data-id="${i}" data-cost="${c.hireCost}">Hire<br><b>${eur(c.hireCost)}</b></button>
      </div>`;
    });
    const tempUnlocked = w.count >= cfg.temp.unlockWorkers;
    const full = w.count >= cfg.maxWorkers;
    return `
      <div class="row-between">
        <div><b>Candidates</b> <span class="muted">${w.count}/${cfg.maxWorkers} hired</span></div>
        <button data-a="refresh" data-cost="${cfg.refreshFee}" class="small">🔄 Refresh ${eur(cfg.refreshFee)} <span class="muted refresh-timer">${this.refreshLabel()}</span></button>
      </div>
      ${full ? '<div class="note">Your team is full.</div>' : cards.join('')}
      <div class="temp-row ${tempUnlocked ? '' : 'locked'}">
        <div><b>⏱ Temp worker</b><br><span class="muted">${tempUnlocked ? `Extra hands for ${cfg.temp.seconds / 60} minutes during a rush` : `Unlocks with ${cfg.temp.unlockWorkers} workers`}</span></div>
        <div class="btns-col">
          <button data-a="temp" data-cost="${cfg.temp.fee}" ${tempUnlocked ? '' : 'disabled'}>${eur(cfg.temp.fee)}</button>
          <button data-a="tempAd" class="ad" ${tempUnlocked ? '' : 'disabled'}>📺 Free</button>
        </div>
      </div>`;
  }

  private renderTeam(): string {
    const list = this.workers.workers;
    if (!list.length) return `<div class="note">No workers yet. Hire your first one in the Hire tab!</div>`;
    const rows = list.map((w) => this.workerRow(w));
    const clerk = this.workers.hasRole('clerk') ? this.renderClerkRules() : '';
    return rows.join('') + clerk;
  }

  workerRow(w: Worker): string {
    const t = traitDef(w.trait);
    const role = roleDef(w.role);
    const need = xpForLevel(w.level);
    const pct = Math.min(100, Math.round((w.xp / need) * 100));
    const temp = w.tempLeft !== null;
    const training = w.role === 'forklift' ? `<span data-training="${w.id}">${w.trainingLeft > 0 ? `🎓 training ${Math.ceil(w.trainingLeft)}s` : '✔ certified'}</span>` : '';
    const trainAd = w.trainingLeft > 0 ? `<button data-a="trainAd" data-id="${w.id}" class="ad small">📺 Finish training</button>` : '';
    return `<div class="wcard team">
      <div class="portrait">${portraitSvg(w.look, 52)}<div class="lvl">LV ${w.level}</div></div>
      <div class="info">
        <div class="name">${esc(w.name)} <span class="stars">${stars(w.stars)}</span></div>
        <div class="role">${role.emoji} ${role.name} · ${t.emoji} ${t.name} ${training}</div>
        <div class="xp"><i style="width:${pct}%"></i><span>${w.xp}/${need} XP</span></div>
        <div class="meta">📦 ${w.stats.moved} moved · ${w.stats.shifts} shifts · wage ${eur(w.wage)}${w.stats.drops ? ` · 💥 ${w.stats.drops} drops` : ''}${temp ? ` · leaves in ${Math.ceil((w.tempLeft ?? 0) / 60)} min` : ''}</div>
        ${trainAd}
        ${temp ? '' : `<div class="shift-toggle">
          <button data-a="shift" data-id="${w.id}" data-shift="day" class="${w.shift === 'day' ? 'on' : ''}">☀️ Day</button>
          <button data-a="shift" data-id="${w.id}" data-shift="night" class="${w.shift === 'night' ? 'on' : ''}">🌙 Night</button>
          <button data-a="fire" data-id="${w.id}" class="danger">Fire</button>
        </div>`}
      </div>
    </div>`;
  }

  private renderClerkRules(): string {
    const r = this.workers.clerkRules;
    return `<div class="rules">
      <div class="name">🖥️ Office clerk rules</div>
      <label><input type="checkbox" data-rule="autoBuy" ${r.autoBuy ? 'checked' : ''}> Auto-accept deliveries when stock is below <input type="number" data-rule="buyIfStockBelow" value="${r.buyIfStockBelow}" min="0" max="99"> pallets</label>
      <label>Max spend per delivery <input type="number" data-rule="maxSpendPerOffer" value="${r.maxSpendPerOffer}" min="0" step="50"></label>
      <label><input type="checkbox" data-rule="autoSell" ${r.autoSell ? 'checked' : ''}> Auto-accept customer orders that are in stock</label>
    </div>`;
  }
}
