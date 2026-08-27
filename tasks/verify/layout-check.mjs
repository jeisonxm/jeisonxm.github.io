// layout-check.mjs — ¿CABE el contenido, en cualquier dispositivo?
//
// POR QUE EXISTE. El dueno encontro que "Contactame" se solapaba con el pie de
// stats en su HP EliteBook 840 G9 con Edge. Ninguna de las 15 puertas lo cazo,
// y la razon es estructural: todas verifican comportamiento, color, peso o
// gestos, y NINGUNA pregunta si el contenido cabe en su caja. depth-check varia
// el ANCHO (1440 y 2560) y nunca la ALTURA. Los criterios del plan tampoco lo
// nombran, asi que la verificacion heredo el punto ciego del plan.
//
// Esto barre una matriz de viewports REALES y afirma cuatro cosas por panel:
//   1. ningun bloque hermano se solapa con otro
//   2. nada desborda su panel por abajo
//   3. la pagina no scrollea en horizontal
//   4. los objetivos tactiles llegan a 24x24 CSS px (WCAG 2.2 AA)
//   5. el texto respira contra el borde, y TODOS los paneles respiran IGUAL
//
// El punto 5 se anadio despues de que el dueno dijera "no hay padding entre el
// borde y el texto, se ve muy apretado, y el hero no comparte esa proporcion con
// las otras secciones". Ni el solape ni el desborde lo cazaban: texto pegado al
// borde no es ninguna de las dos cosas. Sin esta afirmacion, la caja de
// contenido puede divergir entre paneles sin que nada se entere.
//
//   node layout-check.mjs [--json]

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));

// Viewports CSS reales, ya descontado el cromo del navegador.
const DISPOSITIVOS = [
  { n: 'iPhone SE',              w: 375, h: 553, movil: true },
  { n: 'iPhone 14',              w: 390, h: 664, movil: true },
  { n: 'iPhone 14 Pro Max',      w: 430, h: 745, movil: true },
  { n: 'Pixel 7',                w: 412, h: 732, movil: true },
  { n: 'iPad mini vertical',     w: 744, h: 954 },
  { n: 'iPad Pro apaisado',      w: 1194, h: 738 },
  { n: 'EliteBook 840 @150%',    w: 1280, h: 610 },   // el caso del dueno
  { n: 'EliteBook 840 @125%',    w: 1536, h: 780 },
  { n: 'EliteBook 840 @100%',    w: 1920, h: 1020 },
  { n: 'portatil 1366x768',      w: 1366, h: 640 },
  { n: 'MacBook Air 13',         w: 1440, h: 812 },
  { n: 'MacBook Pro 16',         w: 1728, h: 950 },
  { n: 'monitor 2560',           w: 2560, h: 1300 },
  { n: 'ventana baja 1280x560',  w: 1280, h: 560 },
];

const PANELES = ['hero', 'about', 'skills', 'blog', 'contact'];

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1])); }));

const browser = await chromium.launch({ headless: true });
let fallos = 0;
const filas = [];

