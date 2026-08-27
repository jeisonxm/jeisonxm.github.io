# Arreglo de scroll en trackpad + rediseño fotográfico profesional

## Contexto

`jeisonxm.github.io` es el escaparate profesional de Jeison — bilingüe ES (`/`, paleta *marble* cálida) y EN (`/en/`, paleta *obsidiana* fría con acento cian). Cinco paneles de scroll **horizontal**: Hero, Sobre Mí, Skills, Blog, Contacto. Sitio estático en GitHub Pages, sin build step.

Dos problemas independientes:

**1. El trackpad del Mac no navega el sitio.** El gesto de dos dedos no pasa de panel. No es un detalle: es el dispositivo desde el que un reclutador va a abrir la página.

**2. El fondo son cinco PNGs de estatuas griegas generadas por IA.** Jeison las considera "AI slop". En su lugar entran ocho fotos reales de fotógrafos profesionales de carrera — pagadas por él — de tres eventos: Circuito City 8K, Canajagua Trail y Circuito Summer 21K. El fondo pasa de textura inventada a evidencia real: mientras se avanza por el scroll, se le ve corriendo.

Resultado buscado: navegación sin fricción en cualquier dispositivo, y un fondo que lo muestre de verdad, con calidad profesional y sin bugs.

**Restricciones fijas (decididas por Jeison):**
- El layout **sigue siendo horizontal**. No se convierte a vertical.
- **Cero emojis.** Todo icono es FontAwesome u otro set open-source.
- **Sin línea de crédito fotográfico** — las fotos están pagadas.
- **No puede parecer AI slop.**
- **No se toca el historial de git.** El commit `af0b920` se queda donde está.
- **Fase 1 se despliega sola**, antes de tocar las fotos.

---

## Diagnóstico: por qué falla el trackpad

En `src/script.js:17-27`:

```js
function handleWheel(e) {
  e.preventDefault();
  const direction = e.deltaY > 0 ? 1 : -1;
  container.scrollLeft += scrollStep * direction;   // scrollStep = window.innerWidth
}
```

Tres fallos que se componen:

1. **Cada evento salta un viewport completo.** Un swipe de trackpad emite decenas de eventos `wheel` a 60–120 Hz con una cola de inercia de hasta ~1.5 s. Como `.scroll-container` tiene `scroll-behavior: smooth` (`style.css:124`), asignar `scrollLeft` **no salta** — redirige una animación en curso. Veinte eventos en 300 ms redirigen el destino veinte viewports más allá. Se clampea al final o se pelea consigo misma reiniciando la curva cada ~16 ms.

2. **`e.deltaY > 0 ? 1 : -1` trata `deltaY === 0` como `-1`.** En un swipe horizontal puro el canal vertical es ~0 con ruido de signo, así que la dirección se vuelve *ruido*, no intención.

3. **`deltaX` no se lee nunca**, y `preventDefault()` mata el scroll horizontal nativo — que en este contenedor (`overflow-x:auto` + `scroll-snap-type: x mandatory`) ya resolvería correctamente sin una línea de JS.

**Por qué se ve peor en Mac:** Chromium remapea automáticamente el wheel vertical a scroll horizontal en elementos con `overflow-x` sin `overflow-y`. **Safari no lo hace.** En Safari el JS roto es el único camino, sin red de seguridad.

---

## FASE 1 — Arreglar la navegación *(se despliega sola)*

### 1.1 — Reescribir la capa de input en `src/script.js`

Sustituir el archivo completo. Decisiones:

- **El índice de panel es la fuente de verdad, no los píxeles.** Fuera `scrollStep = window.innerWidth` y `scrollLeft +=`. Entra `currentIndex` y `goToIndex(i)`, que lee `panels[i].offsetLeft` en el momento de la llamada. `window.innerWidth` es el viewport de *layout*: el pinch-zoom de macOS es zoom *visual* que no reflowea, así que `innerWidth` queda obsoleto respecto a lo que visualmente es una pantalla. `offsetLeft` no se calcula, se lee.

- **Quitar `scroll-behavior: smooth` del CSS; `behavior` explícito en cada llamada.** Mientras esté en CSS, *cualquier* escritura de `scrollLeft` hereda animación y se compone — que es exactamente lo que rompió el trackpad. Navegación anima; realineado por resize es siempre instantáneo. Se mantiene `scroll-snap-type: x mandatory` como red de seguridad del drag táctil.

