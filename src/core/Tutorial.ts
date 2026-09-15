import tutorialCfg from '../config/tutorial.json';
import economy from '../config/economy.json';
import names from '../config/names.json';
import { EventBus } from './EventBus';
import { GameState } from './GameState';
import { Orders } from './Orders';

/**
 * Scripted tutorial v2 (design section 10). Steps advance on game events;
 * random order generation stays off until the tutorial finishes.
 */
export class Tutorial {
  private stepIndex = -1;
  private waitTimer = 0;
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
    this.bus.on('palletPicked', () => {
      if (this.currentStepId === 'unload') this.advance();
    });
    this.bus.on('palletStored', () => {
      if (this.currentStepId === 'store' && this.state.stock >= economy.tutorial.freeDeliveryPallets) {
        this.advance();
        this.orders.offerCustomer({
          store: names.stores[0],
          pallets: economy.tutorial.customerPallets,
          pricePerPallet: economy.tutorial.customerPricePerPallet,
        });
      }
    });
    this.bus.on('customerAccepted', () => {
      if (this.currentStepId === 'order') this.advance();
    });
    this.bus.on('orderShipped', () => {
      if (this.currentStepId === 'loadTruck') {
        this.advance();
        this.waitTimer = 4;
      }
    });
    this.bus.on('rackRowBuilt', () => {
      if (this.currentStepId === 'expand') {
        this.advance();
        this.waitTimer = 4;
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
        this.orders.offerSupplier({
          supplier: names.suppliers[0],
          pallets: economy.tutorial.freeDeliveryPallets,
          pricePerPallet: 0,
          free: true,
        });
      }
    } else if (id === 'profit' || id === 'done') {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) {
        if (id === 'done') this.finish();
        else this.advance();
      }
    }
  }

  private advance(): void {
    this.stepIndex++;
    const step = tutorialCfg.steps[this.stepIndex];
    if (!step) {
      this.finish();
      return;
    }
    this.bus.emit('tutorialStep', { id: step.id, text: step.text });
  }

  private finish(): void {
    this.active = false;
    this.state.tutorialDone = true;
    this.orders.auto = true;
    if (economy.tutorial.completionBonus > 0) {
      this.state.addMoney(economy.tutorial.completionBonus);
      this.bus.emit('toast', { text: `Starting capital bonus: €${economy.tutorial.completionBonus}!`, kind: 'good' });
    }
    this.bus.emit('tutorialDone', {});
  }
}
