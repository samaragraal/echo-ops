// Usage: node tools/shoot.mjs <outDir> <query> <seconds> <interval>
import { chromium } from 'playwright';
const [out = 'shots', query = 'autopilot', secs = '20', every = '4'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://localhost:5199/?${query}`);
await page.waitForTimeout(1500);
const t0 = Date.now();
let i = 0;
while ((Date.now() - t0) / 1000 < Number(secs)) {
  await page.waitForTimeout(Number(every) * 1000);
  const info = await page.evaluate(() => {
    const g = window.__game();
    if (!g) return null;
    const t0 = performance.now();
    return { t: g.time.toFixed(1), alive: g.aliveCount(), hp: Math.round(g.player.hp), kills: g.player.kills, result: g.result, state: g.player.brain?.state };
  });
  await page.screenshot({ path: `${out}/s${String(i++).padStart(2, '0')}.png` });
  console.log(JSON.stringify(info));
  if (info?.result) break;
}
// fps sample
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('fps', fps, 'errors', errors.slice(0, 5));
await browser.close();
