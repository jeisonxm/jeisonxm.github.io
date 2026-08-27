// stage_d_normalize.mjs — T2: normalizar escalas y arreglar 764.
//
// POR QUE EXISTE ESTA ETAPA
// Los recortes de `cutouts/` son tecnicamente correctos (1200x1800, pesos en
// rango, push-pull, 0 flips de alfa, borde de 2-3 px) pero estan normalizados
// POR ALTURA DE IMAGEN: cada figura quedo a la escala que tenia en su foto. Las
// cabezas van de 180 px (hero) a 385 px (sobre-mi): 2.14x de dispersion. En
// paneles contiguos eso se lee como descuido (plan §2.6).
//
// POR QUE SE VUELVE AL ORIGINAL Y NO SE REESCALA EL RECORTE
// Medido: reescalar hero (1.344x) y skills (1.322x) desde el h1800 cuesta
// -16.0% y -28.7% de energia de gradiente contra remuestrear una sola vez desde
// el original. Eso es blandura visible, y la Version A existe justamente para
// dar HD real. Asi que se recompone desde el JPEG original a la resolucion de
// destino. Como todos los originales son 2:3 igual que el recorte, el alfa mapea
// por escala uniforme, sin recorte de por medio.
//
// EL DEFRINGE HAY QUE REHACERLO
// El RGB del recorte ya venia defringed, pero se descarta junto con su
// resolucion. El original esta contaminado en el borde, asi que se replica
// stage_b2_defringe.py: el flood de color del cuerpo hacia afuera por
// vecino-mas-cercano. Alli era scipy.ndimage.distance_transform_edt; aqui no hay
// numpy ni scipy, asi que va una EDT de dos pasadas con propagacion de indices
// (Danielsson). Es exacta, O(N), y corre sobre la resolucion de DESTINO
// (~3.9 Mpx) en vez de la del original (10.7 Mpx).
//
// Lo que NO se rehace: la erosion `a2 = clip((a-T)/(1-T))` con T=0.35. El alfa
// del recorte YA es a2. Volver a aplicarla erosionaria dos veces y se comeria el
// tubo del chaleco de 285, que es lo primero que se pierde (plan §T2).
//
//   node stage_d_normalize.mjs <originales> <recortes> <salida> [--fade285=180]

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
const CUT  = process.argv[3] || '/home/archy/img-scratch/cutouts';
const OUT  = process.argv[4] || '/home/archy/img-scratch/figs';
// 285 esta cortada a la altura del muslo en la foto original. Sin fundido eso es
// una amputacion recta en mitad del lienzo: comparado lado a lado sobre claro y
// sobre oscuro, se lee como defecto. Con 220 px de fundido la figura se disuelve
// en el panel, que ademas es lo que pidio el dueno ("que las fotos se unan con
// el fondo"). Por eso va por defecto; --fade285=0 lo desactiva.
const FADE285 = +((process.argv.find((a) => a.startsWith('--fade285=')) || '=220').split('=')[1]);

const CANVAS_W = 1200, CANVAS_H = 1800;
// Mediana de las cabezas actuales (180/183/242/246/385). Elegida para que blog y
// contacto queden a ~1.00x y no se remuestreen sin necesidad.
const TARGET_HEAD = 242;
const BASELINE_Y = CANVAS_H - 1;
// Alto aparente medido en las 4 figuras de cuerpo entero: 7.07/7.32/7.11/6.47
// cabezas. Sirve para extrapolar donde estarian los pies de 285, que esta
// cortada a la altura del muslo y no tiene linea de base propia.
const HEADS_PER_BODY = 7.0;

// `slug` es el que ya usa el sitio en src/images/panels/ (hero, about, skills,
// blog, contact). No se inventa uno nuevo.
const FIGS = [
  { panel: 'hero',     slug: 'hero',    id: '1164',   orig: '006-CircuitoCity8k-oneflashphoto-1164.jpg' },
  { panel: 'sobre-mi', slug: 'about',   id: '285',    orig: '007-CanajaguaTrail-jorgejuradofoto-285.jpg' },
  { panel: 'skills',   slug: 'skills',  id: '103865', orig: '006-CanajaguaTrail-achtarfoto-103865.jpg' },
  { panel: 'blog',     slug: 'blog',    id: '764',    orig: '004-CircuitoCity8k-momentumphotography93-764.jpg' },
  { panel: 'contacto', slug: 'contact', id: '533',    orig: '9192443969772-CircuitoSummer21k-jorgejuradofoto-533.jpg.jpg' },
];