- **Wheel: acumulación de delta unificada, sin sniffing de dispositivo.** Clasificar "¿trackpad o ratón?" no es fiable (un Magic Mouse se comporta como trackpad). En su lugar: tomar el eje de mayor magnitud (`deltaX` vs `deltaY` — cubre ambos swipes y no duplica Shift+wheel, porque las plataformas ya remapean antes de que llegue a JS), normalizar `deltaMode`, acumular, disparar al cruzar umbral, y bloquear con cooldown para tragarse la cola de inercia.

  Parámetros de arranque, **a calibrar en el Mac de Jeison**: `THRESHOLD = 42`, `COOLDOWN_MS = 650`, `GESTURE_GAP_MS = 200`, `LINE_HEIGHT_PX = 16`.

- **`e.ctrlKey` se deja pasar sin tocar** — macOS sintetiza el pinch-to-zoom del trackpad como `wheel` con `ctrlKey: true` en los tres navegadores. Sin este guard, el zoom se convierte en navegación.

- **Teclado accesible:** flechas, PageUp/Down, Home, End, y Space solo con el contenedor enfocado. **Nunca robar teclas** con el foco en `INPUT`/`TEXTAREA`/`SELECT`/`contentEditable` o dentro de `.contact-form` — hoy las flechas se roban mientras se escribe en el formulario del panel 5.

- **`prefers-reduced-motion`:** `behavior: 'auto'` en lugar de `'smooth'`, uniforme para wheel, teclado y clicks de nav.

**Dos puntos que ningún especialista cubrió y hay que resolver a mano:**

- **Scrollers anidados.** `.about-content` (`style.css:399`) y `.contact-panel .panel-content` (`style.css:1031`) tienen `overflow-y: auto`. El handler debe comprobar si el puntero cae en uno de ellos con recorrido disponible en la dirección del gesto y, si es así, devolver **sin** `preventDefault()`. Si no, la rueda sobre el texto de "Sobre Mí" salta de panel en vez de scrollear el texto.

- **Conflicto entre los dos informes.** El de frontend propone que el JS se apropie de todo gesto (un gesto = un panel, consistente en todo input). El de rendimiento propone dejar pasar el horizontal nativo (`if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;`), que es más suave pero da dos comportamientos distintos según el eje del gesto. **Ir con el enfoque unificado** — un solo modelo mental, y es el que arregla Safari, donde no hay remapeo nativo. Probar la variante nativa en hardware real si el unificado se siente rígido; es una decisión de calibración, no de arquitectura.

### 1.2 — Colapsar los listeners de scroll

Hoy hay **tres** listeners `scroll` sin throttle, y el de parallax hace `panel.offsetLeft` (lectura que invalida layout) **inmediatamente después** del `style.transform` de la iteración anterior. Eso es un reflow síncrono forzado por elemento por evento: 5 paneles × hasta 120 Hz en una pantalla ProMotion ≈ **600 reflows/segundo**.

- `updateActiveNav` desaparece → `IntersectionObserver` (`root: container`, `threshold: 0.6`), que lee geometría real en vez de `i * window.innerWidth` (se rompe si un panel no mide exactamente 100vw) y mantiene `currentIndex` sincronizado cuando el drag táctil cambia de panel sin pasar por `goToIndex`.
- Parallax y fade del `scrollHint` se fusionan en un handler único coalescido con `requestAnimationFrame` y un flag `ticking`.
- Cachear `offsets` en un `measure()` que agrupa **todas** las lecturas sin escrituras intercaladas; `offsetLeft` no cambia durante el scroll, solo en resize.
- Early-out `if (x === lastX) return` y `if (idx !== activeIdx)` — hoy se llama `classList.toggle` sobre los 4 enlaces de nav en cada evento.

### 1.3 — Bug de resize en móvil

`src/script.js:130-136` reescribe `scrollLeft` en **cada** resize. En móvil, el colapso de la barra de URL dispara `resize` con el ancho sin cambiar — y el handler tironea al usuario a mitad de gesto. Gatear: si `window.innerWidth` no cambió, devolver.

### 1.4 — Accesibilidad del scroller

- `tabindex="-1"` en cada `<section class="panel">` — un `<section>` no es enfocable por programa, así que `panels[idx].focus()` es un no-op silencioso sin esto.
- `aria-label` en `#container`.
- Los clicks de nav pasan por `goToIndex()` y mueven el foco al destino.
- `overflow-y: hidden` **no** es trampa de foco (solo recorta overflow visual), pero verificar que ningún outline quede recortado en el borde de un panel.

### Aceptación — Fase 1

