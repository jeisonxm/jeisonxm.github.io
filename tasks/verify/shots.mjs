import { webkit } from 'playwright';
import path from 'node:path';
const S = '/tmp/claude-1001/-home-archy-jeisonxm-github-io/ab849e21-0869-4348-9524-78050999b3ea/scratchpad';
const URL = 'file://' + path.join(S, 'recon/depth/index.html');
(async () => {
  const b = await webkit.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(URL); await p.waitForTimeout(600);
  await p.evaluate(() => window.__snap(false));
  const W = 1280;
  const shots = [[0, 'p0_panel0'], [0.35, 'p035'], [0.65, 'p065'], [1.0, 'p1_panel1']];
  for (const [f, name] of shots) {
    await p.evaluate(x => { document.getElementById('container').scrollLeft = x; }, Math.round(W * f));
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.screenshot({ path: path.join(S, 'recon/depth/shot_' + name + '.png') });
  }
  console.log('capturas listas');
  await b.close();
})();
