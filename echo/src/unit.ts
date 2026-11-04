import { baseStats, HeroDef, Stats, WeaponDef } from './defs';
import type { VisPoly } from './visibility';

let nextId = 1;

export interface BotBrain {
  state: 'roam' | 'loot' | 'investigate' | 'engage' | 'flee' | 'zone';
  path: { x: number; y: number }[];
  goal: { x: number; y: number } | null;
  repathT: number;
  targetId: number;
  lastSeen: { x: number; y: number; t: number } | null;
  reaction: number;
  strafeDir: number;
  strafeT: number;
  thinkT: number;
  lookT: number;
  lookDir: number;
  stuckT: number;
  lastX: number;
  lastY: number;
  skill: number;
}

export class Unit {
  id = nextId++;
  x: number; y: number;
  facing: number;
  vx = 0; vy = 0;
  moving = false;
  hp: number; maxHp: number;
  armor: number; maxArmor: number;
  alive = true;
  stats: Stats = baseStats();
  perks: string[] = [];
  spread: number;
  ammo: number;
  reloadT = 0;
  fireCd = 0;
  abilityCd = 3;
  abilityT = 0;
  shieldHp = 0;
  healPool = 0;
  healAcc = 0;
  zoneT = 0;
  idleT = 0;
  kills = 0;
  damageDealt = 0;
  lastAttacker = -1;
  lastHitT = -99;
  hitFlash = 0;
  recoil = 0;
  stepT = 0;
  /** time until this unit's position stops being revealed to others (after shooting) */
  revealT = 0;
  fury = false;
  deathT = 0;
  placement = 0;
  /** cached vision polygon (player only) */
  vis?: VisPoly;
  brain?: BotBrain;

  constructor(public hero: HeroDef, public name: string, public skin: string, x: number, y: number, public isPlayer = false) {
    this.x = x; this.y = y;
    this.facing = Math.random() * Math.PI * 2 - Math.PI;
    this.hp = this.maxHp = hero.hp;
    this.maxArmor = hero.armor;
    this.armor = Math.round(hero.armor * 0.5);
    this.spread = hero.weapon.spreadMove;
    this.ammo = hero.weapon.mag;
  }

  get weapon(): WeaponDef { return this.hero.weapon; }
  get magSize(): number { return Math.round(this.weapon.mag * this.stats.magMul); }
  get speed(): number { return this.hero.speed * this.stats.speedMul * (this.abilityT > 0 && this.hero.ability === 'cloak' ? 1.12 : 1); }
  get spreadMove(): number { return this.weapon.spreadMove * this.stats.spreadMoveMul; }
  get spreadStill(): number { return this.weapon.spreadStill * this.stats.spreadStillMul; }
  get cloaked(): boolean { return this.hero.ability === 'cloak' && this.abilityT > 0; }
  get shielded(): boolean { return this.hero.ability === 'shield' && this.abilityT > 0 && this.shieldHp > 0; }
  get spriteKey(): string { return `${this.skin}_${this.reloadT > 0 ? 'hold' : this.weapon.sprite}`; }
}
