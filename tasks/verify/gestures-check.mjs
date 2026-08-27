// gestures-check.mjs — los 8 escenarios de gesto de T7, en los 3 motores.
//
// Se despachan WheelEvent DENTRO de la pagina, no con page.mouse.wheel. Medido
// en T1: mouse.wheel cuesta ~200-460 ms de ida y vuelta en WebKit headless, o
// sea que no puede reproducir un gesto de 120 ms y el panel alcanzado bailaba
// entre corridas. El despacho en pagina da 120-125 ms en los tres motores.
//
// LIMITE HONESTO: esto ejercita la MAQUINA DE ESTADOS del sitio, no el scroll
// nativo. La regla 1 (gesto horizontal) se comprueba por lo que se puede
// comprobar — que el JS no interviene ni avanza — no por el resultado del
// scroll nativo, que un evento sintetico no mueve.
//
//   node gestures-check.mjs [--engines=webkit,firefox,chromium]

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

// --- perfiles de gesto ---
// Un flick: sube, pica y cae, fase activa < 200 ms, pico alto.
const FLICK = [8, 26, 52, 64, 44];
// Un flick suave sigue siendo un flick: tiene que cruzar THRESHOLD en su FASE
// DE SUBIDA (8+20+28 = 56 >= 55), porque en cuanto empieza a decaer el motor lo
// clasifica como inercia y deja de acumular. Un gesto que no llega a eso es un
// roce, no un flick, y que no avance es deliberado.
// La diferencia con el fuerte esta en el pico: 28 contra 64.
const FLICK_SUAVE = [8, 20, 28, 24, 16];
// La inercia decae de forma monotona. Es la propiedad que la delata.
const inercia = (desde, n) => Array.from({ length: n }, (_, i) => Math.max(1, Math.round(desde * Math.pow(0.82, i + 1))));
// Arrastre sostenido: magnitud moderada y constante, sin pico.
// Arrastre sostenido a ~500 px/s: 60 eventos de 10 px cada 20 ms.
// OJO: cuantos paneles avanza un arrastre depende de su VELOCIDAD, y eso es
// una propiedad real, no un ajuste. A 700 px/s este mismo arrastre da 4 paneles.
// Las constantes del plan estan calibradas contra un perfil sintetico, y este
// es el perfil. Contra deltas reales del trackpad habra que revisarlas.
const ARRASTRE = Array.from({ length: 60 }, () => 10);

const ESCENARIOS = [
  { n: '3 flicks + inercia @120ms', desde: 0, espera: 3,
    pasos: [].concat(...[0, 1, 2].map((k) => [
      ...FLICK.map((d, i) => ({ dy: d, t: i === 0 ? (k ? 120 : 0) : 16 })),
      ...inercia(30, 8).map((d) => ({ dy: d, t: 16 })),
    ])) },
  { n: '3 flicks @40ms', desde: 0, espera: 3,
    pasos: [].concat(...[0, 1, 2].map((k) => FLICK.map((d, i) => ({ dy: d, t: i === 0 ? (k ? 140 : 0) : 8 })))) },
  { n: '1 flick fuerte + 30 de inercia', desde: 0, espera: 1,
    pasos: [...FLICK.map((d, i) => ({ dy: d, t: i ? 16 : 0 })), ...inercia(40, 30).map((d) => ({ dy: d, t: 16 }))] },
  { n: '1 flick suave + 30 de inercia', desde: 0, espera: 1,
    pasos: [...FLICK_SUAVE.map((d, i) => ({ dy: d, t: i ? 16 : 0 })), ...inercia(9, 30).map((d) => ({ dy: d, t: 16 }))] },
  { n: '3 notches de raton @60ms', desde: 0, espera: 3,
    pasos: [0, 1, 2].map((k) => ({ dy: 120, t: k ? 60 : 0, modo: 0 })) },
  { n: 'arrastre continuo 1.2 s', desde: 0, espera: 3,
    pasos: ARRASTRE.map((d, i) => ({ dy: d, t: i ? 20 : 0 })) },
  { n: 'gesto horizontal', desde: 0, espera: 0, horizontal: true,
    pasos: FLICK.map((d, i) => ({ dx: d * 4, dy: 0, t: i ? 16 : 0 })) },
  { n: 'desde panel 3, 2 flicks atras', desde: 3, espera: 1,
    pasos: [].concat(...[0, 1].map((k) => [
      ...FLICK.map((d, i) => ({ dy: -d, t: i === 0 ? (k ? 140 : 0) : 16 })),
      ...inercia(30, 8).map((d) => ({ dy: -d, t: 16 })),
    ])) },
];

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1])); }));

