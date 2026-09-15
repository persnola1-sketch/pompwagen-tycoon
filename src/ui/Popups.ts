import { CustomerOffer, EventBus, SupplierOffer } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Orders, customerTotals } from '../core/Orders';
import { product } from '../core/Products';
import { Sound } from '../audio/Sound';

function logoColor(name: string): string {
  const colors = ['#2563b8', '#c2571f', '#2f9e4f', '#8347c2', '#b83a63', '#3aa6a0'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
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
  private supplierTimerBar: HTMLElement | null = null;
  private customerTimerBar: HTMLElement | null = null;
  private supplierExpiry = 1;
  private customerExpiry = 1;

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
      <div class="head">
        <div class="logo" style="background:${logoColor(o.supplier)}">${esc(o.supplier[0])}</div>
        <div><div class="title">${esc(o.supplier)}</div><div class="sub">Supplier delivery offer</div></div>
      </div>
      <div class="row">${o.pallets} pallets of ${productChip(o.product)}</div>
      <div class="row">${o.free ? '<b class="stock-ok">FREE — first delivery!</b>' : `€${o.pricePerPallet}/pallet · total <b>€${total}</b> <span class="muted">(sells €${sell.sellMin}–${sell.sellMax})</span>`}</div>
      <div class="row">Free rack space: <span class="${fits ? 'stock-ok' : 'stock-bad'}">${free}${fits ? ' ✔' : ' ✖'}</span>${afford ? '' : ' · <span class="stock-bad">not enough money</span>'}</div>
      <div class="btns">
        <button class="decline">Decline</button>
        <button class="accept" ${fits && afford ? '' : 'disabled'}>Accept${o.free ? '' : ` €${total}`}</button>
      </div>
      <div class="timer"><i style="width:100%"></i></div>`;
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
    this.supplierTimerBar = card.querySelector('.timer i');
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
        return `<div class="row line">${l.pallets}× ${productChip(l.product)} <span class="muted">€${l.pricePerPallet}</span>
          <span class="${has ? 'stock-ok' : 'stock-bad'} stock">${stock}/${l.pallets} ${has ? '✔' : '✖'}</span></div>`;
      })
      .join('');
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="head">
        <div class="logo" style="background:${logoColor(o.store)}">${esc(o.store[0])}</div>
        <div><div class="title">${esc(o.store)}</div><div class="sub">Customer order${o.lines.length > 1 ? ' · mixed load' : ''}</div></div>
      </div>
      ${lines}
      <div class="row">Total <b>€${t.revenue}</b> · est. profit <b class="stock-ok">€${t.profit}</b></div>
      <div class="btns">
        <button class="decline">Decline</button>
        <button class="accept" ${ok ? '' : 'disabled'}>${ok ? 'Accept' : 'Not in stock'}</button>
      </div>
      <div class="timer"><i style="width:100%"></i></div>`;
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
    this.customerTimerBar = card.querySelector('.timer i');
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

  update(): void {
    const s = this.orders.pendingSupplier;
    if (this.supplierTimerBar && s) {
      this.supplierTimerBar.style.width = `${Math.max(0, (s.expiresIn / this.supplierExpiry) * 100)}%`;
    }
    const c = this.orders.pendingCustomer;
    if (this.customerTimerBar && c) {
      this.customerTimerBar.style.width = `${Math.max(0, (c.expiresIn / this.customerExpiry) * 100)}%`;
    }
  }
}
