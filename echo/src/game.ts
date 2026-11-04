import { GameMap } from './map';
import { Unit } from './unit';
import { HEROES, BOT_NAMES, BOT_SKINS, PERKS, PerkDef, PickupKind, HeroDef } from './defs';
import { Fx } from './fx';
import { sfx } from './audio';
import { Input } from './input';
import { visPoly, pointInVis, lineOfSight, rayDistance, VisPoly } from './visibility';
import { angleDiff, clamp, dist, pick, rand, shuffle, turnToward, wrapAngle, lerpAngle, TAU } from './util';
import { LIGHT_HALF, LIGHT_RANGE, SELF_R, BOT_VIEW_HALF, BOT_VIEW_RANGE, UNIT_RADIUS, VIEW_W } from './view';
import { updateBot, makeBrain } from './ai';

export interface Pickup { id: number; x: number; y: number; kind: PickupKind; perk?: PerkDef; bob: number; alive: boolean }
export interface Noise { x: number; y: number; t: number; radius: number; unitId: number }
export type MarkerKind = 'lastseen' | 'shot' | 'step' | 'dmgdir';
export interface Marker { x: number; y: number; life: number; max: number; kind: MarkerKind; ang?: number }
export interface PendingHit { target: Unit | null; attacker: Unit; dmg: number; at: number; ang: number; x: number; y: number }
export interface KillMsg { killer: string; victim: string; life: number; playerInvolved: boolean }

export interface Zone {
  cx: number; cy: number; r: number;
  fromX: number; fromY: number; fromR: number;
  toX: number; toY: number; toR: number;
  phase: number; t: number; state: 'wait' | 'shrink' | 'done';
  waitDur: number; shrinkDur: number;
}

const ZONE_PHASES = [
  { wait: 26, shrink: 20, frac: 0.46 },
  { wait: 12, shrink: 16, frac: 0.27 },
  { wait: 10, shrink: 13, frac: 0.13 },
  { wait: 8, shrink: 12, frac: 0.0 },
];

export type GameResult = { victory: boolean; placement: number; kills: number; damage: number; time: number; total: number };

let pickupId = 1;

export class Game {
  map = new GameMap();
  units: Unit[] = [];
  player!: Unit;
  pickups: Pickup[] = [];
  fx = new Fx();
  time = 0;
  zone!: Zone;
  markers: Marker[] = [];
  noises: Noise[] = [];
  pending: PendingHit[] = [];
  killfeed: KillMsg[] = [];
  camAngle = 0;
  selfVis!: VisPoly;
  scanT = 0;
  over = false;
  overT = 0;
  result: GameResult | null = null;
  autopilot = false;
  /** test-only: player takes no damage */
  god = false;
  recentKills: number[] = [];
  zoneTick = 0;
  seenByPlayer = new Set<number>();
  total = 0;

  constructor(hero: HeroDef, public input: Input, botCount = 7) {
    this.spawnUnits(hero, botCount);
    this.spawnPickups(26);
    this.setupZone();
    this.camAngle = this.player.facing;
    this.updatePlayerVision();
  }

  // ------------------------------------------------------------------ setup

  private spawnUnits(hero: HeroDef, botCount: number) {
    const pts: { x: number; y: number }[] = [];
    let minD = 1000;
    while (pts.length < botCount + 1) {
      let ok = false;
      for (let i = 0; i < 300 && !ok; i++) {
        const p = this.map.randomWalkable(80, 80, this.map.w - 80, this.map.h - 80);
        if (pts.every(q => dist(p.x, p.y, q.x, q.y) > minD)) { pts.push(p); ok = true; }
      }
      if (!ok) minD *= 0.85;
    }
    shuffle(pts);
    this.player = new Unit(hero, 'YOU', hero.skin, pts[0].x, pts[0].y, true);
    this.units.push(this.player);
    const names = shuffle([...BOT_NAMES]);
    for (let i = 0; i < botCount; i++) {
      const h = pick(HEROES);
      const skin = Math.random() < 0.5 ? h.skin : pick(BOT_SKINS);
      const u = new Unit(h, names[i % names.length], skin, pts[i + 1].x, pts[i + 1].y);
      u.brain = makeBrain(u);
      this.units.push(u);
    }
    this.total = this.units.length;
    // everyone starts looking into the map rather than at the border wall
    for (const u of this.units) u.facing = Math.atan2(this.map.h / 2 - u.y, this.map.w / 2 - u.x) + rand(-0.5, 0.5);
  }

