# Todo — profundidad fotográfica en scroll horizontal

Plan completo y todas las decisiones: [tasks/plan.md](./plan.md)
Léelo **entero** antes de empezar. Este archivo es la lista; el plan es el contrato.

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado

**Regla de oro:** ninguna casilla se marca sin haber corrido `tasks/verify/run.sh`.
"Existe la regla CSS" no es verificación. "El transform cambió de X a Y" sí.

Si el arnés no está montado (sesión nueva, `/tmp` vaciado): `tasks/verify/run.sh setup`.

---

## FASE 0 — Revivir producción

- [x] **T0** Arreglar el `TypeError` de `src/script.js:34` — `8338168`, ya en producción.
  Verificado: escenario forzado sin errores en los 3 motores; Firefox pasa de `0→0` (muerto)
  a `0→1440`.

---

## FASE 1 — Arnés de verificación

### [x] T1 · Reconstruir el arnés multi-motor

**Descripción.** Playwright 1.62.1 + WebKit/Firefox/Chromium + el sysroot sin root que hace
arrancar WebKit. Guardar la línea base del sitio actual para poder comparar después.

**Acceptance criteria**
- [x] Los tres motores arrancan y renderizan (screenshot no vacío).
      `run.sh render`: sitio 9.095–9.126 colores / stdev 49; **control negativo** (página en
      blanco) 1 color / stdev 0. El medidor no es ciego.
- [x] `run.sh selftest` da **control positivo verde** en los 3: el control JS va de
      `matrix(1,0,0,1,-80,0)` a `matrix(1,0,0,1,-40,0)` en webkit, firefox y chromium.
- [x] `run.sh probe` corre entero y escribe `probe-results.json`.
- [x] Línea base guardada en `tasks/verify/baseline.json` (commit `43f2a36`, 2026-08-27).

**Verification**
- [x] `tasks/verify/run.sh` → exit 0.
- [x] 3 corridas seguidas dan resultado idéntico → **automatizado**: `run.sh stability`
      corre la suite 3 veces y compara veredictos. Verde.
- [x] `run.sh selfcheck` → exit 0: el arnés sabe dar **rojo** en los tres casos en que antes
      daba un falso verde. Su verde significa algo.

**Lo que hubo que reconstruir de cero, y no estaba previsto**

- **`tasks/verify/control/` no existía.** El fixture del control positivo nunca se commiteó:
  vivía en el scratchpad y murió con él. Sin él `selftest-transform.mjs` ni arranca. Reescrito
  y **ahora versionado**, con las 6 variantes comentadas.
- **5 scripts auxiliares apuntaban al scratchpad muerto** (`measure`, `ab`, `scrim`,
  `perfmetrics`, `shots`). Ahora resuelven el prototipo desde el repo (`tasks/proto/depth/`) y
  escriben fuera del árbol (`VERIFY_OUT`, por defecto `~/pw-harness/shots`).
- **`run.sh setup`**: el ritual manual de §3.2 del plan, automatizado. Una orden reconstruye
  todo. `env.sh` reescrito para los scripts sueltos.

**Tres fuentes de flakiness encontradas y cerradas** *(la suite NO era determinista)*

1. **Error de fuente fantasma en Firefox.** `downloadable font: download failed …
   NS_BINDING_ABORTED` aparecía en **1 de cada 8** corridas y ensuciaba `consoleErrors`, que
   es criterio de aceptación de T5. Cerrado con `await page.evaluate(() =>
   document.fonts.ready)` antes de medir: **0 de 8**. No es un defecto del sitio.
2. **Métricas de píxel bailando** ±2 colores y ±300 B por corrida. Cerrado con
   `screenshot({ animations: 'disabled' })`.
3. **El panel alcanzado por la rueda cambiaba entre corridas en WebKit** (4 de 8 daban panel
   2 en vez de 1). **No es el sitio: es el instrumento.** Ver el aviso de T7.

**Auditoría adversarial del propio arnés — 6 defectos reales, todos cerrados**

