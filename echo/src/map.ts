import { pick, rand, randInt, shuffle, clamp } from './util';

export type ObstacleKind = 'wall' | 'hedge' | 'car' | 'table' | 'sofa' | 'crate' | 'counter' | 'cabinet' | 'bin' | 'bed';

export interface Rect {
  x: number; y: number; w: number; h: number;
  kind: ObstacleKind;
  color: string;
}

export type FloorStyle = 'checker' | 'scales' | 'tiles' | 'wood' | 'street' | 'grass' | 'carpet' | 'arcade';

export interface Room {
  x: number; y: number; w: number; h: number;
  floor: FloorStyle;
  outdoor: boolean;
}

export interface Seg { ax: number; ay: number; bx: number; by: number; id: number }

export interface Lamp { x: number; y: number; r: number; color: string }
export interface Bulb { x: number; y: number; color: string }

export const CELL = 420;
export const GRID_N = 7;
export const WALL_T = 18;
const DOOR = 120;
export const NAV = 20;
export const UNIT_R = 21;

export class GameMap {
  readonly w = CELL * GRID_N;
  readonly h = CELL * GRID_N;
  rects: Rect[] = [];
  rooms: Room[] = [];
  segs: Seg[] = [];
  lamps: Lamp[] = [];
  bulbs: Bulb[] = [];
  /** walkable[ny * navW + nx] */
  walkable!: Uint8Array;
  navW = 0;
  navH = 0;
  canvas!: HTMLCanvasElement;

  private bucketSize = 240;
  private bucketsW = 0;
  private buckets: number[][] = [];
  private stamp = 1;
  private segStamp!: Uint32Array;

  constructor() {
    this.generate();
    this.buildSegments();
    this.buildNav();
    this.canvas = this.prerender();
  }

  // ---------------------------------------------------------------- generation