  private spawnPickups(n: number) {
    for (let i = 0; i < n; i++) {
      const p = this.map.randomWalkable(60, 60, this.map.w - 60, this.map.h - 60);
      const r = Math.random();
      const kind: PickupKind = r < 0.3 ? 'armor' : r < 0.48 ? 'medkit' : r < 0.62 ? 'ammo' : 'perk';
      this.addPickup(p.x, p.y, kind);
    }
  }

  addPickup(x: number, y: number, kind: PickupKind) {
    this.pickups.push({ id: pickupId++, x, y, kind, perk: kind === 'perk' || kind === 'loot' ? pick(PERKS) : undefined, bob: rand(0, TAU), alive: true });
  }

  private setupZone() {
    const cx = this.map.w / 2 + rand(-250, 250), cy = this.map.h / 2 + rand(-250, 250);
    const r = Math.hypot(this.map.w, this.map.h) * 0.62;
    this.zone = { cx, cy, r, fromX: cx, fromY: cy, fromR: r, toX: cx, toY: cy, toR: r, phase: -1, t: 0, state: 'wait', waitDur: 0, shrinkDur: 0 };
    this.nextZonePhase();
  }

  private nextZonePhase() {
    const z = this.zone;
    z.phase++;
    if (z.phase >= ZONE_PHASES.length) { z.state = 'done'; return; }
    const ph = ZONE_PHASES[z.phase];
    const newR = Math.max(0, Math.hypot(this.map.w, this.map.h) * 0.62 * ph.frac);
    // new centre: inside current circle, and preferably inside the map
    let nx = z.cx, ny = z.cy;
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU), d = rand(0, Math.max(0, z.r - newR) * 0.7);
      nx = z.cx + Math.cos(a) * d; ny = z.cy + Math.sin(a) * d;
      if (nx > 300 && ny > 300 && nx < this.map.w - 300 && ny < this.map.h - 300) break;
    }
    z.fromX = z.cx; z.fromY = z.cy; z.fromR = z.r;
    z.toX = nx; z.toY = ny; z.toR = newR;
    z.state = 'wait'; z.t = 0; z.waitDur = ph.wait; z.shrinkDur = ph.shrink;
  }

  // ------------------------------------------------------------------ queries

  aliveCount(): number { return this.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0); }

  updatePlayerVision() {
    const p = this.player;
    p.vis = visPoly(this.map, p.x, p.y, p.facing, LIGHT_HALF, LIGHT_RANGE, p.vis);
    this.selfVis = visPoly(this.map, p.x, p.y, 0, Math.PI, SELF_R, this.selfVis);
  }

  /** Is a world point lit by the player's flashlight or personal light? */
  litForPlayer(x: number, y: number): boolean {
    const p = this.player;
    const d = dist(p.x, p.y, x, y);
    if (d < SELF_R && pointInVis(this.selfVis, x, y)) return true;
    if (d > LIGHT_RANGE + 4) return false;
    if (Math.abs(angleDiff(p.facing, Math.atan2(y - p.y, x - p.x))) > LIGHT_HALF + 0.05 && d > 30) return false;
    return pointInVis(p.vis!, x, y);
  }

  /** Can `viewer` see `target` well enough to shoot at it? */
  canSee(viewer: Unit, target: Unit): boolean {
    if (!target.alive || target === viewer) return false;
    const d = dist(viewer.x, viewer.y, target.x, target.y);
    if (target.cloaked && d > 90 && target.revealT <= 0) return false;
    if (viewer.isPlayer) return this.litForPlayer(target.x, target.y) || this.litForPlayer(target.x + Math.cos(viewer.facing + 1.57) * 12, target.y + Math.sin(viewer.facing + 1.57) * 12);
    if (d < SELF_R) return lineOfSight(this.map, viewer.x, viewer.y, target.x, target.y);
    if (d > BOT_VIEW_RANGE) return false;
    const a = Math.atan2(target.y - viewer.y, target.x - viewer.x);
    if (Math.abs(angleDiff(viewer.facing, a)) > BOT_VIEW_HALF + Math.atan2(UNIT_RADIUS, d)) return false;
    return lineOfSight(this.map, viewer.x, viewer.y, target.x, target.y);
  }

  /** Is the unit drawn on the player's screen? */
  playerSeesUnit(u: Unit): boolean {
    if (u.isPlayer) return true;
    if (!u.alive) return false;
    if (u.cloaked && u.revealT <= 0 && dist(u.x, u.y, this.player.x, this.player.y) > 90) return false;
    if (this.scanT > 0 && dist(u.x, u.y, this.player.x, this.player.y) < 750) return true;
    return this.canSee(this.player, u) || !this.player.alive;
  }

  zoneTargetSafe(x: number, y: number, margin = 0): boolean {
    const z = this.zone;
    return dist(x, y, z.toX, z.toY) < z.toR - margin;
  }

  // ------------------------------------------------------------------ update

  update(dt: number) {
    this.time += dt;
    if (this.over) { this.overT += dt; }
    this.updateZone(dt);
    this.controlPlayer(dt);
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.brain && (!u.isPlayer || this.autopilot)) updateBot(this, u, dt);
    }
    for (const u of this.units) if (u.alive) this.updateUnit(u, dt);
    this.resolveUnitOverlap();
    this.updatePlayerVision();
    for (const u of this.units) if (u.alive) this.updateCombat(u, dt);
    this.updatePending();
    this.updatePickups(dt);
    this.updateMarkers(dt);
    this.fx.update(dt);
    // camera follows facing
    this.camAngle = lerpAngle(this.camAngle, this.player.facing, 1 - Math.exp(-dt * (this.input.usedTouch ? 7 : 14)));
    this.noises = this.noises.filter(n => this.time - n.t < 0.4);
    for (const k of this.killfeed) k.life -= dt;
    this.killfeed = this.killfeed.filter(k => k.life > 0);
    this.scanT = Math.max(0, this.scanT - dt);
    this.checkEnd();
  }

  private controlPlayer(dt: number) {
    const p = this.player;
    const inp = this.input.consume();
    if (!p.alive) { p.vx = p.vy = 0; return; }
    if (this.autopilot) {
      if (!p.brain) p.brain = makeBrain(p);
      return;
    }
    const mv = this.input.moveVector();
    const ref = Number.isNaN(mv.refAng) ? this.camAngle : mv.refAng;
    const rot = Math.PI / 2 + ref;
    const wx = mv.x * Math.cos(rot) - mv.y * Math.sin(rot);
    const wy = mv.x * Math.sin(rot) + mv.y * Math.cos(rot);
    p.vx = wx * p.speed; p.vy = wy * p.speed;
    // facing
    p.facing = wrapAngle(p.facing + inp.turn + this.input.keyTurn() * 3.2 * dt);
    const aim = this.input.aimVector();
    if (aim) {
      const a = Math.atan2(aim.y, aim.x) + Math.PI / 2 + aim.refAng;
      p.facing = turnToward(p.facing, wrapAngle(a), 9 * dt);
    } else if (this.input.usedTouch && (wx || wy)) {
      p.facing = turnToward(p.facing, Math.atan2(wy, wx), 6 * dt);
    }
    if (inp.ability) this.useAbility(p);
    if (inp.reload) this.startReload(p);
  }

  private updateUnit(u: Unit, dt: number) {
    const sp = Math.hypot(u.vx, u.vy);
    u.moving = sp > 10;
    if (u.moving) {
      const nx = u.x + u.vx * dt, ny = u.y + u.vy * dt;
      const c = this.map.collide(nx, ny, UNIT_RADIUS);
      u.x = clamp(c.x, UNIT_RADIUS, this.map.w - UNIT_RADIUS);
      u.y = clamp(c.y, UNIT_RADIUS, this.map.h - UNIT_RADIUS);
      u.stepT -= dt * (sp / 160);
      if (u.stepT <= 0) {
        u.stepT = 0.34;
        this.onStep(u);
      }
    }
    // aim cone narrows when standing still
    const target = u.moving ? u.spreadMove : u.spreadStill;
    const rate = u.moving ? 14 : 3.6;
    u.spread += (target - u.spread) * (1 - Math.exp(-rate * dt));
    u.hitFlash = Math.max(0, u.hitFlash - dt);
    u.recoil = Math.max(0, u.recoil - dt * 8);
    u.revealT = Math.max(0, u.revealT - dt);
    u.abilityCd = Math.max(0, u.abilityCd - dt);
    if (u.abilityT > 0) {
      u.abilityT -= dt;
      if (u.abilityT <= 0) { u.abilityT = 0; u.shieldHp = 0; }
    }
    if (u.healPool > 0) {
      const h = Math.min(u.healPool, dt * 260);
      u.healPool -= h;
      const before = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + h);
      u.healAcc += u.hp - before;
      if (u.healAcc > 60 || (u.healPool <= 0 && u.healAcc > 1)) {
        if (u.isPlayer || this.playerSeesUnit(u)) this.fx.number(`heal${u.id}`, u.x, u.y, u.healAcc, '+', '#6dff6a');
        u.healAcc = 0;
      }
      if (u.fury && u.hp > u.maxHp * 0.3) u.fury = false;
    }
    // zone damage
    const z = this.zone;
    if (dist(u.x, u.y, z.cx, z.cy) > z.r) {
      u.zoneT -= dt;
      if (u.zoneT <= 0) {
        u.zoneT = 0.5;
        const dmg = Math.round((50 + Math.max(0, z.phase) * 35) * 0.5);
        this.damage(u, dmg, null, 0, true);
        if (u.isPlayer) { this.fx.hurtFlash = Math.max(this.fx.hurtFlash, 0.5); sfx.zone(); }
      }
    }
  }

  private onStep(u: Unit) {
    if (u.isPlayer) return;
    const p = this.player;
    if (!p.alive || u.cloaked) return;
    const d = dist(u.x, u.y, p.x, p.y);
    if (d < 430 && !this.playerSeesUnit(u)) {
      this.markers.push({ x: u.x, y: u.y, life: 1.1, max: 1.1, kind: 'step', ang: Math.atan2(u.vy, u.vx) });
      sfx.step(clamp(1 - d / 430, 0, 1) * 0.6, this.screenPan(u.x, u.y));
    }
  }

  private resolveUnitOverlap() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i]; if (!a.alive) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j]; if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = UNIT_RADIUS * 2;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
  }

  // ------------------------------------------------------------------ combat

  /** Best target inside `u`'s aim cone, or null. */
  findTarget(u: Unit): Unit | null {
    let best: Unit | null = null, bestD = Infinity;
    for (const e of this.units) {
      if (e === u || !e.alive) continue;
      const d = dist(u.x, u.y, e.x, e.y);
      if (d > u.weapon.range + UNIT_RADIUS) continue;
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      if (Math.abs(angleDiff(u.facing, a)) > u.spread + Math.atan2(UNIT_RADIUS, d) + 0.02) continue;
      if (!this.canSee(u, e)) continue;
      if (!lineOfSight(this.map, u.x, u.y, e.x, e.y)) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private updateCombat(u: Unit, dt: number) {
    u.fireCd -= dt;
    if (u.reloadT > 0) {
      u.reloadT -= dt * (1 / u.stats.reloadMul);
      if (u.reloadT <= 0) { u.reloadT = 0; u.ammo = u.magSize; }
      return;
    }
    const t = this.findTarget(u);
    if (!t) {
      u.idleT += dt;
      if (u.idleT > 2.2 && u.ammo < u.magSize) this.startReload(u);
      return;
    }
    u.idleT = 0;
    if (u.brain && (!u.isPlayer || this.autopilot) && u.brain.reaction > 0) return;
    if (u.fireCd > 0) return;
    if (u.ammo <= 0) { this.startReload(u); return; }
    this.fire(u);
  }

  startReload(u: Unit) {
    if (u.reloadT > 0 || u.ammo >= u.magSize) return;
    u.reloadT = u.weapon.reload;
    if (u.isPlayer) sfx.reload();
  }

  private fire(u: Unit) {
    const w = u.weapon;
    u.ammo--;
    u.fireCd = 1 / w.rate;
    u.recoil = 1;
    u.revealT = 0.5;
    if (u.cloaked) { u.abilityT = 0; }
    const fwd = 34, side = 10;
    const mx = u.x + Math.cos(u.facing) * fwd + Math.cos(u.facing + Math.PI / 2) * side;
    const my = u.y + Math.sin(u.facing) * fwd + Math.sin(u.facing + Math.PI / 2) * side;
    const visToPlayer = u.isPlayer || this.playerSeesUnit(u) || this.litForPlayer(mx, my);
    this.fx.muzzle(mx, my, u.facing);
    for (let i = 0; i < w.pellets; i++) {
      const tri = (Math.random() + Math.random() - 1);
      const ang = u.facing + tri * u.spread;
      const wallD = rayDistance(this.map, mx, my, ang, w.range);
      let hitD = wallD, hitU: Unit | null = null;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (const e of this.units) {
        if (e === u || !e.alive) continue;
        const fx = e.x - mx, fy = e.y - my;
        const tca = fx * dx + fy * dy;
        if (tca < 0) continue;
        const d2 = fx * fx + fy * fy - tca * tca;
        const R = UNIT_RADIUS + 3;
        if (d2 > R * R) continue;
        const thc = Math.sqrt(R * R - d2);
        const tHit = tca - thc;
        if (tHit < hitD) { hitD = Math.max(0, tHit); hitU = e; }
      }
      const ex = mx + dx * hitD, ey = my + dy * hitD;
      this.fx.tracer(mx, my, ex, ey, u.isPlayer ? '#ffcf5a' : '#ff8a3d', w.pellets > 1 ? 2 : 3);
      const delay = hitD / 2600;
      if (hitU) {
        const falloff = w.pellets > 1 ? clamp(1.25 - hitD / w.range, 0.45, 1) : 1;
        this.pending.push({ target: hitU, attacker: u, dmg: w.damage * falloff, at: this.time + delay, ang, x: ex, y: ey });
      } else if (wallD < w.range - 1) {
        this.pending.push({ target: null, attacker: u, dmg: 0, at: this.time + delay, ang, x: ex, y: ey });
      }
    }
    // noise
    const radius = w.noise * u.stats.noiseMul;
    this.noises.push({ x: u.x, y: u.y, t: this.time, radius, unitId: u.id });
    const p = this.player;
    const d = dist(u.x, u.y, p.x, p.y);
    if (!u.isPlayer && p.alive && !visToPlayer && d < radius * 1.15) {
      const prev = this.markers.find(m => m.kind === 'shot' && dist(m.x, m.y, u.x, u.y) < 60 && m.life > m.max - 0.3);
      if (!prev) this.markers.push({ x: u.x, y: u.y, life: 1.3, max: 1.3, kind: 'shot' });
    }
    const vol = u.isPlayer ? 0.9 : clamp(1 - d / (radius * 1.3), 0, 1) * 0.8;
    const kind = w.pellets > 1 ? 'shotgun' : w.sprite === 'silencer' ? 'silencer' : w.sprite === 'gun' ? 'rifle' : 'smg';
    sfx.shot(kind, vol, this.screenPan(u.x, u.y));
    if (u.isPlayer) this.fx.shake = Math.max(this.fx.shake, w.pellets > 1 ? 7 : w.sprite === 'gun' ? 5 : 2.2);
  }

  private updatePending() {
    const now = this.time;
    const rest: PendingHit[] = [];
    for (const h of this.pending) {
      if (h.at > now) { rest.push(h); continue; }
      if (!h.target) {
        if (this.litForPlayer(h.x, h.y) || h.attacker.isPlayer) this.fx.impact(h.x, h.y, h.ang);
        if (h.attacker.stats.explosive) this.explode(h.x, h.y, h.attacker, h.attacker.weapon.damage);
        continue;
      }
      if (!h.target.alive) continue;
      this.damage(h.target, h.dmg, h.attacker, h.ang);
      if (h.attacker.stats.explosive) this.explode(h.x, h.y, h.attacker, h.attacker.weapon.damage);
    }
    this.pending = rest;
  }

  private explode(x: number, y: number, attacker: Unit, base: number) {
    if (this.litForPlayer(x, y) || attacker.isPlayer) this.fx.explosion(x, y, 26);
    sfx.explode(attacker.isPlayer ? 0.35 : 0.15);
    for (const e of this.units) {
      if (!e.alive || e === attacker) continue;
      if (dist(e.x, e.y, x, y) < 70) this.damage(e, base * 0.35, attacker, Math.atan2(e.y - y, e.x - x), false, true);
    }
  }

  damage(t: Unit, amount: number, attacker: Unit | null, ang: number, pure = false, splash = false) {
    if (!t.alive || (this.over && !t.isPlayer && this.result)) return;
    if (t.isPlayer && this.god) return;
    if (attacker && !pure && t.shielded) {
      const toAtt = Math.atan2(attacker.y - t.y, attacker.x - t.x);
      if (Math.abs(angleDiff(t.facing, toAtt)) < 1.25) {
        t.shieldHp -= amount;
        if (this.playerSeesUnit(t)) {
          this.fx.impact(t.x + Math.cos(toAtt) * 34, t.y + Math.sin(toAtt) * 34, ang, '#7fe3ff');
          if (attacker.isPlayer || t.isPlayer) this.fx.text(t.x, t.y, 'BLOCKED', '#7fe3ff', 16);
        }
        if (t.shieldHp <= 0) { t.abilityT = 0; }
        return;
      }
    }
    let dmg = amount;
    if (attacker) dmg *= attacker.stats.dmgMul * (attacker.fury ? 1.25 : 1);
    dmg = Math.round(dmg);
    let toHp = dmg;
    if (!pure) {
      const a = Math.min(t.armor, dmg);
      t.armor -= a;
      toHp = dmg - a;
      if (a > 0 && (t.isPlayer || attacker?.isPlayer)) sfx.armorHit(0.7);
    }
    t.hp -= toHp;
    t.hitFlash = 0.1;
    t.lastHitT = this.time;
    if (attacker) {
      t.lastAttacker = attacker.id;
      attacker.damageDealt += dmg;
      if (t.brain && !t.isPlayer) {
        t.brain.lastSeen = { x: attacker.x, y: attacker.y, t: this.time };
        if (t.brain.state !== 'engage') { t.brain.state = 'investigate'; t.brain.goal = { x: attacker.x, y: attacker.y }; t.brain.repathT = 0; }
      }
    }
    const visible = this.playerSeesUnit(t);
    if (visible && !splash) this.fx.blood(t.x, t.y, ang, t.armor > 0 && toHp === 0 ? '#7fe3ff' : '#ff3355');
    if (attacker?.isPlayer) {
      this.fx.number(`dmg${t.id}`, t.x, t.y, dmg, '-', t.armor > 0 || toHp < dmg ? '#ffe066' : '#ffffff');
      sfx.hit(0.8);
    } else if (t.isPlayer) {
      this.fx.number(`hurt${t.id}`, t.x, t.y, dmg, '-', '#ff4d5e');
      this.fx.hurtFlash = Math.min(1, this.fx.hurtFlash + 0.35);
      this.fx.shake = Math.max(this.fx.shake, 5);
      sfx.hurt();
      if (attacker && !this.playerSeesUnit(attacker)) {
        this.markers.push({ x: attacker.x, y: attacker.y, life: 1.2, max: 1.2, kind: 'dmgdir', ang: Math.atan2(attacker.y - t.y, attacker.x - t.x) });
      }
      if (!t.fury && t.hp > 0 && t.hp < t.maxHp * 0.3) {
        t.fury = true;
        this.fx.banner('FURY!!!', '#ff9d2e');
        sfx.banner();
      }
    } else if (visible && pure) {
      this.fx.number(`zone${t.id}`, t.x, t.y, dmg, '-', '#ff8a3d');
    }
    if (t.hp <= 0) this.kill(t, attacker);
  }

  private kill(t: Unit, attacker: Unit | null) {
    t.hp = 0;
    t.alive = false;
    t.deathT = this.time;
    t.placement = this.aliveCount() + 1;
    this.fx.death(t.x, t.y, t.isPlayer ? '#7dff4a' : t.hero.color);
    sfx.explode(this.playerSeesUnit(t) || t.isPlayer ? 0.5 : 0.15);
    this.addPickup(t.x, t.y, 'loot');
    const killer = attacker ? attacker.name : 'THE ZONE';
    this.killfeed.push({ killer, victim: t.name, life: 4, playerInvolved: !!(attacker?.isPlayer || t.isPlayer) });
    if (this.killfeed.length > 4) this.killfeed.shift();
    if (attacker) attacker.kills++;
    if (attacker?.isPlayer) {
      sfx.kill();
      this.recentKills.push(this.time);
      this.recentKills = this.recentKills.filter(k => this.time - k < 7);
      if (this.recentKills.length >= 2) this.fx.banner(this.recentKills.length >= 3 ? 'UNSTOPPABLE!!' : "YOU'RE ON FIRE!!", '#ffd84d');
      else this.fx.banner('ELIMINATED', '#ffffff');
      sfx.banner();
    }
    if (t.isPlayer) {
      this.fx.shake = 14;
    }
  }

  useAbility(u: Unit) {
    if (u.abilityCd > 0 || !u.alive) return;
    const h = u.hero;
    u.abilityCd = h.abilityCd;
    u.abilityT = h.abilityDur;
    if (u.isPlayer) sfx.ability();
    switch (h.ability) {
      case 'scan':
        if (u.isPlayer) { this.scanT = h.abilityDur; sfx.scan(); this.fx.ring(u.x, u.y, '#5fd0ff', 1500, 0.8); }
        else {
          let best: Unit | null = null, bd = 750;
          for (const e of this.units) {
            if (e === u || !e.alive) continue;
            const d = dist(u.x, u.y, e.x, e.y);
            if (d < bd) { bd = d; best = e; }
          }
          if (best && u.brain) { u.brain.lastSeen = { x: best.x, y: best.y, t: this.time }; if (u.brain.state !== 'engage') { u.brain.state = 'investigate'; u.brain.goal = { x: best.x, y: best.y }; u.brain.repathT = 0; } }
          if (this.playerSeesUnit(u)) this.fx.ring(u.x, u.y, '#5fd0ff', 800, 0.6);
        }
        break;
      case 'shield':
        u.shieldHp = 650;
        break;
      case 'heal':
        u.healPool += 520;
        if (u.isPlayer) this.fx.healFlash = 1;
        break;
      case 'cloak':
        if (this.playerSeesUnit(u)) this.fx.ring(u.x, u.y, '#c57dff', 120, 0.4);
        break;
    }
  }

  // ------------------------------------------------------------------ pickups / zone / markers

  private updatePickups(dt: number) {
    for (const pk of this.pickups) {
      if (!pk.alive) continue;
      pk.bob += dt * 3;
      for (const u of this.units) {
        if (!u.alive) continue;
        if (dist(u.x, u.y, pk.x, pk.y) > UNIT_RADIUS + 18) continue;
        this.collect(u, pk);
        break;
      }
    }
    this.pickups = this.pickups.filter(p => p.alive);
  }

  collect(u: Unit, pk: Pickup) {
    pk.alive = false;
    const labels: [string, string][] = [];
    const armorUp = (n: number) => {
      if (u.armor >= u.maxArmor - 5) { u.maxArmor += 120; u.armor = u.maxArmor; labels.push(['ARMOR ENHANCER', '#5fd0ff']); }
      else { u.armor = Math.min(u.maxArmor, u.armor + n); labels.push(['ARMOR', '#5fd0ff']); }
    };
    switch (pk.kind) {
      case 'armor': armorUp(260); break;
      case 'medkit': u.healPool += 380; labels.push(['MEDKIT', '#6dff6a']); break;
      case 'ammo': u.stats.magMul *= 1.12; u.ammo = u.magSize; u.reloadT = 0; labels.push(['AMMO', '#ffb347']); break;
      case 'perk': pk.perk!.apply(u.stats); u.perks.push(pk.perk!.id); labels.push([pk.perk!.label, '#ffffff']); break;
      case 'loot':
        armorUp(300); u.healPool += 300; pk.perk!.apply(u.stats); u.perks.push(pk.perk!.id);
        u.ammo = u.magSize; labels.push([pk.perk!.label, '#ffffff']);
        break;
    }
    if (u.isPlayer) {
      sfx.pickup();
      labels.forEach(([t, c], i) => this.fx.texts.push({ x: u.x + 40, y: u.y - 10 - i * 18, text: t, color: c, life: 1.4, max: 1.4, size: 15, vy: -30 }));
      this.fx.ring(u.x, u.y, '#9fff7a', 70, 0.35);
    }
  }

  private updateZone(dt: number) {
    const z = this.zone;
    if (z.state === 'done') return;
    z.t += dt;
    if (z.state === 'wait') {
      if (z.t >= z.waitDur) {
        z.state = 'shrink'; z.t = 0;
        if (this.player.alive) { this.fx.banner('ZONE IS SHRINKING', '#ff6a3d'); }
      }
    } else {
      const k = clamp(z.t / z.shrinkDur, 0, 1);
      z.cx = z.fromX + (z.toX - z.fromX) * k;
      z.cy = z.fromY + (z.toY - z.fromY) * k;
      z.r = z.fromR + (z.toR - z.fromR) * k;
      if (k >= 1) this.nextZonePhase();
    }
  }

  private updateMarkers(dt: number) {
    const p = this.player;
    // last-seen markers
    const nowSeen = new Set<number>();
    for (const u of this.units) {
      if (u.isPlayer || !u.alive) continue;
      if (this.playerSeesUnit(u)) nowSeen.add(u.id);
      else if (this.seenByPlayer.has(u.id) && p.alive) this.markers.push({ x: u.x, y: u.y, life: 2.6, max: 2.6, kind: 'lastseen' });
    }
    this.seenByPlayer = nowSeen;
    for (const m of this.markers) m.life -= dt;
    this.markers = this.markers.filter(m => m.life > 0);
  }

  screenPan(x: number, y: number): number {
    const p = this.player;
    const rot = -Math.PI / 2 - this.camAngle;
    const dx = x - p.x, dy = y - p.y;
    const sx = dx * Math.cos(rot) - dy * Math.sin(rot);
    return clamp(sx / (VIEW_W * 0.6), -1, 1);
  }

  private checkEnd() {
    if (this.result) return;
    const p = this.player;
    const alive = this.aliveCount();
    if (!p.alive && p.deathT > 0 && this.time - p.deathT > 1.6) {
      this.result = { victory: false, placement: p.placement, kills: p.kills, damage: Math.round(p.damageDealt), time: this.time, total: this.total };
      this.over = true;
      sfx.defeat();
    } else if (p.alive && alive === 1) {
      if (!this.over) { this.over = true; this.overT = 0; sfx.victory(); }
      if (this.overT > 1.2) this.result = { victory: true, placement: 1, kills: p.kills, damage: Math.round(p.damageDealt), time: this.time, total: this.total };
    }
  }
}
