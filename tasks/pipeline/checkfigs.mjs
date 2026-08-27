// checkfigs.mjs — la puerta de aceptacion de T2, medida sobre los archivos reales.
//
// No dice "el recorte se ve bien": eso lo decide un ojo sobre la hoja de
// contacto. Dice lo que SI es medible, y lo dice con numeros:
//
//   - alto, alfa y peso contra los rangos del plan (§2.7)
//   - caja del alfa, altura de cabeza y linea de base  -> ¿escalas normalizadas?
//   - ancho de banda del borde (mediana, en px)         -> ¿halo o corte duro?
//   - relleno: push-pull vs pre-composicion contra un color de panel
//   - flips de alfa entre AVIF y WebP
//
// Uso:
//   node checkfigs.mjs <dir> [--all]
//   node checkfigs.mjs /home/archy/img-scratch/cutouts

import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadSharp() {
  const cands = [
    process.env.SHARP_PATH,
    '/home/archy/img-scratch/node_modules/sharp',
    path.resolve('node_modules/sharp'),
  ].filter(Boolean);
  for (const c of cands) { try { return require(c); } catch { /* siguiente */ } }
  throw new Error('no encuentro sharp. Probe: ' + cands.join(', '));
}
const sharp = loadSharp();

const DIR = process.argv[2] || '/home/archy/img-scratch/cutouts';
const ALL = process.argv.includes('--all');

// Las 5 elegidas de §2.6, en orden de panel.
const PANELES = [
  ['hero',     'hero',    '1164'],
  ['sobre-mi', 'about',   '285'],
  ['skills',   'skills',  '103865'],
  ['blog',     'blog',    '764'],
  ['contacto', 'contact', '533'],
];

// PRESUPUESTO (plan §2.7). Es un TECHO, no un rango: pesar menos nunca es un
// defecto. Los "26-42 KB" del plan eran la descripcion de lo que salio del
// pipeline, no un criterio. Lo que si es criterio:
//   - Version A completa, 5 paneles: <= 266.140 B
//   - panel 1 (hero), techo de LCP con 10% de margen: <= 46.375 B
// De ahi sale L1 (fondo desenfocado, T3): 25.973 B los 5 juntos, ~5.195 B el
// hero. Lo que queda es lo que puede pesar la figura.
// Medidos en T3 (checkbg.mjs), no estimados: L1 salio mucho mas barata que el
// 25.973 B que preveia el plan.
const L1_TOTAL = 8327, L1_HERO = 1945;
const PRESUPUESTO_FIGURAS = 266140 - L1_TOTAL;   // 240.167 B
const PRESUPUESTO_HERO = 46375 - L1_HERO;        // 41.180 B

// La figura de "sobre mi" viene de una foto cortada a la altura del muslo: no
// tiene pies, asi que no tiene linea de base propia. Se ancla extrapolando
// donde estarian (7 cabezas) y por eso se excluye de la comprobacion de base.
const SIN_PIES = new Set(['about']);

function bbox(data, w, h) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Ancho de la figura por fila (alfa opaco). El cuello es el minimo local entre
// la cabeza y los hombros; sirve para medir la altura de cabeza sin adivinar.
function rowWidths(data, w, h, box) {
  const out = [];
  for (let y = box.y0; y <= box.y1; y++) {
    let n = 0;
    for (let x = box.x0; x <= box.x1; x++) if (data[(y * w + x) * 4 + 3] > 128) n++;
    out.push(n);
  }
  return out;
}

function headHeight(widths) {
  const H = widths.length;
  // El cuello vive en la franja alta. Fuera de ella no se busca.
  const lo = Math.round(H * 0.04), hi = Math.round(H * 0.35);
  if (hi <= lo) return null;
  let best = lo, bestV = Infinity;
  for (let i = lo; i <= hi; i++) if (widths[i] < bestV) { bestV = widths[i]; best = i; }
  return { filaCuello: best, altura: best, anchoCuello: bestV };
}

