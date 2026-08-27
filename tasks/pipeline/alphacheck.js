const sharp=require('/home/archy/img-scratch/node_modules/sharp'); const fs=require('fs'),path=require('path');
const D=process.argv[2];
(async()=>{
 const bases=[...new Set(fs.readdirSync(D).filter(f=>/\.h\d+\.(avif|webp|png)$/.test(f)).map(f=>f.replace(/\.(avif|webp|png)$/,'')))].sort();
 for(const b of bases){
   const ref=path.join(D,b+'.png');
   const r=await sharp(ref).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const N=r.info.width*r.info.height;
   const line=[`${b.slice(0,40).padEnd(40)} ${r.info.width}x${r.info.height} ch=${r.info.channels}`];
   for(const ext of ['avif','webp']){
     const p=path.join(D,b+'.'+ext);
     const m=await sharp(p).metadata();
     const c=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});
     let sum=0,max=0,softRef=0,softC=0,hardMismatch=0;
     for(let i=0;i<N;i++){
       const a=r.data[i*4+3], bq=c.data[i*4+3];
       const d=Math.abs(a-bq); sum+=d; if(d>max)max=d;
       if(a>10&&a<245)softRef++; if(bq>10&&bq<245)softC++;
       if((a<10&&bq>128)||(a>245&&bq<128))hardMismatch++;
     }
     line.push(`${ext}: hasAlpha=${m.hasAlpha} ch=${m.channels} meanΔα=${(sum/N).toFixed(2)} maxΔα=${max} softpx ref=${softRef} vs ${softC} flips=${hardMismatch}(${(100*hardMismatch/N).toFixed(4)}%)`);
   }
   console.log(line.join('\n   '));
 }
})();
