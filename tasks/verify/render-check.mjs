// render-check.mjs — criterio 1 de T1: los tres motores arrancan Y PINTAN.
//
// "Arranca" no es "renderiza": un motor puede lanzarse, navegar, devolver exit 0
// y haber pintado una pagina en blanco. Aqui se descarga el screenshot, se
// decodifica el PNG y se miden dos cosas sobre los pixeles reales:
//   - colores distintos (una pagina en blanco tiene 1)
//   - desviacion estandar de luminancia (una pagina en blanco tiene 0)
//
// Y como el resto del arnes, trae su CONTROL NEGATIVO: la misma medicion contra
// una pagina deliberadamente vacia TIENE que fallar. Si el control negativo
// pasa, el medidor esta ciego y su "verde" sobre el sitio no vale nada.
//
// Uso:
//   node render-check.mjs
//   node render-check.mjs --site=/ruta --engines=webkit,firefox --json
//
// Env: WK_SYSROOT, PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1, VERIFY_OUT

import { chromium, firefox, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WK_RUN = path.join(HERE, 'wk_run.sh');

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const SITE = argv.site || path.resolve(HERE, '..', '..');
const ENGINES = String(argv.engines || 'webkit,firefox,chromium').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = process.env.VERIFY_OUT || path.join(process.env.HOME, 'pw-harness', 'shots');
const VIEWPORT = { width: 1440, height: 900 };
// src/lang.js:51 redirige `/` a `/en/` cuando navigator.language empieza por
// 'en' y no hay preferencia guardada. El locale por defecto de Playwright es
// en-US, asi que TODO el arnes estuvo midiendo /en/ creyendo medir /. Ahora la
// eleccion es explicita y queda registrada en el JSON.
const LOCALE = argv.locale || 'es-ES';
const PATHNAME = argv.path || '/';

// Umbrales. Un screenshot real del sitio da miles de colores y stdev > 30; una
// pagina en blanco da 1 y 0. El margen entre ambos es de ordenes de magnitud,
// asi que los umbrales no son un ajuste fino.
const MIN_COLORS = 256;
const MIN_STDEV = 8;

function resolveWebkitDir() {
  if (process.env.WK_BROWSER_DIR) return process.env.WK_BROWSER_DIR;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME, '.cache', 'ms-playwright');
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base).filter((d) => /^webkit-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  return dirs.length ? path.join(base, dirs[0]) : null;
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

// ---------- decodificador PNG (truecolor 8 bits, sin entrelazar) ----------
// Playwright emite exactamente eso. Cualquier otra cosa se rechaza en vez de
// adivinar: un decodificador que adivina mal inventaria pixeles.
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('no es un PNG');
  let i = 8, idat = [], w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bitDepth ${bitDepth} no soportado`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`colorType ${colorType} no soportado`);
  if (interlace !== 0) throw new Error('PNG entrelazado no soportado');

  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    if (f === 1) { for (let x = bpp; x < stride; x++) line[x] = (line[x] + line[x - bpp]) & 255; }
    else if (f === 2) { for (let x = 0; x < stride; x++) line[x] = (line[x] + prev[x]) & 255; }
    else if (f === 3) { for (let x = 0; x < stride; x++) { const a = x >= bpp ? line[x - bpp] : 0; line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255; } }
    else if (f === 4) {
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    } else if (f !== 0) throw new Error(`filtro PNG desconocido: ${f}`);
    line.copy(out, y * stride); prev = line;
  }
  return { w, h, bpp, px: out };
}

// Muestrea 1 de cada 7 pixeles: suficiente para distinguir "pintado" de
// "en blanco" por varios ordenes de magnitud, y no recorre 1.3 M pixeles.
function pixelStats(buf) {
  const { w, h, bpp, px } = decodePng(buf);
  const colors = new Set();
  let n = 0, sum = 0, sum2 = 0;
  for (let y = 0; y < h; y += 7) {
    for (let x = 0; x < w; x += 7) {
      const o = y * w * bpp + x * bpp;
      const r = px[o], g = px[o + 1], b = px[o + 2];
      if (colors.size < 100000) colors.add((r << 16) | (g << 8) | b);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      n++; sum += l; sum2 += l * l;
    }
  }
  const mean = sum / n;
  return { w, h, sampled: n, colors: colors.size, lumMean: +mean.toFixed(2), lumStdev: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(2) };
}

const painted = (s) => s.colors >= MIN_COLORS && s.lumStdev >= MIN_STDEV;

// ---------- servidor ----------
async function startServer(root) {
  const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', root, '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('el servidor no arranco en 10 s')), 10000);
    const on = (b) => { const m = String(b).match(/port (\d+)/); if (m) { clearTimeout(t); resolve(Number(m[1])); } };
    proc.stdout.on('data', on); proc.stderr.on('data', on); proc.on('error', reject);
  });
  return { proc, base: `http://127.0.0.1:${port}` };
}

