# Retrospectiva del rediseño

Agosto 2026. Qué se hizo, qué salió bien, qué salió mal, y qué no hay que volver
a hacer. Todo lo que se afirma aquí está anclado en un `archivo:línea`, un commit
o una medición: si algo no se pudo comprobar, se dice.

Documentos hermanos: [`INFORME.md`](INFORME.md) es el parte honesto de la
ejecución; [`plan.md`](plan.md) es lo que se prometió; este es lo que se aprendió.

---

## 1. Los hechos, sin adjetivos

Un plan de 11 tareas, 93 casillas cerradas, verificado con 14 compuertas de
aceptación sobre tres motores reales (WebKit 26.5, Firefox 153, Chromium 151) en
un arnés de Playwright con sysroot montado a mano, porque en esta máquina no hay
sudo.

Se publicó con **todas las compuertas en verde**. Después, el dueño encontró
defectos graves en **cuatro rondas seguidas**, probando en su Mac, en su teléfono
y en su portátil con Edge:

| Ronda | Lo que encontró él | Lo que ninguna compuerta miraba |
|---|---|---|
| 1 | El botón A/B no hacía nada | Que un criterio del plan se ejecutara de verdad |
| 2 | "Contáctame" solapaba el pie en su EliteBook | El **alto** del viewport |
| 3 | Botones a pantalla completa, texto pegado al borde | Que el contenido **cupiera en su caja** |
| 4 | Su cara tapada; en móvil no hay transición | Capturas de pantalla; la vía de entrada táctil |

**Cero de los cuatro los cazó la suite. Los cuatro los cazó una persona mirando
la pantalla.** Ese es el hecho central de esta retrospectiva.

---

## 2. Lo que salió bien

Solo cuenta lo que demostrablemente evitó o cazó algo.

**La mutación sistemática.** Cada compuerta nueva se estrenó rompiendo el arreglo
a propósito para comprobar que sabía dar rojo. `layout-check` con la reserva a 0
→ exit 1 y 5 de 14 dispositivos. `swipe-check` con los dos arreglos revertidos →
exit 1 y 3 casos de borde. Sin esto, un verde es una afirmación sin respaldo.

**Los controles negativos.** `selfcheck.mjs` existe para verificar que el arnés
sabe discriminar: corre la sonda contra un directorio que no es el sitio, corre
`render-check` con las cinco fotos borradas, y rompe el fixture del control
positivo. Cazó que `render-check` aprobaba la página **con las cinco fotos
rotas** — el texto y el ruido SVG bastaban para superar el umbral de píxeles.

**Declarar en la salida lo que no se puede medir.** Los arneses imprimen sus
propios límites: no hay fases `began/changed/ended/momentum` de macOS, no hay
swipe-back de navegación, no hay rubber-banding. Eso convierte un "verde" en un
"verde sobre este eje", que es lo único que un verde puede ser.

**Comentarios que explican POR QUÉ, citando la medición.** El código está lleno
de cosas como *"medido: el texto empezaba en 20 px, por dentro del gutter de 31"*.
Cuando un defecto vuelve seis meses después, ese comentario es la diferencia
entre entenderlo en un minuto y re-derivarlo en una tarde.

**Convertir cada queja del dueño en una compuerta.** `layout-check` y
`mobile-contrast` nacieron de sus rondas 2 y 3. `focus-check` nació de esta misma
retrospectiva. Las quejas dejaron de ser anécdotas y pasaron a ser regresiones
imposibles.

**Un generador que verifica su propia salida.** `tasks/pipeline/maketokens.mjs`
afirma AA sobre 11 pares de color y sale con código 1 si alguno falla. Es el
único del repo que lo hace. *(Pero escribe el fichero en la línea 170 y comprueba
en la 189: escribe la paleta mala y luego se queja.)*

---

## 3. Lo que salió mal

### 3.1 Siete falsos verdes, todos del instrumento

