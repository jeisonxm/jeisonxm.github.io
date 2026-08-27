// checkbg.mjs — puerta de aceptacion de T3: capa L1 y fotos de la Version B.
//
//   node checkbg.mjs [dir]

import { statSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = (() => {
  for (const c of [process.env.SHARP_PATH, '/home/archy/img-scratch/node_modules/sharp',
                   path.resolve('node_modules/sharp')].filter(Boolean)) {
    try { return require(c); } catch { /* siguiente */ }
  }
  throw new Error('no encuentro sharp');
})();

const DIR = process.argv[2] || 'src/images/panels';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const geo = JSON.parse(readFileSync(path.join(HERE, 'figs-geometry.json'), 'utf8'));

// Criterios del plan §2.7
const L1_PRESUPUESTO = 26 * 1024;      // los 5 juntos
const A_TOTAL_MAX = 266140;            // Version A completa
const A_HERO_MAX = 46375;              // techo de LCP del panel 1
const HOY = 275430;                    // lo que pesa el sitio ahora: A debe BAJAR
const B_MAX = 2048;
const DPR2_PANEL = 3226;               // panel a DPR 2 (plan §2.7)

const bytes = (f) => existsSync(f) ? statSync(f).size : null;
let fallos = 0;

// Energia de gradiente: una capa desenfocada tiene que tenerla MUY baja
// comparada con la misma foto sin desenfocar. Si no, el blur no esta horneado.
const nitidez = (buf, w, h, ch) => {
  let g = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * ch;
    g += Math.abs(buf[i] - buf[i + ch]) + Math.abs(buf[i] - buf[i + w * ch]); n++;
  }
  return g / n;
};

console.log(`\n=== T3 · L1 y Version B — ${DIR}\n`);
let sumaL1 = 0, sumaFig = 0, sumaB = 0;
for (const fig of geo.figuras) {
  const l1 = path.join(DIR, `${fig.slug}-l1-320.avif`);
  const b = path.join(DIR, `${fig.slug}-b${B_MAX}.avif`);
  const f = path.join(DIR, `${fig.slug}-fig1800.avif`);
  for (const p of [l1, b, f]) if (!existsSync(p)) { console.log(`FALTA ${p}`); fallos++; }
  if (!existsSync(l1) || !existsSync(b) || !existsSync(f)) continue;

  const ml1 = await sharp(l1).metadata(), mb = await sharp(b).metadata();
  const okL1Dim = ml1.width === 320 && ml1.height === 480;
  const okBDim = Math.max(mb.width, mb.height) === B_MAX;
  if (!okL1Dim || !okBDim) fallos++;

  // ¿esta el blur horneado? se compara contra la misma foto SIN desenfocar
  const raw = await sharp(l1).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const crudo = await sharp(path.join('/home/archy/img-scratch/originals', fig.orig))
    .resize(320, 480, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const gBlur = nitidez(raw.data, raw.info.width, raw.info.height, raw.info.channels);
  const gCrudo = nitidez(crudo.data, crudo.info.width, crudo.info.height, crudo.info.channels);
  // Un asset SIN desenfocar da razon ~1.00 contra su propia referencia. Los
  // cinco estan entre 0.15 y 0.28, o sea 3.5x-6.7x por debajo. El umbral 0.5
  // separa con margen y no es un ajuste fino: mas abajo, la referencia misma
  // (control negativo, unas lineas mas adelante) tendria que pasar, y no pasa.
  const razon = gBlur / gCrudo;
  const okBlur = razon < 0.5;
  if (!okBlur) fallos++;

  sumaL1 += bytes(l1); sumaB += bytes(b); sumaFig += bytes(f);
  console.log(`${fig.slug.padEnd(8)} L1 ${ml1.width}x${ml1.height} ${String(bytes(l1)).padStart(5)} B ${okL1Dim ? 'OK' : 'DIM MAL'}` +
    `   nitidez ${gBlur.toFixed(2)} vs ${gCrudo.toFixed(2)} sin desenfocar (razon ${razon.toFixed(2)}) ${okBlur ? 'OK' : 'EL BLUR NO ESTA HORNEADO'}`);
  console.log(`${''.padEnd(8)} B  ${mb.width}x${mb.height} ${String(bytes(b)).padStart(6)} B ${okBDim ? 'OK' : 'DIM MAL'}` +
    `   figura ${bytes(f)} B`);
}

const okL1 = sumaL1 <= L1_PRESUPUESTO;
const aTotal = sumaFig + sumaL1, aHero = bytes(path.join(DIR, 'hero-fig1800.avif')) + bytes(path.join(DIR, 'hero-l1-320.avif'));
const okA = aTotal <= A_TOTAL_MAX && aTotal < HOY;
const okHero = aHero <= A_HERO_MAX;
if (!okL1) fallos++; if (!okA) fallos++; if (!okHero) fallos++;

console.log(`\nL1 los 5 juntos      ${sumaL1} B  /  ${L1_PRESUPUESTO} B   ${okL1 ? 'OK' : 'EXCEDIDO'}`);
console.log(`VERSION A (fig + L1) ${aTotal} B  /  ${A_TOTAL_MAX} B   ${okA ? 'OK' : 'EXCEDIDO'}`);
console.log(`                     contra ${HOY} B del sitio de hoy: ${((aTotal / HOY - 1) * 100).toFixed(1)}%  ${aTotal < HOY ? 'BAJA, como pide el plan' : 'SUBE'}`);
console.log(`PANEL 1 (hero)       ${aHero} B  /  ${A_HERO_MAX} B de techo de LCP   ${okHero ? `OK, ${A_HERO_MAX - aHero} B de margen` : 'EXCEDIDO'}`);
console.log(`VERSION B los 5      ${sumaB} B  (+${(100 * (sumaB + sumaL1) / aTotal - 100).toFixed(0)}% sobre A)`);
console.log(`\nLo que hay que escribir tal cual (plan §2.7):`);
console.log(`  La Version B NO puede ser HD real a pantalla completa sin duplicar el peso.`);
console.log(`  A ${B_MAX} px sobre un panel de ${DPR2_PANEL} px de dispositivo sigue ${(DPR2_PANEL / B_MAX).toFixed(2)}x escalada.`);
console.log(`  Solo la Version A da 1.00x. Por eso A es la predeterminada.`);

// CONTROL NEGATIVO: la propia referencia sin desenfocar tiene que FALLAR la
// comprobacion de blur. Si pasara, la comprobacion seria ciega y su verde no
// significaria nada.
{
  const f0 = geo.figuras[0];
  const crudo = await sharp(path.join('/home/archy/img-scratch/originals', f0.orig))
    .resize(320, 480, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const g = nitidez(crudo.data, crudo.info.width, crudo.info.height, crudo.info.channels);
  const pasaria = (g / g) < 0.5;
  console.log(`\ncontrol negativo: la foto SIN desenfocar da razon 1.00 -> ${pasaria ? 'PASA (la comprobacion es ciega)' : 'falla, como debe'}`);
  if (pasaria) fallos++;
}

console.log(`\n${fallos ? `${fallos} CRITERIOS SIN CUMPLIR` : 'TODOS LOS CRITERIOS DE T3 CUMPLEN'}`);
process.exit(fallos ? 1 : 0);
