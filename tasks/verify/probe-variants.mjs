import { chromium, firefox, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WK_RUN = path.join(HERE, 'wk_run.sh');
function wkDir(){ if(process.env.WK_BROWSER_DIR) return process.env.WK_BROWSER_DIR;
  const b=process.env.PLAYWRIGHT_BROWSERS_PATH||path.join(process.env.HOME,'.cache','ms-playwright');
  const d=readdirSync(b).filter(x=>/^webkit-\d+$/.test(x)).sort((a,c)=>Number(c.split('-')[1])-Number(a.split('-')[1]));
  return d.length?path.join(b,d[0]):null; }
const proc=spawn('python3',['-u','-m','http.server','--bind','127.0.0.1','--directory',path.join(HERE,'control'),'0'],{stdio:['ignore','pipe','pipe']});
const port=await new Promise(r=>proc.stdout.on('data',b=>{const m=String(b).match(/port (\d+)/);if(m)r(Number(m[1]))}));
const IDS=['a','b','c','d','e','js'];
for(const [name,type] of [['webkit',webkit],['firefox',firefox],['chromium',chromium]]){
  const opts={}; if(name==='webkit'&&process.env.WK_SYSROOT&&existsSync(WK_RUN)){process.env.WK_BROWSER_DIR=wkDir();opts.executablePath=WK_RUN;}
  const b=await type.launch({headless:true,...opts});
  const p=await b.newPage({viewport:{width:1000,height:700}});
  await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'load'}); await p.waitForTimeout(300);
  const rd=()=>p.evaluate(ids=>Object.fromEntries(ids.map(i=>[i,getComputedStyle(document.querySelector('#'+i+' .panel-bg img')).transform])),IDS);
  const before=await rd();
  await p.evaluate(()=>{const c=document.getElementById('container');c.scrollTo({left:c.clientWidth*1.5,behavior:'auto'})});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); await p.waitForTimeout(250);
  const after=await rd();
  const sup=await p.evaluate(()=>CSS.supports('animation-timeline','scroll(inline nearest)'));
  console.log(`\n=== ${name}  scroll-timeline soportado=${sup} ===`);
  const label={a:'A nearest + overflow:hidden (= el sitio)',b:'B nearest SIN overflow:hidden',c:'C timeline con nombre (--sc)',d:'D nearest SIN overflow + range entry/exit',e:'E nombre + range entry/exit',js:'JS (control)'};
  for(const i of IDS) console.log(`  ${label[i].padEnd(40)} ${before[i]} -> ${after[i]}  cambia=${before[i]!==after[i]}`);
  await b.close();
}
proc.kill();
