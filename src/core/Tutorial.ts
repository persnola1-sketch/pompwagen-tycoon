import tutorialCfg from '../config/tutorial.json';
import economy from '../config/economy.json';
import names from '../config/names.json';
import { EventBus } from './EventBus';
import { GameState } from './GameState';
import { Orders, supplierNames } from './Orders';

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * Scripted tutorial (design section 10, trimmed): ends right after the first
 * profitable sale. Random order generation stays off until it finishes.
 */
export class Tutorial {
  private stepIndex = -1;
  private distMoved = 0;
  active = false;

  constructor(private state: GameState, private orders: Orders, private bus: EventBus) {}

  get currentStepId(): string | null {
    return this.active ? tutorialCfg.steps[this.stepIndex]?.id ?? null : null;
  }

  start(): void {
    this.active = true;
    this.orders.auto = false;
    this.advance();

    this.bus.on('supplierAccepted', () => {
      if (this.currentStepId === 'offer') this.advance();
    });
    this.bus.on('palletPicked', ({ from }) => {
      if (this.currentStepId === 'unload' && from === 'truck') this.advance();
    });
    this.bus.on('palletStored', () => {
      if (this.currentStepId === 'store' && this.state.stock >= economy.tutorial.freeDeliveryPallets) {
        this.advance();
        this.offerFirstOrder();
      }
    });
    this.bus.on('customerAccepted', () => {
      if (this.currentStepId === 'order') this.advance();
    });
    this.bus.on('orderShipped', ({ profit }) => {
      if (this.currentStepId === 'loadTruck') {
        this.advance({ profit });
        this.finish();
      }
    });
  }

  skip(): void {
    if (!this.active) return;
    this.finish();
  }

  update(dt: number, playerSpeed: number): void {
    if (!this.active) return;
    const id = this.currentStepId;
    if (id === 'move') {
      this.distMoved += playerSpeed * dt;
      if (this.distMoved > 4) {
        this.advance();
        this.offerFirstDelivery();
      }
    } else if (id === 'offer' && !this.orders.pendingSupplier && !this.orders.activeSupplier) {
      // declined or expired: offer it again
      this.offerFirstDelivery();
    } else if (id === 'order' && !this.orders.pendingCustomer && !this.orders.activeCustomer) {
      this.offerFirstOrder();
    }
  }

  private offerFirstDelivery(): void {
    this.orders.offerSupplier({
      supplier: supplierNames(economy.tutorial.product)[0],
      product: economy.tutorial.product,
      pallets: economy.tutorial.freeDeliveryPallets,
      pricePerPallet: 0,
      free: true,
    });
  }

  private offerFirstOrder(): void {
    this.orders.offerCustomer({
      store: names.stores[0],
      lines: [
        {
          product: economy.tutorial.product,
          pallets: economy.tutorial.customerPallets,
          pricePerPallet: economy.tutorial.customerPricePerPallet,
        },
      ],
    });
  }

  private advance(extra: Record<string, string | number> = {}): void {
    this.stepIndex++;
    const step = tutorialCfg.steps[this.stepIndex];
    if (!step) {
      this.finish();
      return;
    }
    const vars = {
      pallets: economy.tutorial.freeDeliveryPallets,
      needed: economy.tutorial.customerPallets,
      stock: this.state.stock,
      store: names.stores[0],
      ...extra,
    };
    this.bus.emit('tutorialStep', { id: step.id, text: fill(step.text, vars) });
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;
    this.state.tutorialDone = true;
    this.orders.startAuto();
    if (economy.tutorial.completionBonus > 0) {
      this.state.addMoney(economy.tutorial.completionBonus);
      this.bus.emit('toast', { text: `Starting capital bonus: €${economy.tutorial.completionBonus}!`, kind: 'good' });
    }
    this.bus.emit('tutorialDone', {});
  }
}
