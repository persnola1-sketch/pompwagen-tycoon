import { GameState } from '../GameState';
import { Workers } from '../workers/Workers';

/** every value a quest can be measured against */
export interface MetricSource {
  state: GameState;
  workers: Workers;
  /** counters the quest system keeps itself (reset with the daily quests) */
  counters: Record<string, number>;
}

export type MetricId =
  | 'shipped' | 'unloaded' | 'stored' | 'ordersDone' | 'onTime' | 'earned' | 'palletsMoved'
  | 'workers' | 'maxWorkerLevel' | 'workerLevelUps' | 'clientsServed'
  | 'rackRows' | 'upperLevels' | 'productsUnlocked' | 'electric' | 'forklift' | 'conveyors'
  | 'reputation' | 'companyLevel';

export function metricValue(id: string, src: MetricSource): number {
  const { state, workers, counters } = src;
  switch (id as MetricId) {
    case 'shipped':
      return state.stats.shipped;
    case 'unloaded':
      return state.stats.unloaded;
    case 'stored':
      return counters.stored ?? 0;
    case 'ordersDone':
      return state.stats.ordersDone;
    case 'onTime':
      return state.stats.ordersOnTime;
    case 'earned':
      return Math.floor(state.stats.earned);
    case 'palletsMoved':
      return state.stats.shipped + state.stats.unloaded + state.stats.workerMoved;
    case 'workers':
      return workers.count;
    case 'maxWorkerLevel':
      return workers.workers.reduce((m, w) => Math.max(m, w.level), 0);
    case 'workerLevelUps':
      return counters.workerLevelUps ?? 0;
    case 'clientsServed':
      return counters.clientsServed ?? 0;
    case 'rackRows':
      return state.rackRows;
    case 'upperLevels':
      return state.upperLevels.reduce((s, n) => s + n, 0);
    case 'productsUnlocked':
      return state.unlocked.length;
    case 'electric':
      return state.electric ? 1 : 0;
    case 'forklift':
      return state.forklift ? 1 : 0;
    case 'conveyors':
      return (state.conveyorIn ? 1 : 0) + (state.conveyorOut ? 1 : 0);
    case 'reputation':
      return state.reputation;
    case 'companyLevel':
      return state.companyLevel;
    default:
      return counters[id] ?? 0;
  }
}
