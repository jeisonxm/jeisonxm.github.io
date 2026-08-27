import sharp from 'sharp';
import fs from 'node:fs';

const picks = JSON.parse(fs.readFileSync('picks.json','utf8'));

const srgb = c => { c/=255; return c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
const lum  = (r,g,b) => 0.2126*srgb(r)+0.7152*srgb(g)+0.0722*srgb(b);
const ratio = (a,b) => (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);

// filtro CSS aplicado a la foto: brightness(.92) contrast(1.05) saturate(.9)
const applyFilter = v => {
  let x = v*0.92;            // brightness
  x = (x-127.5)*1.05+127.5;  // contrast
  return Math.max(0,Math.min(255,x));
};

const PALETTES = {
  ES: { text:[0xED,0xEA,0xE6], scrim:[44,40,36] },
  EN: { text:[0xF2,0xF2,0xF0], scrim:[10,10,9]  },
};

// zonas donde cae texto, en fracciones del panel (x0,y0,x1,y1)
const ZONES = {
  hero:    { 'título+sub (grande)':[0.08,0.30,0.60,0.62], 'stats (cuerpo)':[0.08,0.82,0.42,0.95] },
  about:   { 'título (grande)':[0.08,0.14,0.55,0.28],     'párrafos (cuerpo)':[0.08,0.30,0.52,0.85] },
  skills:  { 'título (grande)':[0.08,0.14,0.55,0.28],     'cards (cuerpo)':[0.08,0.32,0.92,0.85] },
  blog:    { 'título (grande)':[0.08,0.16,0.55,0.30],     'intro (cuerpo)':[0.08,0.32,0.75,0.75] },
  contact: { 'título (grande)':[0.08,0.16,0.55,0.30],     'form (cuerpo)':[0.08,0.34,0.85,0.80] },
};

// percentil 92 de luminancia: una zona clara puntual bajo el texto rompe el
// contraste aunque la media pase.
function pct(arr, p) { const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length*p)]; }

function neededAlpha(Lphoto, palette, target) {
  const [tr,tg,tb] = palette.text;
  const Lt = lum(tr,tg,tb);
  for (let a=0; a<=100; a++) {
    const al=a/100;
    // composición en espacio sRGB (como hace CSS)
    const comp = Lphoto.map(([r,g,b]) => {
      const cr = al*palette.scrim[0] + (1-al)*r;
      const cg = al*palette.scrim[1] + (1-al)*g;
      const cb = al*palette.scrim[2] + (1-al)*b;
      return lum(cr,cg,cb);
    });
    const worst = pct(comp, 0.92);
    if (ratio(Lt, worst) >= target) return { alpha: al, ratio: +ratio(Lt,worst).toFixed(2) };
  }
  return { alpha: 1, ratio: 0 };
}

console.log('\n  Alpha mínimo del scrim para cumplir WCAG sobre la foto real');
console.log('  (percentil 92 de luminancia = la zona más clara que toca el texto)\n');

for (const [slug,p] of Object.entries(picks)) {
  const m = await sharp('originals/'+p.file).metadata();
  const band = Math.round(m.width*9/16);
  const top = Math.min(Math.round(m.height*p.topFrac), m.height-band);
  const { data, info } = await sharp('originals/'+p.file)
    .extract({left:0,top,width:m.width,height:band})
    .resize(320,180).removeAlpha().raw().toBuffer({resolveWithObject:true});

  console.log('  ' + slug.toUpperCase());
  for (const [zname,[x0,y0,x1,y1]] of Object.entries(ZONES[slug])) {
    const px=[];
    for (let y=Math.floor(y0*info.height); y<y1*info.height; y++)
      for (let x=Math.floor(x0*info.width); x<x1*info.width; x++) {
        const o=(y*info.width+x)*3;
        px.push([applyFilter(data[o]),applyFilter(data[o+1]),applyFilter(data[o+2])]);
      }
    const big = zname.includes('grande');
    const target = big ? 3.0 : 4.5;
    const es = neededAlpha(px, PALETTES.ES, target);
    const en = neededAlpha(px, PALETTES.EN, target);
    console.log(`    ${zname.padEnd(22)} objetivo ${target}:1   ES alpha ≥ ${es.alpha.toFixed(2)}   EN alpha ≥ ${en.alpha.toFixed(2)}`);
  }
  console.log('');
}
