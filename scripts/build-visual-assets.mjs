import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {chromium} from '@playwright/test';

// FitStreak original 24px line icons. PNG exports work in WXSS without icon fonts or inline SVG.
const icons={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 plans:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2m-8 3h2"/>',
 stats:'<path d="M4 3v17h17M8 15v-4m5 4V6m5 9V9"/>',
 learn:'<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
 profile:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 run:'<circle cx="16" cy="4" r="2"/><path d="m4 9 4-2 5 3 4 3h4M13 10l-3 5-6 1m6-1 4 2-1 5m-1-12 2-3"/>',
 strength:'<path d="m7 7 10 10M3 7l4-4m10 18 4-4M2 10l8-8m4 20 8-8M4 12l8-8m0 16 8-8"/>',
 yoga:'<circle cx="12" cy="5" r="2"/><path d="M12 9v6m0-4-5 3-4-1m9-2 5 3 4-1M9 15l-5 4c-1 1 0 2 2 2h12c2 0 3-1 2-2l-5-4m-6 6 3-3 3 3"/>',
 walk:'<circle cx="14" cy="4" r="2"/><path d="m7 12 2-4 4 1 3 4h4m-7-4-2 6-4 6m4-6 4 2 1 5"/>',
 cycle:'<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><circle cx="16" cy="3" r="1.5"/><path d="m14 7-4 4 5 3v6m-1-13 3 4h4m-11 0-5 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 arrow:'<path d="M5 19 19 5M5 5h14v14"/>',
 right:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
 flame:'<path d="M13 2c1 6-5 6-3 11 2 0 3-2 3-4 4 3 6 5 6 8a7 7 0 0 1-14 0c0-5 4-8 8-15Z"/>',
 play:'<path d="m8 4 12 8-12 8Z"/>',
 pause:'<path d="M8 4v16m8-16v16"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 brand:'<path d="m4 17 6-10 4 7 6-10M4 21h16"/>',
};
const tones={forest:'#315b46',muted:'#7b8b78',white:'#ffffff',lime:'#d7fbb8'};
await mkdir('design/icons',{recursive:true});await mkdir('apps/web/src/static/icons',{recursive:true});
const browser=await chromium.launch(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{});
try {
 const page=await browser.newPage();
 for(const [name,paths] of Object.entries(icons)) for(const [tone,color] of Object.entries(tones)){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  await writeFile(`design/icons/${name}-${tone}.svg`,svg);
  const base64=await page.evaluate(async svg=>{const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(svg);await img.decode();const canvas=document.createElement('canvas');canvas.width=72;canvas.height=72;canvas.getContext('2d').drawImage(img,0,0,72,72);return canvas.toDataURL('image/png').split(',')[1];},svg);
  await writeFile(`apps/web/src/static/icons/${name}-${tone}.png`,Buffer.from(base64,'base64'));
 }
} finally {await browser.close();}

const upstream=process.argv[2]||'.data/workout-guide-upstream';
const expectedCommit='aac599224bb9780305239607ef98540b7e0ce389';
const commit=execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(commit!==expectedCommit) throw new Error('Use the documented upstream commit before importing assets');
const catalog=JSON.parse(await readFile(join(upstream,'packages/workout-guide/manifest.json'),'utf8'));
const slugs=['running','walking','cycling','push-up','bodyweight-squat','plank','forward-lunge','cat-cow-stretch','childs-pose','cross-body-shoulder-stretch'];
await mkdir('design/workout-guide',{recursive:true});
for(const file of ['LICENSE','LICENSE-ASSETS','LICENSES.md','ATTRIBUTION.md']) await copyFile(join(upstream,file),join('design/workout-guide',file));
const selected=slugs.map(slug=>{const entry=catalog.find(e=>e.slug===slug);if(!entry)throw new Error(slug);return entry;});
await writeFile('design/workout-guide/manifest.json',JSON.stringify({repository:'https://github.com/bryllim/workout-guide',commit,changes:'PNG and SVG files copied without modification; Chinese display labels added separately in application code.',exercises:selected},null,2)+'\n');
for(const entry of selected){
 for(const dir of [`design/workout-guide/source/${entry.slug}`,`apps/web/src/static/exercises/${entry.slug}`])await mkdir(dir,{recursive:true});
 for(let frame=1;frame<=3;frame++){
  await copyFile(join(upstream,`packages/workout-guide/assets/${entry.slug}/frame-${frame}.svg`),`design/workout-guide/source/${entry.slug}/frame-${frame}.svg`);
  await copyFile(join(upstream,`packages/workout-guide/assets/${entry.slug}/frame-${frame}.png`),`apps/web/src/static/exercises/${entry.slug}/frame-${frame}.png`);
 }
}
console.log(`Generated ${Object.keys(icons).length} original icons in four tones; copied ${selected.length*3} exercise frames with attribution.`);
