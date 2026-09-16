import layout from '../config/layout.json';

export interface MapDot {
  x: number;
  z: number;
  color: string;
  size: number;
  label?: string;
}

const C = layout.city;
const W = layout.warehouse.width;
const D = layout.warehouse.depth;
const Y = layout.yard;
const RANGE = C.outerX + 12;

/**
 * A flat map of the whole city drawn on a canvas: the streets, the plot, the
 * warehouse, every client store and the live positions of the trucks, workers
 * and the player.
 */
export class MapPanel {
  private el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  onClose: (() => void) | null = null;
  /** supplied by the game each time the map is drawn */
  dots: (() => MapDot[]) | null = null;
  stores: { name: string; x: number; z: number }[] = [];

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'map-panel';
    this.el.className = 'ui sheet';
    this.el.innerHTML =
      `<div class="sheet-head"><div class="tabs"><button class="on">City map</button></div><button class="close" aria-label="Close">✕</button></div>` +
      `<div class="sheet-body"><canvas width="640" height="640"></canvas><div class="map-legend">` +
      `<span><i style="background:#ffb020"></i>You</span><span><i style="background:#7ec8ff"></i>Supplier</span>` +
      `<span><i style="background:#ff9a5a"></i>Customer</span><span><i style="background:#38d15e"></i>Workers</span>` +
      `<span><i style="background:#b98cff"></i>Clients</span></div></div>`;
    document.body.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.el.hidden = true;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close());
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.draw();
  }

  close(): void {
    this.el.hidden = true;
    this.onClose?.();
  }

  toggle(): void {
    if (this.el.hidden) this.close();
    else this.open();
  }

  /** world → canvas */
  private p(v: number): number {
    return ((v + RANGE) / (RANGE * 2)) * this.canvas.width;
  }

  private m(v: number): number {
    return (v / (RANGE * 2)) * this.canvas.width;
  }

  draw(): void {
    if (this.el.hidden) return;
    const ctx = this.ctx;
    const S = this.canvas.width;
    ctx.fillStyle = '#20301f';
    ctx.fillRect(0, 0, S, S);

    // streets
    ctx.strokeStyle = '#4c5158';
    ctx.lineWidth = this.m(C.roadWidth);
    const line = (x1: number, z1: number, x2: number, z2: number): void => {
      ctx.beginPath();
      ctx.moveTo(this.p(x1), this.p(z1));
      ctx.lineTo(this.p(x2), this.p(z2));
      ctx.stroke();
    };
    for (const z of [C.ringZ, -C.ringZ, C.outerZ, -C.outerZ]) line(-C.outerX, z, C.outerX, z);
    for (const x of [C.ringX, -C.ringX, C.outerX, -C.outerX]) line(x, -C.outerZ, x, C.outerZ);
    for (const x of [-28, 28]) line(x, Y.fenceZ, x, C.ringZ);

    // the plot and the warehouse
    ctx.fillStyle = '#3c3f46';
    ctx.fillRect(this.p(-Y.fenceX), this.p(-Y.fenceZ), this.m(Y.fenceX * 2), this.m(Y.fenceZ * 2));
    ctx.strokeStyle = '#8a92a5';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.p(-Y.fenceX), this.p(-Y.fenceZ), this.m(Y.fenceX * 2), this.m(Y.fenceZ * 2));
    ctx.fillStyle = '#d8dee8';
    ctx.fillRect(this.p(-W / 2), this.p(-D / 2), this.m(W), this.m(D));
    ctx.fillStyle = '#1b2230';
    ctx.font = '700 15px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WAREHOUSE', this.p(0), this.p(0) + 5);

    // client stores
    this.stores.forEach((s, i) => {
      ctx.fillStyle = '#b98cff';
      ctx.beginPath();
      ctx.arc(this.p(s.x), this.p(s.z), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8eaf0';
      ctx.font = '600 13px -apple-system, sans-serif';
      // stagger the labels so neighbouring shops stay readable
      const away = s.z > 0 ? 1 : -1;
      const step = (i % 2) * 15;
      ctx.fillText(s.name, this.p(s.x), this.p(s.z) + away * (18 + step) + (away < 0 ? -2 : 0));
    });

    // live dots
    for (const d of this.dots?.() ?? []) {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(this.p(d.x), this.p(d.z), d.size, 0, Math.PI * 2);
      ctx.fill();
      if (d.label) {
        ctx.fillStyle = '#e8eaf0';
        ctx.font = '600 12px -apple-system, sans-serif';
        ctx.fillText(d.label, this.p(d.x), this.p(d.z) - 10);
      }
    }
  }
}
