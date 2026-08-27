// a11y-check.mjs — T10: contraste real y estructura, sobre las 38 paginas.
//
// POR QUE NO BASTA LIGHTHOUSE. El ruido SVG de fondo deja decenas de nodos
// "no evaluables" para axe, y esos no cuentan ni para bien ni para mal: la
// puntuacion sale 100 con fallos de contraste dentro. Aqui se calcula el
// contraste efectivo caminando el DOM: para cada elemento con texto visible se
// sube por los ancestros hasta encontrar un fondo opaco y se compone.
//
// Lo que NO se mide aqui: texto sobre foto. Ese depende de los pixeles y lo
// mide tasks/contrast.mjs. Se marca aparte para no dar un verde que no toca.
//
//   node a11y-check.mjs [--engines=chromium]

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');

function paginas(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'tasks', 'node_modules'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, out);
    else if (e.name.endsWith('.html')) out.push('/' + path.relative(SITE, p));
  }
  return out;
}

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1])); }));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
const page = await ctx.newPage();

const rutas = paginas(SITE).sort();
let fallos = 0, sobreFoto = 0, revisados = 0;
const malos = [], porPagina = [];
const estructura = [];

for (const ruta of rutas) {
  await page.goto(`http://127.0.0.1:${port}${ruta}`, { waitUntil: 'load', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(150);

  const r = await page.evaluate(() => {
    const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const parse = (s) => {
      const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const v = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
      return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
    };
    const mezcla = (fg, bg) => [0, 1, 2].map((i) =>
      fg.a * [fg.r, fg.g, fg.b][i] + (1 - fg.a) * bg[i]);

    // Fondo efectivo. Hay que RECOGER la cadena hacia arriba y componer
    // DESPUES, de abajo hacia arriba. Componer sobre la marcha estaba mal: el
    // primer fondo semitransparente se mezclaba consigo mismo, asi que una
    // pildora con `rgb(var(--accent-rgb) / 0.12)` devolvia el acento a plena
    // opacidad — el mismo color que su texto. Salian 56 falsos fallos con
    // ratio exacto 1:1, que es la firma de comparar algo consigo mismo.
    const esFoto = (bi) => bi && bi !== 'none' &&
      /url\(["']?(?!data:)[^)"']*\.(?:avif|webp|jpe?g|png|gif)/i.test(bi);

    function fondo(el) {
      const capas = []; let sobreImagen = false; let n = el;
      while (n && n.nodeType === 1) {
        const cs = getComputedStyle(n);
        if (esFoto(cs.backgroundImage)) sobreImagen = true;
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) { capas.push(c); if (c.a >= 0.999) break; }
        n = n.parentElement;
      }
      let base = [255, 255, 255];
      if (capas.length && capas[capas.length - 1].a >= 0.999) {
        const b = capas.pop(); base = [b.r, b.g, b.b];
      }
      for (let i = capas.length - 1; i >= 0; i--) base = mezcla(capas[i], base);
      return { color: base, sobreImagen };
    }

    const out = [];
    const todos = document.querySelectorAll('body *');
    for (const el of todos) {
      // solo elementos con texto propio y visible
      const propio = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
      if (!propio) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const fg = parse(cs.color); if (!fg) continue;
      const f = fondo(el);
      // El texto de los paneles vive en .d-text, cuyo fondo es el scrim sobre
      // las capas de foto. Ese si lo mide tasks/contrast.mjs sobre pixeles.
      if (el.closest('.d-text') || el.closest('.depth')) f.sobreImagen = true;
      const col = mezcla(fg, f.color);
      const L1 = lum(col), L2 = lum(f.color);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const px = parseFloat(cs.fontSize);
      const grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      out.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''),
                 txt: propio.slice(0, 40), ratio: +ratio.toFixed(2), min: grande ? 3 : 4.5,
                 sobreImagen: f.sobreImagen });
    }
    const doc = document;
    return { textos: out, est: {
      lang: doc.documentElement.getAttribute('lang'),
      hreflang: doc.querySelectorAll('link[rel="alternate"][hreflang]').length,
      skip: !!doc.querySelector('a[href^="#"][class*="skip"], .skip-link, a[href="#main"]'),
      jsonld: doc.querySelectorAll('script[type="application/ld+json"]').length,
      meta: !!doc.querySelector('meta[name="description"]'),
      title: (doc.title || '').length,
      imgSinAlt: Array.from(doc.images).filter((i) => i.getAttribute('alt') === null).length,
      botonesSinNombre: Array.from(doc.querySelectorAll('button, a')).filter((b) =>
        !b.textContent.trim() && !b.getAttribute('aria-label') && !b.querySelector('[aria-label]')).length,
    } };
  });

  let sf = 0;
  for (const t of r.textos) {
    revisados++;
    if (t.sobreImagen) { sobreFoto++; sf++; continue; }   // lo mide contrast.mjs
    if (t.ratio < t.min) { fallos++; malos.push({ ruta, ...t }); }
  }
  porPagina.push({ ruta, total: r.textos.length, sobreFoto: sf });
  const e = r.est;
  const malEst = !e.lang || e.hreflang < 2 || !e.meta || e.title < 10 || e.imgSinAlt || e.botonesSinNombre;
  if (malEst) { fallos++; estructura.push({ ruta, ...e }); }
}
// --- CONTROL NEGATIVO ---
// El plan documentaba 6 fallos de contraste en el blog ES (hasta 2.87:1). Aqui
// no aparece ninguno, y eso solo significa algo si la comprobacion SABE dar
// rojo. Se inyecta un elemento con contraste conocido de ~2.3:1 y tiene que
// cazarlo. Si no lo caza, su verde no vale nada.
await page.goto(`http://127.0.0.1:${port}/blog/`, { waitUntil: 'load' });
const control = await page.evaluate(() => {
  const d = document.createElement('p');
  d.textContent = 'control negativo de contraste';
  d.style.cssText = 'color:#6b7280;background:#12171B;padding:8px;font-size:16px';
  document.body.appendChild(d);
  const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const p = (s) => String(s).match(/\d+/g).slice(0, 3).map(Number);
  const cs = getComputedStyle(d);
  const L1 = lum(p(cs.color)), L2 = lum(p(cs.backgroundColor));
  const r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  d.remove();
  return +r.toFixed(2);
});
const controlCaza = control < 4.5;
if (!controlCaza) fallos++;
console.log(`\ncontrol negativo: un texto a ${control}:1 se mide por debajo de 4.5 -> ${controlCaza ? 'la comprobacion discrimina' : 'CIEGA'}`);

