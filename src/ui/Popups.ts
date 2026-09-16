import { CustomerOffer, EventBus, SupplierOffer } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Orders, customerTotals } from '../core/Orders';
import { product } from '../core/Products';
import { Sound } from '../audio/Sound';
import { Brand, brand } from '../core/Brands';
import { logoSvg } from './Logo';
import { contactPortrait } from './Portrait';

const FALLBACK: Brand = { id: 'x', name: '?', color: '#2563b8', accent: '#ffd23f', mark: 'circle', contact: '' };

/** logo tile, name and the contact person on every order card */
export function brandHead(id: string, name: string, sub: string, timer = false): string {
  const b = brand(id) ?? FALLBACK;
  const ring = timer
    ? `<svg class="ring" viewBox="0 0 44 44" width="44" height="44"><circle class="track" cx="22" cy="22" r="19"/><circle class="fill" cx="22" cy="22" r="19"/></svg>`
    : '';
  return `<div class="head">
    <div class="logo">${logoSvg(b, 40)}</div>
    <div class="who"><div class="title">${esc(name)}</div><div class="sub">${esc(sub)}</div></div>
    ${b.contact ? `<div class="contact" title="${esc(b.contact)}">${contactPortrait(b.contact, 38, b.color)}<span>${esc(b.contact.split(' ')[0])}</span></div>` : ''}
    ${ring}
  </div>`;
}


function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** coloured product chip used by cards and the order board */
export function productChip(id: string): string {
  const p = product(id);
  return `<span class="pchip"><i style="background:${p.wrap}"></i>${esc(p.name)}</span>`;
}

/** Supplier offer and customer order cards with accept/decline and expiry bars. */
export class Popups {
  private container: HTMLElement;
  private supplierCard: HTMLElement | null = null;
  private customerCard: HTMLElement | null = null;
  private supplierTimerBar: SVGElement | null = null;
  private customerTimerBar: SVGElement | null = null;
  private supplierExpiry = 1;
  private customerExpiry = 1;

  /** set by the game so cards can show the client's loyalty tier */
  loyaltyLabel: ((clientId: string) => string) | null = null;

  constructor(private orders: Orders, private state: GameState, bus: EventBus, private sound: Sound) {
    this.container = document.createElement('div');
    this.container.id = 'cards';
    this.container.className = 'ui';
    document.body.appendChild(this.container);

    bus.on('supplierOffer', ({ offer }) => this.showSupplier(offer));
    bus.on('customerOffer', ({ offer }) => this.showCustomer(offer));
    bus.on('supplierOfferExpired', () => this.clearSupplier());
    bus.on('customerOfferExpired', () => this.clearCustomer());
  }

  private loyaltyNote(clientId: string): string {
    const l = this.loyaltyLabel?.(clientId);
    return l ? ` · ${l}` : '';
  }

  private showSupplier(o: SupplierOffer): void {
    this.clearSupplier();
    const total = o.pallets * o.pricePerPallet;
    const free = this.state.freeSpace;
    const fits = o.pallets <= free;
    const afford = total <= this.state.money;
    const sell = product(o.product);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${brandHead(o.supplierId, o.supplier, 'Supplier delivery', true)}
      <div class="lines">
        <div class="pline">
          <span class="pcount">${o.pallets}×</span>${productChip(o.product)}
          <span class="pprice">${o.free ? 'FREE' : `€${o.pricePerPallet}`}</span>
        </div>
      </div>
      <div class="summary">
        <span>${o.free ? '<b class="stock-ok">First delivery is on us</b>' : `Total <b>€${total}</b>`}</span>
        <span class="muted">sells €${sell.sellMin}–${sell.sellMax}</span>
      </div>
      <div class="checks">
        <span class="${fits ? 'stock-ok' : 'stock-bad'}">${fits ? '✔' : '✖'} rack space ${free}</span>
        <span class="${afford ? 'stock-ok' : 'stock-bad'}">${afford ? '✔' : '✖'} €${total} affordable</span>
      </div>
      <div class="btns">
        <button class="decline">Decline</button>
        <button class="accept" ${fits && afford ? '' : 'disabled'}>Accept${o.free ? '' : ` €${total}`}</button>
      </div>`;
    card.querySelector('.accept')!.addEventListener('click', () => {
      if (this.orders.acceptSupplier(o.id)) {
        this.sound.accept();
        this.clearSupplier();
      } else this.sound.error();
    });
    card.querySelector('.decline')!.addEventListener('click', () => {
      this.orders.declineSupplier(o.id);
      this.sound.decline();
      this.clearSupplier();
    });
    this.container.appendChild(card);
    this.supplierCard = card;
    this.supplierTimerBar = card.querySelector('.ring .fill');
    this.supplierExpiry = o.expiresIn;
    this.sound.click();
  }

  private showCustomer(o: CustomerOffer): void {
    this.clearCustomer();
    const ok = this.orders.canFill(o);
    const t = customerTotals(o);
    const lines = o.lines
      .map((l) => {
        const stock = this.state.stockOf(l.product);
        const has = stock >= l.pallets;
        return `<div class="pline">
          <span class="pcount">${l.pallets}×</span>${productChip(l.product)}
          <span class="pprice">€${l.pricePerPallet}</span>
          <span class="${has ? 'stock-ok' : 'stock-bad'} stock">${stock}/${l.pallets} ${has ? '✔' : '✖'}</span></div>`;
      })
      .join('');
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${brandHead(o.clientId, o.store, `Order${o.lines.length > 1 ? ' · mixed load' : ''}${this.loyaltyNote(o.clientId)}`, true)}
      <div class="lines">${lines}</div>
      <div class="summary">
        <span>Pays <b>€${t.revenue}</b></span>
        <span>Profit <b class="stock-ok">€${t.profit}</b></span>
      </div>
      <div class="btns">
        <button class="decline">Decline</button>
        <button class="accept" ${ok ? '' : 'disabled'}>${ok ? 'Accept' : 'Not in stock'}</button>
      </div>`;
    card.querySelector('.accept')!.addEventListener('click', () => {
      if (this.orders.acceptCustomer(o.id)) {
        this.sound.accept();
        this.clearCustomer();
      } else this.sound.error();
    });
    card.querySelector('.decline')!.addEventListener('click', () => {
      this.orders.declineCustomer(o.id);
      this.sound.decline();
      this.clearCustomer();
    });
    this.container.appendChild(card);
    this.customerCard = card;
    this.customerTimerBar = card.querySelector('.ring .fill');
    this.customerExpiry = o.expiresIn;
    this.sound.click();
  }

  private clearSupplier(): void {
    this.supplierCard?.remove();
    this.supplierCard = null;
  }
  private clearCustomer(): void {
    this.customerCard?.remove();
    this.customerCard = null;
  }

  /** the countdown ring: 119.4 is the circumference of an r=19 circle */
  private setRing(el: SVGElement | null, frac: number): void {
    if (!el) return;
    const f = Math.max(0, Math.min(1, frac));
    el.style.strokeDasharray = '119.4';
    el.style.strokeDashoffset = String(119.4 * (1 - f));
    el.style.stroke = f < 0.25 ? 'var(--bad)' : 'var(--accent)';
  }

  update(): void {
    const s = this.orders.pendingSupplier;
    if (s) this.setRing(this.supplierTimerBar, s.expiresIn / this.supplierExpiry);
    const c = this.orders.pendingCustomer;
    if (c) this.setRing(this.customerTimerBar, c.expiresIn / this.customerExpiry);
  }
}
