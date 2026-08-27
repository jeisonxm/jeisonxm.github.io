import { webkit } from 'playwright';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// El prototipo vive en el repo (tasks/proto/depth), no en el scratchpad efimero
// de la sesion que lo escribio. S es solo el directorio de salida.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = process.env.VERIFY_OUT || path.join(process.env.HOME, 'pw-harness', 'shots');
const URL = 'file://' + path.join(HERE, '..', 'proto', 'depth', 'index.html');
mkdirSync(S, { recursive: true });

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
    await p.screenshot({ path: path.join(S, 'proto-depth-' + name + '.png') });
  }
  console.log('capturas listas');
  await b.close();
})();