Un arnés que no puede fallar no verifica nada. Se auditó buscando falsos verdes, y salieron
seis. **Los tres que se podían automatizar viven ahora en `run.sh selfcheck`**, que rompe cosas
a propósito y exige rojo — estaban comprobados a mano una sola vez, que es exactamente lo que
este plan no acepta como verificación:

1. **El control positivo pasaba con el fixture roto.** La regla era `!changed.a` — una
   aserción vacía: en WebKit A leía `none -> none`, y `'none' !== 'none'` es `false`, así que
   la satisfacía igual un transform congelado que uno **ausente**. Ahora la aserción es
   **positiva** (A clavada en el primer keyframe, autocalibrada contra B) y el fixture usa los
   keyframes del sitio (`translate3d(±2.6%)`, no px), que es lo que hace que WebKit devuelva
   una matriz de verdad. **Probado por mutación:** con la regla `#a` rota, el selftest da rojo
   y sale con 1.
2. **`probe.mjs` salía con 0 midiendo nada.** Apuntado a un directorio que no fuera el sitio,
   leía `undefined` en todo y aprobaba. Ahora exige `#container`, paneles y `#hero .panel-bg
   img`, y sale con 1 nombrando lo que faltó. Verificado con un directorio falso.
3. **`render` aprobaba con las 5 fotos rotas** (9.358 colores, stdev 49: el texto y el ruido
   SVG bastan). Ahora exige que la foto del hero decodifique.
4. **El paso «a mitad de scroll» era un empate de `scroll-snap`.** 720 px es equidistante de
   los centros del panel 0 y del 1: cada motor lo rompía a su manera. Sustituido por tres
   posiciones de panel reales (`scrollLeft` 0 / 1440 / 2880).
5. **`stability` moría justo cuando el fallo era intermitente**: `once()` lanzaba si el hijo
   salía != 0. Ahora lo trata como dato. Y una medición de rueda que agota sus 4 intentos es
   una **adquisición fallida del instrumento**, no una observación del sitio: se descarta y se
   repite; 3 descartes seguidos sí son rojo.
6. **`run.sh setup` cantaba victoria con un sysroot a medias.** Ahora cuenta los paquetes,
   muere si falta uno y termina corriendo el control positivo.

**Y un descubrimiento que cambia cómo leer todo lo medido hasta hoy:** el arnés estaba
midiendo **`/en/`**, no `/`. `src/lang.js:51` redirige la raíz según `navigator.language`, y el
locale por defecto de Playwright es `en-US`. Nada lo registraba. Ahora hay `--locale`/`--path`,
el defecto es `es-ES` + `/`, y el JSON dice qué se pidió y qué se sirvió. Comprobado que las
dos portadas dan medidas idénticas, así que **no invalida ningún número** — pero T4, T2c y T10
tienen que medir las dos, porque las 19 páginas EN cargan además `obsidiana.css`.

**Lo que el arnés NO puede hacer, y hay que decirlo** *(§3.4 del plan)*
`page.mouse.wheel` no reproduce un gesto de 120 ms en esta máquina: cuesta ~200–460 ms por
evento en WebKit, 92–214 ms en Firefox, 134–176 ms en Chromium. Por eso el probe mide por dos
vías y marca cada una con `timingFiel` y los gaps reales.

