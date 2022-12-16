const container = document.getElementById("container");

container.addEventListener('wheel',(e)=>{
  if (e.wheelDelta > 0){
    container.scrollLeft -=1500;
  }else {
    container.scrollLeft +=1500;
  }
  console.log(container.scrollLeft)
  console.log(e.wheelDelta);
})
