import { Settings } from '../core/GameState';

export type QualityMode = 'auto' | 'low' | 'medium' | 'high';

export interface SettingsView extends Settings {
  quality: QualityMode;
}

/**
 * Settings modal: sound, music, Henk's tips, graphics quality and the reset
 * button. Every change is applied immediately through `onChange`.
 */
export class SettingsPanel {
  private el: HTMLElement | null = null;
  onChange: ((s: SettingsView) => void) | null = null;
  onReset: (() => void) | null = null;
  onClose: (() => void) | null = null;

  open(current: SettingsView, fps: number): void {
    this.close();
    const el = document.createElement('div');
    el.id = 'settings';
    el.className = 'ui modal';
    const row = (key: string, label: string, on: boolean): string =>
      `<label class="srow"><span>${label}</span><button class="toggle ${on ? 'on' : ''}" data-t="${key}"><i></i></button></label>`;
    el.innerHTML = `<div class="modal-card">
      <div class="modal-title">Settings</div>
      ${row('sound', '🔊 Sound effects', current.sound)}
      ${row('music', '🎵 Background music', current.music)}
      ${row('henkTips', '💬 Tips from Henk', current.henkTips)}
      <div class="muted" style="margin:12px 0 6px">Graphics · ${Math.round(fps)} fps</div>
      <div class="quality">${(['auto', 'low', 'medium', 'high'] as QualityMode[])
        .map((q) => `<button data-q="${q}" class="${current.quality === q ? 'on' : ''}">${q[0].toUpperCase()}${q.slice(1)}</button>`)
        .join('')}</div>
      <div class="btns" style="margin-top:14px">
        <button class="danger" data-a="reset">Reset save</button>
        <button class="primary" data-a="close">Done</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    const view: SettingsView = { ...current };
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.dataset.t) {
        const key = b.dataset.t as keyof Settings;
        view[key] = !view[key];
        b.classList.toggle('on', view[key]);
        this.onChange?.(view);
      } else if (b.dataset.q) {
        view.quality = b.dataset.q as QualityMode;
        for (const o of el.querySelectorAll('.quality button')) o.classList.toggle('on', o === b);
        this.onChange?.(view);
      } else if (b.dataset.a === 'reset') {
        if (confirm('Delete your save and start over?')) this.onReset?.();
      } else if (b.dataset.a === 'close') {
        this.close();
      }
    });
  }

  close(): void {
    this.el?.remove();
    this.el = null;
    this.onClose?.();
  }

  get isOpen(): boolean {
    return !!this.el;
  }
}
