import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 300, height: 500 } });
const N = Number(process.argv[2] ?? 6);
for (let i = 0; i < N; i++) {
  await page.goto('http://localhost:5199/?autopilot&hero=' + ['blaze','bulwark','patch','ghost'][i % 4]);
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const g = window.__game();
    const deaths = [];
    let steps = 0;
    while (!g.result && steps < 60 * 300) {
      g.update(1 / 60); steps++;
      for (const u of g.units) if (!u.alive && !deaths.find(d => d.n === u.name)) deaths.push({ n: u.name, t: +g.time.toFixed(0), by: u.lastAttacker, zone: g.killfeed.at(-1)?.killer === 'THE ZONE' });
    }
    const zoneKills = deaths.filter(d => d.zone).length;
    return { hero: g.player.hero.id, end: g.time.toFixed(0), result: g.result && { v: g.result.victory, place: g.result.placement, kills: g.result.kills }, deathTimes: deaths.map(d => d.t).join(','), zoneKills, lastAlive: g.aliveCount() };
  });
  console.log(JSON.stringify(r));
}
await browser.close();