// Cuantos pixeles hay entre "opaco" y "transparente" al cruzar el borde.
// Un corte duro da 0-1; un halo da muchos. El plan pide mediana ~4 a h1800.
function edgeBand(data, w, h) {
  const runs = [];
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 10 && a < 245) run++;
      else { if (run > 0 && run < 60) runs.push(run); run = 0; }
    }
    if (run > 0 && run < 60) runs.push(run);
  }
  if (!runs.length) return null;
  runs.sort((a, b) => a - b);
  return { mediana: runs[Math.floor(runs.length / 2)], n: runs.length,
           p90: runs[Math.floor(runs.length * 0.9)] };
}

// Pre-componer contra el color del panel deja TODOS los pixeles transparentes
// del mismo color. Push-pull los deja siguiendo el color local de la figura.
function fillKind(data, w, h) {
  const colores = new Map();
  let n = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4;
      if (data[i + 3] !== 0) continue;
      n++;
      const k = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3);
      colores.set(k, (colores.get(k) || 0) + 1);
      if (colores.size > 20000) break;
    }
  }
  if (!n) return null;
  const top = [...colores.entries()].sort((a, b) => b[1] - a[1])[0];
  return { transparentes: n, coloresDistintos: colores.size,
           dominantePct: +(100 * top[1] / n).toFixed(1) };
}

const bases = [...new Set(readdirSync(DIR)
  .filter((f) => /(\.h\d+|-fig\d+)\.(avif|webp)$/.test(f))
  .map((f) => f.replace(/\.(avif|webp)$/, '')))].sort();

const elegidas = ALL ? bases.map((b) => ['-', '-', b]) :
  PANELES.map(([panel, slug, id]) => [panel, slug,
    bases.find((b) => b === `${slug}-fig1800`) || bases.find((b) => b.includes('-' + id + '.'))]);

let fallos = 0;
const filas = [];
for (const [panel, slug, base] of elegidas) {
  if (!base) { console.log(`FALTA el recorte del panel ${panel}`); fallos++; continue; }
  const avif = path.join(DIR, base + '.avif');
  const webp = path.join(DIR, base + '.webp');
  const kb = (p) => existsSync(p) ? +(statSync(p).size / 1024).toFixed(1) : null;

  const img = sharp(webp).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const box = bbox(data, info.width, info.height);
  const widths = rowWidths(data, info.width, info.height, box);
  const cabeza = headHeight(widths);
  const banda = edgeBand(data, info.width, info.height);
  const relleno = fillKind(data, info.width, info.height);

  // flips de alfa AVIF vs WebP: el mismo pixel opaco en uno y transparente en otro
  const a2 = await sharp(avif).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let flips = 0, maxDa = 0, sumDa = 0;
  const N = info.width * info.height;
  for (let i = 0; i < N; i++) {
    const p = data[i * 4 + 3], q = a2.data[i * 4 + 3];
    const d = Math.abs(p - q); sumDa += d; if (d > maxDa) maxDa = d;
    if ((p < 10 && q > 128) || (p > 245 && q < 128)) flips++;
  }

  const avifB = statSync(avif).size, webpB = statSync(webp).size;
  const avifKb = kb(avif), webpKb = kb(webp);
  const okAlto = info.height === 1800;
  const okHero = slug !== 'hero' || avifB <= PRESUPUESTO_HERO;
  const okFlips = flips === 0;
  if (!okAlto || !okHero || !okFlips) fallos++;

  filas.push({ panel, slug, base, info, box, cabeza, banda, relleno, avifKb, webpKb, avifB, webpB,
               flips, maxDa, meanDa: +(sumDa / N).toFixed(3), okAlto, okHero, okFlips });
}

