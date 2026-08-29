// focus-check — la via de entrada que nadie miraba: el TECLADO.
//
// POR QUE EXISTE. transicion-check enumera cinco entradas (rueda, trackpad
// vertical, tactil, ArrowRight, punto de navegacion) y exige que la transicion
// dure ~700 ms en todas. Tab no estaba en la lista. Medido en chromium sobre /:
// 14 tabulaciones llevaban de scrollLeft 0 a 4320 px en DOS eventos de scroll,
// o sea un teletransporte de tres paneles. Es exactamente el defecto que el
// dueno reporto en la ronda 4 —"lo hace tan rapido que pierdo toda la
// transicion"— pero en la unica via que quien navega con teclado o con lector
// de pantalla NO PUEDE EVITAR.
//
// Y de paso: no habia enlace para saltar al contenido (WCAG 2.4.1 Bypass
// Blocks). a11y-check recogia el campo `skip` y NO lo puntuaba —su predicado de
// la linea 136 no lo menciona—, asi que llevaba 38 paginas en cero y en verde.
// Es la tercera vez en este repo que aparece el mismo patron: medir e imprimir
// no es puntuar.
//
// Env: WK_SYSROOT, PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
// Uso:  node focus-check.mjs [--mutar]
//   --mutar  desactiva el enrutado del foco via page.route (sin tocar el repo)
//            para comprobar que esta compuerta sabe dar ROJO.

import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RAIZ = path.resolve(HERE, '../..');
const WK_RUN = path.join(HERE, 'wk_run.sh');
const MUTAR = process.argv.includes('--mutar');

// Umbrales, y por que valen lo que valen.
// U1 frames de transicion con Tab. Un teletransporte deja 1-2 eventos de
//    scroll; el deslizamiento propio dura 700 ms, que a 60 Hz son ~42 frames.
//    Se pide 6 como suelo MUY holgado: distingue "hubo transicion" de "salto",
//    que es lo unico que esta compuerta afirma, y aguanta un headless lento.
const MIN_FRAMES = 6;
// U2 duracion minima. Mismo razonamiento: 250 ms separa un salto de una
//    transicion sin comprometerse con el valor exacto de DUR_MS.
const MIN_MS = 250;

function wkDir() {
  const base = path.join(process.env.HOME, '.cache/ms-playwright');
  if (!existsSync(base)) return null;
  const d = readdirSync(base).filter((x) => /^webkit-\d+$/.test(x))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  return d.length ? path.join(base, d[0]) : null;
}
function optsFor(nombre) {
  if (nombre !== 'webkit') return {};
  const w = wkDir();
  if (process.env.WK_SYSROOT && existsSync(WK_RUN) && w) {
    process.env.WK_BROWSER_DIR = w;
    return { executablePath: WK_RUN };
  }
  return {};
}

const srv = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1',
  '--directory', RAIZ, '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => srv.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(+m[1]);
}));

// La mutacion NO edita el repo: intercepta script.js y castra el enrutado del
// foco. Asi la prueba de que la compuerta discrimina es reproducible por
// cualquiera con un flag, no una corrida a mano documentada en un informe.
const MUTACION = (js) => js.replace(
  "if (e.key === 'Tab') xAntesDeFoco = container.scrollLeft;",
  "if (e.key === 'Tab') xAntesDeFoco = -1;   /* MUTADO */");

let fallos = 0;
const filas = [];

