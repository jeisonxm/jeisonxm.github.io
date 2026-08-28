// swipe-check.mjs — ¿el swipe horizontal de trackpad se comporta IGUAL en los
// dos sentidos?
//
// POR QUE EXISTE. El dueno, en su Mac con trackpad, reporto: "para la derecha
// perfecto, solo se medio traba cuando echo para la izquierda". Eso no es un
// fallo funcional — el sitio navega — es una ASIMETRIA POR DIRECCION. Ninguna
// de las puertas existentes la puede ver:
//
//   - gestures-check.mjs despacha WheelEvent SINTETICOS dentro de la pagina.
//     Un evento no confiable NO mueve el scroll nativo, y la REGLA 1 de
//     script.js:175 dice literalmente que el gesto horizontal lo resuelve el
//     scroll NATIVO. O sea: gestures-check mide la maquina de estados y es
//     CIEGO al unico camino que el dueno usa. Lo dice su propio comentario de
//     cabecera ("LIMITE HONESTO").
//   - layout-check, depth-check y render-check posicionan con scrollTo({
//     behavior:'auto' }). Eso no es un gesto: no hay inercia, no hay snap en
//     vuelo, no hay carrera contra el temporizador de 140 ms.
//   - ninguna corre el MISMO gesto en los dos sentidos y compara.
//
// Aqui se inyecta input REAL (CDP en chromium, page.mouse.wheel en el resto),
// que es lo unico que dispara el scroll nativo, y se mide lo mismo hacia la
// derecha y hacia la izquierda. La hipotesis que se quiere falsar o confirmar
// es que el sitio se mete a mitad de un gesto que juro no tocar: un scrollTo
// programatico durante un scroll que el usuario esta haciendo con los dedos ES
// el tiron, por definicion.
//
// Uso:
//   node swipe-check.mjs
//   node swipe-check.mjs --engines=chromium --json
//   node swipe-check.mjs --mutar=izquierda    <- prueba de mutacion (debe dar ROJO)
//   node swipe-check.mjs --mutar=simetrico    <- pelea en los dos sentidos
//
// Env: WK_SYSROOT, PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
// webkit primero: es el proxy mas cercano a Safari y el dueno esta en un Mac.
const ENGINES = String(argv.engines || 'webkit,chromium').split(',').map((s) => s.trim()).filter(Boolean);
const REPES = Number(argv.repes || 3);
const MUTAR = argv.mutar ? String(argv.mutar) : null;
const VIEWPORT = { width: 1440, height: 900 };
// src/lang.js redirige / a /en/ cuando navigator.language empieza por 'en'.
// El locale por defecto de Playwright es en-US: sin esto se mediria otra pagina.
const LOCALE = 'es-ES';

// ---------- umbrales, y por que valen lo que valen ----------
//
// U1  ms-hasta-quieto. 35 % de diferencia entre sentidos. Justificacion: un
//     frame a 60 Hz son 16.7 ms y un gesto completo dura ~700-900 ms, o sea que
//     35 % son ~250 ms = 15 frames. Nadie percibe 1 frame de diferencia; 15 es
//     exactamente lo que se siente como "se medio traba". Por debajo de eso la
//     diferencia se la puede comer el ruido del planificador de Linux.
//
//     PERO NO GOBIERNA. El razonamiento de arriba solo vale si la medicion es
//     de bajo ruido, y AQUI NO LO ES. Medido con gestos controlados de un solo
//     panel, 5 repeticiones, los cuatro pares adyacentes en los dos sentidos en
//     webkit: 2348 / 1192 / 511 / 627 ms hacia la derecha y 593 / 564 / 1491 /
//     1641 hacia la izquierda. Dentro de UN MISMO sentido la dispersion es de
//     4.6x, y la lentitud sigue al par de paneles, no al sentido; entre
//     corridas del arnes el signo de la diferencia se invierte. Con ese ruido
//     un umbral del 35 % da rojo sobre nada, y una compuerta que da rojo sobre
//     ruido deja de significar algo. Se mide, se imprime y se comenta, pero no
//     tumba la corrida. Lo que si gobierna es lo determinista: scrollTo dentro
//     de un gesto nativo, tirones diferidos, devoluciones y retrocesos, que
//     salieron 3/3 identicos.
//     Para volver a ascenderlo a compuerta hace falta un inyector con las FASES
//     de macOS (began/changed/ended/momentum), que ni CDP ni page.mouse.wheel
//     exponen desde Linux.
const U_MS = 0.35;
const U_MS_GOBIERNA = false;
// U2  retrocesos de scrollLeft. NO es cualquier cambio de signo en la derivada
//     (eso, con scroll-snap mandatory, daba ~100 por gesto perfecto). Es un
//     TRAMO de movimiento contrario al gesto, de al menos MIN_RET px, ocurrido
//     ANTES de que el scroll alcanzase su punto mas lejano — o sea, mientras el
//     usuario o su inercia todavia empujaban. Lo que pase despues del pico es
//     el snap nativo recolocando y se contabiliza aparte (`snapback`).
//     Umbral asimetrico duro: si un sentido tiene >=1 y el otro 0, es asimetria.
const U_RETROCESO = 1;
// U3  scrollTo programatico DURANTE un gesto nativo. Cero tolerancia. La regla
//     1 promete "CERO intervencion"; cualquier valor > 0 la desmiente y es la
//     causa mecanica del tiron, con o sin asimetria.
const U_SCROLLTO = 0;
// U4  panel de aterrizaje. El mismo gesto en sentidos opuestos desde el panel
//     central tiene que recorrer el MISMO numero de paneles.
const U_PANELES = 0;