console.log(`\n=== T2 · recortes con alfa — ${DIR}\n`);
for (const f of filas) {
  const alturaCabeza = f.cabeza ? f.cabeza.altura : null;
  console.log(`${f.panel.padEnd(9)} ${f.base.replace(/\.h\d+$/, '').slice(0, 46)}`);
  console.log(`  lienzo        ${f.info.width}x${f.info.height}  ${f.okAlto ? 'OK' : 'FALLO: no son 1800 de alto'}`);
  console.log(`  peso          AVIF ${f.avifB} B (${f.avifKb} KiB)   WebP ${f.webpB} B (${f.webpKb} KiB)` +
              (f.slug === 'hero' ? `   techo LCP del hero ${PRESUPUESTO_HERO} B ${f.okHero ? 'OK' : 'EXCEDIDO'}` : ''));
  console.log(`  caja del alfa x[${f.box.x0}-${f.box.x1}] y[${f.box.y0}-${f.box.y1}]  ${f.box.w}x${f.box.h}`);
  console.log(`  cabeza        ${alturaCabeza} px (cuello en fila ${f.cabeza ? f.cabeza.filaCuello : '?'}, ancho ${f.cabeza ? f.cabeza.anchoCuello : '?'})`);
  console.log(`  linea de base y=${f.box.y1}  (margen inferior ${f.info.height - 1 - f.box.y1} px)`);
  console.log(`  borde         mediana ${f.banda ? f.banda.mediana : '?'} px, p90 ${f.banda ? f.banda.p90 : '?'} px, ${f.banda ? f.banda.n : 0} cruces`);
  console.log(`  relleno       ${f.relleno.coloresDistintos} colores distintos en lo transparente, dominante ${f.relleno.dominantePct}%  ` +
              `-> ${f.relleno.coloresDistintos > 50 ? 'push-pull' : 'PRE-COMPUESTO (halo)'}`);
  console.log(`  alfa AVIF/WebP flips=${f.flips} ${f.okFlips ? 'OK' : 'FALLO'}  maxΔα=${f.maxDa}  meanΔα=${f.meanDa}\n`);
}

const alturas = filas.map((f) => f.cabeza && f.cabeza.altura).filter(Boolean);
if (alturas.length > 1) {
  const min = Math.min(...alturas), max = Math.max(...alturas);
  console.log(`ESCALAS  altura de cabeza: min ${min} px, max ${max} px, dispersion ${(max / min).toFixed(2)}x`);
  console.log(`         ${(max / min) <= 1.15 ? 'OK: normalizadas' : 'FALLO: sin normalizar — en paneles contiguos se lee como descuido'}`);
  if ((max / min) > 1.15) fallos++;
}
const conPies = filas.filter((f) => !SIN_PIES.has(f.slug));
if (conPies.length > 1) {
  const margenes = conPies.map((f) => f.info.height - 1 - f.box.y1);
  const min = Math.min(...margenes), max = Math.max(...margenes);
  console.log(`         linea de base (${conPies.length} con pies): margen inferior de ${min} a ${max} px, spread ${max - min} px`);
  console.log(`         ${(max - min) <= 20 ? 'OK: base comun' : 'FALLO: sin linea de base comun'}`);
  if ((max - min) > 20) fallos++;
  for (const f of filas.filter((x) => SIN_PIES.has(x.slug))) {
    console.log(`         ${f.slug}: sin pies (foto cortada en el muslo), anclada por cabeza a ${f.box.y0} px. No entra en la comprobacion.`);
  }
}

const totalAvif = filas.reduce((a, f) => a + f.avifB, 0);
const okTotal = totalAvif <= PRESUPUESTO_FIGURAS;
if (!okTotal) fallos++;
console.log(`\nPRESUPUESTO  AVIF de las 5 figuras: ${totalAvif} B  /  ${PRESUPUESTO_FIGURAS} B disponibles`);
console.log(`             ${okTotal ? `OK: sobran ${PRESUPUESTO_FIGURAS - totalAvif} B` : `EXCEDIDO en ${totalAvif - PRESUPUESTO_FIGURAS} B`}`);
console.log(`             Version A completa estimada: ${totalAvif + L1_TOTAL} B contra 275.430 B del sitio de hoy` +
            ` (${((totalAvif + L1_TOTAL) / 275430 * 100 - 100).toFixed(1)}%)`);

console.log(`\n${fallos ? `${fallos} CRITERIOS SIN CUMPLIR` : 'TODOS LOS CRITERIOS MEDIBLES CUMPLEN'}`);
process.exit(fallos ? 1 : 0);
