# Informe final — rediseño de profundidad fotográfica

**Cerrado:** 2026-08-27 (Panamá). **Base:** `43f2a36`. **Rama:** `t1-arnes-verificacion`.

Este informe dice qué se midió, con qué número, y —sobre todo— **qué no se puede saber desde
esta máquina**. Lo segundo importa tanto como lo primero: la sesión que falló antes de esta lo
hizo por medir lo medible y dar por bueno lo demás.

---

## 1. Las 15 puertas de aceptación, todas verdes

```
run.sh (selftest+render+probe)           exit 0
run.sh selfcheck (controles negativos)   exit 0
depth-check (4 capas, 3 motores)         exit 0
gestures-check (8 escenarios)            exit 0
panels-check (5 paneles, sin JS)         exit 0
portal-check (vt por ruta)               exit 0
tokens-check (38 páginas x 3 motores)    exit 0
a11y-check (contraste + estructura)      exit 0
lcp-check (<= 2.5 s)                     exit 0
contrast.mjs (foto real, A y B)          exit 0
checkfigs (T2) / checkbg (T3)            exit 0
checkbake (color horneado)               exit 0
maketokens (paleta AA)                   exit 0
verify-rollout.py (portal)               exit 0
```

## 2. Los números que cambiaron

| | antes | ahora |
|---|---|---|
| **El transform cambia con el scroll** | `false` en webkit y chromium | **`true` en los 3** |
| transform en `p=0` | `matrix(…,−41.9327,0)` | **0 exacto** |
| 3 gestos @120 ms | panel 1 | **panel 3** |
| Arrastre continuo 1,2 s | panel 2 | **panel 3** |
| Dispersión de altura de cabeza | 2,14× | **1,01×** |
| Línea de base (4 figuras con pies) | spread 135 px | **spread 0 px** |
| Fotos que cargan sin JS | 1 de 5 | **5 de 5** |
| Peso de la Versión A | 275.430 B | **178.839 B (−35,1 %)** |
| Panel 1 contra el techo de LCP | — | **42.099 B / 46.375 B** |
| **LCP medido** (1638 Kbps, RTT 150, CPU ×4) | 1584 ms | **1680 ms ES / 1708 EN / 968 blog** |
| Paletas duplicadas | 3 `:root` | **1 archivo de tokens** |
| Colores hardcodeados fuera de `:root` | 88 | **7**, todos `rgba(0,0,0,α)` de sombra |
| Archivos tocados para el portal | — | **9, con 0 posts editados** |

Los cuatro factores de paralaje, por regresión e **idénticos en los tres motores**:
`k_far 0.2200 · k_fig 0.1000 · k_wash 0.0500 · k_txt −0.0800`.
Separación entre capas a `|p|=0.5`, vw 1440: **86,4 / 36,0 / 93,6 px**.

## 3. Lo que este arnés NO puede ver

Esto no es una lista de excusas: es la frontera de lo verificable desde aquí.

- **El frame-rate real no es medible.** El rAF de WebKit headless va a 2,5–11 fps; Chromium y
  Firefox dan 60 Hz pero sobre llvmpipe. **«Se siente fluido» es no verificable desde esta
  máquina.** Hay que medirlo en el Mac con el panel Timelines de Safari.
- **El WebKit de prueba se identifica como Safari 26.5**, más nuevo que el del dueño. No es
  equivalente a un Mac: el motor JS y el CSS coinciden, pero **lo específico de plataforma no
  se prueba** — inercia real del trackpad, visual viewport con pinch-zoom, rebote del scroll,
  rasterizado de fuentes.
- **WebKit headless no reproduce 5 de los 8 escenarios de gesto.** Mete silencios de 155–253 ms
  entre eventos, por encima del `IDLE_MS = 120` del sitio, así que **inventa separaciones de
  gesto** que el escenario no pedía. La comprobación lo detecta y los marca *no interpretables*
  en vez de dar un rojo falso. Firefox y Chromium dan **8/8**.
