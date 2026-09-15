interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
  w: number;
  h: number;
}

const COLORS = ['#ffb020', '#38d15e', '#5aa9e6', '#f05555', '#ffffff', '#ffd23f'];

/** Full-screen confetti burst on a canvas overlay (DOM, cheap, no WebGL). */
export class Confetti {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pieces: Piece[] = [];
  private raf = 0;
  private last = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'confetti';
    this.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90;display:none;';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  burst(count = 140, originY = 0.35): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 380 + Math.random() * 520;
      this.pieces.push({
        x: w / 2 + (Math.random() - 0.5) * 60,
        y: h * originY,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
      });
    }
    this.canvas.style.display = 'block';
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number): void => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.vy += 900 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > h + 20) {
        this.pieces.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.5)));
      ctx.restore();
    }
    if (this.pieces.length) this.raf = requestAnimationFrame(this.tick);
    else {
      this.raf = 0;
      this.canvas.style.display = 'none';
    }
  };
}
