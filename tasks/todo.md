# Todo — scroll trackpad + rediseño fotográfico

Plan completo: [tasks/plan.md](./plan.md)

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado

---

## FASE 1 — Navegación *(se despliega sola)*

- [x] **1.1** Reescribir la capa de input en `src/script.js`
  - [x] `currentIndex` + `goToIndex(i)` leyendo `panels[i].offsetLeft` (fuera `scrollStep`/`scrollLeft +=`)
  - [x] Quitar `scroll-behavior: smooth` de `.scroll-container` (`style.css:124`); `behavior` explícito por llamada
  - [x] Wheel: eje dominante + normalizar `deltaMode` + acumular + umbral + cooldown
  - [x] Guard `e.ctrlKey` → dejar pasar el pinch-zoom
  - [x] Guard de scrollers anidados (`.about-content`, `.contact-panel .panel-content`)
  - [x] Teclado: flechas/PageUp/PageDown/Home/End/Space, sin robar teclas en campos de formulario
  - [x] `prefers-reduced-motion` → `behavior: 'auto'`
- [x] **1.2** Colapsar los tres listeners `scroll` en uno solo coalescido con rAF
  - [x] `updateActiveNav` → `IntersectionObserver` (`root: container`, `threshold: 0.6`)
  - [x] Cachear `offsets` en `measure()`; cero lecturas de layout en el bucle
  - [x] Early-outs `x === lastX` e `idx !== activeIdx`
- [x] **1.3** Gatear el handler de resize por cambio real de `innerWidth` (bug de la barra de URL en móvil)
- [x] **1.4** A11y: `tabindex="-1"` en cada `.panel`, `aria-label` en `#container`, foco al navegar
- [ ] **1.5** Calibrar `THRESHOLD` / `COOLDOWN_MS` en el MacBook (Safari + Chrome)

**CHECKPOINT 1** — [~] commit `5c954a8` en `fix/trackpad-scroll`. 11/11 pruebas en Chrome headless (ES+EN × 3 viewports); el código anterior falla 6. **Falta probar en el Mac real de Jeison.**

---

## FASE 2 — Peso de carga *(independiente de las fotos)*

- [x] **2.1** Sacar el kit de FontAwesome de los 38 HTML; pegar los 9 paths SVG de FA Free inline
- [x] **2.2** Favicon 207 KB → SVG + ico ≤ 8 KB + apple-touch-icon
- [x] **2.3** Self-hostear Inter + Space Grotesk (woff2 variables, subset latin)
  - [x] `@font-face` al inicio de `style.css`, `font-display: optional` en la display face
  - [x] `preload` con `crossorigin` (obligatorio aunque sea mismo origen)
  - [x] Borrar los 3 `<link>` de Google Fonts **y** los 2 `preconnect` muertos
  - [x] Rutas **absolutas** `/src/fonts/...` en ES y EN

**CHECKPOINT 2** — [x] hecho · Lighthouse: Perf 98, A11y 100, BP 100, SEO 100

---

## FASE 3 — Fotos

- [x] **3.1** `git pull` (`origin/main` = `af0b920`); extraer los 8 originales a `~/img-scratch/originals`
- [x] **3.2** Ver las 8 y catalogarlas: encuadre, dónde cae Jeison, zonas limpias para texto
- [x] **3.3** Elegir 5 de las 7 aptas y asignarlas a panel *(`005-CanajaguaTrail` 960×1440 descartada para fondo desktop)*
- [x] **3.4** Instalar `sharp@0.35` en `~/img-scratch` (fuera del repo)
- [x] **3.5** Primer pase de recorte con `sharp.strategy.attention`
- [x] **3.6** **Revisar los 15 recortes apaisados por ojo**; fijar `top:` manual donde corte la cabeza
- [x] **3.7** Codificar AVIF q45 + WebP q68, 5 variantes × 2 formatos por foto
- [x] **3.8** Verificar presupuestos de bytes; bajar calidad en las que se pasen
- [x] **3.9** Anotar el color dominante 1×1 de cada foto (para `--panel-bg`)

**CHECKPOINT 3** — [~] recortes elegidos y montados; **falta el visto bueno de Jeison**

