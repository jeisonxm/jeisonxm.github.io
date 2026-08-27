// stability.mjs — el criterio "3 corridas seguidas dan resultado identico",
// automatizado en vez de afirmado.
//
// Compara VEREDICTOS, no observaciones. La distincion importa y es deliberada:
//
//   veredicto     lo que la suite AFIRMA sobre el sitio: si hubo errores, si el
//                 transform cambia, que panel se alcanzo, si el timing del gesto
//                 fue fiel. Tiene que ser identico corrida a corrida o la suite
//                 no sirve como puerta de aceptacion.
//   observacion   los numeros crudos de la medicion: gaps en ms, scrollLeft,
//                 colores y bytes de un PNG. En una maquina compartida NUNCA van
//                 a ser identicos al byte, y exigirlo seria mentir.
//
// Caso concreto de por que existe esta distincion: panelReached solo entra en la
// comparacion cuando timingFiel es true. En WebKit la rueda "confiable" cuesta
// ~200 ms por evento, no reproduce el gesto de 120 ms, y su panel bailaba entre
// 1 y 2. Ahora eso se declara no interpretable, que es deterministicamente
// verdadero, en vez de reportar un numero al azar.
//
//   node stability.mjs [--runs=3]

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const RUNS = Number(argv.runs || 3);
const TMP = path.join(HERE, '.stability');

// La via SINTETICA es el instrumento de aceptacion: da 120-125 ms en los tres
// motores, asi que su panel es un veredicto.
const wheelVerdict = (w) => !w ? null : {
  timingFiel: w.timingFiel,
  // Un panel alcanzado con el gesto estirado no es el gesto que se pidio medir.
  panelReached: w.timingFiel ? w.panelReached : 'no-interpretable(timing no fiel)',
  error: w.error,
};

// La via CONFIABLE (page.mouse.wheel) es un evento trusted de verdad, pero su
// timing no se puede gobernar desde aqui: 92-214 ms en Firefox, ~200-460 en
// WebKit. Lo unico que afirma de forma estable es que la rueda real llega a la
// pagina y mueve el scroll. Eso si es veredicto; el resto es observacion.
const trustedVerdict = (w) => !w ? null : {
  llegaYMueve: w.panelReached !== null && w.panelReached > 0,
  error: w.error,
};

const probeVerdict = (rs) => rs.map((r) => ({
  engine: r.engine, launched: r.launched, version: r.version,
  cssSupportsScrollTimeline: r.cssSupportsScrollTimeline,
  // Que documento se midio ES veredicto: la portada redirige a /en/ segun el
  // idioma del navegador, y comparar dos corridas de documentos distintos no
  // significa nada.
  documento: r.documento && { pathname: r.documento.pathname, lang: r.documento.lang,
                              container: r.documento.container, heroImg: r.documento.heroImg },
  finePointer: r.finePointer, reducedMotion: r.reducedMotion,
  panels: r.panels, clientWidth: r.clientWidth,
  pageErrors: r.pageErrors, consoleErrors: r.consoleErrors,
  knownTypeError: r.knownTypeError,
  transform: r.transform && {
    enPanel0: r.transform.enPanel0, enPanel1: r.transform.enPanel1,
    enPanel2: r.transform.enPanel2,
    changed: r.transform.changed, measurable: r.transform.measurable,
  },
  wheel: trustedVerdict(r.wheel),
  wheelSynthetic: wheelVerdict(r.wheelSynthetic),
  forced: r.forcedSafari18 && {
    pageErrors: r.forcedSafari18.pageErrors,
    knownTypeError: r.forcedSafari18.knownTypeError,
    wheel: wheelVerdict(r.forcedSafari18.wheel),
  },
  error: r.error,
}));

const renderVerdict = (rs) => rs.map((r) => ({
  engine: r.engine, launched: r.launched, ok: r.ok, error: r.error,
  // heroDecodificada es veredicto; el conteo de diferidas es observacion
  // (depende de si el IntersectionObserver llego a disparar).
  heroDecodificada: r.imagenes ? r.imagenes.heroDecodificada : null,
}));

