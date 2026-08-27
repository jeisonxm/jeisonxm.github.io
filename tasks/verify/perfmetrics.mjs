import { chromium } from 'playwright';
import path from 'node:path';
const S = '/tmp/claude-1001/-home-archy-jeisonxm-github-io/ab849e21-0869-4348-9524-78050999b3ea/scratchpad';
const URL = 'file://' + path.join(S, 'recon/depth/index.html');

const pick = (m, ks) => Object.fromEntries(m.filter(x => ks.includes(x.name)).map(x => [x.name, x.value]));
const KEYS = ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'];

(async () => {
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--enable-gpu-rasterization']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(URL);
  await page.waitForTimeout(800);

  // ---- A. 400 escrituras de --p/--a: cuanto layout y cuanto recalculo ----
  const before = pick((await cdp.send('Performance.getMetrics')).metrics, KEYS);
  const N = 400;
  await page.evaluate(async n => {
    window.__snap(false);
    const c = document.getElementById('container');
    for (let i = 0; i < n; i++) {
      c.scrollLeft = (i * 13) % 5760;
      await new Promise(r => requestAnimationFrame(r));
    }
  }, N);
  await page.waitForTimeout(200);
  const after = pick((await cdp.send('Performance.getMetrics')).metrics, KEYS);

  console.log('=== A. ¿El bucle provoca layout? (chromium, CDP Performance) ===');
  console.log(N, 'frames de scroll + escritura de --p/--a en 5 paneles\n');
  for (const k of KEYS) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    const unit = k.endsWith('Duration') ? ' s' : '';
    console.log('  ' + k.padEnd(22), (k.endsWith('Duration') ? d.toFixed(4) : String(Math.round(d))).padStart(10) + unit);
  }
  const dLayout = (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0);
  const dRecalc = (after.RecalcStyleCount ?? 0) - (before.RecalcStyleCount ?? 0);
  console.log('\n  layouts por frame :', (dLayout / N).toFixed(4), dLayout === 0 ? ' <= CERO layout' : '');
  console.log('  recalcs por frame :', (dRecalc / N).toFixed(3));
  console.log('  ms de recalculo por frame:',
    (((after.RecalcStyleDuration ?? 0) - (before.RecalcStyleDuration ?? 0)) * 1000 / N).toFixed(4), 'ms');
  console.log('  ms de layout por frame   :',
    (((after.LayoutDuration ?? 0) - (before.LayoutDuration ?? 0)) * 1000 / N).toFixed(4), 'ms');

  // ---- B. contraste: escribir style.transform como STRING en cada frame ----
  await page.evaluate(() => { window.__snap(false); });
  const b0 = pick((await cdp.send('Performance.getMetrics')).metrics, KEYS);
  await page.evaluate(async n => {
    const els = Array.prototype.slice.call(document.querySelectorAll('.d-far,.d-figure,.d-wash,.d-content'));
    for (let i = 0; i < n; i++) {
      const v = (i % 200) - 100;
      for (const e of els) e.style.transform = 'translateX(' + v + 'px) scale(1.02)';
      await new Promise(r => requestAnimationFrame(r));
    }
  }, N);
  await page.waitForTimeout(200);
  const b1 = pick((await cdp.send('Performance.getMetrics')).metrics, KEYS);
  console.log('\n=== B. CONTRASTE: escribir el string de transform en las 20 capas ===');
  console.log('  layouts por frame :', (((b1.LayoutCount ?? 0) - (b0.LayoutCount ?? 0)) / N).toFixed(4));
  console.log('  recalcs por frame :', (((b1.RecalcStyleCount ?? 0) - (b0.RecalcStyleCount ?? 0)) / N).toFixed(3));
  console.log('  ms recalculo/frame:', (((b1.RecalcStyleDuration ?? 0) - (b0.RecalcStyleDuration ?? 0)) * 1000 / N).toFixed(4), 'ms');

  // ---- C. LayerTree ----
  await cdp.send('DOM.enable');
  await cdp.send('LayerTree.enable');
  let got = [];
  await new Promise(res => {
    const h = e => { if (e.layers && e.layers.length) { got = e.layers; } };
    cdp.on('LayerTree.layerTreeDidChange', h);
    setTimeout(() => { cdp.off('LayerTree.layerTreeDidChange', h); res(); }, 3500);
    (async () => { for (let i = 0; i < 8; i++) { await page.evaluate(k => { document.getElementById('container').scrollLeft = 2880 + k * 3; }, i); await page.waitForTimeout(220); } })();
  });
  console.log('\n=== C. LayerTree ===');
  if (!got.length) { console.log('  NO MEDIDO: el dominio LayerTree no devolvio capas en este headless.'); }
  else {
    console.log('  capas:', got.length);
    let tot = 0;
    for (const l of got.slice(0, 25)) {
      let r = [];
      try { const x = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }); r = x.compositingReasonIds || x.compositingReasons || []; } catch (_) {}
      let name = '#' + l.backendNodeId;
      try { if (l.backendNodeId) { const d = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId }); const a = d.node.attributes || []; name = d.node.localName + '.' + (a[a.indexOf('class') + 1] || ''); } } catch (_) {}
      const mb = (l.width * l.height * 4) / 1e6; tot += mb;
      console.log('   ', name.padEnd(26), String(l.width).padStart(6) + 'x' + String(l.height).padEnd(6), mb.toFixed(2).padStart(7), 'MB ', r.join(',').slice(0, 46));
    }
    console.log('  total textura:', tot.toFixed(1), 'MB');
  }
  await browser.close();
})();
