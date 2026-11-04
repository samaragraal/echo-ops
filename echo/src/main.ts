import { loadAssets } from './assets';
import { initAudio } from './audio';
import { HEROES, HeroDef } from './defs';
import { Game } from './game';
import { Input } from './input';
import { Renderer } from './render';
import { showHud, showLoading, showMenu, showResult } from './ui';
import { VIEW_W, setViewHeight } from './view';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui')!;
const renderer = new Renderer(canvas);
let game: Game | null = null;
let hero: HeroDef = HEROES[0];
const params = new URLSearchParams(location.search);
const input = new Input(canvas, () => game?.camAngle ?? 0);

function fit() {
  const ww = window.innerWidth, wh = window.innerHeight;
  let w: number, h: number;
  if (wh / ww >= 800 / VIEW_W) {
    // portrait screen (phones): fill it, letting the logical height follow the aspect
    w = ww;
    h = Math.min(wh, (ww * 1200) / VIEW_W);
  } else {
    // landscape (desktop): a 9:16 column
    h = wh;
    w = Math.min(ww, (wh * VIEW_W) / 960);
    h = (w * 960) / VIEW_W;
  }
  setViewHeight((VIEW_W * h) / w);
  renderer.resize(Math.floor(w), Math.floor(h));
  Object.assign(uiRoot.style, { width: `${Math.floor(w)}px`, height: `${Math.floor(h)}px`, containerType: 'inline-size' });
}
window.addEventListener('resize', fit);
fit();

function start(h: HeroDef) {
  hero = h;
  initAudio();
  game = new Game(h, input, Number(params.get('bots') ?? 7));
  game.autopilot = params.has('autopilot');
  game.god = params.has('god');
  resultShown = false;
  showHud(() => { document.exitPointerLock?.(); game = null; menu(); });
  input.requestLock();
}

function menu() {
  game = null;
  showMenu(hero, start);
}

let resultShown = false;
let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game) {
    acc += dt;
    while (acc >= STEP) { game.update(STEP); acc -= STEP; }
    renderer.render(game);
    if (game.result && !resultShown) {
      resultShown = true;
      document.exitPointerLock?.();
      showResult(game.result, () => start(hero), menu);
    }
  } else {
    acc = 0;
  }
  requestAnimationFrame(frame);
}

(async () => {
  showLoading();
  await loadAssets();
  await document.fonts?.ready;
  const qh = HEROES.find(h => h.id === params.get('hero'));
  if (qh) hero = qh;
  if (params.has('autostart') || params.has('autopilot')) start(hero);
  else menu();
  requestAnimationFrame(frame);
})();

declare global { interface Window { __game: () => Game | null } }
window.__game = () => game;
