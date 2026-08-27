# Plan: profundidad fotográfica en scroll horizontal

**Estado:** EJECUTADO Y CERRADO el 2026-08-27. Las 11 tareas hechas y verificadas.
**Informe final, con lo que no se pudo verificar:** [tasks/INFORME.md](./INFORME.md).
**Modo previsto:** otra sesión con `/goal` + `/agent-skills:build`, sin preguntar nada hasta terminar.
**Escrito:** 2026-08-26 (Panamá). **Base:** commit `8338168`.

---

## 0. Cómo leer este documento

Lo escribió una sesión que **verificó todo lo que afirma corriendo código**, no leyéndolo.
La sesión anterior a esta falló porque midió lo medible (Lighthouse, bytes, contraste) y
nunca usó el sitio, y porque verificó en Chrome headless — el único navegador donde los
tres bugs críticos se esconden. Cada número de aquí abajo salió de una ejecución real en
WebKit 26.5, Firefox 153 y Chromium 151.

**Reglas para quien ejecute:**

1. **No hay preguntas que hacer.** Toda decisión de diseño ya está tomada y justificada.
   Si algo parece ambiguo, la respuesta está en §2 (decisiones) o §9 (qué NO hacer).
2. **Ninguna tarea se da por hecha sin correr `tasks/verify/run.sh`.** "Existe la regla CSS"
   no es verificación. "El transform cambió de X a Y" sí lo es.
3. **Chrome headless solo no vale.** La suite corre en tres motores más un escenario forzado.
   Ver §3, y leer el aviso de §3.1 antes de confiar en WebKit.
4. Si una tarea se bloquea, **completa todas las demás** y deja el bloqueo escrito en
   `tasks/todo.md`. No reduzcas el alcance por tu cuenta.

---

## 1. Qué se está construyendo

El portafolio deja de ser texto sobre papel tapiz y pasa a comportarse como una cámara.
El scroll horizontal de 5 paneles sigue siendo el esqueleto; encima va profundidad: la
figura de Jeison, su fondo desenfocado, un campo de color y el texto se mueven a
**velocidades y escalas distintas**, lo que se lee como tridimensionalidad.

Se construyen **dos tratamientos fotográficos** que conviven, alternables con un botón en
vivo, porque la elección estética se decide viéndola en el Mac del dueño y no discutiéndola:

- **Versión A — recorte.** La figura, recortada con alfa, flota sobre el campo de color,
  en su propio plano. Detrás, la misma foto muy desenfocada.
- **Versión B — disolución.** La foto entera, con los bordes disueltos en el color por
  `mask-image`, sin recorte de sujeto.

Además: paleta única derivada de las fotos reales (hoy hay tres paletas duplicadas, y la
que se usa salió de unas estatuas de IA ya borradas), portal de entrada y vuelta del blog,
y los CV vigentes publicados.

**Intención confirmada por el dueño, literal:** «el scroll vertical típico es inaceptable»,
«que las fotos se unan con el fondo, no que sean el fondo per se», «que se sienta que la
imagen 3D se está moviendo», «que se vean en HD».

---

## 2. Decisiones ya tomadas

Ninguna de estas se rediscute durante la implementación.

### 2.1 — Arquitectura de movimiento

| Decisión | Por qué |
|---|---|
| **Cero scroll-driven animations.** Ni `animation-timeline`, ni `scroll()`, ni `@supports` sobre ellas. Un solo motor rAF para todos los navegadores. | Es la causa raíz del defecto 2. El `@supports` daba `true` en Chrome y **desactivaba el fallback JS**, así que no había parallax por ninguna de las dos vías. Un solo camino de código = imposible que un navegador tome una rama no probada. |
| Un único `rAF` que lee `container.scrollLeft` **una vez por frame** y escribe solo `--p` y `--a` por panel. | Medido: 0.005–0.014 ms/frame de JS; 0.13–0.55 ms con recálculo forzado, sobre 16.67 ms de presupuesto. Entre 0.8 % y 3.3 %. |
| Transforms **2D** (`translateX` + `scale`), no `translate3d`. | Un transform 3D promueve siempre y quita el control del presupuesto de capas. Con 2D la promoción la decide `will-change`, que se enciende y apaga. |
| `will-change` lo gobierna un `IntersectionObserver` con `rootMargin: '0px 60% 0px 60%'`. **Prohibido tocarlo dentro del rAF.** | Medido: promueve 3 paneles de 5 en los tres motores (con 100 % promovía los 5, o sea nada). Crear y destruir capas a mitad de scroll **es** el tirón que se quiere evitar. |
| Blur **horneado en el asset**, nunca en CSS. Nada de `filter: blur()` ni `backdrop-filter` sobre capas a pantalla completa. | `filter` obliga a una superficie fuera de pantalla y a una gaussiana de dos pasadas por capa y por frame, y rompe la ruta rápida de imagen compuesta. El `filter` que hoy vive en `.panel-bg img` es justo lo que la rompe. |
| Blur variable = **fundido cruzado entre dos capas horneadas**, nunca animar el radio. | Solo compositor. Es lo que hace `--o-fig` al pasar de 1 a 0.28. |

### 2.2 — Las cuatro capas

`p = (scrollLeft - panel.offsetLeft) / vw`, clampeado a `[-1.15, 1.15]`.
`a = smoothstep(min(|p|,1)) = t*t*(3-2t)`.
Las **traslaciones son lineales en `p`** (paralaje físicamente consistente); solo escala y
opacidad llevan easing.

| Capa | z | Caja | translateX | scale | opacity |
|---|---|---|---|---|---|
| **L1** fondo desenfocado (`<img>`) | 0 | `width:106%; left:-3%` | `0.22·p·vw` | `1.03 − 0.03·a` | `1` fija |
| **L2** figura | 1 | `width:104%; left:-2%` | `0.10·p·vw` | `1.06 − 0.06·a` | `1 − 0.72·a` |
| **L3** campo de color | 2 | `inset:0` | `0.05·p·vw` | — | `0.42·a` |
| **L4** contenido de texto | 3 | `left:-12%; width:98%; padding:0 8vw 0 20vw` | `−0.08·p·vw` | **ninguna, a propósito** | `clamp(0, 1 − 1.45·a, 1)` |

