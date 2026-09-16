import cfg from '../../config/quests.json';
import { EventBus } from '../EventBus';
import { GameState } from '../GameState';
import { Workers } from '../workers/Workers';
import { MetricSource, metricValue } from './Metrics';

export type QuestTab = 'story' | 'daily' | 'achievements';

export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  metric: string;
  target: number;
  money: number;
  xp: number;
  rep?: number;
  badge?: string;
}

export interface Quest {
  defId: string;
  tab: QuestTab | 'client';
  title: string;
  desc: string;
  metric: string;
  target: number;
  /** metric value when the quest started (daily/client quests count from there) */
  baseline: number;
  money: number;
  xp: number;
  rep: number;
  badge?: string;
  claimed: boolean;
  /** seconds left, for client quests */
  expiresIn?: number;
}

export interface QuestsSave {
  story: Quest[];
  daily: Quest[];
  achievements: Quest[];
  client: Quest[];
  day: number;
  counters: Record<string, number>;
  storyIndex: number;
}

const STORY: QuestDef[] = cfg.story as QuestDef[];
const ACHIEVEMENTS: QuestDef[] = cfg.achievements as QuestDef[];

function today(): number {
  return Math.floor(Date.now() / 86400000);
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Quests, company level and rewards. Story quests unlock one at a time and
 * guide progression, three daily quests reset every day, achievements are
 * long-term milestones, and client quests are timed requests from the random
 * events. Every quest measures one metric; daily and client quests count from
 * a baseline taken when they appear.
 */
export class Quests {
  story: Quest[] = [];
  daily: Quest[] = [];
  achievements: Quest[] = [];
  client: Quest[] = [];
  private counters: Record<string, number> = {};
  private day = 0;
  private storyIndex = 0;

  constructor(private state: GameState, private workers: Workers, private bus: EventBus) {
    this.bus.on('palletStored', () => this.bump('stored'));
    this.bus.on('workerLevelUp', () => this.bump('workerLevelUps'));
    this.bus.on('orderShipped', ({ store }) => {
      const key = `client:${store}`;
      if (!this.counters[key]) {
        this.counters[key] = 1;
        this.bump('clientsServed');
      }
    });
  }

  private bump(key: string, n = 1): void {
    this.counters[key] = (this.counters[key] ?? 0) + n;
  }

  private get src(): MetricSource {
    return { state: this.state, workers: this.workers, counters: this.counters };
  }

  private make(def: QuestDef, tab: QuestTab | 'client', fromBaseline: boolean, expiresIn?: number): Quest {
    return {
      defId: def.id,
      tab,
      title: def.title,
      desc: def.desc.replace('{target}', def.target.toLocaleString('en')),
      metric: def.metric,
      target: def.target,
      baseline: fromBaseline ? metricValue(def.metric, this.src) : 0,
      money: def.money,
      xp: def.xp,
      rep: def.rep ?? 0,
      badge: def.badge,
      claimed: false,
      expiresIn,
    };
  }

  /** current progress of a quest, clamped to its target */
  progress(q: Quest): number {
    return Math.max(0, Math.min(q.target, metricValue(q.metric, this.src) - q.baseline));
  }

  isDone(q: Quest): boolean {
    return this.progress(q) >= q.target;
  }

  /** quests with a reward waiting to be collected */
  get claimable(): number {
    return this.all.filter((q) => !q.claimed && this.isDone(q)).length;
  }

  get all(): Quest[] {
    return [...this.story, ...this.daily, ...this.achievements, ...this.client];
  }

  /** the quest shown in the HUD widget: the nearest unfinished goal */
  get tracked(): Quest | null {
    const open = [...this.client, ...this.story, ...this.daily].filter((q) => !q.claimed);
    const ready = open.find((q) => this.isDone(q));
    if (ready) return ready;
    return open.sort((a, b) => this.progress(b) / b.target - this.progress(a) / a.target)[0] ?? null;
  }

  // ---------- lifecycle ----------

  /** recompute the company level from the saved XP (levels can be retuned between updates) */
  syncLevel(): void {
    const levels = cfg.companyLevelXp;
    let lvl = 1;
    while (lvl < levels.length && this.state.companyXp >= levels[lvl]) lvl++;
    this.state.companyLevel = lvl;
  }

  start(): void {
    this.syncLevel();
    if (!this.story.length) this.openNextStory();
    if (this.day !== today()) this.rollDaily();
    if (!this.achievements.length) this.achievements = ACHIEVEMENTS.map((d) => this.make(d, 'achievements', false));
  }

  private openNextStory(): void {
    const def = STORY[this.storyIndex];
    if (!def) return;
    // only one story quest is open at a time
    if (this.story.some((q) => !q.claimed)) return;
    this.story = [this.make(def, 'story', false)];
    this.bus.emit('questsChanged', {});
  }

  rollDaily(): void {
    this.day = today();
    // daily counters start fresh every day
    for (const k of Object.keys(this.counters)) delete this.counters[k];
    const pool = [...cfg.daily];
    this.daily = [];
    for (let i = 0; i < cfg.dailyCount && pool.length; i++) {
      const def = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const target = randInt(def.min, def.max);
      this.daily.push(this.make({ ...def, target } as QuestDef, 'daily', true));
    }
    this.bus.emit('questsChanged', {});
  }

  /** timed request from a client (spawned by the VIP event) */
  addClientQuest(def: QuestDef, seconds: number): Quest {
    const q = this.make(def, 'client', true, seconds);
    this.client.push(q);
    this.bus.emit('questsChanged', {});
    return q;
  }

  claim(q: Quest, multiplier = 1): boolean {
    if (q.claimed || !this.isDone(q)) return false;
    q.claimed = true;
    const money = Math.round(q.money * multiplier);
    const xp = Math.round(q.xp * multiplier);
    this.state.addMoney(money);
    this.addCompanyXp(xp);
    if (q.rep) this.state.addReputation(q.rep);
    this.bus.emit('questClaimed', { title: q.title, money, xp });
    if (q.tab === 'story') {
      this.storyIndex++;
      this.story = [];
      this.openNextStory();
    }
    if (q.tab === 'client') this.client = this.client.filter((c) => c !== q);
    this.bus.emit('questsChanged', {});
    return true;
  }

  /** claim every finished quest at once */
  claimAll(): number {
    let n = 0;
    for (const q of this.all) if (!q.claimed && this.isDone(q) && this.claim(q)) n++;
    return n;
  }

  addCompanyXp(xp: number): void {
    if (xp <= 0) return;
    this.state.companyXp += xp;
    const levels = cfg.companyLevelXp;
    let lvl = this.state.companyLevel;
    while (lvl < levels.length && this.state.companyXp >= levels[lvl]) lvl++;
    if (lvl !== this.state.companyLevel) {
      this.state.companyLevel = lvl;
      this.bus.emit('companyLevelUp', { level: lvl });
    }
    this.bus.emit('companyXpChanged', { xp: this.state.companyXp, level: this.state.companyLevel });
  }

  /** xp inside the current level and what the next level needs */
  levelProgress(): { into: number; need: number } {
    const levels = cfg.companyLevelXp;
    const lvl = this.state.companyLevel;
    const from = levels[lvl - 1] ?? 0;
    const to = levels[lvl] ?? levels[levels.length - 1];
    return { into: Math.max(0, this.state.companyXp - from), need: Math.max(1, to - from) };
  }

  update(dt: number): void {
    if (this.day !== today()) this.rollDaily();
    for (let i = this.client.length - 1; i >= 0; i--) {
      const q = this.client[i];
      if (q.expiresIn === undefined) continue;
      q.expiresIn -= dt;
      if (this.isDone(q)) continue;
      if (q.expiresIn <= 0) {
        this.client.splice(i, 1);
        this.bus.emit('toast', { text: `Missed: ${q.title}`, kind: 'bad' });
        this.bus.emit('questsChanged', {});
      }
    }
    // story quests advance automatically as soon as their goal is reachable
    if (!this.story.length) this.openNextStory();
  }

  toSave(): QuestsSave {
    return {
      story: this.story.map((q) => ({ ...q })),
      daily: this.daily.map((q) => ({ ...q })),
      achievements: this.achievements.map((q) => ({ ...q })),
      client: this.client.map((q) => ({ ...q })),
      day: this.day,
      counters: { ...this.counters },
      storyIndex: this.storyIndex,
    };
  }

  loadFrom(s: QuestsSave | undefined): void {
    if (!s) return;
    this.story = s.story ?? [];
    this.daily = s.daily ?? [];
    this.achievements = s.achievements ?? [];
    this.client = (s.client ?? []).map((q) => ({ ...q, expiresIn: q.expiresIn ?? 60 }));
    this.day = s.day ?? 0;
    this.counters = s.counters ?? {};
    this.storyIndex = s.storyIndex ?? 0;
    // new achievements added in an update show up for existing players
    for (const def of ACHIEVEMENTS) {
      if (!this.achievements.some((q) => q.defId === def.id)) this.achievements.push(this.make(def, 'achievements', false));
    }
  }
}
