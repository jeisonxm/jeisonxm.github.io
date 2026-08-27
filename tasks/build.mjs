import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '/home/archy/jeisonxm.github.io/src/images/panels';
fs.mkdirSync(OUT, { recursive: true });

const picks = JSON.parse(fs.readFileSync('picks.json','utf8'));

const LAND = [[1536,864,110_000,160_000],[1024,576,55_000,80_000],[640,360,25_000,36_000]];
const PORT = [[828,1472,85_000,120_000],[640,1138,52_000,74_000]];

// Codifica bajando calidad hasta entrar en presupuesto. Estas fotos van detrás
// de un scrim y bajo texto: perder unos puntos de calidad no se ve, pasarse de
// presupuesto sí se nota en la carga.
async function encode(pipeline, base, fmt, startQ, budget) {
  for (let q = startQ; q >= 20; q -= 5) {
    const buf = fmt === 'avif'
      ? await pipeline.clone().avif({ quality:q, effort:6, chromaSubsampling:'4:2:0' }).toBuffer()
      : await pipeline.clone().webp({ quality:q, effort:6, smartSubsample:true }).toBuffer();
    if (buf.length <= budget || q === 20) {
      fs.writeFileSync(`${base}.${fmt}`, buf);
      return { q, size: buf.length, ok: buf.length <= budget };
    }
  }
}

const report = [];
const colors = {};

for (const [slug, p] of Object.entries(picks)) {
  const src = 'originals/' + p.file;
  const m = await sharp(src).metadata();
  const band = Math.round(m.width * 9 / 16);
  const top = Math.min(Math.round(m.height * p.topFrac), m.height - band);

  // --- apaisado: banda dirigida a mano, luego escalar ---
  for (const [w,h,ba,bw] of LAND) {
    const pipe = sharp(src).rotate()
      .extract({ left:0, top, width:m.width, height:band })
      .resize(w, h, { fit:'cover' });
    const a = await encode(pipe, path.join(OUT, `${slug}-l${w}`), 'avif', 72, ba);
    const b = await encode(pipe, path.join(OUT, `${slug}-l${w}`), 'webp', 84, bw);
    report.push([`${slug}-l${w}`, a, b, ba, bw]);
  }

  // --- vertical: la fuente ya es 2:3, el recorte es leve; saliencia basta ---
  for (const [w,h,ba,bw] of PORT) {
    const pipe = sharp(src).rotate()
      .resize(w, h, { fit:'cover', position: sharp.strategy.attention });
    const a = await encode(pipe, path.join(OUT, `${slug}-p${w}`), 'avif', 72, ba);
    const b = await encode(pipe, path.join(OUT, `${slug}-p${w}`), 'webp', 84, bw);
    report.push([`${slug}-p${w}`, a, b, ba, bw]);
  }

  // --- color dominante para el placeholder de 0 bytes ---
  const { data } = await sharp(src).rotate()
    .extract({ left:0, top, width:m.width, height:band })
    .resize(1,1,{fit:'cover'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  // se oscurece un poco: el fade va de color a foto y la foto lleva brightness(.92)
  const hex = '#' + [...data].map(v => Math.round(v*0.82).toString(16).padStart(2,'0')).join('');
  colors[slug] = hex;
}

let bad = 0, total = 0;
console.log('\n  variante          AVIF (q, bytes)        WebP (q, bytes)');
console.log('  ' + '─'.repeat(64));
for (const [name,a,b,ba,bw] of report) {
  const fa = a.ok ? ' ' : '!';
  const fb = b.ok ? ' ' : '!';
  if (!a.ok || !b.ok) bad++;
  total += a.size + b.size;
  console.log(`  ${name.padEnd(16)} ${fa}q${String(a.q).padStart(2)}  ${String(a.size).padStart(7)}  (≤${ba})   ${fb}q${String(b.q).padStart(2)}  ${String(b.size).padStart(7)}  (≤${bw})`);
}
console.log('  ' + '─'.repeat(64));
console.log(`  ${report.length*2} archivos, ${(total/1024/1024).toFixed(2)} MB en total, ${bad} fuera de presupuesto`);
console.log('\n  colores dominantes (para --panel-bg):');
for (const [k,v] of Object.entries(colors)) console.log(`    ${k.padEnd(9)} ${v}`);
fs.writeFileSync('colors.json', JSON.stringify(colors,null,1));
