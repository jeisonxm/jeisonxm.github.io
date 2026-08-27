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
    const img = document.querySelector('#hero .panel-bg img');
    if (!img) return { found: false };
    const cs = getComputedStyle(img);
    const host = img.closest('.panel-bg') || img.parentElement;
    return {
      found: true,
      transform: cs.transform,
      px: getComputedStyle(host).getPropertyValue('--px').trim() ||
          getComputedStyle(img).getPropertyValue('--px').trim() || null,
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
    finePointer: null,
    reducedMotion: null,
    transform: {},
    wheel: {},
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
    const ctx = await browser.newContext({ viewport: VIEWPORT });
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

    await page.goto(base + '/', { waitUntil: 'load', timeout: 45000 });
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
    out.userAgent = caps.ua;
    out.cssSupportsScrollTimeline = caps.scrollTimeline;
    out.finePointer = caps.finePointer;
    out.reducedMotion = caps.reduced;
    out.panels = caps.panels;
    out.clientWidth = caps.clientWidth;

    // (e) transform ANTES / MITAD / DESPUES de scroll horizontal en #container
    const before = await readTransform(page);
    await page.evaluate(() => {
      const c = document.getElementById('container');
      c.scrollTo({ left: Math.round(c.clientWidth * 0.5), behavior: 'auto' });
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(250);
    const half = await readTransform(page);
    await page.evaluate(() => {
      const c = document.getElementById('container');
      c.scrollTo({ left: c.clientWidth, behavior: 'auto' });
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(250);
    const after = await readTransform(page);

    out.transform = {
      before: before.transform, half: half.transform, after: after.transform,
      pxBefore: before.px, pxHalf: half.px, pxAfter: after.px,
      changed: !!(before.found && (before.transform !== half.transform || before.transform !== after.transform)),
      measurable: !!before.found,
    };

    // (f) 3 gestos de rueda con 120 ms de separacion
    await page.evaluate(() => { document.getElementById('container').scrollTo({ left: 0, behavior: 'auto' }); });
    await page.waitForTimeout(700);
    const wheelStart = await page.evaluate(() => document.getElementById('container').scrollLeft);
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    let wheelErr = null;
    try {
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(120);
      }
    } catch (e) {
      wheelErr = String(e).split('\n')[0];
    }
    await page.waitForTimeout(1200);
    const wheelEnd = await page.evaluate(() => {
      const c = document.getElementById('container');
      return { scrollLeft: c.scrollLeft, clientWidth: c.clientWidth };
    });
    out.wheel = {
      supported: wheelErr === null,
      error: wheelErr,
      start: wheelStart,
      end: wheelEnd.scrollLeft,
      clientWidth: wheelEnd.clientWidth,
      panelReached: wheelEnd.clientWidth ? +(wheelEnd.scrollLeft / wheelEnd.clientWidth).toFixed(2) : null,
    };

    await ctx.close();

    // --- ESCENARIO FORZADO: Safari <= 18 / Firefox con raton ---
    // scroll-timeline NO soportado + puntero fino  => la rama que revienta.
    const ctx2 = await browser.newContext({ viewport: VIEWPORT });
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
    await p2.goto(base + '/', { waitUntil: 'load', timeout: 45000 });
    await p2.waitForTimeout(900);
    await p2.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    try {
      for (let i = 0; i < 3; i++) { await p2.mouse.wheel(0, 120); await p2.waitForTimeout(120); }
    } catch { /* ya reportado arriba */ }
    await p2.waitForTimeout(1200);
    forced.scrollLeft = await p2.evaluate(() => document.getElementById('container').scrollLeft);
    forced.clientWidth = await p2.evaluate(() => document.getElementById('container').clientWidth);
    forced.panelReached = forced.clientWidth ? +(forced.scrollLeft / forced.clientWidth).toFixed(2) : null;
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
  console.log(`  version                  : ${r.version}`);
  console.log(`  userAgent                : ${r.userAgent}`);
  console.log(`  CSS.supports scroll()    : ${r.cssSupportsScrollTimeline}`);
  console.log(`  (hover:hover)+(pointer:fine): ${r.finePointer}`);
  console.log(`  prefers-reduced-motion   : ${r.reducedMotion}`);
  console.log(`  paneles / clientWidth    : ${r.panels} / ${r.clientWidth}`);
  console.log(`  pageErrors               : ${r.pageErrors.length ? JSON.stringify(r.pageErrors) : 'ninguno'}`);
  console.log(`  consoleErrors            : ${r.consoleErrors.length ? JSON.stringify(r.consoleErrors) : 'ninguno'}`);
  console.log(`  TypeError conocido (34)  : ${r.knownTypeError}${r.knownTypeErrorText ? ' -> ' + r.knownTypeErrorText : ''}`);
  console.log(`  transform  antes         : ${r.transform.before}`);
  console.log(`  transform  mitad         : ${r.transform.half}`);
  console.log(`  transform  despues       : ${r.transform.after}`);
  console.log(`  --px antes/mitad/despues : ${r.transform.pxBefore} / ${r.transform.pxHalf} / ${r.transform.pxAfter}`);
  console.log(`  >>> EL TRANSFORM CAMBIA  : ${r.transform.changed}`);
  console.log(`  wheel x3 @120ms soportado: ${r.wheel.supported}${r.wheel.error ? ' (' + r.wheel.error + ')' : ''}`);
  console.log(`  wheel scrollLeft         : ${r.wheel.start} -> ${r.wheel.end}  (panel ${r.wheel.panelReached})`);
  if (r.forcedSafari18) {
    const f = r.forcedSafari18;
    console.log(`  [forzado scroll-timeline=false + finePointer=true]`);
    console.log(`    pageErrors             : ${f.pageErrors.length ? JSON.stringify(f.pageErrors) : 'ninguno'}`);
    console.log(`    TypeError conocido     : ${f.knownTypeError}${f.text ? ' -> ' + f.text : ''}`);
    console.log(`    wheel scrollLeft       : 0 -> ${f.scrollLeft}  (panel ${f.panelReached})`);
  }
  console.log('');
}

proc.kill();

if (argv.json) {
  const dest = argv.json === true ? path.join(HERE, 'probe-results.json') : argv.json;
  writeFileSync(dest, JSON.stringify(results, null, 2));
  console.log(`JSON -> ${dest}`);
}

const failed = results.filter((r) => !r.launched);
process.exit(failed.length ? 1 : 0);
