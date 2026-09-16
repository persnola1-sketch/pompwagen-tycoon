import cfg from '../../config/workers.json';
import { EventBus } from '../EventBus';
import { GameState } from '../GameState';
import {
  Candidate, ClerkRules, DEFAULT_CLERK_RULES, ROLES, Role, TRAITS, Worker, WorkerLook,
  carryCapacity, hireCostFor, roleDef, traitDef, wageFor, xpForLevel,
} from './WorkerTypes';

export interface WorkersSave {
  workers: Worker[];
  candidates: Candidate[];
  refreshLeft: number;
  nextId: number;
  clerkRules: ClerkRules;
  wageTimer: number;
  coffeeMachine: boolean;
  canteen: boolean;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Staff roster: candidates (refresh timer / fee), hiring and firing, levels and
 * XP, wages per shift, temp workers, and the clerk's auto-accept rules.
 * Pure data; the WorkerAI drives the actual work and reports pallets moved.
 */
export class Workers {
  workers: Worker[] = [];
  candidates: Candidate[] = [];
  refreshLeft = 0;
  clerkRules: ClerkRules = { ...DEFAULT_CLERK_RULES };
  coffeeMachine = false;
  canteen = false;
  private nextId = 1;
  private wageTimer = 0;
  /** true while the night shift is active (workers on the night shift work, day shift rests) */
  night = false;

  constructor(private state: GameState, private bus: EventBus) {}

  // ---------- roster ----------

  get staff(): Worker[] {
    return this.workers.filter((w) => w.tempLeft === null);
  }

  get count(): number {
    return this.staff.length;
  }

  get nextHireCost(): number {
    return hireCostFor(this.count, 'steady');
  }

  /** how many staff the company may employ at its current level */
  get maxStaff(): number {
    const caps = cfg.maxWorkersPerLevel;
    return caps[Math.min(this.state.companyLevel, caps.length) - 1] ?? cfg.maxWorkers;
  }

  byId(id: number): Worker | undefined {
    return this.workers.find((w) => w.id === id);
  }

  hasRole(role: Role): boolean {
    return this.workers.some((w) => w.role === role);
  }

  /** roles a candidate may have right now */
  unlockedRoles(forkliftOwned: boolean): Role[] {
    return ROLES.filter((r) => this.count >= r.unlockWorkers && (r.id !== 'forklift' || forkliftOwned)).map((r) => r.id);
  }

  // ---------- candidates ----------

  private randomLook(): WorkerLook {
    const L = cfg.looks;
    const hats: WorkerLook['hat'][] = ['helmet', 'helmet', 'cap', 'none'];
    return {
      skin: pick(L.skins),
      hair: pick(L.hairs),
      shirt: pick(L.shirts),
      vest: pick(L.vests),
      hat: pick(hats),
      hatColor: pick([0xffc61a, 0xffffff, 0x2f6fb4, 0xf25c1a]),
      height: 0.92 + Math.random() * 0.16,
      mustache: Math.random() < 0.2,
    };
  }

  private randomName(): string {
    return `${pick(cfg.names.first)} ${pick(cfg.names.last)}`;
  }

  makeCandidate(forkliftOwned: boolean): Candidate {
    const roles = this.unlockedRoles(forkliftOwned);
    // prefer roles the team doesn't have yet
    const missing = roles.filter((r) => !this.hasRole(r));
    const role = missing.length && Math.random() < 0.7 ? pick(missing) : pick(roles);
    const trait = pick(TRAITS).id;
    const stars = 1 + Math.floor(Math.random() * 5);
    const hireCost = Math.round(hireCostFor(this.count, trait) * (0.9 + stars * 0.05));
    return {
      name: this.randomName(),
      role,
      trait,
      look: this.randomLook(),
      stars,
      hireCost,
      wage: wageFor(hireCost),
      level: traitDef(trait).startLevel ?? 1,
    };
  }