// --- retoque manual de 764 (plan §2.6: "~1 min de borrado") -------------------
// Queda una zapatilla de otro corredor flotando tras la pantorrilla derecha:
// puntera oscura + suela blanca, x 958-1005, y 1428-1490 en coordenadas del
// recorte. El filtro de componente conexa no la quito porque TOCA la pantorrilla
// en la franja y 1436-1470. El borde real de la pantorrilla va de x=958 en
// y=1424 a x=946 en y=1494; se interpola recto y se borra todo lo que quede a la
// derecha. Una pantorrilla un pelo mas recta es invisible; un fragmento de
// zapatilla flotando no lo es.
function retoque764(alpha, W) {
  const Y0 = 1425, Y1 = 1493, X0 = 958, X1 = 946;
  let borrados = 0;
  for (let y = Y0; y <= Y1; y++) {
    const borde = X0 + (X1 - X0) * (y - Y0) / (Y1 - Y0);
    for (let x = Math.floor(borde) - 1; x < W; x++) {
      const i = y * W + x;
      if (!alpha[i]) continue;
      // 2 px de rampa para que el nuevo borde tenga la misma blandura que el resto
      const t = x - borde;
      const f = t <= -1 ? 1 : t <= 0 ? 0.5 : 0;
      const nuevo = Math.round(alpha[i] * f);
      if (nuevo !== alpha[i]) borrados++;
      alpha[i] = nuevo;
    }
  }
  return borrados;
}

// --- geometria de la figura --------------------------------------------------
function medir(alpha, W, H) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (alpha[y * W + x] > 10) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const widths = [];
  for (let y = y0; y <= y1; y++) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (alpha[y * W + x] > 128) n++;
    widths.push(n);
  }
  // El cuello es el minimo local de anchura en la franja alta: separa cabeza de
  // hombros sin tener que reconocer una cara.
  const hh = widths.length, lo = Math.round(hh * 0.04), hi = Math.round(hh * 0.35);
  let best = lo, bv = Infinity;
  for (let i = lo; i <= hi; i++) if (widths[i] < bv) { bv = widths[i]; best = i; }
  return { x0, x1, y0, y1, cuello: y0 + best, cabeza: best,
           tocaDerecha: x1 >= W - 2, tocaIzquierda: x0 <= 1,
           tocaAbajo: y1 >= H - 2, tocaArriba: y0 <= 1 };
}

// --- flood de color por vecino mas cercano (EDT de 2 pasadas) ----------------
// Equivalente a scipy.ndimage.distance_transform_edt(return_indices=True) sobre
// ~core. Propaga el vector al nucleo mas cercano; dos barridos rasterizados.
function floodDesdeNucleo(rgb, alpha, W, H) {
  const N = W * H, INF = 0x3fffffff;
  const dist = new Int32Array(N).fill(INF);
  const vx = new Int32Array(N), vy = new Int32Array(N);
  for (let i = 0; i < N; i++) if (alpha[i] >= 254) { dist[i] = 0; vx[i] = 0; vy[i] = 0; }

  const relax = (i, ni, ox, oy) => {
    if (dist[ni] === INF) return;
    const ndx = vx[ni] + ox, ndy = vy[ni] + oy;
    const d = ndx * ndx + ndy * ndy;
    if (d < dist[i]) { dist[i] = d; vx[i] = ndx; vy[i] = ndy; }
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (dist[i] === 0) continue;
    if (x > 0) relax(i, i - 1, 1, 0);
    if (y > 0) relax(i, i - W, 0, 1);
    if (x > 0 && y > 0) relax(i, i - W - 1, 1, 1);
    if (x < W - 1 && y > 0) relax(i, i - W + 1, -1, 1);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (dist[i] === 0) continue;
    if (x < W - 1) relax(i, i + 1, -1, 0);
    if (y < H - 1) relax(i, i + W, 0, -1);
    if (x < W - 1 && y < H - 1) relax(i, i + W + 1, -1, -1);
    if (x > 0 && y < H - 1) relax(i, i + W - 1, 1, -1);
  }

  const out = new Uint8Array(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let sx = x - vx[i], sy = y - vy[i];
    if (dist[i] === INF) { sx = x; sy = y; }           // no habia nucleo: se queda
    const s = (sy * W + sx) * 3;
    out[i * 3] = rgb[s]; out[i * 3 + 1] = rgb[s + 1]; out[i * 3 + 2] = rgb[s + 2];
  }
  return out;
}