- Factores medidos por regresión sobre 17 puntos, **idénticos en los tres motores**:
  `k_far=0.2200, k_fig=0.1000, k_wash=0.0500, k_txt=−0.0800`. Los cuatro distintos entre sí.
- Separación entre capas contiguas a `|p|=0.5`, `vw=1440`: L1–L2 = 86.4 px, L2–L3 = 36.0 px,
  L3–L4 = 93.6 px. Ratios 2.2× y 2.0×: **progresión geométrica**, que es lo que se lee como
  profundidad en vez de «cosas moviéndose a distintas velocidades».
- **L2 no escala el texto a propósito**: escalar texto en el compositor lo resamplea y se
  ve blando en Safari.
- **L4 va por delante del panel** (`k` negativo, 108 % de la velocidad): es lo más cercano al ojo.
- La caída de opacidad de L2 es un **rack-focus**: al desvanecerse la figura nítida asoma
  L1 desenfocada, o sea que el panel se desenfoca al salir **sin animar ningún radio de blur**.
- **Tope absoluto obligatorio, no medido todavía:** los factores son proporcionales a `vw`
  (±316.8 px a 1440, pero ±563 px en un monitor de 2560). Implementar como
  `min(0.22·|p|·vw, 340px)·sign(p)` y verificar a 2560 px de ancho.
- El anclaje debe dar **transform 0 exacto en `p=0`**. Los keyframes actuales van de −2.6 %
  a +2.6 %, sin anclar: `1440 × 1.12 × 0.026 = 41.93 px`, que es exactamente el descentrado
  permanente que reportó el dueño (defecto 5).

### 2.3 — Fallbacks obligatorios

- **Toda `var()` lleva fallback**: `var(--p,0)`, `var(--a,0)`, `var(--vw,0px)`. Sin `@property`
  registrado, una custom property sin valor invalida la declaración **entera** de `transform`
  (IACVT) y el elemento cae a `transform:none` — se pierde todo el transform, no solo la
  función que falló.
- `@property` existe desde Safari 16.4, o sea que está en el Safari del dueño. Medido `true`
  en los tres motores. **No es un riesgo, pero los fallbacks van igual.**
- `color-mix()` **siempre** con una declaración de respaldo delante (defecto 3: sin soporte,
  la declaración entera se descarta y la card se queda transparente con el texto sobre la foto).

### 2.4 — Gestos: tres reglas

El error de la sesión anterior fue **secuestrar todos los eventos `wheel`**, lo que obligaba
a un cooldown de 650 ms que se comía los gestos (medido en producción: 3 flicks → 1 panel).

| Regla | Caso | Comportamiento |
|---|---|---|
| **1** | Gesto horizontal dominante (`|dx| > |dy|`): trackpad de dos dedos, Magic Mouse, Shift+rueda | **No se intercepta nada. Ni `preventDefault`.** Lo resuelve el scroll nativo + `scroll-snap-type: x mandatory`, en el hilo de scroll. 3 flicks = 3 paneles por construcción. **Este es el caso del Mac del dueño.** |
| **2** | Rueda discreta (`deltaMode != 0`, o `|dy| >= 90` y entero) | 1 notch = 1 panel. Sin acumulador y **sin cooldown**. Un notch ya es una intención completa. |
| **3** | Vertical continuo de trackpad | Acumulador + segmentación de gesto. La inercia **no se filtra con temporizador: se detecta** porque su magnitud decae de forma monótona. |

**Constantes de la regla 3:** `THRESHOLD 55px, IDLE_MS 120, DECAY_HITS 2, RISE 1.35,
PEAK_SLOW 18, LONG_MS 350, REARM 4x`.

- Se marca *momentum* cuando `|delta|` baja en 2 eventos consecutivos y el pico del gesto
  superó 12. Mientras haya momentum, ningún evento avanza panel.
- Gesto nuevo si: silencio > 120 ms, **o** cambia el signo, **o** (durante la inercia) la
  magnitud **crece dos eventos seguidos** por encima de 1.35×.
- **Por qué esto no reintroduce el bug contrario:** una cola de inercia decae de forma
  monótona, luego es *físicamente incapaz* de crecer dos veces seguidas y disfrazarse de
  gesto nuevo. Con un solo evento creciente sí fallaba — está medido, un pico aislado la rompía.
- Re-armado dentro de un mismo gesto (para que un arrastre sostenido avance varios paneles)
  solo si `pico < 18` **o** el gesto dura > 350 ms. Un flick tiene picos altos y fase activa
  < 200 ms, así que nunca entra ahí: eso impide que un flick se coma 2 paneles.
- **`target` es intención pura y el `IntersectionObserver` YA NO lo escribe.** Antes sí, y por
  eso 3 avances aterrizaban en el panel 2: un gesto rápido durante un scroll suave en vuelo
  se sumaba sobre un índice intermedio. Ahora el observer solo pinta los puntos.
- **Guarda de convergencia:** al detenerse el scroll, si el panel más cercano != `target` y el
  scroll era programático, se reemite (máx. 2 reintentos). Sin ella, Chromium y Firefox
  aterrizaban un panel corto al redirigir un scroll suave nativo con snap mandatory.

### 2.5 — `prefers-reduced-motion` y puntero grueso

- **reduced-motion:** `transform: none` en las 4 capas (fuera traslación **y** escala). Las
  rampas de opacidad **se recortan a ~1/4, no se apagan** (figura 1→0.82, campo 0→0.12, texto
  pendiente 0.9): fundido cruzado en vez de movimiento, que es el sustituto que recomienda
  Apple. `will-change` se recorta a `opacity`. `scrollTo` pasa a `behavior:'auto'`.
  **El rAF sigue corriendo** porque hace falta para calcular `--a`: se apaga el movimiento,
  no el motor.
