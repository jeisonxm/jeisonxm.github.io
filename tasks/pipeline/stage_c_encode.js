const sharp = require('/home/archy/img-scratch/node_modules/sharp');
const fs = require('fs'), path = require('path');
const SRC = process.argv[2], OUT = process.argv[3], H = parseInt(process.argv[4]||'1800');
fs.mkdirSync(OUT, {recursive:true});
(async () => {
  for (const f of fs.readdirSync(SRC).filter(f=>f.endsWith('.png')).sort()) {
    const base = f.replace(/\.png$/,'');
    const src = path.join(SRC,f);
    const rows = [];
    for (const [ext, opts] of [
      ['avif', {quality:50, effort:4, chromaSubsampling:'4:2:0'}],
      ['webp', {quality:80, effort:5, alphaQuality:90}],
    ]) {
      const o = path.join(OUT, `${base}.h${H}.${ext}`);
      const t = Date.now();
      await sharp(src).resize({height:H, fit:'inside', withoutEnlargement:true})
        .toFormat(ext, opts).toFile(o);
      rows.push(`${ext.toUpperCase()}=${(fs.statSync(o).size/1024).toFixed(0)}KB(${((Date.now()-t)/1000).toFixed(1)}s)`);
    }
    const o = path.join(OUT, `${base}.h${H}.png`);
    await sharp(src).resize({height:H, fit:'inside', withoutEnlargement:true}).png({compressionLevel:9}).toFile(o);
    rows.push(`PNG=${(fs.statSync(o).size/1024).toFixed(0)}KB`);
    console.log(base.slice(0,44).padEnd(44), rows.join('  '));
  }
})();