**Trampas ya resueltas (§3.2 del plan): no las redescubras.**
El wrapper de WebKit pisa `LD_LIBRARY_PATH` → usar `wk_run.sh`. `libx264.so` da falso
positivo → `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. Paquetes de Ubuntu 24.04 noble.
`import` en ESM **no mira `NODE_PATH`** → enlace `tasks/verify/node_modules`.
`npm install` y `apt-get download` **no tienen red en un comando de fondo**: en primer plano.

---

## FASE 2 — Assets y paleta · *T2/T3/T4 y T2c se pueden paralelizar*

### [x] T2 · Recortes con alfa de las 5 fotos elegidas

**Descripción.** Producir la capa L2 (figura) de las 5 fotos de §2.6 del plan.

**Acceptance criteria**
- [x] 5 figuras a 1800 px de alto, en AVIF y WebP con alfa → `src/images/panels/{slug}-fig1800.{avif,webp}`.
- [x] Peso dentro del presupuesto. **El presupuesto es un techo, no un rango**: pesar menos
      nunca fue un defecto, y los «26–42 KB» del plan eran la descripción de lo que salió del
      pipeline, no un criterio. Lo que sí es criterio y se mide:
      **AVIF de las 5 = 170.512 B** contra 240.167 B disponibles (total A menos L1), y
      **hero = 40.154 B** contra el techo de LCP de 41.180 B. Pasa con 1.026 B de margen.
- [x] Relleno **push-pull** verificado: 453–897 colores distintos en lo transparente. Una
      pre-composición contra el color del panel daría uno solo.
- [x] Defringe `T=0.35` **no re-aplicado**: el alfa del recorte YA es `a2`. Aplicarlo dos veces
      se comería el tubo del chaleco de `285`. Verificado a 3×: el tubo y el clip sobreviven.
- [x] Retoque de `764`: la zapatilla flotante tras la pantorrilla derecha, borrada (1.952 px).
      Verificado antes/después a 3×: la silueta de la pantorrilla queda natural.
- [x] **Escalas normalizadas por altura de cabeza y línea de base común.**
      Cabezas: de **180–385 px (2,14× de dispersión) a 241–243 px (1,01×)**.
      Línea de base: las 4 figuras con pies, **spread 0 px**.

**Verification**
- [x] Hoja de contacto sobre los 4 campos de color, **mirada de verdad** (no solo generada).
      `tasks/pipeline/contactsheet.mjs`.
- [x] 0 flips de alfa en las 5. *(Se comprueba AVIF contra WebP, que son los dos formatos que
      se sirven. `alphacheck.js` comparaba contra un PNG intermedio que ya no existe.)*
- [x] Ancho de banda de borde: **mediana 2–3 px**, p90 4–8. El plan pedía ~4.

**Lo que obligó a no usar el atajo tal cual**

Los recortes de `cutouts/` estaban técnicamente bien (1200×1800, pesos en rango, push-pull,
0 flips, borde 2–3 px) pero normalizados **por altura de imagen**: cada figura a la escala que
tenía en su foto. Eso es exactamente el defecto de §2.6.

Y no bastaba reescalarlos: medido, ampliar hero (1,344×) y skills (1,322×) desde el h1800
cuesta **−16,0 % y −28,7 % de energía de gradiente** contra remuestrear una sola vez desde el
original. Eso es blandura visible, y la Versión A existe para dar HD real. Por eso
`stage_d_normalize.mjs` recompone desde el JPEG original a la resolución de destino — siempre
reduciendo, nunca ampliando — y **rehace el defringe**, porque el RGB del recorte se descarta
junto con su resolución. Sin numpy ni scipy en esta máquina, el
`distance_transform_edt` de `stage_b2_defringe.py` va como EDT de dos pasadas con propagación
de índices (Danielsson), exacta y O(N), sobre la resolución de destino (~3,9 Mpx) en vez de la
del original (10,7 Mpx).

**Dos decisiones de dirección de arte, tomadas mirando**

1. **`285` lleva fundido de 220 px abajo.** La foto está cortada a la altura del muslo. Sin
   fundido es una amputación recta en mitad del lienzo: comparado lado a lado sobre claro y
   sobre oscuro, se lee como defecto. Con fundido la figura se disuelve en el panel, que es
   además lo que pidió el dueño («que las fotos se unan con el fondo»).
2. **Un corte que vive en el borde del lienzo se queda en el borde.** `285` está cortada a la
   derecha; centrarla convertiría un encuadre en una amputación visible. Va anclada a la
   derecha. Lo mismo para los cortes de abajo.

**Trampa que costó una vuelta entera:** `sharp` **promueve a 3 canales** una imagen de un solo
canal al reescalarla. El alfa se leía como tripletas interleavadas y salían figuras fantasma
con rayado horizontal — se veía raro, pero no fallaba solo. Ahora la geometría de los dos
buffers se **afirma** (`toColourspace('b-w')` + comprobación de `info.channels`), no se supone.

**Pendiente para T5/T6:** cablear estas figuras en los paneles. T2 solo las produce.

---

### [x] T3 · Capas de fondo y fotos de la Versión B

**Acceptance criteria**
- [x] L1: 320 px de ancho, q35, blur **horneado** (sigma 6) y también horneados
      `brightness .92 / contrast 1.05 / saturate .9`. **8.327 B los 5 juntos** contra 26 KB
      de presupuesto — tres veces por debajo.
- [x] Versión B: foto entera a **2048 px máx** (1366×2048). El `mask-image` es CSS y lo pone T5.
- [x] Escrito en el commit tal cual: **la Versión B no puede ser HD real a pantalla completa
      sin duplicar el peso.** A 2048 sigue **1,58×** escalada sobre un panel de 3226 px de
      dispositivo, y pesa **+82 %** sobre la Versión A.

**Verification**
- [x] Peso total Versión A = **178.839 B** ≤ 266.140 B, y **−35,1 %** contra los 275.430 B de
      hoy. El plan preveía −3,4 %; sale mucho mejor porque L1 costó un tercio de lo estimado.
- [x] Panel 1 = **42.099 B** ≤ 46.375 B. **4.276 B de margen.**
- [x] L1 a 320 px vs 1536 px bajo `blur(40px)`: **maxΔ 5–13/255, meanΔ 0,37–0,56, SSIM ≥ 0,9998.**
      La premisa se reproduce. *(El plan decía maxΔ 4; en `285` sale 13. Sigue siendo invisible
      —meanΔ 0,56— pero el número del plan era optimista.)*
- [x] `tasks/pipeline/checkbg.mjs` → exit 0, con control negativo: la foto sin desenfocar
      tiene que **fallar** la comprobación de blur, y falla.

**El hallazgo que obligó a rehacer L1: el fantasma es real**

El plan (§T5) pedía «verificar el fantasma entre L1 y L2 … se supone que el blur de L1 lo
destruye, pero **eso es un juicio, no una medición**». Medido: **no lo destruye.** Montada la
Versión A y mirada, se veía la misma persona borrosa al lado de la nítida, en los cinco paneles.

La causa es de T2: normalizar las cabezas movió y reescaló cada figura, así que un fondo
encuadrado «como en la foto original» ya no cae donde cae su figura. La corrección es que L1
use **la misma transformación que su figura**, leída de `tasks/pipeline/figs-geometry.json`
—que `stage_d` ahora publica como contrato—. Con eso la figura nítida tapa su propio borroso
en `p=0` y el paralaje los separa después, que es justamente el efecto buscado.

**Y una segunda vuelta, también por mirar:** donde la figura se redujo (`285` va a 0,629×) el
cuadro no cubre el lienzo — le faltan 445 px por la izquierda y 792 por abajo, dos tercios del
área. Rellenar espejando producía un **caleidoscopio** con la cara y el dorsal repetidos en
simetría: se leía como error, no como bokeh. Se replica el píxel del borde, que bajo sigma 6
es un degradado suave.

**El color horneado se verificó contra un navegador real**, no contra la fórmula. `checkbake.mjs`
compara el asset horneado contra `filter: brightness(.92) contrast(1.05) saturate(.9)` pintado
por Chromium:

| vía | maxΔ |
|---|---|
| `recomb` + acotado entre pasos ← **lo que se hornea** | **2/255** |
| `recomb` con la lineal fusionada | 7/255 |
| `modulate` LCh de libvips *(control negativo)* | 23/255 |

Dos cosas que no eran obvias: `saturate()` del navegador es la matriz de `feColorMatrix`, no el
LCh de `libvips.modulate`; y **CSS acota a [0,255] después de cada función de filtro**, así que
fusionar `brightness`+`contrast` en una sola lineal y saturar después *no* es equivalente.

**`tasks/picks.json` quedó obsoleto respecto a §2.6:** asigna a skills la foto `763`, que §2.6
marca **NO publicable**, y a blog la `886`. L1 ya no lo usa —toma la asignación de §2.6, la
misma que las figuras—. Cuando T6 retire los fondos actuales, hay que retirar o actualizar
también `picks.json` y `tasks/build.mjs`.

**Pendiente para T5:** el `mask-image` que disuelve los bordes de la Versión B.

**Dependencies:** ninguna. **Scope:** M.

---

### [x] T4 · Paleta derivada de las 5 fotos

**Acceptance criteria**
- [x] Paleta extraída de las **5 fotos elegidas**, medidas en OKLCh
      (`tasks/pipeline/palette.mjs`), no de las estatuas de IA borradas.
- [x] Un solo archivo de tokens: `src/styles/tokens.css`, generado por
      `tasks/pipeline/maketokens.mjs`. *(Cargarlo en los 38 HTML es T2c.)*
- [x] Recoge los tonos reales. Medido, tonos dominantes del conjunto:
      **245°/235° azul** (camiseta de `285`, sombras), **55°/65° cálido** (piel, asfalto),
      **115°/105° verde de trail**, **185°/195° turquesa de camiseta**.
      La UI anterior vivía **entera** en 67–79° con croma 0,009–0,027. Ahí estaba la raíz de
      «las fotos no combinan».
- [x] Contraste AA verificado **sobre las fotos reales**, en A y en B.

**Decisiones, con su porqué**
- **Neutros en h=245°**, el tono dominante. Fríos a propósito: un neutro cálido compite con la
  piel y el asfalto; uno frío los deja resaltar. Croma 0,010–0,020 — tiene que leerse neutro.
- **Acento en h=195°**, el turquesa que *ya* llevan las camisetas de hero y blog. Croma 0,085:
  fotográfico, no neón.
- **`--panel-*` por tono dominante de su propia L1**, no por promedio. Reducir la L1 a 1×1
  aplastaba el tono y blog y contact salían del mismo marrón. Ahora: hero 85°, about 245°,
  skills 135°, blog 55°, contact 95°, cada uno con la luminosidad real de su foto.
- **Nada deriva de `--marble-warm`.** En `obsidiana.css` vale `#00D4FF`, cian eléctrico.

