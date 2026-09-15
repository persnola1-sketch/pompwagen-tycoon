import * as THREE from 'three';
import './ui/styles.css';
import economy from './config/economy.json';
import layout from './config/layout.json';
import tutorialCfg from './config/tutorial.json';
import { EventBus, TruckKind } from './core/EventBus';
import { GameState } from './core/GameState';
import { SaveSystem } from './core/SaveSystem';
import { Orders } from './core/Orders';
import { Tutorial } from './core/Tutorial';
import { initAssets } from './world/Assets';
import { SceneRoot } from './world/Scene';
import { AABB, Warehouse } from './world/Warehouse';
import { Yard } from './world/Yard';
import { Plot } from './world/Plot';
import { WarehouseBuild } from './world/construction/WarehouseBuild';
import { Racks, rowPadZ } from './world/Racks';
import { Pads } from './world/Pads';
import { Truck } from './world/Truck';
import { Player } from './world/Player';
import { Effects } from './world/Effects';
import { Joystick } from './input/Joystick';
import { Keyboard } from './input/Keyboard';
import { Zoom } from './input/Zoom';
import { Sound } from './audio/Sound';
import { Hud } from './ui/Hud';
import { Popups } from './ui/Popups';
import { OrderBoard } from './ui/OrderBoard';
import { GuideBubble } from './ui/GuideBubble';
import { Henk } from './world/Henk';
import { Toasts } from './ui/Toasts';
import { Confetti } from './ui/Confetti';
import { Interactions } from './game/Interactions';
import { PayPads } from './game/PayPads';
import { DevPanel } from './debug/DevPanel';
import { Workers } from './core/workers/Workers';
import { simulateOfflineShift } from './core/workers/Offline';
import { WorkerAI } from './game/WorkerAI';
import { FallenPallets } from './world/workers/FallenPallets';
import { WorkersPanel } from './ui/WorkersPanel';
import { ShiftReportUi } from './ui/ShiftReport';
import { roleDef } from './core/workers/WorkerTypes';
import { Timers } from './core/Timers';
import { Construction } from './game/Construction';
import { TimersHud } from './ui/TimersHud';
import { AdService } from './services/AdService';

class Game {
  private bus = new EventBus();
  private state = new GameState(this.bus);
  private save = new SaveSystem(this.state);
  private orders = new Orders(this.state, this.bus);
  private tutorial = new Tutorial(this.state, this.orders, this.bus);
  private workers = new Workers(this.state, this.bus);
  private timers = new Timers(this.bus);
  private construction: Construction;
  private timersHud = new TimersHud(this.timers);
  private ads = new AdService();
  private workerAI: WorkerAI;
  private fallen: FallenPallets;
  private workersPanel: WorkersPanel;
  private shiftReport = new ShiftReportUi();
  private sound = new Sound();

  private root: SceneRoot;
  private warehouse: Warehouse;
  private plot: Plot;
  private build: WarehouseBuild | null = null;
  private buildHud: HTMLElement | null = null;
  private racks: Racks;
  private pads = new Pads();
  private player: Player;
  private effects: Effects;
  private supplierTruck: Truck;
  private customerTruck: Truck;
  private interactions: Interactions;
  private payPads: PayPads;
  private colliders: AABB[];

  private joystick = new Joystick();
  private keyboard = new Keyboard();
  private zoom = new Zoom(this.joystick);
  private hud: Hud;
  private popups: Popups;
  private board: OrderBoard;
  private toasts: Toasts;
  private confetti = new Confetti();
  private guide = new GuideBubble(tutorialCfg.typeSpeed);
  private henk: Henk;
  private dev: DevPanel;

  private dustTimer = 0;
  private saveTimer = 0;
  private boardTick = 0;
  private lastTime = performance.now();

