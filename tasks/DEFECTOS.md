# Defectos del rediseño — para arreglar en la próxima sesión

Auditoría hecha **contra el sitio en vivo** (`https://jeisonxm.github.io`, commit `48f5bf9`),
no contra local. Todo lo de abajo está reproducido, no supuesto.

---

## Lo primero: el sitio está roto AHORA MISMO en producción

En **Mac + trackpad + Safari 18 o anterior** (y en Firefox con ratón, en cualquier
sistema) el JavaScript lanza un `TypeError` al cargar y **muere entero**. No es que
funcione mal: no funciona.

Reproducido forzando esa combinación exacta:

```
scroll-timeline = false   finePointer = true
ERRORES JS: Cannot read properties of undefined (reading 'matches')
swipe trackpad: scrollLeft 0 -> 0      <<< NO NAVEGA
flecha derecha: 0                      <<< tampoco
fotos cargadas: 1/5
puntos de progreso activos: 0/5
```

Safari solo soporta `animation-timeline: scroll()` desde la versión 26 (2025). O sea
que **la mayoría de los Macs del mundo ven el sitio muerto**, y eso incluye el tuyo.
Esto explica literalmente "en mac es una mierda completa".

**Decisión pendiente tuya:** revertir producción al commit anterior mientras se
arregla, o aplicar solo la corrección de una línea ya. No lo dejo así por mi cuenta.

---

## CRÍTICOS

### 1. `TypeError` mata todo el JS en Safari/Firefox
`src/script.js:34` usa `reduceMotion` **antes** de que se asigne en la línea 36:

```js
34:  var doJsParallax = !cssParallax && finePointer && !reduceMotion.matches;
36:  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
```

Con `var`, en la línea 34 `reduceMotion` vale `undefined`. Solo se salva por
cortocircuito: en Chrome `cssParallax` es `true`, así que `!cssParallax` corta antes
de llegar a leerlo. En cuanto un navegador no soporta scroll-timeline **y** hay
puntero fino (o sea: Mac con trackpad y Safari), se evalúa y revienta.

Se lleva por delante: navegación con rueda, teclado, puntos de progreso, carga
diferida de 4 de las 5 fotos y el guard del formulario.

### 2. El parallax no se mueve. Nunca. En ningún navegador
La única idea de movimiento que pediste — «que mientras baje con el scroll se me vaya
viendo corriendo» — **no existe**. Medido en producción:

```
hero transform en reposo (panel 0): matrix(1,0,0,1,-41.93,0)
hero transform a mitad de camino  : matrix(1,0,0,1,-41.93,0)
hero transform ya fuera (panel 1) : matrix(1,0,0,1,-41.93,0)
```

Causa: escribí `animation-range: entry 0% exit 100%`, pero `entry`/`exit` son rangos
de las timelines `view()`, no de `scroll()`. El rango es inválido y la animación se
queda congelada en el primer keyframe. Y como `@supports` da `true` en Chrome, el
fallback JS queda **desactivado**: no hay parallax por ninguna de las dos vías.

### 3. Las cards pueden quedarse sin fondo y el texto ilegible
`.info-card`, `.skill-block` y `.blog-entry` usan `background: color-mix(...)` **sin
declaración de respaldo delante**:

```css
.info-card {
  background: color-mix(in srgb, var(--surface) 94%, transparent);
```

Si el navegador no soporta `color-mix()`, la declaración entera se descarta y la card
se queda **transparente** — texto pequeño directamente sobre la foto. Borré el
`background: var(--surface)` en vez de dejarlo como fallback.

---

## GRAVES

### 4. El cooldown se traga los gestos — «funciona fatal»
Sobrecorregí. Antes iba disparado; ahora está trabado. Medido en producción:

| Gesto | Resultado |
|---|---|
| 3 swipes con 120 ms entre ellos | llega al panel 1 — **pierde 2 de 3** |
| 3 swipes con 300 ms | panel 2 — pierde 1 |
| 3 swipes con 500 ms | panel 2 — pierde 1 |
| 1,2 s de scroll continuo | panel 2 de 4 posibles |

