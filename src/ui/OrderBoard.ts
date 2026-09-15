import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { Orders } from '../core/Orders';
import { PRODUCTS, product } from '../core/Products';
import { productChip } from './Popups';

/**
 * Collapsible order board: active deliveries and orders (per product:
 * done/total, time left) plus stock per product. Collapsed by default; the
 * HUD toggle shows a small badge with the number of active items.
 */
export class OrderBoard {
  private el: HTMLElement;
  private listEl: HTMLElement;
  private stockEl: HTMLElement;
  onCountChanged: ((n: number) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(private orders: Orders, private state: GameState, bus: EventBus) {
    this.el = document.createElement('div');
    this.el.id = 'order-board';
    this.el.className = 'ui panel';
    this.el.innerHTML =
      `<div class="panel-head"><h3>Order board</h3><button class="close" aria-label="Close">✕</button></div>` +
      `<div class="list"></div><h3>Stock</h3><div class="stock-list"></div>`;
    document.body.appendChild(this.el);
    this.listEl = this.el.querySelector('.list')!;
    this.stockEl = this.el.querySelector('.stock-list')!;
    this.el.querySelector('.close')!.addEventListener('click', () => {
      this.close();
      this.onClose?.();
    });
    bus.on('ordersChanged', () => this.render());
    bus.on('stockChanged', () => this.render());
    this.render();
  }

  toggle(): void {
    this.el.classList.toggle('open');
    this.render();
  }

  open(): void {
    this.el.classList.add('open');
    this.render();
  }

  close(): void {
    this.el.classList.remove('open');
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  /** number of active + pending items, for the HUD badge */
  get count(): number {
    let n = 0;
    if (this.orders.activeSupplier) n++;
    if (this.orders.activeCustomer) n++;
    if (this.orders.pendingSupplier) n++;
    if (this.orders.pendingCustomer) n++;
    return n;
  }

  render(): void {
    this.onCountChanged?.(this.count);
    if (!this.isOpen) return;
    const rows: string[] = [];
    const s = this.orders.activeSupplier;
    if (s) {
      const done = s.pallets - s.remaining;
      const status = s.state === 'accepted' ? 'truck on the way' : `${done}/${s.pallets} unloaded`;
      rows.push(`<div class="board-item">📥 <b>${s.supplier}</b><br>${productChip(s.product)} — ${status}</div>`);
    }
    const c = this.orders.activeCustomer;
    if (c) {
      const t = Math.max(0, Math.ceil(c.deadline));
      const warn = c.deadline < c.deadlineTotal * 0.25 ? 'warn' : '';
      const status = c.state === 'accepted' ? '<span class="muted">truck on the way</span><br>' : '';
      const lines = c.lines.map((l) => `${productChip(l.product)} ${l.loaded}/${l.pallets}`).join('<br>');
      rows.push(`<div class="board-item">📤 <b>${c.store}</b><br>${status}${lines}<br><span class="t ${warn}">⏱ ${t}s left</span></div>`);
    }
    const p1 = this.orders.pendingSupplier;
    if (p1) rows.push(`<div class="board-item">💬 Offer: ${p1.supplier}, ${p1.pallets}× ${product(p1.product).name}</div>`);
    const p2 = this.orders.pendingCustomer;
    if (p2) rows.push(`<div class="board-item">💬 Order: ${p2.store}, ${p2.lines.map((l) => `${l.pallets}× ${product(l.product).name}`).join(' + ')}</div>`);
    this.listEl.innerHTML = rows.length ? rows.join('') : `<div class="board-empty">No active orders</div>`;

    const shipped = this.state.stats.shipped;
    const stock = PRODUCTS.filter((p) => shipped >= p.unlockShipped).map(
      (p) => `<div class="stock-row">${productChip(p.id)}<b>${this.state.stockOf(p.id)}</b></div>`,
    );
    const next = PRODUCTS.find((p) => shipped < p.unlockShipped);
    if (next) stock.push(`<div class="stock-row muted">🔒 ${next.name} · ship ${next.unlockShipped - shipped} more</div>`);
    this.stockEl.innerHTML = stock.join('');
  }

  /** refresh countdown once a second */
  tick(): void {
    if (this.isOpen) this.render();
  }
}