// --- perfil de gesto de trackpad de macOS, horizontal ---
//
// Fase activa: ~120 ms subiendo hasta el pico, con magnitudes FRACCIONARIAS
// (macOS entrega deltas continuos, no notches enteros). Despues, la cola de
// inercia: decaimiento MONOTONO durante ~700 ms. El decaimiento monotono es la
// firma fisica de la inercia y es lo que script.js:204-210 dice detectar.
const GAP_ACTIVA = 15;
const GAP_COLA = 16;
const ESCALA = 1.45;
const FASE_ACTIVA = [3.71, 11.24, 24.93, 43.68, 62.17, 78.42, 88.96, 92.31].map((v) => +(v * ESCALA).toFixed(2));
const COLA = [];
for (let i = 1; i <= 48; i++) {
  const v = +(88.0 * ESCALA * Math.pow(0.905, i)).toFixed(2);
  if (v < 0.3) break;
  COLA.push(v);
}
// Un swipe de dos dedos NUNCA es geometricamente puro: la mano describe un arco
// y deja una componente vertical. Se mantiene al 5 % para que |dx| > |dy| siga
// siendo cierto en TODOS los eventos y el gesto caiga entero en la REGLA 1 —
// que es el caso que el dueno vive. La componente es IDENTICA en los dos
// sentidos a proposito: si se sesgara, la asimetria la habria metido el arnes.
const JITTER_Y = 0.05;

function perfil(signo) {
  const out = [];
  FASE_ACTIVA.forEach((m, i) => out.push({ dx: signo * m, dy: m * JITTER_Y, gap: i ? GAP_ACTIVA : 0 }));
  COLA.forEach((m) => out.push({ dx: signo * m, dy: m * JITTER_Y, gap: GAP_COLA }));
  return out;
}
const TOTAL_PX = FASE_ACTIVA.concat(COLA).reduce((a, b) => a + b, 0);

// ---------- lanzadores (copiado de render-check.mjs / gestures-check.mjs) ----------
function wkDir() {
  if (process.env.WK_BROWSER_DIR) return process.env.WK_BROWSER_DIR;
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME, '.cache', 'ms-playwright');
  if (!existsSync(b)) return null;
  const d = readdirSync(b).filter((x) => /^webkit-\d+$/.test(x))
    .sort((a, c) => Number(c.split('-')[1]) - Number(a.split('-')[1]));
  return d.length ? path.join(b, d[0]) : null;
}
function launcher(n) {
  if (n === 'chromium') return { type: chromium, opts: {} };
  if (n === 'firefox') return { type: firefox, opts: {} };
  if (n !== 'webkit') throw new Error('motor desconocido: ' + n);
  const opts = {}, w = wkDir(), r = path.join(HERE, 'wk_run.sh');
  if (process.env.WK_SYSROOT && existsSync(r) && w) { process.env.WK_BROWSER_DIR = w; opts.executablePath = r; }
  return { type: webkit, opts };
}

// ---------- instrumentacion, inyectada ANTES de que cargue script.js ----------
//
// Envolver Element.prototype.scrollTo y el setter de scrollLeft es la unica
// forma de ver a script.js meter mano: sus variables (`programatico`, `target`,
// `reintentos`) viven dentro de un IIFE y no son alcanzables desde fuera. La
// llamada SI lo es, y con la pila se sabe quien la hizo.
function instrumentacion(mutar) {
  return `(() => {
  const H = {
    llamadas: [],      // {t, left, behavior, via, pila}
    ruedas: [],        // {t, dx, dy, regla, prevenido}
    silencio: false,   // true mientras el ARNES coloca la pagina: no contar
    traza: null,
  };
  window.__H = H;
  const marca = () => performance.now();

  const anota = (via, left, behavior) => {
    if (H.silencio) return;
    let pila = '';
    try { pila = (new Error()).stack.split('\\n').slice(2, 5).join(' | '); } catch (e) {}
    H.llamadas.push({ t: marca(), left, behavior: behavior || 'auto', via, pila });
  };

  const P = Element.prototype;
  for (const nombre of ['scrollTo', 'scroll', 'scrollBy']) {
    const orig = P[nombre];
    if (typeof orig !== 'function') continue;
    P[nombre] = function (a, b) {
      if (this.id === 'container') {
        const o = (a && typeof a === 'object') ? a : { left: a, behavior: 'auto' };
        anota(nombre, o.left, o.behavior);
      }
      return orig.apply(this, arguments);
    };
  }
  const d = Object.getOwnPropertyDescriptor(P, 'scrollLeft');
  if (d && d.set) {
    Object.defineProperty(P, 'scrollLeft', {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { if (this.id === 'container') anota('scrollLeft=', v, 'auto'); return d.set.call(this, v); },
    });
  }

  // Espia de rueda. Se engancha en WINDOW y en fase de burbuja: asi corre
  // DESPUES del listener de #container y ve el defaultPrevented definitivo.
  addEventListener('wheel', (e) => {
    if (H.silencio) return;
    const ax = Math.abs(e.deltaX), ay = Math.abs(e.deltaY);
    // Misma clasificacion que script.js:167-197, para poder contar cuantos
    // eventos del gesto se escapan de la REGLA 1.
    let regla = 3;
    if (e.ctrlKey) regla = 0;
    else if (ax > ay) regla = 1;
    else if (e.deltaY === 0) regla = 0;
    else if (e.deltaMode !== 0 || (ay >= 90 && ay % 1 === 0)) regla = 2;
    H.ruedas.push({ t: marca(), dx: e.deltaX, dy: e.deltaY, regla, prevenido: e.defaultPrevented });
  }, { passive: true, capture: false });

  // --- muestreo de scrollLeft, un punto por frame ---
  const c = () => document.getElementById('container');
  H.arrancarTraza = () => {
    const el = c();
    H.traza = { t0: marca(), pts: [], parar: false };
    const paso = () => {
      if (!H.traza || H.traza.parar) return;
      H.traza.pts.push({ t: marca(), x: el.scrollLeft });
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  };
  // Espera a que el scroll este QUIETO de verdad (8 frames con el mismo valor)
  // antes de devolver. Un timeout fijo mediria el reloj del arnes, no el sitio.
  H.pararTraza = async (maxMs) => {
    const el = c();
    const lim = marca() + (maxMs || 6000);
    let ult = NaN, quietos = 0;
    while (marca() < lim) {
      await new Promise((r) => requestAnimationFrame(r));
      const x = el.scrollLeft;
      if (x === ult) { if (++quietos >= 8) break; } else { quietos = 0; ult = x; }
    }
    H.traza.parar = true;
    const pts = H.traza.pts.slice();
    const t0 = H.traza.t0;
    H.traza = null;
    return { t0, pts, llamadas: H.llamadas.slice(), ruedas: H.ruedas.slice(),
             maxScroll: el.scrollWidth - el.clientWidth, clientWidth: el.clientWidth,
             offsets: [].slice.call(el.querySelectorAll('.panel')).map((p) => p.offsetLeft),
             final: el.scrollLeft, agotado: marca() >= lim };
  };
  H.reset = () => { H.llamadas.length = 0; H.ruedas.length = 0; };

  ${mutar ? `
  // ===== MUTACION DELIBERADA (--mutar=${mutar}) =====
  // Emula justo el defecto que se persigue: alguien llamando a scrollTo en
  // contra del usuario a mitad de gesto. Si el arnes no da ROJO con esto
  // puesto, su verde no significa nada.
  addEventListener('DOMContentLoaded', () => {
    const el = c(); if (!el) return;
    let prev = el.scrollLeft, ultimo = 0;
    el.addEventListener('scroll', () => {
      const x = el.scrollLeft, dx = x - prev; prev = x;
      const t = marca();
      if (t - ultimo < 90) return;
      const izquierda = dx < -0.5, derecha = dx > 0.5;
      const pelear = ${mutar === 'simetrico' ? '(izquierda || derecha)' : 'izquierda'};
      if (!pelear) return;
      ultimo = t;
      el.scrollTo({ left: x + (dx < 0 ? 45 : -45), behavior: 'smooth' });
    }, { passive: true });
  });
  ` : ''}
})();`;
}

