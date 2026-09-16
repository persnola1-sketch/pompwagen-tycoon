import * as THREE from 'three';
import economy from '../config/economy.json';
import layout from '../config/layout.json';
import { Sound } from '../audio/Sound';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { SaveSystem } from '../core/SaveSystem';
import { Timers } from '../core/Timers';
import { Effects } from '../world/Effects';
import { Pads } from '../world/Pads';
import { Player } from '../world/Player';
import { rowLetter, rowPadZ } from '../world/Racks';

const R = layout.rackRows;
const PP = economy.payPads;
const SPEED = PP.speedUpgrade;

const rowPadId = (row: number): string => `rack-row-${row}`;
const eur = (n: number): string => `€${n.toLocaleString('en')}`;

/**
 * Pay-by-standing pads: one unlock pad on the empty floor of every future rack
 * row (only the next one is buyable, the rest show their price locked), the
 * faster-wheels upgrade, the electric pompwagen and the BUY WAREHOUSE pad.
 * Rack rows and vehicles start a timer job instead of appearing instantly.
 */
export class PayPads {
  private coinTimer = 0;
  /** fires once the BUY WAREHOUSE pad is paid off */
  onWarehouseBought: (() => void) | null = null;

  constructor(
    private state: GameState,
    private bus: EventBus,
    private pads: Pads,
    private player: Player,
    private effects: Effects,
    private sound: Sound,
    private save: SaveSystem,
    private timers: Timers,
  ) {
    this.refreshAll();
  }

  refreshAll(): void {
    this.refreshRowPads();
    this.refreshSpeedPad();
    this.refreshElectricPad();
    this.refreshUpperPad();
    this.refreshParkingPad();
    this.refreshConveyorPad('In');
    this.refreshConveyorPad('Out');
    this.refreshWarehousePad();
  }

  private refreshWarehousePad(): void {
    const id = 'buy-warehouse';
    if (this.state.warehouseBuilt) {
      this.pads.remove(id);
      return;
    }
    const p = layout.plot.pad;
    const cost = economy.warehouse.cost;
    if (!this.pads.has(id)) this.pads.create(id, p.x, p.z, ['BUY WAREHOUSE', eur(cost)], '#38d15e', { withBar: true, size: 3.2, icon: '🏭' });
    this.pads.setProgress(id, (this.state.padProgress[id] ?? 0) / cost);
  }

  private rowCost(row: number): number {
    return PP.rackRowCosts[row - R.startRows] ?? Infinity;
  }

  /** the next row to buy: first row that is neither built nor under construction */
  private nextRow(): number {
    let row = this.state.rackRows;
    while (row < R.rows.length && this.timers.has('rackRow', row)) row++;
    return row;
  }

  refreshRowPads(): void {
    const next = this.nextRow();
    for (let row = R.startRows; row < R.rows.length; row++) {
      const id = rowPadId(row);
      const cost = this.rowCost(row);
      if (row < next || !isFinite(cost)) {
        this.pads.remove(id);
        continue;
      }
      const isNext = row === next;
      const lines = isNext ? ['NEW RACK ROW', eur(cost)] : [`ROW ${rowLetter(row)}`, `${eur(cost)} 🔒`];
      const accent = isNext ? '#38d15e' : '#aeb5c2';
      if (!this.pads.has(id)) this.pads.create(id, R.rows[row].x, rowPadZ(row), lines, accent, { withBar: true, locked: !isNext, icon: '🏗️' });
      else this.pads.setLabel(id, lines, accent, !isNext);
      this.pads.setActive(id, isNext);
      this.pads.setProgress(id, isNext ? (this.state.padProgress[id] ?? 0) / cost : 0);
    }
  }

  private refreshSpeedPad(): void {
    const p = layout.pads.upgradeSpeed;
    const lvl = this.state.speedLevel;
    const maxed = lvl >= SPEED.costs.length;
    const lines = maxed ? ['SPEED MAX', `LV ${lvl}`] : ['FASTER WHEELS', `${eur(SPEED.costs[lvl])} · LV${lvl + 1}`];
    const accent = maxed ? '#8a92a5' : '#ffb020';
    if (!this.pads.has('upgrade-speed')) this.pads.create('upgrade-speed', p.x, p.z, lines, accent, { withBar: true, locked: maxed, icon: '⚡' });
    else this.pads.setLabel('upgrade-speed', lines, accent, maxed);
    this.pads.setActive('upgrade-speed', !maxed);
    this.pads.setProgress('upgrade-speed', maxed ? 0 : (this.state.padProgress['upgrade-speed'] ?? 0) / SPEED.costs[lvl]);
  }

  /** a pad is only buyable once the company has reached its level */
  private levelOk(key: keyof typeof PP.levels): boolean {
    return this.state.companyLevel >= PP.levels[key];
  }

