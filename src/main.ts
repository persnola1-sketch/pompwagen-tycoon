import * as THREE from 'three';
import './ui/styles.css';
import cam from './config/camera.json';
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
import { Warehouse } from './world/Warehouse';
import { Yard } from './world/Yard';
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
import { TutorialOverlay } from './ui/TutorialOverlay';
import { Toasts } from './ui/Toasts';
import { Interactions } from './game/Interactions';
import { PayPads } from './game/PayPads';
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
  private interactions: Interactions;
  private payPads: PayPads;

  private joystick = new Joystick();
  private keyboard = new Keyboard();
  private zoom = new Zoom(this.joystick);
  private hud: Hud;
  private popups: Popups;
  private board: OrderBoard;
  private tutorialUi = new TutorialOverlay();
  private dev: DevPanel;

  private dustTimer = 0;
  private saveTimer = 0;
  private boardTick = 0;
  private lastTime = performance.now();

  constructor() {
    this.save.load();

    this.root = new SceneRoot(document.getElementById('app')!);
    initAssets(this.root.renderer);
    const scene = this.root.scene;
    this.warehouse = new Warehouse();
    scene.add(this.warehouse.group, new Yard().group);

    this.racks = new Racks(this.state, this.warehouse.colliders);
    scene.add(this.racks.group);

    this.player = new Player(scene);
    this.player.setElectric(this.state.electric);
    this.player.speedBonus = this.state.speedLevel * economy.payPads.speedUpgrade.speedBonusPerLevel;

    this.effects = new Effects(scene);
    scene.add(this.pads.group);

    this.supplierTruck = new Truck('supplier', scene);
    this.customerTruck = new Truck('customer', scene);
    this.wireTrucks();

    this.hud = new Hud(this.state, this.bus);
    new Toasts(this.bus);
    this.popups = new Popups(this.orders, this.state, this.bus, this.sound);
    this.board = new OrderBoard(this.orders, this.state, this.bus);
    this.dev = new DevPanel(this.state, this.save, this.root.renderer);
    this.wireCamera();

    const p = layout.pads;
    this.pads.create('unload', p.unload.x, p.unload.z, ['UNLOAD', '🚚→📦'], '#7ec8ff', false);
    this.pads.create('load', p.load.x, p.load.z, ['LOAD', '📦→🚚'], '#ffb56b', false);
    this.pads.create('office', p.office.x, p.office.z, ['OFFICE'], '#e8eaf0', false, 1.8);

    this.interactions = new Interactions(this.state, this.orders, this.bus, this.pads, this.player, this.racks, this.sound);
    this.interactions.onCargoChanged = (): void => this.updateTrucks();
    this.interactions.onOffice = (): void => {
      this.board.toggle();
      this.sound.click();
    };
    this.payPads = new PayPads(this.state, this.bus, this.pads, this.player, this.racks, this.effects, this.sound, this.save);
    this.wireEvents();

    if (this.state.tutorialDone) this.orders.startAuto();
    else this.tutorial.start();

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
      truck.onBeep = (): void => this.sound.backupBeep();
      truck.onDocked = (): void => {
        this.sound.airBrake();
        this.orders.truckDocked(truck.kind);
        this.warehouse.setDockLight(truck.kind, true);
        this.updateTrucks();
      };
      truck.onGone = (): void => this.orders.truckGone(truck.kind);
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
    this.bus.on('tutorialStep', ({ id, text }) => {
      const idx = tutorialCfg.steps.findIndex((s) => s.id === id);
      this.tutorialUi.show(idx + 1, tutorialCfg.steps.length, text);
      this.effects.setGuide(this.guideFor(id));
    });
    this.bus.on('tutorialDone', () => {
      this.tutorialUi.hideAfter(economy.tutorial.doneMessageSeconds);
      this.effects.setGuide(null);
      this.sound.fanfare();
      this.save.save();
    });
    this.bus.on('rackRowBuilt', () => this.sound.build());
    this.bus.on('productUnlocked', () => {
      this.sound.fanfare();
      this.save.save();
    });
  }

  private guideFor(stepId: string): THREE.Vector3 | null {
    const p = layout.pads;
    switch (stepId) {
      case 'unload':
        return new THREE.Vector3(p.unload.x, 0, p.unload.z);
      case 'store':
        return new THREE.Vector3(layout.rackRows.rows[0].x, 0, rowPadZ(0));
      case 'loadTruck':
        return this.player.carrying > 0 ? new THREE.Vector3(p.load.x, 0, p.load.z) : new THREE.Vector3(layout.rackRows.rows[0].x, 0, rowPadZ(0));
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
    this.player.update(dt, ix, iy, this.warehouse.colliders);
    this.orders.update(dt);
    this.tutorial.update(dt, this.player.speed);
    this.supplierTruck.update(dt, camera);
    this.customerTruck.update(dt, camera);
    this.racks.update(dt);
    this.pads.update(dt, camera);
    this.effects.update(dt);
    this.popups.update();
    this.interactions.update(dt);
    this.payPads.update(dt);
    this.dev.frame(dt);

    if (this.tutorial.currentStepId === 'loadTruck') this.effects.setGuide(this.guideFor('loadTruck'));

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

    this.root.update(dt, this.player.position);
    this.warehouse.setCeilingVisible(this.root.rig.currentDistance > cam.ceilingHideDistance);
    this.root.render();
  };
}

new Game();