- **Puntero grueso** (`!matchMedia('(hover:hover) and (pointer:fine)')`, o sea móvil/tablet):
  el motor se apaga **entero**. `--p` y `--a` a 0, sin rAF y sin promoción; todos los paneles
  en su pose de «ya llegué». Ahí el scroll con inercia táctil escribiendo transform cada frame
  es jank y batería, y la profundidad es un lujo de escritorio.
- Se escucha `change` en **ambos** media queries para aplicarlo en vivo sin recargar.

### 2.6 — Fotos: qué foto va en qué panel

Las 8 originales viven en `/home/archy/img-scratch/originals/` (y en git, en `af0b920`).
Son **verticales**, 2667×4000 px (dos son 3083×4624 y 2896×4344; una es 960×1440).

Veredicto de recorte por foto, inspeccionado a 100 % sobre cuatro campos de color:

| Foto | Recorte | Nota |
|---|---|---|
| `006-CircuitoCity8k-oneflashphoto-1164` | **Publicable** | La mejor del set: gorra nítida, dedos separados, hueco entre piernas correcto |
| `007-CanajaguaTrail-jorgejuradofoto-285` | **Publicable** | Primer plano pecho arriba, cara clara, tubo del chaleco de ~3 px sobrevive |
| `006-CanajaguaTrail-achtarfoto-103865` | **Publicable** | Caso de bajo contraste (niebla + bokeh) y aguantó |
| `9192443969772-CircuitoSummer21k-533` | **Publicable** | El segundo corredor era componente separado y se eliminó limpio |
| `004-CircuitoCity8k-momentumphotography93-764` | **Retoque ~1 min** | Queda una zapatilla blanca flotando tras la pantorrilla derecha |
| `005-CircuitoCity8k-momentumphotography93-763` | **NO publicable** | Zapatillas desmembradas y fragmento de short flotando. Necesita máscara manual de verdad |
| `005-CanajaguaTrail-lienzoph-0608` | Segunda persona completa fusionada | Decisión de diseño, no defecto |
| `9192462844140-CircuitoSummer21k-886` | Segunda persona completa fusionada | Ídem |

**Asignación (usa las 5 mejores; las otras 3 quedan fuera, igual que hoy):**

| Panel | Foto | Razón |
|---|---|---|
| Hero | `1164` | Cuerpo entero, la más dinámica y la de mejor recorte |
| **Sobre Mí** | `285` | **Primer plano con la cara clara. Una sección "sobre mí" pide una cara.** |
| Skills | `103865` | Cuerpo entero, trail, chaleco de hidratación |
| Blog | `764` | Cuerpo entero, ciudad. Requiere el retoque de 1 min |
| Contacto | `533` | Cuerpo entero, meta, cara clara |

> **Dirección de arte, obligatorio.** Las figuras vienen a escalas muy distintas: `285` es un
> primer plano de pecho arriba y las demás son cuerpo entero. Puestas en paneles contiguos eso
> se lee como descuido. **Normalizar por altura de cabeza y línea de base común**, no por altura
> de imagen. Verificar mirando los 5 paneles en una hoja de contacto antes de dar por buena la fase.

**Ambas versiones usan las mismas 5 fotos.** El botón compara el *tratamiento*, no las fotos.

### 2.7 — Presupuesto de imagen

Medido en Chromium real a DPR 2, con el panel a su tamaño verdadero (1613 CSS px = 3226 px
de dispositivo).

**El hallazgo que lo cambia todo:** bajo `blur(40px)`, una fuente de **240 px** difiere de una
de 1536 px en `maxΔ = 4/255`, `meanΔ = 0.54/255` (SSIM 0.99699). **Invisible.** Servir el fondo
a 320 px q35 en vez de 1536 px q50 baja esa capa de 371.744 B a **25.973 B en los 5 paneles: 93 % menos.**

| | Peso total 5 paneles | Escala de la figura |
|---|---|---|
| Hoy (1536 full-bleed) | 275.430 B | **2.10× escalada** (1536×864 pintado en 3226×1672) |
| **Versión A** (figura h1800 q50 + fondo 320) | **266.140 B  (−3,4 %)** | **1.00× — nítida de verdad** |
| Versión B a 1536 | 324.259 B (+17,7 %) | 2.10× |
| Versión B a 2048 | 497.426 B (+80,6 %) | 1.58× |

- **Techo de LCP:** hoy el LCP medido es 1584 ms (1638,4 Kbps, RTT 150 ms, CPU ×4). La
  pendiente medida sobre 10 payloads reales es **5,238 ms por cada 1000 B del panel 1**, luego
  el techo para 2,5 s es **232.806 B** y con 10 % de margen **185.080 B**. La Versión A necesita
  46.375 B: cinco veces por debajo.
- **Versión B se sirve a 2048 máx.** y hay que escribirlo tal cual: **la Versión B no puede ser
  HD real a pantalla completa sin duplicar el peso.** A 2048 sigue 1,58× escalada en un Retina.
  Solo la Versión A cumple el requisito de HD que pidió el dueño. Esto no es motivo para no
  construir B — el dueño quiere compararlas — pero sí para que A sea la predeterminada.
- **Relleno alfa: push-pull, no pre-componer contra el color del panel.** Pre-componer ahorra
  19 % pero deja halo medible (`maxΔ 30/255` en el borde); push-pull lo baja a `maxΔ 5/255` y
  aun así cuesta 9 % menos que dejar el RGB crudo.
- Pesos medidos de la figura a 1800 px de alto con alfa: **AVIF 26–42 KB, WebP 58–103 KB.**
  *(T2: eso era la descripción de lo que salió del pipeline, no un criterio. El criterio es el
  techo. Tras normalizar escalas, las 5 figuras AVIF suman **170.512 B** y el hero pesa
  **40.154 B** contra su techo de LCP de 41.180 B.)*
  AVIF conserva el alfa con 0 flips en las 8; WebP (q80, alphaQuality 90) es prácticamente
  sin pérdida.

### 2.8 — Versión predeterminada: **A**

Se fija A y no se rediscute. Tres razones, todas medidas:

1. **Es la única que cumple lo que pidió** — HD real, figura a 1.00× en vez de 2.10×.
2. **Pesa menos que el sitio de hoy** (−3,4 %), mientras que B a 2048 pesa +80,6 %.
3. Los recortes se inspeccionaron a 100 % sobre cuatro campos de color y las 5 elegidas
   quedan publicables. No hay halo, no hay borde duro, no hay «Photoshop de 2009».

