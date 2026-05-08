/* =====================================================
   JEISON WU — Bilingual ES↔EN logic
   - Restores liquid-sweep origin from prior toggle click
   - Auto-detects navigator.language on first visit to /
   - Honors stored preference (localStorage 'jeison-lang')
   - Wires toggle button click to navigate via hreflang link
   Loaded from <head> (no defer/async) to run before paint.
   ===================================================== */
(function () {
  'use strict';

  var STORAGE_LANG = 'jeison-lang';
  var STORAGE_VT = 'jeison-vt-origin';

  var path = window.location.pathname;
  var currentLang = path.indexOf('/en/') === 0 || path === '/en' ? 'en' : 'es';

  // ---- 1. Restore liquid-sweep origin (set by previous page's toggle click) ----
  try {
    var raw = localStorage.getItem(STORAGE_VT);
    if (raw) {
      var origin = JSON.parse(raw);
      if (origin && typeof origin.x === 'number' && typeof origin.y === 'number') {
        document.documentElement.style.setProperty('--vt-origin-x', origin.x + 'px');
        document.documentElement.style.setProperty('--vt-origin-y', origin.y + 'px');
      }
      localStorage.removeItem(STORAGE_VT);
    }
  } catch (e) { /* localStorage disabled, no-op */ }

  // ---- 2. Honor stored language preference ----
  var stored = null;
  try { stored = localStorage.getItem(STORAGE_LANG); } catch (e) { /* no-op */ }

  function sameOriginUrl(href) {
    try {
      var u = new URL(href, window.location.href);
      return window.location.origin + u.pathname + u.search + u.hash;
    } catch (e) { return href; }
  }

  if (stored && stored !== currentLang) {
    var altLink = document.querySelector('link[rel="alternate"][hreflang="' + stored + '"]');
    if (altLink && altLink.href) {
      window.location.replace(sameOriginUrl(altLink.href));
      return;
    }
  }

  // ---- 3. First-visit auto-detect (only on root '/') ----
  if (!stored && path === '/' && navigator.language && navigator.language.toLowerCase().indexOf('en') === 0) {
    try { localStorage.setItem(STORAGE_LANG, 'en'); } catch (e) { /* no-op */ }
    window.location.replace('/en/');
    return;
  }

  // ---- 4. Wire toggle button on DOM ready ----
  function wireToggle() {
    var btn = document.querySelector('.lang-toggle');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();

      var newLang = currentLang === 'es' ? 'en' : 'es';
      var altLink = document.querySelector('link[rel="alternate"][hreflang="' + newLang + '"]');
      if (!altLink || !altLink.href) return;

      // Capture button center as sweep origin
      var rect = btn.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;

      try {
        localStorage.setItem(STORAGE_VT, JSON.stringify({ x: x, y: y }));
        localStorage.setItem(STORAGE_LANG, newLang);
      } catch (e) { /* no-op */ }

      // Set origin on current document too, for the outgoing snapshot
      document.documentElement.style.setProperty('--vt-origin-x', x + 'px');
      document.documentElement.style.setProperty('--vt-origin-y', y + 'px');

      btn.classList.add('is-transitioning');
      window.location.href = sameOriginUrl(altLink.href);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggle);
  } else {
    wireToggle();
  }
})();
