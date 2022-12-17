let imagen = document.getElementById('imagen-abajo');
const container = document.getElementById("container");
let body = document.getElementsByTagName('body')
let screenWidth = window.innerWidth;

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
  })
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
});
changeSizeBackgournd();


palpitaMensaje('mensaje-pc')
palpitaMensaje('mensaje-tel')