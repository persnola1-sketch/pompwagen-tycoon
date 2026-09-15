import { ShiftReport as Report } from '../core/workers/Offline';

const eur = (n: number): string => `€${n.toLocaleString('en')}`;

/** Night shift report shown when the player returns after time away. */
export class ShiftReportUi {
  onDouble: ((report: Report) => void) | null = null;
  onClose: (() => void) | null = null;

  show(r: Report): void {
    document.getElementById('shift-report')?.remove();
    const el = document.createElement('div');
    el.id = 'shift-report';
    el.className = 'ui modal';
    const h = Math.floor(r.minutes / 60);
    const m = r.minutes % 60;
    const ups = r.levelUps.length ? r.levelUps.map((u) => `<li>🎉 ${u.name} reached level ${u.level}</li>`).join('') : '<li class="muted">No level ups</li>';
    el.innerHTML = `<div class="modal-card">
      <div class="modal-title">🌙 Night Shift Report</div>
      <div class="muted">${r.workers} worker${r.workers > 1 ? 's' : ''} worked ${h ? `${h} h ` : ''}${m} min while you were away</div>
      <div class="stat-grid">
        <div><b>${r.pallets}</b><span>pallets moved</span></div>
        <div><b class="good">${eur(r.earned)}</b><span>earned</span></div>
        <div><b class="bad">-${eur(r.wages)}</b><span>wages</span></div>
        <div><b class="accent">${eur(Math.max(0, r.earned - r.wages))}</b><span>net</span></div>
      </div>
      <ul class="levelups">${ups}</ul>
      <div class="btns">
        <button class="ad" data-a="double">📺 Double earnings</button>
        <button class="primary" data-a="ok">Collect</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('[data-a="ok"]')!.addEventListener('click', () => {
      el.remove();
      this.onClose?.();
    });
    el.querySelector('[data-a="double"]')!.addEventListener('click', () => {
      el.remove();
      this.onDouble?.(r);
    });
  }
}
