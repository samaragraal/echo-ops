import type { Game } from './game';
import type { Unit, BotBrain } from './unit';
import { angleDiff, dist, lerp, rand, turnToward, pick } from './util';
import { lineOfSight } from './visibility';

export function makeBrain(u: Unit): BotBrain {
  return {
    state: 'roam', path: [], goal: null, repathT: 0, targetId: -1, lastSeen: null,
    reaction: 0, strafeDir: 0, strafeT: 0, thinkT: rand(0, 0.2), lookT: 0, lookDir: u.facing,
    stuckT: 0, lastX: u.x, lastY: u.y, skill: rand(0.45, 0.9),
  };
}

function setGoal(b: BotBrain, x: number, y: number, state: BotBrain['state']) {
  b.goal = { x, y };
  b.state = state;
  b.path = [];
  b.repathT = 0;
}

/** Early in the match bots loot around their spawn instead of heading for the centre. */
const LOOT_PHASE = 22;

function roamGoal(g: Game, u: Unit, b: BotBrain) {
  if (g.time < LOOT_PHASE) {
    const p = g.map.randomWalkable(u.x - 320, u.y - 320, u.x + 320, u.y + 320);
    setGoal(b, p.x, p.y, 'roam');
    return;
  }
  const z = g.zone;
  const r = Math.max(120, z.toR * 0.75);
  for (let i = 0; i < 20; i++) {
    const p = g.map.randomWalkable(Math.max(40, z.toX - r), Math.max(40, z.toY - r), Math.min(g.map.w - 40, z.toX + r), Math.min(g.map.h - 40, z.toY + r));
    if (dist(p.x, p.y, z.toX, z.toY) < r && dist(p.x, p.y, u.x, u.y) > 250) { setGoal(b, p.x, p.y, 'roam'); return; }
  }
  const p = g.map.randomWalkable();
  setGoal(b, p.x, p.y, 'roam');
}

