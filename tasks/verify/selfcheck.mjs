// selfcheck.mjs — los controles NEGATIVOS del arnes, ejecutables.
//
// El arnes afirma "el sitio esta bien". Este archivo comprueba lo otro: que
// sabe decir "el sitio esta MAL". Un medidor que solo sabe dar verde no mide.
//
// Cada caso rompe algo a proposito y exige exit != 0. Los tres se encontraron
// como falsos verdes REALES durante T1, se arreglaron, y viven aqui para que no
// vuelvan en silencio. Antes de esto eran comprobaciones a mano de una sola vez:
// justo lo que este plan no acepta como verificacion.
//
//   node selfcheck.mjs
//
// Nada de esto toca el repo: las mutaciones viven en $VERIFY_OUT/selfcheck.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(process.env.VERIFY_OUT || path.join(process.env.HOME, 'pw-harness', 'shots'), 'selfcheck');

function run(script, args) {
  const r = spawnSync('node', [path.join(HERE, script), ...args],
    { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const casos = [];

// --- 1. probe contra algo que NO es el sitio ---------------------------------
// Antes: leia undefined en todo, escribia `transform: {}` y salia con 0. Un
// instrumento ciego producia el mismo `changed: false` que T5 debe hacer voltear.
{
  const dir = path.join(OUT, 'no-es-el-sitio');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>nada</title><body>hola\n');
  const r = run('probe.mjs', ['--engines=chromium', `--site=${dir}`]);
  casos.push({
    nombre: 'probe contra un directorio que no es el sitio',
    espera: 'exit != 0 y decir que falta #container',
    ok: r.status !== 0 && /no es el sitio esperado/.test(r.out),
    detalle: `exit ${r.status}`,
  });
}

// --- 2. render-check con las fotos rotas -------------------------------------
// Antes: el texto y el ruido SVG dan solos ~824 colores y stdev 27, asi que
// "pintado" salia true con CERO fotos cargadas.
{
  const dir = path.join(OUT, 'sitio-sin-fotos');
  cpSync(REPO, dir, {
    recursive: true,
    filter: (src) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(src),
  });
  rmSync(path.join(dir, 'src', 'images'), { recursive: true, force: true });
  const r = run('render-check.mjs', ['--engines=chromium', `--site=${dir}`]);
  casos.push({
    nombre: 'render-check con las 5 fotos rotas',
    espera: 'exit != 0 aunque los pixeles digan "pintado"',
    ok: r.status !== 0 && /hero decodificada=false/.test(r.out),
    // Se afirma tambien lo contrario: que el test de pixeles SOLO habria pasado.
    detalle: `exit ${r.status}` + (/pintado=true/.test(r.out)
      ? ' — y confirmado: pintado=true, o sea que solo los pixeles lo habrian aprobado'
      : ' — OJO: pintado no salio true, el caso ya no demuestra lo mismo'),
  });
}

// --- 3. selftest con el fixture del control roto -----------------------------
// Antes: la regla era `!changed.a`, y en WebKit A leia `none -> none`, asi que
// `'none' !== 'none'` la satisfacia igual con la regla #a ausente.
{
  const dir = path.join(OUT, 'control-roto');
  cpSync(path.join(HERE, 'control'), dir, { recursive: true });
  const f = path.join(dir, 'index.html');
  const html = readFileSync(f, 'utf8');
  const roto = html.replace('#a .panel-bg img {', '#a-ROTO .panel-bg img {');
  if (roto === html) {
    casos.push({ nombre: 'selftest con el fixture roto', espera: 'mutacion aplicable',
      ok: false, detalle: 'no se pudo mutar el fixture: cambio el selector de #a' });
  } else {
    writeFileSync(f, roto);
    const r = run('selftest-transform.mjs', [`--control=${dir}`]);
    casos.push({
      nombre: 'selftest con la regla #a del fixture rota',
      espera: 'exit != 0: el control positivo tiene que saber dar rojo',
      ok: r.status !== 0 && /clavada en el primer keyframe = false/.test(r.out),
      detalle: `exit ${r.status}`,
    });
  }
}

let allOk = true;
console.log('CONTROLES NEGATIVOS DEL ARNES\n');
for (const c of casos) {
  if (!c.ok) allOk = false;
  console.log(`  ${c.ok ? 'OK  ' : 'FALLO'}  ${c.nombre}`);
  console.log(`         espera: ${c.espera}`);
  console.log(`         obtuvo: ${c.detalle}\n`);
}
rmSync(OUT, { recursive: true, force: true });
console.log(allOk
  ? 'SELFCHECK OK — el arnes sabe dar rojo. Su verde significa algo.'
  : 'SELFCHECK FALLIDO — hay un control que ya no discrimina. Su verde no vale.');
process.exit(allOk ? 0 : 1);