- **El camino nativo horizontal (regla 1) solo está verificado a medias.** Se demuestra que el
  JS no interviene —`0/5` eventos con `preventDefault`— pero los `wheel` sintetizados **no
  mueven el scroll nativo**, así que el comportamiento real de `scroll-snap x mandatory` con un
  trackpad de verdad no se ejercitó. **Es justo el caso principal del dueño.**
- **Las constantes de gesto están calibradas contra perfiles sintéticos.** Cuántos paneles
  avanza un arrastre depende de su velocidad: a 500 px/s da 3, a 700 px/s da 4. Eso es una
  propiedad real, no un ajuste, pero **contra deltas reales del trackpad habrá que revisarlas**.
- **El coste de `blur` en Safari no se midió.** La decisión de hornear el blur se apoya en cómo
  funcionan las superficies fuera de pantalla, no en un número tomado en Safari.
- **Desacople de un frame en Safari:** en macOS el scroll de un overflow scroller corre en el
  hilo de scroll y los eventos llegan al principal con hasta un frame de retraso. Con estos
  factores el error en un flick de 3000 px/s es ~11 px en el fondo (invisible bajo el blur) y
  ~4 px en el texto. Es la razón principal por la que el efecto puede sentirse «despegado».

## 4. Afirmaciones del plan que no se reprodujeron

El plan se escribió con rigor, pero seis de sus números no aguantaron la medición. Se corrigen
aquí para que la próxima sesión no los herede.

1. **El fantasma L1/L2 no lo destruye el blur.** El plan lo daba por aceptable «porque el blur
   destruye los bordes de alta frecuencia» y avisaba de que era un juicio. Montado y mirado, se
   veía la misma persona borrosa junto a la nítida en los 5 paneles. Se resolvió alineando L1
   con la transformación de su figura.
2. **La alineación perfecta L1/L2 es geométricamente imposible en apaisado** con fuentes
   verticales: el panel mide 3200×1800 en coordenadas del lienzo y el marco de la foto solo
   1614. Por eso L1 sale en dos formas y las elige `<source media>`.
3. **Los colores hardcodeados no eran 82 sino 88** en `style.css`+`blog.css`.
4. **Los ratios de separación entre capas no son «2,2× y 2,0×»** sino **2,4× y 2,6×**. Las
   separaciones sí son exactamente las del plan; los ratios citados no cuadraban con sus
   propias cifras.
5. **El `maxΔ` de servir L1 a 320 px no es 4/255 sino hasta 13/255** (en `285`). Sigue siendo
   invisible —`meanΔ` 0,37–0,56— pero el número del plan era optimista.
6. **Los 6 fallos de contraste del blog ES ya no existen**, y **los skip links, el JSON-LD, el
   canonical y los Open Graph nunca existieron**: 0 antes, 0 ahora. El plan pedía conservar
   cosas que el sitio no tiene. *(Mejora futura, fuera del alcance de este trabajo.)*

Y una corrección de criterio: **los rangos de peso «AVIF 26–42 KB» eran descripción de lo que
salió del pipeline, no un criterio.** Pesar menos nunca fue un defecto. Lo que sí es criterio
son los dos techos, y ambos se cumplen con margen.

## 5. Lo que el arnés cazó de sí mismo

Un medidor que solo sabe dar verde no mide. Estos son los falsos verdes **propios** que se
encontraron y cerraron; los tres primeros viven ahora en `run.sh selfcheck`.

- El **control positivo pasaba con el fixture roto**: la regla era `!changed.a`, y en WebKit
  `'none' !== 'none'` la satisfacía gratis.
- **`probe.mjs` salía con 0 midiendo nada** al apuntarlo a un directorio que no fuera el sitio.
- **`render-check` aprobaba con las 5 fotos rotas**: el texto y el ruido SVG dan solos 9.358
  colores.
- **`tokens-check` veía 2 tokens en todo el sitio** y parecía verde: desde CSS Nesting un
  `CSSStyleRule` también tiene `.cssRules`.