**Verification**
- [x] `tasks/pipeline/maketokens.mjs` → exit 0: **los 11 pares de color planos cumplen AA**,
      el más justo `--gray-dark` sobre `--surface` a 5,23:1.
- [x] `tasks/contrast.mjs` → exit 0 sobre los 5 paneles **en las dos versiones**. Estaba
      obsoleto (usaba `picks.json` y rutas muertas); reescrito para medir sobre los paneles
      reales compuestos.

**El número que T5 necesita:** scrim **0,56 en Versión A** y **0,58 en Versión B** (peor caso,
`contact`/formulario). Tope duro 0,85 — por encima ya no es un scrim, es tapar la foto.

**Dependencies:** T2, T3. **Scope:** M.

---

### [x] T2c · Unificar los tres `:root`

**Acceptance criteria**
- [x] Una sola fuente de tokens: `src/styles/tokens.css`, cargado por **los 38 HTML**.
      `obsidiana.css` **eliminado**; retirado de las 19 páginas EN. ES y EN comparten paleta.
- [x] Resueltos los tokens con el mismo nombre y valor distinto: ya no hay tres `:root`.
- [x] Borrados los huérfanos: toda la escala `--marble-*` desaparece.
- [x] Colores hardcodeados migrados. **El número del plan no se reproduce**: no eran 82 sino
      **88** en `style.css`+`blog.css` (los 56 de `obsidiana.css` se van con el archivo).
      Quedan **7**, todos `rgba(0,0,0,α)` de `box-shadow`: una sombra es negra
      independientemente de la paleta. Justificados, no migrados.
