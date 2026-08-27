import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// El prototipo vive en el repo (tasks/proto/depth), no en el scratchpad efimero
// de la sesion que lo escribio. S es solo el directorio de salida.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = process.env.VERIFY_OUT || path.join(process.env.HOME, 'pw-harness', 'shots');
const URL = 'file://' + path.join(HERE, '..', 'proto', 'depth', 'index.html');

const VARIANTS = {
  'V1  .d-scrim suelto (diseno base)': '',
  'V2  .d-scrim promovido explicitamente':
    '.panel.is-hot .d-scrim{will-change:opacity}',
  'V3  scrim fusionado en .d-content (sin elemento)':
    `.d-scrim{display:none!important}
     .d-content{padding:0 8vw;max-width:none;width:78%;height:100%;display:flex;
       flex-direction:column;justify-content:center;
       background:linear-gradient(100deg,rgba(28,25,22,.72) 0%,rgba(28,25,22,.54) 52%,
         rgba(28,25,22,.28) 82%,rgba(28,25,22,0) 100%)}
     .d-content h2,.d-content p,.d-content .tag{max-width:34rem}`
};

async function run(name, css) {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(URL);
  if (css) await page.addStyleTag({ content: css });
  await page.waitForTimeout(700);
  await page.evaluate(() => { document.getElementById('container').scrollLeft = 2880; });
  await page.waitForTimeout(500);
  await cdp.send('DOM.enable');
  await cdp.send('LayerTree.enable');
  let got = [];
  await new Promise(res => {
    const h = e => { if (e.layers && e.layers.length) got = e.layers; };
    cdp.on('LayerTree.layerTreeDidChange', h);
    setTimeout(() => { cdp.off('LayerTree.layerTreeDidChange', h); res(); }, 3200);
    (async () => { for (let i = 0; i < 8; i++) { await page.evaluate(k => { document.getElementById('container').scrollLeft = 2880 + k * 3; }, i); await page.waitForTimeout(200); } })();
  });
  let tot = 0; const rows = [];
  for (const l of got) {
    const mb = l.width * l.height * 4 / 1e6; tot += mb;
    let r = [];
    try { const x = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }); r = x.compositingReasonIds || x.compositingReasons || []; } catch (_) { }
    let nm = '#' + l.backendNodeId;
    try { if (l.backendNodeId) { const d = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId }); const a = d.node.attributes || []; nm = d.node.localName + '.' + (a[a.indexOf('class') + 1] || ''); } } catch (_) { }
    rows.push({ nm, w: l.width, h: l.height, mb, r: r.join(',') });
  }
  rows.sort((a, b) => b.mb - a.mb);
  console.log('\n' + name);
  console.log('  capas:', got.length, '| textura (px CSS):', tot.toFixed(1), 'MB | equivalente a DPR2:', (tot * 4).toFixed(0), 'MB');
  for (const r of rows.filter(x => x.mb > 4))
    console.log('   ', r.nm.padEnd(24), (r.w + 'x' + r.h).padEnd(12), r.mb.toFixed(1).padStart(6), 'MB  [' + r.r + ']');
  const overlap = rows.filter(x => /Overlap/.test(x.r));
  console.log('   capas por solapamiento (Overlap):', overlap.length,
    '| MB en Overlap:', overlap.reduce((s, x) => s + x.mb, 0).toFixed(1));
  await browser.close();
  return tot;
}

(async () => {
  console.log('=== COSTE DE CAPAS POR VARIANTE DEL SCRIM (chromium, panel 2 centrado) ===');
  for (const [n, c] of Object.entries(VARIANTS)) await run(n, c);
})();