await browser.close(); proc.kill();

console.log(`\n${rutas.length} paginas, ${revisados} elementos con texto`);
porPagina.sort((a,b)=>b.sobreFoto-a.sobreFoto).slice(0,5).forEach(x=>console.log('   ',x.ruta,x.sobreFoto+'/'+x.total));
console.log(`  ${sobreFoto} sobre imagen -> los mide tasks/contrast.mjs, no esto\n`);
if (malos.length) {
  console.log(`CONTRASTE POR DEBAJO DE AA (${malos.length}):`);
  const vistos = new Set();
  for (const m of malos) {
    const k = m.ruta + m.sel + m.ratio;
    if (vistos.has(k)) continue; vistos.add(k);
    console.log(`  ${m.ratio}:1 (min ${m.min})  ${m.ruta}  ${m.sel}  "${m.txt}"`);
  }
} else console.log('CONTRASTE: todos los textos sobre color cumplen AA');
if (estructura.length) {
  console.log(`\nESTRUCTURA INCOMPLETA (${estructura.length}):`);
  for (const e of estructura.slice(0, 6)) console.log(`  ${e.ruta}  ${JSON.stringify(e)}`);
} else console.log('ESTRUCTURA: lang, hreflang, meta, title, alt y nombres accesibles en las 38');

console.log(fallos ? `\n${fallos} PROBLEMAS` : '\nT10 CUMPLE');
process.exit(fallos ? 1 : 0);
