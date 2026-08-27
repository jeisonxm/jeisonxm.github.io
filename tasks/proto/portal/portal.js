/* ============================================================
   PORTAL — 14 lineas utiles. Lo unico que hace JS es decirle al
   CSS DONDE se hizo click. Sin JS, el portal se abre desde el
   centro (50% 50%, el valor por defecto de las custom props).
   La navegacion NUNCA depende de este archivo: los enlaces son
   <a href> reales.
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'portal-origin';

  // 1. Restaurar el origen que dejo la pagina anterior.
  try {
    var raw = sessionStorage.getItem(KEY);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && typeof o.x === 'number') {
        document.documentElement.style.setProperty('--px', o.x + 'px');
        document.documentElement.style.setProperty('--py', o.y + 'px');
      }
      sessionStorage.removeItem(KEY);
    }
  } catch (e) { /* storage bloqueado: cae a 50% 50% */ }

  // 2. Guardar el origen al cruzar. Delegado: sirve para los 36 archivos.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-portal]');
    if (!a) return;
    var r = a.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    try { sessionStorage.setItem(KEY, JSON.stringify({ x: x, y: y })); } catch (e2) {}
    document.documentElement.style.setProperty('--px', x + 'px');
    document.documentElement.style.setProperty('--py', y + 'px');
    // NO hay preventDefault. El navegador navega solo.
  }, true);
})();