- [ ] Trackpad Mac, swipe horizontal → avanza **exactamente un panel**, en la dirección del gesto. Safari **y** Chrome.
- [ ] Trackpad Mac, swipe vertical → avanza un panel. Verificado en Safari (donde no hay remapeo nativo).
- [ ] La cola de inercia tras un swipe fuerte **no** pagina de más.
- [ ] Ratón clásico: un notch = un panel, sin lag.
- [ ] Pinch-to-zoom hace zoom, **no** navega.
- [ ] Con "natural scrolling" del sistema activado y desactivado, la dirección es correcta en ambos.
- [ ] Escribir en el formulario: las flechas mueven el cursor, no el panel.
- [ ] Rueda sobre el texto con overflow de "Sobre Mí": scrollea el texto.
- [ ] Teclado solo (Tab/flechas/Home/End) opera los cinco paneles.
- [ ] Táctil: swipe nativo intacto, un panel por gesto.
- [ ] `prefers-reduced-motion`: saltos instantáneos.
- [ ] Un solo listener `scroll`, coalescido con rAF. Cero reflows forzados en el bucle.

### CHECKPOINT 1
Probar en el MacBook de Jeison, Safari + Chrome. **Mergear y desplegar esta fase sola.**

---

## FASE 2 — Peso de carga *(independiente de las fotos, gana sola)*

Estas tres cosas no dependen del rediseño y son la mayor ganancia individual de todo el plan.

### 2.1 — Sacar el kit de FontAwesome del `<head>`

`index.html:13` es un `<script>` **totalmente bloqueante**, sin `defer` ni `async`, colocado **encima** del `<link>` de `style.css` — bloquea el descubrimiento de tu propio CSS. Y no hay `preconnect` a `kit.fontawesome.com` (solo a los orígenes de Google), así que se paga DNS + TCP + TLS en frío en la ruta crítica. Son **270–380 KB gzip** en 3–5 peticiones a dos orígenes de terceros, **para 9 iconos** en 38 archivos HTML.

**Los iconos siguen siendo FontAwesome y se ven idénticos** — lo que cambia es cómo se entregan: se pegan los 9 paths SVG de FontAwesome Free (CC BY 4.0, open source) directamente en el HTML. ~4 KB en crudo, ~600 bytes gzip, cero peticiones, cero terceros. Esto cumple tu regla de iconos, no la rompe.

**Efecto: −310 a −380 KB y −500 a −700 ms de bloqueo.**

### 2.2 — El favicon pesa 207 KB

`src/icons/LGOO-SIMPLE.ico` son 207.038 bytes, y se pide en **cada una de las 38 páginas**, compitiendo por ancho de banda justo en la ventana que importa. Un `.ico` multi-resolución correcto pesa 5–8 KB. Generar SVG + ico + apple-touch-icon. **−200 KB por página.**

### 2.3 — Self-hostear las dos tipografías

El problema no son los bytes, es la **cadena serial**: `fonts.googleapis.com/css2` (hoja bloqueante) tiene que resolver **antes** de que el navegador sepa las URLs de `fonts.gstatic.com`. Dos orígenes, dos DNS, dos TLS, en secuencia, en la ruta crítica — **~400–700 ms**. Los `preconnect` mitigan el handshake pero no pueden colapsar la dependencia.

Servidas desde GitHub Pages multiplexan sobre una conexión que ya está abierta: Inter 34 KB + Space Grotesk 26 KB = **60 KB, un origen, sin cadena**. Luego borrar los tres `<link>` de Google Fonts **y** los dos `preconnect`, que quedan apuntando a orígenes que ya no se usan (un `preconnect` muerto cuesta un handshake especulativo y mantiene un socket 10 s).

*Nota: el peso 800 se pide y no se usa en ningún sitio — pero quitarlo ahorra ~0 bytes, porque `css2` devuelve un único woff2 variable que cubre todo el eje sin importar qué pesos listes.*

### Aceptación — Fase 2

- [ ] Cero `<script>` de terceros bloqueantes en `<head>`, en los 38 HTML.
- [ ] Los 9 iconos se ven idénticos a antes.
- [ ] Favicon ≤ 8 KB.
- [ ] Cero orígenes de terceros en la ruta crítica; `preconnect` muertos borrados.
- [ ] Rutas **absolutas** `/src/...` para las fuentes en ES y EN — la ES usa relativas hoy, y `./src/fonts/` desde `/en/` resuelve a `/en/src/fonts/` y da 404.

### CHECKPOINT 2
Lighthouse antes/después. Esta fase también puede mergearse sola.

---

## FASE 3 — Traer y recortar las fotos

### 3.1 — `git pull` e inventario

