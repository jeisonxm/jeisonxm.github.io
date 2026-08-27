// contrast.mjs — cuanto scrim hace falta para que el texto cumpla WCAG SOBRE LA
// FOTO REAL, en las dos versiones.
//
// No dice "el color pasa": los colores planos ya los verifica maketokens.mjs.
// Dice lo unico que no se puede saber sin mirar los pixeles: que opacidad
// necesita el scrim en cada zona de texto para que el contraste aguante sobre la
// zona MAS CLARA que toca ese texto (percentil 92 — una mancha clara puntual
// rompe el contraste aunque la media pase).
//
// Version A = fondo desenfocado + figura recortada.  Version B = la foto entera.
// El resultado es el numero que T5 tiene que poner en el scrim.
//
//   node tasks/contrast.mjs

import { readFileSync } from 'node:fs';
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
const DIR = 'src/images/panels';
const geo = JSON.parse(readFileSync(path.join(HERE, 'pipeline/figs-geometry.json'), 'utf8'));

// Una sola fuente de verdad: se leen del archivo de tokens, no se copian.
const css = readFileSync('src/styles/tokens.css', 'utf8');
const token = (n) => (css.match(new RegExp(`${n}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1];
const TEXTO = token('--white'), SCRIM = token('--bg');
if (!TEXTO || !SCRIM) throw new Error('no encuentro --white/--bg en tokens.css');

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const Lt = lum(...parse(TEXTO));
const [sr, sg, sb] = parse(SCRIM);

// Zonas donde cae texto, en fracciones del panel.
const ZONAS = {
  hero:    { 'titulo+sub (grande)': [0.08, 0.30, 0.60, 0.62], 'stats (cuerpo)': [0.08, 0.82, 0.42, 0.95] },
  about:   { 'titulo (grande)': [0.08, 0.14, 0.55, 0.28], 'parrafos (cuerpo)': [0.08, 0.30, 0.52, 0.85] },
  skills:  { 'titulo (grande)': [0.08, 0.14, 0.55, 0.28], 'cards (cuerpo)': [0.08, 0.32, 0.92, 0.85] },
  blog:    { 'titulo (grande)': [0.08, 0.16, 0.55, 0.30], 'intro (cuerpo)': [0.08, 0.32, 0.75, 0.75] },
  contact: { 'titulo (grande)': [0.08, 0.16, 0.55, 0.30], 'form (cuerpo)': [0.08, 0.34, 0.85, 0.80] },
};

const PW = 806, PH = 454;   // panel 16:9; basta para estadistica de luminancia
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; };

function alphaNecesario(px, objetivo) {
  for (let a = 0; a <= 100; a++) {
    const al = a / 100;
    const peor = pct(px.map(([r, g, b]) =>
      lum(al * sr + (1 - al) * r, al * sg + (1 - al) * g, al * sb + (1 - al) * b)), 0.92);
    if (ratio(Lt, peor) >= objetivo) return { alpha: al, ratio: +ratio(Lt, peor).toFixed(2) };
  }
  return { alpha: 1, ratio: 0 };
}

// El scrim solo puede llegar hasta donde la foto siga viendose. Mas alla de
// esto no es un scrim: es tapar la foto, que es justo lo que no se quiere.
const ALPHA_MAX = 0.85;

async function panelA(slug) {
  const l1 = await sharp(path.join(DIR, `${slug}-l1l320.avif`)).resize(PW, PH, { fit: 'cover' }).png().toBuffer();
  const fig = await sharp(path.join(DIR, `${slug}-fig1800.webp`)).resize({ height: PH }).png().toBuffer();
  const fm = await sharp(fig).metadata();
  return sharp(l1).composite([{ input: fig, left: Math.round(PW * 0.68 - fm.width / 2), top: 0 }])
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
}
const panelB = (slug) => sharp(path.join(DIR, `${slug}-b2048.avif`))
  .resize(PW, PH, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

console.log(`\n  Alpha minimo del scrim para cumplir WCAG sobre la foto real`);
console.log(`  texto ${TEXTO}   scrim ${SCRIM}   (percentil 92 = la zona mas clara que toca el texto)\n`);

let fallos = 0;
const peorPorVersion = { A: 0, B: 0 };
for (const fig of geo.figuras) {
  const slug = fig.slug;
  const versiones = { A: await panelA(slug), B: await panelB(slug) };
  console.log(`  ${slug.toUpperCase()}`);
  for (const [zn, [x0, y0, x1, y1]] of Object.entries(ZONAS[slug])) {
    const grande = zn.includes('grande');
    const objetivo = grande ? 3.0 : 4.5;
    const linea = [];
    for (const [v, { data, info }] of Object.entries(versiones)) {
      const px = [];
      for (let y = Math.floor(y0 * info.height); y < y1 * info.height; y++)
        for (let x = Math.floor(x0 * info.width); x < x1 * info.width; x++) {
          const o = (y * info.width + x) * info.channels;
          px.push([data[o], data[o + 1], data[o + 2]]);
        }
      const r = alphaNecesario(px, objetivo);
      peorPorVersion[v] = Math.max(peorPorVersion[v], r.alpha);
      if (r.alpha > ALPHA_MAX) fallos++;
      linea.push(`${v} alpha >= ${r.alpha.toFixed(2)}${r.alpha > ALPHA_MAX ? ' EXCEDE' : ''}`);
    }
    console.log(`    ${zn.padEnd(22)} objetivo ${objetivo}:1   ${linea.join('   ')}`);
  }
  console.log('');
}
console.log(`  scrim que hay que usar:  Version A ${peorPorVersion.A.toFixed(2)}   Version B ${peorPorVersion.B.toFixed(2)}`);
console.log(`  (tope ${ALPHA_MAX}: por encima ya no es un scrim, es tapar la foto)`);
console.log(fallos ? `\n  ${fallos} ZONAS SIN CUMPLIR` : `\n  TODAS LAS ZONAS CUMPLEN AA EN LAS DOS VERSIONES`);
process.exit(fallos ? 1 : 0);