El botón alterna a B y **la elección persiste en `localStorage`** para que el dueño pueda vivir
con una durante días antes de decidir. El valor por defecto, sin nada guardado, es A.

### 2.9 — Paleta

Hoy hay **tres `:root` con la paleta duplicada** (`style.css`, `obsidiana.css`, `blog.css`) y
`blog.css` ni siquiera importa `style.css`. Medido: 29 tokens, 18 definidos en las tres, **5 con
el mismo nombre y valor distinto** entre `style.css` y `blog.css` (`--accent`, `--gray`,
`--gray-dark`, `--gray-light`, `--transition`), 4 huérfanos ya hoy (`--accent-dim`,
`--accent-light`, `--marble-darkest`, `--marble-deep`) y **82 colores hardcodeados fuera de
`:root`**.

- **Una sola fuente de tokens**, en un archivo nuevo, cargado por los 38 HTML.
- **`obsidiana.css` se elimina.** ES y EN comparten paleta. (Decidido por el dueño, literal:
  «Ambos sitios, y la paleta obsidiana se muere».)
- La paleta se **deriva de las 5 fotos elegidas**, no de las estatuas de IA borradas de donde
  salió la actual. Es la raíz de «las fotos no combinan»: hoy la UI vive en 10–19 % de
  saturación en tono 30–37°, y las fotos llegan a 47 % con turquesa fuerte y verdes de 119°.
- Los 82 colores hardcodeados se migran a tokens o se justifican uno por uno.
- **Trampa a evitar:** las 19 páginas EN cargan `obsidiana.css`, donde `--marble-warm` es
  `#00D4FF`, cian eléctrico. Derivar cualquier efecto de `--marble-warm` daba halo de neón en
  inglés — exactamente el «AI slop» que el dueño rechazó. Derivar de tonos neutros vía `color-mix`.

### 2.10 — Portal del blog

Intención literal del dueño: «el blog se puede mantener igual, solo que la transición al blog
sea como entrar a un portal y que siempre haya como un botón con difuminaciones alrededor que
simulen un portal para regresar a la página principal, este solo cuando se buscó el blog,
adentro de un blog se prioriza el poder leer bien».

- **Técnica: View Transitions cross-document.** Soporte hoy: Chrome/Edge 126+, **Safari 18.2+**,
  Firefox **no** (bug 1860854, sin milestone). Verificado empíricamente en Gecko 153: el at-rule
  `@view-transition` se descarta al parsear, `cssRules` queda vacío, y la navegación sigue
  perfecta — corte instantáneo, cero roturas.
- **Por qué VT y no animar en JS:** el botón atrás está medido. Tras `goBack` la página queda
  con `opacity:1`, url y title correctos. La alternativa JS tiene el bug clásico de restaurar
  desde bfcache con `opacity:0` = página en blanco, y mete flash blanco entre documentos. Con
  VT los enlaces siguen siendo `<a href>` reales y **no hace falta JS para navegar**.
- **Hallazgo que reduce el despliegue de 36 archivos a 9** (medido con tabla de verdad
  `pageswap`/`pagereveal`): los **dos** documentos tienen que declarar `@view-transition`, y la
  **apariencia la define el documento de destino**. Luego los **34 posts necesitan CERO ediciones**:
  `portal.css` lo cargan solo los 4 índices. Total: 2 CSS limpiados, 1 CSS nuevo, 1 JS, 4 HTML
  con un `<link>`, 2 de esos con el botón. **Seis archivos HTML, no 36.**
  *(Corrección de conteo: son 34 posts (17×2), no 36. 38 HTML en total.)*
- **Especificación final del efecto** (ganadora tras 4 iteraciones, cada una mirada en capturas):
  - *Saliente*: 460 ms `cubic-bezier(0.3,0.72,0.4,1)`; `scale 1 → 1.12`; blur `0 → 16px` con
    12px ya al 70 % (**el desenfoque va delante**: si el texto viejo sigue nítido se lee como
    glitch de render); `opacity` aguanta en 1 hasta el 70 % para que nunca asome el lienzo del
    navegador.
  - *Entrante*: 620 ms `cubic-bezier(0.55,0.06,0.28,1)`; `clip-path` circle `0 → 135vmax` desde
    el punto del click; máscara con ribete constante de 10 px; `scale 1.07 → 1`; `opacity 0→1`
    en 90 ms. Visualmente completo a ~280 ms, asentado a ~500 ms.
  - **El radio va en LONGITUD, no en porcentaje.** `circle()` resuelve los % contra
    `sqrt((w²+h²)/2)` y los stops de un `radial-gradient` contra el rayo a la esquina más
    lejana: con % el recorte y la máscara **se desincronizan**. 135vmax cubre la diagonal desde
    cualquier origen (peor caso medido ~118vmax en 16:10).
  - **`clip-path` es la base y `mask-image` solo una mejora aditiva.** El sitio ya usa
    `clip-path` sobre estos pseudos hoy (`blog.css:725`), o sea que está probado en el Safari
    del dueño. Si WebKit ignorara `mask-image` sobre el pseudo, el portal sigue en pie.
  - Rechazadas y por qué: *easeOut* `cubic-bezier(0.16,1,0.3,1)` gasta el 85 % del recorrido en
    el primer 25 % del tiempo y degrada a crossfade; *pluma ancha* deja las dos páginas al 50 %
    a 163 ms = doble exposición; *oscurecer la saliente* (brightness 0.42) lleva el panel dorado
    al mismo valor que el fondo del blog y **borra el borde**.
- **reduced-motion: corte seco, no fundido corto** (el fundido produce el mismo fantasmeo de
  texto). Medido: `@view-transition{navigation:none}` **sí** parsea dentro de `@media`, y en
  `pagereveal` se cuentan cero animaciones.