for (const [nombre, motor] of [['chromium', chromium], ['webkit', webkit]]) {
  let br;
  try { br = await motor.launch({ headless: true, ...optsFor(nombre) }); }
  catch (err) { console.log(`  ${nombre}: no arranca (${String(err).slice(0, 70)})`); continue; }

  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  const page = await ctx.newPage();
  if (MUTAR) {
    await page.route('**/src/script.js', async (route) => {
      const res = await route.fetch();
      route.fulfill({ response: res, body: MUTACION(await res.text()) });
    });
  }
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);

  // --- 1. Enlace para saltar al contenido ---
  // Se enfoca y se ESPERA: el enlace entra con una transicion de 0.16 s, y
  // medirlo en el mismo tick lo pilla todavia fuera de pantalla. La primera
  // version de esta compuerta daba FALLA por eso, con el enlace perfectamente
  // bien puesto: un falso rojo del medidor, no del sitio.
  await page.evaluate(() => {
    const a = document.querySelector('.skip-link');
    window.__antes = a ? a.getBoundingClientRect().bottom : null;
    if (a) a.focus();
  });
  await page.waitForTimeout(400);
  const salto = await page.evaluate(() => {
    const a = document.querySelector('.skip-link');
    if (!a) return { hay: false };
    const antes = { bottom: window.__antes };
    const desp = a.getBoundingClientRect();
    return {
      hay: true,
      destinoExiste: !!document.querySelector(a.getAttribute('href')),
      // Escondido hasta enfocarlo, pero ALCANZABLE: si estuviera en display:none
      // o visibility:hidden saldria tambien del orden de tabulacion.
      ocultoAntes: antes.bottom <= 0,
      visibleAlEnfocar: desp.top >= 0 && desp.bottom <= innerHeight,
      enfocable: document.activeElement === a,
    };
  });
  const saltoOK = salto.hay && salto.destinoExiste && salto.ocultoAntes &&
                  salto.visibleAlEnfocar && salto.enfocable;

  // --- 2. Tab cruzando de panel: transicion, no salto ---
  await page.evaluate(() => {
    const c = document.getElementById('container');
    c.scrollTo({ left: 0, behavior: 'auto' });
    document.body.focus();
  });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const c = document.getElementById('container');
    window.__m = { n: 0, x0: c.scrollLeft, t0: 0, t1: 0, vistos: new Set() };
    window.__h = () => {
      const t = performance.now();
      if (!window.__m.t0) window.__m.t0 = t;
      window.__m.t1 = t;
      window.__m.n++;
      window.__m.vistos.add(Math.round(c.scrollLeft));
    };
    c.addEventListener('scroll', window.__h, { passive: true });
  });

  // Tabular hasta cruzar de panel por primera vez, con tope para no colgarse.
  let cruzo = false;
  for (let i = 0; i < 24 && !cruzo; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(70);
    cruzo = await page.evaluate(() =>
      document.getElementById('container').scrollLeft > 100);
  }
  await page.waitForTimeout(1200);

  const tab = await page.evaluate(() => {
    const c = document.getElementById('container');
    c.removeEventListener('scroll', window.__h);
    return {
      eventos: window.__m.n,
      posiciones: window.__m.vistos.size,
      ms: Math.round(window.__m.t1 - window.__m.t0),
      de: Math.round(window.__m.x0),
      a: Math.round(c.scrollLeft),
    };
  });

  // Control positivo: si el foco nunca cruzo de panel, esta fila NO habla del
  // sitio y no puede aprobarlo. Un cero aqui seria una sonda ciega, no un exito.
  const cruzoDeVerdad = cruzo && Math.abs(tab.a - tab.de) > 100;
  const tabOK = cruzoDeVerdad && tab.posiciones >= MIN_FRAMES && tab.ms >= MIN_MS;

  const bien = saltoOK && tabOK;
  if (!bien) fallos++;
  filas.push({ nombre, salto, saltoOK, tab, cruzoDeVerdad, tabOK });

  console.log(`--- ${nombre} ---`);
  console.log(`  saltar al contenido : ${salto.hay ? 'existe' : 'NO EXISTE'}` +
    (salto.hay ? `, destino ${salto.destinoExiste ? 'ok' : 'ROTO'}, oculto en reposo ${salto.ocultoAntes}, visible al enfocar ${salto.visibleAlEnfocar}` : '') +
    `   ${saltoOK ? 'OK' : 'FALLA'}`);
  console.log(`  Tab cruzando panel  : ${tab.de} -> ${tab.a} px en ${tab.ms} ms, ` +
    `${tab.posiciones} posiciones distintas de scroll (${tab.eventos} eventos)   ` +
    `${!cruzoDeVerdad ? 'NO CONCLUYENTE: el foco nunca cruzo de panel' : tabOK ? 'OK' : `FALLA: se pide >= ${MIN_FRAMES} posiciones y >= ${MIN_MS} ms`}`);

  await br.close();
}

srv.kill();
console.log('');
if (!filas.length) { console.log('NINGUN MOTOR ARRANCO — sin veredicto.'); process.exit(1); }
if (fallos) {
  console.log(`ROJO — ${fallos} motor(es) con el teclado roto.`);
  if (MUTAR) console.log('(era la corrida --mutar: este rojo es el ESPERADO, la compuerta discrimina)');
  process.exit(MUTAR ? 0 : 1);
}
if (MUTAR) {
  console.log('VERDE con la mutacion puesta: la compuerta NO discrimina, su verde no vale.');
  process.exit(1);
}
console.log('VERDE — hay enlace para saltar al contenido y Tab desliza en vez de teletransportar.');
