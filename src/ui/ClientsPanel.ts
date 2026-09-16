import { EventBus } from '../core/EventBus';
import { Loyalty } from '../core/Brands';
import { product } from '../core/Products';
import { logoSvg } from './Logo';

const eur = (n: number): string => `€${Math.round(n).toLocaleString('en')}`;
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * Client profile cards: logo, contact person, favourite products, loyalty
 * tier with its price bonus, and the order history that earned it.
 */
export class ClientsPanel {
  private el: HTMLElement;
  private body: HTMLElement;
  onClose: (() => void) | null = null;

  constructor(private loyalty: Loyalty, bus: EventBus) {
    this.el = document.createElement('div');
    this.el.id = 'clients-panel';
    this.el.className = 'ui sheet';
    this.el.innerHTML =
      `<div class="sheet-head"><div class="tabs"><button class="on">Clients</button></div><button class="close" aria-label="Close">✕</button></div>` +
      `<div class="sheet-body"></div>`;
    document.body.appendChild(this.el);
    this.body = this.el.querySelector('.sheet-body')!;
    this.el.hidden = true;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close());
    bus.on('clientsChanged', () => this.render());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
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
    this.body.innerHTML = this.loyalty
      .ranked()
      .map(({ brand: b, record: r, level }) => {
        const next = this.loyalty.toNext(b.id);
        const favs = (b.favourites ?? []).map((f) => `<span class="pchip"><i style="background:${product(f).wrap}"></i>${esc(product(f).name)}</span>`).join(' ');
        const bonus = level.priceBonus > 0 ? ` · pays +${Math.round(level.priceBonus * 100)}%` : '';
        return `<div class="wcard">
          <div class="portrait">${logoSvg(b, 52)}</div>
          <div class="info">
            <div class="name">${esc(b.name)} <span class="stars">${level.emoji} ${level.name}${bonus}</span></div>
            <div class="role">👤 ${esc(b.contact)}</div>
            <div class="trait">${favs}</div>
            <div class="meta">${r.orders} orders · ${r.onTime} on time${r.missed ? ` · ${r.missed} missed` : ''} · ${r.pallets} pallets · ${eur(r.spent)} spent</div>
            ${next ? `<div class="meta">${next.need} more on-time order${next.need > 1 ? 's' : ''} → ${next.next.emoji} ${next.next.name}</div>` : '<div class="meta">Top tier reached 🏆</div>'}
          </div>
        </div>`;
      })
      .join('');
  }
}
