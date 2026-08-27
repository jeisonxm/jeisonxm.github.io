// lcp-check.mjs — LCP medido, no estimado.
//
// Mismo estrangulamiento que uso el plan §2.7 para fijar el techo:
// 1638.4 Kbps, RTT 150 ms, CPU x4. El techo es 2.5 s.
//
//   node lcp-check.mjs [--runs=5]

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const RUNS = Number((process.argv.find((a) => a.startsWith('--runs=')) || '=5').split('=')[1]);
const TECHO = 2500;

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1])); }));

const browser = await chromium.launch({ headless: true });
const medidas = [];
for (const [etiqueta, ruta] of [['portada ES', '/'], ['portada EN', '/en/'], ['blog', '/blog/']]) {
  const muestras = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-ES' });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, downloadThroughput: 1638400 / 8, uploadThroughput: 1638400 / 8, latency: 150 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.goto(`http://127.0.0.1:${port}${ruta}`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      lcp: Math.round(window.__lcp),
      elemento: (performance.getEntriesByType('largest-contentful-paint').slice(-1)[0] || {}).element
        ? '' : '',
    }));
    muestras.push(r.lcp);
    await ctx.close();
  }
  muestras.sort((a, b) => a - b);
  const mediana = muestras[Math.floor(muestras.length / 2)];
  medidas.push({ etiqueta, mediana, muestras });
  console.log(`${etiqueta.padEnd(12)} LCP mediana ${String(mediana).padStart(5)} ms   muestras ${muestras.join(' ')}   ` +
    `${mediana <= TECHO ? `OK, ${TECHO - mediana} ms de margen` : 'EXCEDE 2500 ms'}`);
}
await browser.close(); proc.kill();
const peor = Math.max(...medidas.map((m) => m.mediana));
console.log(`\npeor mediana ${peor} ms contra el techo de ${TECHO} ms  ${peor <= TECHO ? 'OK' : 'EXCEDIDO'}`);
console.log('Red 1638.4 Kbps, RTT 150 ms, CPU x4 — el mismo perfil con el que el plan fijo el techo.');
process.exit(peor <= TECHO ? 0 : 1);