- **Botón-portal**: `<a href>` real, texto real («Volver al inicio» / «Back to home»), icono
  FontAwesome inline con `aria-hidden`, cero emojis. Contraste medido: texto 8.61:1 ES /
  12.32:1 EN. **El borde a 0.28 daba 1.87:1 y fallaba WCAG 1.4.11; subido a 0.55 da 3.58:1.**
  Área táctil 187,45 × 51,5 px.
- **Bug encontrado y resuelto:** al ir índice→post el documento saliente ofrece una transición
  que el destino rechaza, y la promesa interna se rechaza con `AbortError: Transition was
  skipped` como `unhandledrejection`. **No se puede atrapar con `.catch()`** sobre
  `ready`/`finished`/`updateCallbackDone` (probado). Se silencia con un listener de
  `unhandledrejection` filtrado a ese caso.
- **Veredicto visual honesto del agente que lo miró:** «se ve a portal, no a cursi. Lo más
  fuerte es blog→portada (oscuro→claro), donde se abre una ventana circular limpia con la
  fotografía del hero dentro, justo donde estaba el botón. La fotografía propia del sitio hace
  todo el trabajo: no hace falta decorar nada.» Cero color ajeno a la paleta, cero partículas,
  cero anillo de luz, cero rotación.

### 2.11 — CV

- **Se publican en PDF, no en `.docx`.** Un `.docx` se le abre al reclutador en Word Online o
  Google Docs y se le desmaqueta.
- ES → `JEISON_SANG_WU_MITRE_ES_2026.pdf` (ya existe).
- EN → `JEISON_SANG_WU_MITRE_EN_AI_BUILDER.pdf` — **hay que generarlo**:
  `soffice --headless --convert-to pdf --outdir <dir> <docx>` (es el comando que documenta
  `~/archy/cv/README.md`). LibreOffice está en `/usr/bin/libreoffice`.
- Fuente: `/home/archy/archy/cv/`. Copias sin commitear ya están en `src/`.
- Se deja el `.docx` como enlace secundario.
- **Advertencia ya trasladada al dueño, no la repitas:** `ES_2026` es de ago/2026 y lleva el
  puesto partido en dos bloques por el cambio de control (BSC jul/2026→, Cibest jun/2025–jun/2026);
  `EN_AI_BUILDER` es de may/2026 y **no** lleva ese cambio. Publicar ambos hace que el sitio ES
  y el EN cuenten historias laborales distintas. Es su decisión y ya la tomó: publicar.

---

## 3. El arnés de verificación

**Esto va primero. Todo lo demás depende de ello.** Los scripts ya están en `tasks/verify/`,
verificados y deterministas (3 corridas idénticas byte a byte).

### 3.1 — AVISO CRÍTICO: WebKit de Playwright ≠ Safari del dueño

El WebKit que trae Playwright 1.62.1 se identifica como **Safari 26.5** y responde
`CSS.supports('animation-timeline','scroll(inline nearest)') = true`. **Es más nuevo que el
Safari del dueño y es justo el motor donde el bug original se esconde.** Correr `probe.mjs`
solo en WebKit por defecto **no caza** el bug del Mac: lo oculta igual que Chrome.

**La red de seguridad real son dos cosas:**
1. **Firefox 153**, que reproduce el `TypeError` nativamente.
2. El **bloque de escenario forzado** (`scroll-timeline=false` + `finePointer=true`) que
   `probe.mjs` lleva incorporado y que revienta en los tres motores.

**Si alguien recorta ese bloque para "simplificar", vuelve el agujero exacto que dejó muerto
el sitio.** No lo toques.

### 3.2 — Reconstruir el arnés (el scratchpad es efímero)

**Ya está automatizado. Una sola orden:**

```bash
tasks/verify/run.sh setup      # playwright 1.62.1 + navegadores + sysroot + enlace
tasks/verify/run.sh            # selftest + render + probe
tasks/verify/run.sh selfcheck  # ¿sabe dar rojo? rompe cosas a proposito
tasks/verify/run.sh stability  # 3 corridas, mismos veredictos
```

`setup` hace lo que antes era un ritual manual: instala `playwright@1.62.1` en `~/pw-harness`,
baja los navegadores, descarga los 19 `.deb` de Ubuntu 24.04 noble, los extrae en
`~/pw-harness/sysroot`, enlaza `libx264.so` y **termina corriendo el control positivo**. Si
falta un solo paquete, **muere ahí y lo dice**: un sysroot a medias es peor que ninguno, porque
`resolve_sysroot` solo comprueba que el directorio exista y WebKit moriría después con
`error while loading shared libraries: libevent-2.1.so.7` (comprobado envenenando el sysroot
real). Decir «arnés reconstruido» sin haberlo ejecutado es justo el error que este plan
persigue. El arnés **no vive en el repo**: pesa ~500 MB y
es específico de esta máquina. Lo versionado son los scripts y `baseline.json`.

**Trampas ya resueltas, no las redescubras:**

- El wrapper `MiniBrowser` de WebKit hace `export LD_LIBRARY_PATH=...`, o sea que **pisa** la
  variable y nunca ve el sysroot. Por eso existe `tasks/verify/wk_run.sh`, que se pasa vía
  `launch({executablePath})`.
- `libx264.so` se reporta como faltante aunque exista: Playwright valida con
  `/sbin/ldconfig -p`, que lee `/etc/ld.so.cache` e **ignora `LD_LIBRARY_PATH`**. Falso
  positivo, solo afecta a reproducir h.264. De ahí el `SKIP_VALIDATE`.
- Los nombres de paquete son de **Ubuntu 24.04 noble**. En otra versión hay que remapearlos, y
  sin sudo no hay `playwright install-deps` de rescate.
- **`import 'playwright'` en ESM no mira `NODE_PATH`.** Node solo sube por directorios padre
  buscando `node_modules`, y desde `tasks/verify` no hay ninguno hasta `/`. Por eso `run.sh`
  crea el enlace `tasks/verify/node_modules -> ~/pw-harness/node_modules`, ignorado por git.
- **`npm install` y `apt-get download` necesitan red de verdad.** Lanzados como comando de
  fondo salen del sandbox sin red y fallan los 19 paquetes **sin decir por qué**: se ve
  `descargados: 0 / 19` y nada más. Correrlos en primer plano.