`origin/main` está en `af0b920 "fotos"` (26/08/2026), un commit por delante del local, con ocho JPEG en la raíz del repo (~20.6 MB). **Dimensiones leídas de los marcadores SOF:**

| Archivo | Dimensiones | MP | Peso |
|---|---|---|---|
| `005-CircuitoCity8k-…-763.jpg` | 3083×4624 | 14.3 | 6.9 MB |
| `004-CircuitoCity8k-…-764.jpg` | 2896×4344 | 12.6 | 6.2 MB |
| `006-CircuitoCity8k-oneflashphoto-1164.jpg` | 2667×4000 | 10.7 | 1.7 MB |
| `007-CanajaguaTrail-jorgejuradofoto-285.jpg` | 2667×4000 | 10.7 | 1.0 MB |
| `9192462844140-CircuitoSummer21k-…-886.jpg.jpg` | 2667×4000 | 10.7 | 1.0 MB |
| `006-CanajaguaTrail-achtarfoto-103865.jpg` | 2667×4000 | 10.7 | 0.9 MB |
| `9192443969772-CircuitoSummer21k-…-533.jpg.jpg` | 2667×4000 | 10.7 | 0.9 MB |
| `005-CanajaguaTrail-lienzoph-0608.jpg` | **960×1440** | **1.4** | 1.1 MB |

### 3.2 — El hallazgo que condiciona todo el diseño

**Las ocho fotos son verticales 2:3. Los paneles en desktop son 1.89:1 apaisados.** Recortar 2:3 a 1.89:1 conserva **~35% del alto del cuadro**, y `object-fit: cover` centra geométricamente — en una foto de carrera eso es la cintura del corredor. **Sin dirección de arte se corta la cara en todos los paneles de desktop.**

En móvil pasa lo contrario: un panel de 390×716 es 0.54:1, casi idéntico al 0.667:1 del original. **Móvil es el caso fácil; desktop es el difícil** — lo inverso del patrón `<picture>` habitual.

`005-CanajaguaTrail-lienzoph` (960×1440) queda **descartada como fondo de desktop**: el recorte 16:9 más ancho que da es 960×540, y llevarlo a 1536 es un estirón de 1.6× en un elemento a escala hero. Se reserva para uso in-content en pequeño.

**Por tanto: cinco de las siete restantes van a los cinco paneles, con dos recortes cada una** — apaisado 16:9 para `≥700px`, vertical 9:16 para `<700px`.

### 3.3 — Recortes dirigidos a mano

`sharp.strategy.attention` (saliencia de libvips) es un buen primer pase, pero **hay que revisar los quince recortes apaisados por ojo** y fijar un `top:` manual en los que corten la cabeza. Ese pase manual **es** el trabajo de dirección de arte, y es lo que separa "premium" de "stock estirado".

Regla de encuadre: cabeza del sujeto en el **tercio superior**; de ahí el `object-position: 50% 35%` en CSS (sesgo hacia arriba: caras, no cinturas).

### 3.4 — Pipeline

**No hay herramientas de imagen en esta máquina** — sin ImageMagick, `cwebp`, `avifenc`, `vips`, `ffmpeg` ni Pillow. Hay `node v24`, `npm` y `python3`. Instalar `sharp@0.35` **fuera del repo** (`~/img-scratch`): trae libvips precompilado con libaom, libwebp y mozjpeg enlazados estáticamente, sin dependencias de sistema, y reemplaza las cinco herramientas ausentes incluido el recorte por saliencia. Se corre **una vez en local** y se commitean las salidas — el sitio no tiene build step.

*(`file` ya está en `/usr/bin/file` y reporta dimensiones JPEG correctamente para comprobaciones rápidas.)*

**Formato: AVIF + WebP, sin capa JPEG. Tope en 1536w, no 2048w.** Estas fotos van detrás de un scrim oscuro, bajo texto, a contraste reducido — un asset de 1536 escalado a un panel de 1920 es imperceptible en ese tratamiento. El tope lleva la imagen LCP de 165 KB a 110 KB.

Presupuestos **duros** por foto (5 variantes × 2 formatos = 10 archivos):

| Variante | Dimensiones | Se sirve en | AVIF | WebP |
|---|---|---|---|---|
| `-l1536` | 1536×864 | ≥700px, DPR 1.5–2× | ≤ 110 KB | ≤ 160 KB |
| `-l1024` | 1024×576 | ≥700px, DPR 1× | ≤ 55 KB | ≤ 80 KB |
| `-l640` | 640×360 | ≥700px gama baja | ≤ 25 KB | ≤ 36 KB |
| `-p828` | 828×1472 | <700px, DPR 2–3× | ≤ 85 KB | ≤ 120 KB |
| `-p640` | 640×1138 | <700px, DPR 1–1.5× | ≤ 52 KB | ≤ 74 KB |

