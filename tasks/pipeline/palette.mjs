// palette.mjs — de que color son DE VERDAD las 5 fotos.
//
// La paleta actual salio de unas estatuas de IA que ya se borraron: vive en
// 10-19% de saturacion y tono 30-37°, mientras las fotos llegan a 47% con
// turquesa fuerte y verdes de trail. Esa es la raiz de "las fotos no combinan"
// (plan §2.9). Aqui se mide, en OKLCh, que hay realmente en cada capa:
//
//   figura  -> lo que lleva puesto: camiseta, gorra, dorsal, piel
//   fondo   -> el ambiente: asfalto, vegetacion, cielo
//
// OKLCh y no HSL: en HSL un amarillo y un azul con la misma "L" no se parecen
// en nada, y una paleta elegida ahi se desequilibra sola.
//
//   node palette.mjs [dir]

import path from 'node:path';
import { readFileSync } from 'node:fs';
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

// --- sRGB <-> OKLCh -----------------------------------------------------------
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const unlin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklch(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.hypot(A, Bb);
  let h = Math.atan2(Bb, A) * 180 / Math.PI; if (h < 0) h += 360;
  return { L, C, h };
}
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
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

// --- histograma de tono, ponderado por croma y area ---------------------------
function analizar(data, info, soloOpaco) {
  const ch = info.channels;
  const bins = new Array(36).fill(0);           // 10° por bin
  const binC = new Array(36).fill(0), binL = new Array(36).fill(0);
  let n = 0, sumL = 0, sumC = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    if (soloOpaco && ch === 4 && data[i * ch + 3] < 250) continue;
    const { L, C, h } = rgbToOklch(data[i * ch], data[i * ch + 1], data[i * ch + 2]);
    n++; sumL += L; sumC += C;
    if (C < 0.02) continue;                     // gris: no vota tono
    const b = Math.min(35, Math.floor(h / 10));
    bins[b] += C; binC[b] += C; binL[b] += L;
  }
  const total = bins.reduce((a, x) => a + x, 0) || 1;
  const top = bins.map((v, i) => ({ tono: i * 10 + 5, peso: v / total,
      C: binC[i] ? binC[i] / (bins[i] / (binC[i] / (bins[i] || 1)) || 1) : 0,
      Cmed: bins[i] ? binC[i] / (bins[i] / (binC[i] || 1) || 1) : 0 }))
    .sort((a, b) => b.peso - a.peso).slice(0, 4);
  return { n, Lmed: sumL / n, Cmed: sumC / n, top };
}

console.log('\n=== De que color son las 5 fotos (OKLCh) ===\n');
const acum = { fig: [], bg: [] };
for (const fig of geo.figuras) {
  for (const [capa, file, soloOpaco] of [
    ['figura', `${fig.slug}-fig1800.webp`, true],
    ['fondo ', `${fig.slug}-l1-320.webp`, false],
  ]) {
    const r = await sharp(path.join(DIR, file)).ensureAlpha()
      .resize({ width: 200 }).raw().toBuffer({ resolveWithObject: true });
    const a = analizar(r.data, r.info, soloOpaco);
    acum[capa === 'figura' ? 'fig' : 'bg'].push(a);
    console.log(`${fig.slug.padEnd(8)} ${capa}  L=${a.Lmed.toFixed(3)}  C=${a.Cmed.toFixed(3)}  ` +
      `tonos: ${a.top.map((t) => `${t.tono}°(${(100 * t.peso).toFixed(0)}%)`).join(' ')}`);
  }
}

const med = (xs, k) => xs.reduce((a, x) => a + x[k], 0) / xs.length;
console.log(`\nfiguras: L medio ${med(acum.fig, 'Lmed').toFixed(3)}  C medio ${med(acum.fig, 'Cmed').toFixed(3)}`);
console.log(`fondos : L medio ${med(acum.bg, 'Lmed').toFixed(3)}  C medio ${med(acum.bg, 'Cmed').toFixed(3)}`);

// tonos dominantes agregados
const globales = new Array(36).fill(0);
for (const a of [...acum.fig, ...acum.bg]) for (const t of a.top) globales[Math.floor(t.tono / 10)] += t.peso;
const orden = globales.map((v, i) => [i * 10 + 5, v]).sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log(`\ntonos dominantes del conjunto: ${orden.map(([h, v]) => `${h}°(${v.toFixed(2)})`).join('  ')}`);

console.log('\n--- paleta actual, para comparar ---');
for (const [n, c] of Object.entries({ '--bg': '#2C2824', '--surface': '#3D3831',
  '--accent': '#D9D2C7', '--marble-warm': '#C4B9A8' })) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const o = rgbToOklch(r, g, b);
  console.log(`  ${n.padEnd(14)} ${c}  L=${o.L.toFixed(3)} C=${o.C.toFixed(3)} h=${o.h.toFixed(0)}°`);
}
export { rgbToOklch, oklchToRgb, hex };
