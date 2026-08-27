// stage_e_background.mjs — T3: capa L1 (fondo desenfocado) y fotos de la Version B.
//
// L1 es la MISMA foto que la figura, muy desenfocada, detras de ella (plan §1).
// Eso obliga a corregir algo: `tasks/picks.json` asigna a los paneles fotos que
// §2.6 ya no usa — a skills le da `763`, que esta marcada NO PUBLICABLE, y a blog
// le da `886`. Aqui la fuente de verdad es la asignacion de §2.6, la misma que
// las figuras de T2.
//
// L1 USA LA MISMA TRANSFORMACION QUE SU FIGURA, leida de figs-geometry.json.
// Esto no es un detalle: T2 movio y reescalo cada figura para normalizar las
// cabezas, asi que un fondo encuadrado "como en la foto original" ya NO cae
// donde cae su figura. Montado y mirado, el resultado era un FANTASMA muy
// visible — la misma persona borrosa al lado de la nitida. El plan lo daba por
// destruido por el blur, pero advertia que eso era "un juicio, no una medicion".
// Medido: no lo destruye. Con la transformacion compartida, la figura nitida
// tapa su propio borroso en p=0 y el paralaje los separa despues, que es
// justamente el efecto de profundidad que se busca.
//
// Donde la figura se redujo (285 va a 0.629x) el cuadro no llega a cubrir el
// lienzo: le faltan 445 px por la izquierda y 792 por abajo, dos tercios del
// area. Espejar ahi NO sirve — montado y mirado, sale un caleidoscopio con la
// cara y el dorsal repetidos en simetria, que se lee como error y no como
// bokeh. Se replica el pixel del borde: bajo sigma 6 eso es un degradado suave,
// que es exactamente lo que una capa desenfocada tiene que ser.
//
// EL BLUR Y EL COLOR VAN HORNEADOS, nunca en CSS (plan §2.1): `filter` obliga a
// una superficie fuera de pantalla y una gaussiana de dos pasadas por capa y por
// frame, y rompe la ruta rapida de imagen compuesta. Se hornea exactamente lo
// que hoy hace style.css:293 — brightness(.92) contrast(1.05) saturate(.9).
//
//   node stage_e_background.mjs <originales> <recortes> <salida>

import { mkdirSync, existsSync } from 'node:fs';
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

const ORIG = process.argv[2] || '/home/archy/img-scratch/originals';
const OUT  = process.argv[3] || 'src/images/panels';
const GEO  = path.join(path.dirname(new URL(import.meta.url).pathname), 'figs-geometry.json');

const L1_W = 320;          // §2.7: a 320 px, bajo blur fuerte, es indistinguible de 1536
const L1_BLUR = 6;         // sigma horneado a 320 px (~30 al escalar al panel)
const B_MAX = 2048;        // Version B: lado mayor

const { readFileSync } = await import('node:fs');
if (!existsSync(GEO)) throw new Error(`falta ${GEO}: corre antes stage_d_normalize.mjs`);
const geo = JSON.parse(readFileSync(GEO, 'utf8'));
const [CANVAS_W, CANVAS_H] = geo.lienzo;

// --- los filtros de style.css:293, horneados exactamente -----------------------
// CSS aplica en orden: brightness -> contrast -> saturate, sobre sRGB.
// brightness(b): v*b.  contrast(c): (v-0.5)*c+0.5.  Juntas dan una sola lineal.
const B = 0.92, C = 1.05, S = 0.9;
const LIN_A = B * C, LIN_B = (0.5 - 0.5 * C) * 255;
// saturate(s) es la matriz de feColorMatrix, no el LCh de libvips.modulate:
// se aplica con recomb para que coincida con lo que pinta el navegador hoy.
const SAT = [
  [0.213 + 0.787 * S, 0.715 - 0.715 * S, 0.072 - 0.072 * S],
  [0.213 - 0.213 * S, 0.715 + 0.285 * S, 0.072 - 0.072 * S],
  [0.213 - 0.213 * S, 0.715 - 0.715 * S, 0.072 + 0.928 * S],
];
// CSS acota a [0,255] DESPUES DE CADA funcion de filtro. Encadenar
// .linear().recomb() en un solo pipeline NO es equivalente: un pixel oscuro se
// va a negativo con contrast, el navegador lo acota a 0 y satura eso, mientras
// que el pipeline fusionado satura el negativo. Medido contra Chromium real
// (checkbake.mjs): fusionado maxΔ=7/255, acotado entre medias maxΔ=2/255, que
// es redondeo de 8 bits. Por eso se materializa a PNG (sin perdida) en medio.
async function hornearColor(pipe) {
  const acotado = await pipe.linear(LIN_A, LIN_B).png().toBuffer();
  return sharp(acotado).recomb(SAT);
}

