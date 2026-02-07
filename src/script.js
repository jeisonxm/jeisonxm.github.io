// ===== Jeison Wu — Horizontal Scroll Portfolio =====

const container = document.getElementById('container');
const panels = document.querySelectorAll('.panel[id]');
const navLinks = document.querySelectorAll('.header-nav a');
const scrollHint = document.getElementById('scrollHint');

// ===== Dynamic scroll step =====
let scrollStep = window.innerWidth;
window.addEventListener('resize', () => { scrollStep = window.innerWidth; }, { passive: true });

// ===== Core: scroll to panel by index =====
let isAnimating = false;

function goToPanel(index) {
  if (!container || isAnimating) return;
  const target = Math.max(0, Math.min(panels.length - 1, index));
  const targetLeft = target * scrollStep;

  // Temporarily disable snap so smooth scroll works
  container.style.scrollSnapType = 'none';
  isAnimating = true;

  container.scrollTo({ left: targetLeft, behavior: 'smooth' });

  // Re-enable snap after animation
  setTimeout(() => {
    container.style.scrollSnapType = 'x mandatory';
    isAnimating = false;
  }, 500);
}

function getCurrentPanel() {
  if (!container) return 0;
  return Math.round(container.scrollLeft / scrollStep);
}

// ===== Mouse wheel → one panel per scroll =====
function handleWheel(e) {
  if (!container) return;
  e.preventDefault();
  if (isAnimating) return;

  const direction = e.deltaY > 0 ? 1 : -1;
  goToPanel(getCurrentPanel() + direction);
}

if (container) {
  container.addEventListener('wheel', handleWheel, { passive: false });
}

// ===== Touch swipe =====
let touchStartX = 0;
let touchStartScrollLeft = 0;

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartScrollLeft = container ? container.scrollLeft : 0;
}

function handleTouchEnd(e) {
  if (!container) return;
  const deltaX = touchStartX - (e.changedTouches[0]?.clientX ?? touchStartX);
  const threshold = scrollStep * 0.15;

  if (Math.abs(deltaX) > threshold) {
    const direction = deltaX > 0 ? 1 : -1;
    const startPanel = Math.round(touchStartScrollLeft / scrollStep);
    goToPanel(startPanel + direction);
  } else {
    // Snap back
    goToPanel(getCurrentPanel());
  }
}

if (container) {
  container.addEventListener('touchstart', handleTouchStart, { passive: true });
  container.addEventListener('touchend', handleTouchEnd, { passive: true });
}

// ===== All anchor links (#about, #contact, etc.) =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href').replace('#', '');
    const targetEl = document.getElementById(targetId);
    if (targetEl && container) {
      e.preventDefault();
      // Find panel index
      const panelArray = Array.from(panels);
      const index = panelArray.indexOf(targetEl);
      if (index !== -1) {
        goToPanel(index);
      }
    }
  });
});

// ===== Active nav highlight =====
function updateActiveNav() {
  if (!container) return;
  const current = getCurrentPanel();
  panels.forEach((panel, i) => {
    const id = panel.getAttribute('id');
    navLinks.forEach(link => {
      if (link.getAttribute('href') === `#${id}`) {
        link.classList.toggle('active', i === current);
      }
    });
  });
}

if (container) {
  container.addEventListener('scroll', updateActiveNav, { passive: true });
}

// ===== Keyboard navigation =====
document.addEventListener('keydown', (e) => {
  if (!container) return;
  if (e.key === 'ArrowRight') { goToPanel(getCurrentPanel() + 1); }
  else if (e.key === 'ArrowLeft') { goToPanel(getCurrentPanel() - 1); }
});

// ===== Statue parallax =====
const statues = document.querySelectorAll('.statue');

function updateStatueParallax() {
  if (!container || !statues.length) return;
  const scrollPos = container.scrollLeft;
  statues.forEach(statue => {
    const panel = statue.closest('.panel');
    if (!panel) return;
    const offset = (scrollPos - panel.offsetLeft) * 0.04;
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

// ===== Statue breathing =====
function animateStatue(selector, min, max, duration, delay) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.style.transition = `opacity ${duration}ms ease-in-out`;
  setTimeout(() => {
    setInterval(() => {
      const cur = parseFloat(getComputedStyle(el).opacity);
      el.style.opacity = Math.abs(cur - max) < 0.05 ? min : max;
    }, duration);
  }, delay);
}

animateStatue('#statue-gym', 0.10, 0.20, 3000, 1200);
animateStatue('#statue-run', 0.06, 0.14, 3000, 600);
animateStatue('#statue-code', 0.05, 0.12, 3000, 0);
animateStatue('#statue-strength', 0.06, 0.12, 3000, 900);
animateStatue('#statue-finish', 0.06, 0.12, 3000, 300);

// ===== Scroll hint =====
if (container && scrollHint) {
  container.addEventListener('scroll', () => {
    scrollHint.style.opacity = container.scrollLeft > scrollStep * 0.3 ? '0' : '';
  }, { passive: true });
}

// ===== Footer year =====
const yearEl = document.getElementById('anio');
if (yearEl) yearEl.textContent = new Date().getFullYear();
