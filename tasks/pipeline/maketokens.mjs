// maketokens.mjs — T4: la paleta, derivada de las 5 fotos y no de unas estatuas.
//
// Medido con palette.mjs sobre las capas reales: los tonos dominantes del
// conjunto son 245°/235° (azul: camiseta de 285, sombras), 55°/65° (calido:
// piel, asfalto, arena), 115°/105° (verde de trail) y 185°/195° (turquesa de
// camiseta). La UI de hoy vive ENTERA en 67-79° con croma 0.009-0.027. Esa es
// la raiz de "las fotos no combinan" (plan §2.9).
//
// DECISIONES, y por que:
//
// - Neutros frios en h=245°, el tono dominante del conjunto. Un neutro calido
//   compite con la piel y el asfalto; uno frio los deja resaltar. Croma bajo
//   (0.010-0.020): tiene que leerse como neutro, no como azul.
// - Acento en h=195°, el turquesa de las camisetas de hero y blog. Es un color
//   que YA esta en las fotos. Croma 0.09: fotografico, no neon.
// - NADA se deriva de --marble-warm. En EN vale #00D4FF, cian electrico, y
//   cualquier efecto derivado daba halo de neon (plan §2.9). Los tokens salen de
//   una escala propia en OKLCh.
// - OKLCh y no HSL: en HSL dos colores con la misma L no se parecen en
//   luminosidad, y una escala elegida ahi se desequilibra sola.
//
//   node maketokens.mjs [salida.css]

import { writeFileSync, readFileSync } from 'node:fs';
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

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = process.argv[2] || 'src/styles/tokens.css';
const geo = JSON.parse(readFileSync(path.join(HERE, 'figs-geometry.json'), 'utf8'));

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const unlin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklchToRgb(L, C, h) {
  const A = C * Math.cos(h * Math.PI / 180), B2 = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B2) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B2) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B2) ** 3;
  const R = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const Bc = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const cl = (v) => Math.max(0, Math.min(255, Math.round(unlin(Math.max(0, Math.min(1, v))))));
  return [cl(R), cl(G), cl(Bc)];
}
function rgbToOklch(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  let h = Math.atan2(Bb, A) * 180 / Math.PI; if (h < 0) h += 360;
  return { L, C: Math.hypot(A, Bb), h };
}
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const ok = (L, C, h) => hex(oklchToRgb(L, C, h));

