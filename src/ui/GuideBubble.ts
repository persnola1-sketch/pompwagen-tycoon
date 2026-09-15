/** Henk's portrait as inline SVG (cap, mustache, hi-vis vest) */
export function henkPortraitSvg(size = 44): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="31" fill="#173a63"/>
    <path d="M12 62 Q32 40 52 62Z" fill="#ff7a1a"/>
    <rect x="18" y="47" width="28" height="4" fill="#e9edf0" opacity="0.9"/>
    <circle cx="32" cy="30" r="14" fill="#e0ac85"/>
    <path d="M17 27 Q32 10 47 27 L47 24 Q32 8 17 24Z" fill="#ff7a1a"/>
    <rect x="15" y="25" width="34" height="4" rx="2" fill="#ff7a1a"/>
    <circle cx="26" cy="31" r="2" fill="#141414"/><circle cx="38" cy="31" r="2" fill="#141414"/>
    <path d="M24 39 Q32 44 40 39 Q32 41 24 39Z" fill="#8a8a8a"/>
    <path d="M22 38 Q32 34 42 38" stroke="#8a8a8a" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
}

/**
 * Speech bubble for the guide: typewriter text with voice blips, tap to
 * continue, and a skip-tutorial button.
 */
export class GuideBubble {
  private el: HTMLElement;
  private textEl: HTMLElement;
  private hintEl: HTMLElement;
  private skipBtn: HTMLButtonElement;
  private full = '';
  private shown = 0;
  private timer = 0;
  private typeSpeed: number;
  private tap = false;
  private hideTimer = 0;
  onTap: (() => void) | null = null;
  onSkip: (() => void) | null = null;
  onBlip: (() => void) | null = null;

  constructor(typeSpeed: number) {
    this.typeSpeed = typeSpeed;
    this.el = document.createElement('div');
    this.el.id = 'guide';
    this.el.className = 'ui';
    this.el.innerHTML =
      `<div class="portrait">${henkPortraitSvg()}</div>` +
      `<div class="body"><div class="name">HENK</div><div class="txt"></div><div class="hint"></div></div>` +
      `<button class="skip">Skip tutorial</button>`;
    document.body.appendChild(this.el);
    this.textEl = this.el.querySelector('.txt')!;
    this.hintEl = this.el.querySelector('.hint')!;
    this.skipBtn = this.el.querySelector('.skip')!;
    this.el.hidden = true;
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.skip')) return;
      if (this.shown < this.full.length) {
        this.shown = this.full.length;
        this.render();
        return;
      }
      if (this.tap) this.onTap?.();
    });
    this.skipBtn.addEventListener('click', () => this.onSkip?.());
  }

  say(text: string, tapToContinue: boolean, showSkip: boolean, autoHideSeconds = 0): void {
    window.clearTimeout(this.hideTimer);
    this.full = text;
    this.shown = 0;
    this.tap = tapToContinue;
    this.el.hidden = false;
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
    this.skipBtn.hidden = !showSkip;
    this.hintEl.textContent = '';
    this.render();
    if (autoHideSeconds > 0) this.hideTimer = window.setTimeout(() => this.hide(), autoHideSeconds * 1000);
  }

  hide(): void {
    this.el.hidden = true;
    this.full = '';
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  private render(): void {
    this.textEl.textContent = this.full.slice(0, this.shown);
    if (this.shown >= this.full.length) this.hintEl.textContent = this.tap ? 'Tap to continue ▸' : '';
  }

  update(dt: number): void {
    if (this.el.hidden || this.shown >= this.full.length) return;
    this.timer += dt * this.typeSpeed;
    while (this.timer >= 1 && this.shown < this.full.length) {
      this.timer -= 1;
      this.shown++;
      if (this.shown % 3 === 0 && this.full[this.shown - 1] !== ' ') this.onBlip?.();
    }
    this.render();
  }
}