  private generate() {
    const N = GRID_N;
    const outdoor: boolean[][] = [];
    // one street crossing the map, a few courtyards; everything else is buildings
    const horizontalStreet = Math.random() < 0.5;
    const streetRow = horizontalStreet ? randInt(1, N - 2) : -1;
    const streetCol = horizontalStreet ? -1 : randInt(1, N - 2);
    for (let gy = 0; gy < N; gy++) {
      outdoor.push([]);
      for (let gx = 0; gx < N; gx++) {
        outdoor[gy].push(gy === streetRow || gx === streetCol || Math.random() < 0.07);
      }
    }
    const indoorStyles: FloorStyle[] = ['checker', 'scales', 'tiles', 'wood', 'carpet', 'arcade'];
    const styles: FloorStyle[][] = [];
    for (let gy = 0; gy < N; gy++) {
      styles.push([]);
      for (let gx = 0; gx < N; gx++) {
        let s: FloorStyle;
        if (outdoor[gy][gx]) {
          s = gy === streetRow || gx === streetCol ? 'street' : 'grass';
        } else {
          s = pick(indoorStyles);
        }
        styles[gy].push(s);
      }
    }
    // Merge some indoor neighbours into big rooms with the same floor.
    const openEdge = new Set<string>();
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        if (outdoor[gy][gx]) continue;
        if (gx + 1 < N && !outdoor[gy][gx + 1] && Math.random() < 0.22) {
          openEdge.add(`v${gx + 1},${gy}`);
          styles[gy][gx + 1] = styles[gy][gx];
        }
        if (gy + 1 < N && !outdoor[gy + 1][gx] && Math.random() < 0.22) {
          openEdge.add(`h${gx},${gy + 1}`);
          styles[gy + 1][gx] = styles[gy][gx];
        }
      }
    }
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        this.rooms.push({ x: gx * CELL, y: gy * CELL, w: CELL, h: CELL, floor: styles[gy][gx], outdoor: outdoor[gy][gx] });
      }
    }

    // Border walls
    const W = this.w, H = this.h, T = WALL_T;
    this.addWall(0, 0, W, T);
    this.addWall(0, H - T, W, T);
    this.addWall(0, 0, T, H);
    this.addWall(W - T, 0, T, H);

    // Interior edges. Vertical edges at x = gx*CELL between (gx-1,gy) and (gx,gy)
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 1; gx < N; gx++) {
        const a = outdoor[gy][gx - 1], b = outdoor[gy][gx];
        if (a && b) continue;
        if (openEdge.has(`v${gx},${gy}`)) continue;
        const doors = !a && !b ? randInt(1, 2) : 1;
        this.wallWithDoors(gx * CELL, gy * CELL, false, doors, a || b);
      }
    }
    for (let gy = 1; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const a = outdoor[gy - 1][gx], b = outdoor[gy][gx];
        if (a && b) continue;
        if (openEdge.has(`h${gx},${gy}`)) continue;
        const doors = !a && !b ? randInt(1, 2) : 1;
        this.wallWithDoors(gx * CELL, gy * CELL, true, doors, a || b);
      }
    }

    // Furniture / props per cell
    for (const room of this.rooms) this.furnish(room);
  }

  private addWall(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, kind: 'wall', color: '#07040c' });
  }

  private wallWithDoors(x: number, y: number, horizontal: boolean, doors: number, exterior: boolean) {
    const T = WALL_T;
    const len = CELL;
    const slots = shuffle([0, 1, 2]).slice(0, doors).sort();
    const cuts: [number, number][] = [];
    for (const s of slots) {
      const c = (s + 0.5) * (len / 3) + rand(-30, 30);
      const dw = exterior ? DOOR + 20 : DOOR;
      cuts.push([c - dw / 2, c + dw / 2]);
    }
    let start = -T / 2;
    const pieces: [number, number][] = [];
    for (const [c0, c1] of cuts) {
      pieces.push([start, c0]);
      start = c1;
    }
    pieces.push([start, len + T / 2]);
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 8) continue;
      if (horizontal) this.addWall(x + p0, y - T / 2, p1 - p0, T);
      else this.addWall(x - T / 2, y + p0, T, p1 - p0);
    }
    if (exterior && Math.random() < 0.6) {
      // string lights along exterior walls (emissive bulbs)
      const colors = ['#ff4d6d', '#4dd2ff', '#7dff6a', '#ffd84d'];
      for (let t = 12; t < len; t += 30) {
        if (cuts.some(([c0, c1]) => t > c0 - 6 && t < c1 + 6)) continue;
        const off = 12;
        const c = colors[Math.floor(t / 30) % colors.length];
        if (horizontal) { this.bulbs.push({ x: x + t, y: y - off, color: c }); this.bulbs.push({ x: x + t, y: y + off, color: c }); }
        else { this.bulbs.push({ x: x - off, y: y + t, color: c }); this.bulbs.push({ x: x + off, y: y + t, color: c }); }
      }
    }
  }

  private fits(r: { x: number; y: number; w: number; h: number }, margin: number): boolean {
    for (const o of this.rects) {
      if (r.x < o.x + o.w + margin && r.x + r.w + margin > o.x && r.y < o.y + o.h + margin && r.y + r.h + margin > o.y) return false;
    }
    return true;
  }

  private place(room: Room, w: number, h: number, kind: ObstacleKind, color: string, inset = 64, margin = 56): boolean {
    for (let i = 0; i < 25; i++) {
      const x = rand(room.x + inset, room.x + room.w - inset - w);
      const y = rand(room.y + inset, room.y + room.h - inset - h);
      const r = { x, y, w, h, kind, color };
      if (this.fits(r, margin)) { this.rects.push(r); return true; }
    }
    return false;
  }

  private furnish(room: Room) {
    const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
    switch (room.floor) {
      case 'street': {
        const carColors = ['#c23b3b', '#3b6dc2', '#2f7a4a', '#c2a13b', '#6b6b7a', '#8a3bc2'];
        const n = randInt(1, 2);
        for (let i = 0; i < n; i++) {
          const vertical = Math.random() < 0.5;
          this.place(room, vertical ? 70 : 140, vertical ? 140 : 70, 'car', pick(carColors), 50, 60);
        }
        if (Math.random() < 0.6) this.place(room, 30, 30, 'bin', '#3d4d3d', 40, 50);
        this.lamps.push({ x: cx + rand(-120, 120), y: cy + rand(-120, 120), r: 150, color: 'rgba(255,190,90,0.20)' });
        break;
      }
      case 'grass': {
        const n = randInt(2, 3);
        for (let i = 0; i < n; i++) this.place(room, rand(70, 150), rand(70, 150), 'hedge', '#2f7d3a', 50, 70);
        break;
      }
      case 'checker':
      case 'carpet': {
        this.place(room, 130, 50, 'sofa', pick(['#6b2a4a', '#2a4a6b', '#5a3a2a']));
        this.place(room, 60, 60, 'table', '#7a3a2a');
        if (Math.random() < 0.6) this.place(room, 60, 60, 'table', '#7a3a2a');
        if (Math.random() < 0.5) this.place(room, 46, 46, 'crate', '#8a5a2a');
        this.lamps.push({ x: cx, y: cy, r: 170, color: 'rgba(255,200,120,0.22)' });
        break;
      }
      case 'scales': {
        for (let i = 0; i < 3; i++) this.place(room, 64, 64, 'table', '#8a3030');
        this.lamps.push({ x: cx + rand(-80, 80), y: cy + rand(-80, 80), r: 160, color: 'rgba(255,170,90,0.22)' });
        break;
      }
      case 'tiles': {
        this.place(room, 150, 40, 'counter', '#3a5a6a');
        if (Math.random() < 0.7) this.place(room, 50, 50, 'crate', '#8a5a2a');
        this.lamps.push({ x: cx, y: cy, r: 150, color: 'rgba(140,220,255,0.18)' });
        break;
      }
      case 'wood': {
        this.place(room, 110, 60, 'bed', '#5a4a8a');
        this.place(room, 90, 46, 'counter', '#5a3a26');
        if (Math.random() < 0.6) this.place(room, 46, 46, 'crate', '#8a5a2a');
        this.lamps.push({ x: cx, y: cy, r: 160, color: 'rgba(255,190,110,0.22)' });
        break;
      }
      case 'arcade': {
        for (let i = 0; i < 3; i++) this.place(room, 46, 46, 'cabinet', pick(['#b03adf', '#3adfd0', '#df3a7a']), 60, 60);
        this.lamps.push({ x: cx, y: cy, r: 150, color: 'rgba(200,120,255,0.20)' });
        break;
      }
    }
    // Occasional stub wall inside indoor rooms for extra cover
    if (!room.outdoor && Math.random() < 0.45) {
      const horizontal = Math.random() < 0.5;
      const len = rand(110, 170);
      if (horizontal) this.place(room, len, WALL_T, 'wall', '#07040c', 90, 60);
      else this.place(room, WALL_T, len, 'wall', '#07040c', 90, 60);
    }
  }

  // ---------------------------------------------------------------- segments

  private buildSegments() {
    let id = 0;
    for (const r of this.rects) {
      const { x, y, w, h } = r;
      this.segs.push({ ax: x, ay: y, bx: x + w, by: y, id: id++ });
      this.segs.push({ ax: x + w, ay: y, bx: x + w, by: y + h, id: id++ });
      this.segs.push({ ax: x + w, ay: y + h, bx: x, by: y + h, id: id++ });
      this.segs.push({ ax: x, ay: y + h, bx: x, by: y, id: id++ });
    }
    const B = this.bucketSize;
    this.bucketsW = Math.ceil(this.w / B);
    const bh = Math.ceil(this.h / B);
    this.buckets = Array.from({ length: this.bucketsW * bh }, () => []);
    this.segStamp = new Uint32Array(this.segs.length);
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const x0 = clamp(Math.floor(Math.min(s.ax, s.bx) / B), 0, this.bucketsW - 1);
      const x1 = clamp(Math.floor(Math.max(s.ax, s.bx) / B), 0, this.bucketsW - 1);
      const y0 = clamp(Math.floor(Math.min(s.ay, s.by) / B), 0, bh - 1);
      const y1 = clamp(Math.floor(Math.max(s.ay, s.by) / B), 0, bh - 1);
      for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) this.buckets[by * this.bucketsW + bx].push(i);
    }
  }

  /** Segments whose buckets overlap the given box. */
  segsInBox(x0: number, y0: number, x1: number, y1: number, out: Seg[]): Seg[] {
    out.length = 0;
    const B = this.bucketSize;
    const bh = this.buckets.length / this.bucketsW;
    const bx0 = clamp(Math.floor(x0 / B), 0, this.bucketsW - 1), bx1 = clamp(Math.floor(x1 / B), 0, this.bucketsW - 1);
    const by0 = clamp(Math.floor(y0 / B), 0, bh - 1), by1 = clamp(Math.floor(y1 / B), 0, bh - 1);
    const st = ++this.stamp;
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        for (const i of this.buckets[by * this.bucketsW + bx]) {
          if (this.segStamp[i] === st) continue;
          this.segStamp[i] = st;
          out.push(this.segs[i]);
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- collision / nav

  /** Push a circle out of all rects. Returns corrected position. */
  collide(x: number, y: number, r: number): { x: number; y: number } {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const o of this.rects) {
        if (x + r < o.x || x - r > o.x + o.w || y + r < o.y || y - r > o.y + o.h) continue;
        const nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h);
        let dx = x - nx, dy = y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 < 1e-6) {
          // center inside rect: push out along smallest axis
          const left = x - o.x, right = o.x + o.w - x, top = y - o.y, bottom = o.y + o.h - y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = o.x - r; else if (m === right) x = o.x + o.w + r; else if (m === top) y = o.y - r; else y = o.y + o.h + r;
        } else {
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          x = nx + dx * r; y = ny + dy * r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return { x, y };
  }

  blockedPoint(x: number, y: number, r = 0): boolean {
    if (x < r || y < r || x > this.w - r || y > this.h - r) return true;
    for (const o of this.rects) {
      if (x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h) return true;
    }
    return false;
  }

  private buildNav() {
    this.navW = Math.ceil(this.w / NAV);
    this.navH = Math.ceil(this.h / NAV);
    this.walkable = new Uint8Array(this.navW * this.navH);
    for (let ny = 0; ny < this.navH; ny++) {
      for (let nx = 0; nx < this.navW; nx++) {
        const x = (nx + 0.5) * NAV, y = (ny + 0.5) * NAV;
        this.walkable[ny * this.navW + nx] = this.blockedPoint(x, y, UNIT_R + 3) ? 0 : 1;
      }
    }
  }

  isWalkableCell(nx: number, ny: number): boolean {
    return nx >= 0 && ny >= 0 && nx < this.navW && ny < this.navH && this.walkable[ny * this.navW + nx] === 1;
  }

  walkableAt(x: number, y: number): boolean {
    return this.isWalkableCell(Math.floor(x / NAV), Math.floor(y / NAV));
  }

  /** Straight-line walkability on the nav grid (used for path smoothing). */
  clearLine(ax: number, ay: number, bx: number, by: number): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / (NAV * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      if (!this.walkableAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  /** A* on the nav grid, returns smoothed waypoints (world coords) excluding start. */
  findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
    const W = this.navW, H = this.navH;
    let s = this.nearestWalkable(Math.floor(sx / NAV), Math.floor(sy / NAV));
    let t = this.nearestWalkable(Math.floor(tx / NAV), Math.floor(ty / NAV));
    if (s < 0 || t < 0) return null;
    const N = W * H;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: number[] = [];
    const f = new Float32Array(N);
    const tx0 = t % W, ty0 = Math.floor(t / W);
    const h = (i: number) => {
      const dx = Math.abs((i % W) - tx0), dy = Math.abs(Math.floor(i / W) - ty0);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    const push = (i: number) => {
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]] <= f[heap[k]]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    g[s] = 0; f[s] = h(s); push(s);
    let found = false;
    let expanded = 0;
    while (heap.length) {
      const cur = pop();
      if (closed[cur]) continue;
      if (cur === t) { found = true; break; }
      closed[cur] = 1;
      if (++expanded > 9000) break;
      const cx = cur % W, cy = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.isWalkableCell(nx, ny)) continue;
          if (dx && dy && (!this.isWalkableCell(cx + dx, cy) || !this.isWalkableCell(cx, cy + dy))) continue;
          const ni = ny * W + nx;
          if (closed[ni]) continue;
          const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1);
          if (ng < g[ni]) {
            g[ni] = ng; came[ni] = cur; f[ni] = ng + h(ni); push(ni);
          }
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let c = t; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map(c => ({ x: (c % W + 0.5) * NAV, y: (Math.floor(c / W) + 0.5) * NAV }));
    // string pulling
    const out: { x: number; y: number }[] = [];
    let anchor = { x: sx, y: sy };
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clearLine(anchor.x, anchor.y, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j;
    }
    if (out.length === 0) out.push(pts[pts.length - 1]);
    return out;
  }

  private nearestWalkable(nx: number, ny: number): number {
    for (let r = 0; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.isWalkableCell(nx + dx, ny + dy)) return (ny + dy) * this.navW + nx + dx;
        }
      }
    }
    return -1;
  }

  randomWalkable(x0 = 0, y0 = 0, x1 = this.w, y1 = this.h): { x: number; y: number } {
    for (let i = 0; i < 200; i++) {
      const x = rand(x0, x1), y = rand(y0, y1);
      if (this.walkableAt(x, y) && !this.blockedPoint(x, y, UNIT_R + 8)) return { x, y };
    }
    return { x: this.w / 2, y: this.h / 2 };
  }

  // ---------------------------------------------------------------- rendering

  private prerender(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d')!;
    const patterns = makeFloorPatterns(ctx);
    for (const room of this.rooms) {
      ctx.fillStyle = patterns[room.floor];
      ctx.fillRect(room.x, room.y, room.w, room.h);
      if (room.floor === 'street') drawStreetMarks(ctx, room);
      if (!room.outdoor) {
        // subtle rug / decal in the middle of rooms
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = pick(['#ff7ad9', '#7af0ff', '#ffd27a', '#b07aff']);
        const rw = rand(140, 220), rh = rand(100, 180);
        roundRect(ctx, room.x + room.w / 2 - rw / 2, room.y + room.h / 2 - rh / 2, rw, rh, 18);
        ctx.fill();
        ctx.restore();
      }
    }
    // scattered debris
    ctx.save();
    for (let i = 0; i < 900; i++) {
      ctx.globalAlpha = rand(0.05, 0.16);
      ctx.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
      const s = rand(2, 6);
      ctx.fillRect(rand(0, this.w), rand(0, this.h), s, s);
    }
    ctx.restore();
    // obstacle drop shadows
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const r of this.rects) if (r.kind !== 'wall') { roundRect(ctx, r.x + 6, r.y + 8, r.w, r.h, 8); ctx.fill(); }
    ctx.restore();
    for (const r of this.rects) drawObstacle(ctx, r);
    return c;
  }
}