  refreshCandidates(forkliftOwned: boolean, paid = false): boolean {
    if (paid) {
      if (this.state.money < cfg.refreshFee) return false;
      this.state.addMoney(-cfg.refreshFee);
    }
    this.candidates = [];
    for (let i = 0; i < cfg.candidates; i++) this.candidates.push(this.makeCandidate(forkliftOwned));
    // the very first candidate is always an unloader at the base price so the tutorial works
    if (this.count === 0) {
      this.candidates[0].role = 'unloader';
      this.candidates[0].hireCost = cfg.hireCosts[0];
      this.candidates[0].wage = wageFor(cfg.hireCosts[0]);
      this.candidates[0].trait = 'steady';
      this.candidates[0].level = 1;
    }
    this.refreshLeft = cfg.refreshSeconds;
    this.bus.emit('workersChanged', {});
    return true;
  }

  // ---------- hiring ----------

  hire(index: number): Worker | null {
    const c = this.candidates[index];
    if (!c) return null;
    if (this.count >= this.maxStaff) {
      this.bus.emit('toast', {
        text: this.count >= cfg.maxWorkers ? 'Your team is full!' : `Reach company level ${this.state.companyLevel + 1} to hire more`,
        kind: 'bad',
      });
      return null;
    }
    if (this.state.money < c.hireCost) {
      this.bus.emit('toast', { text: 'Not enough money to hire!', kind: 'bad' });
      return null;
    }
    this.state.addMoney(-c.hireCost);
    const w: Worker = {
      id: this.nextId++,
      name: c.name,
      role: c.role,
      trait: c.trait,
      look: c.look,
      stars: c.stars,
      level: c.level,
      xp: 0,
      shift: 'day',
      wage: c.wage,
      hireCost: c.hireCost,
      certified: c.role !== 'forklift',
      trainingLeft: c.role === 'forklift' ? cfg.training.forkliftSeconds * (traitDef(c.trait).training ?? 1) : 0,
      tempLeft: null,
      stats: { moved: 0, shifts: 0, drops: 0 },
    };
    this.workers.push(w);
    this.candidates.splice(index, 1);
    // top the list back up with new faces
    while (this.candidates.length < cfg.candidates) this.candidates.push(this.makeCandidate(this.state.forklift));
    this.bus.emit('workerHired', { workerId: w.id });
    this.bus.emit('workersChanged', {});
    this.bus.emit('toast', { text: `${w.name} joined as ${roleDef(w.role).name}!`, kind: 'good' });
    return w;
  }

  fire(id: number): void {
    const i = this.workers.findIndex((w) => w.id === id);
    if (i < 0) return;
    const w = this.workers[i];
    this.workers.splice(i, 1);
    this.bus.emit('workerLeft', { workerId: id });
    this.bus.emit('workersChanged', {});
    this.bus.emit('toast', { text: `${w.name} left the company.`, kind: 'info' });
  }

  /** paid extra hands for a few minutes during a rush */
  hireTemp(free = false): Worker | null {
    if (!free) {
      if (this.state.money < cfg.temp.fee) {
        this.bus.emit('toast', { text: 'Not enough money!', kind: 'bad' });
        return null;
      }
      this.state.addMoney(-cfg.temp.fee);
    }
    const role: Role = this.hasRole('loader') && !this.hasRole('unloader') ? 'unloader' : Math.random() < 0.5 ? 'unloader' : 'loader';
    const w: Worker = {
      id: this.nextId++,
      name: `${this.randomName()} (temp)`,
      role,
      trait: 'steady',
      look: this.randomLook(),
      stars: 3,
      level: 3,
      xp: 0,
      shift: 'day',
      wage: 0,
      hireCost: 0,
      certified: true,
      trainingLeft: 0,
      tempLeft: cfg.temp.seconds,
      stats: { moved: 0, shifts: 0, drops: 0 },
    };
    this.workers.push(w);
    this.bus.emit('workerHired', { workerId: w.id });
    this.bus.emit('workersChanged', {});
    this.bus.emit('toast', { text: `Temp worker ${w.name.split(' ')[0]} helps for ${cfg.temp.seconds / 60} min!`, kind: 'good' });
    return w;
  }