// --- principal ---------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const bases = [...new Set(readdirSync(CUT).filter((f) => /\.h\d+\.webp$/.test(f))
  .map((f) => f.replace(/\.webp$/, '')))];

const medidas = [];
for (const fig of FIGS) {
  const base = bases.find((b) => b.includes('-' + fig.id + '.'));
  if (!base) throw new Error(`falta el recorte de ${fig.id}`);
  const origPath = path.join(ORIG, fig.orig);
  if (!existsSync(origPath)) throw new Error(`falta el original ${origPath}`);

  // 1. alfa del recorte (ya es a2: T=0.35 aplicada)
  const cut = await sharp(path.join(CUT, base + '.webp')).ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const CW = cut.info.width, CH = cut.info.height;
  const alpha = new Uint8Array(CW * CH);
  for (let i = 0; i < CW * CH; i++) alpha[i] = cut.data[i * 4 + 3];

  let borrados = 0;
  if (fig.id === '764') borrados = retoque764(alpha, CW);

  const m = medir(alpha, CW, CH);
  const s = TARGET_HEAD / m.cabeza;
  const Hf = Math.round(CH * s);
  const om = await sharp(origPath).metadata();
  const Wf = Math.round(om.width * Hf / om.height);

  // 2. RGB del original y alfa del recorte, ambos a la resolucion de DESTINO.
  //    El original se REDUCE (nunca se amplia): de 4000 a Hf.
  // Las dos geometrias se AFIRMAN, no se suponen. Sin `toColourspace('b-w')`
  // sharp promueve la imagen de un canal a sRGB al reescalar y devuelve 3
  // canales: el alfa se leia como tripletas interleavadas y salian figuras
  // fantasma con rayado horizontal. Se veia raro, pero no fallaba solo.
  const rgbR = await sharp(origPath).removeAlpha()
    .resize({ width: Wf, height: Hf, fit: 'fill', kernel: 'lanczos3' })
    .raw().toBuffer({ resolveWithObject: true });
  const aR = await sharp(Buffer.from(alpha), { raw: { width: CW, height: CH, channels: 1 } })
    .resize({ width: Wf, height: Hf, fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  const geo = (r, ch, que) => {
    if (r.info.width !== Wf || r.info.height !== Hf || r.info.channels !== ch) {
      throw new Error(`${que}: esperaba ${Wf}x${Hf}x${ch}, sharp devolvio ` +
        `${r.info.width}x${r.info.height}x${r.info.channels}`);
    }
    return r.data;
  };
  const rgbBuf = geo(rgbR, 3, 'RGB del original');
  const aBuf = geo(aR, 1, 'alfa del recorte');

  // 3. defringe: color del cuerpo hacia afuera, mezclado dentro de la banda blanda
  const flooded = floodDesdeNucleo(rgbBuf, aBuf, Wf, Hf);
  const rgba = Buffer.alloc(Wf * Hf * 4);
  for (let i = 0; i < Wf * Hf; i++) {
    const a = aBuf[i] / 255;
    const w = Math.max(0, Math.min(1, (a - 0.02) / 0.93));
    const core = aBuf[i] >= 254;
    for (let c = 0; c < 3; c++) {
      rgba[i * 4 + c] = core ? rgbBuf[i * 3 + c]
        : Math.round(rgbBuf[i * 3 + c] * w + flooded[i * 3 + c] * (1 - w));
    }
    rgba[i * 4 + 3] = aBuf[i];
  }

  // 4. colocacion. Un corte que hoy vive en el borde del lienzo TIENE que
  //    seguir en el borde: moverlo hacia dentro convierte un encuadre en una
  //    amputacion visible.
  const figY1 = m.y1 * s, figY0 = m.y0 * s;
  const cx = ((m.x0 + m.x1) / 2) * s;
  let dy;
  if (m.tocaAbajo && fig.id === '285') {
    // Sin pies: se extrapola donde estarian y se ancla la cabeza ahi.
    dy = Math.round((BASELINE_Y - HEADS_PER_BODY * TARGET_HEAD) - figY0);
  } else {
    dy = Math.round(BASELINE_Y - figY1);
  }
  let dx = Math.round(CANVAS_W / 2 - cx);
  if (m.tocaDerecha) dx = Math.round(CANVAS_W - 1 - m.x1 * s);
  if (m.tocaIzquierda) dx = Math.round(-m.x0 * s);

  const sx0 = Math.max(0, -dx), sy0 = Math.max(0, -dy);
  const sx1 = Math.min(Wf, -dx + CANVAS_W), sy1 = Math.min(Hf, -dy + CANVAS_H);
  const recorte = await sharp(rgba, { raw: { width: Wf, height: Hf, channels: 4 } })
    .extract({ left: sx0, top: sy0, width: sx1 - sx0, height: sy1 - sy0 })
    .png().toBuffer();

  let lienzo = sharp({ create: { width: CANVAS_W, height: CANVAS_H, channels: 4,
                                 background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: recorte, left: dx + sx0, top: dy + sy0 }]);

  // 5. 285 queda cortada a la altura del muslo. Sin fundido eso es una
  //    amputacion recta en mitad del lienzo.
  if (fig.id === '285' && FADE285 > 0) {
    const buf = await lienzo.raw().toBuffer();
    const finFig = Math.min(CANVAS_H - 1, Math.round(m.y1 * s) + dy);
    const iniFade = finFig - FADE285;
    for (let y = Math.max(0, iniFade); y <= finFig; y++) {
      const f = Math.max(0, Math.min(1, (finFig - y) / FADE285));
      for (let x = 0; x < CANVAS_W; x++) {
        const i = (y * CANVAS_W + x) * 4 + 3;
        buf[i] = Math.round(buf[i] * f);
      }
    }
    lienzo = sharp(buf, { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4 } });
  }

  const png = await lienzo.png().toBuffer();
  const nombre = `${fig.slug}-fig${CANVAS_H}`;
  for (const [ext, opts] of [
    ['avif', { quality: 50, effort: 4, chromaSubsampling: '4:2:0' }],
    ['webp', { quality: 80, effort: 5, alphaQuality: 90 }],
  ]) {
    await sharp(png).toFormat(ext, opts).toFile(path.join(OUT, `${nombre}.${ext}`));
  }

  medidas.push({ panel: fig.panel, slug: fig.slug, id: fig.id, orig: fig.orig,
                 cabezaAntes: m.cabeza, cabezaDestino: TARGET_HEAD, escala: s,
                 Wf, Hf, dx, dy, lienzo: [CANVAS_W, CANVAS_H], borrados,
                 trabajo: `${Wf}x${Hf}`,
                 bordes: [m.tocaIzquierda && 'izq', m.tocaDerecha && 'der',
                          m.tocaArriba && 'arr', m.tocaAbajo && 'abj'].filter(Boolean).join(',') || '-' });
  console.log(`${fig.panel.padEnd(9)} cabeza ${String(m.cabeza).padStart(3)} -> ${TARGET_HEAD}  ` +
              `escala ${s.toFixed(3)}x  trabajo ${Wf}x${Hf}  dx=${dx} dy=${dy}  ` +
              `bordes tocados: ${medidas.at(-1).bordes}` + (borrados ? `  retoque: ${borrados} px` : ''));
}
// La geometria se publica como contrato, no se recalcula en otra etapa.
// stage_e la necesita para alinear el fondo desenfocado con SU figura, y T5 la
// necesita para saber a que escala esta cada figura dentro de su lienzo.
const GEO = path.join(path.dirname(new URL(import.meta.url).pathname), 'figs-geometry.json');
writeFileSync(GEO, JSON.stringify({
  que: 'Transformacion aplicada a cada figura por stage_d_normalize.mjs.',
  como: 'El original se lleva a Wf x Hf (siempre reduciendo) y se pega en el lienzo en (dx, dy).',
  lienzo: [CANVAS_W, CANVAS_H], cabezaDestino: TARGET_HEAD, baseline: BASELINE_Y,
  figuras: medidas.map((m) => ({
    slug: m.slug, id: m.id, orig: m.orig, escala: +m.escala.toFixed(6),
    Wf: m.Wf, Hf: m.Hf, dx: m.dx, dy: m.dy,
    cabezaAntes: m.cabezaAntes, cabezaDestino: m.cabezaDestino, retoquePx: m.borrados,
  })),
}, null, 2) + '\n');
console.log(`\n-> ${OUT}`);
console.log(`-> ${GEO}`);
