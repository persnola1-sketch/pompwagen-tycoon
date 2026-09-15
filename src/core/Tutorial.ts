import tutorialCfg from '../config/tutorial.json';
import economy from '../config/economy.json';
import names from '../config/names.json';
import { EventBus } from './EventBus';
import { GameState } from './GameState';
import { Orders, supplierNames } from './Orders';

export type TutorialTarget = 'buyPad' | 'unload' | 'rack' | 'load' | 'office' | null;

interface Step {
  id: string;
  text: string;
  tap?: boolean;
  target?: string;
}

const STEPS: Step[] = tutorialCfg.steps;

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/**
 * Henk's scripted tutorial: plot → warehouse → first delivery → first sale →
 * first worker. Random order generation stays off until it finishes. After
 * the tutorial Henk pops up with short one-time tips when features unlock.
 */
export class Tutorial {
  private stepIndex = -1;
  active = false;
  /** the worker system is available (the hire step waits for a real hire) */
  hasWorkers = false;

  constructor(private state: GameState, private orders: Orders, private bus: EventBus) {
    this.bus.on('guideContinue', () => this.onTap());
    this.bus.on('upgradeBought', ({ upgrade }) => {
      if (upgrade === 'warehouse' && this.currentStepId === 'buy') this.bus.emit('guideHide', {});
    });
    this.bus.on('warehouseBuilt', () => {
      if (this.currentStepId === 'buy') this.advance();
    });
    this.bus.on('supplierAccepted', () => {
      if (this.currentStepId === 'offer') this.advance();
    });
    this.bus.on('palletPicked', ({ from }) => {
      if (this.currentStepId === 'unload' && from === 'truck') this.advance();
    });
    this.bus.on('palletStored', () => {
      if (this.currentStepId === 'store' && this.state.stock >= tutorialCfg.firstDeliveryPallets) {
        this.advance();
        this.offerFirstOrder();
      }
    });
    this.bus.on('customerAccepted', () => {
      if (this.currentStepId === 'order') this.advance();
    });
    this.bus.on('orderShipped', ({ profit }) => {
      if (this.currentStepId === 'loadTruck') this.advance({ profit });
    });
    this.bus.on('workerHired', () => {
      if (this.currentStepId === 'hire') this.advance();
    });
  }

  get currentStepId(): string | null {
    return this.active ? STEPS[this.stepIndex]?.id ?? null : null;
  }

  get currentTarget(): TutorialTarget {
    const t = this.active ? STEPS[this.stepIndex]?.target : undefined;
    return (t as TutorialTarget) ?? null;
  }

  /** start (or resume) at the right step for the saved state */
  start(): void {
    this.active = true;
    this.orders.auto = false;
    this.stepIndex = this.state.warehouseBuilt ? STEPS.findIndex((s) => s.id === 'opened') - 1 : -1;
    this.advance();
  }

  skip(): void {
    if (!this.active) return;
    this.finish();
  }

  private onTap(): void {
    if (!this.active) return;
    const step = STEPS[this.stepIndex];
    if (!step?.tap) return;
    this.advance();
  }

  update(): void {
    if (!this.active) return;
    const id = this.currentStepId;
    if (id === 'offer' && !this.orders.pendingSupplier && !this.orders.activeSupplier) {
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
      pallets: tutorialCfg.firstDeliveryPallets,
      pricePerPallet: tutorialCfg.firstDeliveryPricePerPallet,
      free: tutorialCfg.firstDeliveryPricePerPallet === 0,
    });
  }

  private offerFirstOrder(): void {
    this.orders.offerCustomer({
      store: names.stores[0],
      lines: [{ product: economy.tutorial.product, pallets: tutorialCfg.customerPallets, pricePerPallet: tutorialCfg.customerPricePerPallet }],
    });
  }

  private advance(extra: Record<string, string | number> = {}): void {
    this.stepIndex++;
    const step = STEPS[this.stepIndex];
    if (!step) {
      this.finish();
      return;
    }
    const vars = {
      pallets: tutorialCfg.firstDeliveryPallets,
      needed: tutorialCfg.customerPallets,
      stock: this.state.stock,
      store: names.stores[0],
      ...extra,
    };
    this.bus.emit('guideSay', {
      id: step.id,
      text: fill(step.text, vars),
      tap: !!step.tap,
      target: (step.target as TutorialTarget) ?? null,
      skippable: true,
      autoHide: 0,
    });
    this.bus.emit('tutorialStep', { id: step.id, text: fill(step.text, vars) });
    // steps that need the world to do something right away
    if (step.id === 'offer') this.offerFirstDelivery();
    if (step.id === 'hire' && !this.hasWorkers) this.advance();
  }

  /** one-time tip when a feature unlocks (after the tutorial) */
  tip(key: keyof typeof tutorialCfg.tips): void {
    if (this.active || !this.state.settings.henkTips) return;
    if (this.state.tipsSeen.includes(key)) return;
    this.state.tipsSeen.push(key);
    this.bus.emit('guideSay', { id: `tip-${key}`, text: tutorialCfg.tips[key], tap: false, target: null, skippable: false, autoHide: tutorialCfg.tipSeconds });
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;
    this.state.tutorialDone = true;
    this.orders.startAuto();
    this.bus.emit('guideHide', {});
    this.bus.emit('tutorialDone', {});
  }
}