- **`a11y-check` marcaba 1.815 de 1.951 elementos como no evaluables** porque el ruido SVG
  lleva `filter='url(%23n)'` dentro de su data URI — el mismo agujero por el que Lighthouse da
  100 con fallos dentro. Y daba **56 falsos fallos con ratio exacto 1:1** por componer un fondo
  semitransparente sobre sí mismo.
- **`checkbake` daba `maxΔ=0` en los tres caminos**, incluido el que tiene que diferir: bandas
  vacías por leer `width`/`channels` de la raíz en vez de `.info`.
- **`gestures-check` daba dos rojos que parecían bugs** por medir la fidelidad del timing con
  la mediana, que escondía justo el pico que partía el gesto.

## 5 bis. Lo que el dueño encontró y las puertas no

Cuatro defectos reportados tras publicar. Los cuatro reales, y **ninguno lo cazó la suite**.

1. **El botón A/B no hacía nada.** `script.js` se carga en la línea 424 y el botón se insertó
   en la 428: al ejecutarse, `querySelectorAll('.ver-toggle button')` devolvía una lista
   **vacía**. Ni se ponía `data-version` ni se enganchaba un listener. Lo que se veía como «A y
   B se parecen» era esto: **B nunca llegaba a activarse**. Con la Versión B activa de verdad,
   la diferencia media es de 31,7/255.
2. **En móvil la figura tapaba el contenido.** Medido a 390×844: `height:100%` la sacaba a
   **520 px de ancho en un viewport de 390**, anclada abajo. En Contacto quedaba justo detrás
   del formulario. Ahora ocupa la mitad inferior, anclada a la derecha, con scrim vertical.
3. **No se podía cambiar A/B en el teléfono**, porque la regla de puntero grueso ocultaba el
   botón. Era un error de criterio mío: el motor se apaga en móvil, pero **la elección estética
   se decide viendo el sitio**, y el dueño lo mira tanto en el teléfono como en el Mac.
4. **«Contáctame» se solapaba con el pie de stats** en su HP EliteBook 840 G9 con Edge.

**Cinco porqués del cuarto, que es el que tiene causa sistémica:**

1. Se solapan porque `.hero-stats` estaba en posición absoluta al fondo y `.hero-content` fluía
   centrado sobre la altura **completa** del panel.
2. El bloque centrado crece hacia abajo porque **nada reservaba** el espacio del pie: dos
   sistemas de layout que no se conocen.
3. No había reserva porque el panel tiene presupuesto fijo pero el contenido no tenía contrato
   de altura.
4. Se asumió que cabía porque **solo se verificó en viewports altos**: `depth-check` varía el
   ancho (1440 y 2560) y **nunca la altura**.
5. No existía esa comprobación porque **ningún criterio del plan dice «el contenido cabe en su
   caja»**. La verificación heredó el punto ciego del plan.

**Causa raíz: faltaba una puerta de encaje de layout.** Ahora existe —
`tasks/verify/layout-check.mjs`— y barre **14 viewports reales** (incluidos los tres escalados
del EliteBook) afirmando que ningún bloque pisa a otro, que nada desborda su panel, que no hay
scroll horizontal y que los objetivos táctiles llegan a 24×24 (WCAG 2.2 AA).

El arreglo va a la causa, no al síntoma: **el pie pasa al flujo**, así que el espacio queda
reservado por construcción. Y aparecieron dos defectos de la misma familia:

- **Tres contabilidades distintas del mismo alto**: el panel con `100svh − 64px`, el contenido
  con `100vh − 100px`, y encima el padding propio de `.d-text`. Además `100vh` en móvil es el
  viewport **grande**, así que en un teléfono real desbordaba más que en el emulador.
  Sustituidas por `max-height: 100%`: un porcentaje no puede desincronizarse; un `calc` sí.
- **Objetivos táctiles por debajo de 24 px** en la navegación, el `.docx` y los botones A/B.
  Con la excepción de WCAG para enlaces en línea dentro de una frase, que sí están exentos.

