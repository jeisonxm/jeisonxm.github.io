import { webkit, chromium, firefox } from 'playwright';
import path from 'node:path';

const S = '/tmp/claude-1001/-home-archy-jeisonxm-github-io/ab849e21-0869-4348-9524-78050999b3ea/scratchpad';
const URL = 'file://' + path.join(S, 'recon/depth/index.html');
const ENGINE = process.argv[2] || 'webkit';
const B = { webkit, chromium, firefox }[ENGINE];

const mx = t => {            // matrix(a,b,c,d,tx,ty) -> {sx, tx}
  if (!t || t === 'none') return { sx: 1, tx: 0 };
  const n = t.match(/matrix(?:3d)?\(([^)]+)\)/);
  if (!n) return { sx: 1, tx: 0 };
  const v = n[1].split(',').map(Number);
  return v.length === 6 ? { sx: v[0], tx: v[4] } : { sx: v[0], tx: v[12] };
};
const L = ['.d-far', '.d-figure', '.d-wash', '.d-content'];
const out = o => console.log(JSON.stringify(o));

(async () => {
  const browser = await B.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(400);

  const ua = await page.evaluate(() => navigator.userAgent);
  const sup = await page.evaluate(() => window.__probe().supports);
  const vw = await page.evaluate(() => window.__probe().vw);
  console.log('=== ENGINE', ENGINE, '===');
  console.log('UA:', ua);
  console.log('supports:', JSON.stringify(sup));
  console.log('vw:', vw, '| JS errors:', errs.length ? errs : 'none');

  // ---------- A. barrido de scroll: el transform de cada capa vs scrollLeft ----------
  await page.evaluate(() => window.__snap(false));   // el snap mandatory impide posiciones intermedias
  console.log('\n--- A. BARRIDO (snap desactivado solo para medir): panel 1 (offset ' + vw + 'px), scrollLeft 0..' + (2 * vw) + ' ---');
  console.log('scrollLeft |    p    |  far.tx  far.sx | fig.tx  fig.sx  fig.op | wash.tx wash.op | txt.tx  txt.op');
  const rows = [];
  for (let i = 0; i <= 16; i++) {
    const x = Math.round((2 * vw) * (i / 16));
    await page.evaluate(sx => {
      const c = document.getElementById('container');
      c.scrollLeft = sx;
    }, x);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const pr = await page.evaluate(() => window.__probe());
    const P = pr.panels[1];
    const f = mx(P.layers['.d-far'].transform), g = mx(P.layers['.d-figure'].transform);
    const w = mx(P.layers['.d-wash'].transform), t = mx(P.layers['.d-content'].transform);
    rows.push({ x: pr.scrollLeft, p: P.p, far: f, fig: g, wash: w, txt: t,
                figOp: P.layers['.d-figure'].opacity, washOp: P.layers['.d-wash'].opacity,
                txtOp: P.layers['.d-content'].opacity });
    console.log(
      String(pr.scrollLeft).padStart(9), '|',
      P.p.toFixed(3).padStart(7), '|',
      f.tx.toFixed(1).padStart(8), f.sx.toFixed(4).padStart(7), '|',
      g.tx.toFixed(1).padStart(7), g.sx.toFixed(4).padStart(7),
      P.layers['.d-figure'].opacity.toFixed(3).padStart(6), '|',
      w.tx.toFixed(1).padStart(7), P.layers['.d-wash'].opacity.toFixed(3).padStart(6), '|',
      t.tx.toFixed(1).padStart(7), P.layers['.d-content'].opacity.toFixed(3).padStart(6));
  }

  await page.evaluate(() => window.__snap(true));
  // ---------- B. factores medidos (regresion sobre p en el tramo lineal) ----------
  const lin = rows.filter(r => Math.abs(r.p) <= 1.0 && Math.abs(r.p) > 0.01);
  const slope = key => {
    let sxy = 0, sxx = 0;
    for (const r of lin) { const y = r[key].tx; sxy += r.p * y; sxx += r.p * r.p; }
    return sxy / sxx / vw;
  };
  const K = { far: slope('far'), fig: slope('fig'), wash: slope('wash'), txt: slope('txt') };
  console.log('\n--- B. FACTORES k MEDIDOS (tx = k * p * vw), esperado far .22 / fig .10 / wash .05 / txt -.08 ---');
  console.log('k_far  =', K.far.toFixed(4));
  console.log('k_fig  =', K.fig.toFixed(4));
  console.log('k_wash =', K.wash.toFixed(4));
  console.log('k_txt  =', K.txt.toFixed(4));
  const distinct = new Set([K.far, K.fig, K.wash, K.txt].map(v => v.toFixed(3))).size;
  console.log('factores distintos entre si:', distinct, '/ 4');

  // ---------- C. rango de movimiento por capa ----------
  console.log('\n--- C. RECORRIDO TOTAL por capa en el barrido ---');
  for (const [name, key] of [['fondo', 'far'], ['figura', 'fig'], ['campo', 'wash'], ['texto', 'txt']]) {
    const v = rows.map(r => r[key].tx);
    const s = rows.map(r => r[key].sx);
    console.log(name.padEnd(7), 'tx', Math.min(...v).toFixed(1).padStart(8), '->',
      Math.max(...v).toFixed(1).padStart(8), ' recorrido', (Math.max(...v) - Math.min(...v)).toFixed(1).padStart(7),
      'px | escala', Math.min(...s).toFixed(4), '->', Math.max(...s).toFixed(4));
  }
  const opRange = k => { const v = rows.map(r => r[k]); return Math.min(...v).toFixed(3) + ' -> ' + Math.max(...v).toFixed(3); };
  console.log('opacidad figura', opRange('figOp'), '| campo', opRange('washOp'), '| texto', opRange('txtOp'));

  // ---------- C2. scroll REAL animado, con snap, muestreado por frame ----------
  await page.evaluate(() => { document.getElementById('container').scrollLeft = 0; });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__perfReset());
  const rec = await page.evaluate(async () => {
    const pr = window.__record(1100);
    setTimeout(() => window.__goTo(2, 'smooth'), 60);
    return pr;
  });
  const uniq = new Set(rec.map(r => r.far)).size;
  const moving = rec.filter((r, i) => i > 0 && r.x !== rec[i - 1].x);
  console.log('\n--- C2. SCROLL ANIMADO REAL (goTo panel 2, smooth, snap activo) ---');
  console.log('frames muestreados:', rec.length, '| frames con scrollLeft distinto:', moving.length,
              '| valores distintos de transform en .d-far:', uniq);
  const step = Math.max(1, Math.floor(rec.length / 12));
  console.log('   t(ms)  scrollLeft      p   |  far.tx   fig.tx  wash.tx   txt.tx');
  for (let i = 0; i < rec.length; i += step) {
    const r = rec[i];
    console.log(String(r.t).padStart(8), String(r.x).padStart(11), r.p.toFixed(3).padStart(7), '  |',
      mx(r.far).tx.toFixed(1).padStart(8), mx(r.fig).tx.toFixed(1).padStart(8),
      mx(r.wash).tx.toFixed(1).padStart(8), mx(r.txt).tx.toFixed(1).padStart(8));
  }
  const dts = [];
  for (let i = 1; i < rec.length; i++) dts.push(rec[i].t - rec[i - 1].t);
  dts.sort((a, b) => a - b);
  const perf = await page.evaluate(() => window.__probe().perf);
  console.log('delta entre frames: mediana', dts[dts.length >> 1].toFixed(1), 'ms | p95',
    dts[Math.floor(dts.length * 0.95)].toFixed(1), 'ms | max', dts[dts.length - 1].toFixed(1), 'ms');
  console.log('coste del bucle write(): media', perf.avgMs.toFixed(4), 'ms | max', perf.maxMs.toFixed(3),
    'ms | frames escritos', perf.frames);

  // ---------- C3. coste del bucle ----------
  const b1 = await page.evaluate(() => window.__bench(2000, false));
  const b2 = await page.evaluate(() => window.__bench(2000, true));
  console.log('\n--- C3. COSTE DE write() (5 paneles x 2 custom props) ---');
  console.log('solo JS               :', b1.perCallMs.toFixed(4), 'ms/frame  (', b1.totalMs.toFixed(1), 'ms /', b1.n, ')');
  console.log('JS + recalculo forzado:', b2.perCallMs.toFixed(4), 'ms/frame  (', b2.totalMs.toFixed(1), 'ms /', b2.n, ')');
  console.log('presupuesto de un frame a 60 Hz: 16.67 ms');

  // ---------- D. promocion acotada ----------
  await page.evaluate(v => { document.getElementById('container').scrollLeft = 2 * v; }, vw);
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  const hot = await page.evaluate(() => window.__probe().panels.map(p => p.hot));
  console.log('\n--- D. PROMOCION (will-change) con el panel 2 centrado ---');
  console.log('panel is-hot:', hot.join(' '), '| promovidos:', hot.filter(Boolean).length, 'de', hot.length);

  // ---------- E. gestos ----------
  console.log('\n--- E. GESTOS ---');
  // Perfil real de un flick de trackpad en macOS: la magnitud sube rapido y el
  // dedo se levanta MIENTRAS sigue moviendose, o sea que el ultimo delta del
  // gesto esta cerca del pico. La inercia arranca justo ahi y decae de forma
  // monotona durante ~1 s. Devuelve [gesto, inercia] encadenados.
  const flick = (sign, peakMag, nUp = 5, nTail = 30) => {
    const g = [];
    for (let i = 0; i < nUp; i++) {
      const t = (i + 1) / nUp;                       // 0.2 .. 1
      g.push(sign * Math.max(1, Math.round(peakMag * t * 10) / 10));
    }
    const release = peakMag * 0.92;                  // velocidad al soltar
    const t2 = []; let m = release;
    for (let i = 0; i < nTail; i++) { m *= 0.90; t2.push(sign * Math.max(0.3, Math.round(m * 10) / 10)); }
    return { gesture: g, tail: t2 };
  };

  async function playWheel(seq, dtMs) {
    for (const dy of seq) {
      await page.evaluate(d => window.__wheel(d), dy);
      await page.waitForTimeout(dtMs);
    }
  }

  async function scenario(name, plan) {
    await page.evaluate(() => window.__resetNav());
    await page.waitForTimeout(60);
    await page.waitForTimeout(120);
    await plan();
    await page.waitForTimeout(700);
    const pr = await page.evaluate(() => window.__probe());
    console.log(name.padEnd(46), '-> panel', pr.target,
      '| avances', pr.stats.advances, '| gestos', pr.stats.gestures,
      '| eventos de inercia ignorados', pr.stats.momentumEvents);
    return pr.target;
  }

  // 3 flicks de trackpad con inercia, 120 ms entre ellos  (el caso del defecto 4)
  const r1 = await scenario('3 flicks + inercia, gap 120ms  (defecto 4)', async () => {
    for (let k = 0; k < 3; k++) {
      const f = flick(1, 26);
      await playWheel(f.gesture, 8);
      await playWheel(f.tail.slice(0, 8), 8);   // la inercia sigue viva al llegar el siguiente
      await page.waitForTimeout(120);
    }
  });
  const r2 = await scenario('3 flicks + inercia, gap 40ms   (peor caso)', async () => {
    for (let k = 0; k < 3; k++) {
      const f = flick(1, 26);
      await playWheel(f.gesture, 8);
      await playWheel(f.tail.slice(0, 10), 8);
      await page.waitForTimeout(40);
    }
  });
  const r3 = await scenario('1 flick fuerte + 30 ev. de inercia -> 1 panel', async () => {
    const f = flick(1, 45, 6, 30);
    await playWheel(f.gesture, 8);
    await playWheel(f.tail, 8);
  });
  const r3b = await scenario('1 flick suave + 30 ev. de inercia -> 1 panel', async () => {
    const f = flick(1, 20, 6, 30);
    await playWheel(f.gesture, 8);
    await playWheel(f.tail, 8);
  });
  // 3 notches de rueda clasica, 60 ms
  const r4 = await scenario('3 notches de raton (deltaY 120), gap 60ms', async () => {
    for (let k = 0; k < 3; k++) { await page.evaluate(() => window.__wheel(120)); await page.waitForTimeout(60); }
  });
  // scroll continuo lento 1.2 s (arrastre de dos dedos sin soltar)
  const r5 = await scenario('arrastre continuo 1.2 s (dy=9 cada 16ms)', async () => {
    for (let k = 0; k < 75; k++) { await page.evaluate(() => window.__wheel(9)); await page.waitForTimeout(16); }
  });
  // gesto horizontal: el JS NO debe intervenir
  const r6 = await scenario('gesto HORIZONTAL (dx dominante) -> nativo', async () => {
    for (let k = 0; k < 10; k++) { await page.evaluate(() => window.__wheel(2, 40)); await page.waitForTimeout(10); }
  });
  // hacia atras
  const r7 = await scenario('ir a panel 3 y 2 flicks hacia atras', async () => {
    await page.evaluate(() => window.__goTo(3, 'auto'));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__probe());
    for (let k = 0; k < 2; k++) {
      const f = flick(-1, 26);
      await playWheel(f.gesture, 8);
      await playWheel(f.tail.slice(0, 8), 8);
      await page.waitForTimeout(120);
    }
  });

  // ---------- F. reduced motion ----------
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p2 = await ctx2.newPage();
  await p2.goto(URL); await p2.waitForTimeout(300);
  await p2.evaluate(() => { window.__snap(false); document.getElementById('container').scrollLeft = 1440 - 540; });
  await p2.evaluate(() => new Promise(r => setTimeout(r, 300)));
  const rm = await p2.evaluate(() => window.__probe());
  const P1 = rm.panels[1];
  console.log('\n--- F. prefers-reduced-motion: reduce ---');
  console.log('motionOn:', rm.motionOn, '| p panel1:', P1.p, '| hot:', rm.panels.map(x => x.hot ? 1 : 0).join(''));
  for (const s of L) console.log('  ', s.padEnd(11), 'transform', P1.layers[s].transform, '| opacity', P1.layers[s].opacity);
  await ctx2.close();

  console.log('\n--- ERRORES JS:', errs.length ? errs : 'ninguno', '---');
  await browser.close();
})();
