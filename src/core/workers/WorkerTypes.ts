import cfg from '../../config/workers.json';

export type Role = 'unloader' | 'loader' | 'clerk' | 'forklift' | 'teamlead';
export type Shift = 'day' | 'night';
export type WorkerStatus = 'idle' | 'carrying' | 'break' | 'waiting' | 'training' | 'walking' | 'offduty';

export interface TraitDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  speed?: number;
  speedEmpty?: number;
  drop?: number;
  breakLen?: number;
  xp?: number;
  night?: number;
  training?: number;
  cost?: number;
  aura?: number;
  startLevel?: number;
}

export interface RoleDef {
  id: Role;
  name: string;
  emoji: string;
  desc: string;
  unlockWorkers: number;
}

export interface WorkerLook {
  skin: number;
  hair: number;
  shirt: number;
  vest: number;
  hat: 'helmet' | 'cap' | 'none';
  hatColor: number;
  height: number;
  mustache: boolean;
}

export interface WorkerStats {
  moved: number;
  shifts: number;
  drops: number;
}

export interface Worker {
  id: number;
  name: string;
  role: Role;
  trait: string;
  look: WorkerLook;
  stars: number;
  level: number;
  xp: number;
  shift: Shift;
  wage: number;
  hireCost: number;
  certified: boolean;
  trainingLeft: number;
  /** temp workers leave when this reaches 0 (seconds); null for permanent staff */
  tempLeft: number | null;
  stats: WorkerStats;
}

export interface Candidate {
  name: string;
  role: Role;
  trait: string;
  look: WorkerLook;
  stars: number;
  hireCost: number;
  wage: number;
  level: number;
}

export interface ClerkRules {
  autoBuy: boolean;
  buyIfStockBelow: number;
  maxSpendPerOffer: number;
  autoSell: boolean;
  onlyAcceptInStock: boolean;
}

export const DEFAULT_CLERK_RULES: ClerkRules = {
  autoBuy: true,
  buyIfStockBelow: 10,
  maxSpendPerOffer: 500,
  autoSell: true,
  onlyAcceptInStock: true,
};

export const ROLES: RoleDef[] = cfg.roles as RoleDef[];
export const TRAITS: TraitDef[] = cfg.traits as TraitDef[];

export function roleDef(id: Role): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[0];
}

export function traitDef(id: string): TraitDef {
  return TRAITS.find((t) => t.id === id) ?? TRAITS[0];
}

export function xpForLevel(level: number): number {
  return Math.round(cfg.xpBase * Math.pow(level, cfg.xpExponent));
}

/** speed multiplier from level, trait and shift */
export function speedMultiplier(w: Worker, carrying: boolean, night: boolean): number {
  const t = traitDef(w.trait);
  let m = 1 + (w.level - 1) * cfg.speedPerLevel;
  m *= t.speed ?? 1;
  if (!carrying) m *= t.speedEmpty ?? 1;
  if (night && w.shift === 'night') m *= t.night ?? 1;
  return m;
}

export function carryCapacity(w: Worker): number {
  return w.level >= cfg.electricLevel ? 2 : 1;
}

export function hireCostFor(index: number, trait: string): number {
  const base = cfg.hireCosts[index] ?? cfg.hireCosts[cfg.hireCosts.length - 1] * Math.pow(cfg.hireCostGrowth, index - cfg.hireCosts.length + 1);
  return Math.round((base * (traitDef(trait).cost ?? 1)) / 10) * 10;
}

export function wageFor(hireCost: number): number {
  return Math.max(cfg.wageMin, Math.round(hireCost * cfg.wageFractionOfHire));
}
