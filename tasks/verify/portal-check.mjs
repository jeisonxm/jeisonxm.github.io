// portal-check.mjs — T8: ¿ocurre la transicion donde debe, y NO donde no debe?
//
// `pagereveal` trae `e.viewTransition` no nulo solo cuando el destino ACEPTO la
// transicion. Es la senal exacta: no se infiere del CSS, se observa.
//
//   node portal-check.mjs [--engines=chromium,webkit,firefox]

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const ENGINES = String(argv.engines || 'chromium,webkit,firefox').split(',');

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

const RUTAS = [
  { n: 'ES portada -> blog', de: '/', clic: 'a[data-portal]', vt: true },
  { n: 'ES blog -> portada', de: '/blog/', clic: 'a.portal-back', vt: true },
  { n: 'EN blog -> portada', de: '/en/blog/', clic: 'a.portal-back', vt: true },
  { n: 'blog -> post', de: '/blog/', clic: 'article.blog-entry a, .blog-entry-link, a[href$=".html"]', vt: false },
];

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1])); }));

let fallos = 0;
for (const eng of ENGINES) {
  const { type, opts } = launcher(eng);
  const browser = await type.launch({ headless: true, ...opts });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-ES' });
  await ctx.addInitScript(() => {
    window.__vt = null;
    addEventListener('pagereveal', (e) => { window.__vt = !!e.viewTransition; });
  });
  const soporta = await (async () => {
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    const s = await p.evaluate(() => 'onpagereveal' in window);
    await p.close(); return s;
  })();
  console.log(`\n=== ${eng} ===  cross-document view transitions: ${soporta ? 'si' : 'NO (degradacion limpia)'}`);

  for (const r of RUTAS) {
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    const cons = []; page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}${r.de}`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const hay = await page.locator(r.clic).first().count().catch(() => 0);
    if (!hay) { console.log(`  FALLO ${r.n}: no encuentro el enlace (${r.clic})`); fallos++; await page.close(); continue; }
    await page.locator(r.clic).first().click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(700);
    const vt = await page.evaluate(() => window.__vt);
    const url = page.url().replace(`http://127.0.0.1:${port}`, '');
    const opac = await page.evaluate(() => getComputedStyle(document.body).opacity);

    // Sin soporte, vt es null en TODAS: la degradacion es correcta si la
    // navegacion ocurrio igual y no hay errores.
    const ok = soporta ? (vt === r.vt) : (vt === null || vt === false);
    const limpio = errs.length === 0 && cons.length === 0 && opac === '1';
    if (!ok || !limpio) fallos++;
    console.log(`  ${ok && limpio ? 'OK  ' : 'FALLO'} ${r.n.padEnd(20)} vt=${vt} (esperado ${soporta ? r.vt : 'null/false'})` +
      `  -> ${url}  body opacity ${opac}` +
      (errs.length ? `  pageError: ${errs[0]}` : '') + (cons.length ? `  consoleError: ${cons[0]}` : ''));
    await page.close();
  }
  await ctx.close(); await browser.close();
}
proc.kill();
console.log(fallos ? `\n${fallos} COMPROBACIONES DEL PORTAL SIN CUMPLIR` : `\nEL PORTAL SE COMPORTA COMO DEBE EN LOS 3 MOTORES`);
process.exit(fallos ? 1 : 0);
