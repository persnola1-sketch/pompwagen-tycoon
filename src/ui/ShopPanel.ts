import shopCfg from '../config/shop.json';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { SHOP_TABS, Shop, ShopEntry } from '../game/Shop';

const eur = (n: number): string => `€${n.toLocaleString('en')}`;
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * The shop sheet: five tabs of cards, each with its icon, price, what it does
 * and how long it takes. Items above the current company level show a lock,
 * so a big bank balance still cannot skip the progression.
 */
export class ShopPanel {
  private el: HTMLElement;
  private body: HTMLElement;
  private tab = SHOP_TABS[0].id;
  onClose: (() => void) | null = null;
  onBuy: ((id: string) => void) | null = null;

  constructor(private shop: Shop, private state: GameState, bus: EventBus) {
    this.el = document.createElement('div');
    this.el.id = 'shop-panel';
    this.el.className = 'ui sheet';
    this.el.innerHTML =
      `<div class="sheet-head"><div class="tabs">` +
      SHOP_TABS.map((t, i) => `<button data-tab="${t.id}" class="${i === 0 ? 'on' : ''}" title="${t.name}">${t.emoji}</button>`).join('') +
      `</div><button class="close" aria-label="Close">✕</button></div>` +
      `<div class="shop-tabname"></div><div class="sheet-body"></div>`;
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('.sheet-body')!;
    this.el.hidden = true;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close());
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.tabs button')) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab!;
        for (const o of this.el.querySelectorAll('.tabs button')) o.classList.toggle('on', o === b);
        this.render();
      });
    }
    this.body.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-buy]');
      if (btn) this.onBuy?.(btn.dataset.buy!);
    });
    bus.on('shopChanged', () => this.render());
    bus.on('moneyChanged', () => this.render());
    bus.on('jobDone', () => this.render());
    bus.on('companyXpChanged', () => this.render());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(tab?: string): void {
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

  render(): void {
    if (this.el.hidden) return;
    const t = SHOP_TABS.find((x) => x.id === this.tab)!;
    (this.el.querySelector('.shop-tabname') as HTMLElement).textContent = `${t.name} · company level ${this.state.companyLevel}`;
    this.body.innerHTML = this.shop.entries(this.tab).map((e) => this.card(e)).join('');
  }

  private card(e: ShopEntry): string {
    const { item } = e;
    const cls = e.locked ? 'locked' : e.owned ? 'owned' : '';
    let button: string;
    if (e.owned) button = `<button disabled class="claimed">✔</button>`;
    else if (e.locked) button = `<button disabled>🔒 LV ${item.level}</button>`;
    else if (e.busy) button = `<button disabled>🏗️</button>`;
    else if (e.reason) button = `<button disabled>${esc(e.reason)}</button>`;
    else if (e.price === 0) button = `<button class="ad" data-buy="${item.id}">📺 Watch</button>`;
    else button = `<button class="primary" data-buy="${item.id}" ${e.affordable ? '' : 'disabled'}>${eur(e.price)}</button>`;
    return `<div class="shop-card ${cls}">
      <div class="sicon">${item.icon}</div>
      <div class="info">
        <div class="name">${esc(item.name)}</div>
        <div class="sdesc">${esc(item.desc)}</div>
        ${e.note ? `<div class="meta">${esc(e.note)}</div>` : ''}
      </div>
      ${button}
    </div>`;
  }

  /** the swatch picker used by the cosmetics items */
  static pickColor(title: string, colors: string[], current: string, onPick: (c: string) => void): void {
    document.getElementById('picker')?.remove();
    const el = document.createElement('div');
    el.id = 'picker';
    el.className = 'ui modal';
    el.innerHTML = `<div class="modal-card">
      <div class="modal-title">${esc(title)}</div>
      <div class="swatches">${colors
        .map((c) => `<button class="swatch ${c === current ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`)
        .join('')}</div>
      <div class="btns"><button data-a="close">Done</button></div>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!t) return;
      if (t.dataset.c) {
        onPick(t.dataset.c);
        for (const s of el.querySelectorAll('.swatch')) s.classList.toggle('on', s === t);
      } else el.remove();
    });
  }

  /** the company name + logo builder */
  static companyBuilder(
    current: { companyName: string; logoMark: string; logoColor: string },
    marks: string[],
    colors: string[],
    logo: (mark: string, color: string) => string,
    onSave: (name: string, mark: string, color: string) => void,
  ): void {
    document.getElementById('picker')?.remove();
    let mark = current.logoMark;
    let color = current.logoColor;
    const el = document.createElement('div');
    el.id = 'picker';
    el.className = 'ui modal';
    el.innerHTML = `<div class="modal-card">
      <div class="modal-title">Company identity</div>
      <input class="nameInput" maxlength="22" value="${esc(current.companyName)}" />
      <div class="muted" style="margin:10px 0 4px">Logo mark</div>
      <div class="swatches marks">${marks.map((m) => `<button class="swatch mark ${m === mark ? 'on' : ''}" data-m="${m}">${logo(m, color)}</button>`).join('')}</div>
      <div class="muted" style="margin:10px 0 4px">Colour</div>
      <div class="swatches">${colors.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="btns"><button class="primary" data-a="save">Save</button></div>
    </div>`;
    document.body.appendChild(el);
    const input = el.querySelector('.nameInput') as HTMLInputElement;
    const redrawMarks = (): void => {
      for (const b of el.querySelectorAll<HTMLButtonElement>('.swatch.mark')) {
        b.innerHTML = logo(b.dataset.m!, color);
        b.classList.toggle('on', b.dataset.m === mark);
      }
    };
    el.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!t) return;
      if (t.dataset.m) {
        mark = t.dataset.m;
        redrawMarks();
      } else if (t.dataset.c) {
        color = t.dataset.c;
        for (const s of el.querySelectorAll('.swatch:not(.mark)')) s.classList.toggle('on', s === t);
        redrawMarks();
      } else if (t.dataset.a === 'save') {
        onSave(input.value.trim() || current.companyName, mark, color);
        el.remove();
      }
    });
  }

  static get cosmetics(): typeof shopCfg.cosmetics {
    return shopCfg.cosmetics;
  }
}
