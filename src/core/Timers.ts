import cfg from '../config/construction.json';
import { EventBus } from './EventBus';

export type JobKind = 'construction' | 'delivery';

export interface Job {
  id: number;
  kind: JobKind;
  /** what is being built or delivered, e.g. 'rackRow', 'electric', 'forklift' */
  item: string;
  /** item index (rack row number, conveyor id …) */
  index: number;
  label: string;
  total: number;
  left: number;
  /** delivery only: the truck has been sent */
  dispatched: boolean;
}

export interface TimersSave {
  jobs: Job[];
  nextId: number;
}

/**
 * Real-time construction and delivery jobs. Paying for something starts a job;
 * the world shows a construction site or a delivery truck, and the effect is
 * applied when the job completes (or is finished early with an ad/fee).
 */
export class Timers {
  jobs: Job[] = [];
  private nextId = 1;

  constructor(private bus: EventBus) {}

  constructionSeconds(item: string, index = 0): number {
    const c = cfg.construction as Record<string, number | number[]>;
    const v = c[item];
    if (Array.isArray(v)) return v[Math.min(index, v.length - 1)];
    return typeof v === 'number' ? v : 30;
  }

  deliverySeconds(item: string): number {
    const d = cfg.delivery as Record<string, number>;
    return d[item] ?? 60;
  }

  start(kind: JobKind, item: string, index: number, label: string, seconds?: number): Job {
    const total = seconds ?? (kind === 'construction' ? this.constructionSeconds(item, index) : this.deliverySeconds(item));
    const job: Job = { id: this.nextId++, kind, item, index, label, total, left: total, dispatched: false };
    this.jobs.push(job);
    this.bus.emit('jobStarted', { job });
    return job;
  }

  has(item: string, index?: number): boolean {
    return this.jobs.some((j) => j.item === item && (index === undefined || j.index === index));
  }

  get(id: number): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  /** price to finish now with money */
  finishPrice(job: Job): number {
    return Math.max(cfg.finishNow.minPrice, Math.ceil(job.left * cfg.finishNow.pricePerSecond));
  }

  finishNow(id: number): void {
    const job = this.get(id);
    if (!job) return;
    job.left = 0;
  }

  finishAll(): void {
    for (const j of this.jobs) j.left = 0;
  }

  update(dt: number): void {
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i];
      j.left = Math.max(0, j.left - dt);
      if (j.kind === 'delivery' && !j.dispatched && j.left <= cfg.delivery.truckLeadSeconds) {
        j.dispatched = true;
        this.bus.emit('deliveryDispatched', { job: j });
      }
      if (j.left <= 0) {
        this.jobs.splice(i, 1);
        this.bus.emit('jobDone', { job: j });
      }
    }
  }

  toSave(): TimersSave {
    return { jobs: this.jobs.map((j) => ({ ...j })), nextId: this.nextId };
  }

  loadFrom(s: TimersSave | undefined): void {
    if (!s) return;
    this.jobs = (s.jobs ?? []).map((j) => ({ ...j, dispatched: false }));
    this.nextId = s.nextId ?? 1;
  }
}
