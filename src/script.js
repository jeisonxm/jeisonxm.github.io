// ===== Jeison Wu — Horizontal Scroll Portfolio =====
// Logic based on original working version (0957ccf)
// CSS handles smooth + snap. JS just changes scrollLeft.

const container = document.getElementById('container');

// ---------- Scroll step (dynamic with zoom/resize) ----------
let scrollStep = window.innerWidth;

function updateStep() {
  scrollStep = window.innerWidth;
}

window.addEventListener('resize', updateStep, { passive: true });

// ---------- Mouse wheel → horizontal scroll ----------
function handleWheel(e) {
  if (!container) return;
  e.preventDefault();

  const direction = e.deltaY > 0 ? 1 : -1;
  container.scrollLeft += scrollStep * direction;
}

if (container) {
  container.addEventListener('wheel', handleWheel, { passive: false });
}

// ---------- Keyboard arrows ----------
document.addEventListener('keydown', function (e) {
  if (!container) return;
  if (e.key === 'ArrowRight') {
    container.scrollLeft += scrollStep;
  } else if (e.key === 'ArrowLeft') {
    container.scrollLeft -= scrollStep;
  }
});

// ---------- Nav links → scroll to section ----------
document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
  anchor.addEventListener('click', function (e) {
    var id = this.getAttribute('href').replace('#', '');
    var target = document.getElementById(id);
    if (target && container) {
      e.preventDefault();
      container.scrollLeft = target.offsetLeft;
    }
  });
});

// ---------- Active nav highlight ----------
var navLinks = document.querySelectorAll('.header-nav a');
var panels = document.querySelectorAll('.panel[id]');

function updateActiveNav() {
  if (!container) return;
  var scrollPos = container.scrollLeft;
  var w = window.innerWidth;

  panels.forEach(function (panel, i) {
    var start = i * w;
    var end = start + w;
    if (scrollPos >= start - w * 0.3 && scrollPos < end - w * 0.3) {
      var id = panel.getAttribute('id');
      navLinks.forEach(function (link) {
        link.classList.toggle('active', link.getAttribute('href') === '#' + id);
      });
    }
  });
}

if (container) {
  container.addEventListener('scroll', updateActiveNav, { passive: true });
}

// ---------- Statue parallax ----------
var statues = document.querySelectorAll('.statue');

function updateParallax() {
  if (!container || !statues.length) return;
  var scrollPos = container.scrollLeft;

  statues.forEach(function (statue) {
    var panel = statue.closest('.panel');
    if (!panel) return;
    var offset = (scrollPos - panel.offsetLeft) * 0.04;
    if (statue.classList.contains('statue-bg-center')) {
      statue.style.transform = 'translateX(calc(-50% + ' + offset + 'px))';
    } else {
      statue.style.transform = 'translateX(' + offset + 'px)';
    }
  });
}

if (container) {
  container.addEventListener('scroll', updateParallax, { passive: true });
}

// ---------- Statue breathing (from original) ----------
function animateStatue(id, min, max, duration, delay) {
  var el = document.getElementById(id);
  if (!el) return;
  el.style.transition = 'opacity ' + duration + 'ms ease-in-out';
  setTimeout(function () {
    setInterval(function () {
      var cur = parseFloat(getComputedStyle(el).opacity);
      el.style.opacity = Math.abs(cur - max) < 0.05 ? min : max;
    }, duration);
  }, delay);
}

animateStatue('statue-gym', 0.10, 0.20, 3000, 1200);
animateStatue('statue-run', 0.06, 0.14, 3000, 600);
animateStatue('statue-code', 0.05, 0.12, 3000, 0);
animateStatue('statue-strength', 0.06, 0.12, 3000, 900);
animateStatue('statue-finish', 0.06, 0.12, 3000, 300);

// ---------- Scroll hint fade ----------
var scrollHint = document.getElementById('scrollHint');
if (container && scrollHint) {
  container.addEventListener('scroll', function () {
    scrollHint.style.opacity = container.scrollLeft > window.innerWidth * 0.3 ? '0' : '';
  }, { passive: true });
}

// ---------- Footer year ----------
var yearEl = document.getElementById('anio');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------- Resize: keep position aligned ----------
window.addEventListener('resize', function () {
  if (!container) return;
  var currentPanel = Math.round(container.scrollLeft / scrollStep);
  updateStep();
  container.scrollLeft = currentPanel * scrollStep;
}, { passive: true });
