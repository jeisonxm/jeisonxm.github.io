// checkbake.mjs — ¿el color HORNEADO es el mismo que pinta el navegador hoy?
//
// style.css:293 aplica `filter: brightness(.92) contrast(1.05) saturate(.9)` en
// vivo. T3 lo hornea en el asset, porque `filter` sobre una capa a pantalla
// completa rompe la ruta rapida de imagen compuesta (plan §2.1). Hornearlo solo
// vale si da EL MISMO pixel.
//
// El riesgo concreto es saturate: `libvips.modulate` opera en LCh y el navegador
// usa la matriz de feColorMatrix. Se hornea con recomb para que coincida; esto
// lo comprueba en un motor real en vez de suponerlo.
//
//   node checkbake.mjs

import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('/home/archy/img-scratch/node_modules/sharp');
const HARNESS = process.env.PW_HARNESS || path.join(process.env.HOME, 'pw-harness');
if (!existsSync(path.join(HARNESS, 'node_modules', 'playwright'))) {
  console.error(`falta playwright en ${HARNESS}. Corre tasks/verify/run.sh setup`);
  process.exit(2);
}
const { chromium } = require(path.join(HARNESS, 'node_modules', 'playwright'));

const B = 0.92, C = 1.05, S = 0.9;
const LIN_A = B * C, LIN_B = (0.5 - 0.5 * C) * 255;
const SAT = [
  [0.213 + 0.787 * S, 0.715 - 0.715 * S, 0.072 - 0.072 * S],
  [0.213 - 0.213 * S, 0.715 + 0.285 * S, 0.072 - 0.072 * S],
  [0.213 - 0.213 * S, 0.715 - 0.715 * S, 0.072 + 0.928 * S],
];

const dir = mkdtempSync(path.join(tmpdir(), 'bake-'));
const SRC = '/home/archy/img-scratch/originals/006-CircuitoCity8k-oneflashphoto-1164.jpg';
const W = 400, H = 300;

// crudo (lo que el navegador filtrara) y horneado (lo que se sirve)
const crudo = await sharp(SRC).resize(W, H, { fit: 'cover' }).png().toBuffer();
const horneado = await sharp(crudo).linear(LIN_A, LIN_B).recomb(SAT).png().toBuffer();
// CSS acota a [0,255] DESPUES DE CADA funcion de filtro. Fusionar
// brightness+contrast en una sola lineal y saturar despues NO es equivalente:
// un pixel muy oscuro se va a negativo con contrast, el navegador lo acota a 0
// y satura eso, mientras que la version fusionada satura el negativo. Esta
// variante materializa a 8 bits entre medias para reproducir ese acotado.
const acotado = await sharp(crudo).linear(LIN_A, LIN_B).png().toBuffer();
const horneado2 = await sharp(acotado).recomb(SAT).png().toBuffer();
// y la alternativa que NO deberia coincidir: modulate en LCh
const lch = await sharp(crudo).linear(LIN_A, LIN_B).modulate({ saturation: S }).png().toBuffer();
writeFileSync(path.join(dir, 'crudo.png'), crudo);
writeFileSync(path.join(dir, 'horneado.png'), horneado);
writeFileSync(path.join(dir, 'horneado2.png'), horneado2);
writeFileSync(path.join(dir, 'lch.png'), lch);
writeFileSync(path.join(dir, 'i.html'), `<!doctype html><meta charset=utf-8>
<style>html,body{margin:0;background:#000}img{display:block;width:${W}px;height:${H}px}
#f{filter:brightness(${B}) contrast(${C}) saturate(${S})}</style>
<img id="f" src="crudo.png"><img id="h" src="horneado.png"><img id="h2" src="horneado2.png"><img id="l" src="lch.png">`);

const { spawn } = await import('node:child_process');
const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', dir, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1]));
}));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H * 4 } });
await page.goto(`http://127.0.0.1:${port}/i.html`, { waitUntil: 'load' });
await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode())));
const shot = await page.screenshot({ animations: 'disabled' });
await browser.close(); proc.kill();

const raw = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
// width/channels viven en .info, no en la raiz. Destructurarlos de la raiz daba
// NaN y bandas vacias: maxΔ=0 en los dos caminos, incluido el que TIENE que
// diferir. El control negativo fue lo unico que lo delato.
const { width, height, channels } = raw.info;
const data = raw.data;
if (width !== W || height !== H * 4 || data.length !== width * height * channels) {
  throw new Error(`captura inesperada: ${width}x${height}x${channels}, ${data.length} B`);
}
const banda = (fila) => data.subarray(fila * H * width * channels, (fila + 1) * H * width * channels);
const filtrado = banda(0), horn = banda(1), horn2 = banda(2), lchB = banda(3);

const cmp = (a, b) => {
  let max = 0, sum = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; sum += d; }
  return { max, mean: +(sum / a.length).toFixed(3) };
};
const h = cmp(filtrado, horn), h2 = cmp(filtrado, horn2), l = cmp(filtrado, lchB);

console.log('contra el filtro CSS de Chromium:');
console.log(`  recomb, lineal fusionada      maxΔ=${String(h.max).padStart(3)}/255   meanΔ=${h.mean}`);
console.log(`  recomb, acotado entre medias  maxΔ=${String(h2.max).padStart(3)}/255   meanΔ=${h2.mean}   <- lo que se hornea`);
console.log(`  modulate LCh (control neg.)   maxΔ=${String(l.max).padStart(3)}/255   meanΔ=${l.mean}`);

// maxΔ de 1-2 es redondeo de 8 bits. El control negativo (LCh) demuestra que la
// comprobacion distingue: si diera lo mismo que el bueno, seria ciega.
const ok = h2.max <= 3 && l.max > h2.max;
console.log(ok
  ? `\nHORNEADO OK — coincide con el navegador (maxΔ=${h2.max}), y la via LCh se separa a ${l.max}/255: la medicion discrimina.`
  : `\nHORNEADO FALLIDO — maxΔ=${h2.max} contra el navegador (LCh da ${l.max}).`);
process.exit(ok ? 0 : 1);