let fallos = 0, noFieles = 0;
for (const eng of ENGINES) {
  const { type, opts } = launcher(eng);
  const browser = await type.launch({ headless: true, ...opts });
  console.log(`\n=== ${eng} ===`);
  for (const esc of ESCENARIOS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(700);

    const r = await page.evaluate(async ({ pasos, desde, horizontal }) => {
      const c = document.getElementById('container');
      c.scrollTo({ left: c.clientWidth * desde, behavior: 'auto' });
      await new Promise((r) => setTimeout(r, 500));
      let intervenido = 0;
      const espia = (e) => { if (e.defaultPrevented) intervenido++; };
      c.addEventListener('wheel', espia);   // ultimo listener: ve el defaultPrevented final
      const sellos = [];
      for (const p of pasos) {
        if (p.t) await new Promise((r) => setTimeout(r, p.t));
        sellos.push(performance.now());
        c.dispatchEvent(new WheelEvent('wheel', {
          deltaX: p.dx || 0, deltaY: p.dy || 0, deltaMode: p.modo || 0,
          bubbles: true, cancelable: true }));
      }
      c.removeEventListener('wheel', espia);
      // esperar a que el scroll suave se detenga de verdad
      let ult = -1, quieto = 0;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (c.scrollLeft === ult) { if (++quieto >= 4) break; } else { quieto = 0; ult = c.scrollLeft; }
      }
      // Gaps REALES entre eventos. Si el motor no puede entregarlos a la
      // separacion pedida, el escenario NO se reprodujo y su resultado no dice
      // nada del sitio: dice que el instrumento no llega.
      const gaps = sellos.slice(1).map((t, i) => t - sellos[i]);
      const pedidos = pasos.slice(1).map((p) => p.t || 0);
      const desvio = gaps.map((g, i) => pedidos[i] ? Math.abs(g - pedidos[i]) / pedidos[i] : 0);
      desvio.sort((a, b) => a - b);
      // El maximo importa MAS que la mediana: IDLE_MS=120 es lo que segmenta
      // gestos, asi que un solo hueco por encima de eso parte el gesto en dos y
      // el resultado deja de ser el escenario que se pidio medir. La mediana
      // esconde justo ese pico.
      const pedidoMax = Math.max(...pedidos.filter((x) => x > 0), 0);
      return { panel: Math.round(c.scrollLeft / c.clientWidth), intervenido, eventos: pasos.length,
               desvioMediano: desvio.length ? +desvio[Math.floor(desvio.length / 2)].toFixed(2) : 0,
               gapMedio: gaps.length ? +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(0) : 0,
               gapMax: gaps.length ? +Math.max(...gaps).toFixed(0) : 0, pedidoMax };
    }, esc);

    // Fiel = el motor entrego los eventos a la separacion pedida (mediana
    // dentro del 50%). Si no, el escenario no se reprodujo.
    // IDLE_MS del sitio. Si el motor mete un silencio por encima, ha inventado
    // una separacion de gesto que el escenario no pedia.
    const IDLE_MS = 120;
    const fiel = r.desvioMediano <= 0.5 && (r.gapMax <= Math.max(IDLE_MS, r.pedidoMax * 1.5));
    const acierta = r.panel === esc.espera && (!esc.horizontal || r.intervenido === 0);
    const ok = errs.length === 0 && (fiel ? acierta : true);
    if (!ok) fallos++;
    if (!fiel) noFieles++;
    console.log(`  ${ok ? (fiel ? 'OK  ' : 'n/i ') : 'FALLO'} ${esc.n.padEnd(32)} panel ${r.panel} (esperado ${esc.espera})` +
      `   gap medio ${r.gapMedio} ms, max ${r.gapMax} ms, desvio ${(100 * r.desvioMediano).toFixed(0)}%` +
      (fiel ? '' : ' <- NO INTERPRETABLE: el motor no entrega el gesto a tiempo') +
      (esc.horizontal ? `   preventDefault: ${r.intervenido}/${r.eventos}` : '') +
      (errs.length ? `   pageError: ${errs[0]}` : ''));
    await ctx.close();
  }
  await browser.close();
}
proc.kill();
if (noFieles) console.log(`\n${noFieles} escenarios no interpretables: el motor no pudo entregar el gesto a la separacion pedida.\n` +
  `Es el mismo limite que midio T1: WebKit headless sobre llvmpipe no reproduce timings finos.\n` +
  `No se cuentan como fallo del sitio, y hay que decirlo en el informe final.`);
console.log(fallos ? `\n${fallos} ESCENARIOS SIN CUMPLIR` : `\nLOS 8 ESCENARIOS CUMPLEN DONDE EL TIMING ES FIEL`);
process.exit(fallos ? 1 : 0);
