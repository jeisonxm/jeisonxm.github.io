// probe.mjs — Suite de reconocimiento multi-motor para jeisonxm.github.io
//
// Corre la portada en WebKit (motor de Safari), Firefox (Gecko) y Chromium,
// headless, sirviendo el sitio por HTTP local (NO file://: el sitio usa rutas
// absolutas /src/...).
//
// NO escribe nada dentro del repo. Solo lee.
//
// Uso:
//   node probe.mjs                          # los tres motores
//   node probe.mjs --engines=webkit,firefox
//   node probe.mjs --site=/ruta/al/sitio
//   node probe.mjs --json=salida.json
//
// Variables de entorno que necesita WebKit en esta maquina (sin sudo):
//   WK_SYSROOT=<recon>/sysroot/usr/lib/x86_64-linux-gnu
//   PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

import { chromium, firefox, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const SITE = argv.site || '/home/archy/jeisonxm.github.io';
const ENGINES = String(argv.engines || 'webkit,firefox,chromium').split(',').map((s) => s.trim()).filter(Boolean);
const VIEWPORT = { width: 1440, height: 900 };
// src/lang.js:51 redirige `/` a `/en/` cuando navigator.language empieza por
// 'en' y no hay preferencia guardada. El locale por defecto de Playwright es
// en-US, asi que TODO el arnes estuvo midiendo /en/ creyendo medir /. Ahora la
// eleccion es explicita y queda registrada en el JSON.
const LOCALE = argv.locale || 'es-ES';
const PATHNAME = argv.path || '/';

// El launcher propio de WebKit: pw_run.sh pisa LD_LIBRARY_PATH, asi que no ve
// el sysroot local con libgtk-4 / libevent / etc. wk_run.sh hace lo mismo pero
// anadiendo $WK_SYSROOT al final.
const WK_RUN = path.join(HERE, 'wk_run.sh');

// wk_run.sh necesita saber donde vive el bundle de WebKit. Si no viene por
// entorno, se resuelve el webkit-* mas reciente del cache de Playwright.
function resolveWebkitDir() {
  if (process.env.WK_BROWSER_DIR) return process.env.WK_BROWSER_DIR;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(process.env.HOME, '.cache', 'ms-playwright');
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base).filter((d) => /^webkit-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  return dirs.length ? path.join(base, dirs[0]) : null;
}

// ---------- servidor HTTP local ----------
async function startServer(root) {
  const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', root, '0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('el servidor no arranco en 10 s')), 10000);
    const onData = (buf) => {
      const m = String(buf).match(/port (\d+)/);
      if (m) { clearTimeout(t); resolve(Number(m[1])); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
  });
  return { proc, base: `http://127.0.0.1:${port}` };
}

// ---------- utilidades ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- gestos de rueda ----------
// El gesto que interesa es "3 notches a 120 ms". Sintetizarlo NO es gratis:
// medido en esta maquina, page.mouse.wheel cuesta ~400 ms de ida y vuelta en
// WebKit headless, asi que alli el gesto sale estirado y el resultado bailaba
// entre panel 1 y panel 2 corrida a corrida. Por eso hay dos vias y se registra
// el timing REAL en pagina en vez de suponerlo:
//
//   confiable  page.mouse.wheel. Camino de entrada real (evento trusted).
//              Timing fiel en Firefox y Chromium; NO en WebKit.
//   sintetico  WheelEvent despachado dentro de la pagina. Timing exacto
//              (120-125 ms) en Firefox y Chromium. Ejercita la maquina de
//              estados del sitio, no el scroll nativo.
//
// timingFiel dice si los gaps REALES reprodujeron el gesto pretendido. Si es
// false, panelReached describe lo que paso, pero NO es "3 flicks a 120 ms".
const WHEEL_N = 3;
const WHEEL_GAP_MS = 120;
const WHEEL_DELTA = 120;
const GAP_TOL = 0.5;          // +-50% del gap pretendido
// Reintentar solo tiene sentido donde el timing fiel es alcanzable. Medido en
// esta maquina, page.mouse.wheel da gaps de 92-214 ms en Firefox, 134-176 en
// Chromium y ~200-460 en WebKit: reintentar no lo arregla, lo sortea. La via
// sintetica si da 120-125 ms, y ahi un reintento ocasional vale la pena.
const ATTEMPTS = { confiable: 1, sintetico: 4 };

// En captura y passive: observa sin alterar el comportamiento del sitio.
function instrumentWheel() {
  window.__wheelLog = [];
  window.addEventListener('wheel', () => window.__wheelLog.push(performance.now()),
    { capture: true, passive: true });
}

