const container = document.getElementById("container");

container.addEventListener('wheel',(e)=>{
  if (e.deltaY > 0){
    container.scrollLeft -=1500;
  }else {
    container.scrollLeft +=1500;
  }
  console.log(e)
})

// if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
//   if (window.innerWidth < 1000){
//     document.body.style.zoom = "70%";
//     document.getElementsByClassName('sections-containers').style.width = '130vw';
//   }
// } 