// ---------- inyeccion de rueda REAL ----------
// Un WheelEvent construido con `new WheelEvent(...)` NO es confiable y NO mueve
// el scroll nativo. Como la REGLA 1 delega justamente en el scroll nativo, la
// unica via valida es input real: CDP en chromium, page.mouse.wheel en el resto.
async function abrirInyector(page, eng, ctx) {
  if (eng === 'chromium') {
    const cdp = await ctx.newCDPSession(page);
    return {
      fiel: 'alta',
      nota: 'CDP Input.dispatchMouseEvent(mouseWheel). Sin fases: el protocolo no expone phase/momentumPhase, la cola de inercia se sintetiza como eventos sueltos que decaen.',
      wheel: (dx, dy) => cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: VIEWPORT.width / 2, y: VIEWPORT.height / 2,
        deltaX: dx, deltaY: dy, modifiers: 0, pointerType: 'mouse',
      }),
      cerrar: () => cdp.detach().catch(() => {}),
    };
  }
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  return {
    fiel: 'media',
    nota: 'page.mouse.wheel: ida y vuelta por protocolo por cada evento. La cadencia real se mide y se reporta; si se va por encima de 120 ms el gesto deja de ser un gesto.',
    wheel: (dx, dy) => page.mouse.wheel(dx, dy),
    cerrar: async () => {},
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function colocar(page, idx) {
  await page.evaluate((i) => {
    const c = document.getElementById('container');
    window.__H.silencio = true;
    const p = c.querySelectorAll('.panel')[i];
    c.scrollTo({ left: p.offsetLeft, behavior: 'auto' });
  }, idx);
  await page.waitForTimeout(450);
  await page.evaluate(() => { window.__H.silencio = false; window.__H.reset(); });
}

// ---------- metricas sobre la traza ----------
//
// Un "retroceso" NO es cualquier cambio de signo en la derivada: con
// scroll-snap-type: x mandatory el scroll oscila sub-pixel al asentar, y contar
// eso daria 100 retrocesos en un gesto perfecto. Lo que se busca es lo que el
// dueno SIENTE: un tramo en el que el contenido se fue hacia donde el no
// empujaba, de una magnitud visible. Se agrupan los puntos en TRAMOS de signo
// constante y solo cuentan los tramos contra el sentido del gesto de >= MIN_RET px.
// px. Calibrado contra los dos extremos MEDIDOS, no a ojo:
//   - suelo de ruido: en gestos limpios de 1700 px aparecen tramos en contra de
//     10-14 px (jitter de sub-pixel del snap). 24 px deja 1,7x de margen.
//   - senal: la prueba de mutacion (--mutar=izquierda) produce tramos de
//     288-717 px. 24 px deja 12x de margen por arriba.
// Sobre un panel de 1440 px, 24 px es el 1,7 %: por debajo de eso nadie percibe
// un tiron, y por encima el arnes todavia caza la mutacion con 12x de holgura.
const MIN_RET = 24;

function analizar(raw, t0Gesto, signo) {
  const { pts, llamadas, ruedas, maxScroll, offsets, final, clientWidth } = raw;
  const utiles = pts.filter((p) => p.t >= t0Gesto - 5);
  let ultimoCambio = t0Gesto, prev = utiles.length ? utiles[0].x : final;
  let fuera = 0, minX = Infinity, maxX = -Infinity;
  // tramos de signo constante
  const tramos = []; let cur = null;
  for (const p of utiles) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    if (p.x < -0.5 || p.x > maxScroll + 0.5) fuera++;
    const d = p.x - prev;
    if (Math.abs(d) < 0.5) continue;
    const s = d > 0 ? 1 : -1;
    if (!cur || cur.s !== s) { cur = { s, px: 0, t0: p.t }; tramos.push(cur); }
    cur.px += Math.abs(d);
    ultimoCambio = p.t;
    prev = p.x;
  }
  // Instante del PICO: el punto mas lejano al que llego el gesto en su sentido.
  // Antes del pico el usuario (o su inercia) todavia empuja: un tramo en contra
  // ahi es un TIRON. Despues del pico, un tramo en contra es el snap nativo
  // recolocando, que es lo que se le pide al navegador y no es un defecto.
  let tPico = t0Gesto, xPico = utiles.length ? utiles[0].x : final, x0 = xPico;
  for (const p of utiles) {
    if (signo > 0 ? p.x > xPico : p.x < xPico) { xPico = p.x; tPico = p.t; }
  }
  const pico = Math.round(Math.abs(xPico - x0));
  const contra = tramos.filter((t) => t.s !== signo && t.px >= MIN_RET);
  const antesDelPico = contra.filter((t) => t.t0 <= tPico);
  const retrocesos = antesDelPico.length;
  const retrocesoPx = Math.round(antesDelPico.reduce((a, t) => a + t.px, 0));
  const snapback = Math.round(contra.filter((t) => t.t0 > tPico).reduce((a, t) => a + t.px, 0));
  // El gesto acaba cuando el usuario suelta y la fisica se apaga. Solo cuentan
  // las llamadas a scrollTo que caen DENTRO de la ventana en la que el scroll
  // todavia se movia: eso es "el sitio empujando mientras el usuario empuja".
  const durante = llamadas.filter((l) => l.t >= t0Gesto && l.t <= ultimoCambio + 20);
  const despues = llamadas.filter((l) => l.t > ultimoCambio + 20);
  const gaps = ruedas.slice(1).map((r, i) => r.t - ruedas[i].t).sort((a, b) => a - b);
  const panel = offsets.length ? offsets.reduce((mejor, o, i) =>
    Math.abs(o - final) < Math.abs(offsets[mejor] - final) ? i : mejor, 0) : -1;
  return {
    panel, final: Math.round(final), maxScroll,
    msQuieto: Math.round(ultimoCambio - t0Gesto),
    frames: utiles.length,
    retrocesos, retrocesoPx, snapback, pico, fuera,
    minX: Math.round(minX), maxX: Math.round(maxX),
    scrollToDurante: durante.length,
    scrollToDespues: despues.length,
    pilas: durante.slice(0, 2).map((l) => `left=${Math.round(l.left)} ${l.behavior}`),
    // Todas las llamadas del episodio, con el instante RELATIVO al primer evento
    // de rueda. Es la prueba directa: "el sitio llamo a scrollTo a los N ms de
    // que el usuario empezara a mover los dedos".
    detalle: llamadas.map((l) => ({ ms: Math.round(l.t - t0Gesto), left: Math.round(l.left),
                                    behavior: l.behavior, via: l.via, pila: l.pila })),
    ruedas: ruedas.length,
    regla3: ruedas.filter((r) => r.regla === 3).length,
    prevenidos: ruedas.filter((r) => r.prevenido).length,
    gapMediano: gaps.length ? +gaps[gaps.length >> 1].toFixed(1) : 0,
    gapMax: gaps.length ? +gaps[gaps.length - 1].toFixed(1) : 0,
    clientWidth,
    agotado: raw.agotado,
  };
}

