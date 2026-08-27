# Todo — profundidad fotográfica en scroll horizontal

Plan completo y todas las decisiones: [tasks/plan.md](./plan.md)
Léelo **entero** antes de empezar. Este archivo es la lista; el plan es el contrato.

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado

**Regla de oro:** ninguna casilla se marca sin haber corrido `tasks/verify/run.sh`.
"Existe la regla CSS" no es verificación. "El transform cambió de X a Y" sí.

---

## FASE 0 — Revivir producción

- [x] **T0** Arreglar el `TypeError` de `src/script.js:34` — `8338168`, ya en producción.
  Verificado: escenario forzado sin errores en los 3 motores; Firefox pasa de `0→0` (muerto)
  a `0→1440`.

---

## FASE 1 — Arnés de verificación

### [ ] T1 · Reconstruir el arnés multi-motor

**Descripción.** Playwright 1.62.1 + WebKit/Firefox/Chromium + el sysroot sin root que hace
arrancar WebKit. Guardar la línea base del sitio actual para poder comparar después.

**Acceptance criteria**
- [ ] Los tres motores arrancan y renderizan (screenshot no vacío).
- [ ] `tasks/verify/run.sh selftest` da **control positivo verde** en los 3: el transform de
      control cambia de `-80` a `-40`. Esto demuestra que el medidor no es ciego.
- [ ] `tasks/verify/run.sh probe` corre entero y escribe `probe-results.json`.
- [ ] Línea base guardada en `tasks/verify/baseline.json`.

**Verification**
- `tasks/verify/run.sh` → exit 0.
- 3 corridas seguidas dan resultado idéntico (la suite no es flaky; ya está comprobado).

**Dependencies:** ninguna. **Scope:** S — no toca ningún archivo del sitio.

**Trampas ya resueltas (§3.2 del plan): no las redescubras.**
El wrapper de WebKit pisa `LD_LIBRARY_PATH` → usar `wk_run.sh`. `libx264.so` da falso
positivo → `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. Paquetes de Ubuntu 24.04 noble.

---

## FASE 2 — Assets y paleta · *T2/T3/T4 y T2c se pueden paralelizar*

### [ ] T2 · Recortes con alfa de las 5 fotos elegidas

**Descripción.** Producir la capa L2 (figura) de las 5 fotos de §2.6 del plan. Los scripts ya
existen y están verificados en `tasks/pipeline/`.

**Acceptance criteria**
- [ ] 5 figuras a 1800 px de alto, en AVIF y WebP con alfa.
- [ ] AVIF entre 26 y 42 KB; WebP entre 58 y 103 KB (rangos medidos).
- [ ] Relleno **push-pull**, no pre-composición contra el color del panel (`maxΔ` 5/255 vs 30/255).
- [ ] Defringe aplicado con `T=0.35`. **No subir T sin volver a mirar `285`**: el tubo del
      chaleco de hidratación (~3 px) es lo primero que se pierde.
- [ ] Retoque manual de ~1 min en `764`: borrar la zapatilla blanca que queda flotando tras
      la pantorrilla derecha.
- [ ] **Escalas normalizadas por altura de cabeza y línea de base común**, no por altura de
      imagen. `285` es un primer plano y las otras cuerpo entero: sin normalizar, se lee a descuido.

**Verification**
- [ ] Hoja de contacto con las 5 sobre 4 campos de color (magenta, claro `#f2efe9`, oscuro
      `#12161c`, cálido `#e8b53a`). **Mirarla de verdad**, no solo generarla.
- [ ] `tasks/pipeline/alphacheck.js`: 0 flips de alfa en las 5.
- [ ] Ancho de banda de borde: mediana ~4 px a 1800 px de alto.

**Dependencies:** ninguna. **Scope:** M.

**Obligatorio:** `enable_cpu_mem_arena=False` + `enable_mem_pattern=False` dentro de
`stage_a_matte.py`. Sin eso el proceso muere con SIGTERM a los 19 s con 6.9 GB RSS y **no corre
nunca** en esta máquina. Una foto por subproceso, verificar que el archivo de salida existe
después de cada una, reintentar. Los kills son no deterministas (exit 143, sin traza).