for (const d of DISPOSITIVOS) {
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, locale: 'es-ES',
    isMobile: !!d.movil, hasTouch: !!d.movil, deviceScaleFactor: d.movil ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);

  const problemas = [];
  for (let i = 0; i < PANELES.length; i++) {
    await page.evaluate((n) => {
      const c = document.getElementById('container');
      c.scrollTo({ left: c.clientWidth * n, behavior: 'auto' });
    }, i);
    await page.waitForTimeout(320);
    const r = await page.evaluate((slug) => {
      const panel = document.getElementById(slug);
      const pr = panel.getBoundingClientRect();
      const out = [];
      // Bloques de primer nivel dentro de la capa de texto: son los que compiten
      // por el mismo alto y los que pueden pisarse.
      const capa = panel.querySelector('.d-text') || panel;
      const bloques = Array.from(capa.children).filter((e) => {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const b = e.getBoundingClientRect();
        return b.width > 4 && b.height > 4;
      }).map((e) => ({ el: e, r: e.getBoundingClientRect(),
                       nombre: e.className && typeof e.className === 'string'
                         ? '.' + e.className.split(/\s+/)[0] : e.tagName.toLowerCase() }));

      for (let a = 0; a < bloques.length; a++) {
        for (let b = a + 1; b < bloques.length; b++) {
          const A = bloques[a].r, B = bloques[b].r;
          const solapaY = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          const solapaX = Math.min(A.right, B.right) - Math.max(A.left, B.left);
          if (solapaY > 2 && solapaX > 2) {
            out.push({ tipo: 'solapa', a: bloques[a].nombre, b: bloques[b].nombre,
                       px: Math.round(solapaY) });
          }
        }
        // desborde por abajo del panel
        const b0 = bloques[a].r;
        if (b0.bottom > pr.bottom + 2) {
          out.push({ tipo: 'desborda', a: bloques[a].nombre, px: Math.round(b0.bottom - pr.bottom) });
        }
      }

      // El cromo FIJO (pildora de puntos, cabecera) flota sobre el panel y no es
      // descendiente suyo, asi que los bucles de arriba —que solo comparan
      // hermanos dentro de .d-text— nunca lo veian. Ese hueco dejo pasar que la
      // pildora se comiera "Horas automatizadas", "Descargar CV", "Hablemos" y
      // "GitHub" en 4 de los 5 paneles a 375x667.
      const cromo = Array.from(document.querySelectorAll('body *')).filter((e) => {
        if (e.closest('.panel')) return false;
        const cs = getComputedStyle(e);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (parseFloat(cs.opacity) < 0.05) return false;
        const b = e.getBoundingClientRect();
        return b.width > 4 && b.height > 4;
      }).map((e) => ({ r: e.getBoundingClientRect(),
                       nombre: e.className && typeof e.className === 'string'
                         ? '.' + e.className.split(/\s+/)[0] : e.tagName.toLowerCase() }));

      // Un elemento recortado por un ancestro con overflow no se VE, y lo que no
      // se ve no lo puede tapar nadie. Medido: "Descargar CV" cae en y=592-638
      // pero .panel-content (overflow-y:auto, 1004px de contenido en 500) corta
      // en 604. Comparar el rect crudo daba un solape fantasma de 16px. Se
      // intersecta con cada ancestro que recorta antes de comparar.
      const rectVisible = (el) => {
        let r = el.getBoundingClientRect();
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
          const c = n.getBoundingClientRect();
          r = { top: Math.max(r.top, c.top), bottom: Math.min(r.bottom, c.bottom),
                left: Math.max(r.left, c.left), right: Math.min(r.right, c.right) };
          if (r.bottom <= r.top || r.right <= r.left) return null;
        }
        return r;
      };

      // Solo hojas con texto o interactivas: comparar contenedores daria falsos
      // positivos por cualquier envoltorio que llegue al borde.
      const hojas = Array.from(panel.querySelectorAll('h1,h2,h3,h4,p,a,button,li,span'))
        .filter((e) => {
          if (e.querySelector('h1,h2,h3,h4,p,a,button,li,span')) return false;
          if (!e.textContent.trim()) return false;
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          const b = e.getBoundingClientRect();
          return b.width > 4 && b.height > 4;
        });

      for (const c of cromo) {
        for (const h of hojas) {
          const H = rectVisible(h);
          if (!H) continue;
          const sy = Math.min(c.r.bottom, H.bottom) - Math.max(c.r.top, H.top);
          const sx = Math.min(c.r.right, H.right) - Math.max(c.r.left, H.left);
          if (sy > 2 && sx > 2) {
            out.push({ tipo: 'cromo', a: c.nombre,
                       b: h.textContent.trim().slice(0, 24), px: Math.round(sy) });
          }
        }
      }
      return out;
    }, PANELES[i]);
    for (const x of r) problemas.push({ panel: PANELES[i], ...x });
  }

  // --- 5. margen contra el borde, y el MISMO en los cinco paneles ---
  const margenes = [];
  for (let i = 0; i < PANELES.length; i++) {
    await page.evaluate((n) => {
      const c = document.getElementById('container');
      c.scrollTo({ left: c.clientWidth * n, behavior: 'auto' });
    }, i);
    await page.waitForTimeout(300);
    const m = await page.evaluate((slug) => {
      const panel = document.getElementById(slug);
      let izq = Infinity, der = Infinity;
      for (const e of panel.querySelectorAll('.d-text *')) {
        const tiene = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!tiene) continue;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
        const b = e.getBoundingClientRect();
        if (b.width < 4 || b.height < 4) continue;
        izq = Math.min(izq, b.left); der = Math.min(der, innerWidth - b.right);
      }
      return { slug, izq: Math.round(izq), der: Math.round(der) };
    }, PANELES[i]);
    if (Number.isFinite(m.izq)) margenes.push(m);
  }
  // Minimo absoluto: por debajo de esto se lee apretado en cualquier pantalla.
  const MIN = 16;
  const apretados = margenes.filter((m) => m.izq < MIN || m.der < MIN);
  if (apretados.length) problemas.push({ tipo: 'texto pegado al borde',
    a: apretados.map((m) => `${m.slug} ${m.izq}/${m.der}px`).join(', ') });
  // Coherencia entre paneles: la caja tiene que ser la MISMA, no parecida.
  const izqs = margenes.map((m) => m.izq);
  const dispersion = Math.max(...izqs) - Math.min(...izqs);
  if (dispersion > 12) problemas.push({ tipo: 'la caja de contenido no es la misma en todos los paneles',
    a: margenes.map((m) => `${m.slug} ${m.izq}px`).join(', ') });

  const global = await page.evaluate(() => {
    // WCAG 2.2 SC 2.5.8 exime los objetivos EN LINEA dentro de un bloque de
    // texto: un enlace en medio de una frase no puede crecer sin romper la
    // linea. Se detecta porque su padre tiene ademas texto propio.
    const enLinea = (e) => {
      const p = e.parentElement;
      if (!p) return false;
      return Array.from(p.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    };
    const chicos = Array.from(document.querySelectorAll('a, button')).filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const b = e.getBoundingClientRect();
      if (!(b.width > 0 && b.height > 0)) return false;
      if (b.width >= 24 && b.height >= 24) return false;
      return !enLinea(e);
    }).map((e) => (e.textContent || '').trim().slice(0, 18) || e.className);
    const botonesAnchos = Array.from(document.querySelectorAll('.btn')).filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return e.getBoundingClientRect().width > innerWidth * 0.9;
    }).map((e) => (e.textContent || '').trim().slice(0, 16) + ' ' +
        Math.round(100 * e.getBoundingClientRect().width / innerWidth) + '%');
    return { scrollH: document.documentElement.scrollWidth > innerWidth + 1,
             chicos: chicos.slice(0, 4), botonesAnchos: botonesAnchos.slice(0, 3) };
  });
  if (global.scrollH) problemas.push({ tipo: 'scroll horizontal en la pagina' });
  // Un boton que ocupa casi toda la pantalla deja de leerse como boton.
  if (global.botonesAnchos.length) problemas.push({ tipo: 'boton casi de borde a borde',
    a: global.botonesAnchos.join(', ') });
  if (global.chicos.length) problemas.push({ tipo: 'objetivo tactil < 24px', a: global.chicos.join(', ') });

  if (problemas.length) fallos++;
  filas.push({ d: d.n, w: d.w, h: d.h, problemas });
  const resumen = problemas.length
    ? problemas.map((p) => p.tipo === 'solapa' ? `${p.panel}: ${p.a} pisa ${p.b} (${p.px}px)`
        : p.tipo === 'desborda' ? `${p.panel}: ${p.a} desborda ${p.px}px`
        : p.tipo === 'cromo' ? `${p.panel}: ${p.a} (fijo) tapa "${p.b}" (${p.px}px)`
        : p.tipo + (p.a ? ' — ' + p.a : ''))
        .slice(0, 3).join(' | ')
    : 'OK';
  console.log(`${problemas.length ? 'FALLO' : 'OK   '} ${d.n.padEnd(24)} ${String(d.w).padStart(4)}x${String(d.h).padStart(4)}  ${resumen}`);
  await ctx.close();
}
await browser.close(); proc.kill();
if (argv.json) writeFileSync('layout-results.json', JSON.stringify(filas, null, 2));
console.log(fallos ? `\n${fallos} de ${DISPOSITIVOS.length} dispositivos con el layout roto`
                   : `\nEL CONTENIDO CABE EN LOS ${DISPOSITIVOS.length} DISPOSITIVOS`);
process.exit(fallos ? 1 : 0);