  setShift(id: number, shift: 'day' | 'night'): void {
    const w = this.byId(id);
    if (!w) return;
    w.shift = shift;
    this.bus.emit('workersChanged', {});
  }

  // ---------- progression ----------

  /** called by the AI for every pallet a worker moves */
  addXp(w: Worker, pallets = 1): void {
    w.stats.moved += pallets;
    this.state.stats.workerMoved += pallets;
    if (w.level >= cfg.maxLevel) return;
    w.xp += Math.round(cfg.xpPerPallet * pallets * (traitDef(w.trait).xp ?? 1));
    let leveled = false;
    while (w.level < cfg.maxLevel && w.xp >= xpForLevel(w.level)) {
      w.xp -= xpForLevel(w.level);
      w.level++;
      leveled = true;
    }
    if (leveled) {
      this.bus.emit('workerLevelUp', { workerId: w.id, level: w.level });
      this.bus.emit('workersChanged', {});
    }
  }

  capacity(w: Worker): number {
    return carryCapacity(w);
  }

  // ---------- per-frame ----------

  update(dt: number, forkliftOwned: boolean): void {
    if (!this.candidates.length) this.refreshCandidates(forkliftOwned);
    this.refreshLeft -= dt;
    if (this.refreshLeft <= 0) this.refreshCandidates(forkliftOwned);

    for (const w of this.workers) {
      if (w.trainingLeft > 0) {
        w.trainingLeft = Math.max(0, w.trainingLeft - dt);
        if (w.trainingLeft === 0) {
          w.certified = true;
          this.bus.emit('toast', { text: `${w.name} is now a certified forklift driver!`, kind: 'good' });
          this.bus.emit('workersChanged', {});
        }
      }
    }
    for (let i = this.workers.length - 1; i >= 0; i--) {
      const w = this.workers[i];
      if (w.tempLeft !== null) {
        w.tempLeft -= dt;
        if (w.tempLeft <= 0) {
          this.workers.splice(i, 1);
          this.bus.emit('workerLeft', { workerId: w.id });
          this.bus.emit('workersChanged', {});
          this.bus.emit('toast', { text: `Temp worker ${w.name.split(' ')[0]} finished their shift.`, kind: 'info' });
        }
      }
    }

    // wages once per shift of play time (never during the tutorial)
    if (this.staff.length && this.state.tutorialDone) {
      this.wageTimer += dt;
      if (this.wageTimer >= cfg.shiftMinutes * 60) {
        this.wageTimer = 0;
        const total = this.staff.reduce((s, w) => s + w.wage, 0);
        for (const w of this.staff) w.stats.shifts++;
        if (total > 0) {
          this.state.addMoney(-Math.min(total, this.state.money));
          this.bus.emit('toast', { text: `Wages paid: €${total}`, kind: 'info' });
        }
      }
    }
  }

  // ---------- save ----------

  toSave(): WorkersSave {
    return {
      workers: this.workers.map((w) => ({ ...w, stats: { ...w.stats }, look: { ...w.look } })),
      candidates: this.candidates.map((c) => ({ ...c, look: { ...c.look } })),
      refreshLeft: this.refreshLeft,
      nextId: this.nextId,
      clerkRules: { ...this.clerkRules },
      wageTimer: this.wageTimer,
      coffeeMachine: this.coffeeMachine,
      canteen: this.canteen,
    };
  }

  loadFrom(s: WorkersSave | undefined): void {
    if (!s) return;
    this.workers = (s.workers ?? []).map((w) => ({ ...w, tempLeft: w.tempLeft ?? null, stats: { ...{ moved: 0, shifts: 0, drops: 0 }, ...w.stats } }));
    this.candidates = s.candidates ?? [];
    this.refreshLeft = s.refreshLeft ?? 0;
    this.nextId = s.nextId ?? this.workers.reduce((m, w) => Math.max(m, w.id + 1), 1);
    this.clerkRules = { ...DEFAULT_CLERK_RULES, ...(s.clerkRules ?? {}) };
    this.wageTimer = s.wageTimer ?? 0;
    this.coffeeMachine = !!s.coffeeMachine;
    this.canteen = !!s.canteen;
  }
}
