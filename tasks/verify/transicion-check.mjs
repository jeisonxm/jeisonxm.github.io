// transicion-check.mjs — ¿CUANTO DURA la transicion de profundidad, por tipo de entrada?
//
// POR QUE EXISTE. El dueno, en su Mac con trackpad:
//
//   "la transicion tan buena que tiene, solo se nota al hacer con dos dedos a la
//    derecha, pero si uso la rueda o con dos dedos hago hacia abajo, lo hace tan
//    rapido que pierdo toda la transicion, lo mismo pasa en el celular que no se ve"
//
// Son DOS quejas:
//   (A) con rueda o gesto vertical la transicion pasa demasiado rapido
//   (B) en el movil directamente no se ve
//
// Ninguna de las 16 puertas que ya existen puede cazar ninguna de las dos.
// depth-check.mjs mide la GEOMETRIA de las cuatro capas (los factores k, el tope
// de 340 px, la separacion entre planos) escribiendo --p a mano y leyendo el
// transform resultante: nunca deja que el sitio se mueva solo. panels-check y
// gestures-check miden A QUE PANEL SE LLEGA. layout-check mide si el contenido
// CABE. Cero de ellas miran el eje TIEMPO. Es exactamente el mismo punto ciego
// que layout-check documenta en su cabecera: la verificacion heredo el hueco del
// plan, y el plan nunca escribio un criterio de duracion.
//
// LO QUE MIDE. Para cada motor y cada tipo de entrada, una navegacion de un solo
// panel, y sobre ella:
//   - duracion: desde el primer frame en que scrollLeft se mueve hasta el ultimo
//   - FRAMES DE TRANSICION: en cuantos frames --p cambio de valor DE VERDAD. Este
//     es el numero que el usuario ve. Los ms importan menos: 700 ms en los que
//     --p solo toma 3 valores se ven como tres cortes, no como un movimiento.
//   - el recorrido de --p del panel de DESTINO: inicial, medio y final. En una
//     navegacion de un panel el destino va de -1 a 0, o sea un recorrido de 1.0
//     exacto. Si sale menos, la capa ni siquiera completo su viaje.
//   - el SALTO MAXIMO de --p en un solo frame, como % del recorrido. Es la
//     medida de "se salto la mayor parte": si un unico frame se come el 60% del
//     recorrido, el usuario vio un corte con dos fotogramas de cortesia.
// Mediana de 3 repeticiones (paneles 0->1, 1->2, 2->3, sin resets a mitad: un
// reset dispara la guarda alDetenerse() y contamina la medida siguiente).
//
// POR QUE --p SE LEE DEL ATRIBUTO style Y NO DE getComputedStyle. El motor
// (src/script.js:360-373) escribe --p con panel.style.setProperty. Leer el
// inline es la lectura exacta de lo que el motor produjo y no cuesta un
// recalculo de estilo por frame, que falsearia el propio frame que se mide.
// Ademas distingue "el motor escribio 0" de "el motor no escribio nunca"
// (cadena vacia), que es justo la diferencia que decide la queja (B).
//
// LOS DOS CAMINOS DE ENTRADA, Y POR QUE NO SON EL MISMO.
//   entrada 1  gesto horizontal -> src/script.js:175 hace `return` sin tocar
//              nada. Scrollea el NAVEGADOR, con la fisica del SO. El sitio no
//              elige la duracion: se la regalan.
//   entradas 2-5 -> irA() -> goToIndex() -> container.scrollTo({behavior:'smooth'})
//              (src/script.js:62-69). La duracion la elige el MOTOR DEL
//              NAVEGADOR, y el sitio no tiene ninguna palanca: behavior() en
//              src/script.js:55-57 es binaria, 'auto' o 'smooth', no hay un
//              tercer valor. Ahi vive la queja (A).
// Por eso la entrada 1 necesita eventos CONFIABLES (page.mouse.wheel): un
// WheelEvent sintetico no scrollea nada, porque nadie en el sitio lo atiende.
// Las entradas 2-5 pueden ir por la via sintetica cuando hace falta precision de
// milisegundos, porque ahi el que scrollea es el JS del sitio, y el JS del sitio
// atiende igual un evento sintetico que uno real.
//
// LIMITE HONESTO DE ESTA MAQUINA (leelo antes de creerte la fila de entrada 1).
// Esto corre en Linux. La inercia de dos dedos de macOS es una rafaga de ~60-120
// eventos wheel con deltaX que el SO emite durante ~1 s, y NO se puede
// reproducir aqui: Playwright no expone la inercia del SO, y page.mouse.wheel
// cuesta ~400 ms de ida y vuelta en esta maquina (medido, ver probe.mjs:84). La
// fila de entrada 1 emite una rampa decreciente de eventos reales y su columna
// de DURACION queda contaminada por ese round-trip — va marcada con (*). Lo que
// SI es valido de esa fila es el conteo de frames, que es un suelo: cada evento
// real produce su propio desplazamiento nativo con sus propios frames. Y sobre
// todo son validas las filas 2-5, que son donde vive la queja y que aqui no
// tienen ninguna contaminacion: una sola accion, un solo round-trip.
//
//   node transicion-check.mjs [--engines=webkit,chromium] [--reps=3]

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
// webkit primero: es el proxy mas cercano al Safari del dueno, que es donde se
// origino la queja. firefox se admite pero no entra por defecto (no es su Mac).
const ENGINES = String(argv.engines || 'webkit,chromium').split(',');
const REPS = Number(argv.reps || 3);
const VP = { width: 1440, height: 900 };   // MacBook Air 13, el del dueno

