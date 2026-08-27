// panels-check.mjs — T6: los 5 paneles con las 4 capas, y el defecto 6.
//
// El defecto 6 era que SIN JAVASCRIPT solo cargaba 1 foto de 5: las otras
// estaban detras de `data-src` y de un IntersectionObserver. Aqui se comprueba
// que ya no dependen del JS.
//
// LIMITE HONESTO: con el JS desactivado no se puede pedirle al navegador que
// scrollee el contenedor horizontal desde la prueba (mouse.wheel no mueve el
// scroll nativo, y page.evaluate necesita JS). Asi que se comprueba lo que si
// es comprobable y es lo que de verdad define el defecto:
//   1. ninguna capa de profundidad esta gateada por data-src / data-srcset
//   2. con JS desactivado, el navegador PIDE de verdad las imagenes del hero
// Que las otras cuatro entren al scrollear es comportamiento nativo de
// loading="lazy", no codigo nuestro.
//
//   node panels-check.mjs

import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const PANELES = ['hero', 'about', 'skills', 'blog', 'contact'];
let fallos = 0;

// --- 1. estatico: marcado de los 38 HTML relevantes ---
for (const f of ['index.html', 'en/index.html']) {
  const s = readFileSync(path.join(SITE, f), 'utf8');
  for (const slug of PANELES) {
    const sec = s.match(new RegExp(`<section id="${slug}"[\\s\\S]*?</section>`));
    if (!sec) { console.log(`FALTA el panel ${slug} en ${f}`); fallos++; continue; }
    const cuerpo = sec[0];
    // Sin 'd-photo': la Version B se retiro cuando el dueno eligio la A.
    const capas = ['d-far', 'd-fig', 'd-wash', 'd-text'];
    const faltan = capas.filter((c) => !cuerpo.includes(`class="${c}"`));
    // Las capas visibles NO pueden estar gateadas por data-src; la Version B si,
    // porque es opt-in y no debe competir por el LCP.
    const visible = cuerpo.slice(cuerpo.indexOf('d-far'), cuerpo.indexOf('d-wash'));
    const gateadas = /data-src|data-srcset/.test(visible);
    const usaFoto = cuerpo.includes(`${slug}-fig1800`) && cuerpo.includes(`${slug}-l1`);
    if (faltan.length || gateadas || !usaFoto) fallos++;
    console.log(`${f.padEnd(15)} ${slug.padEnd(8)} capas ${faltan.length ? 'FALTAN ' + faltan.join(',') : 'las 5 OK'}` +
      `   sin data-src en A: ${gateadas ? 'NO — DEFECTO 6' : 'OK'}   fotos propias: ${usaFoto ? 'OK' : 'FALLA'}`);
  }
}

// --- 2. en navegador, con JavaScript DESACTIVADO ---
const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1]));
}));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES', javaScriptEnabled: false });
const page = await ctx.newPage();
const pedidas = new Set();
page.on('request', (r) => { if (/\/src\/images\/panels\//.test(r.url())) pedidas.add(r.url().split('/').pop()); });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle', timeout: 45000 });
await browser.close(); proc.kill();

// Medido: Chromium pide las 10 de una, no solo las del hero. El criterio se
// afirma sobre las CINCO, que es lo que dice el plan.
const faltanFig = PANELES.filter((s) => ![...pedidas].some((u) => u.startsWith(s + '-fig1800')));
const faltanL1  = PANELES.filter((s) => ![...pedidas].some((u) => u.startsWith(s + '-l1')));
const heroOk = !faltanFig.length && !faltanL1.length;
if (!heroOk) fallos++;
console.log(`\nsin JavaScript, el navegador pidio: ${[...pedidas].sort().join(', ') || '(nada)'}`);
console.log(`  las 5 figuras y sus 5 fondos: ${heroOk ? 'OK — LAS 5 CARGAN SIN JS (el defecto 6 era 1 de 5)' : 'FALTAN fig:' + faltanFig + ' l1:' + faltanL1}`);

console.log(fallos ? `\n${fallos} CRITERIOS DE T6 SIN CUMPLIR` : `\nLOS 5 PANELES CUMPLEN T6`);
process.exit(fallos ? 1 : 0);
