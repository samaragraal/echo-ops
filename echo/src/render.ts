import type { Game, Pickup, Marker } from './game';
import type { Unit } from './unit';
import { img, silhouette, fxTex } from './assets';
import { tracePath, VisPoly } from './visibility';
import { roundRect } from './map';
import { VIEW_W, VIEW_H, ANCHOR_X, ANCHOR_Y, LIGHT_RANGE, UNIT_RADIUS, ZOOM } from './view';
import { abilityBtn } from './input';
import { clamp, dist, TAU, easeOutBack } from './util';

const VIEW_R = 1000;
const FONT_D = "'Bebas Neue', Impact, sans-serif";
const FONT_N = "'Rubik', system-ui, sans-serif";

export class Renderer {
  ctx: CanvasRenderingContext2D;
  scale = 1;
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(cssW: number, cssH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.scale = (cssW * dpr) / VIEW_W;
  }

  private screen() { this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0); }

  private world(g: Game) {
    const c = this.ctx, p = g.player;
    const sh = g.fx.shake;
    this.screen();
    c.translate(ANCHOR_X + (Math.random() - 0.5) * sh, ANCHOR_Y + (Math.random() - 0.5) * sh);
    c.scale(ZOOM, ZOOM);
    c.rotate(-Math.PI / 2 - g.camAngle);
    c.translate(-p.x, -p.y);
  }

  toScreen(g: Game, x: number, y: number): [number, number] {
    const p = g.player;
    const rot = -Math.PI / 2 - g.camAngle;
    const dx = (x - p.x) * ZOOM, dy = (y - p.y) * ZOOM;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    return [ANCHOR_X + dx * cs - dy * sn, ANCHOR_Y + dx * sn + dy * cs];
  }

  private drawMap(g: Game) {
    const p = g.player, m = g.map;
    const x0 = clamp(p.x - VIEW_R, 0, m.w), y0 = clamp(p.y - VIEW_R, 0, m.h);
    const x1 = clamp(p.x + VIEW_R, 0, m.w), y1 = clamp(p.y + VIEW_R, 0, m.h);
    if (x1 > x0 && y1 > y0) this.ctx.drawImage(m.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  }

  render(g: Game) {
    const c = this.ctx;
    const p = g.player;
    this.screen();
    c.fillStyle = '#06030c';
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    // ---- dim world
    this.world(g);
    this.drawMap(g);
    this.screen();
    c.fillStyle = 'rgba(10,4,26,0.64)';
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    // ---- emissive decor (lamps / bulbs)
    this.world(g);
    c.globalCompositeOperation = 'lighter';
    for (const l of g.map.lamps) {
      if (dist(l.x, l.y, p.x, p.y) > VIEW_R + l.r) continue;
      const gr = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      gr.addColorStop(0, l.color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr;
      c.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    const flick = g.time * 2;
    for (const b of g.map.bulbs) {
      if (Math.abs(b.x - p.x) > VIEW_R || Math.abs(b.y - p.y) > VIEW_R) continue;
      const on = Math.sin(flick + b.x * 0.05) > -0.6;
      c.fillStyle = b.color;
      c.globalAlpha = on ? 0.95 : 0.35;
      c.beginPath(); c.arc(b.x, b.y, 2.2, 0, TAU); c.fill();
      c.globalAlpha = on ? 0.22 : 0.06;
      c.beginPath(); c.arc(b.x, b.y, 6, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // ---- flashlight (occluded) + personal light
    if (p.alive && p.vis) {
      c.save();
      c.beginPath();
      tracePath(c, p.vis);
      tracePath(c, g.selfVis);
      c.clip('nonzero');
      this.drawMap(g);
      c.restore();
      // the flashlight beam itself: a lavender wash, brightest near the lens
      c.save();
      c.beginPath();
      tracePath(c, p.vis);
      c.clip();
      c.globalCompositeOperation = 'screen';
      const gr = c.createRadialGradient(p.x, p.y, 10, p.x, p.y, LIGHT_RANGE);
      gr.addColorStop(0, 'rgba(255,248,255,0.85)');
      gr.addColorStop(0.15, 'rgba(238,222,255,0.55)');
      gr.addColorStop(0.55, 'rgba(205,175,255,0.34)');
      gr.addColorStop(1, 'rgba(170,130,255,0.16)');
      c.fillStyle = gr;
      c.fillRect(p.x - LIGHT_RANGE, p.y - LIGHT_RANGE, LIGHT_RANGE * 2, LIGHT_RANGE * 2);
      c.globalCompositeOperation = 'source-over';

      // aim cone (pink), clipped to what the flashlight reveals
      const w = p.weapon;
      const R = w.range;
      const reloading = p.reloadT > 0;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.arc(p.x, p.y, R, p.facing - p.spread, p.facing + p.spread);
      c.closePath();
      const ag = c.createRadialGradient(p.x, p.y, 20, p.x, p.y, R);
      const col = reloading ? '150,150,170' : '255,60,105';
      ag.addColorStop(0, `rgba(${col},0.18)`);
      ag.addColorStop(0.7, `rgba(${col},0.38)`);
      ag.addColorStop(0.92, `rgba(${col},0.5)`);
      ag.addColorStop(1, `rgba(${col},0.68)`);
      c.fillStyle = ag;
      c.fill();
      c.restore();

      // wall rim highlights where the light hits obstacles
      this.drawRims(p.vis);
      this.drawRims(g.selfVis);
    }

    // ---- range ring
    if (p.alive) {
      c.strokeStyle = 'rgba(255,255,255,0.13)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, p.weapon.range, 0, TAU); c.stroke();
    }

    // ---- zone
    this.drawZone(g);

    // ---- pickups
    for (const pk of g.pickups) if (dist(pk.x, pk.y, p.x, p.y) < VIEW_R) this.drawPickup(g, pk);

    // ---- footsteps & shot pings (world)
    for (const m of g.markers) this.drawWorldMarker(m);

    // ---- units
    for (const u of g.units) {
      if (!u.alive) continue;
      if (!g.playerSeesUnit(u)) continue;
      this.drawUnit(g, u);
    }

    // ---- bullets & particles
    const lit = (x: number, y: number) => g.litForPlayer(x, y) || !p.alive;
    g.fx.drawTracers(c, t => lit(t.x0, t.y0) || lit(t.x1, t.y1) || dist(t.x0, t.y0, p.x, p.y) < 50);
    g.fx.drawParticles(c, lit);

    // ---- screen space overlays
    this.screen();
    for (const u of g.units) if (u.alive && g.playerSeesUnit(u)) this.drawUnitLabel(g, u);
    this.drawScreenMarkers(g);
    this.drawTexts(g);
    this.drawVignettes(g);
    this.drawHud(g);
  }

  private drawRims(v: VisPoly) {
    const c = this.ctx;
    c.save();
    c.lineCap = 'round';
    c.beginPath();
    const pts = v.pts, ids = v.ids;
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] < 0 || ids[i] !== ids[i - 1]) continue;
      c.moveTo(pts[(i - 1) * 2], pts[(i - 1) * 2 + 1]);
      c.lineTo(pts[i * 2], pts[i * 2 + 1]);
    }
    c.strokeStyle = 'rgba(200,170,255,0.35)';
    c.lineWidth = 9;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = 3.5;
    c.stroke();
    c.restore();
  }

  private drawZone(g: Game) {
    const c = this.ctx, z = g.zone, p = g.player;
    const r = Math.max(0.1, z.r);
    const outside = () => {
      c.beginPath();
      c.rect(p.x - VIEW_R * 1.5, p.y - VIEW_R * 1.5, VIEW_R * 3, VIEW_R * 3);
      c.arc(z.cx, z.cy, r, 0, TAU, true);
    };
    // outside: burnt orange (multiply darkens + reddens), plus a faint ember glow
    c.save();
    outside();
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = 'rgba(235,105,65,0.62)';
    c.fill('evenodd');
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(90,18,0,0.25)';
    c.fill('evenodd');
    c.restore();
    const dToCenter = dist(p.x, p.y, z.cx, z.cy);
    if (Math.abs(dToCenter - r) < VIEW_R + 80) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const wob = Math.sin(g.time * 7) * 4;
      const ring = (col: string, w: number) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.arc(z.cx, z.cy, r, 0, TAU); c.stroke(); };
      ring('rgba(255,60,10,0.18)', 120 + wob);
      ring('rgba(255,90,20,0.35)', 56 + wob);
      ring('rgba(255,140,40,0.75)', 26);
      ring('rgba(255,210,120,0.95)', 13);
      ring('rgba(255,255,235,1)', 5);
      // flames + embers along the visible arc
      const flame = fxTex('flame_03', '#ff6a1a', 96);
      const ember = fxTex('circle_05', '#ffb050', 32);
      if (r > 10) {
        const base = Math.atan2(p.y - z.cy, p.x - z.cx);
        const span = Math.min(Math.PI, (VIEW_R * 1.1) / r);
        const step = 26 / r;
        for (let a = base - span; a < base + span; a += step) {
          const k = Math.round(a / step);
          const h = Math.sin(k * 12.9898) * 43758.5453;
          const rnd = h - Math.floor(h);
          const fl = 0.55 + 0.45 * Math.sin(g.time * 10 + k * 1.7);
          const fx = z.cx + Math.cos(a) * r, fy = z.cy + Math.sin(a) * r;
          if (flame) {
            c.save();
            c.translate(fx, fy);
            c.rotate(a + Math.PI / 2);
            c.globalAlpha = 0.7 * fl;
            const sz = 50 + 30 * fl;
            c.drawImage(flame, -sz / 2, -sz * 0.95, sz, sz);
            c.restore();
          }
          if (ember) {
            // embers drift outward and fade
            const life = (g.time * (0.5 + rnd) + rnd * 7) % 1;
            const er = r + 20 + life * 140;
            const ea = a + (rnd - 0.5) * step;
            c.globalAlpha = (1 - life) * 0.9;
            const es = 4 + rnd * 6;
            c.drawImage(ember, z.cx + Math.cos(ea) * er - es / 2, z.cy + Math.sin(ea) * er - es / 2, es, es);
          }
        }
        c.globalAlpha = 1;
      }
      c.restore();
    }
    // next safe zone preview
    if (z.state !== 'done' && z.toR > 0 && (z.toR !== z.r)) {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.16)';
      c.setLineDash([14, 22]);
      c.lineWidth = 3;
      c.beginPath(); c.arc(z.toX, z.toY, z.toR, 0, TAU); c.stroke();
      c.restore();
    }
  }

  private drawPickup(g: Game, pk: Pickup) {
    const c = this.ctx;
    const s = pk.kind === 'loot' ? 40 : 32;
    const bob = 1 + Math.sin(pk.bob) * 0.06;
    c.save();
    c.translate(pk.x, pk.y);
    c.rotate(0.25);
    c.scale(bob, bob);
    // glow
    c.globalCompositeOperation = 'lighter';
    const glowCol = pk.kind === 'armor' ? 'rgba(80,190,255,0.35)' : pk.kind === 'medkit' ? 'rgba(255,90,110,0.3)' : pk.kind === 'ammo' || pk.kind === 'loot' ? 'rgba(255,150,50,0.35)' : 'rgba(255,255,255,0.18)';
    const gr = c.createRadialGradient(0, 0, 4, 0, 0, s);
    gr.addColorStop(0, glowCol); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.fillRect(-s, -s, s * 2, s * 2);
    c.globalCompositeOperation = 'source-over';
    // tile
    const bg = pk.kind === 'armor' ? '#1f6fd1' : pk.kind === 'medkit' ? '#e8e8f0' : pk.kind === 'ammo' || pk.kind === 'loot' ? '#e0731f' : '#3a3550';
    const edge = pk.kind === 'armor' ? '#0c3a78' : pk.kind === 'medkit' ? '#9a9aa8' : pk.kind === 'ammo' || pk.kind === 'loot' ? '#8a3c0a' : '#15121f';
    c.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(c, -s / 2 + 3, -s / 2 + 4, s, s, 7); c.fill();
    c.fillStyle = edge;
    roundRect(c, -s / 2, -s / 2, s, s, 7); c.fill();
    c.fillStyle = bg;
    roundRect(c, -s / 2 + 2.5, -s / 2 + 2.5, s - 5, s - 5, 5); c.fill();
    c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
    switch (pk.kind) {
      case 'armor':
        c.beginPath(); c.moveTo(0, -9); c.lineTo(9, -5); c.lineTo(7, 5); c.lineTo(0, 10); c.lineTo(-7, 5); c.lineTo(-9, -5); c.closePath(); c.fill();
        break;
      case 'medkit':
        c.fillStyle = '#e8283c'; c.fillRect(-3.5, -10, 7, 20); c.fillRect(-10, -3.5, 20, 7);
        break;
      case 'ammo':
      case 'loot':
        c.lineWidth = 2.5;
        roundRect(c, -s / 2 + 8, -s / 2 + 8, s - 16, s - 16, 3); c.stroke();
        c.beginPath(); c.moveTo(-s / 2 + 8, 0); c.lineTo(s / 2 - 8, 0); c.moveTo(0, -s / 2 + 8); c.lineTo(0, s / 2 - 8); c.stroke();
        break;
      case 'perk': {
        const id = pk.perk?.id;
        c.lineWidth = 2.5;
        if (id === 'boom') { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r = i % 2 ? 4 : 10; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fillStyle = '#ffb347'; c.fill(); }
        else if (id === 'quiet') { c.beginPath(); c.moveTo(-8, -3); c.lineTo(-3, -3); c.lineTo(3, -8); c.lineTo(3, 8); c.lineTo(-3, 3); c.lineTo(-8, 3); c.closePath(); c.fill(); c.beginPath(); c.moveTo(6, -5); c.lineTo(10, 5); c.stroke(); }
        else if (id === 'hip' || id === 'aim') { c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 2.5, 0, TAU); c.fill(); }
        else if (id === 'speed') { c.beginPath(); c.moveTo(-8, -7); c.lineTo(0, 0); c.lineTo(-8, 7); c.moveTo(0, -7); c.lineTo(8, 0); c.lineTo(0, 7); c.stroke(); }
        else if (id === 'reload') { c.beginPath(); c.arc(0, 0, 8, -2.5, 2); c.stroke(); c.beginPath(); c.moveTo(4, 8); c.lineTo(-1, 9); c.lineTo(3, 4); c.fill(); }
        else if (id === 'mag') { for (let i = -1; i <= 1; i++) c.fillRect(i * 6 - 2, -8, 4, 16); }
        else { c.beginPath(); c.moveTo(-8, 8); c.lineTo(0, -9); c.lineTo(8, 8); c.closePath(); c.stroke(); }
        break;
      }
    }
    c.restore();
  }

  private drawWorldMarker(m: Marker) {
    const c = this.ctx;
    const k = m.life / m.max;
    if (m.kind === 'step') {
      c.save();
      c.translate(m.x, m.y);
      c.rotate((m.ang ?? 0) + Math.PI / 2);
      c.fillStyle = `rgba(255,255,255,${0.55 * k})`;
      c.beginPath(); c.ellipse(-5, 0, 3.5, 6, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(5, -6, 3.5, 6, 0, 0, TAU); c.fill();
      c.restore();
    } else if (m.kind === 'shot') {
      c.save();
      c.strokeStyle = `rgba(255,50,60,${k})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(m.x, m.y, 10 + (1 - k) * 30, 0, TAU); c.stroke();
      c.fillStyle = `rgba(255,50,60,${k})`;
      c.beginPath(); c.arc(m.x, m.y, 6, 0, TAU); c.fill();
      c.restore();
    }
  }

  private drawUnit(g: Game, u: Unit) {
    const c = this.ctx;
    const key = u.spriteKey;
    const sprite = img(key);
    const color = u.isPlayer ? '#8dff4a' : u.hero.color;
    const p = g.player;
    const seenDirect = u.isPlayer || g.canSee(p, u);
    c.save();
    c.translate(u.x, u.y);
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(5, 8, 32, 29, 0, 0, TAU); c.fill();
    // ground ring (ammo for the player)
    if (u.isPlayer) this.drawAmmoRing(u);
    else {
      c.strokeStyle = 'rgba(255,60,70,0.55)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 36, 0, TAU); c.stroke();
    }
    // heal aura
    if (u.healPool > 0) {
      c.globalCompositeOperation = 'lighter';
      const gr = c.createRadialGradient(0, 0, 10, 0, 0, 60);
      gr.addColorStop(0, 'rgba(100,255,120,0.45)'); gr.addColorStop(1, 'rgba(100,255,120,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(0, 0, 60, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
    }
    c.rotate(u.facing);
    c.translate(-u.recoil * 4, 0);
    const alpha = u.cloaked ? (u.isPlayer ? 0.45 : 0.25) : seenDirect ? 1 : 0.7;
    c.globalAlpha = alpha;
    const S = 1.95;
    if (sprite) {
      const w = sprite.width * S, h = sprite.height * S;
      const ox = -w * 0.38, oy = -h / 2;
      const sil = silhouette(key, color);
      if (sil) {
        const glow = fxTex('light_01', color, 128);
        if (glow) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * 0.55; c.drawImage(glow, -60, -60, 120, 120); c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha; }
        for (const [dx, dy] of [[-3.5, 0], [3.5, 0], [0, -3.5], [0, 3.5]]) c.drawImage(sil, ox + dx, oy + dy, w, h);
      }
      c.drawImage(sprite, ox, oy, w, h);
      if (u.hitFlash > 0) {
        const white = silhouette(key, '#ffffff');
        if (white) { c.globalAlpha = alpha * 0.55 * (u.hitFlash / 0.1); c.drawImage(white, ox, oy, w, h); }
      }
    } else {
      c.fillStyle = color;
      c.beginPath(); c.arc(0, 0, UNIT_RADIUS, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    // shield
    if (u.shielded) {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = 'rgba(110,220,255,0.9)';
      c.lineWidth = 6;
      c.shadowColor = '#5fd0ff'; c.shadowBlur = 16;
      c.beginPath(); c.arc(0, 0, 40, -1.2, 1.2); c.stroke();
      c.fillStyle = 'rgba(80,190,255,0.18)';
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 40, -1.2, 1.2); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.shadowBlur = 0;
    }
    c.restore();
    if (!seenDirect && !u.isPlayer && g.scanT > 0) {
      c.save();
      c.strokeStyle = 'rgba(95,208,255,0.9)';
      c.lineWidth = 2;
      c.setLineDash([6, 5]);
      c.beginPath(); c.arc(u.x, u.y, 34, 0, TAU); c.stroke();
      c.restore();
    }
  }

  private drawAmmoRing(u: Unit) {
    const c = this.ctx;
    const n = Math.min(u.magSize, 30);
    const R = 44;
    const gap = 0.06;
    const per = TAU / n;
    const filled = u.reloadT > 0 ? 0 : Math.ceil((u.ammo / u.magSize) * n);
    c.lineWidth = 3;
    for (let i = 0; i < n; i++) {
      const a0 = u.facing + Math.PI + i * per + gap / 2;
      c.strokeStyle = i < filled ? 'rgba(160,255,90,0.85)' : 'rgba(255,255,255,0.15)';
      c.beginPath(); c.arc(0, 0, R, a0, a0 + per - gap); c.stroke();
    }
    if (u.reloadT > 0) {
      const k = 1 - u.reloadT / u.weapon.reload;
      c.strokeStyle = 'rgba(255,220,80,0.95)';
      c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, R + 5, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
    }
  }

  private drawUnitLabel(g: Game, u: Unit) {
    const c = this.ctx;
    const [sx, sy] = this.toScreen(g, u.x, u.y);
    if (sx < -60 || sx > VIEW_W + 60 || sy < -60 || sy > VIEW_H + 60) return;
    const bw = 58, bx = sx - bw / 2;
    const by = u.isPlayer ? sy + 44 : sy - 56;
    c.save();
    c.textAlign = 'center';
    if (!u.isPlayer) {
      c.font = `15px ${FONT_D}`;
      c.fillStyle = u.hero.color;
      c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.lineWidth = 3;
      c.strokeText(u.name, sx, by - 16);
      c.fillText(u.name, sx, by - 16);
    }
    c.font = `700 11px ${FONT_N}`;
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    const hpTxt = String(Math.ceil(u.hp));
    c.strokeText(hpTxt, sx, by - 2);
    c.fillStyle = '#fff';
    c.fillText(hpTxt, sx, by - 2);
    // hp bar
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(bx - 1.5, by - 1.5 + 2, bw + 3, 12);
    c.fillStyle = u.isPlayer ? '#5eea3c' : '#ff3446';
    c.fillRect(bx, by + 2, bw * clamp(u.hp / u.maxHp, 0, 1), 5.5);
    c.fillStyle = '#3fd3ff';
    c.fillRect(bx, by + 8.5, bw * clamp(u.armor / u.maxArmor, 0, 1), 3.5);
    if (u.isPlayer && u.fury) {
      c.font = `13px ${FONT_D}`;
      c.fillStyle = '#ff9d2e';
      c.fillText('FURY', sx, by + 26);
    }
    if (u.isPlayer && u.reloadT > 0) {
      c.font = `13px ${FONT_D}`;
      c.fillStyle = '#ffdc50';
      c.fillText('RELOADING', sx, by + 26);
    }
    c.restore();
  }

  private drawScreenMarkers(g: Game) {
    const c = this.ctx;
    const p = g.player;
    for (const m of g.markers) {
      const k = m.life / m.max;
      if (m.kind === 'lastseen') {
        const [sx, sy] = this.toScreen(g, m.x, m.y);
        c.save();
        c.globalAlpha = Math.min(1, k * 2);
        c.strokeStyle = '#ffe14a';
        c.lineWidth = 5;
        c.lineCap = 'round';
        c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 4;
        const s = 11;
        c.beginPath(); c.moveTo(sx - s, sy - s); c.lineTo(sx + s, sy + s); c.moveTo(sx + s, sy - s); c.lineTo(sx - s, sy + s); c.stroke();
        c.restore();
      } else if (m.kind === 'dmgdir' && p.alive) {
        const [sx, sy] = this.toScreen(g, m.x, m.y);
        const a = Math.atan2(sy - ANCHOR_Y, sx - ANCHOR_X);
        c.save();
        c.globalAlpha = k;
        c.strokeStyle = '#ff2a3a';
        c.lineWidth = 7;
        c.shadowColor = '#ff0000'; c.shadowBlur = 12;
        c.beginPath(); c.arc(ANCHOR_X, ANCHOR_Y, 72, a - 0.35, a + 0.35); c.stroke();
        c.restore();
      }
    }
  }

  private drawTexts(g: Game) {
    const c = this.ctx;
    c.save();
    c.textAlign = 'center';
    for (const t of g.fx.texts) {
      const [sx, sy] = this.toScreen(g, t.x, t.y);
      const age = 1 - t.life / t.max;
      const pop = t.bump ? 1 + t.bump * 2.5 : age < 0.15 ? easeOutBack(age / 0.15) : 1;
      c.globalAlpha = Math.min(1, t.life / (t.max * 0.35));
      const isWord = /[A-Z]/.test(t.text);
      c.font = isWord ? `${t.size}px ${FONT_D}` : `900 ${Math.round(t.size * pop)}px ${FONT_N}`;
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(t.text, sx, sy);
      c.fillStyle = t.color;
      c.fillText(t.text, sx, sy);
    }
    c.restore();
  }

  private drawVignettes(g: Game) {
    const c = this.ctx, p = g.player;
    const low = p.alive && p.hp < p.maxHp * 0.3 ? 0.35 + 0.2 * Math.sin(g.time * 6) : 0;
    const hurt = Math.max(g.fx.hurtFlash * 0.8, low);
    if (hurt > 0.01) {
      const gr = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
      gr.addColorStop(0, 'rgba(255,0,30,0)');
      gr.addColorStop(1, `rgba(255,0,30,${hurt * 0.6})`);
      c.fillStyle = gr; c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (g.fx.healFlash > 0.01 || p.healPool > 0) {
      const k = Math.max(g.fx.healFlash, p.healPool > 0 ? 0.4 : 0);
      const gr = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.75);
      gr.addColorStop(0, 'rgba(60,255,90,0)');
      gr.addColorStop(1, `rgba(60,255,90,${k * 0.35})`);
      c.fillStyle = gr; c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // outside the zone: red wash + direction arrow
    const z = g.zone;
    if (p.alive && dist(p.x, p.y, z.cx, z.cy) > z.r) {
      c.fillStyle = `rgba(255,60,20,${0.12 + 0.06 * Math.sin(g.time * 8)})`;
      c.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private drawHud(g: Game) {
    const c = this.ctx, p = g.player;
    c.save();
    // top: alive + kills pill
    const alive = g.aliveCount();
    c.font = `22px ${FONT_D}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const pillW = 190;
    c.fillStyle = 'rgba(10,5,25,0.6)';
    roundRect(c, VIEW_W / 2 - pillW / 2, 14, pillW, 34, 17); c.fill();
    c.fillStyle = '#fff';
    c.fillText(`ALIVE ${alive}`, VIEW_W / 2 - 45, 32);
    c.fillStyle = '#ffd84d';
    c.fillText(`KILLS ${p.kills}`, VIEW_W / 2 + 48, 32);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(VIEW_W / 2, 22, 2, 20);

    // zone status
    const z = g.zone;
    if (z.state !== 'done') {
      const txt = z.state === 'wait' ? `ZONE SHRINKS IN ${Math.ceil(z.waitDur - z.t)}` : 'ZONE SHRINKING';
      c.font = `16px ${FONT_D}`;
      c.fillStyle = z.state === 'wait' ? 'rgba(255,255,255,0.75)' : '#ff8a4a';
      c.fillText(txt, VIEW_W / 2, 62);
    }

    // ability active bar (like SCAN)
    if (p.abilityT > 0 && p.alive) {
      const k = p.abilityT / p.hero.abilityDur;
      c.font = `22px ${FONT_D}`;
      c.fillStyle = '#e8f6ff';
      c.fillText(p.hero.abilityName, VIEW_W / 2, 110);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(VIEW_W / 2 - 150, 124, 300, 6);
      c.fillStyle = '#3aa0ff';
      c.fillRect(VIEW_W / 2 - 150, 124, 300 * k, 6);
    }

    // banners
    for (const b of g.fx.banners) {
      const age = b.max - b.life;
      const inK = Math.min(1, age / 0.18);
      const outK = Math.min(1, b.life / 0.3);
      const y = 138;
      c.save();
      c.globalAlpha = outK;
      c.translate(VIEW_W / 2 + (1 - inK) * -200, y);
      c.transform(1, 0, -0.18, 1, 0, 0);
      const bw = 420, bh = 40;
      const gr = c.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      gr.addColorStop(0, 'rgba(255,220,80,0)');
      gr.addColorStop(0.2, b.color === '#ffffff' ? 'rgba(255,255,255,0.25)' : `${b.color}aa`);
      gr.addColorStop(0.8, b.color === '#ffffff' ? 'rgba(255,255,255,0.25)' : `${b.color}aa`);
      gr.addColorStop(1, 'rgba(255,220,80,0)');
      c.fillStyle = gr;
      c.fillRect(-bw / 2, -bh / 2, bw, bh);
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fillRect(-bw / 2 + 40, -bh / 2, bw - 80, 2);
      c.fillRect(-bw / 2 + 40, bh / 2 - 2, bw - 80, 2);
      c.font = `${Math.round(34 * (inK < 1 ? 1.3 - 0.3 * inK : 1))}px ${FONT_D}`;
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(40,10,0,0.75)';
      c.strokeText(b.text, 0, 2);
      c.fillStyle = '#fff';
      c.fillText(b.text, 0, 2);
      c.restore();
    }

    // killfeed
    c.textAlign = 'right';
    c.font = `15px ${FONT_D}`;
    g.killfeed.forEach((k, i) => {
      c.globalAlpha = Math.min(1, k.life);
      const y = 92 + i * 20;
      const txt = `${k.killer}  ✖  ${k.victim}`;
      c.fillStyle = k.playerInvolved ? '#ffd84d' : 'rgba(255,255,255,0.8)';
      c.fillText(txt, VIEW_W - 14, y);
    });
    c.globalAlpha = 1;

    // zone direction arrow when outside the next circle
    if (p.alive && dist(p.x, p.y, z.toX, z.toY) > z.toR && z.toR > 0) {
      const [sx, sy] = this.toScreen(g, z.toX, z.toY);
      const a = Math.atan2(sy - ANCHOR_Y, sx - ANCHOR_X);
      const ax = ANCHOR_X + Math.cos(a) * 110, ay = ANCHOR_Y + Math.sin(a) * 110;
      c.save();
      c.translate(ax, ay);
      c.rotate(a);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -10); c.lineTo(-3, 0); c.lineTo(-8, 10); c.closePath(); c.fill();
      c.restore();
      if (dist(p.x, p.y, z.cx, z.cy) > z.r) {
        c.textAlign = 'center';
        c.font = `24px ${FONT_D}`;
        c.fillStyle = '#ff7a4a';
        c.fillText('RETURN TO THE SAFE ZONE!', VIEW_W / 2, 150);
      }
    }

    // bottom: hero + weapon
    c.textAlign = 'center';
    c.font = `26px ${FONT_D}`;
    c.fillStyle = '#fff';
    c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 6;
    c.fillText(`${p.hero.name}`, VIEW_W / 2, VIEW_H - 46);
    c.font = `15px ${FONT_D}`;
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.fillText(`${p.weapon.name}   ${p.reloadT > 0 ? '—' : p.ammo} / ${p.magSize}`, VIEW_W / 2, VIEW_H - 24);
    c.shadowBlur = 0;

    // ability button
    const b = abilityBtn();
    const ready = p.abilityCd <= 0;
    c.fillStyle = ready ? 'rgba(58,160,255,0.85)' : 'rgba(20,15,40,0.7)';
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
    if (!ready) {
      c.fillStyle = 'rgba(58,160,255,0.55)';
      c.beginPath(); c.moveTo(b.x, b.y);
      c.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.abilityCd / p.hero.abilityCd));
      c.closePath(); c.fill();
    }
    c.strokeStyle = ready ? '#bfe3ff' : 'rgba(255,255,255,0.3)';
    c.lineWidth = 3;
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.stroke();
    c.fillStyle = '#fff';
    c.font = `19px ${FONT_D}`;
    c.fillText(ready ? p.hero.abilityName : String(Math.ceil(p.abilityCd)), b.x, b.y + 1);
    if (!g.input.usedTouch) {
      c.font = `12px ${FONT_D}`;
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillText('SPACE', b.x, b.y + b.r + 12);
    }

    // touch sticks
    for (const s of [g.input.move, g.input.aim]) {
      if (!s) continue;
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 3;
      c.beginPath(); c.arc(s.sx, s.sy, 62, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.arc(s.x, s.y, 26, 0, TAU); c.fill();
    }
    c.restore();
  }
}
