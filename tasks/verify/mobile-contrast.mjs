// mobile-contrast.mjs — contraste REAL del texto en movil, sobre pixeles.
//
// contrast.mjs compone la escena sinteticamente (foto + scrim) para decir que
// alpha hace falta. Esto hace lo contrario y mas honesto: renderiza la pagina
// de verdad, OCULTA el texto conservando el layout, captura, y mide la
// luminancia del fondo justo debajo de cada caja de texto. Es lo que el ojo ve.
//
// Sirve para encontrar el scrim MINIMO: el que deja leer sin borrar la foto.
//
//   node mobile-contrast.mjs [--w=390] [--h=844]

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const sharp = require('/home/archy/img-scratch/node_modules/sharp');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, true]; }));
const W = +(argv.w || 390), H = +(argv.h || 844);

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1])); }));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-ES',
  isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready).catch(() => {});
await page.waitForTimeout(900);

const PANELES = ['hero', 'about', 'skills', 'blog', 'contact'];
let fallos = 0;
console.log(`\nviewport ${W}x${H} — fondo real bajo cada texto (percentil 92 = la zona mas clara)\n`);

for (let i = 0; i < PANELES.length; i++) {
  await page.evaluate((n) => {
    const c = document.getElementById('container');
    c.scrollTo({ left: c.clientWidth * n, behavior: 'auto' });
  }, i);
  await page.waitForTimeout(700);

  // cajas y color de los textos, ANTES de ocultarlos
  const cajas = await page.evaluate((slug) => {
    const panel = document.getElementById(slug);
    const out = [];
    for (const el of panel.querySelectorAll('.d-text *')) {
      const t = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!t.length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 6 || r.bottom < 0 || r.top > innerHeight) continue;
      const px = parseFloat(cs.fontSize);
      out.push({ x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)),
                 w: Math.round(Math.min(r.width, innerWidth - r.x)),
                 h: Math.round(Math.min(r.height, innerHeight - r.y)),
                 color: cs.color, txt: t.map((n) => n.textContent.trim()).join(' ').slice(0, 28),
                 grande: px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700) });
    }
    return out;
  }, PANELES[i]);

  // ocultar SOLO el texto, conservando el layout, y capturar el fondo real
  await page.addStyleTag({ content: '.d-text, .d-text * { color: transparent !important; text-shadow: none !important; }' });
  await page.waitForTimeout(120);
  const shot = await page.screenshot({ animations: 'disabled' });
  const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  let peor = { r: 99 };
  for (const c of cajas) {
    const m = String(c.color).match(/\d+/g); if (!m) continue;
    const Lt = lum(+m[0], +m[1], +m[2]);
    const lums = [];
    for (let y = c.y; y < c.y + c.h && y < info.height; y += 2)
      for (let x = c.x; x < c.x + c.w && x < info.width; x += 2) {
        const o = (y * info.width + x) * info.channels;
        lums.push(lum(data[o], data[o + 1], data[o + 2]));
      }
    if (!lums.length) continue;
    lums.sort((a, b) => a - b);
    const claro = lums[Math.floor(lums.length * 0.92)];
    const r = ratio(Lt, claro);
    const min = c.grande ? 3 : 4.5;
    if (r < min) { fallos++; console.log(`  FALLO ${PANELES[i].padEnd(8)} ${r.toFixed(2)}:1 (min ${min})  "${c.txt}"`); }
    if (r - (c.grande ? 3 : 4.5) < peor.r) peor = { r: r - min, ratio: r, min, txt: c.txt };
  }
  console.log(`  ${PANELES[i].padEnd(8)} ${cajas.length} textos, el mas justo ${peor.ratio ? peor.ratio.toFixed(2) : '-'}:1 (min ${peor.min || '-'})  "${peor.txt || ''}"`);
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
}
await browser.close(); proc.kill();
console.log(fallos ? `\n${fallos} TEXTOS POR DEBAJO DE AA EN MOVIL` : '\nTODOS LOS TEXTOS CUMPLEN AA EN MOVIL');
process.exit(fallos ? 1 : 0);