// ---------- main ----------
mkdirSync(OUT, { recursive: true });
const { proc, base } = await startServer(SITE);
console.log(`sirviendo ${SITE} en ${base}`);
console.log(`capturas -> ${OUT}`);
console.log(`umbral: colores >= ${MIN_COLORS} y stdev de luminancia >= ${MIN_STDEV}\n`);

const results = [];
let allOk = true;
for (const name of ENGINES) {
  const row = { engine: name, launched: false, documento: null, imagenes: null, site: null, blank: null, ok: false, error: null };
  let browser;
  try {
    const { type, opts } = launcherFor(name);
    browser = await type.launch({ headless: true, ...opts });
    row.launched = true;
    const ctx = await browser.newContext({ viewport: VIEWPORT, locale: LOCALE });
    const page = await ctx.newPage();

    await page.goto(base + PATHNAME, { waitUntil: 'load', timeout: 45000 });
    // Sin la barrera de fuentes la captura sale a veces con la fuente de
    // respaldo, y las metricas de pixel bailan entre corridas.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1200);
    // animations:'disabled' congela animaciones y transiciones CSS en su estado
    // final. Sin esto la misma pagina daba +-2 colores y +-300 B por corrida.
    const shot = await page.screenshot({ animations: 'disabled' });
    writeFileSync(path.join(OUT, `render-${name}.png`), shot);
    row.site = pixelStats(shot);
    row.site.bytes = shot.length;

    // Los pixeles solos no bastan: con las 5 fotos rotas la pagina sigue dando
    // miles de colores (texto, degradados, ruido SVG) y "pintado" saldria true.
    // Medido: 5 imagenes rotas -> colores=9358, stdev=49.13, painted=true.
    // La foto del hero es el LCP: si no decodifica, el sitio NO se pinto.
    row.documento = await page.evaluate(() => ({
      pathname: location.pathname, lang: document.documentElement.lang || null,
    }));
    row.documento.pedido = PATHNAME;
    row.documento.locale = LOCALE;
    row.imagenes = await page.evaluate(() => {
      const todas = Array.from(document.querySelectorAll('#container .panel img'));
      const hero = document.querySelector('#hero .panel-bg img');
      return {
        total: todas.length,
        // Las otras 4 son diferidas (IntersectionObserver, rootMargin 150%):
        // a scrollLeft 0 no tienen por que estar cargadas. Se cuentan, no se exigen.
        decodificadas: todas.filter((i) => i.complete && i.naturalWidth > 0).length,
        heroDecodificada: !!(hero && hero.complete && hero.naturalWidth > 0),
      };
    });

    // CONTROL NEGATIVO: pagina deliberadamente vacia. Debe FALLAR.
    await page.setContent('<body style="margin:0;background:#ffffff"></body>');
    await page.waitForTimeout(200);
    const blank = await page.screenshot({ animations: 'disabled' });
    row.blank = pixelStats(blank);
    row.blank.bytes = blank.length;

    await ctx.close();
    row.ok = painted(row.site) && !painted(row.blank) && row.imagenes.heroDecodificada;
  } catch (e) {
    row.error = String(e).split('\n').slice(0, 6).join(' | ');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  if (!row.ok) allOk = false;
  results.push(row);

  console.log(`--- ${name} ---`);
  if (row.error) { console.log(`  ERROR: ${row.error}`); continue; }
  const f = (s) => `colores=${s.colors}  stdev=${s.lumStdev}  media=${s.lumMean}  ${s.w}x${s.h}  ${s.bytes} B`;
  console.log(`  sitio            : ${f(row.site)}   pintado=${painted(row.site)}`);
  console.log(`  documento        : pedido ${row.documento.pedido} -> servido ${row.documento.pathname}  lang=${row.documento.lang}  locale=${row.documento.locale}`);
  console.log(`  imagenes         : hero decodificada=${row.imagenes.heroDecodificada}  ${row.imagenes.decodificadas}/${row.imagenes.total} cargadas (las 4 diferidas no se exigen)`);
  console.log(`  control negativo : ${f(row.blank)}   pintado=${painted(row.blank)}  (debe ser false)`);
  console.log(`  => ${row.ok ? 'OK: arranca y pinta, y el medidor no es ciego' : 'FALLO'}\n`);
}

proc.kill();

if (argv.json) {
  const dest = argv.json === true ? path.join(HERE, 'render-results.json') : argv.json;
  writeFileSync(dest, JSON.stringify(results, null, 2));
  console.log(`JSON -> ${dest}`);
}

console.log(allOk
  ? 'RENDER OK — los tres motores arrancan y pintan; la pagina en blanco se detecta como vacia.'
  : 'RENDER FALLIDO — ver arriba.');
process.exit(allOk ? 0 : 1);