Y una puerta más, `mobile-contrast.mjs`, que mide el contraste **sobre píxeles reales**:
renderiza, oculta el texto conservando el layout, captura y mide el fondo bajo cada caja. Con
ella se encontró el punto medio: el primer scrim móvil que puse dejaba leer pero **borraba la
foto**, y la foto es la mitad del diseño.

## 5 ter. La Versión A gana, y el espaciado se unifica

**Decisión del dueño: se queda la A.** La Versión B se retira del sitio — marcado, CSS, JS y
los 10 assets `-b2048` (317 KB). El generador sigue en `stage_e_background.mjs` y todo está a
un `git revert` de volver, pero no se sirve. Con ella se va el botón A/B, que existía solo
para tomar esta decisión.

**Segunda ronda de espaciado**, con sus cinco porqués:

1. El texto tocaba el borde porque `.d-text` tenía padding horizontal **0** en los cuatro
   paneles que no son el hero.
2. Su aire venía de `.panel { padding: … 20px }` — y `.d-text` es `position:absolute; inset:0`,
   así que **ignora el padding de su contenedor**.
3. Se perdió porque T5 metió el contenido en esa capa y yo restauré la caja **solo en el hero**,
   el único panel que miré mientras construía el molde.
4. T6 replicó la **estructura** a los otros cuatro sin re-verificar sus **cajas**: se copiaron
   las capas, no el contrato de espaciado.
5. Ninguna puerta lo cazó porque **texto pegado al borde no es ni solape ni desborde**, que era
   todo lo que `layout-check` sabía comprobar.

**Causa raíz: la caja de contenido se definía en cuatro sitios** (`.panel-content` con `0 8%`,
`.panel` con `80px 20px 20px`, `.about-content` con `padding: 0`, y el hero con la suya) **y
ninguna puerta comparaba paneles entre sí.** Ahora hay **un solo `--gutter`** en `.d-text` y
`layout-check` afirma dos cosas nuevas: que el texto respira contra el borde (≥ 16 px) y que
**la caja es la misma en los cinco paneles** (dispersión ≤ 12 px).

Eso destapó que los cuatro paneles no compartían siquiera la composición del hero: centraban
una columna de 900 px, o sea **780 px de margen a 2560** contra los 205 del hero. No era una
diferencia de detalle: además empujaba el texto justo debajo de la figura, que en todos los
paneles está a la derecha. Ahora los cinco se alinean a la izquierda, como el hero.

Y tres defectos de la misma familia, cada uno encontrado midiendo:
- **Los botones no eran botones sino barras.** `flex: 1 1 auto` los hacía crecer, y sus
  contenedores estaban en `flex-direction: column`, donde el estirado a todo lo ancho lo hace el
  eje cruzado — por eso cambiar el `flex` solo no servía de nada. De **84 %** a **34–40 %**.
- **El titular del hero se centraba** en escritorio (empezaba en 453 px de 1440) porque
  `align-items: center` con `flex-direction: column` centra en horizontal.
- **Las stats se saltaban el gutter** porque una media query las devolvía a `position: absolute`
  con `left/right: 20px`. También pasan al flujo.

## 6. Pendiente del dueño

- ~~Decidir A o B~~ **hecho: se queda la A.**
- **Versión exacta de su Safari** (Safari → Acerca de Safari). Decide si ve el portal: necesita
  18.2+. Por debajo degrada a corte instantáneo, verificado en Firefox.
- **Endpoint real de Formspree.**
- Si quiere **regenerar `EN_AI_BUILDER`** antes de publicarlo.


---

## 5 quater — El pie en el suelo, y el defecto que salió al medirlo

**Lo pedido:** *"si mejor dejemos que mi pie si parezca esta pisando debajo, oseo
que el pie si toque abajo, y de ahi jugar con el tamano de la imagen para hacer
que siempre mi cabeza no este tapada."*