- [x] Cero `color-mix()`, así que no hace falta declaración de respaldo delante (defecto 3).
      En su lugar, cuatro tripletes (`--white-rgb`, `--gray-rgb`, `--bg-rgb`, `--surface-rgb`)
      y `rgb(R G B / α)`, soportado desde Safari 12.1.

**Cómo se migraron los 30 `var(--marble-*)`:** por **luminosidad OKLCh al token nuevo más
cercano**, mecánicamente. Preserva la jerarquía visual exacta sin que yo invente decisiones de
diseño que no podría verificar. `--marble-warm` → `--gray` (L 0,790 → 0,814), etc.

**Verification**
- [x] `tasks/verify/tokens-check.mjs`: **114 cargas** (38 páginas × 3 motores), todas resuelven
      todos sus tokens y ninguna da `pageError`.
- [x] `run.sh` → exit 0. Cero `consoleErrors` en los tres motores.
- [x] Cero literales hex en los 38 HTML.

**Dos defectos preexistentes que la comprobación destapó**
1. **`--accent-glow` se usaba en la portada ES y no existía en `style.css`** (sí en las otras
   dos hojas). Caía siempre al respaldo. Ahora está definido una sola vez.
2. **`--marble-cream` en un `<style>` en línea de `blog/index.html`**, que ninguna migración de
   hojas externas habría tocado.

