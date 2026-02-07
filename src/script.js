// ===== Jeison Wu — Horizontal Scroll Portfolio =====
// Scroll logic based on original working version

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const container = $('#container');
const panels = $$('.panel[id]');
const navLinks = $$('.header-nav a');
const scrollHint = $('#scrollHint');

// ===== Scroll Step (dynamic with zoom/resize) =====
let scrollStep = window.innerWidth;
let isScrolling = false; // debounce flag

window.addEventListener('resize', () => {
  scrollStep = window.innerWidth;
}, { passive: true });

// ===== Mouse Wheel → Horizontal Snap =====
// Debounced: one wheel event = one panel jump, then lock until animation completes
function handleWheel(e) {
  if (!container) return;
  e.preventDefault();

  // Block rapid-fire wheel events during animation
  if (isScrolling) return;
  isScrolling = true;

  const direction = e.deltaY > 0 ? 1 : -1;
  // Calculate which panel we're currently on
  const currentPanel = Math.round(container.scrollLeft / scrollStep);
  // Target the next/prev panel
  const targetPanel = Math.max(0, Math.min(panels.length - 1, currentPanel + direction));
  const targetScroll = targetPanel * scrollStep;

  container.scrollTo({
    left: targetScroll,
    behavior: 'smooth'
  });

  // Unlock after animation (matches CSS scroll-behavior: smooth duration)
  setTimeout(() => {
    isScrolling = false;
  }, 600);
}

if (container) {
  container.addEventListener('wheel', handleWheel, { passive: false });
}

// ===== Touch Swipe → Snap to Panel =====
// On mobile: track touch start/end to determine swipe direction, then snap
let touchStartX = 0;
let touchStartY = 0;
let touchStartScroll = 0;
let isTouchActive = false;

function handleTouchStart(e) {
  if (!container) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartScroll = container.scrollLeft;
  isTouchActive = true;
}

function handleTouchMove(e) {
  if (!container || !isTouchActive) return;
  const deltaX = touchStartX - e.touches[0].clientX;
  const deltaY = Math.abs(touchStartY - e.touches[0].clientY);

  // Only handle horizontal swipes (ignore vertical scroll within panels)
  if (Math.abs(deltaX) > deltaY) {
    // Let CSS scroll-snap handle the actual scrolling
    // But prevent vertical scroll interference
  }
}

function handleTouchEnd(e) {
  if (!container || !isTouchActive) return;
  isTouchActive = false;

  const deltaX = touchStartX - (e.changedTouches[0]?.clientX ?? touchStartX);
  const threshold = scrollStep * 0.15; // 15% of screen width to trigger snap

  if (Math.abs(deltaX) > threshold) {
    const direction = deltaX > 0 ? 1 : -1;
    const currentPanel = Math.round(touchStartScroll / scrollStep);
    const targetPanel = Math.max(0, Math.min(panels.length - 1, currentPanel + direction));

    container.scrollTo({
      left: targetPanel * scrollStep,
      behavior: 'smooth'
    });
  } else {
    // Snap back to nearest panel
    const nearestPanel = Math.round(container.scrollLeft / scrollStep);
    container.scrollTo({
      left: nearestPanel * scrollStep,
      behavior: 'smooth'
    });
  }
}

if (container) {
  container.addEventListener('touchstart', handleTouchStart, { passive: true });
  container.addEventListener('touchmove', handleTouchMove, { passive: true });
  container.addEventListener('touchend', handleTouchEnd, { passive: true });
}

// ===== Nav link click → smooth scroll =====
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = link.getAttribute('href').replace('#', '');
    const targetPanel = document.getElementById(targetId);
    if (targetPanel && container) {
      container.scrollTo({
        left: targetPanel.offsetLeft,
        behavior: 'smooth'
      });
    }
  });
});

// ===== Active nav highlight on scroll =====
function updateActiveNav() {
  if (!container) return;
  const scrollPos = container.scrollLeft;

  panels.forEach((panel, i) => {
    const panelStart = i * scrollStep;
    const panelEnd = panelStart + scrollStep;

    if (scrollPos >= panelStart - scrollStep * 0.3 && scrollPos < panelEnd - scrollStep * 0.3) {
      const id = panel.getAttribute('id');
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
      });
    }
  });
}

if (container) {
  container.addEventListener('scroll', updateActiveNav, { passive: true });
}

// ===== Statue parallax =====
const statues = $$('.statue');

function updateStatueParallax() {
  if (!container || !statues.length) return;
  const scrollPos = container.scrollLeft;

  statues.forEach(statue => {
    const panel = statue.closest('.panel');
    if (!panel) return;
    const panelLeft = panel.offsetLeft;
    const offset = (scrollPos - panelLeft) * 0.04;

    if (statue.classList.contains('statue-bg-center')) {
      statue.style.transform = `translateX(calc(-50% + ${offset}px))`;
    } else {
      statue.style.transform = `translateX(${offset}px)`;
    }
  });
}

if (container) {
  container.addEventListener('scroll', updateStatueParallax, { passive: true });
}

// ===== Statue breathing animation (from original) =====
function animateStatue(selector, minOpacity, maxOpacity, duration, delay) {
  const el = document.querySelector(selector);
  if (!el) return;

  const baseFilter = 'brightness(0.85) contrast(1.05) saturate(0.8)';
  el.style.transition = `opacity ${duration}ms ease-in-out`;

  setTimeout(() => {
    setInterval(() => {
      const current = parseFloat(getComputedStyle(el).opacity);
      const isHigh = Math.abs(current - maxOpacity) < 0.05;
      el.style.opacity = isHigh ? minOpacity : maxOpacity;
    }, duration);
  }, delay);
}

// Gentle breathing on statues
animateStatue('#statue-gym', 0.12, 0.22, 3000, 1200);
animateStatue('#statue-run', 0.08, 0.16, 3000, 600);
animateStatue('#statue-code', 0.06, 0.12, 3000, 0);
animateStatue('#statue-strength', 0.08, 0.14, 3000, 900);
animateStatue('#statue-finish', 0.08, 0.14, 3000, 300);

// ===== Scroll hint fade =====
function handleScrollHint() {
  if (!container || !scrollHint) return;
  scrollHint.style.opacity = container.scrollLeft > scrollStep * 0.3 ? '0' : '';
}

if (container) {
  container.addEventListener('scroll', handleScrollHint, { passive: true });
}

// ===== Keyboard navigation =====
document.addEventListener('keydown', (e) => {
  if (!container || isScrolling) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    isScrolling = true;
    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const currentPanel = Math.round(container.scrollLeft / scrollStep);
    const targetPanel = Math.max(0, Math.min(panels.length - 1, currentPanel + direction));

    container.scrollTo({
      left: targetPanel * scrollStep,
      behavior: 'smooth'
    });

    setTimeout(() => { isScrolling = false; }, 600);
  }
});

// ===== Footer year =====
const yearEl = document.getElementById('anio');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ===== Anchor links in content (e.g. "Contáctame" button) =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href').replace('#', '');
    const targetEl = document.getElementById(targetId);
    if (targetEl && container) {
      e.preventDefault();
      container.scrollTo({
        left: targetEl.offsetLeft,
        behavior: 'smooth'
      });
    }
  });
});
