// ===== Jeison Wu — Horizontal Scroll Portfolio =====

const $ = (id) => document.getElementById(id);
const container = $("container") || document.querySelector(".body-container");
const imagenAbajo = $("imagen-abajo");

// ===== Statue "breathing" animation =====
function animarElemento(id, min = "0.3", max = "1", tiempo = 1000, delayInicial = 0) {
  const el = $(id);
  if (!el) return;
  el.style.transition = "opacity 1.5s ease-in-out";
  setTimeout(() => {
    setInterval(() => {
      const currentOpacity = getComputedStyle(el).opacity;
      const isMax = Math.abs(currentOpacity - max) < 0.1;
      el.style.opacity = isMax ? min : max;
    }, tiempo);
  }, delayInicial);
}

animarElemento("mensaje-pc");
animarElemento("mensaje-tel");
animarElemento("gym", 0.1, 0.35, 3000, 1200);
animarElemento("running", 0.1, 0.35, 3000, 600);
animarElemento("coding", 0.1, 0.35, 3000, 0);

// ===== Wave shape size (desktop) =====
function changeSizeBackground() {
  if (!imagenAbajo) return;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobileUA) return;
  imagenAbajo.style.height = (window.innerWidth < 900) ? "69px" : "163px";
}

changeSizeBackground();
window.addEventListener("resize", changeSizeBackground, { passive: true });

// ===== Horizontal Scroll via Mouse Wheel =====
let scrollStep = window.innerWidth;

function updateStepOnZoom() {
  scrollStep = window.innerWidth;
  changeSizeBackground();
}

window.addEventListener("resize", updateStepOnZoom, { passive: true });

function handleWheel(e) {
  if (!container) return;
  e.preventDefault();
  const direction = e.deltaY > 0 ? 1 : -1;
  container.scrollLeft += scrollStep * direction;
}

function initHorizontalScroll() {
  if (!container) return;
  updateStepOnZoom();
  container.addEventListener("wheel", handleWheel, { passive: false });
}

initHorizontalScroll();

// ===== Keyboard Navigation =====
document.addEventListener("keydown", (e) => {
  if (!container) return;
  if (e.key === "ArrowRight") {
    container.scrollLeft += scrollStep;
  } else if (e.key === "ArrowLeft") {
    container.scrollLeft -= scrollStep;
  }
});

// ===== Footer year =====
const anio = $("anio");
if (anio) anio.textContent = new Date().getFullYear();
