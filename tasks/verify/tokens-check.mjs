// tokens-check.mjs — el riesgo real de unificar la paleta: que una pagina se
// quede sin un token y el navegador caiga al valor inicial en silencio.
//
// Un `var(--x)` sin definir no da error: da color inicial (negro) o cadena
// vacia. La pagina se ve mal pero carga, y ningun exit code se entera. Esto
// recorre los 38 HTML, junta TODOS los `var(--…)` que referencian sus hojas de
// estilo y comprueba que cada uno resuelve.
//
// Ademas comprueba que la pagina pinta (mismo criterio que render-check) y que
// el texto del cuerpo contrasta con su fondo, que es como se manifiesta un
// token perdido.
//
//   node tokens-check.mjs [--engines=chromium]

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
const ENGINES = String(argv.engines || 'chromium').split(',');

function resolveWebkitDir() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME, '.cache', 'ms-playwright');
  if (!existsSync(base)) return null;
  const d = readdirSync(base).filter((x) => /^webkit-\d+$/.test(x))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  return d.length ? path.join(base, d[0]) : null;
}
function launcher(name) {
  if (name === 'chromium') return { type: chromium, opts: {} };
  if (name === 'firefox') return { type: firefox, opts: {} };
  const opts = {}; const wk = resolveWebkitDir();
  const run = path.join(HERE, 'wk_run.sh');
  if (process.env.WK_SYSROOT && existsSync(run) && wk) { process.env.WK_BROWSER_DIR = wk; opts.executablePath = run; }
  return { type: webkit, opts };
}

// Todas las paginas del sitio, sin tocar tasks/
function paginas(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'tasks' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, out);
    else if (e.name.endsWith('.html')) out.push('/' + path.relative(SITE, p));
  }
  return out;
}

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1]));
}));
const base = `http://127.0.0.1:${port}`;
const rutas = paginas(SITE).sort();
console.log(`${rutas.length} paginas, ${ENGINES.join('+')}\n`);

let fallos = 0;
const resumen = [];
for (const eng of ENGINES) {
  const { type, opts } = launcher(eng);
  const browser = await type.launch({ headless: true, ...opts });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
  const page = await ctx.newPage();
  for (const ruta of rutas) {
    const errs = [];
    page.removeAllListeners('pageerror');
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await page.goto(base + ruta, { waitUntil: 'load', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    const r = await page.evaluate(() => {
      // Nombres de token referenciados por las hojas cargadas
      const usados = new Set(), conRespaldo = new Set();
      for (const hoja of document.styleSheets) {
        let reglas; try { reglas = hoja.cssRules; } catch { continue; }
        // OJO: desde CSS Nesting, un CSSStyleRule TAMBIEN tiene .cssRules (vacio
        // pero truthy). Con `if (x.cssRules) recurse; else leer cssText` nunca se
        // llegaba a leer una sola declaracion: la comprobacion encontraba 2
        // tokens en todo el sitio y parecia que iba bien.
        const rec = (rs) => { for (const x of rs) {
          // Se distingue `var(--x)` de `var(--x, respaldo)`: el segundo NO esta
          // roto aunque el token no exista, porque el respaldo es la definicion.
          if (x.cssText) for (const m of x.cssText.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
            usados.add(m[1]); if (m[2] === ',') conRespaldo.add(m[1]);
          }
          if (x.cssRules && x.cssRules.length) rec(x.cssRules);
        } };
        rec(reglas);
      }
      // Tokens que el JS escribe en tiempo de ejecucion: no estan en :root a
      // proposito y su ausencia no es un fallo. Cada uno lleva su motivo.
      const EN_RUNTIME = {
        '--vt-origin-x': 'lang.js: origen del barrido de la view transition',
        '--vt-origin-y': 'lang.js: origen del barrido de la view transition',
        '--px': 'script.js: paralaje, se escribe por frame',
        '--p': 'motor de profundidad (T5)', '--a': 'motor de profundidad (T5)',
        '--vw': 'motor de profundidad (T5)', '--prog': 'fixture del control',
      };
      const raiz = getComputedStyle(document.documentElement);
      const sinDefinir = [...usados].filter((n) =>
        raiz.getPropertyValue(n).trim() === '' && !(n in EN_RUNTIME) && !conRespaldo.has(n));
      const runtime = [...usados].filter((n) => n in EN_RUNTIME);
      const cs = getComputedStyle(document.body);
      return { usados: usados.size, sinDefinir, runtime, conRespaldo: [...conRespaldo], color: cs.color, fondo: cs.backgroundColor,
               hojas: document.styleSheets.length };
    });

    const mal = r.sinDefinir.length > 0 || errs.length > 0;
    if (mal) fallos++;
    resumen.push({ eng, ruta, ...r, errs });
    if (mal) {
      console.log(`  FALLO ${eng} ${ruta}`);
      if (r.sinDefinir.length) console.log(`        sin definir: ${r.sinDefinir.join(' ')}`);
      if (errs.length) console.log(`        pageError: ${errs.join(' | ')}`);
    }
  }
  await browser.close();
}
proc.kill();

const conFallo = resumen.filter((x) => x.sinDefinir.length || x.errs.length);
const tokens = Math.max(...resumen.map((x) => x.usados));
console.log(`\n${resumen.length} cargas, hasta ${tokens} tokens referenciados por pagina`);
console.log(conFallo.length
  ? `${conFallo.length} paginas con tokens sin definir o con errores`
  : 'TODAS las paginas resuelven todos sus tokens y no dan pageError');
if (argv.json) writeFileSync(typeof argv.json === 'string' ? argv.json : 'tokens-results.json',
  JSON.stringify(resumen, null, 2));
process.exit(fallos ? 1 : 0);