**Y un fallo mío que solo se vio por tener control:** la primera versión de `tokens-check`
encontraba **2 tokens en todo el sitio** y parecía verde. Desde CSS Nesting un `CSSStyleRule`
también tiene `.cssRules` (vacío pero *truthy*), así que `if (x.cssRules) recurse; else leer
cssText` no leía ni una declaración. Corregido: ahora ve 28 por página.

**Dependencies:** T4. **Scope:** L.

---

### CHECKPOINT A — antes de tocar el motor
- [x] Los 5 recortes revisados en hoja de contacto, escalas normalizadas (T2).
- [ ] Paleta con contraste AA verificado sobre las fotos reales.
- [ ] Presupuesto de bytes medido y por debajo del de hoy.

---

## FASE 3 — El molde

### [ ] T5 · Panel hero completo, las dos versiones

**Descripción.** **Este es el slice vertical**: imagen + CSS + JS + verificación en una sola
tarea. El hero es el molde; hasta que no esté verificado, replicarlo 4 veces multiplica el error.

**Acceptance criteria**
- [ ] Las 4 capas de §2.2 del plan, con sus factores exactos.
- [ ] Motor: **un solo rAF**, lee `scrollLeft` una vez por frame, escribe solo `--p` y `--a`.
      Cero `getComputedStyle`, `offsetLeft` o `getBoundingClientRect` dentro del bucle.
- [ ] Cero scroll-driven animations. **Cero `@supports` sobre ellas.**
- [ ] Toda `var()` con fallback: `var(--p,0)`, `var(--a,0)`, `var(--vw,0px)`.
- [ ] Transforms 2D. `will-change` gobernado por `IntersectionObserver` a `rootMargin 60%`,
      **nunca tocado dentro del rAF**.
- [ ] Scrim como `background` de la capa de contenido (V3), **no** como elemento suelto:
      medido, un scrim suelto se promovía por solapamiento y Blink aplastaba los 5 en una capa
      de 7200×900 (122.5 → 112.4 MB de extensión al fusionarlo).
- [ ] Botón A/B funcionando, con persistencia en `localStorage`. **Por defecto: A.**
- [ ] Blur horneado en el asset. Cero `filter: blur()` y cero `backdrop-filter` en CSS.
- [ ] Tope absoluto de los factores: `min(k·vw, 340px)`.

**Verification — la que de verdad importa**
- [ ] **El `transform` CAMBIA con el scroll**, medido en los 3 motores. Es *la* métrica: hoy
      da `matrix(1,0,0,1,-41.9327,0)` idéntico en las tres posiciones.
- [ ] Los 4 factores salen **distintos entre sí** por regresión:
      `k_far 0.2200 · k_fig 0.1000 · k_wash 0.0500 · k_txt −0.0800`.
- [ ] `transform` es **0 exacto** en `p=0` (hoy hay 41,93 px de descentrado permanente).
- [ ] Cero errores de consola en escenario normal **y forzado**.
- [ ] El **fantasma entre L1 y L2 ya se midió en T3** y el blur **no** lo destruye: se
      resolvió dando a L1 la misma transformación que su figura (`figs-geometry.json`), así que
      en `p=0` la figura tapa su propio borroso. Aquí solo queda comprobar que el paralaje los
      separa como se espera (86,4 px a `|p|=0.5`) sin reabrirlo.
