import cfg from '../config/construction.json';

/**
 * Rewarded-ad stub: shows a short fake "sponsored break" countdown and
 * resolves true when it finishes (false if the player closes it early).
 * Replace `showRewarded` with a real ad SDK call later; callers only await
 * the boolean.
 */
export class AdService {
  private showing = false;

  get available(): boolean {
    return !this.showing;
  }

  showRewarded(reason: string): Promise<boolean> {
    if (this.showing) return Promise.resolve(false);
    this.showing = true;
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.id = 'ad-overlay';
      el.className = 'ui modal';
      el.innerHTML = `<div class="modal-card ad-card">
        <div class="ad-badge">📺 SPONSORED BREAK</div>
        <div class="ad-reason"></div>
        <div class="ad-count">${cfg.ad.fakeSeconds}</div>
        <div class="muted">Reward: ${reason}</div>
        <button class="small ghost" data-a="close">✕ Skip (no reward)</button>
      </div>`;
      (el.querySelector('.ad-reason') as HTMLElement).textContent = 'Thanks for supporting the game!';
      document.body.appendChild(el);
      let left = cfg.ad.fakeSeconds;
      const count = el.querySelector('.ad-count') as HTMLElement;
      const finish = (ok: boolean): void => {
        clearInterval(timer);
        el.remove();
        this.showing = false;
        resolve(ok);
      };
      const timer = window.setInterval(() => {
        left -= 1;
        count.textContent = String(Math.max(0, left));
        if (left <= 0) finish(true);
      }, 1000);
      el.querySelector('[data-a="close"]')!.addEventListener('click', () => finish(false));
    });
  }
}