function think(g: Game, u: Unit, b: BotBrain) {
  // 1. sight
  let best: Unit | null = null, bd = Infinity;
  for (const e of g.units) {
    if (e === u || !e.alive) continue;
    if (!g.canSee(u, e)) continue;
    const d = dist(u.x, u.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) {
    if (b.targetId !== best.id || b.state !== 'engage') b.reaction = lerp(0.75, 0.28, b.skill) + rand(0, 0.15);
    b.targetId = best.id;
    b.lastSeen = { x: best.x, y: best.y, t: g.time };
    if (b.state !== 'flee') b.state = 'engage';
    if (u.hp < u.maxHp * 0.25 && best.hp > u.hp * 1.5 && Math.random() < 0.35) {
      const a = Math.atan2(u.y - best.y, u.x - best.x);
      const p = { x: u.x + Math.cos(a) * 350, y: u.y + Math.sin(a) * 350 };
      if (g.map.walkableAt(p.x, p.y)) setGoal(b, p.x, p.y, 'flee');
    }
  } else if (b.state === 'engage') {
    if (b.lastSeen && g.time - b.lastSeen.t < 5) setGoal(b, b.lastSeen.x, b.lastSeen.y, 'investigate');
    else b.state = 'roam';
  }

  // 2. hearing
  if (b.state !== 'engage' && b.state !== 'flee') {
    for (const n of g.noises) {
      if (n.unitId === u.id) continue;
      const d = dist(u.x, u.y, n.x, n.y);
      if (d < n.radius && Math.random() < b.skill * 0.6) {
        setGoal(b, n.x + rand(-40, 40), n.y + rand(-40, 40), 'investigate');
        b.lookDir = Math.atan2(n.y - u.y, n.x - u.x);
        b.lookT = 0.8;
        break;
      }
    }
  }

  // 3. got hit by someone unseen: turn toward them
  if (b.state !== 'engage' && g.time - u.lastHitT < 0.3 && b.lastSeen) {
    b.lookDir = Math.atan2(b.lastSeen.y - u.y, b.lastSeen.x - u.x);
    b.lookT = 1.2;
  }

  // 4. zone
  const z = g.zone;
  const outsideNow = dist(u.x, u.y, z.cx, z.cy) > z.r - 30;
  const outsideNext = !g.zoneTargetSafe(u.x, u.y, 70);
  const urgent = z.state === 'shrink' || z.t > z.waitDur * 0.35;
  if ((outsideNow || (outsideNext && urgent)) && (b.state !== 'engage' || outsideNow) && b.state !== 'zone') {
    const r = Math.max(60, z.toR * 0.55);
    const p = g.map.randomWalkable(z.toX - r, z.toY - r, z.toX + r, z.toY + r);
    setGoal(b, p.x, p.y, 'zone');
  }

  // 5. loot
  if (b.state === 'roam') {
    let pk = null as null | { x: number; y: number }, pd = 480;
    for (const p of g.pickups) {
      const d = dist(u.x, u.y, p.x, p.y);
      if (d < pd && g.zoneTargetSafe(p.x, p.y, 40)) { pd = d; pk = p; }
    }
    if (pk) setGoal(b, pk.x, pk.y, 'loot');
  }
  if (!b.goal && b.state !== 'engage') roamGoal(g, u, b);

  // 6. abilities
  if (u.abilityCd <= 0) {
    switch (u.hero.ability) {
      case 'scan': if (b.state !== 'engage' && Math.random() < 0.08) g.useAbility(u); break;
      case 'shield': if (g.time - u.lastHitT < 0.4) g.useAbility(u); break;
      case 'heal': if (u.hp < u.maxHp * 0.55) g.useAbility(u); break;
      case 'cloak': if ((b.state === 'engage' && Math.random() < 0.15) || u.hp < u.maxHp * 0.35) g.useAbility(u); break;
    }
  }
}

export function updateBot(g: Game, u: Unit, dt: number) {
  const b = u.brain!;
  b.thinkT -= dt;
  if (b.thinkT <= 0) { b.thinkT = 0.15; think(g, u, b); }

  let mx = 0, my = 0, speedK = 0.85;
  let wantFace: number | null = null;
  const turnRate = 4 + b.skill * 4;

  if (b.state === 'engage') {
    const t = g.units.find(e => e.id === b.targetId);
    if (!t || !t.alive) { b.state = 'roam'; b.goal = null; }
    else {
      const d = dist(u.x, u.y, t.x, t.y);
      const aimErr = Math.sin(g.time * 3 + u.id) * (1 - b.skill) * 0.08;
      wantFace = Math.atan2(t.y - u.y, t.x - u.x) + aimErr;
      if (Math.abs(angleDiff(u.facing, wantFace)) < 0.35) b.reaction -= dt;
      const pref = u.weapon.pellets > 1 ? u.weapon.range * 0.55 : u.weapon.range * 0.8;
      const los = lineOfSight(g.map, u.x, u.y, t.x, t.y);
      if (d > pref || !los) {
        if (!b.goal || dist(b.goal.x, b.goal.y, t.x, t.y) > 60) { b.goal = { x: t.x, y: t.y }; b.path = []; b.repathT = 0; }
        speedK = 1;
      } else {
        b.goal = null; b.path = [];
        b.strafeT -= dt;
        if (b.strafeT <= 0) {
          b.strafeT = rand(0.35, 1.1);
          b.strafeDir = pick([-1, 0, 0, 0, 1]);
        }
        if (b.strafeDir) {
          const a = wantFace + (Math.PI / 2) * b.strafeDir;
          const sx = u.x + Math.cos(a) * 40, sy = u.y + Math.sin(a) * 40;
          if (g.map.walkableAt(sx, sy)) { mx = Math.cos(a); my = Math.sin(a); speedK = 0.75; }
          else b.strafeDir = -b.strafeDir;
        }
      }
    }
  }

  // path following
  if (b.goal && (mx === 0 && my === 0)) {
    b.repathT -= dt;
    if (b.path.length === 0 && b.repathT <= 0) {
      b.path = g.map.findPath(u.x, u.y, b.goal.x, b.goal.y) ?? [];
      b.repathT = 1.2;
      if (b.path.length === 0 && b.state !== 'engage') { b.goal = null; b.state = 'roam'; }
    }
    while (b.path.length && dist(u.x, u.y, b.path[0].x, b.path[0].y) < 16) b.path.shift();
    if (b.path.length) {
      const wp = b.path[0];
      const a = Math.atan2(wp.y - u.y, wp.x - u.x);
      mx = Math.cos(a); my = Math.sin(a);
      if (b.state === 'zone' || b.state === 'flee') speedK = 1;
      else if (b.state === 'investigate') speedK = 0.9;
    } else if (b.goal && dist(u.x, u.y, b.goal.x, b.goal.y) < 30) {
      if (b.state !== 'engage') { b.state = 'roam'; b.goal = null; b.lookT = rand(0.6, 1.5); b.lookDir = u.facing + rand(-2.2, 2.2); }
    }
  }

  // stuck detection
  b.stuckT += dt;
  if (b.stuckT > 1) {
    if ((mx || my) && dist(u.x, u.y, b.lastX, b.lastY) < 12) { b.path = []; b.repathT = 0; if (b.state !== 'engage') roamGoal(g, u, b); }
    b.stuckT = 0; b.lastX = u.x; b.lastY = u.y;
  }

  u.vx = mx * u.speed * speedK;
  u.vy = my * u.speed * speedK;

  if (wantFace === null) {
    if (b.lookT > 0) { b.lookT -= dt; wantFace = b.lookDir; }
    else if (mx || my) wantFace = Math.atan2(my, mx);
  }
  if (wantFace !== null) u.facing = turnToward(u.facing, wantFace, turnRate * dt);
}
