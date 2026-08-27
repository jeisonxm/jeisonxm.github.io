// ===== Jeison Wu — Horizontal Scroll Portfolio =====
// Capa de navegación del scroller horizontal.
//
// Reglas de la casa:
//  - El índice de panel es la fuente de verdad; la posición se deriva de
//    panel.offsetLeft, nunca de window.innerWidth (que es el viewport de
//    layout y queda obsoleto con el pinch-zoom visual de macOS).
//  - `behavior` va explícito en cada scrollTo. El CSS ya no lleva
//    scroll-behavior: smooth — heredarlo hacía que cada escritura de
//    scrollLeft redirigiese una animación en curso, que es lo que rompía
//    el trackpad.
//  - Un gesto = un panel, venga de trackpad, rueda o teclado.

(function () {
  'use strict';

  var container = document.getElementById('container');
  if (!container) return;

  var panels = Array.prototype.slice.call(container.querySelectorAll('.panel'));
  if (!panels.length) return;

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.header-nav a'));
  var scrollHint = document.getElementById('scrollHint');
  var statues = Array.prototype.slice.call(container.querySelectorAll('.statue'));

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function behavior() {
    return reduceMotion.matches ? 'auto' : 'smooth';
  }

  // ---------- Navegación ----------
  var currentIndex = 0;

  function goToIndex(i, forced) {
    i = Math.max(0, Math.min(panels.length - 1, i));
    currentIndex = i;
    container.scrollTo({
      left: panels[i].offsetLeft,   // posición real, no i * innerWidth
      behavior: forced || behavior()
    });
  }

  // ---------- Medidas cacheadas ----------
  // offsetLeft no cambia durante el scroll, solo en resize. Todas las
  // lecturas de layout se agrupan aquí, sin escrituras intercaladas.
  var offsets = [];
  var viewportW = 0;
  var nestedScrollers = [];

  function measure() {
    offsets = panels.map(function (p) { return p.offsetLeft; });
    viewportW = container.clientWidth;
    nestedScrollers = Array.prototype.slice
      .call(container.querySelectorAll('*'))
      .filter(function (el) {
        var oy = getComputedStyle(el).overflowY;
        return oy === 'auto' || oy === 'scroll';
      });
  }

  // ---------- Wheel / trackpad ----------
  var THRESHOLD = 42;        // delta acumulado (px equivalentes) para pasar de panel
  var COOLDOWN_MS = 650;     // se traga la cola de inercia del trackpad
  var GESTURE_GAP_MS = 200;  // sin eventos este rato => empieza gesto nuevo
  var LINE_HEIGHT_PX = 16;   // DOM_DELTA_LINE -> px (Firefox con ratón)

  var accum = 0;
  var lastWheelAt = 0;
  var locked = false;
  var lockTimer = null;

  // Normaliza deltaMode a píxeles y devuelve ambos ejes.
  function normalize(e) {
    var dx = e.deltaX;
    var dy = e.deltaY;
    if (e.deltaMode === 1) {            // DOM_DELTA_LINE
      dx *= LINE_HEIGHT_PX;
      dy *= LINE_HEIGHT_PX;
    } else if (e.deltaMode === 2) {     // DOM_DELTA_PAGE
      dx *= container.clientWidth;
      dy *= container.clientHeight;
    }
    return { x: dx, y: dy };
  }

  // ¿El puntero está sobre un scroller anidado (.about-content,
  // .contact-panel .panel-content) que todavía tiene recorrido en la
  // dirección del gesto? Si sí, la rueda es suya, no nuestra.
  function nestedScrollerWantsIt(target, dy) {
    for (var i = 0; i < nestedScrollers.length; i++) {
      var el = nestedScrollers[i];
      if (!el.contains(target)) continue;
      if (el.scrollHeight - el.clientHeight <= 1) continue;
      var atTop = el.scrollTop <= 0;
      var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (dy < 0 && !atTop) return true;
      if (dy > 0 && !atBottom) return true;
    }
    return false;
  }

  function unlock() {
    locked = false;
    accum = 0;
  }

  function handleWheel(e) {
    // macOS sintetiza el pinch-to-zoom del trackpad como wheel + ctrlKey.
    // Sin este guard el zoom se convierte en navegación.
    if (e.ctrlKey) return;

    var d = normalize(e);
    var horizontal = Math.abs(d.x) > Math.abs(d.y);

    // Gesto vertical sobre texto con overflow propio: se lo cedemos.
    if (!horizontal && nestedScrollerWantsIt(e.target, d.y)) return;

    // Eje dominante. No se hace swap manual por shiftKey: las plataformas
    // que remapean Shift+rueda a deltaX lo hacen antes de llegar a JS, y
    // volver a invertirlo aquí lo rompería.
    var delta = horizontal ? d.x : d.y;
    if (delta === 0) return;

    e.preventDefault();

    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - lastWheelAt > GESTURE_GAP_MS) accum = 0;
    lastWheelAt = now;

    if (locked) return;   // en cooldown: nos comemos la inercia

    accum += delta;
    if (Math.abs(accum) >= THRESHOLD) {
      var dir = accum > 0 ? 1 : -1;
      accum = 0;
      locked = true;
      clearTimeout(lockTimer);
      lockTimer = setTimeout(unlock, COOLDOWN_MS);
      goToIndex(currentIndex + dir);
    }
  }

  container.addEventListener('wheel', handleWheel, { passive: false });

  // ---------- Teclado ----------
  function isTyping(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(document.activeElement)) return;   // no robar teclas en el formulario

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault(); goToIndex(currentIndex + 1); break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault(); goToIndex(currentIndex - 1); break;
      case 'Home':
        e.preventDefault(); goToIndex(0); break;
      case 'End':
        e.preventDefault(); goToIndex(panels.length - 1); break;
      case ' ':
        if (document.activeElement === container) {
          e.preventDefault();
          goToIndex(currentIndex + (e.shiftKey ? -1 : 1));
        }
        break;
    }
  });

  // ---------- Enlaces de navegación ----------
  Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (anchor) {
    anchor.addEventListener('click', function (e) {
      var id = this.getAttribute('href').replace('#', '');
      var idx = -1;
      for (var i = 0; i < panels.length; i++) {
        if (panels[i].id === id) { idx = i; break; }
      }
      if (idx === -1) return;
      e.preventDefault();
      goToIndex(idx);
      panels[idx].focus({ preventScroll: true });   // requiere tabindex="-1"
    });
  });

  // ---------- Nav activa (IntersectionObserver, no matemática de viewport) ----------
  if ('IntersectionObserver' in window) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.6) return;
        var idx = panels.indexOf(entry.target);
        if (idx === -1) return;
        currentIndex = idx;   // mantiene el índice sincronizado tras un drag táctil
        var id = entry.target.id;
        navLinks.forEach(function (link) {
          link.classList.toggle('active', link.getAttribute('href') === '#' + id);
        });
      });
    }, { root: container, threshold: [0, 0.6, 1] });

    panels.forEach(function (p) { navObserver.observe(p); });
  }

  // ---------- Un solo listener de scroll, coalescido con rAF ----------
  var ticking = false;
  var lastX = -1;

  function frame() {
    ticking = false;
    var x = container.scrollLeft;   // única lectura de layout del frame
    if (x === lastX) return;
    lastX = x;

    // A partir de aquí, solo escrituras.
    if (scrollHint) {
      scrollHint.style.opacity = x > viewportW * 0.3 ? '0' : '';
    }

    if (!reduceMotion.matches) {
      for (var i = 0; i < statues.length; i++) {
        var statue = statues[i];
        var panel = statue.closest('.panel');
        if (!panel) continue;
        var pIdx = panels.indexOf(panel);
        var base = pIdx === -1 ? 0 : offsets[pIdx];
        var offset = (x - base) * 0.04;
        statue.style.transform = statue.classList.contains('statue-bg-center')
          ? 'translateX(calc(-50% + ' + offset + 'px))'
          : 'translateX(' + offset + 'px)';
      }
    }
  }

  container.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }, { passive: true });

  // ---------- Resize ----------
  // El colapso de la barra de URL en móvil dispara resize con el ancho sin
  // cambiar; reposicionar ahí tironea al usuario a mitad de gesto.
  var lastW = window.innerWidth;
  var resizeRAF = null;

  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(function () {
      measure();
      goToIndex(currentIndex, 'auto');   // realineado siempre instantáneo
    });
  }, { passive: true });

  // ---------- Estatuas: respiración ----------
  // (Provisional: desaparece junto con las estatuas en la fase de fotos.)
  function animateStatue(id, min, max, duration, delay) {
    var el = document.getElementById(id);
    if (!el || reduceMotion.matches) return;
    el.style.transition = 'opacity ' + duration + 'ms ease-in-out';
    setTimeout(function () {
      setInterval(function () {
        var cur = parseFloat(el.style.opacity || getComputedStyle(el).opacity);
        el.style.opacity = Math.abs(cur - max) < 0.05 ? min : max;
      }, duration);
    }, delay);
  }

  animateStatue('statue-gym', 0.10, 0.20, 3000, 1200);
  animateStatue('statue-run', 0.06, 0.14, 3000, 600);
  animateStatue('statue-code', 0.05, 0.12, 3000, 0);
  animateStatue('statue-strength', 0.06, 0.12, 3000, 900);
  animateStatue('statue-finish', 0.06, 0.12, 3000, 300);

  // ---------- Año del footer ----------
  var yearEl = document.getElementById('anio');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- Arranque ----------
  measure();
  // Si se entra con un #hash, alinear al panel correcto sin animación.
  if (window.location.hash) {
    var hashId = window.location.hash.slice(1);
    for (var j = 0; j < panels.length; j++) {
      if (panels[j].id === hashId) { goToIndex(j, 'auto'); break; }
    }
  }
})();