  /** the vehicle pad sells the electric pompwagen first, then the forklift */
  private vehicleOffer(): { item: 'electric' | 'forklift' | null; cost: number; lines: string[]; icon: string } {
    if (!this.state.electric) {
      const coming = this.timers.has('electric');
      const locked = !this.levelOk('electric');
      const lines = coming ? ['ELECTRIC', 'ON THE WAY 🚚'] : locked ? ['ELECTRIC', `LEVEL ${PP.levels.electric} 🔒`] : ['ELECTRIC', `POMPWAGEN ${eur(PP.electricPompwagen)}`];
      return { item: coming || locked ? null : 'electric', cost: PP.electricPompwagen, lines, icon: '🔋' };
    }
    if (!this.state.forklift) {
      const coming = this.timers.has('forklift');
      const locked = !this.levelOk('forklift');
      const lines = coming ? ['FORKLIFT', 'ON THE WAY 🚚'] : locked ? ['FORKLIFT', `LEVEL ${PP.levels.forklift} 🔒`] : ['FORKLIFT', eur(PP.forklift)];
      return { item: coming || locked ? null : 'forklift', cost: PP.forklift, lines, icon: '🚜' };
    }
    return { item: null, cost: Infinity, lines: ['REACH TRUCK', 'COMING SOON'], icon: '🏗️' };
  }

  private refreshElectricPad(): void {
    const p = layout.pads.upgradeElectric;
    const o = this.vehicleOffer();
    const locked = o.item === null;
    const accent = locked ? '#8a92a5' : '#38d15e';
    if (!this.pads.has('upgrade-electric')) this.pads.create('upgrade-electric', p.x, p.z, o.lines, accent, { withBar: true, locked, icon: o.icon });
    else this.pads.setLabel('upgrade-electric', o.lines, accent, locked, o.icon);
    this.pads.setActive('upgrade-electric', !locked);
    this.pads.setProgress('upgrade-electric', locked ? 0 : (this.state.padProgress['upgrade-electric'] ?? 0) / o.cost);
  }

  /** which row gets the next upper level, and what it costs */
  private upperOffer(): { row: number; level: number; cost: number } | null {
    if (!this.state.forklift || !this.levelOk('upperLevel')) return null;
    let best = -1;
    for (let r = 0; r < this.state.rackRows; r++) {
      if (this.timers.has('upperLevel', r)) continue;
      if (this.state.upperLevels[r] >= layout.rackRows.levels - 1) continue;
      if (best < 0 || this.state.upperLevels[r] < this.state.upperLevels[best]) best = r;
    }
    if (best < 0) return null;
    const level = this.state.upperLevels[best] + 1;
    const cost = PP.upperLevelCosts[level - 1] ?? Infinity;
    return { row: best, level, cost };
  }

  private refreshUpperPad(): void {
    const p = layout.pads.upgradeUpper;
    const o = this.upperOffer();
    const lines = !this.state.forklift ? ['UPPER RACKS', 'NEEDS FORKLIFT 🔒'] : o ? [`RACK LEVEL ${o.level + 1}`, `ROW ${rowLetter(o.row)} · ${eur(o.cost)}`] : ['UPPER RACKS', 'ALL BUILT ✔'];
    const locked = !o;
    const accent = locked ? '#8a92a5' : '#38d15e';
    if (!this.pads.has('upgrade-upper')) this.pads.create('upgrade-upper', p.x, p.z, lines, accent, { withBar: true, locked, icon: '🪜' });
    else this.pads.setLabel('upgrade-upper', lines, accent, locked);
    this.pads.setActive('upgrade-upper', !locked);
    this.pads.setProgress('upgrade-upper', o ? (this.state.padProgress['upgrade-upper'] ?? 0) / o.cost : 0);
  }

  /** conveyors unlock once the warehouse is busy enough to need them */
  get conveyorsUnlocked(): boolean {
    return this.state.stats.shipped >= PP.conveyorUnlockShipped && this.levelOk('conveyor');
  }

  private refreshConveyorPad(kind: 'In' | 'Out'): void {
    const id = `conveyor-${kind.toLowerCase()}`;
    const path = kind === 'In' ? layout.conveyors.inbound.path : layout.conveyors.outbound.path;
    const [x, z] = path[0];
    const owned = kind === 'In' ? this.state.conveyorIn : this.state.conveyorOut;
    const coming = this.timers.has(`conveyor${kind}`);
    const cost = kind === 'In' ? PP.conveyorIn : PP.conveyorOut;
    const title = kind === 'In' ? 'INBOUND BELT' : 'OUTBOUND BELT';
    if (owned) {
      this.pads.remove(id);
      return;
    }
    const ready = this.conveyorsUnlocked && !coming;
    const lines = coming
      ? [title, 'BUILDING 🏗️']
      : this.conveyorsUnlocked
        ? [title, eur(cost)]
        : [title, `SHIP ${PP.conveyorUnlockShipped} 🔒`];
    const accent = ready ? '#38d15e' : '#aeb5c2';
    if (!this.pads.has(id)) this.pads.create(id, x, z, lines, accent, { withBar: true, locked: !ready, icon: '📦' });
    else this.pads.setLabel(id, lines, accent, !ready);
    this.pads.setActive(id, ready);
    this.pads.setProgress(id, ready ? (this.state.padProgress[id] ?? 0) / cost : 0);
  }

