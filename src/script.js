// ===== Jeison Wu — Horizontal Scroll Portfolio =====
// Full JS control — no CSS scroll-snap dependency

(function () {
  'use strict';

  const container = document.getElementById('container');
  if (!container) return;

  const panels = Array.from(document.querySelectorAll('.panel[id]'));
  const navLinks = document.querySelectorAll('.header-nav a');
  const scrollHint = document.getElementById('scrollHint');

  // --- State ---
  let currentIndex = 0;
  let isAnimating = false;

  // --- Smooth scroll animation (requestAnimationFrame) ---
  function smoothScrollTo(targetLeft, duration) {
    if (isAnimating) return;
    isAnimating = true;

    const startLeft = container.scrollLeft;
    const distance = targetLeft - startLeft;
    if (Math.abs(distance) < 2) { isAnimating = false; return; }

    const startTime = performance.now();

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);

      container.scrollLeft = startLeft + distance * eased;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        container.scrollLeft = targetLeft; // exact position
        isAnimating = false;
        updateActiveNav();
      }
    }

    requestAnimationFrame(step);
  }

  // --- Navigate to panel by index ---
  function goToPanel(index) {
    if (isAnimating) return;
    const target = Math.max(0, Math.min(panels.length - 1, index));
    if (target === currentIndex && Math.abs(container.scrollLeft - target * window.innerWidth) < 5) return;

    currentIndex = target;
    smoothScrollTo(currentIndex * window.innerWidth, 500);
  }

  // --- Navigate to panel by ID ---
  function goToPanelById(id) {
    const index = panels.findIndex(p => p.id === id);
    if (index !== -1) goToPanel(index);
  }

  // ===== MOUSE WHEEL =====
  // One wheel gesture = one panel. Block until animation finishes.
  container.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (isAnimating) return;

    if (e.deltaY > 0) {
      goToPanel(currentIndex + 1);
    } else if (e.deltaY < 0) {
      goToPanel(currentIndex - 1);
    }
  }, { passive: false });

  // ===== TOUCH SWIPE =====
  let touchStartX = 0;

  container.addEventListener('touchstart', function (e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  container.addEventListener('touchend', function (e) {
    if (isAnimating) return;
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchStartX - touchEndX;
    const threshold = 50; // px minimum swipe

    if (deltaX > threshold) {
      // Swiped left → next panel
      goToPanel(currentIndex + 1);
    } else if (deltaX < -threshold) {
      // Swiped right → previous panel
      goToPanel(currentIndex - 1);
    }
  }, { passive: true });

  // Prevent default horizontal scroll on touch (we handle it)
  container.addEventListener('touchmove', function (e) {
    // Allow vertical scroll inside panel content (about, skills, etc.)
    // but prevent horizontal drag
  }, { passive: true });

  // ===== NAV LINKS =====
  navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const id = this.getAttribute('href').replace('#', '');
      goToPanelById(id);
    });
  });

  // ===== ALL ANCHOR LINKS (#about, #contact, etc.) =====
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const id = this.getAttribute('href').replace('#', '');
      const el = document.getElementById(id);
      if (el && panels.includes(el)) {
        e.preventDefault();
        goToPanelById(id);
      }
    });
  });

  // ===== KEYBOARD =====
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') goToPanel(currentIndex + 1);
    else if (e.key === 'ArrowLeft') goToPanel(currentIndex - 1);
  });

  // ===== ACTIVE NAV HIGHLIGHT =====
  function updateActiveNav() {
    navLinks.forEach(function (link) {
      const id = link.getAttribute('href').replace('#', '');
      link.classList.toggle('active', panels[currentIndex] && panels[currentIndex].id === id);
    });
  }
  updateActiveNav();

  // ===== STATUE PARALLAX =====
  const statues = document.querySelectorAll('.statue');

  container.addEventListener('scroll', function () {
    const scrollPos = container.scrollLeft;

    // Parallax
    statues.forEach(function (statue) {
      const panel = statue.closest('.panel');
      if (!panel) return;
      const offset = (scrollPos - panel.offsetLeft) * 0.04;
      if (statue.classList.contains('statue-bg-center')) {
        statue.style.transform = 'translateX(calc(-50% + ' + offset + 'px))';
      } else {
        statue.style.transform = 'translateX(' + offset + 'px)';
      }
    });

    // Scroll hint
    if (scrollHint) {
      scrollHint.style.opacity = scrollPos > window.innerWidth * 0.3 ? '0' : '';
    }
  }, { passive: true });

  // ===== STATUE BREATHING =====
  function animateStatue(selector, min, max, duration, delay) {
    var el = document.querySelector(selector);
    if (!el) return;
    el.style.transition = 'opacity ' + duration + 'ms ease-in-out';
    setTimeout(function () {
      setInterval(function () {
        var cur = parseFloat(getComputedStyle(el).opacity);
        el.style.opacity = Math.abs(cur - max) < 0.05 ? min : max;
      }, duration);
    }, delay);
  }

  animateStatue('#statue-gym', 0.10, 0.20, 3000, 1200);
  animateStatue('#statue-run', 0.06, 0.14, 3000, 600);
  animateStatue('#statue-code', 0.05, 0.12, 3000, 0);
  animateStatue('#statue-strength', 0.06, 0.12, 3000, 900);
  animateStatue('#statue-finish', 0.06, 0.12, 3000, 300);

  // ===== FOOTER YEAR =====
  var yearEl = document.getElementById('anio');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ===== RESIZE: recalculate position =====
  window.addEventListener('resize', function () {
    // Snap to current panel on resize/zoom
    container.scrollLeft = currentIndex * window.innerWidth;
  }, { passive: true });

})();