// Una corrida que sale != 0 NO puede tirar abajo la comprobacion de
// estabilidad: es justo el caso que la comprobacion existe para cazar. Se
// devuelve como dato, no como excepcion.
function once(script, out) {
  rmSync(out, { force: true });   // que una corrida muerta no herede el JSON anterior
  const r = spawnSync('node', [path.join(HERE, script), `--json=${out}`], {
    cwd: HERE, stdio: ['ignore', 'ignore', 'inherit'], env: process.env,
  });
  let datos = null;
  try { datos = JSON.parse(readFileSync(out, 'utf8')); } catch { /* sin JSON */ }
  return { status: r.status, datos };
}

// Una medicion de rueda que agoto sus 4 intentos sin timing fiel es una
// ADQUISICION FALLIDA del instrumento, no una observacion del sitio. Meterla en
// la comparacion convierte un hipo de reloj en un rojo de la puerta. Se descarta
// y se repite; tres descartes seguidos SI son rojo, porque entonces ya no es un
// hipo sino una regresion de timing.
const adquisicionFallida = (rs) => rs.some((r) =>
  (r.wheelSynthetic && r.wheelSynthetic.timingFiel === false) ||
  (r.forcedSafari18 && r.forcedSafari18.wheel && r.forcedSafari18.wheel.timingFiel === false));

const suites = [
  { name: 'probe', script: 'probe.mjs', out: TMP + '-probe.json', verdict: probeVerdict },
  { name: 'render', script: 'render-check.mjs', out: TMP + '-render.json', verdict: renderVerdict },
];

let allOk = true;
for (const s of suites) {
  const seen = [];
  let descartesSeguidos = 0;
  for (let i = 1; i <= RUNS; i++) {
    process.stdout.write(`  ${s.name} corrida ${i}/${RUNS}...`);
    const { status, datos } = once(s.script, s.out);
    if (!datos) {
      allOk = false;
      console.log(` FALLO: ${s.script} salio con ${status} y no dejo JSON`);
      break;
    }
    if (s.name === 'probe' && adquisicionFallida(datos)) {
      descartesSeguidos++;
      process.stdout.write(` descartada (timing no fiel, ${descartesSeguidos}/3)\n`);
      if (descartesSeguidos >= 3) {
        allOk = false;
        console.log(`  ${s.name}: FALLO — 3 adquisiciones fallidas seguidas. Ya no es un hipo de reloj.`);
        break;
      }
      i--;
      continue;
    }
    descartesSeguidos = 0;
    if (status !== 0) console.log(` (aviso: exit ${status})`);
    seen.push(JSON.stringify(s.verdict(datos), null, 2));
    process.stdout.write(' listo\n');
  }
  rmSync(s.out, { force: true });
  if (!seen.length) continue;
  const diffs = seen.map((v, i) => [i + 1, v]).filter(([, v]) => v !== seen[0]);
  if (diffs.length) {
    allOk = false;
    console.log(`\n${s.name}: FALLO — la corrida ${diffs[0][0]} difiere de la 1.\n`);
    const a = seen[0].split('\n'), b = diffs[0][1].split('\n');
    const engineAt = (i) => {
      for (let j = i; j >= 0; j--) { const m = a[j].match(/"engine": "(\w+)"/); if (m) return m[1]; }
      return '?';
    };
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) console.log(`  [${engineAt(i)}] linea ${i + 1}:\n    corrida 1: ${a[i]}\n    corrida ${diffs[0][0]}: ${b[i]}`);
    }
  } else {
    console.log(`${s.name}: OK — ${RUNS} corridas, veredictos identicos.`);
  }
}

console.log(allOk
  ? `\nESTABILIDAD OK — los veredictos de la suite no cambian en ${RUNS} corridas seguidas.`
  : '\nESTABILIDAD FALLIDA — la suite es flaky: no sirve como puerta de aceptacion.');
process.exit(allOk ? 0 : 1);
