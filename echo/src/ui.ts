import { HEROES, HeroDef } from './defs';
import type { GameResult } from './game';
import { isMuted, setMuted } from './audio';

const root = () => document.getElementById('ui')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function clearUi() { root().innerHTML = ''; }

export function showLoading() {
  clearUi();
  root().append(el('div', 'screen menu loading', 'LOADING…'));
}

export function showMenu(selected: HeroDef, onPlay: (h: HeroDef) => void) {
  clearUi();
  let sel = selected;
  const s = el('div', 'screen menu');
  s.append(el('div', 'logo', 'ECHO<br>OPS'));
  s.append(el('div', 'tag', 'Lights out · Last one standing'));
  const grid = el('div', 'heroes');
  for (const h of HEROES) {
    const b = el('button', 'hero' + (h === sel ? ' sel' : ''));
    b.style.setProperty('--c', h.color);
    b.innerHTML = `<img src="/assets/chars/${h.skin}_${h.weapon.sprite}.png" alt=""><div class="n">${h.name}</div><div class="r">${h.role} · ${h.weapon.name}</div><div class="a"><b>${h.abilityName}</b> — ${h.abilityDesc}</div>`;
    b.onclick = () => { sel = h; grid.querySelectorAll('.hero').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); };
    grid.append(b);
  }
  s.append(grid);
  const play = el('button', 'play', 'PLAY');
  play.onclick = () => onPlay(sel);
  s.append(play);
  s.append(el('div', 'howto',
    `Your flashlight is your sight — enemies hide in the dark.<br>
     You fire automatically when an enemy is in your <b style="color:#ff6a8f">red cone</b>. <b>Stand still</b> to tighten it.<br>
     <kbd>WASD</kbd> move · <kbd>Mouse</kbd> turn (click to lock) · <kbd>Q</kbd>/<kbd>E</kbd> turn · <kbd>Space</kbd> ability · <kbd>R</kbd> reload<br>
     Touch: left stick moves &amp; faces, right stick aims.`));
  root().append(s);
}

export function showHud(onQuit: () => void) {
  clearUi();
  const q = el('button', 'hudbtn quit', '✕');
  q.title = 'Quit match';
  q.onclick = onQuit;
  const m = el('button', 'hudbtn mute', isMuted() ? '🔇' : '🔊');
  m.onclick = () => { setMuted(!isMuted()); m.textContent = isMuted() ? '🔇' : '🔊'; };
  const hint = el('div', 'hint', matchMedia('(pointer: coarse)').matches ? 'DRAG LEFT TO MOVE · RIGHT TO AIM' : 'CLICK TO LOCK MOUSE · WASD TO MOVE');
  setTimeout(() => hint.remove(), 4000);
  root().append(q, m, hint);
}

export function showResult(r: GameResult, onAgain: () => void, onMenu: () => void) {
  clearUi();
  const s = el('div', 'screen result');
  const band = el('div', 'band' + (r.victory ? '' : ' lose'));
  band.append(el('h1', '', r.victory ? 'VICTORY' : 'DEFEATED'));
  s.append(band);
  const stats = el('div', 'stats');
  const mins = Math.floor(r.time / 60), secs = Math.floor(r.time % 60).toString().padStart(2, '0');
  for (const [v, l] of [[`#${r.placement}`, `OF ${r.total}`], [String(r.kills), 'KILLS'], [String(r.damage), 'DAMAGE'], [`${mins}:${secs}`, 'TIME']]) {
    const st = el('div', 'stat');
    st.append(el('div', 'v', v), el('div', 'l', l));
    stats.append(st);
  }
  s.append(stats);
  const btns = el('div', 'btns');
  const again = el('button', 'play', 'PLAY AGAIN');
  again.onclick = onAgain;
  const menu = el('button', 'ghost', 'CHANGE HERO');
  menu.onclick = onMenu;
  btns.append(again, menu);
  s.append(btns);
  root().append(s);
}
