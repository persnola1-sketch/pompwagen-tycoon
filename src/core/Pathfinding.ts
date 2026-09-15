import { AABB, Point } from './Geometry';

/**
 * Grid A* over the warehouse floor. Cells blocked by colliders (inflated by
 * the agent radius) are impassable; paths are smoothed by string-pulling so
 * workers walk straight lines between corners instead of zig-zagging.
 */
export class NavGrid {
  private cols: number;
  private rows: number;
  private blocked: Uint8Array;
  private cell: number;

  constructor(private minX: number, private minZ: number, maxX: number, maxZ: number, cell = 0.5) {
    this.cell = cell;
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  /** rebuild the blocked map from colliders, inflated by `radius` */
  rebuild(colliders: AABB[], radius: number): void {
    this.blocked.fill(0);
    for (const c of colliders) {
      const c0 = Math.max(0, Math.floor((c.minX - radius - this.minX) / this.cell));
      const c1 = Math.min(this.cols - 1, Math.floor((c.maxX + radius - this.minX) / this.cell));
      const r0 = Math.max(0, Math.floor((c.minZ - radius - this.minZ) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.floor((c.maxZ + radius - this.minZ) / this.cell));
      for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) this.blocked[r * this.cols + cc] = 1;
    }
  }

  private toCell(p: Point): [number, number] {
    return [
      Math.max(0, Math.min(this.cols - 1, Math.floor((p.x - this.minX) / this.cell))),
      Math.max(0, Math.min(this.rows - 1, Math.floor((p.z - this.minZ) / this.cell))),
    ];
  }

  private toPoint(c: number, r: number): Point {
    return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell };
  }

  isBlocked(p: Point): boolean {
    const [c, r] = this.toCell(p);
    return this.blocked[r * this.cols + c] === 1;
  }

  /** nearest free cell centre to p (spiral search) */
  nearestFree(p: Point): Point {
    const [c0, r0] = this.toCell(p);
    if (!this.blocked[r0 * this.cols + c0]) return p;
    for (let ring = 1; ring < 12; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          if (!this.blocked[r * this.cols + c]) return this.toPoint(c, r);
        }
      }
    }
    return p;
  }

  private lineFree(a: Point, b: Point): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (this.isBlocked({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  /** A* path (list of waypoints, excluding the start, ending at `to`) */
  find(from: Point, to: Point): Point[] {
    const start = this.nearestFree(from);
    const goal = this.nearestFree(to);
    if (this.lineFree(start, goal)) return [to];
    const [sc, sr] = this.toCell(start);
    const [gc, gr] = this.toCell(goal);
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const f = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open: number[] = [];
    const si = sr * this.cols + sc;
    const gi = gr * this.cols + gc;
    const h = (i: number): number => {
      const dc = (i % this.cols) - gc;
      const dr = Math.floor(i / this.cols) - gr;
      return Math.hypot(dc, dr);
    };
    g[si] = 0;
    f[si] = h(si);
    open.push(si);
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];
    let found = false;
    let iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === gi) {
        found = true;
        break;
      }
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = Math.floor(cur / this.cols);
      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (this.blocked[ni] || closed[ni]) continue;
        // no corner cutting through blocked cells
        if (dc && dr && (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc])) continue;
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          f[ni] = ng + h(ni);
          came[ni] = cur;
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
    if (!found) return [to];
    const cells: Point[] = [];
    for (let i = gi; i !== -1 && i !== si; i = came[i]) cells.push(this.toPoint(i % this.cols, Math.floor(i / this.cols)));
    cells.reverse();
    cells.push(to);
    // string pulling
    const out: Point[] = [];
    let anchor = start;
    let last = cells[0];
    for (let i = 1; i < cells.length; i++) {
      if (this.lineFree(anchor, cells[i])) {
        last = cells[i];
        continue;
      }
      out.push(last);
      anchor = last;
      last = cells[i];
    }
    out.push(cells[cells.length - 1]);
    return out;
  }
}
