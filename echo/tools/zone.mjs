import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5199/?autopilot&god');
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__game(); const p = g.player; const z = g.zone;
  const a = p.facing + 0.6;
  z.cx = p.x - Math.cos(a) * 260; z.cy = p.y - Math.sin(a) * 260; z.r = 420;
  z.fromX = z.toX = z.cx; z.fromY = z.toY = z.cy; z.fromR = z.toR = 420; z.state = 'wait'; z.t = 0; z.waitDur = 999;
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/zone1.png' });
await page.evaluate(() => { const g = window.__game(); const z = g.zone; z.r = z.fromR = z.toR = 120; });
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/zone2.png' });
await browser.close();
