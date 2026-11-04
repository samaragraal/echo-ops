export interface WeaponDef {
  name: string;
  sprite: 'machine' | 'gun' | 'silencer' | 'hold';
  damage: number;
  /** shots per second */
  rate: number;
  range: number;
  /** half-angle of the aim cone while moving / standing still (radians) */
  spreadMove: number;
  spreadStill: number;
  mag: number;
  reload: number;
  pellets: number;
  /** radius in which a shot can be heard */
  noise: number;
}

export type AbilityKind = 'scan' | 'shield' | 'heal' | 'cloak';

export interface HeroDef {
  id: string;
  name: string;
  role: string;
  skin: string;
  color: string;
  hp: number;
  armor: number;
  speed: number;
  weapon: WeaponDef;
  ability: AbilityKind;
  abilityName: string;
  abilityDesc: string;
  abilityCd: number;
  abilityDur: number;
}

export const WEAPONS = {
  smg: { name: 'VIPER SMG', sprite: 'machine', damage: 42, rate: 8.5, range: 330, spreadMove: 0.30, spreadStill: 0.075, mag: 30, reload: 1.7, pellets: 1, noise: 480 },
  shotgun: { name: 'BOOMSTICK', sprite: 'machine', damage: 32, rate: 1.4, range: 240, spreadMove: 0.38, spreadStill: 0.22, mag: 6, reload: 2.1, pellets: 7, noise: 560 },
  rifle: { name: 'LONGSHOT', sprite: 'gun', damage: 140, rate: 2.1, range: 470, spreadMove: 0.30, spreadStill: 0.028, mag: 8, reload: 2.0, pellets: 1, noise: 620 },
  pistol: { name: 'WHISPER', sprite: 'silencer', damage: 66, rate: 4.2, range: 340, spreadMove: 0.24, spreadStill: 0.05, mag: 14, reload: 1.4, pellets: 1, noise: 180 },
} satisfies Record<string, WeaponDef>;

export const HEROES: HeroDef[] = [
  {
    id: 'blaze', name: 'BLAZE', role: 'Scout', skin: 'soldier1', color: '#ff5a3d', hp: 1250, armor: 400, speed: 165,
    weapon: WEAPONS.smg, ability: 'scan', abilityName: 'SCAN', abilityDesc: 'Reveal nearby enemies through walls', abilityCd: 14, abilityDur: 3.5,
  },
  {
    id: 'bulwark', name: 'BULWARK', role: 'Tank', skin: 'robot1', color: '#4dc3ff', hp: 1700, armor: 650, speed: 145,
    weapon: WEAPONS.shotgun, ability: 'shield', abilityName: 'SHIELD', abilityDesc: 'Frontal energy shield blocks bullets', abilityCd: 13, abilityDur: 4,
  },
  {
    id: 'patch', name: 'PATCH', role: 'Medic', skin: 'womanGreen', color: '#ffd84d', hp: 1150, armor: 350, speed: 158,
    weapon: WEAPONS.rifle, ability: 'heal', abilityName: 'HEAL', abilityDesc: 'Rapidly restore health', abilityCd: 14, abilityDur: 2.2,
  },
  {
    id: 'ghost', name: 'GHOST', role: 'Stealth', skin: 'hitman1', color: '#c57dff', hp: 1050, armor: 350, speed: 172,
    weapon: WEAPONS.pistol, ability: 'cloak', abilityName: 'CLOAK', abilityDesc: 'Turn invisible until you shoot', abilityCd: 13, abilityDur: 4.5,
  },
];

export const BOT_SKINS = ['manBlue', 'manBrown', 'survivor1', 'manOld', 'zoimbie1', 'soldier1', 'robot1', 'womanGreen', 'hitman1'];

export const BOT_NAMES = ['MILLER', 'PEPPER', 'NIGHT', 'PRETAATMA', 'MR SUPERIOR', 'YOSHE', 'BLACK PANTHER', 'KNOX', 'VEX', 'RAZOR', 'NOVA', 'DUKE', 'SABLE', 'TANGO', 'OKSANA', 'BOLT'];

export type PickupKind = 'armor' | 'medkit' | 'ammo' | 'perk' | 'loot';

export interface PerkDef {
  id: string;
  label: string;
  apply: (s: Stats) => void;
}

export interface Stats {
  dmgMul: number;
  spreadMoveMul: number;
  spreadStillMul: number;
  noiseMul: number;
  magMul: number;
  reloadMul: number;
  speedMul: number;
  explosive: boolean;
}

export const baseStats = (): Stats => ({
  dmgMul: 1, spreadMoveMul: 1, spreadStillMul: 1, noiseMul: 1, magMul: 1, reloadMul: 1, speedMul: 1, explosive: false,
});

export const PERKS: PerkDef[] = [
  { id: 'hip', label: '+27% HIP-FIRE ACCURACY', apply: s => { s.spreadMoveMul *= 0.73; } },
  { id: 'aim', label: '+17% AIMED ACCURACY', apply: s => { s.spreadStillMul *= 0.83; } },
  { id: 'quiet', label: '-38% SHOT LOUDNESS', apply: s => { s.noiseMul *= 0.62; } },
  { id: 'boom', label: 'EXPLOSIVE ROUNDS', apply: s => { s.explosive = true; } },
  { id: 'dmg', label: '+15% DAMAGE', apply: s => { s.dmgMul *= 1.15; } },
  { id: 'reload', label: '+25% RELOAD SPEED', apply: s => { s.reloadMul *= 0.75; } },
  { id: 'speed', label: '+10% MOVE SPEED', apply: s => { s.speedMul *= 1.1; } },
  { id: 'mag', label: '+20% MAGAZINE SIZE', apply: s => { s.magMul *= 1.2; } },
];