- [ ] Sin escalón duro de luminancia dentro del panel (salto máx. ~1.9, el ruido de fondo).
      Cerrar el último stop del gradiente en **84 %**, no en 100 %.
- [ ] Probado a 2560 px de ancho.
- [ ] `prefers-reduced-motion` y puntero grueso probados explícitamente.

**Dependencies:** T2, T3, T4, T2c. **Scope:** L.

### CHECKPOINT B
- [ ] Todo lo de arriba verde antes de pasar a T6.

---

## FASE 4 — Replicar

### [ ] T6 · Los otros 4 paneles

**Acceptance criteria**
- [ ] Sobre Mí = `285` · Skills = `103865` · Blog = `764` · Contacto = `533`.
- [ ] Los 5 paneles con las 4 capas y ambas versiones.
- [ ] **Sin JS, las 5 fotos cargan.** Hoy solo carga 1 de 5 (defecto 6).

**Verification**
- [ ] Suite verde en los 5 paneles.
- [ ] Hoja de contacto de los 5: escalas de figura coherentes entre paneles contiguos.
- [ ] Prueba con JavaScript desactivado.

**Dependencies:** T5. **Scope:** M.

---

## FASE 5 — Gestos

### [ ] T7 · Las tres reglas

**Acceptance criteria**
- [ ] **Regla 1:** gesto horizontal dominante → **cero intervención, ni `preventDefault`**.
      Lo resuelve el scroll nativo + `scroll-snap-type: x mandatory`. Es el caso del Mac del dueño.
- [ ] **Regla 2:** rueda discreta → 1 notch = 1 panel, sin acumulador y **sin cooldown**.
- [ ] **Regla 3:** vertical continuo → acumulador + inercia detectada por **decaimiento
      monótono**, no por temporizador. Constantes en §2.4 del plan.
- [ ] El `IntersectionObserver` **ya no escribe `target`**. Solo pinta los puntos.
- [ ] Guarda de convergencia al detenerse el scroll (máx. 2 reintentos).
- [ ] `e.ctrlKey` sigue pasando sin tocar (pinch-to-zoom de macOS).
- [ ] Las flechas no se roban con el foco en `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable`.
- [ ] Los scrollers anidados (`.about-content`, `.contact-panel .panel-content`) se quedan la
      rueda si les queda recorrido.

**Verification — los 8 escenarios, idénticos en los 3 motores**
- [ ] 3 flicks + inercia @120 ms → **panel 3** *(hoy: panel 1 — es el defecto 4)*
- [ ] 3 flicks @40 ms → panel 3
- [ ] 1 flick fuerte + 30 eventos de inercia → **panel 1** (no 2)
- [ ] 1 flick suave + 30 de inercia → panel 1
- [ ] 3 notches de ratón @60 ms → panel 3
- [ ] Arrastre continuo 1,2 s → **panel 3** *(hoy: panel 2)*
- [ ] Gesto horizontal → 0 intervención, 0 avances
- [ ] Desde panel 3, 2 flicks atrás → panel 1

**Dependencies:** T6. **Scope:** M.

**Aviso 1:** las constantes están ajustadas contra un perfil de flick **sintético**. `DISCRETE=90`
y `PEAK_SLOW=18` pueden necesitar reajuste contra deltas reales del trackpad del dueño.

**Aviso 2 — con qué instrumento medir los 8 escenarios (medido en T1).** `page.mouse.wheel`
**no** reproduce un gesto de 120 ms: cuesta ~200–460 ms por evento en WebKit headless, 92–214
en Firefox, 134–176 en Chromium. Con `COOLDOWN_MS=650`, un gesto estirado deja pasar el tercer
evento y el panel alcanzado cambia entre corridas. Usar la vía **sintética** de `probe.mjs`
(`WheelEvent` despachado dentro de la página, 120–125 ms en los tres motores) y **exigir
`timingFiel=true`**. Un panel medido con `timingFiel=false` no es el escenario que se pidió.
La vía confiable se queda como humo: prueba que la rueda real llega y mueve, nada más.

---

## FASE 6 — Portal del blog

### [ ] T8 · Portal de entrada y de vuelta

