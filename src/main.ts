import * as THREE from 'three';
import './ui/styles.css';
import economy from './config/economy.json';
import layout from './config/layout.json';
import tutorialCfg from './config/tutorial.json';
import { EventBus } from './core/EventBus';
import { GameState } from './core/GameState';
import { SaveSystem } from './core/SaveSystem';
import { Orders } from './core/Orders';
import { Tutorial } from './core/Tutorial';
import { SceneRoot } from './world/Scene';
import { Warehouse } from './world/Warehouse';
import { Racks } from './world/Racks';
import { Pads } from './world/Pads';
import { Truck } from './world/Truck';
import { Player } from './world/Player';
import { Effects } from './world/Effects';
import { Joystick } from './input/Joystick';
import { Keyboard } from './input/Keyboard';
import { Sound } from './audio/Sound';
import { Hud } from './ui/Hud';
import { Popups } from './ui/Popups';
import { OrderBoard } from './ui/OrderBoard';
import { TutorialOverlay } from './ui/TutorialOverlay';
import { Toasts } from './ui/Toasts';
import { DevPanel } from './debug/DevPanel';

class Game {
  private bus = new EventBus();
  private state = new GameState(this.bus);
  private save = new SaveSystem(this.state);
  private orders = new Orders(this.state, this.bus);
  private tutorial = new Tutorial(this.state, this.orders, this.bus);
  private sound = new Sound();

  private root: SceneRoot;
  private warehouse: Warehouse;
  private racks: Racks;
  private pads = new Pads();
  private player: Player;
  private effects: Effects;
  private supplierTruck: Truck;
  private customerTruck: Truck;

  private joystick = new Joystick();
  private keyboard = new Keyboard();
  private hud: Hud;
  private popups: Popups;
  private board: OrderBoard;
  private tutorialUi = new TutorialOverlay();
  private toasts: Toasts;
  private dev: DevPanel;

  private actionCooldown = 0;
  private officeLatch = false;
  private coinTimer = 0;
  private dustTimer = 0;
  private saveTimer = 0;
  private boardTick = 0;
  private lastTime = performance.now();

