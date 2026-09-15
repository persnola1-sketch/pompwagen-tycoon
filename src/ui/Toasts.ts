import { EventBus } from '../core/EventBus';

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
  }

  show(text: string, kind: 'good' | 'bad' | 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.container.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  floater(text: string, xFrac = 0.5, yFrac = 0.45): void {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.left = `${xFrac * 100}%`;
    el.style.top = `${yFrac * 100}%`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
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