- Los navegadores sobreviven en `~/.cache/ms-playwright` aunque muera el scratchpad, pero el
  registro `.links` apunta al directorio muerto. `npx playwright install` lo re-registra sin
  volver a descargar nada.

**Lo que faltaba y ahora está versionado:** `tasks/verify/control/` (el fixture del control
positivo) nunca se había commiteado — vivía en el scratchpad y murió con él. Sin ese
directorio `selftest-transform.mjs` no arranca. Ahora está en el repo, comentado.

### 3.3 — Qué mide la suite

`tasks/verify/run.sh` corre tres cosas, y cada una trae su propio control:

**`selftest`** — control **positivo** de la métrica del transform, sobre `control/index.html`.
Seis variantes aisladas (a…e + control JS). Demuestra que «leer `transform` antes y después
de scrollear» sí detecta un cambio real: el control JS va de `-80` a `-40` exactos en los
tres motores. Si esto no da verde, el `false` de `probe.mjs` no significa nada.

**`render`** — los tres motores arrancan **y pintan**. Se descarga el screenshot, se
decodifica el PNG y se miden colores distintos y desviación de luminancia. Trae **control
negativo**: la misma medición contra una página deliberadamente en blanco tiene que **fallar**.
Medido: sitio 9.100 colores / stdev 49; página en blanco 1 color / stdev 0.

> Los píxeles solos no bastan: **con las 5 fotos rotas la página sigue dando 9.358 colores y
> stdev 49** (texto, degradados, ruido SVG) y «pintado» salía `true`. Por eso el veredicto
> exige además que **la foto del hero decodifique** (`naturalWidth > 0`). Las otras 4 son
> diferidas por `IntersectionObserver` y a `scrollLeft` 0 no tienen por qué estar cargadas:
> se cuentan (hoy 2–3 de 5) pero no se exigen. Ese conteo es la línea base del defecto 6.

**`probe`** — reconocimiento del sitio en los 3 motores, escenario normal y forzado:
`pageErrors`, `consoleErrors`, la firma del `TypeError` en los tres dialectos, el `transform`
de la capa **en tres posiciones de panel**, `--p`/`--a`, y los gestos de rueda **por dos vías**
(ver §3.4). Escribe `probe-results.json`.

> **No existe «a mitad de scroll».** El probe medía antes un `scrollTo(clientWidth * 0.5)`.
> Con `scroll-snap-type: x mandatory` (`style.css:162`) y `scroll-snap-align: center` (`:198`),
> 720 px queda **exactamente equidistante** de los centros del panel 0 (720) y del panel 1
> (2160): un empate que cada motor rompe a su manera, con la medición a 1 px de cambiar de
> significado. Bajo snap obligatorio no hay posiciones intermedias observables, solo paneles.
> Ahora se mide en `scrollLeft` 0 / 1440 / 2880 — tres puntos de snap reales.

> **El probe sabe fallar.** Antes, apuntado a un directorio que no fuera el sitio, leía
> `undefined` en todo, escribía `transform: {}` y **salía con 0**. Ahora comprueba que el
> documento tenga `#container`, paneles y `#hero .panel-bg img`, y si no, sale con 1 diciendo
> qué faltó. Un instrumento ciego producía el mismo `changed: false` que una medición real —
> justo el valor que T5 tiene que hacer voltear.

**`selfcheck`** — los controles **negativos** del arnés, ejecutables. Rompe tres cosas a
propósito y exige rojo: el probe contra un directorio que no es el sitio, el render contra el
sitio con las fotos borradas, y el selftest contra el fixture con la regla `#a` mutada. Los
tres fueron falsos verdes **reales** durante T1. Estaban comprobados a mano una sola vez —
justo lo que este plan no acepta como verificación — y ahora viven en la suite.

**`stability`** — corre la suite 3 veces y compara **veredictos**, no observaciones. La
distinción es deliberada: un veredicto («¿hubo errores?», «¿cambia el transform?», «¿qué panel
se alcanzó?») tiene que ser idéntico corrida a corrida o la suite no sirve como puerta. Una
observación (gaps en ms, `scrollLeft`, colores de un PNG) **nunca** va a ser idéntica al byte
en una máquina compartida, y exigirlo sería mentir.

**`baseline`** — congela `probe-results.json` en `baseline.json`, versionado. Es contra lo que
T5 y T7 tienen que demostrar que cambiaron algo.

### 3.3 bis — El arnés estuvo midiendo `/en/` creyendo medir `/`

`src/lang.js:51` redirige `/` a `/en/` cuando `navigator.language` empieza por `en` y no hay
preferencia guardada. **El locale por defecto de Playwright es `en-US`**, así que todas las
mediciones del arnés — incluidas las del plan original — se tomaron sobre la portada en
inglés. Nadie lo notó porque nada registraba qué documento se había cargado.

Ya no: el probe y el render aceptan `--locale` y `--path`, van por defecto a `es-ES` + `/`
(la portada canónica) y **escriben en el JSON qué pidieron y qué les sirvieron**.

Comprobado que no invalida nada: `/` (es) y `/en/` (en) dan medidas **idénticas** —
`matrix(1, 0, 0, 1, -41.9327, 0)`, `changed: false`, panel 1, cero errores de consola. Las
19 páginas EN cargan además `obsidiana.css` (§ T8), así que **para T4, T2c y T10 hay que
medir las dos**, no solo la que salga por defecto.

### 3.4 — Lo que este arnés NO puede ver

Escríbelo en el informe final. No lo vendas como equivalente a un Mac.

- WebKit headless en Linux es WPE/GTK, no Safari sobre macOS. El motor JS y el CSS coinciden;
  **lo específico de plataforma no se prueba**: inercia real del trackpad, visual viewport con
  pinch-zoom, rebote del scroll, rasterizado de fuentes.
- **Frame-rate real: no medible aquí.** El rAF de WebKit headless va a 2.5–11 fps; Chromium y
  Firefox dan 60 Hz pero sobre llvmpipe. La afirmación «se siente fluido» **es no verificable
  desde esta máquina**. Hay que medirla en el Mac con el panel Timelines de Safari.
