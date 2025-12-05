// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);

// Elementos clave (null-safe)
const container = $("container") || document.querySelector(".body-container");
const serviceContainer = $("serviceContainer");
const right = $("right");
const left = $("left");
const imagenAbajo = $("imagen-abajo");

// Secciones de "sobre mí" / dominios
const ingenieriaInd = $("ingenieriaInd");
const dominiosID = $("dominiosID");
const dataScience = $("dataScience");
const dominiosDS = $("dominiosDS");
const webDev = $("webDev");
const dominiosWD = $("dominiosWD");

// ---------- Presentación: “parpadeo” controlado ----------
// Agregamos 'delayInicial' al final (por defecto 0 para no romper lo demás)
function animarElemento(id, min = "0.3", max = "1", tiempo = 1000, delayInicial = 0) {
  const el = $(id);
  if (!el) return;

  // Aseguramos transición suave
  el.style.transition = "opacity 1.5s ease-in-out"; 

  // Esperamos el tiempo del 'delayInicial' antes de iniciar el ciclo
  setTimeout(() => {
    setInterval(() => {
      const currentOpacity = getComputedStyle(el).opacity;
      const isMax = Math.abs(currentOpacity - max) < 0.1;
      
      el.style.opacity = isMax ? min : max;
    }, tiempo);
  }, delayInicial);
}

// Ejecutamos para los textos (Usa los valores por defecto: 0.3, 1, 1000ms)
animarElemento("mensaje-pc");
animarElemento("mensaje-tel");
animarElemento(id="gym",min=0.1,max=0.35,tiempo = 3000,delayInicial = 1200);
animarElemento(id="running",min=0.1,max=0.35,tiempo = 3000,delayInicial = 600 );
animarElemento(id="coding",min=0.1,max=0.35,tiempo = 3000,delayInicial = 0);

// ---------- Imagen inferior (desktop): altura según ancho ----------
function changeSizeBackground() {
  if (!imagenAbajo) return;

  // Evitar en móviles: no tocar layout en viewports pequeños
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent);
  if (isMobileUA) return;

  imagenAbajo.style.height = (window.innerWidth < 900) ? "69px" : "163px";
}

// Inicial y on-resize
changeSizeBackground();
window.addEventListener("resize", changeSizeBackground, { passive: true });

// ---------- Scroll horizontal del “lienzo” ----------

// 1. Variable dinámica: En lugar de 1500 fijo, esta variable guardará
// el ancho EXACTO de la pantalla en el momento actual (considerando el zoom).
let scrollStep = window.innerWidth;

// 2. Función para actualizar el "numero fijo" si hay Zoom o cambio de tamaño
function updateStepOnZoom() {
    // Al hacer zoom, window.innerWidth cambia. 
    // Esto ajusta el salto matemáticamente perfecto para que siempre cuadre.
    scrollStep = window.innerWidth;
    
    // (Opcional) Mantener tu lógica de fondo
    changeSizeBackground(); 
}

// 3. Listener que vigila el Zoom
// El evento "resize" se dispara cuando el usuario hace zoom in/out
window.addEventListener("resize", updateStepOnZoom, { passive: true });

// 4. Tu lógica de scroll original (Fixed)
function handleWheel(e) {
  if (!container) return;
  
  // Prevenir el scroll vertical nativo
  e.preventDefault();

  // Detectar dirección
  // Si deltaY es positivo (abajo), sumamos el paso. Si es negativo (arriba), restamos.
  const direction = e.deltaY > 0 ? 1 : -1;
  
  // Aplicamos el salto exacto calculado con el zoom actual
  container.scrollLeft += scrollStep * direction;
}

function initHorizontalScroll() {
  if (!container) return;
  
  // Inicializamos el paso correcto al cargar
  updateStepOnZoom();

  // Listener de la rueda (no pasivo para poder bloquear el scroll vertical)
  container.addEventListener("wheel", handleWheel, { passive: false });
}

initHorizontalScroll();
// ---------- Carrusel de servicios: flechas ----------
if (right && serviceContainer) {
  right.addEventListener("click", () => { serviceContainer.scrollLeft += 500; });
}
if (left && serviceContainer) {
  left.addEventListener("click", () => { serviceContainer.scrollLeft -= 500; });
}

// ---------- Toggle de tarjetas/skills sin efectos colaterales ----------
function abrirHabilidades(trigger, panel) {
  if (!trigger || !panel) return;

  trigger.addEventListener("click", () => {
    const opened = trigger.classList.toggle("oculto-style"); // si estaba oculta: la muestro
    // Cuando el trigger “se abre” (deja de estar oculto), quiero ocultar el panel (lista de dominios)
    // y viceversa:
    panel.classList.toggle("ocultar", opened);

    // Accesibilidad
    const expanded = !opened;
    trigger.setAttribute("aria-expanded", String(expanded));
  });
}

abrirHabilidades(ingenieriaInd, dominiosID);
abrirHabilidades(dataScience, dominiosDS);
abrirHabilidades(webDev, dominiosWD);

// ---------- Footer: año dinámico ----------
const anio = $("anio");
if (anio) {
  anio.textContent = new Date().getFullYear();
}