Arrancar en AVIF `quality: 45` / WebP `quality: 68` y subir solo si alguna foto muestra bandas en el cielo. Si un `-l1536.avif` pasa de 110 KB, se baja la calidad de esa foto — no se envía el exceso.

**Total: ~4.0 MB commiteados** (contra 19 MB de PNGs de IA). Primera pintura desktop: **110 KB**. Móvil: **85 KB**.

El script también imprime el **color dominante 1×1** de cada foto — se usa en la Fase 4.

**Los originales no entran al repo.** Se extraen a `~/img-scratch/originals` y se archivan aparte; son los másteres para volver a recortar si hace falta.

### Aceptación — Fase 3

- [ ] Las ocho fotos vistas; cinco elegidas y asignadas a panel.
- [ ] Los quince recortes apaisados revisados por ojo: **ninguna cara cortada**.
- [ ] Los diez recortes verticales revisados en viewport de móvil real.
- [ ] Cada variante dentro de su presupuesto de bytes.
- [ ] Los originales de 20.6 MB **no** están en `src/`.

### CHECKPOINT 3
**Mostrar los recortes a Jeison antes de escribir una línea de CSS.** Si una foto no funciona en el panel que le tocó, se cambia aquí.

---

## FASE 4 — Rediseño visual

### 4.1 — Borrar las estatuas IA

Eliminar (**19 MB**): `Gemini_Generated_Image_ee5s7aee5s7aee5s.png` (8.0 MB, ya huérfano), `second_background.png` (7.7 MB, ya huérfano), `escribiendo.png`, `pesas.png`, `corriendo.png`.

Quitar los cinco `<img class="statue">` de ambos index (líneas 51, 52, 94, 142, 213), todo el CSS `.statue*` (`style.css:180-230`, `1133-1134`; `obsidiana.css:52-70`) y `animateStatue()` de `script.js` (cinco `setInterval` permanentes haciendo polling con `getComputedStyle`, que fuerza recálculo de estilo, para siempre, incluso en pestaña de fondo).

Árbol de trabajo: **21 MB → ~6 MB**.

*Nota: la paleta ES se derivó de las estatuas (`style.css:4`). El piedra cálido sigue funcionando bajo fotos de carrera en Panamá — sol, asfalto, tierra. La paleta se queda.*

### 4.2 — Capa de foto + scrim

`.panel-bg` es un **selector nuevo**, no una extensión de `.statue`. Crítico: `.statue` lleva `mix-blend-mode: multiply` y `-webkit-mask-image`, y **ambos sacan al elemento de la ruta rápida del compositor** — una capa con blend hay que componerla contra su fondo en cada frame, que anula todo el trabajo de rendimiento. Si hace falta desvanecer los bordes, se hace con un `::after` sobre `.panel`, no con una máscara sobre la imagen.

**`<img>` dentro de `<picture>`, nunca `background-image` en CSS.** Un `background-image` se descubre solo después de construir el CSSOM, no acepta `fetchpriority`, se pide en prioridad baja y no se puede dirigir con `media`. Un `<img>` lo encuentra el preload scanner durante la tokenización inicial del HTML — 200–500 ms antes en carga fría.

```css
.panel-bg img {
  width: 112%; margin-left: -6%;   /* holgura de parallax — ver 4.3 */
  height: 100%;
  object-fit: cover;
  object-position: 50% 35%;        /* sesgo arriba: caras, no cinturas */
  filter: brightness(0.92) contrast(1.05) saturate(0.9);
  mix-blend-mode: normal;
  opacity: 0; transition: opacity .45s ease;
}
.panel-bg img.is-loaded { opacity: 1; }
```

**La foto no se degrada; la legibilidad la resuelve el scrim.** Las estatuas eran textura que debía desaparecer (opacidad 0.05–0.20, blend). Estas son fotos reales de una persona real y son la carga emocional de la página. La regla histórica de visibilidad (brightness ≥ 0.85, saturate ≥ 0.5, opacity ≥ 0.25) es un **piso**, no un techo: aquí la foto va a opacidad 1.

`.panel-scrim` es un gradiente por panel y por paleta, orientado para proteger donde el texto realmente cae. ES usa stops `rgba(44,40,36,…)`; EN usa `rgba(10,10,9,…)` unos 8–10 puntos más oscuros en cada stop, porque las sombras casi negras más el texto cian necesitan más separación. **Valores exactos por panel en el spec de UX adjunto.**

