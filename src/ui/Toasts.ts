import { EventBus } from '../core/EventBus';
import { product } from '../core/Products';

export type ToastKind = 'good' | 'bad' | 'info' | 'unlock';

/** Toast messages, floating money numbers, and the big profit splash. */
export class Toasts {
  private container: HTMLElement;

  constructor(bus: EventBus) {
    this.container = document.createElement('div');
    this.container.id = 'toasts';
    this.container.className = 'ui';
    document.body.appendChild(this.container);

    bus.on('toast', ({ text, kind }) => this.show(text, kind));
    bus.on('orderShipped', ({ revenue, profit, fast }) => {
      this.profitSplash(`+€${revenue}`, `profit €${profit}${fast ? ' · fast delivery ★' : ''}`);
    });
    bus.on('orderMissed', () => this.show('Order missed! Reputation down', 'bad'));
    bus.on('productUnlocked', ({ product: id }) => {
      this.show(`New product unlocked: ${product(id).name}! Customers will start ordering it.`, 'unlock');
    });
  }

  show(text: string, kind: ToastKind): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), kind === 'unlock' ? 4200 : 2800);
  }

  profitSplash(big: string, small: string): void {
    document.getElementById('profit-splash')?.remove();
    const el = document.createElement('div');
    el.id = 'profit-splash';
    el.className = 'ui';
    el.innerHTML = `<div class="big"></div><div class="small"></div>`;
    (el.querySelector('.big') as HTMLElement).textContent = big;
    (el.querySelector('.small') as HTMLElement).textContent = small;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
}
