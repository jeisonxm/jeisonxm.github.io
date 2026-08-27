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
  // Las capas de profundidad NO se difieren por JS. El defecto 6 era justo eso:
  // con data-src, sin JavaScript solo cargaba 1 foto de 5. Ahora llevan src
  // normal con loading="lazy" nativo, que funciona sin JS y respeta el scroll
  // horizontal. Lo unico diferido por JS es la Version B, y es opt-in.

  // CERO scroll-driven animations, y CERO @supports sobre ellas.
  //
  // Esa fue la causa raíz del parallax congelado: `@supports (animation-timeline)`
  // daba true en Chrome, lo que DESACTIVABA el fallback JS, mientras que el
  // camino CSS tampoco animaba porque `overflow:hidden` en .panel-bg lo convierte
  // en scroll container y `scroll(inline nearest)` se ataba a él, que nunca
  // scrollea. No había parallax por ninguna de las dos vías. Un solo camino de
  // código = imposible que un motor tome una rama no probada.
  var finePointerMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
  var finePointer = finePointerMQ.matches;

  // Se declara ANTES de cualquier uso. Estaba debajo de doJsParallax, y con
  // `var` eso lo dejaba en undefined al evaluarlo: solo salvaba el
  // cortocircuito de `!cssParallax`, que es false en los navegadores con
  // scroll-timeline. En Safari <= 25 y en Firefox se evaluaba de verdad y el
  // TypeError mataba el IIFE entero — rueda, teclado, puntos, 4 de 5 fotos y
  // el guard del formulario.
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // En puntero grueso el motor se apaga ENTERO (plan §2.5): con inercia táctil,
  // escribir transform cada frame es jank y batería. La profundidad es un lujo
  // de escritorio. reduced-motion NO lo apaga: ahí se apaga el movimiento en
  // CSS, pero el motor sigue porque hace falta para calcular --a.
  var depthOn = finePointer;

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
    // --vw en el elemento raíz: los factores de las capas son proporcionales al
    // ancho del panel, y leerlo del CSS con 100vw daría el viewport de layout,
    // que incluye la barra de scroll y queda obsoleto con el pinch-zoom de macOS.
    document.documentElement.style.setProperty('--vw', viewportW + 'px');
    nestedScrollers = Array.prototype.slice
      .call(container.querySelectorAll('*'))
      .filter(function (el) {
        var oy = getComputedStyle(el).overflowY;
        return oy === 'auto' || oy === 'scroll';
      });
  }

  // ---------- Wheel / trackpad: las tres reglas (plan §2.4) ----------
  //
  // El error anterior fue SECUESTRAR todos los eventos wheel, lo que obligaba a
  // un cooldown de 650 ms que se comia los gestos: medido en produccion, 3
  // flicks daban 1 panel. Ahora cada tipo de gesto tiene su camino.
  //
  //   1  horizontal dominante  -> CERO intervencion, ni preventDefault. Lo
  //      resuelve el scroll nativo + scroll-snap-type: x mandatory, en el hilo
  //      de scroll. 3 flicks = 3 paneles por construccion. Es el caso del Mac.
  //   2  rueda discreta        -> 1 notch = 1 panel. Sin acumulador y SIN
  //      cooldown: un notch ya es una intencion completa.
  //   3  vertical continuo     -> acumulador + segmentacion de gesto. La
  //      inercia NO se filtra con temporizador: se DETECTA, porque su magnitud
  //      decae de forma monotona.
  var THRESHOLD = 55;      // delta acumulado para pasar de panel
  var IDLE_MS = 120;       // silencio que separa dos gestos
  var DECAY_HITS = 2;      // caidas consecutivas que marcan inercia
  var RISE = 1.35;         // crecimiento que puede desmentir la inercia
  var PEAK_SLOW = 18;      // por debajo de este pico el gesto es "lento"
  var LONG_MS = 350;       // a partir de aqui el gesto es "largo"
  var REARM = 4;           // veces THRESHOLD para volver a avanzar en el mismo gesto
  var LINE_HEIGHT_PX = 16; // DOM_DELTA_LINE -> px (Firefox con raton)

  // Declarados ANTES de cualquier uso. La leccion de T0 fue exactamente esta
  // clase de bug: una var usada por encima de su declaracion.
  var programatico = false;
  var reintentos = 0;
  var quietoTimer = null;

  // `target` es INTENCION PURA. El IntersectionObserver ya NO lo escribe: antes
  // si, y por eso 3 avances aterrizaban en el panel 2 — un gesto rapido durante
  // un scroll suave en vuelo se sumaba sobre un indice intermedio.
  var target = 0;
  var acc = 0, lastAt = 0, lastMag = 0, lastDir = 0;
  var decayRun = 0, riseRun = 0, peak = 0, gestureStart = 0;
  var momentum = false, avancesEnGesto = 0;

  function normalize(e) {
    var dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= LINE_HEIGHT_PX; dy *= LINE_HEIGHT_PX; }
    else if (e.deltaMode === 2) { dx *= container.clientWidth; dy *= container.clientHeight; }
    return { x: dx, y: dy };
  }

  // ¿El puntero esta sobre un scroller anidado (.about-content, el panel de
  // contacto) que todavia tiene recorrido en la direccion del gesto? Si si, la
  // rueda es suya, no nuestra.
  function nestedScrollerWantsIt(node, dy) {
    for (var i = 0; i < nestedScrollers.length; i++) {
      var el = nestedScrollers[i];
      if (!el.contains(node)) continue;
      if (el.scrollHeight - el.clientHeight <= 1) continue;
      var arriba = el.scrollTop <= 0;
      var abajo = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (dy < 0 && !arriba) return true;
      if (dy > 0 && !abajo) return true;
    }
    return false;
  }

  function nuevoGesto(now) {
    acc = 0; peak = 0; decayRun = 0; riseRun = 0;
    momentum = false; avancesEnGesto = 0; gestureStart = now;
  }

  function irA(i) {
    target = Math.max(0, Math.min(panels.length - 1, i));
    programatico = true;
    goToIndex(target);
  }

  function handleWheel(e) {
    // macOS sintetiza el pinch-to-zoom del trackpad como wheel + ctrlKey. Sin
    // este guard el zoom se convierte en navegacion.
    if (e.ctrlKey) return;

    var d = normalize(e);

    // REGLA 1 — gesto horizontal dominante: no se toca NADA. Ni preventDefault.
    // No se hace swap manual por shiftKey: las plataformas que remapean
    // Shift+rueda a deltaX lo hacen antes de llegar a JS, y volver a invertirlo
    // aqui lo romperia.
    if (Math.abs(d.x) > Math.abs(d.y)) return;

    var dy = d.y;
    if (dy === 0) return;
    if (nestedScrollerWantsIt(e.target, dy)) return;

    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var dir = dy > 0 ? 1 : -1;

    // REGLA 2 — rueda discreta. deltaMode != 0 es rueda por lineas o paginas;
    // un |deltaY| grande y entero es la firma de un raton en modo pixel.
    var discreta = e.deltaMode !== 0 ||
      (Math.abs(e.deltaY) >= 90 && Math.abs(e.deltaY) % 1 === 0);
    if (discreta) {
      e.preventDefault();
      irA(target + dir);
      nuevoGesto(now);
      lastAt = now; lastMag = Math.abs(dy); lastDir = dir;
      return;
    }

    // REGLA 3 — vertical continuo de trackpad.
    e.preventDefault();
    var mag = Math.abs(dy);
    var gap = lastAt ? now - lastAt : Infinity;

    // Gesto nuevo por silencio o por cambio de signo.
    if (gap > IDLE_MS || (lastAt && dir !== lastDir)) nuevoGesto(now);

    // Deteccion de inercia por DECAIMIENTO MONOTONO, no por reloj.
    if (lastAt && gap <= IDLE_MS) {
      if (mag < lastMag) { decayRun++; } else { decayRun = 0; }
      if (mag > lastMag * RISE) { riseRun++; } else { riseRun = 0; }
    }
    if (mag > peak) peak = mag;
    if (!momentum && decayRun >= DECAY_HITS && peak > 12) momentum = true;

    // Una cola de inercia decae de forma monotona, luego es FISICAMENTE INCAPAZ
    // de crecer dos veces seguidas y disfrazarse de gesto nuevo. Con un solo
    // evento creciente si fallaba: un pico aislado la rompia. Esta medido.
    if (momentum && riseRun >= 2) nuevoGesto(now);

    lastAt = now; lastMag = mag; lastDir = dir;

    if (momentum) return;   // mientras haya inercia, ningun evento avanza

    acc += dy;
    if (Math.abs(acc) < THRESHOLD) return;

    // Re-armado dentro de un mismo gesto: solo si el gesto es LENTO o LARGO. Un
    // flick tiene picos altos y fase activa < 200 ms, asi que nunca entra aqui,
    // y por eso un flick no se come dos paneles.
    if (avancesEnGesto > 0) {
      var puedeRearmar = peak < PEAK_SLOW || (now - gestureStart) > LONG_MS;
      if (!puedeRearmar || Math.abs(acc) < THRESHOLD * REARM) return;
    }

    var paso = acc > 0 ? 1 : -1;
    acc = 0;
    avancesEnGesto++;
    irA(target + paso);
  }

  container.addEventListener('wheel', handleWheel, { passive: false });

  // ---------- Guarda de convergencia ----------
  // Al detenerse el scroll, si el panel mas cercano no es `target` y el scroll
  // era programatico, se reemite. Sin esto, Chromium y Firefox aterrizaban un
  // panel corto al redirigir un scroll suave nativo con snap mandatory.
  function alDetenerse() {
    var cerca = Math.round(container.scrollLeft / (viewportW || 1));
    if (!programatico) {
      // El scroll NO lo pedimos nosotros: el usuario llego ahi por la regla 1
      // (gesto horizontal nativo), arrastrando la barra o con un drag tactil.
      // `target` tiene que ponerse al dia o el siguiente gesto teletransporta:
      // medido, desde el panel 3 con target=0, un flick hacia atras saltaba al
      // panel 0 en vez de al 2.
      //
      // Esto NO es el IntersectionObserver escribiendo el indice, que es lo que
      // rompia los avances: aquello ocurria a mitad de un scroll suave EN VUELO
      // y sumaba sobre un indice intermedio. Esto ocurre cuando el scroll ya se
      // detuvo, asi que `cerca` es la posicion real y definitiva.
      target = cerca;
      reintentos = 0;
      return;
    }
    if (cerca === target || reintentos >= 2) { programatico = false; reintentos = 0; return; }
    reintentos++;
    goToIndex(target);
  }

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
        e.preventDefault(); irA(target + 1); break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault(); irA(target - 1); break;
      case 'Home':
        e.preventDefault(); irA(0); break;
      case 'End':
        e.preventDefault(); irA(panels.length - 1); break;
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
        // NO se escribe `target` aqui. Antes si (`currentIndex = idx`), y por eso
        // 3 avances aterrizaban en el panel 2: un gesto rapido durante un
        // scroll suave en vuelo se sumaba sobre un indice intermedio. El
        // observer solo pinta los puntos y la nav.
        currentIndex = idx;
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

    escribirProfundidad(x);
  }

  // ---------- Motor de profundidad (plan §2.2) ----------
  // Un solo rAF. Lee container.scrollLeft UNA vez por frame y escribe solo --p
  // y --a por panel. Cero getComputedStyle, cero offsetLeft y cero
  // getBoundingClientRect dentro del bucle: todo eso vive en measure().
  //
  // will-change NUNCA se toca aquí. Crear y destruir capas a mitad de scroll ES
  // el tirón que se quiere evitar; lo gobierna un IntersectionObserver aparte.
  function escribirProfundidad(x) {
    if (!depthOn || !viewportW) return;
    for (var i = 0; i < panels.length; i++) {
      var p = (x - offsets[i]) / viewportW;
      if (p < -1.15) p = -1.15; else if (p > 1.15) p = 1.15;
      var t = Math.abs(p); if (t > 1) t = 1;
      // smoothstep: las traslaciones son lineales en p (paralaje físicamente
      // consistente); solo escala y opacidad llevan easing.
      var a = t * t * (3 - 2 * t);
      var st = panels[i].style;
      st.setProperty('--p', p.toFixed(4));
      st.setProperty('--a', a.toFixed(4));
    }
  }

  // El rAF corre mientras el scroll se mueve y un rato después, no siempre:
  // dejarlo girando en reposo es batería a cambio de nada.
  var depthRAF = 0, quietos = 0, ultimoX = -1;
  function girar() {
    var x = container.scrollLeft;
    escribirProfundidad(x);
    quietos = (x === ultimoX) ? quietos + 1 : 0;
    ultimoX = x;
    if (quietos > 12) { depthRAF = 0; return; }   // ~200 ms parado
    depthRAF = requestAnimationFrame(girar);
  }
  function despertarProfundidad() {
    quietos = 0;
    if (!depthRAF && depthOn) depthRAF = requestAnimationFrame(girar);
  }

  container.addEventListener('scroll', function () {
    despertarProfundidad();
    clearTimeout(quietoTimer);
    quietoTimer = setTimeout(alDetenerse, 140);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }, { passive: true });

  // ---------- Boton A/B ----------
  // El dueno decide el tratamiento fotografico VIENDOLO. La eleccion persiste
  // para poder vivir con una durante dias. Por defecto A: es la unica que da
  // HD real (a 2048 la B sigue 1.58x escalada en un Retina).
  var VER_KEY = 'jw-version';
  var verBtns = Array.prototype.slice.call(document.querySelectorAll('.ver-toggle button'));

  function revelarB() {
    // Las fotos de B van diferidas a proposito: A es la predeterminada, y B no
    // debe competir por el LCP mientras nadie la pida.
    var pend = document.querySelectorAll('.d-photo [data-src], .d-photo [data-srcset]');
    Array.prototype.forEach.call(pend, function (el) {
      if (el.getAttribute('data-srcset')) {
        el.setAttribute('srcset', el.getAttribute('data-srcset'));
        el.removeAttribute('data-srcset');
      }
      if (el.getAttribute('data-src')) {
        el.setAttribute('src', el.getAttribute('data-src'));
        el.removeAttribute('data-src');
      }
    });
  }

  function aplicarVersion(v, guardar) {
    document.documentElement.setAttribute('data-version', v);
    verBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-ver') === v ? 'true' : 'false');
    });
    if (v === 'b') revelarB();
    if (guardar) { try { localStorage.setItem(VER_KEY, v); } catch (e) { /* modo privado */ } }
  }

  if (verBtns.length) {
    var guardada = null;
    try { guardada = localStorage.getItem(VER_KEY); } catch (e) { /* modo privado */ }
    aplicarVersion(guardada === 'b' ? 'b' : 'a', false);
    verBtns.forEach(function (b) {
      b.addEventListener('click', function () { aplicarVersion(b.getAttribute('data-ver'), true); });
    });
  }

  // Se escucha `change` en AMBOS media queries para aplicarlo en vivo sin
  // recargar: alguien que active reduced-motion o conecte un raton no deberia
  // tener que refrescar.
  function alCambiarEntorno() {
    finePointer = finePointerMQ.matches;
    depthOn = finePointer;
    if (!depthOn) {
      panels.forEach(function (p) {
        p.style.setProperty('--p', '0');
        p.style.setProperty('--a', '0');
        p.classList.remove('depth-live');
      });
    } else {
      measure();
      despertarProfundidad();
    }
  }
  if (finePointerMQ.addEventListener) {
    finePointerMQ.addEventListener('change', alCambiarEntorno);
    reduceMotion.addEventListener('change', alCambiarEntorno);
  }

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
      goToIndex(target, 'auto');   // realineado siempre instantáneo
    });
  }, { passive: true });

  // ---------- Carga de las fotos de los paneles 2-5 ----------
  // loading="lazy" nativo carga SIN JavaScript, que es lo que arregla el
  // defecto 6 (con data-src solo cargaba 1 foto de 5 sin JS). Pero su umbral
  // (~1250 px en conexion rapida) esta afinado para scroll vertical y se aplica
  // por eje: con paneles de 100vw, en un portatil de 1440 el panel 3 esta a
  // 2880 px, fuera del umbral. La foto se materializa DESPUES de que el panel ya
  // se detuvo.
  //
  // La mejora progresiva no vuelve a atar la carga al JS: solo la ADELANTA.
  // Cuando un panel entra en un margen del 150%, sus imagenes pasan a eager. Si
  // el JS no corre, el navegador las carga igual, solo que mas tarde.
  function adelantar(panel) {
    var imgs = panel.querySelectorAll('.d-far img, .d-fig img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].loading === 'lazy') imgs[i].loading = 'eager';
    }
  }

  if ('IntersectionObserver' in window) {
    // Adelanto de carga: margen del 150%, o sea el panel actual y vecino y medio.
    var cargaIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cargaIO.unobserve(e.target);
        adelantar(e.target);
      });
    }, { root: container, rootMargin: '0px 150% 0px 150%', threshold: 0 });
    panels.forEach(function (p) { cargaIO.observe(p); });

    // will-change promueve a capa de compositor. Cinco fotos de 1536x864 como
    // texturas RGBA son ~27 MB de memoria GPU permanente; en un Adreno/Mali de
    // gama media Chrome empieza a desalojar capas, y el desalojo a mitad de
    // scroll es justo el tirón que se quiere evitar. Con margen del 60% solo
    // se promueven el panel actual y su vecino: ~11 MB.
    if (depthOn) {
      // Promoción sobre el PANEL, no sobre cada imagen: una clase, y el CSS
      // decide qué capas promueve. Medido con margen del 60%: promueve 3 de 5
      // (con 100% promovía los 5, o sea nada).
      var layerIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          e.target.classList.toggle('depth-live', e.isIntersecting);
        });
      }, { root: container, rootMargin: '0px 60% 0px 60%', threshold: 0 });
      panels.forEach(function (p) { layerIO.observe(p); });
    }
  }

  // ---------- Puntos de progreso ----------
  var dots = Array.prototype.slice.call(document.querySelectorAll('.panel-dot'));
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { irA(i); });
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
      if (panels[j].id === hashId) { target = j; goToIndex(j, 'auto'); break; }
    }
  }
})();