// Espera a que el scroll DEJE de moverse. `behavior: smooth` dura lo que dura
// en cada motor; dormir un rato fijo es una carrera disfrazada de medicion.
async function settleScroll(page, { quiet = 4, step = 100, max = 60 } = {}) {
  let last = null, stable = 0, snap = { scrollLeft: null, clientWidth: null };
  for (let i = 0; i < max; i++) {
    snap = await page.evaluate(() => {
      const c = document.getElementById('container');
      return c ? { scrollLeft: c.scrollLeft, clientWidth: c.clientWidth }
               : { scrollLeft: null, clientWidth: null };
    });
    if (last !== null && snap.scrollLeft === last) { if (++stable >= quiet) return snap; }
    else { stable = 0; last = snap.scrollLeft; }
    await sleep(step);
  }
  return snap;
}

async function measureWheel(page, mode) {
  const maxAttempts = ATTEMPTS[mode] || 1;
  const out = {
    modo: mode, intentos: 0, gapObjetivoMs: WHEEL_GAP_MS, gapsMs: null,
    timingFiel: false, scrollLeft: null, clientWidth: null,
    panelReached: null, error: null,
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    out.intentos = attempt;
    try {
      // Cada reintento arranca de pagina limpia. Un simple scrollTo(0) NO basta:
      // el sitio guarda `currentIndex` y un cooldown de 650 ms, asi que el
      // segundo intento avanzaria desde el indice del primero. Hoy se salva de
      // milagro porque el IntersectionObserver reescribe `currentIndex`
      // (src/script.js:216) — justo la linea que T7 va a tocar. Recargar no
      // depende de las tripas del sitio.
      if (attempt > 1) {
        await page.reload({ waitUntil: 'load', timeout: 45000 });
        await page.evaluate(() => document.fonts.ready).catch(() => {});
        await page.waitForTimeout(400);
      }
      await page.evaluate(() => {
        document.getElementById('container').scrollTo({ left: 0, behavior: 'auto' });
        if (window.__wheelLog) window.__wheelLog.length = 0;
      });
      await settleScroll(page);

      if (mode === 'confiable') {
        await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
        // Contra un deadline monotono: el coste de cada llamada se absorbe en la
        // espera siguiente en vez de sumarse al gap.
        const t0 = Date.now();
        for (let i = 0; i < WHEEL_N; i++) {
          await page.mouse.wheel(0, WHEEL_DELTA);
          const rest = t0 + (i + 1) * WHEEL_GAP_MS - Date.now();
          if (rest > 0) await sleep(rest);
        }
      } else {
        await page.evaluate(async ({ n, gap, delta }) => {
          const c = document.getElementById('container');
          for (let i = 0; i < n; i++) {
            if (i) await new Promise((r) => setTimeout(r, gap));
            c.dispatchEvent(new WheelEvent('wheel',
              { deltaY: delta, deltaMode: 0, bubbles: true, cancelable: true }));
          }
        }, { n: WHEEL_N, gap: WHEEL_GAP_MS, delta: WHEEL_DELTA });
      }

      const log = await page.evaluate(() => (window.__wheelLog || []).slice());
      out.gapsMs = log.slice(1).map((t, i) => Math.round(t - log[i]));
      out.timingFiel = log.length === WHEEL_N && out.gapsMs.every(
        (g) => g >= WHEEL_GAP_MS * (1 - GAP_TOL) && g <= WHEEL_GAP_MS * (1 + GAP_TOL));

      const end = await settleScroll(page);
      out.scrollLeft = end.scrollLeft;
      out.clientWidth = end.clientWidth;
      out.panelReached = end.clientWidth ? +(end.scrollLeft / end.clientWidth).toFixed(2) : null;
      out.error = null;
      if (out.timingFiel) break;
    } catch (e) {
      out.error = String(e).split('\n')[0];
      break;
    }
  }
  return out;
}

function fmtWheel(w) {
  if (!w) return 'sin medir';
  const gaps = w.gapsMs ? w.gapsMs.join('/') + ' ms' : 'sin eventos';
  const aviso = w.timingFiel ? '' : '  <- gesto estirado: el panel NO es "3 notches a 120 ms"';
  return `panel ${w.panelReached}  scrollLeft ${w.scrollLeft}  gaps ${gaps}  ` +
         `timingFiel=${w.timingFiel}  intentos ${w.intentos}${w.error ? '  ERROR ' + w.error : ''}${aviso}`;
}

