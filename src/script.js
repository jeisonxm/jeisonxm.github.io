// ===== Jeison Wu Portfolio — Script =====

// Utility
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== Mobile Menu =====
const menuToggle = $('#menuToggle');
const mobileNav = $('#mobileNav');

if (menuToggle && mobileNav) {
  menuToggle.addEventListener('click', () => {
    mobileNav.classList.toggle('active');
    menuToggle.classList.toggle('open');
  });

  // Close on link click
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('active');
      menuToggle.classList.remove('open');
    });
  });
}

// ===== Scroll Reveal (Intersection Observer) =====
const revealElements = $$('.reveal');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
});

revealElements.forEach(el => revealObserver.observe(el));

// ===== Header scroll effect =====
const header = $('#header');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  
  if (currentScroll > 100) {
    header.style.background = 'rgba(10, 14, 26, 0.95)';
  } else {
    header.style.background = 'rgba(10, 14, 26, 0.8)';
  }
  
  lastScroll = currentScroll;
}, { passive: true });

// ===== Active nav link =====
const sections = $$('section[id]');
const navLinks = $$('.header-nav a');

const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.getAttribute('id');
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
      });
    }
  });
}, {
  threshold: 0.3
});

sections.forEach(section => navObserver.observe(section));

// ===== Footer year =====
const yearEl = document.getElementById('anio');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ===== Smooth entrance for stats (count up) =====
const statNumbers = $$('.stat-number');
let statsAnimated = false;

function animateStats() {
  if (statsAnimated) return;
  statsAnimated = true;
  // Stats are text-based, no count-up needed for now
}

const statsSection = $('.hero-stats');
if (statsSection) {
  const statsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) animateStats();
  }, { threshold: 0.5 });
  statsObserver.observe(statsSection);
}