Reglas de legibilidad:
- Cuerpo de texto directamente sobre foto → scrim ≥ **0.80** en ese punto.
- Texto grande (`.hero-title`, `.panel-title`, `.stat-num`) → ≥ **0.55**.
- Texto dentro de card → sin requisito extra; el tinte de la card domina.

Las cards (`.info-card`, `.skill-block`, `.blog-entry`, `.social-list a`, inputs) pasan de `var(--surface)` sólido a `rgba(surface, 0.90)` + `backdrop-filter: blur(8px)` — cristal sobre la foto, no caja que la tapa.

### 4.3 — Revelado progresivo

- **Parallax dentro del panel:** factor **0.06**, aplicado a `.panel-bg img`. En reposo el offset es 0 — el estado de lectura final es siempre nitidez completa.

- **La imagen debe estar sobredimensionada o el parallax deja un borde duro.** Con `width: 100%` y factor 0.06 la imagen se traslada 86 px a 1440 — y como mide exactamente lo que el panel, **aparecen 86 px de panel vacío en un borde**, una línea vertical dura deslizándose sobre la fotografía. De ahí `width: 112%; margin-left: -6%`. **El mismo número vive en tres sitios** — `sizes="112vw"` en el `<picture>` e `imagesizes="112vw"` en el preload. Si se cambia el factor, se cambian los tres.

- **Escribir una custom property tipada, no un string de transform.** El código actual construye `'translateX(calc(-50% + Npx))'`, un string que el motor CSS re-tokeniza y re-parsea cada frame. En su lugar: `@property --px { syntax: '<length>' }` + `translate3d(var(--px), 0, 0)`.

- **Ruta preferente: `animation-timeline: scroll(inline nearest)` tras `@supports`.** Corre el parallax **enteramente en el compositor**, fuera del hilo principal. Esa es la respuesta real a "60 fps en Android de gama media". La ruta JS con rAF queda de fallback.

- **`will-change`: dos capas, no cinco.** Cinco fotos de 1536×864 como texturas RGBA son ~27 MB de memoria GPU permanente; en un Adreno/Mali de gama media Chrome empieza a desalojar capas, y el desalojo a mitad de scroll es justo el tirón que se quiere evitar. Alternarlo con un `IntersectionObserver` de margen 60% deja ~11 MB. *(En la ruta CSS de scroll-timeline, quitar `will-change` del todo — `animation-timeline` gestiona la promoción sola.)*

- **`prefers-reduced-motion`:** el parallax se escribe imperativamente desde JS, así que la regla global de CSS que anula transiciones (`style.css:1138`) **no lo va a atrapar**. Hay que comprobar `matchMedia` en JS explícitamente. Es un fallo fácil de cometer. El parallax sobre imagen a sangre es un disparador vestibular común.

- **Móvil:** desactivar el parallax JS en táctil (`matchMedia('(hover: hover) and (pointer: fine)')`).

### 4.4 — Carga de los paneles 2–5 sin pop-in

**`loading="lazy"` va a hacer pop-in visible aquí.** El mecanismo funciona (Chrome calcula la intersección contra el ancestro scrolleable), pero el **umbral está afinado para scroll vertical**: ~1250 px en conexión rápida, aplicado por eje. Los paneles miden 100vw, así que en un portátil de 1440 px el panel 3 está a **2880 px** — fuera del umbral. Y la transición de snap dura 300–500 ms mientras un AVIF de 110 KB tarda 600 ms–2 s: se ve la foto materializarse **después** de que el panel ya se detuvo.

Tres partes, las tres necesarias:

1. **`IntersectionObserver` explícito** con `root: container, rootMargin: '0px 150% 0px 150%'` — los porcentajes resuelven contra la caja del root, así que 150% es 1.5 anchos de contenedor de anticipación por lado.
2. **Gatear el reveal en `img.decode()`** antes de añadir la clase de fade. Esto es lo que realmente mata el pop-in: `decode()` resuelve solo cuando el bitmap está rasterizado y listo para pintar. Con `.catch()` obligatorio — rechaza si la fuente cambia a mitad de vuelo, cosa que pasa al cruzar el breakpoint de 700px en un resize.
3. **Color de fondo por panel, 0 bytes.** El script del pipeline imprime el color dominante de cada foto; se fija como `--panel-bg` inline. Así el fade corre color→foto y no crema→foto (un flash). *Nada de LQIP en base64: costaría 400–800 bytes inline × 5 paneles en el HTML crítico más 5 decodes extra en el hilo principal, para resolver lo que un hex resuelve gratis.*

