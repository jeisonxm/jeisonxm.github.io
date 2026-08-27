import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// El prototipo vive en el repo (tasks/proto/depth), no en el scratchpad efimero
// de la sesion que lo escribio. S es solo el directorio de salida.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = process.env.VERIFY_OUT || path.join(process.env.HOME, 'pw-harness', 'shots');
const URL = 'file://' + path.join(HERE, '..', 'proto', 'depth', 'index.html');
const KEYS = ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration'];
const pick = m => Object.fromEntries(m.filter(x => KEYS.includes(x.name)).map(x => [x.name, x.value]));

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(URL); await page.waitForTimeout(700);
  await page.evaluate(() => window.__snap(false));

  const N = 500;
  // Ambos modos hacen EXACTAMENTE lo mismo salvo como escriben: mueven scrollLeft
  // y actualizan 20 capas. A = 10 custom properties tipadas + calc en CSS.
  // B = 20 strings de transform + 12 de opacity escritos a mano desde JS.
  await page.evaluate(() => {
    const c = document.getElementById('container');
    const panels = Array.prototype.slice.call(c.querySelectorAll('.panel'));
    const K = { '.d-far': .22, '.d-figure': .10, '.d-wash': .05, '.d-content': -.08 };
    const SC = { '.d-far': .03, '.d-figure': .06, '.d-wash': 0, '.d-content': 0 };
    const els = panels.map(p => Object.keys(K).map(s => p.querySelector(s)));
    window.__modeB = function (x) {
      const vw = c.clientWidth;
      for (let i = 0; i < panels.length; i++) {
        let p = (x - panels[i].offsetLeft) / vw;      // ojo: lectura de layout, solo para el test
        if (p > 1.15) p = 1.15; else if (p < -1.15) p = -1.15;
        let a = Math.abs(p); if (a > 1) a = 1; a = a * a * (3 - 2 * a);
        const ks = Object.keys(K);
        for (let j = 0; j < ks.length; j++) {
          const e = els[i][j], k = K[ks[j]], sc = SC[ks[j]];
          e.style.transform = 'translateX(' + (p * k * vw).toFixed(2) + 'px) scale(' + (1 + sc - sc * a).toFixed(4) + ')';
        }
        els[i][1].style.opacity = (1 - .72 * a).toFixed(4);
        els[i][2].style.opacity = (.42 * a).toFixed(4);
        els[i][3].style.opacity = Math.max(0, 1 - 1.45 * a).toFixed(4);
      }
    };
    // cachear offsets para que modo B no pague lecturas de layout
    const offs = panels.map(p => p.offsetLeft);
    window.__modeB2 = function (x) {
      const vw = c.clientWidth;
      for (let i = 0; i < panels.length; i++) {
        let p = (x - offs[i]) / vw;
        if (p > 1.15) p = 1.15; else if (p < -1.15) p = -1.15;
        let a = Math.abs(p); if (a > 1) a = 1; a = a * a * (3 - 2 * a);
        const ks = Object.keys(K);
        for (let j = 0; j < ks.length; j++) {
          const e = els[i][j], k = K[ks[j]], sc = SC[ks[j]];
          e.style.transform = 'translateX(' + (p * k * vw).toFixed(2) + 'px) scale(' + (1 + sc - sc * a).toFixed(4) + ')';
        }
        els[i][1].style.opacity = (1 - .72 * a).toFixed(4);
        els[i][2].style.opacity = (.42 * a).toFixed(4);
        els[i][3].style.opacity = Math.max(0, 1 - 1.45 * a).toFixed(4);
      }
    };
  });

  async function run(label, fn) {
    await page.evaluate(() => { document.getElementById('container').scrollLeft = 0; });
    await page.waitForTimeout(250);
    const b = pick((await cdp.send('Performance.getMetrics')).metrics);
    const t = await page.evaluate(async ([n, which]) => {
      const c = document.getElementById('container');
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        c.scrollLeft = (i * 11) % 5760;
        if (which === 'B') window.__modeB2(c.scrollLeft);
        await new Promise(r => requestAnimationFrame(r));
      }
      return performance.now() - t0;
    }, [N, fn]);
    await page.waitForTimeout(250);
    const a = pick((await cdp.send('Performance.getMetrics')).metrics);
    const d = k => (a[k] ?? 0) - (b[k] ?? 0);
    console.log(label.padEnd(46),
      '| layout/frame', (d('LayoutCount') / N).toFixed(3).padStart(6),
      '| recalc/frame', (d('RecalcStyleCount') / N).toFixed(3).padStart(6),
      '| recalc ms/frame', (d('RecalcStyleDuration') * 1000 / N).toFixed(3).padStart(6),
      '| layout ms/frame', (d('LayoutDuration') * 1000 / N).toFixed(3).padStart(6),
      '| script ms/frame', (d('ScriptDuration') * 1000 / N).toFixed(3).padStart(6));
  }

  console.log('=== A/B JUSTO:', N, 'frames, mismo scrollLeft, mismas 20 capas actualizadas ===');
  await run('A  --p/--a tipadas + calc() en CSS', 'A');
  await run('B  style.transform como string desde JS', 'B');
  await run('A  (repeticion)', 'A');
  await run('B  (repeticion)', 'B');

  // ---------- LayerTree: scrim suelto vs scrim dentro del contenido ----------
  async function layerReport(tag) {
    await cdp.send('DOM.enable').catch(() => { });
    await cdp.send('LayerTree.enable');
    let got = [];
    await new Promise(res => {
      const h = e => { if (e.layers && e.layers.length) got = e.layers; };
      cdp.on('LayerTree.layerTreeDidChange', h);
      setTimeout(() => { cdp.off('LayerTree.layerTreeDidChange', h); res(); }, 3000);
      (async () => { for (let i = 0; i < 7; i++) { await page.evaluate(k => { document.getElementById('container').scrollLeft = 2880 + k * 3; }, i); await page.waitForTimeout(200); } })();
    });
    let tot = 0, big = [];
    for (const l of got) {
      const mb = (l.width * l.height * 4) / 1e6; tot += mb;
      let r = [];
      try { const x = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }); r = x.compositingReasonIds || x.compositingReasons || []; } catch (_) { }
      if (mb > 8) {
        let name = '#' + l.backendNodeId;
        try { if (l.backendNodeId) { const d = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId }); const at = d.node.attributes || []; name = d.node.localName + '.' + (at[at.indexOf('class') + 1] || ''); } } catch (_) { }
        big.push(name + ' ' + l.width + 'x' + l.height + ' ' + mb.toFixed(1) + 'MB [' + r.join(',') + ']');
      }
    }
    console.log('\n' + tag);
    console.log('  capas:', got.length, '| textura total (px CSS):', tot.toFixed(1), 'MB',
      '| a DPR 2:', (tot * 4).toFixed(0), 'MB');
    console.log('  capas > 8 MB:', big.length ? '\n    ' + big.join('\n    ') : 'ninguna');
    await cdp.send('LayerTree.disable');
  }

  await layerReport('=== C1. Arbol actual: .d-scrim suelto por encima de capas promovidas ===');

  // variante: el scrim de contraste viaja DENTRO de la capa de contenido
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = `
      .d-scrim{display:none!important}
      .d-content{padding:0 8vw; max-width:none; width:78%; height:100%;
                 display:flex; flex-direction:column; justify-content:center;
                 background:linear-gradient(100deg, rgba(28,25,22,.72) 0%,
                   rgba(28,25,22,.54) 52%, rgba(28,25,22,.28) 82%, rgba(28,25,22,0) 100%);}
      .d-content h2,.d-content p,.d-content .tag{max-width:34rem}`;
    document.head.appendChild(st);
  });
  await page.waitForTimeout(500);
  await layerReport('=== C2. Variante: scrim fusionado en .d-content (sin elemento propio) ===');

  await browser.close();
})();
