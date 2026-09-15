import { Job, Timers } from '../core/Timers';

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60) % 60).padStart(2, '0')}`;

/** Small chips listing running construction / delivery jobs with a finish-now button. */
export class TimersHud {
  private el: HTMLElement;
  onFinishAd: ((job: Job) => void) | null = null;
  onFinishPay: ((job: Job) => void) | null = null;

  constructor(private timers: Timers) {
    this.el = document.createElement('div');
    this.el.id = 'timers-hud';
    this.el.className = 'ui';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
      if (!b) return;
      const job = this.timers.get(Number(b.dataset.id));
      if (!job) return;
      if (b.dataset.a === 'ad') this.onFinishAd?.(job);
      else this.onFinishPay?.(job);
    });
  }

  /** call ~once per second */
  render(): void {
    const jobs = this.timers.jobs;
    if (!jobs.length) {
      this.el.innerHTML = '';
      return;
    }
    this.el.innerHTML = jobs
      .map((j) => {
        const pct = Math.round((1 - j.left / j.total) * 100);
        const icon = j.kind === 'construction' ? '🏗️' : '🚚';
        return `<div class="timer-chip">
          <div class="tc-main"><span>${icon} ${j.label}</span><b>${fmt(j.left)}</b></div>
          <div class="tc-bar"><i style="width:${pct}%"></i></div>
          <div class="tc-btns"><button data-a="ad" data-id="${j.id}">📺 Finish now</button><button data-a="pay" data-id="${j.id}">€${this.timers.finishPrice(j)}</button></div>
        </div>`;
      })
      .join('');
  }
}