// ------------------------------------------------------------------ drawing helpers

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tile(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  return c;
}

function makeFloorPatterns(ctx: CanvasRenderingContext2D): Record<FloorStyle, CanvasPattern> {
  const p = (c: HTMLCanvasElement) => ctx.createPattern(c, 'repeat')!;
  return {
    checker: p(tile(80, (g, s) => {
      g.fillStyle = '#3d2b58'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#4a3569'; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
    })),
    scales: p(tile(48, (g, s) => {
      g.fillStyle = '#5c2c55'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#7a3e70'; g.lineWidth = 2;
      for (const [x, y] of [[0, 0], [s, 0], [s / 2, s / 2], [0, s], [s, s]]) {
        for (const rr of [s / 2 - 2, s / 3, s / 6]) { g.beginPath(); g.arc(x, y, rr, 0, Math.PI); g.stroke(); }
      }
    })),
    tiles: p(tile(56, (g, s) => {
      g.fillStyle = '#1f4d63'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#25596f'; g.fillRect(3, 3, s - 6, s - 6);
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(3, 3, s - 6, 6);
    })),
    wood: p(tile(64, (g, s) => {
      g.fillStyle = '#4b3328'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#3a271e'; g.lineWidth = 2;
      for (let y = 0; y < s; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
      for (let y = 0; y < s; y += 16) { const x = (y * 1.7) % s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); }
    })),
    street: p(tile(64, (g, s) => {
      g.fillStyle = '#2b2a38'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
    })),
    grass: p(tile(64, (g, s) => {
      g.fillStyle = '#2c5534'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) { g.fillStyle = Math.random() < 0.5 ? '#264b2e' : '#336240'; g.fillRect(Math.random() * s, Math.random() * s, 3, 5); }
    })),
    carpet: p(tile(40, (g, s) => {
      g.fillStyle = '#4a1f42'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#5e2a55'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(s / 2, 2); g.lineTo(s - 2, s / 2); g.lineTo(s / 2, s - 2); g.lineTo(2, s / 2); g.closePath(); g.stroke();
    })),
    arcade: p(tile(60, (g, s) => {
      g.fillStyle = '#251a3f'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#3b2b6a'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
      g.fillStyle = '#4a2f8a'; g.fillRect(s / 2 - 3, s / 2 - 3, 6, 6);
    })),
  };
}