async function unGesto(page, iny, signo, desde) {
  await colocar(page, desde);
  await page.evaluate(() => window.__H.arrancarTraza());
  const pasos = perfil(signo);
  const t0 = Date.now();
  let acumulado = 0;
  const marcaGesto = await page.evaluate(() => performance.now());
  const enVuelo = [];
  for (const p of pasos) {
    acumulado += p.gap;
    const espera = acumulado - (Date.now() - t0);
    if (espera > 1) await dormir(espera);
    // NO se espera la respuesta: el orden lo garantiza el propio websocket, y
    // esperarla metia ~150 ms de latencia POR EVENTO, o sea un gesto de 9 s.
    enVuelo.push(Promise.resolve(iny.wheel(p.dx, p.dy)).catch(() => {}));
  }
  await Promise.all(enVuelo);
  const raw = await page.evaluate(() => window.__H.pararTraza(6000));
  const a = analizar(raw, marcaGesto, signo);
  await agregarReposo(page, a);
  return a;
}

// Segunda lectura, 1,1 s despues de que la traza se declare quieta: cubre el
// temporizador de 140 ms de script.js:394 mas el scrollTo suave que dispara
// alDetenerse. Si `panel` y `panelReposo` no coinciden, el sitio movio al
// usuario DESPUES de que el gesto acabara. Eso es un tiron diferido.
async function agregarReposo(page, a) {
  await dormir(1100);
  const r = await page.evaluate(() => {
    const c = document.getElementById('container');
    const ps = [].slice.call(c.querySelectorAll('.panel'));
    const x = c.scrollLeft;
    let mejor = 0;
    ps.forEach((p, i) => { if (Math.abs(p.offsetLeft - x) < Math.abs(ps[mejor].offsetLeft - x)) mejor = i; });
    return { x: Math.round(x), panel: mejor, llamadas: window.__H.llamadas.length };
  });
  a.finalReposo = r.x; a.panelReposo = r.panel;
  a.tironDiferido = r.panel !== a.panel ? 1 : 0;
  return a;
}

const mediana = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const medObj = (rs, k) => mediana(rs.map((r) => r[k]));

// ---------- servidor ----------
const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1])); }));

console.log(`swipe-check — asimetria direccional del swipe horizontal`);
console.log(`gesto: ${FASE_ACTIVA.length} eventos activos @${GAP_ACTIVA}ms (${(FASE_ACTIVA.length * GAP_ACTIVA)}ms) + ${COLA.length} de inercia @${GAP_COLA}ms (${COLA.length * GAP_COLA}ms), desplazamiento total ${TOTAL_PX.toFixed(0)}px, jitter vertical ${JITTER_Y * 100}%`);
if (MUTAR) console.log(`*** MUTACION ACTIVA: --mutar=${MUTAR} — el arnes DEBE dar rojo ***`);
console.log('');

const salida = { gesto: { activa: FASE_ACTIVA, cola: COLA, totalPx: TOTAL_PX }, mutar: MUTAR, motores: {} };
let fallos = [];