const relLum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (a, b) => {
  const [la, lb] = [relLum(parse(a)), relLum(parse(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const H_NEUTRO = 245;   // tono dominante del conjunto
const H_ACENTO = 195;   // turquesa de las camisetas de hero y blog

const T = {
  '--bg':            ok(0.200, 0.012, H_NEUTRO),
  '--bg-alt':        ok(0.248, 0.014, H_NEUTRO),
  '--surface':       ok(0.292, 0.016, H_NEUTRO),
  '--surface-hover': ok(0.345, 0.018, H_NEUTRO),
  '--stone':         ok(0.292, 0.016, H_NEUTRO),
  '--stone-light':   ok(0.368, 0.018, H_NEUTRO),
  '--stone-texture': ok(0.248, 0.014, H_NEUTRO),
  '--white':         ok(0.968, 0.004, H_NEUTRO),
  '--gray-light':    ok(0.902, 0.006, H_NEUTRO),
  '--gray':          ok(0.815, 0.008, H_NEUTRO),
  '--gray-dark':     ok(0.700, 0.010, H_NEUTRO),
  '--accent':        ok(0.800, 0.085, H_ACENTO),
  '--accent-strong': ok(0.660, 0.110, H_ACENTO),
};

// --panel-*: el campo de color de cada panel, sacado de SU fondo desenfocado.
// Es el color que se ve mientras la foto carga y por detras de lo que quede
// transparente, asi que tiene que PARECERSE a la foto: se toma la luminosidad
// media real de esa L1 y su tono DOMINANTE.
//
// El promedio plano no sirve: reduciendo la L1 a 1x1 se pierde el tono y blog y
// contact salian con el mismo marron. El tono dominante los mantiene distintos
// (85° calido, 245° azul, 140° verde, 55° ambar, 105° verde), que es justo lo
// que diferencia una foto de otra.
//
// NO se exige AA de --white contra estos colores: el texto no se apoya en ellos
// sino en el scrim, y el alpha que hace falta lo calcula tasks/contrast.mjs
// sobre la foto real.
const paneles = {};
for (const fig of geo.figuras) {
  const { data, info } = await sharp(path.join('src/images/panels', `${fig.slug}-l1-320.webp`))
    .removeAlpha().resize({ width: 160 }).raw().toBuffer({ resolveWithObject: true });
  const bins = new Array(36).fill(0);
  let sumL = 0, n = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const o = rgbToOklch(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    sumL += o.L; n++;
    if (o.C < 0.015) continue;
    bins[Math.min(35, Math.floor(o.h / 10))] += o.C;
  }
  const dom = bins.indexOf(Math.max(...bins)) * 10 + 5;
  paneles[fig.slug] = { hex: ok(sumL / n, 0.030, dom), L: sumL / n, h: dom };
}

const css = `/* tokens.css — UNA sola fuente de verdad para el color.
 *
 * Generado por tasks/pipeline/maketokens.mjs. No editar a mano: se regenera.
 *
 * Derivada de las 5 fotos de §2.6, medidas en OKLCh (tasks/pipeline/palette.mjs),
 * no de las estatuas de IA de donde salio la paleta anterior. Tonos dominantes
 * del conjunto: 245°/235° azul, 55°/65° calido, 115° verde de trail, 185°/195°
 * turquesa. La UI anterior vivia entera en 67-79° con croma 0.009-0.027, y por
 * eso las fotos no combinaban.
 *
 *   neutros  h=${H_NEUTRO}°  el tono dominante. Frio a proposito: deja resaltar la
 *            piel y el asfalto en vez de competir con ellos.
 *   acento   h=${H_ACENTO}°  el turquesa que YA llevan las camisetas de hero y blog.
 *
 * NADA se deriva de --marble-warm: en obsidiana.css valia #00D4FF, cian
 * electrico, y cualquier efecto derivado daba halo de neon en las 19 paginas EN.
 */
:root {
${Object.entries(T).map(([k, v]) => `  ${k}: ${v};`).join('\n')}

  /* Bordes: sobre --white, para que sigan al texto y no al fondo. */
  --border: rgba(247, 248, 250, 0.08);
  --border-hover: rgba(247, 248, 250, 0.16);

  /* Campo de color de cada panel, sacado de su propio fondo desenfocado. */
${Object.entries(paneles).map(([k, v]) => `  --panel-${k}: ${v.hex};`).join('\n')}

  --radius: 2px;
  --transition: 300ms ease;
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', sans-serif;
}
`;
writeFileSync(OUT, css);

console.log(`\n=== paleta derivada de las 5 fotos ===\n`);
for (const [k, v] of Object.entries(T)) {
  const o = rgbToOklch(...parse(v));
  console.log(`  ${k.padEnd(17)} ${v}   L=${o.L.toFixed(3)} C=${o.C.toFixed(3)} h=${o.h.toFixed(0)}°`);
}
console.log('');
for (const [k, v] of Object.entries(paneles)) console.log(`  --panel-${k.padEnd(11)} ${v.hex}   L=${v.L.toFixed(3)} tono dominante ${v.h}°`);

console.log(`\n=== contraste WCAG ===\n`);
let fallos = 0;
const pares = [
  ['--white', '--bg', 4.5], ['--white', '--bg-alt', 4.5], ['--white', '--surface', 4.5],
  ['--gray-light', '--bg', 4.5], ['--gray', '--bg', 4.5], ['--gray', '--surface', 4.5],
  ['--gray-dark', '--bg', 4.5], ['--gray-dark', '--surface', 4.5],
  ['--accent', '--bg', 4.5], ['--accent', '--surface', 4.5],
  ['--accent-strong', '--bg', 3.0],
];
for (const [fg, bg, min] of pares) {
  const r = ratio(T[fg], T[bg]);
  const bien = r >= min;
  if (!bien) fallos++;
  console.log(`  ${fg.padEnd(17)} sobre ${bg.padEnd(17)} ${r.toFixed(2)}:1  (min ${min})  ${bien ? 'OK' : 'FALLA'}`);
}
// Informativo, NO criterio: el texto se apoya en el scrim, no en el campo de
// color. El alpha necesario lo mide tasks/contrast.mjs sobre la foto real.
for (const [slug, c] of Object.entries(paneles)) {
  console.log(`  ${'--white'.padEnd(17)} sobre --panel-${slug.padEnd(10)} ${ratio(T['--white'], c.hex).toFixed(2)}:1  (informativo: el texto va sobre el scrim)`);
}
console.log(`\n-> ${OUT}`);
console.log(fallos ? `\n${fallos} PARES SIN CUMPLIR AA` : `\nTODOS LOS PARES CUMPLEN AA`);
process.exit(fallos ? 1 : 0);
