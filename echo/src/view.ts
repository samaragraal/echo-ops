/** Logical portrait view size; the canvas is scaled to fit the window. */
export const VIEW_W = 540;
export let VIEW_H = 960;
/** Player anchor on screen (bottom-center, like the original). */
export const ANCHOR_X = VIEW_W / 2;
export let ANCHOR_Y = VIEW_H * 0.7;

/** Adapt the logical height to the screen so tall phones are filled edge to edge. */
export function setViewHeight(h: number) {
  VIEW_H = Math.round(Math.min(1200, Math.max(800, h)));
  ANCHOR_Y = VIEW_H * 0.7;
}

/** World-to-screen zoom (the original shows a fairly wide area). */
export const ZOOM = 0.78;

export const LIGHT_RANGE = 640;
export const LIGHT_HALF = 0.44;
export const SELF_R = 95;
export const BOT_VIEW_RANGE = 560;
export const BOT_VIEW_HALF = 0.45;
export const UNIT_RADIUS = 21;