function launcherFor(name) {
  if (name === 'chromium') return { type: chromium, opts: {} };
  if (name === 'firefox') return { type: firefox, opts: {} };
  if (name === 'webkit') {
    const opts = {};
    const wkDir = resolveWebkitDir();
    if (process.env.WK_SYSROOT && existsSync(WK_RUN) && wkDir) {
      process.env.WK_BROWSER_DIR = wkDir;
      opts.executablePath = WK_RUN;
    }
    return { type: webkit, opts };
  }
  throw new Error(`motor desconocido: ${name}`);
}

// Firma del TypeError conocido de src/script.js:34, en los tres dialectos:
//   V8   : Cannot read properties of undefined (reading 'matches')
//   JSC  : undefined is not an object (evaluating 'reduceMotion.matches')
//   SM   : reduceMotion is undefined
function isKnownTypeError(text) {
  const t = String(text);
  return /reduceMotion is undefined/i.test(t) ||
         /Cannot read propert(y|ies) of undefined \(reading '?matches'?\)/i.test(t) ||
         /undefined is not an object \(evaluating '.*matches'\)/i.test(t) ||
         (/reduceMotion/.test(t) && /undefined/i.test(t));
}

async function readTransform(page) {
  return page.evaluate(() => {
    // La capa que lleva el transform es .d-far (L1, el fondo desenfocado).
    // Se acepta tambien el marcado antiguo (.panel-bg img) para poder medir
    // paneles todavia sin convertir y para comparar contra la linea base.
    const el = document.querySelector('#hero .d-far') ||
               document.querySelector('#hero .panel-bg img');
    if (!el) return { found: false };
    const panel = document.getElementById('hero');
    const ps = panel ? getComputedStyle(panel) : null;
    return {
      found: true,
      capa: el.classList.contains('d-far') ? '.d-far' : '.panel-bg img',
      transform: getComputedStyle(el).transform,
      p: ps ? ps.getPropertyValue('--p').trim() || null : null,
      a: ps ? ps.getPropertyValue('--a').trim() || null : null,
      px: getComputedStyle(el).getPropertyValue('--px').trim() || null,
      scrollLeft: document.getElementById('container')?.scrollLeft ?? null,
    };
  });
}