La figura ya medía **0 px del borde inferior** en los 8 teléfonos. Pero medir no
es ver: el degradado del hero llegaba a `0.92` de negro en la base y se comía la
pierna entera, así que el pie no *parecía* pisar aunque el número dijera cero. Se
bajó la base a `0.40` y las stats, que perdían el fondo que las sostenía,
pasaron a una banda propia. Contraste tras el cambio: el peor del hero pasó de
3.22:1 a **7.67:1**.

### El defecto que apareció al mirar la captura

La píldora de puntos es `position: fixed` abajo al centro y flota sobre
**cualquier** panel. Medido a 375×667 tapaba texto en **4 de los 5**:
"Horas automatizadas", "Descargar CV", "Hablemos" y "GitHub".

**Por qué no lo cazó ninguna compuerta — cinco porqués:**

1. ¿Por qué tapaba texto? Porque flota sobre el panel y el contenido llegaba al borde.
2. ¿Por qué llegaba al borde? Porque nadie reservó el hueco que ocupa (28 px + 14 de margen).
3. ¿Por qué nadie lo reservó? Porque en escritorio la píldora va en el lateral derecho, vertical, y nunca cruzó contenido. Al moverla abajo en móvil se movió el elemento, no el hueco.
4. ¿Por qué no lo vio `layout-check`? Porque su bucle de solapes compara **hermanos dentro de `.d-text`**, y la píldora no es descendiente de ningún panel.
5. **Raíz:** el conjunto de elementos de la compuerta se definió como "descendientes del panel". Eso excluye por construcción todo el cromo fijo — píldora, cabecera, cualquier cosa `position: fixed`. No era un fallo de umbral: era un fallo de *a quién se mira*.

**Arreglado en los dos lados:**

- **Sitio:** la reserva se ancla al mismo breakpoint en que la píldora se va abajo (899 px), no al de 699. Entre 700 y 899 —el iPad mini vertical— ya estaba abajo sin hueco reservado.
- **Compuerta:** `layout-check` ahora recoge todo `position: fixed|sticky` fuera de los paneles y lo compara con las hojas de texto. Y compara **geometría visible**: intersecta cada rect con sus ancestros que recortan, porque `.panel-content` tiene `overflow-y: auto` con 1004 px de contenido en 500 y "Descargar CV" daba un solape fantasma de 16 px estando cortado.
- **Mutación:** con la reserva a `0`, la compuerta sale con código 1 y marca 5 de 14 dispositivos. Su verde discrimina.

### Lo que se rompió al arreglarlo

Reservar 60 px por abajo subía 30 px el bloque centrado del hero y el titular se
metía en la cabeza (holgura de **−18 a −30 px** en cuatro teléfonos). Crecer la
imagen no servía: de 90 % a 100 % solo ganaba 12 px de los 40 esperados, porque
un `max-width` la topa antes. Se resolvió sacando las stats del bloque centrado
—ancladas al pie de la capa— y apretando el titular en pantallas de 521–620 px
de alto. `layout-check` cazó el choque intermedio contenido/stats en el SE
(19 px → 5 px → 0).

**Medido, 8 teléfonos de 320×480 a 430×745:** pie a **0 px** del suelo en todos,
holgura de cabeza **17–111 px**, stats en **una sola fila** con el mismo margen
de borde que el resto (29–34 px). Las 12 compuertas + probe en los 3 motores,
en verde.


---

## 6 — El tirón del swipe de dos dedos

**Lo reportado:** *"solo revisar un tema con deslizar con dos dedos en mi mac,
para la derecha perfecto solo se medio traba cuando echo para la izquierda."*

Lo primero que sorprende: el swipe horizontal del Mac entra por la **REGLA 1**
del motor de gestos, que por diseño **no hace nada** — `return` inmediato, ni
`preventDefault`. Lo mueve el scroll nativo. Así que la asimetría no podía estar
en el acumulador de gestos.

### Cinco porqués