El panel 1 está **exento**: va con `srcset` real y `.is-loaded` puesto desde el HTML, nunca observado, nunca desvanecido.

### 4.5 — LCP y CLS

- **Preload del hero** en `<head>`, justo después del `<link>` de CSS, con `imagesrcset` + `imagesizes="112vw"` + `fetchpriority="high"`. Tres detalles que deciden si funciona: `type="image/avif"` es **obligatorio** (sin él, un navegador sin AVIF descarga el preload igual y luego cae a WebP — se paga dos veces); `imagesrcset`/`imagesizes` deben coincidir **exactamente** con el `<source>` o hay descarga duplicada; los `media` deben partir limpio en el mismo breakpoint de 700px.
- En el `<img>`: `fetchpriority="high" decoding="async" loading="eager"`. **No `decoding="sync"`** (bloquea el hilo principal 15–40 ms en Android de gama media, y el frame pinta cuando termina el decode de todas formas). **Nunca `loading="lazy"` en el hero.**
- **Las fotos no tienen riesgo de CLS por construcción** — `position:absolute; inset:0` las saca del flujo.
- **`100vh` en móvil sí es un bug real de CLS.** Cuando la barra de URL colapsa, el valor usado cambia a mitad de scroll, cada panel se redimensiona, cada `object-fit: cover` re-recorta y la foto salta. Hoy es invisible porque las estatuas son `contain` a opacidad 0.04–0.2; con foto a sangre se vuelve obvio. **Usar `svh`, nunca `dvh`** — `svh` es el viewport pequeño y es estable; `dvh` sigue la barra de URL continuamente, es decir **relayout continuo de un contenedor de snap de 5 paneles**. Sería la peor elección posible.
- **No usar `content-visibility: auto`** en los paneles: corrompe el cálculo de los snap points.
- **Fuentes:** `.panel-title` es `clamp(3.4rem, 6vw, 5.6rem)` con `display=swap` — un swap a ese tamaño mueve muchos píxeles. `font-display: optional` en la display face lo elimina por completo.

### 4.6 — Arreglos en el mismo pase

1. **Formulario de contacto → Formspree.** `action="mailto:"` no envía nada para quien no tenga cliente de correo de escritorio: casi todo móvil y todo usuario de webmail. Es un bug funcional. **Jeison tiene que crear la cuenta y pasar el endpoint.** Se añade además un enlace visible "o escríbeme a jeisonwumitre@gmail.com" como respaldo.
2. **Skills: `<ul><li>` → grid de pills** reutilizando el estilo `.hero-label` que ya existe.
3. **Blog → spotlight de una entrada.** Card destacada grande con la más reciente + "Ver todos". Intencional en vez de vacío, y sin depender de contenido nuevo.
4. Envolver la fila de stats del hero en el mismo tratamiento de cristal.
5. Sustituir los glifos `→` sueltos por el icono FontAwesome inline de flecha. El chevron SVG de `.scroll-hint` ya es un icono a medida — se queda.
6. `src/images/pngwing.com.webp` pesa 188 KB; por el mismo pase de sharp baja a ~15 KB.

### 4.7 — Orientación en el scroll

**Puntos de progreso persistentes** (5, clicables): desktop en el borde derecho, móvil abajo centrado. En móvil es la *única* pista de orientación una vez que el hint se desvanece, porque la nav del header está oculta ahí. Es la adición de mayor valor.

### Aceptación — Fase 4

- [ ] Cero referencias a estatuas en HTML/CSS/JS; los cinco PNG borrados.
- [ ] Las cinco fotos cargan en ambos idiomas, sin pop-in al scrollear.
- [ ] Jeison es **reconocible** en cada panel — no una textura tenue.
- [ ] Contraste verificado **con cuentagotas sobre las fotos reales**, no calculado sobre el scrim en abstracto: ≥4.5:1 cuerpo, ≥3:1 texto grande, en las dos paletas. Un cielo quemado detrás de la columna de texto del hero puede fallar aun con un scrim que sobre el papel cumple.
- [ ] Parallax a 60fps; en reposo la foto queda centrada y nítida; sin borde duro en ningún extremo.
- [ ] `prefers-reduced-motion`: sin parallax ni crossfade.
- [ ] Móvil 375px: texto legible, recortes revisados en dispositivo real, sin parallax.
- [ ] **Cero emojis** en todo el sitio.
- [ ] El formulario de contacto **envía de verdad**.