async function runEngine(name, base) {
  const out = {
    engine: name,
    launched: false,
    version: null,
    userAgent: null,
    consoleErrors: [],
    pageErrors: [],
    knownTypeError: false,
    knownTypeErrorText: null,
    cssSupportsScrollTimeline: null,
    documento: null,
    finePointer: null,
    reducedMotion: null,
    transform: {},
    wheel: {},
    wheelSynthetic: {},
    forcedSafari18: null,
    error: null,
  };

  const { type, opts } = launcherFor(name);
  let browser;
  try {
    browser = await type.launch({ headless: true, ...opts });
  } catch (e) {
    out.error = String(e).split('\n').slice(0, 8).join(' | ');
    return out;
  }
  out.launched = true;
  out.version = browser.version();

  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, locale: LOCALE });
    const page = await ctx.newPage();

    page.on('console', (m) => {
      if (m.type() === 'error') out.consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => {
      const txt = `${e.name || 'Error'}: ${e.message}`;
      out.pageErrors.push(txt);
      if (isKnownTypeError(txt)) {
        out.knownTypeError = true;
        out.knownTypeErrorText = txt;
      }
    });

    await page.addInitScript(instrumentWheel);
    await page.goto(base + PATHNAME, { waitUntil: 'load', timeout: 45000 });
    // Barrera determinista. Sin esto Firefox aborta de vez en cuando la descarga
    // de la fuente (NS_BINDING_ABORTED) y aparece un consoleError fantasma:
    // medido, 1 de cada 8 corridas. Con la barrera, 0 de 8.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(900);
    for (const t of out.consoleErrors) {
      if (isKnownTypeError(t)) { out.knownTypeError = true; out.knownTypeErrorText ||= t; }
    }

    // (d) capacidades
    const caps = await page.evaluate(() => ({
      ua: navigator.userAgent,
      scrollTimeline: !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'scroll(inline nearest)')),
      finePointer: matchMedia('(hover: hover) and (pointer: fine)').matches,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      panels: document.querySelectorAll('#container .panel').length,
      clientWidth: document.getElementById('container')?.clientWidth ?? null,
      scrollWidth: document.getElementById('container')?.scrollWidth ?? null,
    }));
    // ¿Lo que se cargo ES el sitio? Sin esto, apuntar el arnes a un directorio
    // equivocado da VERDE: querySelector devuelve null, todo queda undefined,
    // `transform: {}` y `process.exit(0)`. Un probe que no encuentra nada tiene
    // que gritar, no aprobar. Se registra tambien QUE documento se midio: la
    // portada redirige a /en/ segun navigator.language (src/lang.js), asi que
    // "el sitio" no es una sola pagina y el JSON tiene que decir cual fue.
    out.documento = await page.evaluate(() => ({
      url: location.href,
      pathname: location.pathname,
      lang: document.documentElement.lang || null,
      container: !!document.getElementById('container'),
      heroImg: !!(document.querySelector('#hero .d-far') || document.querySelector('#hero .panel-bg img')),
    }));
    out.documento.pedido = PATHNAME;
    out.documento.locale = LOCALE;
    if (!out.documento.container || !caps.panels || !out.documento.heroImg) {
      out.error = `el documento medido no es el sitio esperado: ${out.documento.pathname} ` +
        `(container=${out.documento.container} paneles=${caps.panels} heroImg=${out.documento.heroImg})`;
      await ctx.close();
      return out;
    }

    out.userAgent = caps.ua;
    out.cssSupportsScrollTimeline = caps.scrollTimeline;
    out.finePointer = caps.finePointer;
    out.reducedMotion = caps.reduced;
    out.panels = caps.panels;
    out.clientWidth = caps.clientWidth;

    // (e) transform en TRES POSICIONES DE PANEL.
    //
    // Antes esto media "antes / a mitad / despues" con un scrollTo a
    // clientWidth*0.5. Ese punto no existe: con `scroll-snap-type: x mandatory`
    // (style.css:162) y `scroll-snap-align: center` (:198), 720 px queda
    // EXACTAMENTE equidistante de los centros del panel 0 (720) y del panel 1
    // (2160). Es un empate, cada motor lo rompe a su manera, y la medicion
    // quedaba a 1 px de cambiar de significado. Bajo snap obligatorio no hay
    // posiciones intermedias observables: solo hay paneles.
    const posiciones = [0, 1, 2];
    const lecturas = [];
    for (const i of posiciones) {
      if (i > 0) {
        await page.evaluate((n) => {
          const c = document.getElementById('container');
          c.scrollTo({ left: c.clientWidth * n, behavior: 'auto' });
        }, i);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.waitForTimeout(250);
      }
      lecturas.push(await readTransform(page));
    }
    const [l0, l1, l2] = lecturas;

    out.transform = {
      enPanel0: l0.transform, enPanel1: l1.transform, enPanel2: l2.transform,
      capa: l0.capa,
      pPanel0: l0.p, pPanel1: l1.p, pPanel2: l2.p,
      aPanel0: l0.a, aPanel1: l1.a, aPanel2: l2.a,
      scrollLeft: lecturas.map((l) => l.scrollLeft),
      changed: !!(l0.found && (l0.transform !== l1.transform || l0.transform !== l2.transform)),
      measurable: !!l0.found,
    };

    // (f) 3 gestos de rueda a 120 ms, por las dos vias.
    out.wheel = await measureWheel(page, 'confiable');
    out.wheelSynthetic = await measureWheel(page, 'sintetico');

    await ctx.close();

    // --- ESCENARIO FORZADO: Safari <= 18 / Firefox con raton ---
    // scroll-timeline NO soportado + puntero fino  => la rama que revienta.
    const ctx2 = await browser.newContext({ viewport: VIEWPORT, locale: LOCALE });
    const p2 = await ctx2.newPage();
    const forced = { pageErrors: [], knownTypeError: false, text: null, scrollLeft: null };
    p2.on('pageerror', (e) => {
      const txt = `${e.name || 'Error'}: ${e.message}`;
      forced.pageErrors.push(txt);
      if (isKnownTypeError(txt)) { forced.knownTypeError = true; forced.text ||= txt; }
    });
    await p2.addInitScript(() => {
      const realSupports = CSS.supports.bind(CSS);
      CSS.supports = function (...a) {
        if (String(a[0]).includes('animation-timeline')) return false;
        if (String(a[0]).includes('animation-timeline')) return false;
        return realSupports(...a);
      };
      const realMM = window.matchMedia.bind(window);
      window.matchMedia = function (q) {
        if (/hover: hover/.test(q) && /pointer: fine/.test(q)) {
          return { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent() { return false; } };
        }
        return realMM(q);
      };
    });
    await p2.addInitScript(instrumentWheel);
    await p2.goto(base + PATHNAME, { waitUntil: 'load', timeout: 45000 });
    await p2.evaluate(() => document.fonts.ready).catch(() => {});
    await p2.waitForTimeout(900);
    forced.wheel = await measureWheel(p2, 'sintetico');
    forced.scrollLeft = forced.wheel.scrollLeft;
    forced.clientWidth = forced.wheel.clientWidth;
    forced.panelReached = forced.wheel.panelReached;
    out.forcedSafari18 = forced;
    await ctx2.close();
  } catch (e) {
    out.error = String(e).split('\n').slice(0, 8).join(' | ');
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}

