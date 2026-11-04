import type { GameMap, Seg } from './map';
import { wrapAngle, TAU } from './util';

export interface VisPoly {
  /** flat x,y pairs of the polygon boundary (excluding the origin for cones) */
  pts: number[];
  /** wall segment id hit by each point, -1 if the ray ran to full range */
  ids: number[];
  ox: number; oy: number;
  cone: boolean;
}

const scratch: Seg[] = [];
const EPS = 0.0004;

function castRay(segs: Seg[], ox: number, oy: number, dx: number, dy: number, range: number): [number, number] {
  let best = range;
  let bestId = -1;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ex = s.bx - s.ax, ey = s.by - s.ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const fx = s.ax - ox, fy = s.ay - oy;
    const t = (fx * ey - fy * ex) / den;
    if (t <= 0 || t >= best) continue;
    const u = (fx * dy - fy * dx) / den;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    best = t;
    bestId = s.id;
  }
  return [best, bestId];
}

/**
 * Visibility polygon from (ox,oy). If halfAngle >= PI a full circle is produced.
 */
export function visPoly(map: GameMap, ox: number, oy: number, dir: number, halfAngle: number, range: number, out?: VisPoly): VisPoly {
  const res: VisPoly = out ?? { pts: [], ids: [], ox, oy, cone: true };
  res.pts.length = 0; res.ids.length = 0; res.ox = ox; res.oy = oy;
  const full = halfAngle >= Math.PI - 1e-3;
  res.cone = !full;
  const segs = map.segsInBox(ox - range, oy - range, ox + range, oy + range, scratch);
  const rel: number[] = [];
  const start = full ? -Math.PI : -halfAngle;
  const end = full ? Math.PI : halfAngle;
  const step = full ? TAU / 72 : Math.max(0.012, (end - start) / 80);
  for (let a = start; a < end; a += step) rel.push(a);
  rel.push(end);
  const r2 = range * range * 1.05;
  for (const s of segs) {
    for (let k = 0; k < 2; k++) {
      const px = k ? s.bx : s.ax, py = k ? s.by : s.ay;
      const dx = px - ox, dy = py - oy;
      if (dx * dx + dy * dy > r2) continue;
      const a = wrapAngle(Math.atan2(dy, dx) - dir);
      if (full) { rel.push(a - EPS, a, a + EPS); continue; }
      if (a < start || a > end) continue;
      if (a - EPS > start) rel.push(a - EPS);
      rel.push(a);
      if (a + EPS < end) rel.push(a + EPS);
    }
  }
  rel.sort((p, q) => p - q);
  let last = -99;
  for (const a of rel) {
    if (a - last < 1e-6) continue;
    last = a;
    const ang = dir + a;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const [t, id] = castRay(segs, ox, oy, dx, dy, range);
    res.pts.push(ox + dx * t, oy + dy * t);
    res.ids.push(id);
  }
  return res;
}

export function tracePath(ctx: CanvasRenderingContext2D, p: VisPoly) {
  if (p.cone) ctx.moveTo(p.ox, p.oy);
  else ctx.moveTo(p.pts[0], p.pts[1]);
  for (let i = 0; i < p.pts.length; i += 2) ctx.lineTo(p.pts[i], p.pts[i + 1]);
  ctx.closePath();
}

export function pointInVis(p: VisPoly, x: number, y: number): boolean {
  const pts = p.pts;
  let inside = false;
  const n = pts.length / 2 + (p.cone ? 1 : 0);
  const vx = (i: number) => (p.cone ? (i === 0 ? p.ox : pts[(i - 1) * 2]) : pts[i * 2]);
  const vy = (i: number) => (p.cone ? (i === 0 ? p.oy : pts[(i - 1) * 2 + 1]) : pts[i * 2 + 1]);
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vx(i), yi = vy(i), xj = vx(j), yj = vy(j);
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True if the straight line between the two points is not blocked by any wall/obstacle. */
export function lineOfSight(map: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  const segs = map.segsInBox(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), scratch);
  const dx = bx - ax, dy = by - ay;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ex = s.bx - s.ax, ey = s.by - s.ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const fx = s.ax - ax, fy = s.ay - ay;
    const t = (fx * ey - fy * ex) / den;
    if (t <= 0 || t >= 1) continue;
    const u = (fx * dy - fy * dx) / den;
    if (u < 0 || u > 1) continue;
    return false;
  }
  return true;
}

/** Distance along a ray until it hits a wall (for bullets). */
export function rayDistance(map: GameMap, ox: number, oy: number, ang: number, range: number): number {
  const segs = map.segsInBox(ox - range, oy - range, ox + range, oy + range, scratch);
  return castRay(segs, ox, oy, Math.cos(ang), Math.sin(ang), range)[0];
}