  constructor() {
    this.save.register('workers', this.workers);
    this.save.register('timers', this.timers);
    this.save.load();
    this.tutorial.hasWorkers = true;

    this.root = new SceneRoot(document.getElementById('app')!);
    initAssets(this.root.renderer);
    const scene = this.root.scene;
    this.warehouse = new Warehouse();
    this.plot = new Plot();
    scene.add(this.warehouse.group, this.plot.group, new Yard().group);

    this.racks = new Racks(this.state, this.warehouse.colliders);
    scene.add(this.racks.group);

    this.player = new Player(scene);
    this.player.setElectric(this.state.electric);
    this.player.speedBonus = this.state.speedLevel * economy.payPads.speedUpgrade.speedBonusPerLevel;

    this.effects = new Effects(scene);
    this.henk = new Henk(scene);
    this.fallen = new FallenPallets(scene);
    scene.add(this.pads.group);

    this.supplierTruck = new Truck('supplier', scene);
    this.customerTruck = new Truck('customer', scene);
    this.wireTrucks();

    this.hud = new Hud(this.state, this.bus);
    this.toasts = new Toasts(this.bus);
    this.popups = new Popups(this.orders, this.state, this.bus, this.sound);
    this.board = new OrderBoard(this.orders, this.state, this.bus);
    this.board.onCountChanged = (n): void => this.hud.setBoardCount(n);
    this.board.onClose = (): void => this.sound.click();
    this.dev = new DevPanel(this.state, this.save, this.root.renderer);
    this.wireCamera();

    const p = layout.pads;
    this.pads.create('unload', p.unload.x, p.unload.z, ['UNLOAD', 'take pallets'], '#7ec8ff', { icon: '📥' });
    this.pads.create('load', p.load.x, p.load.z, ['LOAD', 'fill the truck'], '#ffb56b', { icon: '📤' });
    this.pads.create('office', p.office.x, p.office.z, ['OFFICE', 'orders'], '#e8eaf0', { size: 1.8, icon: '🗂️' });

    this.interactions = new Interactions(this.state, this.orders, this.bus, this.pads, this.player, this.racks, this.sound);
    this.interactions.fallen = this.fallen;
    this.interactions.onCargoChanged = (): void => this.updateTrucks();
    this.workerAI = new WorkerAI(this.state, this.orders, this.workers, this.bus, this.racks, this.fallen, this.warehouse.colliders, scene);
    this.workerAI.sync();
    this.workersPanel = new WorkersPanel(this.workers, this.state, this.bus);
    this.workersPanel.onClose = (): void => this.sound.click();
    this.workersPanel.onAction = (): void => {
      this.sound.click();
      this.save.save();
    };
    this.hud.onWorkersToggle = (): void => {
      this.sound.click();
      this.workersPanel.toggle();
    };
    this.wireWorkers();
    this.interactions.onOffice = (): void => {
      this.board.toggle();
      this.sound.click();
    };
    this.payPads = new PayPads(this.state, this.bus, this.pads, this.player, this.effects, this.sound, this.save, this.timers);
    this.payPads.onWarehouseBought = (): void => this.startConstruction();
    this.construction = new Construction(scene, this.state, this.bus, this.timers, this.racks, this.workers, this.player, this.effects);
    this.construction.onRefreshPads = (): void => this.payPads.refreshAll();
    this.construction.onSound = (k): void => {
      if (k === 'build') this.sound.build();
      else if (k === 'horn') this.sound.truckHorn();
      else if (k === 'brake') this.sound.airBrake();
      else this.sound.backupBeep();
    };
    this.timersHud.onFinishAd = (job): void => {
      void this.ads.showRewarded(`finish ${job.label} now`).then((ok) => {
        if (ok) this.timers.finishNow(job.id);
        this.timersHud.render();
      });
    };
    this.timersHud.onFinishPay = (job): void => {
      const price = this.timers.finishPrice(job);
      if (this.state.money < price) {
        this.bus.emit('toast', { text: 'Not enough money!', kind: 'bad' });
        return;
      }
      this.state.addMoney(-price);
      this.timers.finishNow(job.id);
      this.sound.coin();
    };
    this.bus.on('jobStarted', ({ job }) => {
      if (job.kind === 'construction') this.tutorial.tip('firstConstruction');
      this.timersHud.render();
      this.save.save();
    });
    this.bus.on('jobDone', () => {
      this.timersHud.render();
      this.save.save();
    });
    this.wireEvents();

    // fresh game: empty plot; otherwise the warehouse is up and running
    const built = this.state.warehouseBuilt;
    this.colliders = built ? this.warehouse.colliders : this.plot.colliders;
    this.setWarehouseVisible(built);
    if (!built) this.player.teleport(layout.plot.playerStart.x, layout.plot.playerStart.z);
    if (this.state.tutorialDone) this.orders.startAuto();
    else this.tutorial.start();
    this.offlineShift();

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save.save();
    });
    // iOS Safari: block double-tap and pinch zoom of the page itself
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());

    document.getElementById('loading')?.classList.add('hidden');
    if (location.search.includes('dev')) {
      (window as unknown as { __game: Game }).__game = this;
    }
    requestAnimationFrame(this.loop);
  }

  /** state summary for the headless smoke test (?dev only) */
  debugInfo(): Record<string, unknown> {
    return {
      money: Math.round(this.state.money),
      built: this.state.warehouseBuilt,
      tutorialDone: this.state.tutorialDone,
      player: [Math.round(this.player.x * 10) / 10, Math.round(this.player.z * 10) / 10],
      building: !!this.build,
      workers: this.workers.workers.map((w) => `${w.name}:${roleDef(w.role).id}:L${w.level}:${w.stats.moved}`),
      stock: this.state.stock,
      jobs: this.timers.jobs.map((j) => `${j.item}:${Math.ceil(j.left)}`),
      rows: this.state.rackRows,
      electric: this.state.electric,
      calls: this.root.renderer.info.render.calls,
    };
  }

  // ---------- plot → warehouse ----------

  private setWarehouseVisible(on: boolean): void {
    this.warehouse.group.visible = on;
    this.racks.group.visible = on;
    this.plot.group.visible = !on;
    this.pads.setAllVisible(on, ['buy-warehouse']);
    this.interactions.enabled = on;
  }

  private startConstruction(): void {
    const wp = layout.plot.watchPoint;
    this.plot.dressing.visible = false;
    this.player.frozen = true;
    this.player.teleport(wp.x, wp.z, Math.PI);
    this.sound.thud();
    this.build = new WarehouseBuild(this.root.scene, this.warehouse, this.effects, economy.warehouse.buildSeconds);
    this.build.onTick = (k): void => {
      if (k === 'hammer') this.sound.hammer();
      else if (k === 'weld') this.sound.weld();
      else this.sound.thud();
    };
    this.buildHud = document.createElement('div');
    this.buildHud.id = 'construction-hud';
    this.buildHud.className = 'ui';
    this.buildHud.innerHTML = `<div class="title">🏗️ Building your warehouse…</div><div class="count">10</div><div class="bar"><i></i></div>`;
    document.body.appendChild(this.buildHud);
    this.build.start(() => this.onWarehouseBuilt());
    this.root.rig.cinematic = { x: 0, z: 2, width: layout.warehouse.width + 16, pitchDeg: 50 };
    this.save.save();
  }

  private onWarehouseBuilt(): void {
    this.root.rig.cinematic = null;
    this.buildHud?.remove();
    this.buildHud = null;
    this.build = null;
    this.colliders = this.warehouse.colliders;
    this.setWarehouseVisible(true);
    this.player.frozen = false;
    this.root.rig.shake(0.9, 0.6);
    this.confetti.burst();
    this.toasts.banner('🏭 Warehouse opened!', 'Your business starts now, boss.');
    this.sound.opening();
    this.player.character.celebrate();
    this.bus.emit('warehouseBuilt', {});
    if (this.state.tutorialDone) this.orders.startAuto();
    this.save.save();
  }

  private wireWorkers(): void {
    this.bus.on('workerHired', ({ workerId }) => {
      this.sound.fanfare();
      this.tutorial.tip('firstWorker');
      const w = this.workers.byId(workerId);
      if (w?.role === 'clerk') this.orders.clerk = this.workers.clerkRules;
      this.save.save();
    });
    this.bus.on('workersChanged', () => {
      this.orders.clerk = this.workers.hasRole('clerk') ? this.workers.clerkRules : null;
      this.hud.setWorkerCount(this.workers.count);
    });
    this.orders.clerk = this.workers.hasRole('clerk') ? this.workers.clerkRules : null;
    this.hud.setWorkerCount(this.workers.count);
    this.bus.on('workerLevelUp', ({ workerId, level }) => {
      const w = this.workers.byId(workerId);
      if (!w) return;
      this.sound.fanfare();
      this.confetti.burst(60, 0.5);
      this.bus.emit('toast', { text: `🎉 ${w.name} reached level ${level}!`, kind: 'unlock' });
    });
    this.bus.on('workerAction', ({ action }) => {
      if (action === 'store' || action === 'load') this.sound.palletDown();
      else if (action === 'drop') this.sound.thud();
      else this.sound.palletUp();
      this.updateTrucks();
    });
    this.bus.on('palletDropped', ({ workerId }) => {
      const w = this.workers.byId(workerId);
      this.bus.emit('toast', { text: `💥 ${w?.name.split(' ')[0] ?? 'A worker'} dropped a pallet! Pick it up, boss.`, kind: 'bad' });
    });
    this.bus.on('clerkDecided', ({ text, accepted }) => {
      this.bus.emit('toast', { text: `🖥️ ${text}`, kind: accepted ? 'good' : 'info' });
      if (accepted) this.sound.accept();
    });
    // tap a worker to see their card
    this.joystick.onTap = (sx, sy): void => {
      if (!this.state.warehouseBuilt) return;
      const w = this.workerAtScreen(sx, sy);
      if (w) {
        this.sound.click();
        this.workersPanel.open('team');
      }
    };
  }

  /** raycast a screen tap onto the floor and find a worker near the hit */
  private workerAtScreen(sx: number, sy: number): ReturnType<WorkerAI['agentAt']> {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.root.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9), hit)) return null;
    return this.workerAI.agentAt(hit, 1.2);
  }

  /** night shift earnings since the last save */
  private offlineShift(): void {
    if (!this.save.lastSeen || !this.state.tutorialDone) return;
    const report = simulateOfflineShift(this.state, this.workers, Date.now() - this.save.lastSeen);
    if (!report) return;
    this.shiftReport.onClose = (): void => {
      this.sound.chaChing();
      this.save.save();
    };
    this.shiftReport.onDouble = (r): void => {
      // ad-based doubling arrives with the AdService (phase 12); for now just collect
      this.state.addMoney(Math.max(0, r.earned - r.wages));
      this.sound.chaChing();
      this.save.save();
    };
    this.shiftReport.show(report);
    this.bus.emit('workersChanged', {});
  }

  // ---------- setup ----------

  private wireCamera(): void {
    const rig = this.root.rig;
    this.zoom.onZoom = (f): void => rig.zoomBy(f);
    this.hud.onBoardToggle = (): void => {
      this.sound.click();
      this.board.toggle();
    };
    this.hud.onOverviewToggle = (): void => {
      rig.toggleOverview();
      this.hud.setOverview(rig.overview);
      this.sound.click();
    };
    // tap anywhere in the world to return from overview
    this.joystick.onBegin = (): void => {
      if (!rig.overview) return;
      rig.toggleOverview();
      this.hud.setOverview(false);
    };
  }

  private truck(kind: TruckKind): Truck {
    return kind === 'supplier' ? this.supplierTruck : this.customerTruck;
  }

  private wireTrucks(): void {
    for (const truck of [this.supplierTruck, this.customerTruck]) {
      const kind: TruckKind = truck === this.supplierTruck ? 'supplier' : 'customer';
      truck.onBeep = (): void => this.sound.backupBeep();
      truck.onDocked = (): void => {
        this.sound.airBrake();
        this.orders.truckDocked(kind);
        this.warehouse.setDockLight(kind, true);
        this.updateTrucks();
      };
      truck.onGone = (): void => this.orders.truckGone(kind);
    }

    this.bus.on('truckArriving', ({ kind }) => {
      this.sound.truckHorn();
      if (kind === 'supplier') {
        const o = this.orders.activeSupplier!;
        this.supplierTruck.startArrival(o.supplier, new Array(Math.min(layout.truck.maxVisibleCargo, o.pallets)).fill(o.product));
      } else {
        this.customerTruck.startArrival(this.orders.activeCustomer!.store, []);
      }
    });
    this.bus.on('truckLeaving', ({ kind }) => {
      this.warehouse.setDockLight(kind, false);
      // short pause so the last pallet action reads clearly
      setTimeout(() => this.truck(kind).startDeparture(), layout.truck.departDelay * 1000);
    });
  }

  /** labels + visible cargo on docked trucks */
  private updateTrucks(): void {
    const s = this.orders.activeSupplier;
    if (s && this.supplierTruck.phase === 'docked') {
      this.supplierTruck.setLabel(`${s.supplier} · ${s.remaining} left`);
      this.supplierTruck.setCargo(new Array(Math.min(layout.truck.maxVisibleCargo, s.remaining)).fill(s.product));
    }
    const c = this.orders.activeCustomer;
    if (c && this.customerTruck.phase === 'docked') {
      const loaded = c.lines.reduce((n, l) => n + l.loaded, 0);
      const total = c.lines.reduce((n, l) => n + l.pallets, 0);
      this.customerTruck.setLabel(`${c.store} · ${loaded}/${total}`);
      this.customerTruck.setCargo(c.lines.flatMap((l) => new Array(l.loaded).fill(l.product)));
    }
  }

  private wireEvents(): void {
    this.bus.on('orderShipped', () => {
      this.sound.chaChing();
      this.save.save();
    });
    this.bus.on('orderMissed', () => this.sound.error());
    this.guide.onTap = (): void => {
      this.sound.click();
      this.bus.emit('guideContinue', {});
    };
    this.guide.onSkip = (): void => {
      this.sound.click();
      this.tutorial.skip();
    };
    this.guide.onBlip = (): void => this.sound.blip();
    this.bus.on('guideSay', ({ text, tap, skippable, autoHide }) => {
      this.guide.say(text, tap, skippable, autoHide);
      this.henk.show(true);
      if (autoHide > 0) window.setTimeout(() => { if (!this.guide.visible) this.henk.show(false); }, autoHide * 1000 + 50);
    });
    this.bus.on('guideHide', () => {
      this.guide.hide();
      this.henk.show(false);
      this.henk.setTarget(null);
      this.effects.setGuide(null);
    });
    this.bus.on('tutorialDone', () => {
      this.sound.fanfare();
      this.save.save();
    });
    this.bus.on('rackRowBuilt', () => this.tutorial.tip('firstRackRow'));
    this.bus.on('upgradeBought', ({ upgrade }) => {
      if (upgrade === 'electric') this.tutorial.tip('firstElectric');
    });
    this.bus.on('productUnlocked', () => {
      this.sound.fanfare();
      this.save.save();
    });
  }

  /** world position of the current tutorial target (null = none) */
  private tutorialTarget(): THREE.Vector3 | null {
    const p = layout.pads;
    const rack = new THREE.Vector3(layout.rackRows.rows[0].x, 0, rowPadZ(0));
    switch (this.tutorial.currentTarget) {
      case 'buyPad':
        return new THREE.Vector3(layout.plot.pad.x, 0, layout.plot.pad.z);
      case 'unload':
        return new THREE.Vector3(p.unload.x, 0, p.unload.z);
      case 'rack':
        return rack;
      case 'load':
        return this.player.carrying > 0 ? new THREE.Vector3(p.load.x, 0, p.load.z) : rack;
      case 'office':
        return new THREE.Vector3(p.office.x, 0, p.office.z);
      default:
        return null;
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

    const camera = this.root.camera;
    this.player.update(dt, ix, iy, this.colliders);
    this.orders.update(dt);
    this.tutorial.update();
    this.supplierTruck.update(dt, camera);
    this.customerTruck.update(dt, camera);
    this.racks.update(dt);
    this.pads.update(dt, camera, this.root.rig.currentDistance);
    this.warehouse.update(dt, camera, new THREE.Vector3(this.player.x, 0.8, this.player.z));
    this.effects.update(dt);
    this.popups.update();
    this.interactions.update(dt);
    this.payPads.update(dt);
    if (this.state.warehouseBuilt && !this.build) {
      this.timers.update(dt);
      this.construction.update(dt, camera);
    }
    if (this.state.warehouseBuilt && !this.build) {
      this.workers.update(dt, this.state.forklift);
      this.workerAI.update(dt, this.player, this.warehouse.colliders);
    }
    this.dev.frame(dt);

    if (this.build) {
      this.build.update(dt);
      if (this.buildHud) {
        (this.buildHud.querySelector('.count') as HTMLElement).textContent = String(Math.ceil(this.build.secondsLeft));
        (this.buildHud.querySelector('.bar i') as HTMLElement).style.width = `${this.build.progress * 100}%`;
      }
    }

    const target = this.tutorial.active ? this.tutorialTarget() : null;
    this.henk.setTarget(target);
    this.effects.setGuide(target);
    this.henk.update(dt, this.player.position, this.player.heading);
    this.guide.update(dt);

    this.dustTimer -= dt;
    if (this.player.speed > 2.4 && this.dustTimer <= 0) {
      this.dustTimer = 0.18;
      this.effects.dust(this.player.x, this.player.z);
    }

    this.boardTick += dt;
    if (this.boardTick >= 1) {
      this.boardTick = 0;
      this.board.tick();
      this.workersPanel.tick();
      this.timersHud.render();
    }

    this.saveTimer += dt;
    if (this.saveTimer >= 8) {
      this.saveTimer = 0;
      this.save.save();
    }

    this.root.update(dt, this.player.position);
    this.root.render();
  };
}

new Game();
