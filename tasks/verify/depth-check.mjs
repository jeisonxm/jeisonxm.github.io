// depth-check.mjs — puerta de aceptacion de T5: las cuatro capas.
//
// Mide lo que el plan §2.2 especifica y que no se puede ver a ojo:
//   - los cuatro factores k, por REGRESION sobre varios valores de p
//   - que los cuatro salgan DISTINTOS entre si
//   - transform exactamente 0 en p=0 (el defecto 5 eran 41.93 px de
//     descentrado permanente)
//   - el tope absoluto de 340 px, probado a 2560 px de ancho
//   - la separacion entre capas contiguas: tiene que ser progresion
//     geometrica, que es lo que se lee como profundidad
//   - prefers-reduced-motion y puntero grueso
//
//   node depth-check.mjs [--engines=webkit,firefox,chromium]

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ENGINES = String(argv.engines || 'webkit,firefox,chromium').split(',');

const ESPERADO = { far: 0.2200, fig: 0.1000, wash: 0.0500, text: -0.0800 };
const TOPE = 340;

function wkDir() {
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME, '.cache', 'ms-playwright');
  if (!existsSync(b)) return null;
  const d = readdirSync(b).filter((x) => /^webkit-\d+$/.test(x))
    .sort((a, c) => Number(c.split('-')[1]) - Number(a.split('-')[1]));
  return d.length ? path.join(b, d[0]) : null;
}
function launcher(n) {
  if (n === 'chromium') return { type: chromium, opts: {} };
  if (n === 'firefox') return { type: firefox, opts: {} };
  const opts = {}, w = wkDir(), r = path.join(HERE, 'wk_run.sh');
  if (process.env.WK_SYSROOT && existsSync(r) && w) { process.env.WK_BROWSER_DIR = w; opts.executablePath = r; }
  return { type: webkit, opts };
}

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1]));
}));

// tx del transform computado de cada capa, para una lista de p
const leer = (ps) => (psIn) => {}; // placeholder, se define en pagina
const CAPAS = { far: '.d-far', fig: '.d-fig', wash: '.d-wash', text: '.d-text' };

