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

## 6. Pendiente del dueño

- **Abrirlo en su Mac** y decidir A o B con el botón. Es lo único que cierra la pregunta
  estética, y es lo que el botón existe para permitir.
- **Versión exacta de su Safari** (Safari → Acerca de Safari). Decide si ve el portal: necesita
  18.2+. Por debajo degrada a corte instantáneo, verificado en Firefox.
- **Endpoint real de Formspree.**
- Si quiere **regenerar `EN_AI_BUILDER`** antes de publicarlo.
