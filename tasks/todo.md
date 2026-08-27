# Todo — scroll trackpad + rediseño fotográfico

Plan completo: [tasks/plan.md](./plan.md)

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado

---

## FASE 1 — Navegación *(se despliega sola)*

- [ ] **1.1** Reescribir la capa de input en `src/script.js`
  - [ ] `currentIndex` + `goToIndex(i)` leyendo `panels[i].offsetLeft` (fuera `scrollStep`/`scrollLeft +=`)
  - [ ] Quitar `scroll-behavior: smooth` de `.scroll-container` (`style.css:124`); `behavior` explícito por llamada
  - [ ] Wheel: eje dominante + normalizar `deltaMode` + acumular + umbral + cooldown
  - [ ] Guard `e.ctrlKey` → dejar pasar el pinch-zoom
  - [ ] Guard de scrollers anidados (`.about-content`, `.contact-panel .panel-content`)
  - [ ] Teclado: flechas/PageUp/PageDown/Home/End/Space, sin robar teclas en campos de formulario
  - [ ] `prefers-reduced-motion` → `behavior: 'auto'`
- [ ] **1.2** Colapsar los tres listeners `scroll` en uno solo coalescido con rAF
  - [ ] `updateActiveNav` → `IntersectionObserver` (`root: container`, `threshold: 0.6`)
  - [ ] Cachear `offsets` en `measure()`; cero lecturas de layout en el bucle
  - [ ] Early-outs `x === lastX` e `idx !== activeIdx`
- [ ] **1.3** Gatear el handler de resize por cambio real de `innerWidth` (bug de la barra de URL en móvil)
- [ ] **1.4** A11y: `tabindex="-1"` en cada `.panel`, `aria-label` en `#container`, foco al navegar
- [ ] **1.5** Calibrar `THRESHOLD` / `COOLDOWN_MS` en el MacBook (Safari + Chrome)

**CHECKPOINT 1** — probar en el Mac de Jeison · **mergear y desplegar solo**

---

## FASE 2 — Peso de carga *(independiente de las fotos)*

- [ ] **2.1** Sacar el kit de FontAwesome de los 38 HTML; pegar los 9 paths SVG de FA Free inline
- [ ] **2.2** Favicon 207 KB → SVG + ico ≤ 8 KB + apple-touch-icon
- [ ] **2.3** Self-hostear Inter + Space Grotesk (woff2 variables, subset latin)
  - [ ] `@font-face` al inicio de `style.css`, `font-display: optional` en la display face
  - [ ] `preload` con `crossorigin` (obligatorio aunque sea mismo origen)
  - [ ] Borrar los 3 `<link>` de Google Fonts **y** los 2 `preconnect` muertos
  - [ ] Rutas **absolutas** `/src/fonts/...` en ES y EN

**CHECKPOINT 2** — Lighthouse antes/después · puede mergearse solo

---

## FASE 3 — Fotos

- [ ] **3.1** `git pull` (`origin/main` = `af0b920`); extraer los 8 originales a `~/img-scratch/originals`
- [ ] **3.2** Ver las 8 y catalogarlas: encuadre, dónde cae Jeison, zonas limpias para texto
- [ ] **3.3** Elegir 5 de las 7 aptas y asignarlas a panel *(`005-CanajaguaTrail` 960×1440 descartada para fondo desktop)*
- [ ] **3.4** Instalar `sharp@0.35` en `~/img-scratch` (fuera del repo)
- [ ] **3.5** Primer pase de recorte con `sharp.strategy.attention`
- [ ] **3.6** **Revisar los 15 recortes apaisados por ojo**; fijar `top:` manual donde corte la cabeza
- [ ] **3.7** Codificar AVIF q45 + WebP q68, 5 variantes × 2 formatos por foto
- [ ] **3.8** Verificar presupuestos de bytes; bajar calidad en las que se pasen
- [ ] **3.9** Anotar el color dominante 1×1 de cada foto (para `--panel-bg`)

**CHECKPOINT 3** — **mostrar los recortes a Jeison antes de escribir CSS**

---

## FASE 4 — Rediseño visual

- [ ] **4.1** Borrar las 5 estatuas IA (19 MB) + todo su CSS/JS
- [ ] **4.2** `.panel-bg` + `.panel-scrim` (selector nuevo, sin `mix-blend-mode` ni `mask`)
  - [ ] Scrims por panel, ES y EN
  - [ ] Cards → `rgba(surface, .90)` + `backdrop-filter: blur(8px)`
- [ ] **4.3** Parallax factor 0.06
  - [ ] `width: 112%; margin-left: -6%` + `sizes="112vw"` + `imagesizes="112vw"` (**el mismo número en 3 sitios**)
  - [ ] `@property --px` tipada + `translate3d`
  - [ ] Ruta `animation-timeline: scroll(inline nearest)` tras `@supports`; rAF de fallback
  - [ ] `will-change` alternado por IntersectionObserver al 60%
  - [ ] `matchMedia` explícito para reduced-motion **y** para táctil
- [ ] **4.4** Carga de paneles 2–5 sin pop-in
  - [ ] IntersectionObserver `rootMargin: '0px 150% 0px 150%'`
  - [ ] Reveal gateado en `img.decode()` con `.catch()`
  - [ ] `--panel-bg` inline por panel (color dominante)
  - [ ] Panel 1 exento: `srcset` real + `.is-loaded` desde el HTML
- [ ] **4.5** LCP y CLS
  - [ ] Preload del hero con `type="image/avif"` + `fetchpriority="high"`
  - [ ] `svh` (**nunca `dvh`**) en `.scroll-container` y `.panel`
- [ ] **4.6** Arreglos del mismo pase
  - [ ] [!] Formulario → Formspree — **bloqueado: Jeison debe crear la cuenta y pasar el endpoint**
  - [ ] Skills: `<ul><li>` → grid de pills
  - [ ] Blog → spotlight de una entrada
  - [ ] Stats del hero en tratamiento de cristal
  - [ ] Glifos `→` → icono FA inline
  - [ ] `pngwing.com.webp` 188 KB → ~15 KB
- [ ] **4.7** Puntos de progreso de panel (5, clicables; desktop derecha, móvil abajo)

**CHECKPOINT 4** — revisión visual con Jeison: ES/EN × desktop/móvil

---

## FASE 5 — Verificación

- [ ] Lighthouse móvil ES y EN: Perf ≥ 90, A11y ≥ 95; LCP atribuido a `.panel-bg img`
- [ ] LCP < 2.5 s en 4G; CLS < 0.1
- [ ] Contraste con cuentagotas sobre las fotos reales (≥4.5:1 cuerpo, ≥3:1 grande) en ambas paletas
- [ ] Matriz de navegadores: Safari/Chrome/Firefox macOS · Chrome/Firefox Linux · Safari iOS · Chrome Android
- [ ] Blog sin regresiones; `sitemap.xml` y toggle de idioma OK
- [ ] `grep -rP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]"` → cero resultados
- [ ] Hook `pre-commit` que rechace archivos > 500 KB fuera de `src/JEISON*.pdf`

---

## Bloqueos

| # | Qué | Quién | Bloquea |
|---|---|---|---|
| 1 | Endpoint de Formspree | Jeison | 4.6 (solo esa tarea) |
| 2 | Probar en el MacBook | Jeison | Checkpoint 1 |
| 3 | Aprobar los recortes | Jeison | Checkpoint 3 → Fase 4 |
