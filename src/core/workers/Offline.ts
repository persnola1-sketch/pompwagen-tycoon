import cfg from '../../config/workers.json';
import { GameState } from '../GameState';
import { Workers } from './Workers';
import { speedMultiplier, xpForLevel } from './WorkerTypes';

export interface ShiftReport {
  minutes: number;
  pallets: number;
  earned: number;
  wages: number;
  levelUps: { name: string; level: number }[];
  workers: number;
}

/**
 * Night shift: workers assigned to the night shift keep working while the
 * game is closed (capped), earning a fraction of the live profit per pallet
 * based on their real work rate and the stock/products available.
 */
export function simulateOfflineShift(state: GameState, workers: Workers, elapsedMs: number): ShiftReport | null {
  const minutes = Math.min(cfg.offline.capHours * 60, elapsedMs / 60000);
  if (minutes < cfg.offline.minMinutes) return null;
  const night = workers.staff.filter((w) => w.shift === 'night' && (w.role === 'unloader' || w.role === 'loader' || w.role === 'forklift'));
  if (!night.length) return null;

  const unlocked = state.unlocked;
  const margin = unlocked.reduce((s, p) => s + ((p.sellMin + p.sellMax) / 2 - (p.buyMin + p.buyMax) / 2), 0) / Math.max(1, unlocked.length);
  // an unloader alone can't sell; a loader alone runs out of stock — the pair is what makes money
  const hasIn = night.some((w) => w.role === 'unloader' || w.role === 'forklift');
  const hasOut = night.some((w) => w.role === 'loader' || w.role === 'forklift');
  const balance = hasIn && hasOut ? 1 : 0.45;

  let pallets = 0;
  const levelUps: ShiftReport['levelUps'] = [];
  for (const w of night) {
    const rate = cfg.offline.palletsPerMinutePerWorker * speedMultiplier(w, true, true);
    const moved = Math.round(rate * minutes * balance);
    pallets += moved;
    w.stats.moved += moved;
    w.stats.shifts += Math.max(1, Math.floor(minutes / cfg.shiftMinutes));
    const before = w.level;
    w.xp += Math.round(cfg.xpPerPallet * moved * 0.5);
    while (w.level < cfg.maxLevel && w.xp >= xpForLevel(w.level)) {
      w.xp -= xpForLevel(w.level);
      w.level++;
    }
    if (w.level > before) levelUps.push({ name: w.name, level: w.level });
  }
  const earned = Math.round(pallets * margin * cfg.offline.profitFraction);
  const wages = Math.round(night.reduce((s, w) => s + w.wage, 0) * Math.max(1, Math.floor(minutes / cfg.shiftMinutes)) * 0.5);
  const net = Math.max(0, earned - wages);
  state.addMoney(net);
  state.stats.workerMoved += pallets;
  return { minutes: Math.round(minutes), pallets, earned, wages: Math.min(wages, earned), levelUps, workers: night.length };
}
