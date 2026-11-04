import { BOT_SKINS, HEROES } from './defs';

const images = new Map<string, HTMLImageElement>();
const tinted = new Map<string, HTMLCanvasElement>();

const FX = ['muzzle_02', 'muzzle_04', 'smoke_04', 'smoke_07', 'light_01', 'spark_04', 'star_06', 'circle_05', 'scorch_02', 'flame_03', 'fire_01'];

function load(key: string, src: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { images.set(key, img); resolve(); };
    img.onerror = () => resolve();
    img.src = src;
  });
}

export async function loadAssets() {
  const skins = new Set<string>([...BOT_SKINS, ...HEROES.map(h => h.skin)]);
  const jobs: Promise<void>[] = [];
  for (const s of skins) for (const w of ['machine', 'gun', 'silencer', 'hold']) jobs.push(load(`${s}_${w}`, `/assets/chars/${s}_${w}.png`));
  for (const f of FX) jobs.push(load(f, `/assets/fx/${f}.png`));
  await Promise.all(jobs);
}

export function img(key: string): HTMLImageElement | undefined {
  return images.get(key);
}

/** White particle texture recoloured (and downscaled) to `color`. */
export function fxTex(key: string, color: string, size = 128): HTMLCanvasElement | undefined {
  const id = `${key}|${color}|${size}`;
  let c = tinted.get(id);
  if (c) return c;
  const src = images.get(key);
  if (!src) return undefined;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0, size, size);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  tinted.set(id, c);
  return c;
}

/** Character sprite with a solid coloured silhouette (used for neon outline + hit flash). */
export function silhouette(key: string, color: string): HTMLCanvasElement | undefined {
  const id = `sil|${key}|${color}`;
  let c = tinted.get(id);
  if (c) return c;
  const src = images.get(key);
  if (!src) return undefined;
  c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  tinted.set(id, c);
  return c;
}