- **Coste de blur/backdrop-filter en Safari: no medido.** La decisión de hornear el blur se
  apoya en cómo funcionan las superficies fuera de pantalla, no en un número tomado en Safari.
- **El gesto de rueda no se puede sintetizar con timing fiel por el camino real.** Medido:
  `page.mouse.wheel` cuesta ~200–460 ms de ida y vuelta en WebKit headless, 92–214 ms en
  Firefox y 134–176 ms en Chromium. Un gesto de «3 notches a 120 ms» sale estirado, y en
  WebKit el panel alcanzado bailaba entre 1 y 2 según la carga de la máquina. Por eso el
  arnés mide por **dos vías** y las distingue:
  - **confiable** — `page.mouse.wheel`, evento *trusted*, camino de entrada real. Lo único
    que afirma de forma estable es que la rueda real llega a la página y mueve el scroll.
  - **sintética** — `WheelEvent` despachado dentro de la página. Da 120–125 ms en los tres
    motores, así que **esta es la que mide el gesto** y la que vale para T7. Ejercita la
    máquina de estados del sitio, **no** el scroll nativo.
  Cada medición lleva `timingFiel` con los gaps reales. Si es `false`, el panel alcanzado
  describe lo que pasó pero **no** es «3 flicks a 120 ms», y así queda escrito en el JSON.
- **El camino nativo horizontal (regla 1) solo está verificado a medias.** Se demuestra que el
  JS no interviene, pero los eventos `wheel` sintetizados no mueven el scroll nativo, así que
  el comportamiento real de `scroll-snap x mandatory` con un trackpad de verdad **no se ejercitó**.
  Es justo el camino del caso principal del dueño.
- **Desacople de un frame en Safari:** en macOS el scroll de un overflow scroller corre en el
  hilo de scroll y los eventos llegan al principal con hasta un frame de retraso. Con estos
  factores el error en un flick de 3000 px/s es ~11 px en el fondo (invisible bajo el blur) y
  ~4 px en el texto. Es la razón principal por la que el efecto puede sentirse «despegado» en
  Safari.

---

## 4. Grafo de dependencias

```
FASE 0  arreglo del TypeError ......................... HECHO (8338168)
   │
FASE 1  arnés de verificación reconstruido
   │      └── sin esto, nada de lo de abajo se puede dar por bueno
   │
FASE 2  ── pipeline de imagen ──┐
   │      (matting, fondos,     │
   │       fotos entera)        │
   │                            ├──► FASE 3  UN PANEL COMPLETO (hero, A y B)
FASE 2b paleta derivada ────────┘         │   4 capas + motor + botón A/B + suite verde
   │      (necesita las fotos)            │
   │                                      ▼
FASE 2c tokens unificados ──────────► FASE 4  los otros 4 paneles (mecánico)
        (3 :root → 1)                     │
                                          ▼
                                     FASE 5  gestos (necesita 5 paneles reales)
                                          │
                                          ▼
                                     FASE 6  portal del blog (independiente, va al final)
                                          │
                                          ▼
                                     FASE 7  CV + a11y + cierre
```

**Se puede paralelizar:** FASE 2 (imagen) y FASE 2c (tokens) no se pisan.
**Estrictamente secuencial:** FASE 3 → 4 → 5. El panel hero es el molde; hasta que no esté
verificado, replicarlo 4 veces solo multiplica el error.

---

## 5. Tareas

Detalle completo por tarea en `tasks/todo.md`. Resumen del alcance y el orden:

### FASE 1 — Arnés
- **T1** Reconstruir Playwright + sysroot + wrappers. Correr `selftest`, `render` y `probe`
  sobre el sitio actual y guardar la línea base. *(S — 0 archivos del sitio)* **HECHO.**

### FASE 2 — Assets y paleta *(paralelizable con 2c)*
- **T2** Recuperar las 8 originales y producir los recortes con alfa de las 5 elegidas.
  Retoque manual de 1 min en `764`. *(M)* **HECHO.** Cabezas normalizadas de 2,14× a 1,01× de
  dispersión; recompuesto desde los originales porque reescalar el h1800 costaba −16 %/−29 %
  de nitidez.
- **T3** Producir las capas de fondo desenfocado (320 px q35) y las fotos enteras de la
  Versión B (2048 máx). *(M)* **HECHO.** L1 pesa 8.327 B los 5 (un tercio de lo previsto) y va
  alineada con la transformación de su figura: sin eso el fantasma L1/L2 se ve, medido.
- **T4** Derivar la paleta única de las 5 fotos y escribir el archivo de tokens. *(M)*
  **HECHO.** Neutros en 245° y acento turquesa en 195°, ambos medidos en las fotos. Scrim
  necesario: 0,56 (A) / 0,58 (B).
- **T2c** Unificar los tres `:root` en uno; eliminar `obsidiana.css`; migrar los 82 colores
  hardcodeados. *(L — dividir si hace falta)*

### FASE 3 — El molde: un panel completo
- **T5** Panel hero con las 4 capas, motor rAF, ambas versiones y botón A/B. **Este es el
  slice vertical**: toca imagen, CSS, JS y verificación. *(L)*

### FASE 4 — Replicar
- **T6** Los otros 4 paneles sobre el molde de T5. *(M)*

### FASE 5 — Gestos
- **T7** Las tres reglas de §2.4 con sus constantes. *(M)*

### FASE 6 — Portal
- **T8** `portal.css` + rollout de 9 archivos + `verify-rollout.py`. *(M)*

### FASE 7 — Cierre
- **T9** CV: generar el PDF EN, cablear ambos, commitear. *(S)*
- **T10** Contraste y a11y, incluidos los **6 fallos del blog ES que Lighthouse no ve**
  (hasta 2.87:1, porque el ruido SVG de fondo deja 60 nodos «no evaluables» para axe). *(M)*
- **T11** Verificación final completa + informe honesto de lo no verificable. *(S)*

---

## 6. Checkpoints

