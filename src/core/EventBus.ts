export type GameEvents = {
  moneyChanged: { money: number; delta: number };
  reputationChanged: { rep: number };
  stockChanged: { stock: number; capacity: number };

  supplierOffer: { offer: SupplierOffer };
  supplierOfferExpired: { id: number };
  supplierAccepted: { offer: SupplierOffer };
  customerOffer: { offer: CustomerOffer };
  customerOfferExpired: { id: number };
  customerAccepted: { offer: CustomerOffer };

  truckArriving: { kind: TruckKind; orderId: number };
  truckDocked: { kind: TruckKind; orderId: number };
  truckLeaving: { kind: TruckKind; orderId: number };

  palletPicked: { from: 'truck' | 'rack'; product: string };
  palletStored: { slot: number; product: string };
  palletLoaded: { remaining: number; product: string };
  deliveryComplete: { orderId: number };
  orderShipped: { orderId: number; revenue: number; profit: number; fast: boolean };
  orderMissed: { orderId: number };
  productUnlocked: { product: string };

  padPayment: { padId: string; paid: number; total: number };
  padUnlocked: { padId: string };
  rackRowBuilt: { rowIndex: number };
  upgradeBought: { upgrade: string };
  warehouseBuilt: Record<string, never>;

  tutorialStep: { id: string; text: string };
  tutorialDone: Record<string, never>;
  guideSay: { id: string; text: string; tap: boolean; target: string | null; skippable: boolean; autoHide: number };
  guideHide: Record<string, never>;
  guideContinue: Record<string, never>;
  workerHired: { workerId: number };
  workerLeft: { workerId: number };
  workersChanged: Record<string, never>;
  workerLevelUp: { workerId: number; level: number };
  workerAction: { workerId: number; action: 'unload' | 'store' | 'pick' | 'load' | 'drop'; product: string; x: number; z: number };
  palletDropped: { workerId: number; product: string };
  clerkDecided: { kind: TruckKind; accepted: boolean; text: string };
  toast: { text: string; kind: 'good' | 'bad' | 'info' | 'unlock' };
  ordersChanged: Record<string, never>;
};

export type TruckKind = 'supplier' | 'customer';
export type OrderState = 'offered' | 'accepted' | 'docked' | 'done';

export interface SupplierOffer {
  id: number;
  supplier: string;
  /** product id (see config/products.json) */
  product: string;
  pallets: number;
  pricePerPallet: number;
  expiresIn: number;
  free: boolean;
  /** pallets still on the truck once docked */
  remaining: number;
  state: OrderState;
}

export interface OrderLine {
  product: string;
  pallets: number;
  loaded: number;
  pricePerPallet: number;
  costBasisPerPallet: number;
}

export interface CustomerOffer {
  id: number;
  store: string;
  /** one line per product; mixed orders have two */
  lines: OrderLine[];
  expiresIn: number;
  deadline: number;
  deadlineTotal: number;
  state: OrderState;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(event: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event as string);
    if (!set) {
      set = new Set();
      this.handlers.set(event as string, set);
    }
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event as string);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
