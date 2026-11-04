import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:5199/?autopilot&god');
await page.waitForTimeout(2500);
for (let k = 0; k < 4; k++) {
  const r = await page.evaluate(() => {
    const g = window.__game();
    let t = performance.now();
    for (let i = 0; i < 120; i++) g.update(1 / 60);
    const upd = (performance.now() - t) / 120;
    return { upd: upd.toFixed(2), t: g.time.toFixed(1), alive: g.aliveCount() };
  });
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1500) requestAnimationFrame(f); else r(n / 1.5); }; requestAnimationFrame(f); }));
  console.log(JSON.stringify(r), 'fps', fps.toFixed(1));
}
await browser.close();