Tenés que esperar 650 ms entre gestos para que te haga caso. Nadie navega así.

### 5. La foto está descentrada 42 px de forma permanente
Consecuencia del (2): el primer keyframe se aplica estático. La holgura del parallax
debería ser simétrica (86 px por lado) y es **128 px a la izquierda y 44 a la derecha**.

### 6. Sin JavaScript solo carga 1 de las 5 fotos
Los paneles 2–5 llevan `data-srcset` y dependen del observer. Sin JS quedan en color
plano.

---

## DISEÑO

### 7. La paleta nunca se re-derivó — tenías razón
`style.css` decía literalmente *"Palette extracted from marble statue images"*. La
paleta se sacó **de las estatuas de IA que borramos**. En el commit escribí que «el
piedra cálido sigue funcionando bajo fotos de carrera en Panamá» — lo **afirmé sin
verificarlo**, que es exactamente lo que no debía hacer.

Medido: la UI vive en 10–19 % de saturación en tono 30–37° (gris cálido neutro). Las
fotos llegan a 47 % de saturación, con un turquesa fuerte en la camiseta y verdes de
119° en el trail. No hay ni un acento frío en la paleta que recoja esos tonos.

### 8. Botones: no lo pude reproducir
Medidos en producción, los seis botones dan **exactamente 46 px de alto**; los anchos
varían porque el texto varía (eso es normal en botones de ancho automático). Lo que
sí veo es que el sólido y el fantasma tienen pesos visuales muy distintos porque el
relleno del sólido casi no contrasta con el scrim. **Necesito tu captura** de lo que
estás viendo, porque puede ser un renderizado de Safari que aquí no reproduzco.

---

## Por qué se me pasó todo esto (la causa de fondo)

1. **No revisé el proyecto entero antes de empezar.** Fui directo a los archivos que
   me hacían falta. Nunca hice el inventario completo de CSS ni de cómo se relacionan
   las tres hojas.
2. **Mis 11 pruebas medían un gesto aislado.** Pasaban 11/11 porque preguntaban «¿un
   swipe avanza exactamente un panel?». Nunca probé lo que hace una persona de verdad:
   varios gestos seguidos.
3. **Verifiqué todo en Chrome headless**, que soporta scroll-timeline y reporta
   `pointer: coarse`. Es justo la combinación que **oculta los tres bugs críticos**.
   Yo mismo puse «matriz de navegadores: Safari/Chrome/Firefox en macOS» como criterio
   de aceptación en el plan, y no la ejecuté. Di por bueno el trabajo con Lighthouse 99
   y «303 nodos, 0 fallos» — métricas que se ven muy bien y que no tocan nada de esto.
4. **Confié en medir lo medible** (contraste, bytes, Lighthouse) y no en usar el sitio.
   Ninguna de mis métricas podía detectar «esto se siente trabado» ni «el parallax no
   se mueve», porque no las diseñé para eso.

---

## Plan para la próxima sesión

**Antes de tocar nada:** decidir si se revierte producción.

1. Arreglar el `TypeError` (una línea: mover la declaración de `reduceMotion`).
2. Rehacer el parallax: `animation-range` válido para `scroll()`, y verificar
   **midiendo que el transform cambia** con el scroll, no que «existe la regla».
3. Devolver el fallback a las cards antes de `color-mix()`.
4. Rediseñar la respuesta al gesto: que varios swipes seguidos avancen varios paneles.
   Probable: cola de intención en vez de bloqueo duro.
5. **Re-derivar la paleta a partir de las fotos reales**, no de las estatuas borradas.
   Es el trabajo de diseño que faltó y es la raíz de «las fotos no combinan».
6. Revisar el proyecto completo y cómo se relacionan `style.css`, `obsidiana.css` y
   `blog.css` antes de seguir tocando.
7. Endpoint de Formspree (sigue pendiente de tu lado).
8. Probar en **Safari y Firefox reales**, no solo en Chrome headless, y con varios
   gestos seguidos.