// ---------------------------------------------------------------------------
// EL UMBRAL. Sin un numero explicito esto es un termometro, no una compuerta.
//
// 12 frames a 60 Hz son 200 ms de movimiento continuo. Por debajo de eso el
// parallax de cuatro capas no se lee como profundidad: se lee como un corte con
// unos pocos fotogramas de cortesia, que es literalmente la queja del dueno
// ("lo hace tan rapido que pierdo toda la transicion"). En un Mac a 120 Hz el
// mismo umbral son 100 ms, o sea que el umbral es CONSERVADOR ahi.
const UMBRAL_FRAMES = 12;
// SEGUNDO UMBRAL, Y EL QUE DE VERDAD AGUANTA. Al correr esto salio que la
// cobertura es del 100% en los dos motores: --p cambia en CADA frame que el
// muestreador consigue tomar, y el que no da mas de si es el muestreador
// (headless entrega 3-14 frames donde una pantalla de 60 Hz daria 30-40). O sea
// que el conteo de frames medido aqui es un SUELO del arnes, no una medida del
// sitio, y lo unico independiente del refresco es la DURACION.
// 400 ms = el suelo de 12 frames a 30 Hz, el refresco mas lento para el que
// tiene sentido disenar. Es una estaca, no una ley: el numero definitivo sale de
// cronometrar el Safari real del dueno, que este arnes no puede tocar.
const UMBRAL_MS = 400;
// Y el complemento: aunque haya frames suficientes, si un solo frame se come mas
// de un cuarto del recorrido de --p, hubo un salto visible dentro de la
// transicion. Los dos criterios miden cosas distintas y los dos hacen falta.
const UMBRAL_SALTO = 0.25;
// ---------------------------------------------------------------------------

function wkDir() {
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME, '.cache', 'ms-playwright');
  if (!existsSync(b)) return null;
  const d = readdirSync(b).filter((x) => /^webkit-\d+$/.test(x))
    .sort((a, c) => Number(c.split('-')[1]) - Number(a.split('-')[1]));
  return d.length ? path.join(b, d[0]) : null;
}
// WebKit no arranca sin las 19 libs del sysroot privado; aqui no hay sudo.
// Copiado tal cual de depth-check.mjs para no divergir del resto del arnes.
function launcher(n) {
  if (n === 'chromium') return { type: chromium, opts: {} };
  if (n === 'firefox') return { type: firefox, opts: {} };
  const opts = {}, w = wkDir(), r = path.join(HERE, 'wk_run.sh');
  if (process.env.WK_SYSROOT && existsSync(r) && w) { process.env.WK_BROWSER_DIR = w; opts.executablePath = r; }
  return { type: webkit, opts };
}