  constructor() {
    this.save.load();

    this.root = new SceneRoot(document.getElementById('app')!);
    this.warehouse = new Warehouse();
    this.root.scene.add(this.warehouse.group);
    this.blockDockDoors();

    this.racks = new Racks(this.state, this.warehouse.colliders);
    this.root.scene.add(this.racks.group);

    this.player = new Player(this.root.scene);
    this.player.setElectric(this.state.electric);
    this.player.speedBonus = this.state.speedLevel * economy.payPads.speedUpgrade.speedBonusPerLevel;

    this.effects = new Effects(this.root.scene);
    this.root.scene.add(this.pads.group);

    this.supplierTruck = new Truck('supplier', this.root.scene);
    this.customerTruck = new Truck('customer', this.root.scene);
    this.wireTrucks();

    this.hud = new Hud(this.state, this.bus);
    this.toasts = new Toasts(this.bus);
    this.popups = new Popups(this.orders, this.state, this.bus, this.sound);
    this.board = new OrderBoard(this.orders, this.bus);
    this.hud.onBoardToggle = (): void => {
      this.sound.click();
      this.board.toggle();
    };
    this.dev = new DevPanel(this.state, this.save);

    this.createPads();
    this.wireEvents();

    if (this.state.tutorialDone) {
      this.orders.auto = true;
    } else {
      this.tutorial.start();
    }

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save.save();
    });
    // iOS Safari: block double-tap and pinch zoom
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());

    document.getElementById('loading')?.classList.add('hidden');
    if (location.search.includes('dev')) {
      (window as unknown as { __game: Game }).__game = this;
    }
    requestAnimationFrame(this.loop);
  }

  // ---------- setup ----------

  private blockDockDoors(): void {
    const halfW = layout.warehouse.width / 2;
    for (const side of [-1, 1]) {
      for (const dz of layout.docks.doorZ) {
        // covers the doorway plus the strip where a docked truck's rear pokes inside
        this.warehouse.colliders.push({
          minX: Math.min(side * halfW - side * 1.7, side * halfW + side * 0.3),
          maxX: Math.max(side * halfW - side * 1.7, side * halfW + side * 0.3),
          minZ: dz - layout.docks.doorWidth / 2,
          maxZ: dz + layout.docks.doorWidth / 2,
        });
      }
    }
  }

  private createPads(): void {
    const p = layout.pads;
    this.pads.create('unload', p.unload.x, p.unload.z, ['UNLOAD', '🚚→📦'], '#7ec8ff', false);
    this.pads.create('load', p.load.x, p.load.z, ['LOAD', '📦→🚚'], '#ffb56b', false);
    this.pads.create('office', p.office.x, p.office.z, ['OFFICE'], '#e8eaf0', false, 1.8);

    this.refreshRackUnlockPad();
    this.refreshSpeedPad(true);
    this.refreshElectricPad(true);
  }

  private refreshRackUnlockPad(): void {
    const nextRow = this.state.rackRows;
    const costs = economy.payPads.rackRowCosts;
    const costIndex = nextRow - layout.rackRows.startRows;
    if (nextRow >= layout.rackRows.maxRows || costIndex >= costs.length) {
      this.pads.remove('rack-unlock');
      return;
    }
    const cost = costs[costIndex];
    const z = layout.rackRows.rowZ[nextRow];
    if (!this.pads.get('rack-unlock')) {
      this.pads.create('rack-unlock', 8.7, z, ['NEW RACK ROW', `€${cost}`], '#38d15e', true);
    } else {
      this.pads.moveTo('rack-unlock', 8.7, z);
      this.pads.setLabel('rack-unlock', ['NEW RACK ROW', `€${cost}`]);
      this.pads.setProgress('rack-unlock', 0);
    }
  }

  private refreshSpeedPad(create = false): void {
    const cfg = economy.payPads.speedUpgrade;
    const p = layout.pads.upgradeSpeed;
    const lvl = this.state.speedLevel;
    if (lvl >= cfg.maxLevel) {
      this.pads.setLabel('upgrade-speed', ['SPEED MAX', `LV ${lvl}`], '#8a92a5');
      this.pads.setActive('upgrade-speed', false);
      return;
    }
    const cost = Math.round(cfg.baseCost * Math.pow(cfg.costFactor, lvl));
    if (create) this.pads.create('upgrade-speed', p.x, p.z, ['FASTER WHEELS', `€${cost} · LV${lvl + 1}`], '#ffb020', true);
    else {
      this.pads.setLabel('upgrade-speed', ['FASTER WHEELS', `€${cost} · LV${lvl + 1}`]);
      this.pads.setProgress('upgrade-speed', 0);
    }
  }

  private refreshElectricPad(create = false): void {
    const p = layout.pads.upgradeElectric;
    if (this.state.electric) {
      if (create) this.pads.create('upgrade-electric', p.x, p.z, ['FORKLIFT', 'COMING SOON'], '#8a92a5', false);
      else this.pads.setLabel('upgrade-electric', ['FORKLIFT', 'COMING SOON'], '#8a92a5');
      this.pads.setActive('upgrade-electric', false);
    } else if (create) {
      this.pads.create('upgrade-electric', p.x, p.z, ['ELECTRIC', `POMPWAGEN €${economy.payPads.electricPompwagen}`], '#38d15e', true);
    }
  }

  private wireTrucks(): void {
    for (const truck of [this.supplierTruck, this.customerTruck]) {
      truck.onBeep = (): void => this.sound.backupBeep();
      truck.onDocked = (): void => {
        this.sound.airBrake();
        this.orders.truckDocked(truck.kind);
        this.updateTruckLabels();
      };
      truck.onGone = (): void => this.orders.truckGone(truck.kind);
    }

    this.bus.on('truckArriving', ({ kind }) => {
      this.sound.truckHorn();
      if (kind === 'supplier') {
        const o = this.orders.activeSupplier!;
        this.supplierTruck.startArrival(o.supplier, Math.min(16, o.pallets));
      } else {
        const o = this.orders.activeCustomer!;
        this.customerTruck.startArrival(o.store, 0);
      }
    });
    this.bus.on('truckLeaving', ({ kind }) => {
      const t = kind === 'supplier' ? this.supplierTruck : this.customerTruck;
      // small delay so the last pallet action reads clearly
      setTimeout(() => t.startDeparture(), 700);
    });
  }

  private updateTruckLabels(): void {
    const s = this.orders.activeSupplier;
    if (s && this.supplierTruck.phase === 'docked') {
      this.supplierTruck.setLabel(`${s.supplier} · ${s.remaining} left`);
      this.supplierTruck.setCargoCount(Math.min(16, s.remaining));
    }
    const c = this.orders.activeCustomer;
    if (c && this.customerTruck.phase === 'docked') {
      this.customerTruck.setLabel(`${c.store} · ${c.loaded}/${c.pallets}`);
      this.customerTruck.setCargoCount(Math.min(16, c.loaded));
    }
  }

  private wireEvents(): void {
    this.bus.on('orderShipped', () => {
      this.sound.chaChing();
      this.save.save();
    });
    this.bus.on('orderMissed', () => this.sound.error());
    this.bus.on('tutorialStep', ({ id, text }) => {
      const idx = tutorialCfg.steps.findIndex((s) => s.id === id);
      this.tutorialUi.show(idx + 1, tutorialCfg.steps.length, text);
      this.effects.setGuide(this.guideFor(id));
    });
    this.bus.on('tutorialDone', () => {
      this.tutorialUi.hide();
      this.effects.setGuide(null);
      this.sound.fanfare();
      this.save.save();
    });
    this.bus.on('rackRowBuilt', () => this.sound.build());
  }

  private guideFor(stepId: string): THREE.Vector3 | null {
    const p = layout.pads;
    switch (stepId) {
      case 'unload':
        return new THREE.Vector3(p.unload.x, 0, p.unload.z);
      case 'store':
        return new THREE.Vector3(0, 0, this.racks.rowPadZ(0));
      case 'loadTruck':
        return new THREE.Vector3(p.load.x, 0, p.load.z);
      case 'expand': {
        const pad = this.pads.get('rack-unlock');
        return pad ? new THREE.Vector3(pad.mesh.position.x, 0, pad.mesh.position.z) : null;
      }
      default:
        return null;
    }
  }

  // ---------- interactions ----------

  private handlePads(dt: number): void {
    const px = this.player.x;
    const pz = this.player.z;
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);

    // UNLOAD pad
    if (this.actionCooldown <= 0 && this.pads.isOn('unload', px, pz) && this.player.carrying < this.player.capacity) {
      if (this.orders.tryUnloadPallet()) {
        this.player.setCarrying(this.player.carrying + 1);
        this.sound.palletUp();
        this.updateTruckLabels();
        this.actionCooldown = 0.5;
      }
    }

    // LOAD pad
    if (this.actionCooldown <= 0 && this.pads.isOn('load', px, pz) && this.player.carrying > 0) {
      if (this.orders.tryLoadPallet()) {
        this.player.setCarrying(this.player.carrying - 1);
        this.sound.palletDown();
        this.updateTruckLabels();
        this.actionCooldown = 0.5;
      }
    }

    // rack row strips: store when the pallet has nowhere urgent to go,
    // take when an active customer order still needs pallets
    const c = this.orders.activeCustomer;
    const customerNeeds = c && c.state !== 'done'
      ? Math.max(0, c.pallets - c.loaded - this.player.carrying)
      : 0;
    for (let row = 0; row < this.state.rackRows; row++) {
      const stripZ = this.racks.rowPadZ(row);
      const inStrip = px > -7 && px < 7.6 && Math.abs(pz - stripZ) < 0.75;
      if (!inStrip) continue;
      if (this.actionCooldown > 0) continue;
      const base = row * layout.rackRows.slotsPerRow;
      if (this.player.carrying > 0 && customerNeeds === 0) {
        // store into the nearest free slot of this row
        let best = -1;
        let bestD = Infinity;
        for (let c = 0; c < layout.rackRows.slotsPerRow; c++) {
          const i = base + c;
          if (this.state.slots[i]) continue;
          const d = Math.abs(this.racks.slotPosition(i).x - px);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best >= 0) {
          this.state.setSlot(best, true);
          this.racks.animateStore(best);
          this.player.setCarrying(this.player.carrying - 1);
          this.sound.palletDown();
          this.bus.emit('palletStored', { slot: best });
          this.actionCooldown = 0.5;
        }
      } else if (customerNeeds > 0 && this.player.carrying < this.player.capacity) {
        // take the nearest pallet from this row
        let best = -1;
        let bestD = Infinity;
        for (let c = 0; c < layout.rackRows.slotsPerRow; c++) {
          const i = base + c;
          if (!this.state.slots[i]) continue;
          const d = Math.abs(this.racks.slotPosition(i).x - px);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best >= 0) {
          this.state.setSlot(best, false);
          this.racks.syncFromState();
          this.player.setCarrying(this.player.carrying + 1);
          this.sound.palletUp();
          this.bus.emit('palletPicked', { from: 'rack' });
          this.actionCooldown = 0.5;
        }
      }
    }

    // OFFICE pad toggles the order board
    if (this.pads.isOn('office', px, pz)) {
      if (!this.officeLatch) {
        this.officeLatch = true;
        this.board.toggle();
        this.sound.click();
      }
    } else {
      this.officeLatch = false;
    }

    // pay-by-standing pads
    this.payPad('rack-unlock', dt, () => {
      const costs = economy.payPads.rackRowCosts;
      return costs[this.state.rackRows - layout.rackRows.startRows] ?? Infinity;
    }, () => {
      const row = this.state.rackRows;
      this.state.rackRows++;
      this.racks.revealRow(row);
      this.bus.emit('rackRowBuilt', { rowIndex: row });
      this.bus.emit('stockChanged', { stock: this.state.stock, capacity: this.state.capacity });
      this.refreshRackUnlockPad();
      this.toasts.show('New rack row built!', 'good');
      this.save.save();
    });

    this.payPad('upgrade-speed', dt, () => {
      const cfg = economy.payPads.speedUpgrade;
      if (this.state.speedLevel >= cfg.maxLevel) return Infinity;
      return Math.round(cfg.baseCost * Math.pow(cfg.costFactor, this.state.speedLevel));
    }, () => {
      this.state.speedLevel++;
      this.player.speedBonus = this.state.speedLevel * economy.payPads.speedUpgrade.speedBonusPerLevel;
      this.bus.emit('upgradeBought', { upgrade: 'speed' });
      this.refreshSpeedPad();
      this.toasts.show(`Faster wheels — level ${this.state.speedLevel}!`, 'good');
      this.sound.build();
      this.save.save();
    });

    this.payPad('upgrade-electric', dt, () => (this.state.electric ? Infinity : economy.payPads.electricPompwagen), () => {
      this.state.electric = true;
      this.player.setElectric(true);
      this.bus.emit('upgradeBought', { upgrade: 'electric' });
      this.refreshElectricPad();
      this.toasts.show('Electric pompwagen! Carries 2 pallets', 'good');
      this.sound.fanfare();
      this.save.save();
    });
  }

  private payPad(id: string, dt: number, getCost: () => number, onComplete: () => void): void {
    const pad = this.pads.get(id);
    if (!pad || !pad.active) return;
    const cost = getCost();
    if (!isFinite(cost)) return;
    const paid = this.state.padProgress[id] ?? 0;
    if (!this.pads.isOn(id, this.player.x, this.player.z)) return;
    const pay = Math.min(economy.payPads.payRatePerSecond * dt, cost - paid, this.state.money);
    if (pay <= 0) return;
    this.state.addMoney(-pay);
    const newPaid = paid + pay;
    this.state.padProgress[id] = newPaid;
    this.pads.setProgress(id, newPaid / cost);
    this.bus.emit('padPayment', { padId: id, paid: newPaid, total: cost });

    this.coinTimer -= dt;
    if (this.coinTimer <= 0) {
      this.coinTimer = 0.12;
      this.effects.coinFly(
        new THREE.Vector3(this.player.x, 0.9, this.player.z),
        new THREE.Vector3(pad.mesh.position.x, 0.15, pad.mesh.position.z),
      );
      this.sound.coin();
    }

    if (newPaid >= cost - 0.001) {
      this.state.padProgress[id] = 0;
      this.pads.setProgress(id, 0);
      this.bus.emit('padUnlocked', { padId: id });
      onComplete();
    }
  }

  // ---------- main loop ----------

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // input: joystick first, keyboard fallback
    let ix = this.joystick.active ? this.joystick.x : this.keyboard.x;
    let iy = this.joystick.active ? this.joystick.y : this.keyboard.y;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    this.player.update(dt, ix, iy, this.warehouse.colliders);
    this.orders.update(dt);
    this.tutorial.update(dt, this.player.speed);
    this.supplierTruck.update(dt);
    this.customerTruck.update(dt);
    this.racks.update(dt);
    this.pads.update(dt, this.root.camera);
    this.effects.update(dt);
    this.popups.update();
    this.handlePads(dt);
    this.dev.frame(dt);

    // dust when driving fast
    this.dustTimer -= dt;
    if (this.player.speed > 2.4 && this.dustTimer <= 0) {
      this.dustTimer = 0.18;
      this.effects.dust(this.player.x, this.player.z);
    }

    this.boardTick += dt;
    if (this.boardTick >= 1) {
      this.boardTick = 0;
      this.board.tick();
    }

    this.saveTimer += dt;
    if (this.saveTimer >= 8) {
      this.saveTimer = 0;
      this.save.save();
    }

    this.root.follow(this.player.position, dt);
    this.root.render();
  };
}

new Game();
