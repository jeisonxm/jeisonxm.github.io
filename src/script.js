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
  var bgImgs = panels.map(function (p) { return p.querySelector('.panel-bg img'); });

  // Si el navegador soporta scroll-driven animations, el parallax lo lleva el
  // compositor por CSS y el JS no debe escribir --px.
  var cssParallax = window.CSS && CSS.supports &&
    CSS.supports('animation-timeline', 'scroll(inline nearest)');
  // El parallax por JS solo en punteros finos: escribir transform de forma
  // continua durante el scroll con inercia es jank y batería en Android.
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var doJsParallax = !cssParallax && finePointer && !reduceMotion.matches;

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
        syncDots(idx);
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

    if (doJsParallax) {
      for (var i = 0; i < bgImgs.length; i++) {
        var img = bgImgs[i];
        if (!img) continue;
        // Se escribe una custom property registrada como <length>, no un
        // string de transform: el motor la guarda tipada y no re-parsea en
        // cada frame. Clampeada a ±40px, que es la holgura del 6%.
        var off = (x - offsets[i]) * 0.06;
        if (off > 40) off = 40; else if (off < -40) off = -40;
        img.style.setProperty('--px', off + 'px');
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

  // ---------- Carga de las fotos de los paneles 2-5 ----------
  // loading="lazy" nativo hace pop-in visible aquí: su umbral (~1250px en
  // conexión rápida) está afinado para scroll vertical y se aplica por eje.
  // Con paneles de 100vw, en un portátil de 1440px el panel 3 está a 2880px,
  // fuera del umbral — y la transición de snap dura 300-500ms mientras la
  // imagen tarda bastante más. Se ve la foto materializarse DESPUÉS de que
  // el panel ya se detuvo.
  function reveal(img) {
    var pic = img.parentNode;
    var sources = pic.querySelectorAll('source[data-srcset]');
    for (var i = 0; i < sources.length; i++) {
      sources[i].srcset = sources[i].getAttribute('data-srcset');
      sources[i].removeAttribute('data-srcset');
    }
    if (img.getAttribute('data-srcset')) {
      img.srcset = img.getAttribute('data-srcset');
      img.removeAttribute('data-srcset');
    }
    if (img.getAttribute('data-src')) {
      img.src = img.getAttribute('data-src');
      img.removeAttribute('data-src');
    }
    // decode() resuelve solo cuando el bitmap está rasterizado y listo para
    // pintar. Añadir .is-loaded después es lo que de verdad mata el pop-in:
    // sin esto se puede llegar a ver un pintado progresivo a medias.
    // El catch es obligatorio: decode() rechaza si la fuente cambia a mitad
    // de vuelo, cosa que pasa al cruzar el breakpoint de 700px en un resize.
    if (img.decode) {
      img.decode().then(done, done);
    } else {
      img.addEventListener('load', done);
      done();
    }
    function done() { img.classList.add('is-loaded'); }
  }

  if ('IntersectionObserver' in window) {
    var lazyIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        lazyIO.unobserve(e.target);
        reveal(e.target);
      });
    }, { root: container, rootMargin: '0px 150% 0px 150%', threshold: 0 });

    bgImgs.forEach(function (img) {
      // El <img> diferido lleva data-src (no data-srcset: los srcset viven en
      // los <source>). Comprobar solo data-srcset dejaba a los paneles 2-5
      // sin observar y por tanto sin cargar nunca.
      if (!img) return;
      var pending = img.getAttribute('data-src') || img.getAttribute('data-srcset') ||
                    img.parentNode.querySelector('source[data-srcset]');
      if (pending) lazyIO.observe(img);
    });

    // will-change promueve a capa de compositor. Cinco fotos de 1536x864 como
    // texturas RGBA son ~27 MB de memoria GPU permanente; en un Adreno/Mali de
    // gama media Chrome empieza a desalojar capas, y el desalojo a mitad de
    // scroll es justo el tirón que se quiere evitar. Con margen del 60% solo
    // se promueven el panel actual y su vecino: ~11 MB.
    if (doJsParallax) {
      var layerIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          e.target.style.willChange = e.isIntersecting ? 'transform' : 'auto';
        });
      }, { root: container, rootMargin: '0px 60% 0px 60%', threshold: 0 });
      bgImgs.forEach(function (img) { if (img) layerIO.observe(img); });
    }
  } else {
    // Sin IntersectionObserver: cargar todo de una, es preferible a no cargar.
    bgImgs.forEach(function (img) {
      if (img && !img.classList.contains('is-loaded')) reveal(img);
    });
  }

  // ---------- Puntos de progreso ----------
  var dots = Array.prototype.slice.call(document.querySelectorAll('.panel-dot'));
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goToIndex(i); });
  });

  function syncDots(idx) {
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', i === idx);
      dots[i].setAttribute('aria-current', i === idx ? 'true' : 'false');
    }
  }
  syncDots(0);

  // ---------- Formulario de contacto ----------
  // Mientras el endpoint de Formspree siga siendo el marcador, enviar POST
  // llevaría a una página de error. Se intercepta y se abre un correo ya
  // redactado con lo que la persona escribió: nunca se pierde el mensaje.
  var cform = document.querySelector('.contact-form');
  if (cform) {
    cform.addEventListener('submit', function (e) {
      var status = cform.querySelector('.form-status');
      if (cform.action.indexOf('TU-ENDPOINT') === -1) return;   // endpoint real: dejar pasar
      e.preventDefault();
      var get = function (n) {
        var el = cform.querySelector('[name="' + n + '"]');
        return el ? el.value : '';
      };
      var body = get('message') + '\n\n— ' + get('name') + ' (' + get('email') + ')';
      if (status) status.textContent = cform.getAttribute('data-fallback-msg') || '';
      window.location.href = 'mailto:jeisonwumitre@gmail.com'
        + '?subject=' + encodeURIComponent('Contacto desde jeisonxm.github.io')
        + '&body=' + encodeURIComponent(body);
    });
  }

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
