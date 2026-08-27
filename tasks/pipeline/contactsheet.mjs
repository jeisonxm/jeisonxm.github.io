// contactsheet.mjs — la hoja de contacto que el plan §2.6 obliga a MIRAR.
//
// Las 5 figuras sobre los 4 campos de color donde un recorte malo se delata:
// magenta (halo y flecos), claro, oscuro (borde sucio) y calido (dominante de
// piel). Generarla no es la verificacion; mirarla si.
//
//   node contactsheet.mjs <dir-recortes> <salida.png> [--alto=240] [--guias]
//
// --guias dibuja la linea de base comun y la altura de cabeza, que es lo que
// T2 tiene que dejar consistente entre paneles contiguos.

import { existsSync, readdirSync, mkdirSync } from 'node:fs';
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

const DIR = process.argv[2] || '/home/archy/img-scratch/cutouts';
const OUT = process.argv[3] || '/tmp/contact.png';
const ALTO = +((process.argv.find((a) => a.startsWith('--alto=')) || '').split('=')[1] || 240);
const GUIAS = process.argv.includes('--guias');

const PANELES = [['hero', ['hero', '1164']], ['sobre-mi', ['about', '285']],
                 ['skills', ['skills', '103865']], ['blog', ['blog', '764']],
                 ['contacto', ['contact', '533']]];
const CAMPOS = [['magenta', '#ff00ff'], ['claro', '#f2efe9'],
                ['oscuro', '#12161c'], ['calido', '#e8b53a']];

const bases = [...new Set(readdirSync(DIR).filter((f) => /(\.h\d+|-fig\d+)\.webp$/.test(f))
  .map((f) => f.replace(/\.webp$/, '')))];

const GAP = 8, LABEL = 22;
const celdaW = Math.round(ALTO * 2 / 3);
const W = GAP + PANELES.length * (celdaW + GAP);
const H = LABEL + GAP + CAMPOS.length * (ALTO + GAP + LABEL);

const capas = [];
for (let ci = 0; ci < CAMPOS.length; ci++) {
  const [nombre, color] = CAMPOS[ci];
  const filaY = LABEL + GAP + ci * (ALTO + GAP + LABEL);
  // Banda de color de fondo para toda la fila
  capas.push({
    input: { create: { width: W - 2 * GAP, height: ALTO, channels: 4, background: color } },
    left: GAP, top: filaY,
  });
  capas.push({
    input: Buffer.from(`<svg width="${W}" height="${LABEL}"><text x="${GAP}" y="15" font-family="monospace" font-size="13" fill="#888">${nombre}  ${color}</text></svg>`),
    left: 0, top: filaY - LABEL + 4,
  });

  for (let pi = 0; pi < PANELES.length; pi++) {
    const [panel, [slug, id]] = PANELES[pi];
    const base = bases.find((b) => b === `${slug}-fig1800`) || bases.find((b) => b.includes('-' + id + '.'));
    if (!base) continue;
    const x = GAP + pi * (celdaW + GAP);
    const buf = await sharp(path.join(DIR, base + '.webp'))
      .resize({ height: ALTO, width: celdaW, fit: 'inside' }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    capas.push({ input: buf, left: x + Math.round((celdaW - meta.width) / 2), top: filaY });
  }
}
// Cabeceras de columna
for (let pi = 0; pi < PANELES.length; pi++) {
  const x = GAP + pi * (celdaW + GAP);
  capas.push({
    input: Buffer.from(`<svg width="${celdaW}" height="${LABEL}"><text x="0" y="14" font-family="monospace" font-size="13" fill="#ddd">${PANELES[pi][0]}</text></svg>`),
    left: x, top: 2,
  });
}
if (GUIAS) {
  for (let ci = 0; ci < CAMPOS.length; ci++) {
    const filaY = LABEL + GAP + ci * (ALTO + GAP + LABEL);
    capas.push({
      input: Buffer.from(`<svg width="${W}" height="${ALTO}"><line x1="0" y1="${ALTO - 1}" x2="${W}" y2="${ALTO - 1}" stroke="#00ff00" stroke-width="1" stroke-dasharray="6 4"/></svg>`),
      left: 0, top: filaY,
    });
  }
}

mkdirSync(path.dirname(OUT), { recursive: true });
await sharp({ create: { width: W, height: H, channels: 4, background: '#1b1b1b' } })
  .composite(capas).png().toFile(OUT);
console.log(`hoja de contacto -> ${OUT}  (${W}x${H})`);
