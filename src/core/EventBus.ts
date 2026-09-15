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

  palletPicked: { from: 'truck' | 'rack' };
  palletStored: { slot: number };
  palletLoaded: { remaining: number };
  deliveryComplete: { orderId: number };
  orderShipped: { orderId: number; revenue: number; profit: number; fast: boolean };
  orderMissed: { orderId: number };

  padPayment: { padId: string; paid: number; total: number };
  padUnlocked: { padId: string };
  rackRowBuilt: { rowIndex: number };
  upgradeBought: { upgrade: string };

  tutorialStep: { id: string; text: string };
  tutorialDone: Record<string, never>;
  toast: { text: string; kind: 'good' | 'bad' | 'info' };
  ordersChanged: Record<string, never>;
};

export type TruckKind = 'supplier' | 'customer';

export interface SupplierOffer {
  id: number;
  supplier: string;
  product: string;
  pallets: number;
  pricePerPallet: number;
  expiresIn: number;
  free: boolean;
  /** pallets still on the truck once docked */
  remaining: number;
  state: 'offered' | 'accepted' | 'docked' | 'done';
}

export interface CustomerOffer {
  id: number;
  store: string;
  product: string;
  pallets: number;
  pricePerPallet: number;
  costBasisPerPallet: number;
  expiresIn: number;
  deadline: number;
  deadlineTotal: number;
  loaded: number;
  state: 'offered' | 'accepted' | 'docked' | 'done';
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