for (const eng of ENGINES) {
  let browser;
  try {
    const { type, opts } = launcher(eng);
    browser = await type.launch({ headless: true, ...opts });
  } catch (e) {
    console.log(`=== ${eng} === NO ARRANCA: ${e.message.split('\n')[0]}`);
    salida.motores[eng] = { error: e.message.split('\n')[0] };
    continue;
  }
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: LOCALE });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(instrumentacion(MUTAR));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(900);

  const iny = await abrirInyector(page, eng, ctx);

  // --- 0. geometria: barata, y falsa o confirma tres lentes de un golpe ---
  const geo = await page.evaluate(() => {
    const c = document.getElementById('container');
    const ps = [].slice.call(c.querySelectorAll('.panel'));
    return {
      clientWidth: c.clientWidth, scrollWidth: c.scrollWidth,
      maxScroll: c.scrollWidth - c.clientWidth,
      offsets: ps.map((p) => p.offsetLeft),
      anchos: ps.map((p) => p.offsetWidth),
      // .panel es overflow:hidden -> es CAJA DE SCROLL. Si sus hijos desbordan,
      // gana recorrido propio y puede robarle la rueda al contenedor.
      recorridoPanel: ps.map((p) => p.scrollWidth - p.clientWidth),
      overscrollRaiz: getComputedStyle(document.documentElement).overscrollBehaviorX,
      overscrollCont: getComputedStyle(c).overscrollBehaviorX,
      anidados: [].slice.call(c.querySelectorAll('*')).filter((e) => {
        const cs = getComputedStyle(e);
        return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') ||
               (cs.overflowX === 'auto' || cs.overflowX === 'scroll');
      }).map((e) => ({
        n: (e.className && String(e.className).trim()) ? '.' + String(e.className).trim().split(/\s+/)[0] : e.tagName.toLowerCase(),
        ox: getComputedStyle(e).overflowX, oy: getComputedStyle(e).overflowY,
        ob: getComputedStyle(e).overscrollBehaviorX,
        recorreY: e.scrollHeight - e.clientHeight, recorreX: e.scrollWidth - e.clientWidth,
      })),
      soportaScrollend: 'onscrollend' in document,
    };
  });

  // Barrido de geometria por viewport. Es barato y cierra tres lentes de un
  // golpe: (a) si offsetLeft no es multiplo exacto de clientWidth, el
  // Math.round de alDetenerse:245 redondea mal y lo hace de forma asimetrica;
  // (b) si .panel gana recorrido horizontal propio (es overflow:hidden, o sea
  // CAJA DE SCROLL) puede robarle la rueda al contenedor; (c) si .about-content
  // desborda en vertical, nestedScrollerWantsIt (script.js:140) le regala la
  // rueda y solo en UNA direccion de dy. Nada de esto se ve a un solo tamano.
  const VIEWPORTS = [
    { n: 'MacBook Air 13', w: 1440, h: 812 },
    { n: 'MacBook Pro 16', w: 1728, h: 950 },
    { n: 'ventana baja',   w: 1280, h: 610 },
  ];
  const barrido = [];
  for (const v of VIEWPORTS) {
    const c2 = await browser.newContext({ viewport: { width: v.w, height: v.h }, locale: LOCALE });
    const p2 = await c2.newPage();
    await p2.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 45000 });
    await p2.waitForTimeout(700);
    barrido.push({ v: v.n, ...(await p2.evaluate(() => {
      const c = document.getElementById('container');
      const ps = [].slice.call(c.querySelectorAll('.panel'));
      const ac = document.querySelector('.about-content');
      return {
        cw: c.clientWidth,
        multiplos: ps.every((p, i) => Math.abs(p.offsetLeft - i * c.clientWidth) < 0.5),
        recorridoPanel: ps.map((p) => p.scrollWidth - p.clientWidth),
        aboutDesborda: ac ? (ac.scrollHeight - ac.clientHeight) : null,
        contentDesborda: [].slice.call(document.querySelectorAll('.panel-content'))
          .map((e) => e.scrollHeight - e.clientHeight),
      };
    })) });
    await c2.close();
  }

  console.log(`=== ${eng} ===`);
  console.log(`  inyeccion: ${iny.fiel} — ${iny.nota}`);
  console.log(`  geometria: clientWidth=${geo.clientWidth} maxScroll=${geo.maxScroll} offsets=[${geo.offsets.join(', ')}]`);
  console.log(`             offset/clientWidth=[${geo.offsets.map((o) => (o / geo.clientWidth).toFixed(3)).join(', ')}]  (si no son 0,1,2,3,4 exactos, Math.round de alDetenerse:245 miente)`);
  console.log(`             recorrido horizontal propio de cada .panel=[${geo.recorridoPanel.join(', ')}]  (>0 = el panel es un scroller que puede robar la rueda)`);
  console.log(`             overscroll-behavior-x: html=${geo.overscrollRaiz} #container=${geo.overscrollCont}   onscrollend=${geo.soportaScrollend}`);
  for (const b of barrido) {
    console.log(`             [${b.v.padEnd(14)} ${b.cw}px] offsets multiplos exactos: ${b.multiplos ? 'si' : 'NO'} | recorrido .panel=[${b.recorridoPanel.join(',')}] | .about-content desborda ${b.aboutDesborda}px | .panel-content desborda [${b.contentDesborda.join(',')}]`);
  }
  for (const a of geo.anidados) {
    console.log(`             anidado ${a.n.padEnd(18)} overflow ${a.ox}/${a.oy} overscroll-x=${a.ob} recorrido ${a.recorreX}x${a.recorreY}`);
  }

  // --- 1-3. el MISMO gesto en los dos sentidos, desde el panel central ---
  const DESDE = 2;
  const res = { derecha: [], izquierda: [] };
  for (let k = 0; k < REPES; k++) {
    res.derecha.push(await unGesto(page, iny, +1, DESDE));
    res.izquierda.push(await unGesto(page, iny, -1, DESDE));
  }

  const med = {};
  for (const s of ['derecha', 'izquierda']) {
    const rs = res[s];
    med[s] = {
      panel: mediana(rs.map((r) => r.panel)),
      panelReposo: mediana(rs.map((r) => r.panelReposo)),
      tironDiferido: rs.reduce((a, r) => a + r.tironDiferido, 0),
      final: medObj(rs, 'final'),
      msQuieto: medObj(rs, 'msQuieto'),
      frames: medObj(rs, 'frames'),
      retrocesos: medObj(rs, 'retrocesos'),
      retrocesoPx: medObj(rs, 'retrocesoPx'),
      snapback: medObj(rs, 'snapback'),
      pico: medObj(rs, 'pico'),
      fuera: medObj(rs, 'fuera'),
      scrollToDurante: medObj(rs, 'scrollToDurante'),
      scrollToDespues: medObj(rs, 'scrollToDespues'),
      ruedas: medObj(rs, 'ruedas'),
      regla3: medObj(rs, 'regla3'),
      prevenidos: medObj(rs, 'prevenidos'),
      gapMediano: medObj(rs, 'gapMediano'),
      gapMax: medObj(rs, 'gapMax'),
      pilas: rs.flatMap((r) => r.pilas).slice(0, 2),
      crudo: rs.map((r) => ({ panel: r.panel, ms: r.msQuieto, ret: r.retrocesos, px: r.retrocesoPx, pico: r.pico, sT: r.scrollToDurante })),
    };
  }

  console.log('');
  console.log(`  gesto desde el panel ${DESDE}, mediana de ${REPES} corridas`);
  console.log('  sentido    panel  reposo  scrollLeft  pico-px  ms-quieto  frames  retroc  retro-px  snapback  fuera  scrollTo/gesto  scrollTo/despues  ev  regla3  prevenidos  gap-med  gap-max');
  for (const s of ['derecha', 'izquierda']) {
    const m = med[s];
    console.log(`  ${s.padEnd(10)} ${String(DESDE + '->' + m.panel).padEnd(6)} ${String(m.panelReposo).padStart(6)} ${String(m.final).padStart(10)} ${String(m.pico).padStart(8)} ${String(m.msQuieto).padStart(10)} ${String(m.frames).padStart(7)} ${String(m.retrocesos).padStart(7)} ${String(m.retrocesoPx).padStart(9)} ${String(m.snapback).padStart(9)} ${String(m.fuera).padStart(6)} ${String(m.scrollToDurante).padStart(15)} ${String(m.scrollToDespues).padStart(17)} ${String(m.ruedas).padStart(3)} ${String(m.regla3).padStart(7)} ${String(m.prevenidos).padStart(11)} ${String(m.gapMediano).padStart(8)} ${String(m.gapMax).padStart(8)}`);
  }
  for (const s of ['derecha', 'izquierda']) {
    console.log(`    ${s} crudo: ` + med[s].crudo.map((c) => `p${c.panel}/pico${c.pico}/${c.ms}ms/ret${c.ret}(${c.px}px)/sT${c.sT}`).join('  '));
    if (med[s].pilas.length) console.log(`    ${s} scrollTo durante el gesto: ${med[s].pilas.join(' ; ')}`);
  }

  // Fidelidad. Tres cosas distintas que antes se mezclaban en un solo aviso:
  //  (a) FUERZA: si el gesto no llega al punto medio de decision del snap, la
  //      fila no dice nada del sitio, dice que el gesto era flojo.
  //  (b) COALESCENCIA: el motor junta varios wheel en uno. Es lo que hace un
  //      navegador real con un trackpad real, asi que no invalida nada; solo
  //      infla el hueco medido. Se informa siempre, con el ratio.
  //  (c) SEGMENTACION: IDLE_MS=120 (script.js:108) solo parte gestos DENTRO de
  //      la REGLA 3. Si ningun evento cayo ahi, ese umbral no toca este gesto y
  //      un hueco de 160 ms no lo invalida. Avisar en ese caso era gritar.
  const flojos = ['derecha', 'izquierda'].filter((s) => med[s].pico < geo.clientWidth * 0.55);
  if (flojos.length) console.log(`  AVISO: en ${flojos.join(' y ')} el gesto solo alcanzo un pico de ${flojos.map((s) => med[s].pico + 'px').join('/')} sobre un panel de ${geo.clientWidth}px: no llega al punto medio de decision del snap y la fila no habla del sitio.`);
  // El fallo simetrico del anterior. Un gesto que se estampa contra el tope no
  // puede distinguir "fino" de "trabado": los dos aterrizan en el mismo sitio,
  // el borde. Medido en webkit: pico 2880 px = exactamente 2 paneles, o sea que
  // el swipe se comio todo el recorrido disponible en los dos sentidos y la
  // comparacion es entre dos saturaciones, no entre dos gestos.
  const saturados = ['derecha', 'izquierda'].filter((s) =>
    med[s].final <= 1 || med[s].final >= geo.maxScroll - 1 || med[s].pico >= geo.clientWidth * 1.9);
  if (saturados.length) {
    console.log(`  AVISO DE SATURACION: en ${saturados.join(' y ')} el gesto llego hasta el TOPE del scroller (pico ${saturados.map((s) => med[s].pico + 'px').join('/')} sobre paneles de ${geo.clientWidth}px, aterrizaje ${saturados.map((s) => med[s].final).join('/')} sobre un recorrido de ${geo.maxScroll}px).`);
    console.log(`  Contra el tope los dos sentidos aterrizan en el mismo sitio pase lo que pase: esta fila NO puede detectar asimetria. Este inyector entrega ${med.derecha.ruedas}/${FASE_ACTIVA.length + COLA.length} eventos sin amortiguar la inercia, asi que aplica cada delta entero.`);
  }
  const enviados = FASE_ACTIVA.length + COLA.length;
  console.log(`  coalescencia: entregados der ${med.derecha.ruedas}/${enviados}, izq ${med.izquierda.ruedas}/${enviados} eventos. Es el motor juntando wheel, igual que con un trackpad real; por eso el hueco mediano sube por encima de los ${GAP_COLA} ms pedidos.`);
  const infiel = ['derecha', 'izquierda'].filter((s) => med[s].gapMax > 120 && med[s].regla3 > 0);
  if (infiel.length) {
    console.log(`  AVISO DE FIDELIDAD: en ${infiel.join(' y ')} hay eventos en la REGLA 3 y el hueco maximo supera IDLE_MS=120 ms (${infiel.map((s) => med[s].gapMax + 'ms').join(', ')}).`);
    console.log(`  Ahi el gesto SI se parte en dos y el resultado dice mas del inyector que del sitio.`);
  }

  // --- 4. secuencias envenenadas ---
  // A) BORDE: en un extremo, una accion programatica que NO mueve nada.
  //    goToIndex (script.js:62) clampa, asi que container.scrollTo pide la
  //    posicion en la que YA se esta -> no hay evento 'scroll' -> el
  //    setTimeout de 140 ms (script.js:394) nunca se arma -> alDetenerse nunca
  //    corre -> `programatico` (script.js:118) se queda en true para siempre.
  //    El siguiente swipe NATIVO si dispara 'scroll', y entonces alDetenerse
  //    corre con programatico=true y cerca!==target: linea 263, goToIndex(target),
  //    devuelve al usuario. Eso es el tiron.
  // B) EN VUELO: accion programatica normal y swipe contrario antes de asentar.
  const veneno = [];
  const casos = [
    // Controles. Sin ellos, "se queda en el panel 4" no distingue entre "el
    // sitio lo devolvio" y "el gesto nunca tuvo fuerza para salir de ahi".
    { n: 'CONTROL sin tecla @4 swipe izq', desde: 4, tecla: null, espera: 300, signo: -1, esperado: 3 },
    { n: 'CONTROL sin tecla @0 swipe der', desde: 0, tecla: null, espera: 300, signo: +1, esperado: 1 },
    { n: 'borde: End luego swipe izq', desde: 4, tecla: 'End', espera: 300, signo: -1, esperado: 3 },
    { n: 'borde: Home luego swipe der', desde: 0, tecla: 'Home', espera: 300, signo: +1, esperado: 1 },
    { n: 'borde: Right@4 luego swipe izq', desde: 4, tecla: 'ArrowRight', espera: 300, signo: -1, esperado: 3 },
    { n: 'borde: Left@0 luego swipe der', desde: 0, tecla: 'ArrowLeft', espera: 300, signo: +1, esperado: 1 },
    { n: 'en vuelo: Right luego swipe izq', desde: 2, tecla: 'ArrowRight', espera: 60, signo: -1, esperado: null },
    { n: 'en vuelo: Left luego swipe der', desde: 2, tecla: 'ArrowLeft', espera: 60, signo: +1, esperado: null },
  ];
  for (const c of casos) {
    const rs = [];
    for (let k = 0; k < REPES; k++) {
      await colocar(page, c.desde);
      if (c.tecla) await page.keyboard.press(c.tecla);
      await page.waitForTimeout(c.espera);
      const antes = await page.evaluate(() => document.getElementById('container').scrollLeft);
      await page.evaluate(() => window.__H.arrancarTraza());
      const marcaGesto = await page.evaluate(() => performance.now());
      const t0 = Date.now(); let acc = 0; const vuelo = [];
      for (const p of perfil(c.signo)) {
        acc += p.gap;
        const w = acc - (Date.now() - t0); if (w > 1) await dormir(w);
        vuelo.push(Promise.resolve(iny.wheel(p.dx, p.dy)).catch(() => {}));
      }
      await Promise.all(vuelo);
      const raw = await page.evaluate(() => window.__H.pararTraza(6000));
      const a = analizar(raw, marcaGesto, c.signo);
      await agregarReposo(page, a);
      a.antes = Math.round(antes);
      rs.push(a);
    }
    const panelMed = mediana(rs.map((r) => r.panel));
    const reposoMed = mediana(rs.map((r) => r.panelReposo));
    // 'devuelto' se juzga EN REPOSO: el tiron de alDetenerse llega hasta 1 s tarde.
    //
    // Pero quedarse en el origen tiene DOS causas distintas y este predicado las
    // confundia: (a) el sitio lo devolvio, que es el defecto que se busca, y
    // (b) el gesto nunca tuvo fuerza para salir, que es una flaqueza del
    // inyector. Medido: con Home pulsado en el panel 0, chromium dejaba el
    // gesto en el sitio 4 de 5 veces con scrollTo/gesto=0 y scrollTo/despues=0,
    // o sea CERO escrituras de scroll del sitio (container.scrollTo de
    // script.js:65 es la unica que existe en todo el fichero). Eso no es una
    // devolucion: es un gesto que no salio, y contarlo como defecto del sitio
    // era una acusacion falsa.
    //
    // Por eso se exige que el CONTROL equivalente —mismo origen, mismo sentido,
    // sin tecla— SI haya salido. El control ya se media; solo faltaba
    // consultarlo.
    const ctrl = veneno.find((v) => v.n.startsWith('CONTROL') &&
      v.desde === c.desde && v.signo === c.signo);
    const controlSalio = !ctrl || ctrl.reposo !== ctrl.desde;
    // Tercera condicion, y la mas dura: el sitio tiene que haber EMITIDO una
    // orden de scroll. container.scrollTo (script.js:65) es la unica escritura
    // de scroll de todo el fichero —verificado por grep: no hay scrollBy, ni
    // scrollIntoView, ni asignaciones a scrollLeft—, asi que si no se llamo, el
    // sitio no movio a nadie y quedarse en el origen es cosa del navegador
    // arbitrando entre su propia animacion suave y la rueda.
    // Medido: tras los arreglos, "en vuelo Right + swipe izq" daba [1,1,2,3,3]
    // con scrollTo/gesto=0 y /despues=0. Sin esta condicion, ese azar del motor
    // se leia como "el sitio devuelve al usuario", que es una acusacion falsa.
    const sTot = medObj(rs, 'scrollToDurante') + medObj(rs, 'scrollToDespues');
    const enOrigen = reposoMed === c.desde;
    const devuelto = enOrigen && controlSalio && sTot > 0;
    const sinFuerza = enOrigen && !controlSalio;
    const arbitraje = enOrigen && controlSalio && sTot === 0;
    veneno.push({ ...c, panel: panelMed, reposo: reposoMed, devuelto, sinFuerza, arbitraje,
      ms: medObj(rs, 'msQuieto'), ret: medObj(rs, 'retrocesos'),
      sT: medObj(rs, 'scrollToDurante'), sTd: medObj(rs, 'scrollToDespues'),
      crudo: rs.map((r) => r.panel + '/' + r.panelReposo), detalle: rs[0].detalle });
  }
  console.log('');
  console.log('  secuencia envenenada (accion programatica + swipe nativo contrario antes de que asiente)');
  console.log('  caso                                desde  esperado  aterriza  reposo  DEVUELTO  ms-quieto  retroc  scrollTo/gesto  /despues  crudo(aterriza/reposo)');
  for (const v of veneno) {
    console.log(`  ${v.n.padEnd(34)} ${String(v.desde).padStart(5)} ${String(v.esperado === null ? '-' : v.esperado).padStart(9)} ${String(v.panel).padStart(9)} ${String(v.reposo).padStart(7)} ${(v.devuelto ? 'SI' : 'no').padStart(9)} ${String(v.ms).padStart(10)} ${String(v.ret).padStart(7)} ${String(v.sT).padStart(15)} ${String(v.sTd).padStart(9)}  [${v.crudo.join(',')}]`);
    if (v.detalle && v.detalle.length) {
      console.log('      scrollTo observados (ms desde el 1er evento de rueda): ' +
        v.detalle.map((d) => `${d.ms >= 0 ? '+' : ''}${d.ms}ms ${d.via}(${d.left},${d.behavior})`).join('  '));
    }
  }
  // Los controles son la parte que da SENTIDO al resto: si el control tambien
  // se queda, el swipe de este arnes no tiene fuerza y toda la tabla es humo.
  const ctrlMalos = veneno.filter((v) => v.n.startsWith('CONTROL') && v.reposo === v.desde);
  if (ctrlMalos.length) console.log(`  AVISO: el CONTROL sin tecla tampoco sale del panel (${ctrlMalos.map((v) => v.n).join(', ')}): el gesto sintetico no tiene fuerza suficiente y los casos envenenados NO prueban nada.`);

  // --- veredicto por motor ---
  const D = med.derecha, I = med.izquierda;
  const dif = (a, b) => (Math.min(a, b) > 0 ? Math.abs(a - b) / Math.min(a, b) : (a === b ? 0 : 1));
  const locales = [];
  const rMs = dif(D.msQuieto, I.msQuieto);
  const avisoMs = rMs > U_MS
    ? `ms-hasta-quieto difiere ${(rMs * 100).toFixed(0)}% (der ${D.msQuieto} / izq ${I.msQuieto}) > umbral ${U_MS * 100}%`
    : null;
  if (avisoMs && U_MS_GOBIERNA) locales.push(avisoMs);
  if ((D.retrocesos >= U_RETROCESO) !== (I.retrocesos >= U_RETROCESO))
    locales.push(`retrocesos de scrollLeft solo en un sentido (der ${D.retrocesos} / izq ${I.retrocesos})`);
  if (Math.abs(Math.abs(D.panel - DESDE) - Math.abs(I.panel - DESDE)) > U_PANELES)
    locales.push(`recorre distinto numero de paneles (der ${DESDE}->${D.panel} / izq ${DESDE}->${I.panel})`);
  if (D.scrollToDurante !== I.scrollToDurante)
    locales.push(`scrollTo durante el gesto difiere (der ${D.scrollToDurante} / izq ${I.scrollToDurante})`);
  if (D.fuera !== I.fuera) locales.push(`salidas de rango difieren (der ${D.fuera} / izq ${I.fuera})`);
  if (D.tironDiferido !== I.tironDiferido)
    locales.push(`tirones DIFERIDOS (el sitio mueve al usuario despues de que el gesto acabo) solo en un sentido: der ${D.tironDiferido}/${REPES} vs izq ${I.tironDiferido}/${REPES}`);
  const intromision = [];
  if (D.scrollToDurante > U_SCROLLTO) intromision.push(`derecha: ${D.scrollToDurante}`);
  if (I.scrollToDurante > U_SCROLLTO) intromision.push(`izquierda: ${I.scrollToDurante}`);
  const devueltos = veneno.filter((v) => v.devuelto && !v.n.startsWith('CONTROL'));

  console.log('');
  if (locales.length) { console.log(`  ASIMETRIA en ${eng}:`); locales.forEach((l) => console.log(`    - ${l}`)); }
  else console.log(`  simetrico en ${eng} bajo los umbrales que gobiernan`);
  if (avisoMs) console.log(`  (informativo, NO tumba: ${avisoMs} — ruido medido de 4.6x dentro de un mismo sentido)`);
  if (intromision.length) console.log(`  INTROMISION: scrollTo programatico dentro de un gesto nativo (${intromision.join(', ')}) — la REGLA 1 promete cero`);
  if (devueltos.length) console.log(`  DEVUELVE AL USUARIO en: ${devueltos.map((v) => v.n).join(' | ')}`);
  const arbitrados = veneno.filter((v) => v.arbitraje);
  if (arbitrados.length) console.log(`  (no es defecto del sitio: se queda en el origen SIN que el sitio emita ningun scrollTo — el motor arbitra entre su scroll suave y la rueda: ${arbitrados.map((v) => v.n).join(' | ')})`);
  const gestoFlojo = veneno.filter((v) => v.sinFuerza);
  if (gestoFlojo.length) console.log(`  (no es defecto del sitio: el gesto no salio del origen NI en el control — inyector flojo en: ${gestoFlojo.map((v) => v.n).join(' | ')})`);
  if (errs.length) console.log(`  errores de pagina: ${errs.slice(0, 3).join(' | ')}`);
  console.log('');

  salida.motores[eng] = { geo, barrido, med, veneno, locales, intromision, devueltos: devueltos.map((v) => v.n), fidelidad: iny.fiel, infiel, errs };
  if (locales.length) fallos.push(`${eng}: asimetria`);
  if (intromision.length) fallos.push(`${eng}: scrollTo dentro de gesto nativo`);
  if (devueltos.length) fallos.push(`${eng}: devuelve al usuario tras secuencia envenenada`);

  await iny.cerrar();
  await ctx.close(); await browser.close();
}