**Atajo:** los recortes ya producidos están en `/home/archy/img-scratch/cutouts/` (AVIF+WebP).
Si sirven tal cual, ahorran ~5 min de inferencia frágil. Revísalos antes de confiar en ellos.

---

### [ ] T3 · Capas de fondo y fotos de la Versión B

**Acceptance criteria**
- [ ] L1 (fondo desenfocado): 320 px de ancho, q35, con blur **horneado** (sigma ~6) y también
      horneados `brightness .92 / contrast 1.05 / saturate .9`. ≤ 26 KB **los 5 paneles juntos**.
- [ ] Versión B: foto entera a **2048 px máx**, con `mask-image` para disolver los bordes.
- [ ] Escribir en el commit, tal cual: **la Versión B no puede ser HD real a pantalla completa
      sin duplicar el peso.** A 2048 sigue 1,58× escalada en un Retina.

**Verification**
- [ ] Peso total Versión A ≤ 266.140 B (hoy el sitio pesa 275.430 B: debe **bajar**).
- [ ] Panel 1 en Versión A ≤ 46.375 B. Techo duro de LCP: 185.080 B con margen.
- [ ] Comparar L1 a 320 px contra la de 1536 px bajo `blur(40px)`: la diferencia debe ser
      invisible (medido: `maxΔ 4/255`, SSIM 0.997).

**Dependencies:** ninguna. **Scope:** M.

---

### [ ] T4 · Paleta derivada de las 5 fotos

**Acceptance criteria**
- [ ] Paleta extraída de las **5 fotos elegidas**, no de las estatuas de IA borradas.
- [ ] Un solo archivo de tokens, cargado por los 38 HTML.
- [ ] Recoge los tonos reales de las fotos: verdes de trail 119°, turquesa de camiseta,
      asfalto. Hoy la UI vive en 10–19 % de saturación en tono 30–37° y las fotos llegan a 47 %.
- [ ] Contraste AA verificado **sobre las fotos reales** con `tasks/contrast.mjs`.

**Verification**
- [ ] `tasks/contrast.mjs` sin fallos sobre los 5 paneles, en ambas versiones (A y B).
- [ ] Ningún token derivado de `--marble-warm`: en EN vale `#00D4FF` (cian eléctrico) y daría
      halo de neón. Derivar de neutros vía `color-mix`.

**Dependencies:** T2, T3. **Scope:** M.

---

### [ ] T2c · Unificar los tres `:root`

**Descripción.** Hoy la paleta está triplicada en `style.css`, `obsidiana.css` y `blog.css`,
y `blog.css` ni siquiera importa `style.css`.

**Acceptance criteria**
- [ ] Una sola fuente de tokens. `obsidiana.css` **eliminado**.
- [ ] Resueltos los **5 tokens con mismo nombre y valor distinto** entre `style.css` y
      `blog.css`: `--accent`, `--gray`, `--gray-dark`, `--gray-light`, `--transition`.
- [ ] Borrados los 4 huérfanos: `--accent-dim`, `--accent-light`, `--marble-darkest`, `--marble-deep`.
- [ ] Los **82 colores hardcodeados** fuera de `:root` migrados a tokens, o justificados uno a uno.
- [ ] Todo `color-mix()` con declaración de respaldo **delante** (defecto 3).

**Verification**
- [ ] Los 38 HTML renderizan sin cambio de color no intencionado (comparación de capturas).
- [ ] `grep` de `#[0-9a-f]{3,6}` fuera del archivo de tokens: cada superviviente justificado.

**Dependencies:** T4 (necesita saber los valores finales). **Scope:** L — **divídela** si toca
más de 5 archivos por paso.

---

### CHECKPOINT A — antes de tocar el motor
- [ ] Los 5 recortes revisados en hoja de contacto, escalas normalizadas.
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
- [ ] Verificar el **fantasma entre L1 y L2** con las fotos reales: 86,4 px de desalineación a
      `|p|=0.5`. Se supone que el blur de L1 lo destruye, pero **eso es un juicio, no una medición**.
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

**Aviso:** las constantes están ajustadas contra un perfil de flick **sintético**. `DISCRETE=90`
y `PEAK_SLOW=18` pueden necesitar reajuste contra deltas reales del trackpad del dueño.

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