async function codificar(pipe, base, { avifQ, webpQ }) {
  const out = {};
  for (const [ext, opts] of [
    ['avif', { quality: avifQ, effort: 6, chromaSubsampling: '4:2:0' }],
    ['webp', { quality: webpQ, effort: 6, smartSubsample: true }],
  ]) {
    const buf = await pipe.clone().toFormat(ext, opts).toBuffer();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${base}.${ext}`, buf);
    out[ext] = buf.length;
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
const filas = [];

for (const fig of geo.figuras) {
  const src = path.join(ORIG, fig.orig);
  if (!existsSync(src)) throw new Error(`falta el original ${src}`);

  // --- L1: el cuadro entero bajo la MISMA transformacion que la figura ---
  const marco = await sharp(src).rotate()
    .resize({ width: fig.Wf, height: fig.Hf, fit: 'fill', kernel: 'lanczos3' })
    .png().toBuffer();

  // Recorte de la ventana del lienzo dentro del marco, y relleno espejado de lo
  // que el marco no alcance a cubrir.
  const sx0 = Math.max(0, -fig.dx), sy0 = Math.max(0, -fig.dy);
  const sx1 = Math.min(fig.Wf, -fig.dx + CANVAS_W), sy1 = Math.min(fig.Hf, -fig.dy + CANVAS_H);
  const dentro = await sharp(marco)
    .extract({ left: sx0, top: sy0, width: sx1 - sx0, height: sy1 - sy0 }).png().toBuffer();
  const izq = fig.dx + sx0, arr = fig.dy + sy0;
  const der = CANVAS_W - (izq + (sx1 - sx0)), abj = CANVAS_H - (arr + (sy1 - sy0));
  const cubierto = (izq | arr | der | abj) === 0;
  const lienzo = cubierto ? dentro : await sharp(dentro)
    .extend({ left: izq, top: arr, right: der, bottom: abj, extendWith: 'copy' })
    .png().toBuffer();

  const l1 = (await hornearColor(
    sharp(lienzo).resize({ width: L1_W, height: Math.round(L1_W * CANVAS_H / CANVAS_W), fit: 'fill' })
  )).blur(L1_BLUR);
  const pesosL1 = await codificar(l1, path.join(OUT, `${fig.slug}-l1-${L1_W}`), { avifQ: 35, webpQ: 45 });

  // --- Version B: la foto entera, sin recorte de sujeto, lado mayor 2048 ---
  const b = await hornearColor(sharp(src).rotate().resize({
    width: B_MAX, height: B_MAX, fit: 'inside', withoutEnlargement: true }));
  const pesosB = await codificar(b, path.join(OUT, `${fig.slug}-b${B_MAX}`), { avifQ: 50, webpQ: 72 });
  const mb = await sharp(await b.clone().png().toBuffer()).metadata();

  filas.push({ slug: fig.slug, l1: pesosL1, b: pesosB });
  console.log(`${fig.slug.padEnd(8)} foto ${fig.id.padEnd(7)} escala ${fig.escala.toFixed(3)}x  ` +
    `relleno de borde ${cubierto ? 'no hizo falta' : `izq${izq} arr${arr} der${der} abj${abj}`}  ` +
    `L1 ${pesosL1.avif}/${pesosL1.webp} B  B(${mb.width}x${mb.height}) ${pesosB.avif}/${pesosB.webp} B`);
}

const sum = (f, k) => filas.reduce((a, r) => a + r[f][k], 0);
const L1_PRESUPUESTO = 26 * 1024;
const totalL1 = sum('l1', 'avif');
console.log(`\nL1, los 5 juntos       : ${totalL1} B AVIF  /  ${sum('l1', 'webp')} B WebP` +
  `   presupuesto ${L1_PRESUPUESTO} B ${totalL1 <= L1_PRESUPUESTO ? 'OK' : 'EXCEDIDO'}`);
console.log(`Version B, los 5 juntos: ${sum('b', 'avif')} B AVIF  /  ${sum('b', 'webp')} B WebP`);
console.log(`\n-> ${OUT}`);
