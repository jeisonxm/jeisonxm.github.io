// ===== Jeison Wu — Horizontal Scroll Portfolio =====

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Horizontal Scroll via Mouse Wheel =====
const container = $('#container');
let scrollStep = window.innerWidth;

function handleWheel(e) {
  if (!container) return;
  e.preventDefault();
  const direction = e.deltaY > 0 ? 1 : -1;
  container.scrollLeft += scrollStep * direction;
}

if (container) {
  container.addEventListener('wheel', handleWheel, { passive: false });
}

window.addEventListener('resize', () => {
  scrollStep = window.innerWidth;
}, { passive: true });

// ===== Active nav link on scroll =====
const panels = $$('.panel[id]');
const navLinks = $$('.header-nav a');

function updateActiveNav() {
  if (!container) return;
  const scrollPos = container.scrollLeft;
  const panelWidth = window.innerWidth;

  panels.forEach((panel, i) => {
    const panelStart = i * panelWidth;
    const panelEnd = panelStart + panelWidth;

    if (scrollPos >= panelStart - panelWidth * 0.3 && scrollPos < panelEnd - panelWidth * 0.3) {
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

// ===== Statue parallax on scroll =====
const statues = $$('.statue');

function updateStatueParallax() {
  if (!container || !statues.length) return;
  const scrollPos = container.scrollLeft;

  statues.forEach(statue => {
    const panel = statue.closest('.panel');
    if (!panel) return;
    const panelLeft = panel.offsetLeft;
    const offset = (scrollPos - panelLeft) * 0.05;
    statue.style.transform = `translateX(${offset}px) ${statue.classList.contains('statue-bg-center') ? `translateX(calc(-50% + ${offset}px))` : ''}`;
  });
}

if (container) {
  container.addEventListener('scroll', updateStatueParallax, { passive: true });
}

// ===== Scroll hint fade out =====
const scrollHint = $('#scrollHint');

function handleScrollHint() {
  if (!container || !scrollHint) return;
  if (container.scrollLeft > window.innerWidth * 0.3) {
    scrollHint.style.opacity = '0';
  } else {
    scrollHint.style.opacity = '';
  }
}

if (container) {
  container.addEventListener('scroll', handleScrollHint, { passive: true });
}

// ===== Footer year =====
const yearEl = document.getElementById('anio');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ===== Keyboard navigation =====
document.addEventListener('keydown', (e) => {
  if (!container) return;
  if (e.key === 'ArrowRight') {
    container.scrollLeft += scrollStep;
  } else if (e.key === 'ArrowLeft') {
    container.scrollLeft -= scrollStep;
  }
});
