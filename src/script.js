let imagen = document.getElementById('imagen-abajo');
const container = document.getElementById("container");
let body = document.getElementsByTagName('body')
let screenWidth = window.innerWidth;

const right = document.getElementById('right')
const left = document.getElementById('left')

const serviceContainer = document.getElementById('services-container')

const dataScience = document.querySelector('.services-ds')
const ingenieriaInd = document.querySelector('.services-id')
const webDev = document.querySelector('.services-wd')

const dominiosID = document.querySelector('#dominios-id')
const dominiosDS = document.querySelector('#dominios-ds')
const dominiosWD = document.querySelector('#dominios-wd')

function palpitaMensaje(id) {
  setInterval(function() {
    if (document.getElementById(id).style.opacity == "1") {
      document.getElementById(id).style.opacity = "0.3";
    }
  
    else {
      document.getElementById(id).style.opacity = "1";
    }
  }, 1000);
}
function horizontalScroll(size) {
  container.addEventListener('wheel',(e)=>{
    if (e.deltaY > 0){
      container.scrollLeft -=size;
    }else if(e.deltaY < 0) {
      container.scrollLeft +=size;
    }
  },{passive: true})
}
function changeSizeBackgournd() {
  if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    if (window.innerWidth < 900){
      imagen.style.height = '69px';
    }
    else{
      imagen.style.height = '163px'
    }}
}

function movilidadDePagina() {
  if (screenWidth <= 999) {
    horizontalScroll(750)
  }  
  else{
    horizontalScroll(1500)
  }
  
  
  window.addEventListener("resize", function() {
    screenWidth = window.innerWidth
    if (screenWidth <= 999) {
      horizontalScroll(750)
    }  
    else{
      horizontalScroll(1500)
    };
    changeSizeBackgournd(); 
  },{passive: true});
}

movilidadDePagina();
changeSizeBackgournd();


palpitaMensaje('mensaje-pc')
palpitaMensaje('mensaje-tel')

right.addEventListener('click',()=>{serviceContainer.scrollLeft += 500});

left.addEventListener('click',()=>{serviceContainer.scrollLeft -= 500});




function abrirHabilidades(container,dominios) {
  container.addEventListener('click', (e) => {
    if (container.classList.contains('oculto-style')) {
      container.classList.remove('oculto-style');
      dominios.classList.add('ocultar');
      movilidadDePagina();
    } else {
      horizontalScroll(0);
      container.classList.add('oculto-style');
      dominios.classList.remove('ocultar');
    }
  });
}

function movilidadConWheel(container){
  if (!container.classList.contains('oculto-style')){
    
  }
}

abrirHabilidades(ingenieriaInd,dominiosID);
abrirHabilidades(dataScience,dominiosDS);
abrirHabilidades(webDev,dominiosWD);
// for (let i = 0; i < botonCerrar.length; i++) {
//   const element = botonCerrar[i];
//   element.addEventListener('click',(e)=>{
//     console.log('si me tocaste');
//     ingenieriaInd.classList.remove('oculto-style')
//     dominiosID.classList.add('ocultar')
//   })
// }

