import { EventBus } from '../core/EventBus';
import { Orders } from '../core/Orders';

/** Small list of active deliveries and orders (product, done/total, time left). */
export class OrderBoard {
  private el: HTMLElement;
  private listEl: HTMLElement;

  constructor(private orders: Orders, bus: EventBus) {
    this.el = document.createElement('div');
    this.el.id = 'order-board';
    this.el.className = 'ui';
    this.el.innerHTML = `<h3>Order board</h3><div class="list"></div>`;
    document.body.appendChild(this.el);
    this.listEl = this.el.querySelector('.list')!;
    bus.on('ordersChanged', () => this.render());
    this.render();
  }

  toggle(): void {
    this.el.classList.toggle('open');
    this.render();
  }

  get isOpen(): boolean {
    return this.el.classList.contains('open');
  }

  render(): void {
    if (!this.isOpen) return;
    const rows: string[] = [];
    const s = this.orders.activeSupplier;
    if (s) {
      const done = s.pallets - s.remaining;
      const status = s.state === 'accepted' ? 'truck on the way' : `${done}/${s.pallets} unloaded`;
      rows.push(`<div class="board-item">📥 <b>${s.supplier}</b><br>${s.product} — ${status}</div>`);
    }
    const c = this.orders.activeCustomer;
    if (c) {
      const t = Math.max(0, Math.ceil(c.deadline));
      const warn = c.deadline < c.deadlineTotal * 0.25 ? 'warn' : '';
      const status = c.state === 'accepted' ? 'truck on the way' : `${c.loaded}/${c.pallets} loaded`;
      rows.push(`<div class="board-item">📤 <b>${c.store}</b><br>${c.product} — ${status}<br><span class="t ${warn}">⏱ ${t}s left</span></div>`);
    }
    const p1 = this.orders.pendingSupplier;
    if (p1) rows.push(`<div class="board-item">💬 Offer: ${p1.supplier}, ${p1.pallets} pallets</div>`);
    const p2 = this.orders.pendingCustomer;
    if (p2) rows.push(`<div class="board-item">💬 Order: ${p2.store}, ${p2.pallets} pallets</div>`);
    this.listEl.innerHTML = rows.length ? rows.join('') : `<div class="board-empty">No active orders</div>`;
  }

  /** refresh countdown once a second */
  tick(): void {
    if (this.isOpen) this.render();
  }
}