// ---------- main ----------
const { proc, base } = await startServer(SITE);
console.log(`sirviendo ${SITE} en ${base}\n`);

const results = [];
for (const name of ENGINES) {
  process.stdout.write(`--- ${name} ---\n`);
  const r = await runEngine(name, base);
  results.push(r);
  if (!r.launched) {
    console.log(`  ARRANQUE FALLIDO: ${r.error}\n`);
    continue;
  }
  if (r.error) console.log(`  ERROR                    : ${r.error}`);
  console.log(`  version                  : ${r.version}`);
  console.log(`  documento medido         : pedido ${r.documento ? r.documento.pedido : '?'} -> servido ${r.documento ? r.documento.pathname : '?'}  lang=${r.documento ? r.documento.lang : '?'}  locale=${r.documento ? r.documento.locale : '?'}`);
  console.log(`  userAgent                : ${r.userAgent}`);
  console.log(`  CSS.supports scroll()    : ${r.cssSupportsScrollTimeline}`);
  console.log(`  (hover:hover)+(pointer:fine): ${r.finePointer}`);
  console.log(`  prefers-reduced-motion   : ${r.reducedMotion}`);
  console.log(`  paneles / clientWidth    : ${r.panels} / ${r.clientWidth}`);
  console.log(`  pageErrors               : ${r.pageErrors.length ? JSON.stringify(r.pageErrors) : 'ninguno'}`);
  console.log(`  consoleErrors            : ${r.consoleErrors.length ? JSON.stringify(r.consoleErrors) : 'ninguno'}`);
  console.log(`  TypeError conocido (34)  : ${r.knownTypeError}${r.knownTypeErrorText ? ' -> ' + r.knownTypeErrorText : ''}`);
  console.log(`  transform  en panel 0    : ${r.transform.enPanel0}`);
  console.log(`  transform  en panel 1    : ${r.transform.enPanel1}`);
  console.log(`  transform  en panel 2    : ${r.transform.enPanel2}`);
  console.log(`  capa medida              : ${r.transform.capa}`);
  console.log(`  --p   p0 / p1 / p2       : ${r.transform.pPanel0} / ${r.transform.pPanel1} / ${r.transform.pPanel2}`);
  console.log(`  --a   p0 / p1 / p2       : ${r.transform.aPanel0} / ${r.transform.aPanel1} / ${r.transform.aPanel2}`);
  console.log(`  scrollLeft p0 / p1 / p2  : ${(r.transform.scrollLeft || []).join(' / ')}`);
  console.log(`  >>> EL TRANSFORM CAMBIA  : ${r.transform.changed}`);
  console.log(`  rueda x3 @120ms confiable: ${fmtWheel(r.wheel)}`);
  console.log(`  rueda x3 @120ms sintetica: ${fmtWheel(r.wheelSynthetic)}`);
  if (r.forcedSafari18) {
    const f = r.forcedSafari18;
    console.log(`  [forzado scroll-timeline=false + finePointer=true]`);
    console.log(`    pageErrors             : ${f.pageErrors.length ? JSON.stringify(f.pageErrors) : 'ninguno'}`);
    console.log(`    TypeError conocido     : ${f.knownTypeError}${f.text ? ' -> ' + f.text : ''}`);
    console.log(`    rueda sintetica        : ${fmtWheel(f.wheel)}`);
  }
  console.log('');
}

proc.kill();

if (argv.json) {
  const dest = argv.json === true ? path.join(HERE, 'probe-results.json') : argv.json;
  writeFileSync(dest, JSON.stringify(results, null, 2));
  console.log(`JSON -> ${dest}`);
}

// Un motor que arranco pero no pudo medir nada NO es un exito. Antes solo se
// miraba `launched`, asi que un sitio sin #container salia con exit 0.
// Tambien falla si el transform no fue medible: un sitio con #container pero
// sin la capa que se mide produce changed:false SIN excepcion, o sea el mismo
// veredicto que una medicion real. La linea base tiene measurable:true en los
// tres motores, asi que esto no pone en rojo el sitio de verdad.
const failed = results.filter((r) => !r.launched || r.error || r.transform?.measurable === false);
if (failed.length) {
  console.log('MOTORES CON FALLO: ' + failed.map((r) => `${r.engine} (${r.error || 'no arranco'})`).join(', '));
}
process.exit(failed.length ? 1 : 0);