const proc = spawn('python3', ['-u', '-m', 'http.server', '--bind', '127.0.0.1', '--directory', SITE, '0'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((r) => proc.stdout.on('data', (b) => {
  const m = String(b).match(/port (\d+)/); if (m) r(Number(m[1]));
}));
const URL_SITIO = `http://127.0.0.1:${port}/`;

// ---------------------------------------------------------------------------
// Muestreo: un rAF en pagina que apunta [t, scrollLeft, --p] cada frame durante
// una ventana fija. La ventana es fija a proposito: cortar cuando "parece
// quieto" mete la logica de deteccion DENTRO de la medida, y entonces no se
// puede distinguir "termino" de "el detector se rindio". Se captura todo y se
// decide despues, en frio.
async function abrirCaptura(page, idxDestino, ventanaMs) {
  await page.evaluate(({ idx, dur }) => {
    const c = document.getElementById('container');
    const panel = document.querySelectorAll('.panel')[idx];
    window.__m = [];
    window.__mFin = false;
    const t0 = performance.now();
    const f = () => {
      const t = performance.now() - t0;
      const raw = panel.style.getPropertyValue('--p');
      window.__m.push([t, c.scrollLeft, raw === '' ? null : parseFloat(raw)]);
      if (t < dur) requestAnimationFrame(f); else window.__mFin = true;
    };
    requestAnimationFrame(f);
  }, { idx: idxDestino, dur: ventanaMs });
}
async function cerrarCaptura(page, ventanaMs) {
  await page.waitForFunction(() => window.__mFin === true, null, { timeout: ventanaMs + 8000 });
  return page.evaluate(() => window.__m);
}

// Analisis en frio de una captura.
function analizar(m, anchoPanel = 1440) {
  if (!m || m.length < 3) return { movio: false, motivo: 'sin muestras' };
  const x0 = m[0][1];
  const iStart = m.findIndex((s) => s[1] !== x0);
  if (iStart < 0) return { movio: false, motivo: 'scrollLeft nunca se movio' };
  let iEnd = 0;
  for (let i = m.length - 1; i > 0; i--) if (m[i][1] !== m[i - 1][1]) { iEnd = i; break; }
  const tIni = m[iStart - 1] ? m[iStart - 1][0] : m[iStart][0];
  const dur = m[iEnd][0] - tIni;
  // Cuanto silencio quedo despues del ultimo movimiento. Si es poco, la ventana
  // se quedo corta y la duracion es un suelo, no una medida.
  const colaQuieta = m[m.length - 1][0] - m[iEnd][0];

  // Frames en que --p cambio DE VERDAD, y el mayor salto en uno solo.
  let framesP = 0, saltoMax = 0, prev = null;
  const serie = [];
  for (const [t, , p] of m) {
    if (p === null) continue;
    if (prev !== null && p !== prev) { framesP++; saltoMax = Math.max(saltoMax, Math.abs(p - prev)); }
    prev = p;
    serie.push([t, p]);
  }
  const dxTotal = m[iEnd][1] - m[0][1];
  if (!serie.length) return { movio: true, dur, framesP: 0, sinP: true, colaQuieta, dxTotal, frames: m.length,
                             tCaptura: m[m.length - 1][0] };

  const enT = (t) => { // valor de --p mas cercano a un instante
    let mej = serie[0];
    for (const s of serie) if (Math.abs(s[0] - t) < Math.abs(mej[0] - t)) mej = s;
    return mej[1];
  };
  // pFin es el ULTIMO valor de la captura, no el mas cercano a iEnd: el motor
  // escribe --p desde su propio rAF (girar(), src/script.js:378-385), que puede
  // ir un frame por detras del muestreador. Tomar el valor en reposo evita
  // contar ese desfase como "recorrido que falto".
  const pIni = enT(tIni), pFin = serie[serie.length - 1][1], pMed = enT((tIni + m[iEnd][0]) / 2);
  const span = Math.abs(pFin - pIni);
  const disponibles = m.filter((x) => x[0] >= tIni && x[0] <= m[iEnd][0]).length;
  let recorridoPx = 0;
  for (let i = 1; i < m.length; i++) recorridoPx += Math.abs(m[i][1] - m[i - 1][1]);
  return {
    movio: true, dur, framesP, colaQuieta,
    pIni, pMed, pFin, span,
    // fraccion del recorrido consumida en el peor frame
    saltoPct: span > 0 ? saltoMax / span : 1,
    // ¿el destino recorrio su rango completo? En un salto de un panel es 1.0.
    rangoCompleto: span >= 0.90,
    frames: m.length, dxTotal, tCaptura: m[m.length - 1][0],
    // Cadencia del PROPIO muestreador. Sin este numero la columna de frames es
    // ilegible: "3 frames" significa una cosa si el muestreador corrio a 60 Hz y
    // otra completamente distinta si el headless lo dejo en 8 Hz. Es la
    // diferencia entre medir el navegador y medir el arnes.
    hz: m.length / (m[m.length - 1][0] / 1000),
    xIni: m[0][1], xFin: m[iEnd][1],
    // COBERTURA: de los frames que el muestreador vio DURANTE la transicion, en
    // que fraccion cambio --p. Es lo que separa dos diagnosticos opuestos con el
    // mismo conteo bajo: cobertura ~100% significa "el motor actualiza cada
    // frame disponible y lo que falta es DURACION"; cobertura baja significa
    // "el motor se esta saltando frames". Solo el primero se arregla alargando
    // la animacion.
    cobertura: disponibles > 1 ? framesP / (disponibles - 1) : 0,
    disponibles,
    // RECORRIDO TOTAL, sumando valores absolutos. No es lo mismo que el neto:
    // en chromium el gesto horizontal sintetico va y VUELVE (cada evento de
    // rueda es una gesto separado para el snap, que lo devuelve al punto de
    // partida), y el neto sale 0 mientras el usuario ha visto pasar dos paneles.
    recorridoPx,
    // Frames de --p por panel de recorrido. Es la unica cifra comparable entre
    // la entrada 1 y las demas: la entrada 1 no recorre necesariamente un panel
    // exacto, porque la distancia la decide el motor.
    framesPorPanel: recorridoPx > 1 ? framesP / (recorridoPx / anchoPanel) : 0,
    // Frames que veria una pantalla de 60 Hz si la cobertura fuese del 100%.
    // Este arnes muestrea a ~45 Hz en headless, asi que su conteo crudo es un
    // SUELO respecto de la maquina del dueno; sin esta columna el numero de
    // WebKit se leeria peor de lo que es.
    f60: dur / (1000 / 60),
  };
}

const mediana = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

// Un punto del viewport que NO caiga dentro de un scroller anidado con recorrido
// pendiente. Sin esto la REGLA 2 no llega a ejecutarse: src/script.js:179 le
// cede la rueda a .about-content / al panel de contacto y la medida saldria
// "no movio" por una razon que no tiene nada que ver con la transicion.
async function puntoSeguro(page) {
  return page.evaluate(() => {
    const c = document.getElementById('container');
    const scrollers = Array.from(c.querySelectorAll('*')).filter((el) => {
      const cs = getComputedStyle(el);
      return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight - el.clientHeight > 1;
    });
    const sucio = (x, y) => {
      const n = document.elementFromPoint(x, y);
      return !n || scrollers.some((s) => s.contains(n));
    };
    const cand = [[innerWidth * 0.5, innerHeight * 0.5], [innerWidth * 0.5, 90],
                  [innerWidth - 40, innerHeight * 0.5], [40, innerHeight - 60]];
    for (const [x, y] of cand) if (!sucio(x, y)) return { x, y };
    return { x: innerWidth * 0.5, y: innerHeight * 0.5 };
  });
}

// El motor no escribe --p hasta el primer evento de scroll (girar() solo arranca
// desde despertarProfundidad, src/script.js:386-398). Sin cebarlo, el primer
// valor de --p de la primera repeticion aparece YA a mitad de transicion y el
// "p inicial" saldria falseado. Un empujon de 1 px y vuelta a 0 lo deja escrito.
async function cebar(page) {
  await page.evaluate(() => {
    const c = document.getElementById('container');
    c.scrollTo({ left: 1, behavior: 'auto' });
    c.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(260);
  await page.evaluate(() => document.getElementById('container').scrollTo({ left: 0, behavior: 'auto' }));
  await page.waitForTimeout(500);   // deja converger la guarda alDetenerse()
}

// ---------------------------------------------------------------------------
// Las cinco entradas. `disparar` recibe (page, destino, pt) y provoca UNA
// navegacion de un panel.
const ENTRADAS = [
  {
    id: 1, nombre: 'swipe horizontal nativo', via: 'real', ventana: 4200, marca: '*',
    // NO PUNTUA. Es la fila de referencia contra la que se lee la queja, no un
    // criterio: sin la inercia del SO el aterrizaje lo decide el motor y no el
    // arnes (medido: chromium trata cada evento de rueda como un gesto aparte,
    // el snap mandatory lo devuelve al panel de origen y el recorrido neto sale
    // 0 despues de 7900 px de ida y vuelta). Puntuarla seria contar como defecto
    // del sitio una limitacion de esta maquina.
    referencia: true,
    // REGLA 1: |deltaX| > |deltaY| -> src/script.js:175 devuelve sin tocar nada.
    // Scrollea el navegador. Rampa DECRECIENTE porque es la firma de la inercia;
    // no es la inercia de macOS (imposible aqui) pero si el mismo camino de
    // codigo: N desplazamientos nativos pequenos en vez de un scrollTo grande.
    // La rampa va REALIMENTADA: se lee scrollLeft entre eventos y el paso
    // siguiente es una fraccion de lo que falta. Sin esto la distancia queda al
    // arbitrio de cada motor (medido: los mismos 6 eventos de deltaX=300 movian
    // ~1 panel en chromium y ~3 en webkit) y las filas dejaban de ser
    // comparables entre si — se estaria cronometrando un viaje distinto en cada
    // motor. Cada lectura cuesta un round-trip mas, que es justo lo que la
    // columna (*) ya declara contaminado.
    async disparar(page, destino, pt) {
      await page.mouse.move(pt.x, pt.y);
      const meta = await page.evaluate((i) => document.querySelectorAll('.panel')[i].offsetLeft, destino);
      for (let i = 0; i < 16; i++) {
        const x = await page.evaluate(() => document.getElementById('container').scrollLeft);
        const falta = meta - x;
        if (falta <= 70) break;                 // el snap remata el ultimo tramo
        await page.mouse.wheel(Math.max(45, Math.min(260, falta * 0.34)), 0);
        // En chromium page.mouse.wheel arranca un desplazamiento ANIMADO que
        // sigue vivo cuando la llamada ya volvio. Leer scrollLeft sin esperar
        // devolvia un valor a medio camino, la realimentacion pedia otro
        // empujon y la repeticion se pasaba dos y tres paneles de largo
        // (medido: 51/0/0 frames en tres repeticiones, porque la primera se
        // llevo por delante el punto de partida de las otras dos).
        await page.waitForTimeout(90);
      }
    },
  },
  {
    id: 2, nombre: 'rueda discreta (1 notch)', via: 'real', ventana: 2400,
    // REGLA 2: |deltaY| >= 90 y entero -> discreta -> irA() -> scrollTo smooth.
    async disparar(page, destino, pt) {
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.wheel(0, 120);
    },
  },
  {
    id: 3, nombre: 'trackpad vertical continuo', via: 'sintetica', ventana: 2400,
    // REGLA 3: deltaY fraccionario en rafaga -> acumulador -> irA().
    // Via sintetica a proposito: aqui el que scrollea es el JS del sitio, asi que
    // un evento sintetico recorre el MISMO codigo, y a cambio se consigue el
    // espaciado de 8 ms que page.mouse.wheel no puede dar en esta maquina.
    // 8 eventos de 7.3 pasan THRESHOLD=55; magnitud constante -> decayRun nunca
    // sube -> no se confunde con inercia -> un solo avance.
    async disparar(page) {
      await page.evaluate(() => new Promise((res) => {
        const c = document.getElementById('container');
        let i = 0;
        const paso = () => {
          c.dispatchEvent(new WheelEvent('wheel', {
            deltaX: 0.4, deltaY: 7.3, deltaMode: 0, bubbles: true, cancelable: true,
          }));
          if (++i < 12) setTimeout(paso, 8); else res();
        };
        paso();
      }));
    },
  },
  {
    id: 4, nombre: 'tecla flecha derecha', via: 'real', ventana: 2400,
    async disparar(page) { await page.keyboard.press('ArrowRight'); },
  },
  {
    id: 5, nombre: 'clic en punto de navegacion', via: 'real', ventana: 2400,
    async disparar(page, destino) {
      await page.locator('.panel-dot').nth(destino).click({ timeout: 5000 });
    },
  },
];

// ---------------------------------------------------------------------------
async function medirEntrada(browser, entrada, ruta) {
  const ctx = await browser.newContext({ viewport: VP, locale: 'es-ES' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL_SITIO, { waitUntil: 'load', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  if (ruta) await ruta(page);
  await cebar(page);
  const pt = await puntoSeguro(page);

  const nPaneles = await page.evaluate(() => document.querySelectorAll('.panel').length);
  const anchoPanel = await page.evaluate(() => document.getElementById('container').clientWidth);

  const reps = [];
  for (let r = 0; r < REPS; r++) {
    // El destino se calcula desde la posicion REAL, no desde r+1. Una repeticion
    // que se pase de largo (la entrada 1 puede hacerlo: la distancia la decide
    // el motor, no el arnes) dejaria a la siguiente midiendo un panel al que ya
    // se llego, y saldrian ceros que no son del sitio sino del arnes.
    let cur = await page.evaluate(() => {
      const c = document.getElementById('container');
      return Math.round(c.scrollLeft / c.clientWidth);
    });
    if (cur >= nPaneles - 1) {   // sin sitio para avanzar: volver al principio
      await page.evaluate(() => document.getElementById('container').scrollTo({ left: 0, behavior: 'auto' }));
      await page.waitForTimeout(700);
      cur = 0;
    }
    const destino = cur + 1;
    await abrirCaptura(page, destino, entrada.ventana);
    await page.waitForTimeout(70);         // unos frames de linea base
    try { await entrada.disparar(page, destino, pt); }
    catch (e) { reps.push({ movio: false, motivo: 'disparo fallo: ' + e.message.split('\n')[0] }); continue; }
    const a = analizar(await cerrarCaptura(page, entrada.ventana), anchoPanel);
    a.destino = destino;
    a.aterrizo = Number.isFinite(a.xFin) ? Math.round(a.xFin / anchoPanel) : null;
    reps.push(a);
    await page.waitForTimeout(400);
  }
  await ctx.close();
  return { reps, errs };
}

function resumir(reps) {
  const ok = reps.filter((r) => r.movio && !r.sinP);
  if (!ok.length) {
    return { vacio: true, motivo: reps.map((r) => r.motivo || (r.sinP ? '--p nunca escrito' : '?'))[0] };
  }
  return {
    vacio: false, n: ok.length,
    dur: mediana(ok.map((r) => r.dur)),
    framesP: mediana(ok.map((r) => r.framesP)),
    pIni: mediana(ok.map((r) => r.pIni)),
    pMed: mediana(ok.map((r) => r.pMed)),
    pFin: mediana(ok.map((r) => r.pFin)),
    span: mediana(ok.map((r) => r.span)),
    saltoPct: mediana(ok.map((r) => r.saltoPct)),
    completo: ok.every((r) => r.rangoCompleto),
    cola: mediana(ok.map((r) => r.colaQuieta)),
    hz: mediana(ok.map((r) => r.hz)),
    cobertura: mediana(ok.map((r) => r.cobertura)),
    disponibles: mediana(ok.map((r) => r.disponibles)),
    recorridoPx: mediana(ok.map((r) => r.recorridoPx)),
    framesPorPanel: mediana(ok.map((r) => r.framesPorPanel)),
    f60: mediana(ok.map((r) => r.f60)),
    porRep: reps.map((r) => (r.movio && !r.sinP ? r.framesP : 'x')).join('/'),
    saltos: reps.map((r) => (r.aterrizo == null ? '?' : `${r.destino}${r.aterrizo === r.destino ? '' : '\u2192' + r.aterrizo}`)).join(' '),
  };
}

const n2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '  -- ');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

let fallos = 0;
let inconcluyentes = 0;
const tabla = [];

for (const eng of ENGINES) {
  const { type, opts } = launcher(eng);
  let browser;
  try { browser = await type.launch({ headless: true, ...opts }); }
  catch (e) { console.log(`\n${eng}: NO ARRANCA — ${e.message.split('\n')[0]}`); fallos++; continue; }

  console.log(`\n${'='.repeat(102)}`);
  console.log(`MOTOR ${eng.toUpperCase()}   viewport ${VP.width}x${VP.height}   mediana de ${REPS} repeticiones (paneles 0->1, 1->2, 2->3)`);
  console.log('='.repeat(102));
  console.log('  frames  = frames en que --p cambio DE VERDAD: lo que el usuario ve.');
  console.log('  disp    = frames que el MUESTREADOR llego a tomar durante la transicion. Si disp ya es bajo, el techo');
  console.log('            lo pone el headless, no el sitio: en esa fila el conteo es un SUELO, no una medida.');
  console.log('  cob     = frames / disp. 100% significa "--p se actualiza en cada frame disponible", o sea que lo');
  console.log('            que falta es DURACION, no fluidez.');
  console.log('  f/panel = frames de --p por panel de recorrido. Unica cifra comparable con la entrada 1, que no');
  console.log('            recorre un panel exacto porque la distancia la decide el motor, no el arnes.');
  console.log(`  ${pad('entrada', 30)} ${lpad('dur ms', 7)} ${lpad('frames', 7)} ${lpad('disp', 5)} ${lpad('cob', 5)} ${lpad('f/panel', 8)}  ${pad('--p  ini -> med -> fin', 31)} ${lpad('span', 6)} ${lpad('salto', 7)}`);
  console.log(`  ${'-'.repeat(30)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(5)} ${'-'.repeat(5)} ${'-'.repeat(8)}  ${'-'.repeat(31)} ${'-'.repeat(6)} ${'-'.repeat(7)}`);

  for (const e of ENTRADAS) {
    const { reps, errs } = await medirEntrada(browser, e);
    const s = resumir(reps);
    if (errs.length) { fallos++; console.log(`  pageErrors: ${errs.join(' | ')}`); }
    if (s.vacio) {
      fallos++;
      console.log(`  ${pad(`${e.id}. ${e.nombre}`, 30)} ${lpad('--', 8)} ${lpad('--', 11)}  NO SE PUDO MEDIR: ${s.motivo}`);
      tabla.push({ eng, e, s });
      continue;
    }
    // Si el muestreador NO llego a tomar UMBRAL_FRAMES muestras durante la
    // transicion, esa fila no puede pasar el criterio de frames ni aunque el
    // sitio fuese perfecto: el techo lo pone el arnes. Contarlo como ROJO seria
    // un falso positivo, y una compuerta que miente en rojo se desactiva sola a
    // la tercera vez. Se marca INCONCL y se saca del recuento.
    // No se puede medir "al menos UMBRAL_FRAMES frames" con una regla que solo
    // tiene UMBRAL_FRAMES marcas: si el muestreador apenas llega al umbral, un
    // frame perdido decide el veredicto y eso es una moneda al aire. Medido: en
    // webkit sobre llvmpipe el muestreador tocaba techo en disp=12 justo cuando
    // el umbral es 12, y daba ROJO con 10 frames mientras chromium —que ahi
    // llega al 100 % de cobertura— medía 12-18 en la MISMA entrada. Se exige
    // un cuarto de regla de margen antes de juzgar. Con 1.5 el umbral se comia
    // tambien a chromium (disp 15-17 con cobertura del 100 %), y una compuerta
    // que ya no juzga a nadie es tan inutil como una que juzga al azar.
    const inconcl = s.disponibles < UMBRAL_FRAMES * 1.25;
    const rojoFrames = !inconcl && s.framesP < UMBRAL_FRAMES;
    const rojoSalto = !inconcl && s.saltoPct > UMBRAL_SALTO;
    const rojoDur = s.dur < UMBRAL_MS;   // este si es independiente del refresco
    if (inconcl) inconcluyentes++;
    if (!e.referencia && (rojoFrames || rojoSalto || rojoDur || !s.completo)) fallos++;
    const marca = e.marca || ' ';
    console.log(`  ${pad(`${e.id}. ${e.nombre}${marca}`, 30)} ${lpad(Math.round(s.dur), 7)} ${lpad(s.framesP + (rojoFrames ? '!' : ''), 7)} ${lpad(Math.round(s.disponibles), 5)} ${lpad(Math.round(s.cobertura * 100) + '%', 5)} ${lpad(n2(s.framesPorPanel, 1), 8)}  ` +
      `${pad(`${n2(s.pIni, 3)} -> ${n2(s.pMed, 3)} -> ${n2(s.pFin, 3)}`, 31)} ${lpad(n2(s.span, 3), 6)} ${lpad(Math.round(s.saltoPct * 100) + '%' + (rojoSalto ? '!' : ''), 7)}` +
      `  ${e.referencia ? 'REFERENCIA' : inconcl ? 'INCONCL' : rojoFrames || rojoDur || rojoSalto ? 'ROJO' : 'ok'}`);
    console.log(`  ${' '.repeat(30)} reps ${pad(s.porRep, 10)} paneles ${pad(s.saltos, 14)} recorrido ${Math.round(s.recorridoPx)} px  muestreador ${Math.round(s.hz)} Hz` +
      `${rojoDur ? `   <- DURACION ${Math.round(s.dur)} ms < ${UMBRAL_MS} ms` : ''}` +
      `${inconcl ? `   <- el arnes solo pudo ver ${Math.round(s.disponibles)} frames: criterio de frames NO CONCLUYENTE` : ''}`);
    tabla.push({ eng, e, s });
  }

  // --- Contraste explicito: es LA queja, no un detalle de la tabla ---
  const de = (id) => tabla.find((t) => t.eng === eng && t.e.id === id);
  const e1 = de(1)?.s, otras = [2, 3, 4, 5].map(de).map((t) => t?.s).filter((s) => s && !s.vacio);
  if (e1 && !e1.vacio && otras.length) {
    const peor = otras.reduce((a, b) => (b.framesP < a.framesP ? b : a));
    const mejor = otras.reduce((a, b) => (b.framesP > a.framesP ? b : a));
    console.log(`\n  CONTRASTE (queja A)`);
    console.log(`    entrada 1 (gesto horizontal, scrollea el NAVEGADOR) : ${e1.framesP} frames en ${Math.round(e1.dur)} ms(*)` +
      `  ->  ${n2(e1.framesPorPanel, 1)} frames de --p por panel`);
    console.log(`    entradas 2-5 (scrollTo smooth, scrollea el SITIO)   : ${otras.map((s) => s.framesP).join(' / ')} frames en ` +
      `${otras.map((s) => Math.round(s.dur)).join(' / ')} ms  ->  ${otras.map((s) => n2(s.framesPorPanel, 1)).join(' / ')} por panel`);
    console.log(`    peor entrada programatica: ${peor.framesP} frames | mejor: ${mejor.framesP} frames | umbral: ${UMBRAL_FRAMES}`);
    const r = e1.framesPorPanel / Math.max(peor.framesPorPanel, 0.01);
    const fiable = e1.disponibles >= UMBRAL_FRAMES * 1.25 && peor.disponibles >= UMBRAL_FRAMES * 1.25;
    console.log(`    el gesto horizontal ensena ${r >= 1 ? n2(r, 1) + 'x MAS' : n2(1 / r, 1) + 'x MENOS'} frames por panel que la peor entrada programatica.`);
    if (!fiable) {
      const flojas = [['entrada 1', e1], ['peor programatica', peor]]
        .filter(([, x]) => x.disponibles < UMBRAL_FRAMES * 1.25)
        .map(([n, x]) => `${n} (${Math.round(x.disponibles)} frames)`).join(' y ');
      console.log(`    OJO: el muestreador headless no llego a ${UMBRAL_FRAMES} muestras en ${flojas}, asi que ese`);
      console.log(`         cociente NO es un dato del sitio. Lo unico que este motor sostiene es la DURACION.`);
    }
    console.log(`    (*) la DURACION de la entrada 1 la fija el arnes, no el sitio: cada page.mouse.wheel cuesta`);
    console.log(`        ~400 ms de ida y vuelta (probe.mjs:84). El conteo de frames si es del navegador.`);
  }

  // ------------------------------------------------------------------------
  // QUEJA (B): el movil. No se lee el codigo, se lee el valor real de --p.
  // ------------------------------------------------------------------------
  let mctx;
  try {
    mctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      deviceScaleFactor: 3, locale: 'es-ES',
    });
  } catch {
    console.log(`\n  MOVIL: ${eng} no admite contexto isMobile/hasTouch, se omite`);
    await browser.close(); continue;
  }
  const mp = await mctx.newPage();
  const merr = []; mp.on('pageerror', (e) => merr.push(e.message));
  await mp.goto(URL_SITIO, { waitUntil: 'load', timeout: 45000 });
  await mp.waitForTimeout(700);

  // Confirmar primero que el contexto es de verdad de puntero grueso: si la MQ
  // diera fine, todo lo que sigue mediria otra cosa. Es el control del control.
  const mq = await mp.evaluate(() => ({
    fino: matchMedia('(hover: hover) and (pointer: fine)').matches,
    grueso: matchMedia('(pointer: coarse)').matches,
  }));

  // Arrastre tactil REAL donde el motor lo permite (CDP en chromium: evento
  // confiable, scrollea el compositor). Donde no, un scroll nativo suave, que
  // recorre el mismo camino del motor de profundidad: lo que se pregunta es si
  // el motor escribe --p mientras el contenedor se mueve, no como se movio.
  let comoSeMovio = 'scroll nativo suave (el motor no expone arrastre tactil)';
  await abrirCaptura(mp, 1, 3400);
  await mp.waitForTimeout(70);
  let hecho = false;
  if (eng === 'chromium') {
    try {
      const cdp = await mctx.newCDPSession(mp);
      const y = 500; let x = 350;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 0; i < 22; i++) {
        x -= 14;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      comoSeMovio = 'arrastre tactil real (CDP Input.dispatchTouchEvent, 22 touchMove)';
      hecho = true;
    } catch { /* cae al scroll nativo */ }
  }
  if (!hecho) {
    // Un solo scrollTo salia a veces sin efecto en webkit headless y la fila
    // entera se iba a "no se movio", que es una respuesta del arnes disfrazada
    // de respuesta del sitio. Se reintenta hasta que scrollLeft se despega.
    for (let i = 0; i < 3; i++) {
      await mp.evaluate(() => {
        const c = document.getElementById('container');
        c.scrollTo({ left: document.querySelectorAll('.panel')[1].offsetLeft, behavior: 'smooth' });
      });
      await mp.waitForTimeout(450);
      const x = await mp.evaluate(() => document.getElementById('container').scrollLeft);
      if (x > 4) break;
    }
  }
  const mm = analizar(await cerrarCaptura(mp, 3400), 390);

  // Aislar el SEGUNDO cerrojo. Aunque --p variara, style.css:1700-1706 pone
  // transform:none en las cuatro capas bajo `not (hover:hover) and (pointer:fine)`.
  // Escribir --p a mano y leer el transform resultante separa los dos candados:
  // el de JS (src/script.js:53) y el de CSS.
  const cssLock = await mp.evaluate(() => {
    const panel = document.querySelectorAll('.panel')[1];
    panel.style.setProperty('--p', '0.5');
    panel.style.setProperty('--a', '0.5');
    const t = (s) => { const e = panel.querySelector(s); return e ? getComputedStyle(e).transform : 'sin elemento'; };
    const o = (s) => { const e = panel.querySelector(s); return e ? getComputedStyle(e).opacity : 'sin elemento'; };
    const r = { far: t('.d-far'), fig: t('.d-fig'), text: t('.d-text'), opWash: o('.d-wash') };
    panel.style.removeProperty('--p'); panel.style.removeProperty('--a');
    return r;
  });

  console.log(`\n  MOVIL 390x844  isMobile+hasTouch   (hover:hover)and(pointer:fine)=${mq.fino}   (pointer:coarse)=${mq.grueso}`);
  console.log(`    gesto                : ${comoSeMovio}`);
  console.log(`    el contenedor se movio: ${mm.movio ? `SI, ${Math.round(mm.dxTotal)} px en ${Math.round(mm.dur)} ms` : 'NO — ' + mm.motivo}`);
  const pApagado = !mm.movio ? null : (mm.sinP || mm.framesP === 0);
  console.log(`    --p durante el gesto : ${!mm.movio ? 'NO APLICA: el contenedor no llego a moverse' :
    mm.sinP ? 'NUNCA SE ESCRIBIO (cadena vacia en el atributo style)' :
    mm.framesP === 0 ? 'escrito pero CONGELADO, 0 cambios' : `${mm.framesP} cambios (¡la profundidad SI corre!)`}`);
  // Ojo con esta linea: antes afirmaba "depthOn = finePointer -> depthOn=false"
  // como si leyera el codigo, pero lo unico que sabe es el media query. Cuando
  // el sitio dejo de atar depthOn al puntero, la linea siguio imprimiendo
  // depthOn=false mientras el propio arnes medía --p variando. Se dice lo que de
  // verdad se mide: el media query, y aparte si la profundidad corre.
  console.log(`    puntero fino (MQ)    : (hover:hover) and (pointer:fine) = ${mq.fino}`);
  console.log(`    cerrojo 2 (CSS)      : style.css:1700 forzando --p=0.5 a mano -> .d-far transform = ${cssLock.far}`);
  console.log(`                           .d-fig ${cssLock.fig} | .d-text ${cssLock.text} | .d-wash opacity ${cssLock.opWash}`);
  const cssMata = cssLock.far === 'none' && cssLock.fig === 'none' && cssLock.text === 'none';
  console.log(`    VEREDICTO (B)        : ${pApagado === true ? 'CONFIRMADO — en tactil no hay profundidad que ver'
    : pApagado === false ? 'DESMENTIDO — --p si varia en tactil' : 'INDETERMINADO — no se movio nada'}` +
    `${cssMata ? '; y ademas el CSS la mataria aunque el JS la encendiera (candado doble)' : ''}`);
  if (merr.length) { fallos++; console.log(`    pageErrors: ${merr.join(' | ')}`); }
  // La compuerta de movil CUENTA. depth-check.mjs imprime su equivalente y no
  // suma fallo (su `if` solo mira errs), y por eso este agujero llevaba meses
  // abierto en verde. Aqui la profundidad apagada en tactil es un FALLO.
  if (pApagado === true) fallos++;
  else if (pApagado === null) { fallos++; console.log('    (este fallo es del ARNES: sin movimiento no hay veredicto)'); }

  await mctx.close();
  await browser.close();
}

// ---------------------------------------------------------------------------
// PRUEBA DE MUTACION. Una compuerta que nunca ha dado rojo no es una compuerta.
// Se sirve el sitio con src/script.js interceptado y behavior() forzada a 'auto'
// (teletransporte instantaneo). Si la compuerta esta viva, la entrada 4 tiene
// que caer por debajo de UMBRAL_FRAMES. Se hace con page.route: NO se toca el
// repo, asi que no puede quedarse una mutacion olvidada en disco.
console.log(`\n${'='.repeat(102)}`);
console.log('PRUEBA DE MUTACION — ¿esta compuerta sabe dar ROJO?');
console.log('='.repeat(102));
for (const eng of ENGINES) {
  const { type, opts } = launcher(eng);
  const browser = await type.launch({ headless: true, ...opts });
  const ORIG = "return reduceMotion.matches ? 'auto' : 'smooth';";
  const MUT = "return 'auto';";

  const correr = async (mutar) => {
    const ctx = await browser.newContext({ viewport: VP, locale: 'es-ES' });
    const page = await ctx.newPage();
    if (mutar) {
      await page.route('**/src/script.js', async (route) => {
        const res = await route.fetch();
        const body = await res.text();
        if (!body.includes(ORIG)) throw new Error('la mutacion no encontro su ancla en src/script.js: ' + ORIG);
        await route.fulfill({ response: res, body: body.replace(ORIG, MUT),
          headers: { ...res.headers(), 'content-type': 'application/javascript' } });
      });
    }
    await page.goto(URL_SITIO, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(600);
    await cebar(page);
    const out = [];
    for (let r = 0; r < REPS; r++) {
      await abrirCaptura(page, r + 1, 2400);
      await page.waitForTimeout(70);
      await page.keyboard.press('ArrowRight');
      out.push(analizar(await cerrarCaptura(page, 2400)));
      await page.waitForTimeout(400);
    }
    await ctx.close();
    return resumir(out);
  };

  const sano = await correr(false);
  const roto = await correr(true);
  // Se juzga por DURACION, que es el criterio que sobrevive al headless. El de
  // frames se imprime al lado para que se vea que dice lo mismo donde puede.
  const rojoSano = sano.vacio || sano.dur < UMBRAL_MS;
  const rojoRoto = roto.vacio || roto.dur < UMBRAL_MS;
  const di = (x) => (x.vacio ? 'no medible' : `${Math.round(x.dur)} ms / ${x.framesP} frames (disp ${Math.round(x.disponibles)})`);
  console.log(`\n  motor: ${eng}   entrada 4 (flecha derecha)   umbrales: ${UMBRAL_MS} ms y ${UMBRAL_FRAMES} frames`);
  console.log(`    sin mutar            : ${di(sano)}  -> ${rojoSano ? 'ROJO' : 'VERDE'}`);
  console.log(`    behavior() -> 'auto' : ${di(roto)}  -> ${rojoRoto ? 'ROJO' : 'VERDE'}`);
  if (rojoRoto && !rojoSano) {
    console.log('    RESULTADO: la compuerta DISCRIMINA — verde sin mutar, roja con la mutacion.');
  } else if (rojoRoto && rojoSano) {
    console.log('    RESULTADO: la mutacion da rojo, pero el sitio SIN MUTAR ya estaba rojo en este motor:');
    console.log('               esta corrida prueba que la compuerta dispara, no que discrimina.');
  } else {
    console.log('    RESULTADO: LA COMPUERTA NO SIRVE — la mutacion no la hizo fallar. Arreglala antes de creerte nada.');
    fallos += 100;
  }
  await browser.close();
}

proc.kill();
console.log(`\n${'='.repeat(102)}`);
console.log(`umbrales: duracion >= ${UMBRAL_MS} ms por navegacion de un panel (independiente del refresco),`);
console.log(`          >= ${UMBRAL_FRAMES} frames de --p, y ningun frame que se coma mas del ${UMBRAL_SALTO * 100}% del recorrido`);
if (inconcluyentes) {
  console.log(`\nAVISO: ${inconcluyentes} filas salieron INCONCLUYENTES en el criterio de frames porque el muestreador`);
  console.log('       headless no llego a tomar suficientes muestras. En esas filas la duracion si vale y el');
  console.log('       conteo de frames es un SUELO. El numero real solo sale del Safari del dueno, en su Mac.');
}
console.log(fallos ? `${fallos} COMPROBACIONES EN ROJO` : 'TODAS LAS ENTRADAS MANTIENEN LA TRANSICION');
process.exit(fallos ? 1 : 0);