Ninguna compuerta mintió sobre lo que medía. Todas medían mal **a quién** miraban.

| Qué decía | Qué pasaba de verdad |
|---|---|
| Control positivo en verde | La aserción era `!changed.a`, y en WebKit `'none' !== 'none'` es false: **se cumplía sola** aunque el fixture estuviera podrido |
| `probe.mjs` exit 0 | Apuntado a un directorio cualquiera medía `undefined` y salía **con éxito** |
| Página pintada | Aprobaba con **las 5 fotos rotas**: colores=9358, stdev=49 solo del texto |
| Tokens resueltos | Encontraba **2 tokens** en todo el sitio: `if (x.cssRules)` es truthy-pero-vacío desde CSS Nesting. Corregido: 28 |
| Contraste AA | Declaraba **no evaluable el 93 % del DOM** (1815 de 1951) porque el ruido SVG lleva `filter=` dentro de su data URI |
| Todo medido sobre `/` | El arnés midió **`/en/`** durante toda la T1: `lang.js` redirige por `navigator.language` y el locale de Playwright es en-US |
| Profundidad verificada | `depth-check` medía el puntero grueso, **lo imprimía y no lo sumaba al veredicto**. La transición apagada en móvil llevaba meses medida y en verde |

**El patrón:** en los siete, el umbral estaba bien. Lo que fallaba era el
conjunto de sujetos, o que la observación no estaba cableada al código de salida.

### 3.2 Los defectos del código, por clase

- **Estado con camino de ida y no de vuelta.** `programatico` se armaba por *intención* y solo se limpiaba por *efecto*: un `scrollTo` a la posición actual no emite `scroll`, y el flag quedaba pegado para siempre. Medido: el sitio devolvía al usuario con un `scrollTo(5760)` a **+1092 ms** de que su gesto terminara.
- **Un hecho físico definido en N sitios y nada comparando los N.** La caja de contenido vivía en cuatro sitios; el alto tenía tres contabilidades distintas; la píldora de puntos se movía abajo a los 899 px y el hueco se reservaba a los 699. Cada uno correcto por separado.
- **Una API sin palanca delega la decisión al navegador.** `scrollTo({behavior:'smooth'})` no acepta duración: 278–429 ms en WebKit contra 500–900 de la inercia del trackpad. La misma animación a un tercio de tiempo.
- **Apagar "por rendimiento" apagó el efecto entero.** Doble cerrojo en móvil, JS y CSS. Lo caro no era el motor sino cuántas capas mueve el CSS.
- **Orden de declaración.** Una `var` leída por encima de su asignación mataba el IIFE entero en Safari ≤25 y Firefox: rueda, teclado, puntos, 4 de 5 fotos y el guard del formulario. Y `script.js` cargaba en la línea 424 con el botón A/B insertado en la 428: `querySelectorAll` devolvía lista vacía, por eso "A y B se parecen" — B nunca se activaba.
- **CSS moderno sin respaldo se descarta entero.** Tres `color-mix()` dejaban la tarjeta transparente, en un punto que un commit anterior había declarado cerrado. La frase del informe: *"afirmé «cero color-mix()» y había TRES"*.

### 3.3 El proceso

**Los cinco porqués llegaron siempre al plan, no al código.** La frase textual del
informe: *"Ningún criterio del plan dice «el contenido cabe en su caja». La
verificación heredó el punto ciego del plan."* La verificación variaba el **ancho**
del viewport y nunca el **alto**, porque nadie escribió que el alto importara.

**Se verificaba que las cosas EXISTIERAN, no que se VIERAN BIEN.** La regla CSS
está, el token resuelve, la foto carga, el contraste da 7:1. Nada de eso dice si
la cara del dueño está tapada por el titular.

**Nadie miró una captura de pantalla hasta que él se quejó.** Cuando por fin se
miró una, el defecto de la píldora tapando texto en 4 de 5 paneles apareció en
segundos — después de que la suite entera hubiera dado verde.