### CHECKPOINT 4
Revisión visual con Jeison en ES y EN, desktop y móvil.

---

## FASE 5 — Verificación

- [ ] Lighthouse móvil: Performance ≥ 90, Accessibility ≥ 95, en ES y EN. Confirmar que el elemento LCP se atribuye a `.panel-bg img` y no a `.hero-title`.
- [ ] LCP < 2.5 s en 4G simulado; CLS < 0.1.
- [ ] Matriz: Safari/Chrome/Firefox en macOS; Chrome/Firefox en Linux; Safari iOS; Chrome Android.
- [ ] Blog (`/blog/`, `/en/blog/`) sin regresiones — usa su propio `blog.css` y no toca `style.css` ni `script.js`, pero confirmarlo.
- [ ] `sitemap.xml` y el toggle de idioma siguen funcionando.
- [ ] Hook `pre-commit` que rechace archivos staged de más de 500 KB fuera de `src/JEISON*.pdf`. Habría evitado toda esta situación.

**Estado proyectado:** primera pintura de ~330–550 KB (solo FontAwesome) + 207 KB de favicon + 76 KB de fuentes sobre 4 orígenes → **~185 KB sobre 1 origen**. Árbol de trabajo 21 MB → ~6 MB.

---

## Archivos que se tocan

| Archivo | Fase | Qué |
|---|---|---|
| `src/script.js` | 1, 4 | Reescritura de la capa de input; parallax; lazy con IntersectionObserver |
| `src/styles/style.css` | 1, 2, 4 | Quitar `scroll-behavior`; `@font-face`; borrar `.statue*`; `.panel-bg`/scrim; `svh`; cards de cristal; dots |
| `src/styles/obsidiana.css` | 4 | Scrims de la paleta EN; borrar overrides de `.statue` |
| `index.html` / `en/index.html` | 1, 2, 4 | `tabindex`+`aria-label`; iconos inline; preloads; `<picture>`; dots. **La ES usa rutas relativas `./src/…` y la EN absolutas `/src/…` — todo lo nuevo va absoluto en ambas** |
| Los otros 36 HTML | 2 | Quitar el kit de FontAwesome, iconos inline, favicon, fuentes |
| `src/images/panels/` | 3 | Nuevo — 50 archivos optimizados |
| `src/fonts/` | 2 | Nuevo — 2 woff2 variables |
| `src/images/*.png` | 4 | Borrar cinco archivos IA |

Fuera de alcance: el contenido del blog. Sus páginas son verticales normales con su propio CSS.

---

## Riesgos

- **El mapeo foto→panel del spec de UX es una hipótesis sin verificar** — se diseñó sin ver las imágenes, asumiendo que eran apaisadas. Son verticales. El narrativo (llegada → esfuerzo privado → ejecución controlada → reflexión → meta) sigue siendo válido como marco, pero la asignación concreta se decide en el Checkpoint 3, con las fotos delante.
- **Los umbrales del wheel (`42`/`650 ms`) son un punto de partida.** Safari tiene colas de inercia más largas y de menor magnitud que Chrome para el mismo swipe físico. Calibrar en el Mac de Jeison, en ambos navegadores.
- **El contraste sobre foto real puede fallar donde el cálculo dice que pasa.**
- **Formspree bloquea el cierre del formulario** hasta que Jeison cree la cuenta. Todo lo demás avanza sin eso.
- **Los números de rendimiento son proyecciones** derivadas de bytes y dimensiones medidas, no de una traza de navegador. Se miden de verdad en la Fase 5.

---

## Verificación de extremo a extremo

```bash
python3 -m http.server 8000
```

1. `http://localhost:8000/` y `/en/` — los cinco paneles en ambos idiomas.
2. Trackpad Mac: swipe horizontal y vertical, Safari y Chrome. Pinch-zoom.
3. Ratón, teclado (flechas/Home/End/PageUp/Down), y foco dentro del formulario.
4. Rueda sobre el texto con overflow de "Sobre Mí".
5. DevTools a 375px, y en un teléfono real por IP de red local (la barra de URL colapsando es parte de la prueba).
6. Lighthouse en ES y EN.
7. `prefers-reduced-motion` forzado desde DevTools.
8. `grep -rP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]"` sobre HTML/CSS/JS → cero resultados.

---

> Specs completos de los especialistas, con los valores CSS y los scripts:
> `…-agent-a01dd010ce91a5cfb.md` (UX) · `…-agent-afbb3936ea5e45e38.md` (rendimiento)
