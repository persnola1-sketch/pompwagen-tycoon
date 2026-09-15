import * as THREE from 'three';
import economy from '../config/economy.json';
import layout from '../config/layout.json';
import { Sound } from '../audio/Sound';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { SaveSystem } from '../core/SaveSystem';
import { Effects } from '../world/Effects';
import { Pads } from '../world/Pads';
import { Player } from '../world/Player';
import { Racks, rowLetter, rowPadZ } from '../world/Racks';

const R = layout.rackRows;
const PP = economy.payPads;
const SPEED = PP.speedUpgrade;

const rowPadId = (row: number): string => `rack-row-${row}`;
const eur = (n: number): string => `€${n.toLocaleString('en')}`;

/**
 * Pay-by-standing pads: one unlock pad on the empty floor of every future rack
 * row (only the next one is buyable, the rest show their price locked), the
 * faster-wheels upgrade and the electric pompwagen.
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
    private racks: Racks,
    private effects: Effects,
    private sound: Sound,
    private save: SaveSystem,
  ) {
    this.refreshRowPads();
    this.refreshSpeedPad();
    this.refreshElectricPad();
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

  refreshRowPads(): void {
    for (let row = R.startRows; row < R.rows.length; row++) {
      const id = rowPadId(row);
      const cost = this.rowCost(row);
      if (row < this.state.rackRows || !isFinite(cost)) {
        this.pads.remove(id);
        continue;
      }
      const next = row === this.state.rackRows;
      const lines = next ? ['NEW RACK ROW', eur(cost)] : [`ROW ${rowLetter(row)}`, `${eur(cost)} 🔒`];
      const accent = next ? '#38d15e' : '#aeb5c2';
      if (!this.pads.has(id)) this.pads.create(id, R.rows[row].x, rowPadZ(row), lines, accent, { withBar: true, locked: !next, icon: '🏗️' });
      else this.pads.setLabel(id, lines, accent, !next);
      this.pads.setActive(id, next);
      this.pads.setProgress(id, next ? (this.state.padProgress[id] ?? 0) / cost : 0);
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

  private refreshElectricPad(): void {
    const p = layout.pads.upgradeElectric;
    const owned = this.state.electric;
    const lines = owned ? ['FORKLIFT', 'COMING SOON'] : ['ELECTRIC', `POMPWAGEN ${eur(PP.electricPompwagen)}`];
    const accent = owned ? '#8a92a5' : '#38d15e';
    if (!this.pads.has('upgrade-electric')) this.pads.create('upgrade-electric', p.x, p.z, lines, accent, { withBar: true, locked: owned, icon: '🔋' });
    else this.pads.setLabel('upgrade-electric', lines, accent, owned);
    this.pads.setActive('upgrade-electric', !owned);
    this.pads.setProgress('upgrade-electric', owned ? 0 : (this.state.padProgress['upgrade-electric'] ?? 0) / PP.electricPompwagen);
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
    const row = this.state.rackRows;
    this.pay(rowPadId(row), dt, this.rowCost(row), () => {
      this.state.rackRows++;
      this.racks.revealRow(row);
      this.bus.emit('rackRowBuilt', { rowIndex: row });
      this.bus.emit('stockChanged', { stock: this.state.stock, capacity: this.state.capacity });
      this.refreshRowPads();
      this.bus.emit('toast', { text: `Rack row ${rowLetter(row)} built! +${R.slotsPerRow} slots`, kind: 'good' });
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

    this.pay('upgrade-electric', dt, this.state.electric ? Infinity : PP.electricPompwagen, () => {
      this.state.electric = true;
      this.player.setElectric(true);
      this.bus.emit('upgradeBought', { upgrade: 'electric' });
      this.refreshElectricPad();
      this.bus.emit('toast', { text: 'Electric pompwagen! Carries 2 pallets and bigger orders arrive', kind: 'good' });
      this.sound.fanfare();
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
