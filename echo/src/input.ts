import { VIEW_W, VIEW_H } from './view';

export interface Stick { id: number; sx: number; sy: number; x: number; y: number; refAng: number }

export const abilityBtn = () => ({ x: VIEW_W - 84, y: VIEW_H - 150, r: 44 });

/**
 * Two control schemes:
 *  - mouse/keyboard: WASD moves (relative to the screen), mouse turns (pointer lock), Space = ability
 *  - touch: floating left stick moves + faces, right stick aims, button = ability
 */
export class Input {
  keys = new Set<string>();
  turn = 0;
  locked = false;
  move: Stick | null = null;
  aim: Stick | null = null;
  abilityPressed = false;
  reloadPressed = false;
  usedTouch = false;
  sensitivity = 0.0042;

  constructor(private canvas: HTMLCanvasElement, private camAngle: () => number) {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyF') { this.abilityPressed = true; e.preventDefault(); }
      if (e.code === 'KeyR') this.reloadPressed = true;
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', e => {
      if (this.locked || (e.buttons & 1 && !this.usedTouch)) this.turn += e.movementX * this.sensitivity;
    });
    canvas.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.moveEv(e));
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => this.up(e));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  toView(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H };
  }

  requestLock() {
    if (this.usedTouch || this.locked) return;
    try { const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined; p?.catch?.(() => {}); } catch { /* ignore */ }
  }

  private down(e: PointerEvent) {
    const p = this.toView(e);
    if (e.pointerType === 'mouse') {
      if (e.button === 2) this.abilityPressed = true;
      else this.requestLock();
      return;
    }
    e.preventDefault();
    this.usedTouch = true;
    const btn = abilityBtn();
    if (Math.hypot(p.x - btn.x, p.y - btn.y) < btn.r + 12) { this.abilityPressed = true; return; }
    const stick: Stick = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y, refAng: this.camAngle() };
    if (p.x < VIEW_W * 0.5 && !this.move) this.move = stick;
    else if (!this.aim) this.aim = stick;
  }

  private moveEv(e: PointerEvent) {
    const p = this.toView(e);
    for (const s of [this.move, this.aim]) {
      if (s && s.id === e.pointerId) {
        s.x = p.x; s.y = p.y;
        // let a floating stick follow the thumb when dragged far
        const dx = s.x - s.sx, dy = s.y - s.sy, d = Math.hypot(dx, dy), max = 70;
        if (d > max) { s.sx = s.x - (dx / d) * max; s.sy = s.y - (dy / d) * max; }
      }
    }
  }

  private up(e: PointerEvent) {
    if (this.move?.id === e.pointerId) this.move = null;
    if (this.aim?.id === e.pointerId) this.aim = null;
  }

  /** Screen-relative move vector (y down), length <= 1, plus the camera angle it is relative to. */
  moveVector(): { x: number; y: number; refAng: number } {
    if (this.move) {
      const dx = this.move.x - this.move.sx, dy = this.move.y - this.move.sy;
      const d = Math.hypot(dx, dy);
      if (d < 8) return { x: 0, y: 0, refAng: this.move.refAng };
      const k = Math.min(1, d / 60) / d;
      return { x: dx * k, y: dy * k, refAng: this.move.refAng };
    }
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    const d = Math.hypot(x, y);
    return d ? { x: x / d, y: y / d, refAng: NaN } : { x: 0, y: 0, refAng: NaN };
  }

  /** Screen-relative aim vector for the right stick, or null. */
  aimVector(): { x: number; y: number; refAng: number } | null {
    if (!this.aim) return null;
    const dx = this.aim.x - this.aim.sx, dy = this.aim.y - this.aim.sy;
    if (Math.hypot(dx, dy) < 12) return null;
    return { x: dx, y: dy, refAng: this.aim.refAng };
  }

  keyTurn(): number {
    let t = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyQ')) t -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyE')) t += 1;
    return t;
  }

  consume() {
    const t = this.turn;
    this.turn = 0;
    const a = this.abilityPressed, r = this.reloadPressed;
    this.abilityPressed = false;
    this.reloadPressed = false;
    return { turn: t, ability: a, reload: r };
  }
}