**"Medir no es ver."** La figura medía 0 px del borde inferior en los ocho
teléfonos y aun así el pie no *parecía* pisar: el degradado llegaba a 0.92 de
negro y borraba la pierna. El número era correcto y la imagen estaba mal.

**La regla de oro sellaba un tercio de la suite.** `todo.md:8` dice *"ninguna
casilla se marca sin haber corrido `run.sh`"*, y `run.sh` sin argumento corría
**3 de 14** compuertas — ninguna de las once que cazaron las cuatro rondas.
Corregido en esta retrospectiva.

---

## 4. Las cinco lecciones que importan

### 1. Probar en el hardware del dueño es un paso de verificación, no de publicación

Suite entera en verde → cuatro rondas, seis commits, 2.759 inserciones, y los
cuatro defectos encontrados por él. Sus datos —Mac con trackpad, teléfono,
EliteBook con Edge, versión exacta de Safari— eran **preguntables desde el primer
día**. El propio plan marcó *"el WebKit de prueba no es el Safari del dueño"*
como riesgo **Alto** y lo aparcó como "no bloquea". Sigue sin responder después
de cuatro rondas llegadas desde ese Mac.

### 2. Auditar el conjunto de sujetos antes que el umbral, y en este orden

1. ¿Sobre cuántos sujetos corrió de verdad, y cuántos excluyó?
2. ¿Está cableada al código de salida, o solo se imprime?
3. ¿Se cumpliría el predicado si el sujeto **desapareciera**?
4. *Y solo entonces*, el umbral.

En los siete falsos verdes el umbral nunca estuvo mal. Y hay que pasar las cuatro
preguntas por **las compuertas que ya existen**, no solo por la que se está
escribiendo.

### 3. Una compuerta que nunca ha dado rojo no es una compuerta

La mutación va en el mismo commit y ejecutable desde el propio script
(`--mutar` + `page.route`), nunca editando el repo a mano. Contraejemplo dentro
de casa: la mutación de `layout-check` fue una corrida manual documentada en un
informe, y hoy no se puede repetir sin rehacerla.

Corolario doble: **un umbral necesita el ruido medido debajo**. Se degradó a
informativo un umbral del 35 % cuya métrica tenía dispersión de 4,6× *dentro de
la misma condición*; y se relajó otro que exigía "al menos 12 frames" a un
muestreador que solo toma 12 muestras. Una compuerta que da rojo sobre ruido deja
de significar algo, pero una que no juzga a nadie tampoco sirve.

### 4. Listar los ejes que NINGUNA compuerta varía. Esa lista es la agenda de bugs siguiente

Probado dos veces: se cerró el eje "Chrome headless" con tres motores reales y se
dejaron fijos el alto, el tiempo y la vía de entrada — y las rondas 3 y 4 fueron
exactamente alto y tiempo.

Y **"no verificable desde aquí" hay que intentarlo antes de declararlo**:
`swipe-check` acabó usando `CDP Input.dispatchMouseEvent`, que estaba disponible
desde el principio. No probarlo costó una ronda entera.

Ejes que hoy siguen fijos: **locale** (las siete compuertas de comportamiento van
todas a `/` con `locale: es-ES`, así que `/en/` tiene cobertura cero — pasa 14/14
cuando se corre, pero nadie lo corre), **coste de frame** (ninguna compuerta mide
jank), y **el resto de la accesibilidad interactiva**.

### 5. Todo lo que hace correcto al sitio vive fuera del repo y en una sola máquina