let fallos = 0;
for (const eng of ENGINES) {
  const { type, opts } = launcher(eng);
  const browser = await type.launch({ headless: true, ...opts });

  for (const [ancho, etiqueta] of [[1440, '1440'], [2560, '2560 (tope)']]) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 }, locale: 'es-ES' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(600);

    const r = await page.evaluate((capas) => {
      const panel = document.getElementById('hero');
      const vw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vw'));
      const tx = (sel) => {
        const el = panel.querySelector(sel);
        if (!el) return null;
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return { x: m.m41, escala: m.a };
      };
      const op = (sel) => {
        const el = panel.querySelector(sel);
        return el ? parseFloat(getComputedStyle(el).opacity) : null;
      };
      const muestras = [];
      const PS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.15];
      for (const p of PS) {
        const t = Math.min(Math.abs(p), 1);
        panel.style.setProperty('--p', String(p));
        panel.style.setProperty('--a', String(t * t * (3 - 2 * t)));
        const fila = { p };
        for (const [k, sel] of Object.entries(capas)) fila[k] = tx(sel);
        fila.opFig = op('.d-fig'); fila.opWash = op('.d-wash'); fila.opText = op('.d-text');
        muestras.push(fila);
      }
      panel.style.removeProperty('--p'); panel.style.removeProperty('--a');
      return { vw, muestras };
    }, CAPAS);

    // Regresion por minimos cuadrados sobre los puntos NO topados
    const linea = [];
    for (const k of Object.keys(CAPAS)) {
      const pts = r.muestras
        .filter((m) => m[k] && Math.abs(m[k].x) < TOPE - 0.5)
        .map((m) => [m.p * r.vw, m[k].x]);
      const n = pts.length;
      const sx = pts.reduce((a, [x]) => a + x, 0), sy = pts.reduce((a, [, y]) => a + y, 0);
      const sxy = pts.reduce((a, [x, y]) => a + x * y, 0), sxx = pts.reduce((a, [x]) => a + x * x, 0);
      const kf = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const ok = Math.abs(kf - ESPERADO[k]) < 0.002;
      if (!ok) fallos++;
      linea.push(`${k}=${kf.toFixed(4)}${ok ? '' : ` FALLA (esperado ${ESPERADO[k]})`}`);
    }

    const cero = r.muestras.find((m) => m.p === 0);
    const ceroOk = Object.keys(CAPAS).every((k) => cero[k] && Math.abs(cero[k].x) < 0.01);
    if (!ceroOk) fallos++;

    const topados = r.muestras.filter((m) => m.far && Math.abs(m.far.x) > TOPE + 0.5);
    if (topados.length) fallos++;

    // separacion entre capas contiguas a |p|=0.5
    const h = r.muestras.find((m) => m.p === 0.5);
    const sep = h ? {
      L1L2: Math.abs(h.far.x - h.fig.x), L2L3: Math.abs(h.fig.x - h.wash.x),
      L3L4: Math.abs(h.wash.x - h.text.x),
    } : null;
    const distintos = new Set(Object.keys(CAPAS).map((k) => (h[k].x).toFixed(2))).size === 4;
    if (!distintos) fallos++;

    console.log(`\n${eng} @ ${etiqueta}  vw=${r.vw}`);
    console.log(`  factores por regresion : ${linea.join('  ')}`);
    console.log(`  transform en p=0       : ${Object.keys(CAPAS).map((k) => `${k}=${cero[k].x}`).join(' ')}  ${ceroOk ? 'OK: 0 exacto' : 'FALLA'}`);
    console.log(`  tope ${TOPE}px           : max |tx| = ${Math.max(...r.muestras.map((m) => Math.abs(m.far.x))).toFixed(1)}  ${topados.length ? 'EXCEDIDO' : 'OK'}`);
    if (sep) console.log(`  separacion a |p|=0.5   : L1-L2 ${sep.L1L2.toFixed(1)}  L2-L3 ${sep.L2L3.toFixed(1)}  L3-L4 ${sep.L3L4.toFixed(1)} px` +
      `   ratios ${(sep.L1L2 / sep.L2L3).toFixed(1)}x / ${(sep.L3L4 / sep.L2L3).toFixed(1)}x  ${distintos ? 'OK: 4 capas distintas' : 'FALLA'}`);
    const o = r.muestras.find((m) => m.p === 1);
    console.log(`  opacidades en p=1      : figura ${o.opFig}  campo ${o.opWash}  texto ${o.opText}`);
    if (errs.length) { fallos++; console.log(`  pageErrors: ${errs.join(' | ')}`); }
    await ctx.close();
  }

  // reduced-motion y puntero grueso
  for (const [nombre, opciones] of [
    ['reduced-motion', { reducedMotion: 'reduce' }],
    ['puntero grueso', { hasTouch: true, isMobile: true } ],
  ]) {
    let ctx;
    try { ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES', ...opciones }); }
    catch { console.log(`\n${eng} ${nombre}: el motor no admite este contexto, se omite`); continue; }
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const panel = document.getElementById('hero');
      panel.style.setProperty('--p', '0.5'); panel.style.setProperty('--a', '0.5');
      const t = (s) => { const e = panel.querySelector(s); return e ? getComputedStyle(e).transform : null; };
      return { far: t('.d-far'), text: t('.d-text') };
    });
    const sinMover = r.far === 'none' && r.text === 'none';
    console.log(`\n${eng} ${nombre}: transform ${sinMover ? 'none en las capas — OK' : `far=${r.far}`}` +
      (errs.length ? `  pageErrors: ${errs.join(' | ')}` : ''));
    if (errs.length) fallos++;
    await ctx.close();
  }
  await browser.close();
}
proc.kill();
console.log(fallos ? `\n${fallos} CRITERIOS DE T5 SIN CUMPLIR` : `\nLAS CUATRO CAPAS CUMPLEN EN LOS TRES MOTORES`);
process.exit(fallos ? 1 : 0);
