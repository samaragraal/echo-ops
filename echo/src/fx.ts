import { fxTex } from './assets';
import { rand, TAU } from './util';

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; grow: number;
  rot: number; vr: number;
  tex: string; color: string;
  alpha: number;
  additive: boolean;
  drag: number;
  /** always rendered even outside of the player's light */
  always: boolean;
}

export interface FloatText {
  x: number; y: number; text: string; color: string; life: number; max: number; size: number; vy: number;
  key?: string; value?: number; bump?: number;
}

export interface Tracer {
  x0: number; y0: number; x1: number; y1: number;
  t: number; dur: number; color: string; width: number;
}

export interface Banner { text: string; color: string; life: number; max: number; }

export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  tracers: Tracer[] = [];
  banners: Banner[] = [];
  shake = 0;
  hurtFlash = 0;
  healFlash = 0;

  spawn(p: Partial<Particle> & { x: number; y: number; tex: string }) {
    if (this.particles.length > 900) this.particles.shift();
    this.particles.push({
      vx: 0, vy: 0, life: 0.5, max: p.life ?? 0.5, size: 20, grow: 0, rot: rand(0, TAU), vr: 0,
      color: '#fff', alpha: 1, additive: true, drag: 0, always: false, ...p,
    } as Particle);
  }

  muzzle(x: number, y: number, ang: number, color = '#ffd27a') {
    this.spawn({ x, y, tex: 'muzzle_02', color, size: 46, life: 0.06, rot: ang + Math.PI / 2, alpha: 1 });
    this.spawn({ x, y, tex: 'light_01', color: '#ffb347', size: 70, life: 0.08, alpha: 0.6 });
    // shell casing
    this.spawn({ x, y, tex: 'circle_05', color: '#ffcc66', size: 4, life: 0.35, additive: false,
      vx: Math.cos(ang + Math.PI / 2) * rand(80, 140), vy: Math.sin(ang + Math.PI / 2) * rand(80, 140), drag: 6 });
  }

  impact(x: number, y: number, ang: number, color = '#ffd27a') {
    for (let i = 0; i < 4; i++) {
      const a = ang + Math.PI + rand(-0.9, 0.9);
      const sp = rand(120, 320);
      this.spawn({ x, y, tex: 'spark_04', color, size: rand(6, 12), life: rand(0.12, 0.25), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5 });
    }
    this.spawn({ x, y, tex: 'smoke_04', color: '#9a8fb0', size: 18, grow: 40, life: 0.4, alpha: 0.35, additive: false });
  }

  blood(x: number, y: number, ang: number, color: string) {
    for (let i = 0; i < 5; i++) {
      const a = ang + rand(-0.6, 0.6);
      const sp = rand(80, 260);
      this.spawn({ x, y, tex: 'circle_05', color, size: rand(5, 10), life: rand(0.2, 0.4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 6 });
    }
  }

  explosion(x: number, y: number, r: number) {
    this.spawn({ x, y, tex: 'light_01', color: '#ff7b2e', size: r * 3, life: 0.35, alpha: 0.9, always: true });
    this.spawn({ x, y, tex: 'fire_01', color: '#ffb347', size: r * 1.2, grow: r * 2, life: 0.35, always: true });
    for (let i = 0; i < 10; i++) {
      const a = rand(0, TAU), sp = rand(60, 220);
      this.spawn({ x, y, tex: 'smoke_07', color: '#4a3550', size: rand(20, 40), grow: 60, life: rand(0.5, 0.9), alpha: 0.6, additive: false, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, always: true });
      this.spawn({ x, y, tex: 'spark_04', color: '#ffd27a', size: rand(8, 14), life: rand(0.2, 0.4), vx: Math.cos(a) * sp * 2, vy: Math.sin(a) * sp * 2, drag: 4, always: true });
    }
  }

  death(x: number, y: number, color: string) {
    this.spawn({ x, y, tex: 'light_01', color, size: 220, life: 0.5, alpha: 0.9, always: true });
    this.spawn({ x, y, tex: 'star_06', color: '#ffffff', size: 60, grow: 260, life: 0.35, always: true });
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU), sp = rand(100, 380);
      this.spawn({ x, y, tex: 'circle_05', color, size: rand(6, 14), life: rand(0.4, 0.8), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4, always: true });
    }
  }

  ring(x: number, y: number, color: string, size: number, life = 0.5) {
    this.spawn({ x, y, tex: 'circle_05', color, size: 10, grow: size / life, life, alpha: 0.8, always: true });
  }

  text(x: number, y: number, text: string, color: string, size = 22) {
    this.texts.push({ x: x + rand(-14, 14), y: y - 30, text, color, life: 0.9, max: 0.9, size, vy: -60 });
  }

  /** Damage/heal numbers that accumulate per key while hits keep landing (like "-553"). */
  number(key: string, x: number, y: number, amount: number, sign: '-' | '+', color: string) {
    const t = this.texts.find(t => t.key === key && t.max - t.life < 0.55);
    if (t) {
      t.value! += amount;
      t.text = `${sign}${Math.round(t.value!)}`;
      t.color = color;
      t.life = t.max;
      t.x = x; t.y = y - 34;
      t.vy = -40;
      t.size = Math.min(34, 22 + t.value! / 60);
      t.bump = 0.12;
      return;
    }
    this.texts.push({ x: x + rand(-10, 10), y: y - 34, text: `${sign}${Math.round(amount)}`, color, life: 0.85, max: 0.85, size: 22, vy: -40, key, value: amount, bump: 0.12 });
  }

  tracer(x0: number, y0: number, x1: number, y1: number, color = '#ffb347', width = 3) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    this.tracers.push({ x0, y0, x1, y1, t: 0, dur: Math.max(0.05, d / 2600), color, width });
  }

  banner(text: string, color = '#ffd84d') {
    this.banners = this.banners.filter(b => b.text !== text);
    this.banners.push({ text, color, life: 1.8, max: 1.8 });
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-3 * dt); if (t.bump) t.bump = Math.max(0, t.bump - dt); }
    this.texts = this.texts.filter(t => t.life > 0);
    for (const t of this.tracers) t.t += dt;
    this.tracers = this.tracers.filter(t => t.t < t.dur + 0.06);
    for (const b of this.banners) b.life -= dt;
    this.banners = this.banners.filter(b => b.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.healFlash = Math.max(0, this.healFlash - dt * 2);
  }

  drawParticles(ctx: CanvasRenderingContext2D, visible: (x: number, y: number) => boolean) {
    for (const p of this.particles) {
      if (!p.always && !visible(p.x, p.y)) continue;
      const tex = fxTex(p.tex, p.color);
      if (!tex) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = p.alpha * Math.min(1, k * 2);
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(tex, -p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawTracers(ctx: CanvasRenderingContext2D, visible: (t: Tracer) => boolean) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const t of this.tracers) {
      if (!visible(t)) continue;
      const head = Math.min(1, t.t / t.dur);
      const tail = Math.max(0, head - 0.35 - Math.max(0, t.t - t.dur) * 8);
      const hx = t.x0 + (t.x1 - t.x0) * head, hy = t.y0 + (t.y1 - t.y0) * head;
      const tx = t.x0 + (t.x1 - t.x0) * tail, ty = t.y0 + (t.y1 - t.y0) * tail;
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, 'rgba(255,120,40,0)');
      g.addColorStop(1, t.color);
      ctx.strokeStyle = g;
      ctx.lineWidth = t.width;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,230,0.9)';
      ctx.lineWidth = t.width * 0.4;
      ctx.beginPath(); ctx.moveTo(tx + (hx - tx) * 0.6, ty + (hy - ty) * 0.6); ctx.lineTo(hx, hy); ctx.stroke();
    }
    ctx.restore();
  }
}