1. ¿Por qué se traba al ir hacia un lado? Porque ~1 s **después** de terminar el gesto, el sitio lo devuelve al panel del que salió, y a los dos reintentos se rinde. Eso es "se medio traba", no "no funciona".
2. ¿Por qué lo devuelve? Porque `alDetenerse` cree que ese scroll lo pidió ella y reemite `goToIndex(target)` con un `target` rancio.
3. ¿Por qué lo cree? Porque `programatico` seguía en `true` desde un gesto anterior.
4. ¿Por qué seguía en `true`? Porque aquel gesto acabó en un `goToIndex` que era un **no-op** (ya estábamos en el destino), y un `scrollTo` a la posición actual **no emite `scroll`**. El único sitio que arma el temporizador de la guarda es el listener de `scroll`, así que la guarda nunca corrió.
5. **Raíz:** el flag que dice "este scroll es mío" se ponía por **intención** y solo se limpiaba por **efecto**. Cuando una intención no produce efecto, no había camino de vuelta.

**Por qué es asimétrico en la práctica:** el borde derecho es Contacto, el panel
con el formulario, donde el reflejo natural es hacer scroll vertical. Ese gesto
entra por la REGLA 3, llama a `irA(target + 1)`, clampa a 4 sin moverse, y arma
la trampa con `target = 4`. A partir de ahí, cualquier swipe hacia atrás se come
un tirón hacia la derecha. El borde izquierdo casi nunca se arma.

### Medición

`tasks/verify/swipe-check.mjs` (nuevo, 724 líneas) sintetiza un gesto de trackpad
con fase activa e inercia decreciente, en los dos sentidos, en webkit y chromium,
y envuelve `Element.prototype.scrollTo` con un contador **antes** de que cargue
`script.js`. Con el código original, chromium: `scrollTo(5760, smooth)` a
**+1092 ms** del primer evento de rueda — o sea el sitio moviendo al usuario
mucho después de que su gesto acabó. Los controles sin tecla no lo hacían, lo que
prueba que el gesto sí tenía fuerza para salir.

### Los dos arreglos

- `irA` no arma `programatico` cuando el `scrollTo` va a ser un no-op. Se compara contra `panels[].offsetLeft`, la misma fuente que usa `goToIndex`, para que la predicción no pueda discrepar de lo que hará el scroll.
- La **REGLA 1** ahora suelta la reclamación previa: si el usuario toma el mando con el dedo, el sitio deja de defender su destino anterior. Antes, flecha izquierda + swipe a la derecha antes de que asentara devolvía al panel de partida 3 de 5 veces, **con un `scrollTo` dentro del gesto** — justo lo que esa regla promete que nunca pasa.

### Dos falsas acusaciones que hubo que quitar del arnés

El arnés, recién escrito, acusaba al sitio de cosas que no hacía:

- **Umbral de ms degradado a informativo.** Medía "difiere 51 %" y daba rojo. Pero con gestos controlados de un panel, 5 repeticiones, los cuatro pares adyacentes: derecha 2348/1192/511/627 ms e izquierda 593/564/1491/1641. La dispersión **dentro de un mismo sentido** es de 4.6×, la lentitud sigue al par de paneles y no al sentido, y el signo se invierte entre corridas. Una compuerta que da rojo sobre ruido deja de significar algo.
- **El predicado `devuelto` confundía dos cosas:** "el sitio lo devolvió" y "el gesto nunca salió". Ahora exige que el control equivalente sí haya salido **y** que el sitio haya emitido una orden de scroll. `container.scrollTo` (script.js:65) es la única escritura de scroll de todo el fichero, así que sin llamada no hay culpa posible.

**Mutación:** con los dos arreglos revertidos, la compuerta sale con código 1 y
marca 3 casos de borde. Con ellos, código 0 en webkit y chromium. Su verde
discrimina.

**Lo que NO se puede medir desde aquí:** no existe la noción de *fase* de macOS
(`began`/`changed`/`ended`/`momentum`), ni el swipe-back de navegación del
historial, ni el rubber-banding elástico. El arnés lo dice en su propia salida.