proc.kill();
if (argv.json) writeFileSync(path.join(HERE, 'swipe-results.json'), JSON.stringify(salida, null, 2) + '\n');

console.log('==============================================================');
if (fallos.length) {
  console.log('ROJO — ' + fallos.length + ' condicion(es):');
  fallos.forEach((f) => console.log('  * ' + f));
} else {
  console.log('VERDE — los dos sentidos se comportan igual bajo los umbrales declarados,');
  console.log('        y nadie llama a scrollTo dentro de un gesto nativo.');
}
console.log('');
console.log('LIMITES DE ESTA MEDICION (Linux, no es el Mac del dueno):');
console.log('  - No existe la nocion de FASE de macOS (began/changed/ended/momentum). Ni CDP ni');
console.log('    page.mouse.wheel la exponen: la cola de inercia se sintetiza como eventos que');
console.log('    decaen, no como inercia entregada por el sistema. Un preventDefault durante la');
console.log('    fase de momentum de macOS puede matar el gesto entero, y eso NO se reproduce aqui.');
console.log('  - No hay swipe-back de navegacion (el gesto de 2 dedos que va atras en el historial).');
console.log('    Es de AppKit/WebKit-Cocoa; el WebKit GTK de Playwright no lo tiene.');
console.log('  - No hay rubber-banding elastico de macOS en los topes.');
console.log('  - El sesgo ergonomico (una mano deja mas |deltaY| hacia un lado que hacia el otro)');
console.log('    es fisico y aqui el jitter vertical es simetrico por construccion: si esa fuera la');
console.log('    causa, este arnes NO la veria. Se mide en el Mac contando eventos por regla.');
console.log('  - Sin GPU real ni la memoria de textura de un Mac: la purga de bitmaps decodificados');
console.log('    no se reproduce.');
process.exit(fallos.length ? 1 : 0);