Sitio: 3.819 líneas. Arnés: 4.670. Pipeline: 1.377. **Se mantiene más de lo que
se verifica**, y nada de eso corre en CI: no existe `.github/`. Depende de
`~/pw-harness` con un sysroot de ~500 MB montado a mano, de `sharp` en
`~/img-scratch`, de ocho fotos originales fuera de git, y de un
`run_matting.sh` versionado que apunta a un `/tmp` de **otra sesión** — la misma
trampa que un commit anterior ya había diagnosticado (*"el arnés vivía en un
scratchpad efímero y murió con él"*) y cuya lección se aplicó al instrumento pero
no al generador.

---

## 5. Lo que falta

### Roto para un visitante real

1. **El formulario no entrega nada.** `action="https://formspree.io/f/TU-ENDPOINT"` en ES y EN. *Falta el endpoint real; solo lo tiene el dueño.* El respaldo `mailto:` ya avisa (arreglado aquí: leía un atributo que no existía en ningún HTML).
2. **El icono X apunta a una cuenta inexistente.** `twitter.com/jeisonwu` da **404**, verificado con control calibrado. Corregir el handle o retirar el icono.
3. **El CV inglés "AI Builder" es el CV genérico.** `EN_AI_BUILDER.docx`, `EN.docx` y `EN_AUDIT_LEADER.docx` son **el mismo fichero** (md5 idéntico). Un recruiter descarga *"HEAD OF AUDIT ANALYTICS"* donde la página promete AI Builder. El ES sí es correcto.
4. **Cero metadatos sociales en las 38 páginas.** 0 `og:`, 0 `twitter:`, 0 `canonical`, 0 JSON-LD. El sitio existe para pegarse en LinkedIn y WhatsApp, y hoy se pega sin imagen, sin título y sin descripción. Hace falta además generar una imagen social 1200×630 (las de panel son AVIF/WebP).

### Deuda

5. **No hay CI.** Un push desde otra máquina no verifica nada.
6. **No hay compuerta de enlaces** ni de coherencia sitemap/hreflang/slug-map. Hoy sale limpio, pero es justo lo que se rompe al publicar el post 18.
7. **2,6 MB de imágenes huérfanas**: 50 variantes de panel (2,1 MB) y 15 logos de stack (472 KB), sin una sola referencia.
8. **`tasks/build.mjs` + `picks.json` regeneran esas variantes muertas**, y `picks.json` asigna a Skills una foto que el plan marca **NO PUBLICABLE**. Correrlo hoy reintroduce el problema.
9. **`tasks/DEFECTOS.md` publica un diagnóstico ya refutado** y abre diciendo que el sitio está roto en producción, lo cual hoy es falso. A archivo con nota de cierre.
10. **No hay `robots.txt` ni `404.html`.** Un enlace roto cae en la página genérica de GitHub Pages, en inglés y sin vuelta.
11. **CVs sueltos**: `EN_AUDIT_LEADER.docx` sin su PDF, `curriculum final.pdf` sin su docx, y dos ficheros de mayo sin enlazar.

### Pendiente de él

12. La **versión exacta de su Safari**. El portal del blog necesita 18.2+; por debajo degrada a corte instantáneo (verificado), pero sigue sin saberse cuál ve.

---

## 6. Arreglado en esta misma retrospectiva

- **`run.sh` corre las 15 compuertas** y devuelve código ≠ 0 si alguna falla. Antes corría 3.
- **`Tab` teletransportaba.** Medido: 14 tabulaciones llevaban de 0 a 4320 px en **2 eventos de scroll**. Era el mismo defecto que el dueño reportó con la rueda, en la única vía que quien navega con teclado o lector de pantalla no puede evitar. Ahora desliza como las demás: 1126 ms, 24 posiciones.
- **Enlace para saltar al contenido** (WCAG 2.4.1). No existía: 28 elementos enfocables y ninguna forma de saltarse la cabecera. `a11y-check` recogía el campo `skip` y **no lo puntuaba** — tercera aparición del patrón "medir e imprimir no es puntuar".
- **`focus-check.mjs`**, compuerta nueva con su mutación dentro (`--mutar`).
- **El respaldo del formulario ya avisa**: `data-fallback-msg` no existía en ningún HTML, así que pulsar Enviar abría el `mailto:` sin decir nada.