| Después de | Criterio para seguir |
|---|---|
| **T1** | `selftest` da control positivo verde en los 3 motores (`-80` → `-40`). `render` verde con su control negativo. `stability` verde: 3 corridas, veredictos idénticos. Línea base en `baseline.json`. |
| **T4** | Los 5 recortes revisados en hoja de contacto, escalas normalizadas. Paleta con contraste AA verificado sobre las 5 fotos. |
| **T5** | **El transform cambia** con el scroll, medido en los 3 motores. Los 4 factores distintos entre sí. Botón A/B alterna de verdad. Cero errores de consola en escenario normal **y** forzado. |
| **T7** | Los 8 escenarios de gesto dan idéntico en los 3 motores, medidos **por la vía sintética** (§3.4: la confiable no gobierna su propio timing). Especialmente: 3 flicks @120 ms → **panel 3** (hoy da panel 1, con `timingFiel=true` en los 3 motores). |
| **T8** | `verify-rollout.py` da exit 0. Los posts siguen **sin** transición (vt=false). |
| **T11** | Suite verde entera. LCP ≤ 2,5 s. a11y 100. Cero regresiones de SEO/hreflang. |

---

## 7. Definición de «hecho» (se aplica a toda tarea)

1. `tasks/verify/run.sh` verde en los **tres** motores, escenario normal **y** forzado.
2. Cero `pageErrors` y cero `consoleErrors` nuevos.
3. Contraste AA verificado **con `tasks/contrast.mjs` sobre las fotos reales**, no supuesto.
4. Presupuesto de bytes respetado (§2.7) y medido, no estimado.
5. `prefers-reduced-motion` y puntero grueso probados explícitamente.
6. Funciona **sin JavaScript**: el sitio sigue navegable y las 5 fotos cargan (defecto 6: hoy
   sin JS solo carga 1 de 5).
7. El commit dice **qué se midió y con qué número**, no «debería funcionar».

---

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **El WebKit de prueba no es el Safari del dueño** (26.5 vs ≤18) | **Alto** | El diseño no usa ninguna scroll-driven animation, luego el camino de código es idéntico en ambos. Todas las features CSS usadas son anteriores a Safari 18. **Pero es inferencia, no medición**: hay que abrirlo en el Mac. |
| **La versión de Safari decide si hay portal.** 18.0 y 18.1 **no** tienen cross-document VT | Medio | Degradación limpia y verificada (corte instantáneo). **Pendiente de confirmar con el dueño**: Safari > Acerca de Safari. |
| El matting muere por memoria | Medio | `enable_cpu_mem_arena=False` + `enable_mem_pattern=False` es **obligatorio** (sin él, 6.9 GB RSS y SIGTERM). Una foto por subproceso, verificar que el archivo existe, reintentar. El pico queda cerca del umbral en una máquina de 7.8 GB. |
| El filtro de componente mayor **empeora** 2 de las 8 fotos | Medio | No es un default ciego: es una decisión por foto. En `763` y `764` deja zapatillas desmembradas donde había un corredor entero. Ya está resuelto eligiendo otras 5. |
| Fantasma entre L1 y L2 (86,4 px de desalineación a `\|p\|=0.5`) | ~~Medio~~ **medido en T3** | **El blur NO lo destruye**: montada la Versión A y mirada, se veía la misma persona borrosa junto a la nítida en los 5 paneles. La causa era T2 — normalizar las cabezas movió las figuras y el fondo dejó de caer donde cae la suya. Resuelto dando a L1 la misma transformación que su figura (`figs-geometry.json`). En T5 solo queda comprobar que el paralaje los separa sin reabrirlo. |
| Factores sin tope en monitores anchos | Bajo | `min(k·vw, 340px)`, §2.2. Verificar a 2560 px. |
| El sysroot vive en `/tmp` y se pierde | Bajo | Se reconstruye en < 1 min con §3.2. Los navegadores (984 MB) sí sobreviven en `~/.cache`. |
| Quitar `@view-transition` de `blog.css` es una **regresión deliberada** | Bajo | El toggle ES/EN dentro de un post pierde su barrido actual. Es coherente con «dentro del post se prioriza leer», pero es un cambio de comportamiento. |
| Tres asimetrías ES/EN revientan cualquier script ingenuo | Medio | `blog.css` se enlaza `./blog.css` en ES y `/blog/blog.css` en EN; las 19 páginas EN cargan además `obsidiana.css`; el enlace al blog es `./blog/` en ES y `/en/blog/` en EN. **Anclar al último `<link rel=stylesheet>` y a una regex de href, nunca a una cadena literal.** |

---

## 9. Qué NO hacer

- **No** uses `animation-timeline`, `scroll()`, `view()` ni `@supports` sobre ellas.
- **No** toques `will-change` dentro del rAF.
- **No** animes un radio de blur ni uses `backdrop-filter` a pantalla completa.
- **No** escales el texto en el compositor.
- **No** recortes el bloque de escenario forzado de `probe.mjs`.
- **No** conviertas los posts del blog a horizontal, ni les pongas transición. Dentro de un
  post se prioriza leer.
- **No** uses emojis. Iconos: FontAwesome inline u otro set open source.
- **No** pongas línea de crédito fotográfico — las fotos están pagadas.
- **No** reescribas el historial de git.
- **No** repliques la difuminación del botón-portal en otros botones: lo que lo salva de
  leerse como «botón con glow genérico» es que es **el único** elemento de la página con ella.
- **No** declares nada verificado que no hayas corrido. Si no lo mediste, escribe
  «NO VERIFICADO» y sigue.

---

## 10. Pendiente del dueño (no bloquea la implementación)

1. **Versión exacta de su Safari** (Safari > Acerca de Safari). Decide si ve el portal
   (necesita 18.2+) y confirma el supuesto de `scroll-timeline`.
2. **Endpoint real de Formspree.** Hasta entonces el guard de `script.js` intercepta el submit
   y abre un correo redactado. *(El guard estaba muerto en Firefox por el `TypeError`; con
   `8338168` vuelve a funcionar.)*
3. Si quiere regenerar `EN_AI_BUILDER` antes de publicarlo, por la inconsistencia de fechas
   con `ES_2026` (§2.11).