  private refreshParkingPad(): void {
    const p = layout.pads.parking;
    const lines = this.state.forklift ? ['PARKING', 'switch vehicle'] : ['PARKING', 'forklift bay'];
    if (!this.pads.has('parking')) this.pads.create('parking', p.x, p.z, lines, '#7ec8ff', { icon: '🅿️', size: 2.4 });
    else this.pads.setLabel('parking', lines, '#7ec8ff', false);
  }

  update(dt: number): void {
    if (!this.state.warehouseBuilt) {
      this.pay('buy-warehouse', dt, economy.warehouse.cost, () => {
        this.state.warehouseBuilt = true;
        this.refreshWarehousePad();
        this.bus.emit('upgradeBought', { upgrade: 'warehouse' });
        this.onWarehouseBought?.();
      });
      return;
    }
    const row = this.nextRow();
    this.pay(rowPadId(row), dt, this.rowCost(row), () => {
      this.timers.start('construction', 'rackRow', row, `Rack row ${rowLetter(row)}`, this.timers.constructionSeconds('rackRow', row - R.startRows));
      this.refreshRowPads();
    });

    const lvl = this.state.speedLevel;
    this.pay('upgrade-speed', dt, SPEED.costs[lvl] ?? Infinity, () => {
      this.state.speedLevel++;
      this.player.speedBonus = this.state.speedLevel * SPEED.speedBonusPerLevel;
      this.bus.emit('upgradeBought', { upgrade: 'speed' });
      this.refreshSpeedPad();
      this.bus.emit('toast', { text: `Faster wheels — level ${this.state.speedLevel}!`, kind: 'good' });
      this.sound.build();
    });

    const veh = this.vehicleOffer();
    this.pay('upgrade-electric', dt, veh.item ? veh.cost : Infinity, () => {
      if (!veh.item) return;
      this.timers.start('delivery', veh.item, 0, veh.item === 'electric' ? 'Electric pompwagen' : 'Forklift');
      this.refreshElectricPad();
      this.bus.emit('toast', { text: `${veh.item === 'electric' ? 'Electric pompwagen' : 'Forklift'} ordered — the delivery truck is on its way`, kind: 'good' });
    });

    for (const kind of ['In', 'Out'] as const) {
      const owned = kind === 'In' ? this.state.conveyorIn : this.state.conveyorOut;
      const cost = kind === 'In' ? PP.conveyorIn : PP.conveyorOut;
      this.pay(`conveyor-${kind.toLowerCase()}`, dt, owned || this.timers.has(`conveyor${kind}`) || !this.conveyorsUnlocked ? Infinity : cost, () => {
        this.timers.start('construction', `conveyor${kind}`, 0, kind === 'In' ? 'Inbound conveyor' : 'Outbound conveyor');
        this.refreshConveyorPad(kind);
      });
    }

    const up = this.upperOffer();
    this.pay('upgrade-upper', dt, up ? up.cost : Infinity, () => {
      if (!up) return;
      this.timers.start('construction', 'upperLevel', up.row, `Rack level ${up.level + 1} · row ${rowLetter(up.row)}`);
      this.refreshUpperPad();
    });
  }

  /** generic pay-by-standing step; shared with other pad owners */
  pay(id: string, dt: number, cost: number, onComplete: () => void): void {
    if (!isFinite(cost)) return;
    const pad = this.pads.get(id);
    if (!pad || !pad.active || !this.pads.isOn(id, this.player.x, this.player.z)) return;
    const paid = this.state.padProgress[id] ?? 0;
    const rate = Math.max(PP.minPayRatePerSecond, cost / PP.payDuration);
    const amount = Math.min(rate * dt, cost - paid, this.state.money);
    if (amount <= 0) return;
    this.state.addMoney(-amount);
    const newPaid = paid + amount;
    this.state.padProgress[id] = newPaid;
    this.pads.setProgress(id, newPaid / cost);
    this.bus.emit('padPayment', { padId: id, paid: newPaid, total: cost });

    this.coinTimer -= dt;
    if (this.coinTimer <= 0) {
      this.coinTimer = 0.1;
      this.effects.coinFly(
        new THREE.Vector3(this.player.x, 1.2, this.player.z),
        new THREE.Vector3(pad.mesh.position.x, 0.15, pad.mesh.position.z),
      );
      this.sound.coin();
    }

    if (newPaid >= cost - 0.001) {
      this.state.money = Math.round(this.state.money);
      this.state.padProgress[id] = 0;
      this.pads.setProgress(id, 0);
      this.pads.burst(id);
      this.bus.emit('padUnlocked', { padId: id });
      onComplete();
      this.save.save();
    }
  }
}
