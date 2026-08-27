// selftest-transform.mjs — control POSITIVO de la metrica de aceptacion.
//
// probe.mjs afirma "el transform NO cambia con el scroll". Este archivo prueba
// que esa medicion SI es capaz de decir "cambia" cuando de verdad cambia.
// Si esto no da OK en un motor, el "false" de probe.mjs en ese motor no vale nada.
//
//   node selftest-transform.mjs
//
// Ademas aisla la causa del parallax congelado del sitio (variantes A..E).
import { chromium, firefox, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WK_RUN = path.join(HERE, 'wk_run.sh');
// --control=<dir> deja apuntar a un fixture MUTADO. Lo usa selfcheck.mjs para
// demostrar que este control positivo sabe dar rojo.
const CONTROL = (process.argv.find((a) => a.startsWith('--control=')) || '').slice(10) ||
  path.join(HERE, 'control');

function wkDir() {
  if (process.env.WK_BROWSER_DIR) return process.env.WK_BROWSER_DIR;
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME, '.cache', 'ms-playwright');
  if (!existsSync(b)) return null;
  const d = readdirSync(b).filter((x) => /^webkit-\d+$/.test(x)).sort((a, c) => Number(c.split('-')[1]) - Number(a.split('-')[1]));
  return d.length ? path.join(b, d[0]) : null;
}

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', CONTROL, '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => { const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1])); }));

const IDS = ['a', 'b', 'c', 'd', 'e', 'js'];
const LABEL = {
  a: 'A  LA FORMA DEL SITIO: overflow:hidden + scroll(inline nearest) + range',
  b: 'B  A sin overflow:hidden                        <- aisla la causa',
  c: 'C  A con timeline por nombre --sc               <- aisla el arreglo',
  d: 'D  A sin animation-range                        <- el rango NO era la causa',
  e: 'E  C sin animation-range',
  js: 'JS control: el JS escribe --prog en cada scroll',
};

let allOk = true;
for (const [name, type] of [['webkit', webkit], ['firefox', firefox], ['chromium', chromium]]) {
  const opts = {};
  if (name === 'webkit' && process.env.WK_SYSROOT && existsSync(WK_RUN)) {
    process.env.WK_BROWSER_DIR = wkDir();
    opts.executablePath = WK_RUN;
  }
  const b = await type.launch({ headless: true, ...opts });
  const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await p.waitForTimeout(300);
  const rd = () => p.evaluate((ids) => Object.fromEntries(ids.map((i) =>
    [i, getComputedStyle(document.querySelector('#' + i + ' .panel-bg img')).transform])), IDS);
  const before = await rd();
  await p.evaluate(() => { const c = document.getElementById('container'); c.scrollTo({ left: c.clientWidth * 1.5, behavior: 'auto' }); });
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.waitForTimeout(250);
  const after = await rd();
  const sup = await p.evaluate(() => CSS.supports('animation-timeline', 'scroll(inline nearest)'));

  const changed = Object.fromEntries(IDS.map((i) => [i, before[i] !== after[i]]));

  // Reglas del control.
  //
  // "A no cambia" NO sirve como prueba: es una aserción vacía. Si la regla #a se
  // pudre (un typo, un selector que deja de casar), el img se queda sin
  // animacion, lee siempre lo mismo, y "no cambia" se cumple igual. El control
  // habria pasado con el fixture roto.
  //
  // La aserción tiene que ser POSITIVA: A esta CLAVADA en el primer keyframe.
  // Se autocalibra contra B, que en reposo esta en progreso 0 -- o sea, en ese
  // mismo primer keyframe -- y comparte caja exacta con A. Asi no hay que
  // hardcodear ningun pixel ni depender del viewport.
  const clavadaEnFrom = (id) =>
    before[id] !== 'none' && before[id] === before.b && before[id] === after[id];
  const aClavada = clavadaEnFrom('a');
  const dClavada = clavadaEnFrom('d');   // quitar animation-range no descongela

  //  - el control JS debe cambiar SIEMPRE (si no, la medicion es ciega)
  //  - si el motor soporta scroll(): C y E cambian, A y D siguen clavadas
  const ok = changed.js && (!sup || (changed.c && changed.e && aClavada && dClavada));
  if (!ok) allOk = false;

  console.log(`\n=== ${name}  scroll-timeline=${sup} ===`);
  for (const i of IDS) console.log(`  ${LABEL[i].padEnd(62)} ${before[i]} -> ${after[i]}  cambia=${changed[i]}`);
  if (sup) console.log(`  A clavada en el primer keyframe = ${aClavada}   D clavada = ${dClavada}`);
  console.log(`  => ${ok ? 'OK: la metrica detecta cambio real' : 'FALLO: la metrica es ciega en este motor'}`);
  await b.close();
}
proc.kill();
console.log(allOk
  ? '\nSELFTEST OK — "el transform cambia" es medible y fiable en los tres motores.'
  : '\nSELFTEST FALLIDO — no confies en el resultado de probe.mjs.');
process.exit(allOk ? 0 : 1);