function drawStreetMarks(ctx: CanvasRenderingContext2D, room: Room) {
  ctx.save();
  ctx.strokeStyle = 'rgba(214,180,70,0.55)';
  ctx.lineWidth = 6;
  ctx.setLineDash([40, 34]);
  ctx.beginPath();
  ctx.moveTo(room.x, room.y + room.h / 2); ctx.lineTo(room.x + room.w, room.y + room.h / 2);
  ctx.moveTo(room.x + room.w / 2, room.y); ctx.lineTo(room.x + room.w / 2, room.y + room.h);
  ctx.stroke();
  ctx.restore();
  // sidewalk edges
  ctx.fillStyle = 'rgba(80,78,100,0.5)';
  ctx.fillRect(room.x, room.y, room.w, 26);
  ctx.fillRect(room.x, room.y + room.h - 26, room.w, 26);
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function drawObstacle(ctx: CanvasRenderingContext2D, r: Rect) {
  const { x, y, w, h, color } = r;
  ctx.save();
  switch (r.kind) {
    case 'wall':
      ctx.fillStyle = '#06030b';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      break;
    case 'hedge': {
      ctx.fillStyle = '#1d4d25';
      roundRect(ctx, x, y, w, h, 18); ctx.fill();
      for (let i = 0; i < (w * h) / 500; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? '#2f7d3a' : '#3d9a49';
        ctx.beginPath();
        ctx.arc(rand(x + 10, x + w - 10), rand(y + 10, y + h - 10), rand(8, 16), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'car': {
      const vertical = h > w;
      ctx.fillStyle = shade(color, -50);
      roundRect(ctx, x, y, w, h, 14); ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 12); ctx.fill();
      ctx.fillStyle = '#1a2233';
      if (vertical) { roundRect(ctx, x + 10, y + h * 0.28, w - 20, h * 0.18, 5); ctx.fill(); roundRect(ctx, x + 10, y + h * 0.62, w - 20, h * 0.12, 5); ctx.fill(); }
      else { roundRect(ctx, x + w * 0.28, y + 10, w * 0.18, h - 20, 5); ctx.fill(); roundRect(ctx, x + w * 0.62, y + 10, w * 0.12, h - 20, 5); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, x + 8, y + 8, vertical ? w - 16 : w * 0.2, vertical ? h * 0.15 : h - 16, 6); ctx.fill();
      break;
    }
    case 'table':
      ctx.fillStyle = shade(color, -40);
      roundRect(ctx, x, y, w, h, w / 2.4); ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, x + 5, y + 5, w - 10, h - 10, w / 2.6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + w / 2 + rand(-12, 12), y + h / 2 + rand(-12, 12), 5, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'sofa':
      ctx.fillStyle = shade(color, -40);
      roundRect(ctx, x, y, w, h, 12); ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, x + 8, y + 10, w - 16, h - 14, 8); ctx.fill();
      ctx.strokeStyle = shade(color, -60); ctx.lineWidth = 2;
      for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + (w * i) / 3, y + 12); ctx.lineTo(x + (w * i) / 3, y + h - 6); ctx.stroke(); }
      break;
    case 'crate':
      ctx.fillStyle = '#5a3415';
      roundRect(ctx, x, y, w, h, 6); ctx.fill();
      ctx.fillStyle = '#9a5f22';
      roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 4); ctx.fill();
      ctx.strokeStyle = '#5a3415'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + w - 6, y + h - 6); ctx.moveTo(x + w - 6, y + 6); ctx.lineTo(x + 6, y + h - 6); ctx.stroke();
      break;
    case 'counter':
      ctx.fillStyle = shade(color, -40);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 4, y + 4, w - 8, 6);
      break;
    case 'bed':
      ctx.fillStyle = '#2a1e18'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color; roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 6); ctx.fill();
      ctx.fillStyle = '#e8e0f0'; roundRect(ctx, x + 8, y + 8, w * 0.22, h - 16, 6); ctx.fill();
      break;
    case 'cabinet':
      ctx.fillStyle = '#140c22'; roundRect(ctx, x, y, w, h, 6); ctx.fill();
      ctx.fillStyle = color; roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 4); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 12, y + 12, w - 24, h - 24);
      break;
    case 'bin':
      ctx.fillStyle = '#1e2a1e'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.restore();
}