**Acceptance criteria**
- [ ] **Solo 9 archivos**, 6 de ellos HTML. **Los 34 posts: CERO ediciones.**
- [ ] Borrado el `@view-transition` actual de `blog.css` y `style.css`. **Si no se borra, los
      34 posts siguen optando y tendrán transición — justo lo contrario de lo pedido.**
- [ ] Efecto según la especificación de §2.10. Radio en **longitud, no en porcentaje**.
- [ ] `clip-path` como base, `mask-image` solo como mejora aditiva.
- [ ] Botón-portal: `<a href>` real, texto real, icono FontAwesome inline, cero emojis.
      Borde a **0.55** (a 0.28 daba 1.87:1 y fallaba WCAG 1.4.11).
- [ ] `unhandledrejection` filtrado para el `AbortError: Transition was skipped`. **No se puede
      atrapar con `.catch()`** — ya está probado.
- [ ] reduced-motion → corte seco, no fundido.
- [ ] Sin JS: navegable. El portal se abre desde el centro.

**Verification**
- [ ] `tasks/proto/portal/verify-rollout.py` → **exit 0**. (Da exit 1 sobre el repo sin tocar,
      o sea que discrimina de verdad.)
- [ ] ES portada→blog `vt=true`; ES blog→portada `vt=true`; EN blog→portada `vt=true`;
      blog→**post** `vt=false`.
- [ ] Firefox: navegación perfecta con corte instantáneo, cero roturas.
- [ ] Botón atrás: `opacity:1`, url y title correctos, sin estado pegado.

**Dependencies:** T2c (tokens). **Scope:** M.

**Las tres asimetrías ES/EN que revientan cualquier script ingenuo:** `blog.css` se enlaza
`./blog.css` en ES y `/blog/blog.css` en EN; las 19 páginas EN cargan además `obsidiana.css`;
el enlace al blog es `./blog/` en ES y `/en/blog/` en EN. **Anclar al último
`<link rel=stylesheet>` y a una regex de href, nunca a una cadena literal.**

---

## FASE 7 — Cierre

### [ ] T9 · CV

- [ ] Generar `JEISON_SANG_WU_MITRE_EN_AI_BUILDER.pdf` con
      `soffice --headless --convert-to pdf --outdir <dir> <docx>`.
- [ ] ES → `ES_2026.pdf`. EN → `EN_AI_BUILDER.pdf`. `.docx` como enlace secundario.
- [ ] Fuente: `/home/archy/archy/cv/`. Copias ya en `src/` sin commitear.
- [ ] Commitear los archivos (hoy están sin seguimiento).

**Verification:** ambos enlaces descargan un PDF que abre bien. **Scope:** S.

### [ ] T10 · Contraste y accesibilidad

- [ ] **Los 6 fallos de contraste del blog ES que Lighthouse NO ve** (hasta 2.87:1). Se le
      escapan porque el ruido SVG de fondo deja 60 nodos «no evaluables» para axe. **Medirlos a
      mano, no confiar en la puntuación.**
- [ ] a11y 100 conservado. No perder aria, tabindex, skip links, hreflang, meta ni structured data.
- [ ] Contraste AA en las dos versiones (A y B) sobre las 5 fotos.

**Dependencies:** T6, T8. **Scope:** M.

### [ ] T11 · Verificación final e informe honesto

- [ ] Suite completa verde: 3 motores × escenario normal y forzado.
- [ ] LCP ≤ 2,5 s medido.
- [ ] **Escribir explícitamente lo NO verificable desde esta máquina** (§3.4 del plan):
      frame-rate real, coste de blur en Safari, inercia real del trackpad, el camino nativo
      horizontal de la regla 1, y que el WebKit de prueba es Safari 26.5 y no el del dueño.
      **No lo vendas como equivalente a un Mac.**

**Dependencies:** todas. **Scope:** S.

---

## Pendiente del dueño — no bloquea nada

- [ ] **Versión exacta de su Safari** (Safari > Acerca de Safari). Decide si ve el portal
      (necesita 18.2+).
- [ ] Endpoint real de Formspree.
- [ ] Si quiere regenerar `EN_AI_BUILDER` antes de publicarlo (§2.11 del plan).