---

## FASE 4 — Rediseño visual

- [x] **4.1** Borrar las 5 estatuas IA (19 MB) + todo su CSS/JS
- [x] **4.2** `.panel-bg` + `.panel-scrim` (selector nuevo, sin `mix-blend-mode` ni `mask`)
  - [x] Scrims por panel, ES y EN
  - [x] Cards → `rgba(surface, .90)` + `backdrop-filter: blur(8px)`
- [x] **4.3** Parallax factor 0.06
  - [x] `width: 112%; margin-left: -6%` + `sizes="112vw"` + `imagesizes="112vw"` (**el mismo número en 3 sitios**)
  - [x] `@property --px` tipada + `translate3d`
  - [x] Ruta `animation-timeline: scroll(inline nearest)` tras `@supports`; rAF de fallback
  - [x] `will-change` alternado por IntersectionObserver al 60%
  - [x] `matchMedia` explícito para reduced-motion **y** para táctil
- [x] **4.4** Carga de paneles 2–5 sin pop-in
  - [x] IntersectionObserver `rootMargin: '0px 150% 0px 150%'`
  - [x] Reveal gateado en `img.decode()` con `.catch()`
  - [x] `--panel-bg` inline por panel (color dominante)
  - [x] Panel 1 exento: `srcset` real + `.is-loaded` desde el HTML
- [x] **4.5** LCP y CLS
  - [x] Preload del hero con `type="image/avif"` + `fetchpriority="high"`
  - [x] `svh` (**nunca `dvh`**) en `.scroll-container` y `.panel`
- [x] **4.6** Arreglos del mismo pase
  - [ ] [!] Formulario → Formspree — **bloqueado: Jeison debe crear la cuenta y pasar el endpoint**
  - [x] Skills: `<ul><li>` → grid de pills
  - [x] Blog → spotlight de una entrada
  - [x] Stats del hero en tratamiento de cristal
  - [x] Glifos `→` → icono FA inline
  - [x] `pngwing.com.webp` 188 KB → ~15 KB
- [x] **4.7** Puntos de progreso de panel (5, clicables; desktop derecha, móvil abajo)

**CHECKPOINT 4** — [~] verificado por medición (303 nodos, 0 fallos WCAG); **falta la revisión visual de Jeison**

---

## FASE 5 — Verificación

- [x] Lighthouse móvil ES y EN: Perf ≥ 90, A11y ≥ 95; LCP atribuido a `.panel-bg img`
- [x] LCP < 2.5 s en 4G; CLS < 0.1
- [x] Contraste con cuentagotas sobre las fotos reales (≥4.5:1 cuerpo, ≥3:1 grande) en ambas paletas
- [ ] Matriz de navegadores: Safari/Chrome/Firefox macOS · Chrome/Firefox Linux · Safari iOS · Chrome Android
- [x] Blog sin regresiones; `sitemap.xml` y toggle de idioma OK
- [x] `grep -rP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]"` → cero resultados
- [x] Hook `pre-commit` que rechace archivos > 500 KB fuera de `src/JEISON*.pdf`

---

## Bloqueos

| # | Qué | Quién | Bloquea |
|---|---|---|---|
| 1 | Endpoint de Formspree | Jeison | 4.6 (solo esa tarea) |
| 2 | Probar en el MacBook (Safari + Chrome) | Jeison | Checkpoint 1 |
| 3 | Visto bueno a los recortes y al diseño | Jeison | Checkpoints 3 y 4 |

---

## Medido al cierre

| | Antes | Después |
|---|---|---|
| Lighthouse móvil (ES/EN) | — | Perf **98** · A11y **100** · BP **100** · SEO **100** |
| LCP / CLS / TBT | — | **2.3 s** / **0** / 0–40 ms |
| Orígenes de terceros en ruta crítica | 4 | **0** |
| Nodos de texto bajo WCAG AA | 83 de 304 | **0 de 303** |
| Árbol de trabajo (sin .git) | 41 MB | **5.0 MB** |
| Pruebas de scroll (ES/EN × 4 viewports) | 5/11 | **11/11** |
