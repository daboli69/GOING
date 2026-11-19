import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {captureTotals,supplementalTotals} from './gta-totals.mjs';
import {loadSources,discover} from './gta-discovery.mjs';
import {gtaDate,gtaStart,gtaEnd} from '../site/gta-event.mjs';

const [mode,dir,output]=process.argv.slice(2);
if(!['capture','replay','supplement'].includes(mode)||!dir||!output)throw Error('Usage: node scripts/gta-capture.mjs capture|replay|supplement PRIVATE_DIR PUBLIC_JSON');
const root=resolve(dir),dest=resolve(output),bundle=join(root,'frozen-inputs.json');
const origin=process.env.GTA_PUBLIC_ORIGIN||'https://goingplaybook.com';
const sources={};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function read(path){
  const url=origin+'/data/'+path+'.json';
  try{
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const raw=await response.text(), value=JSON.parse(raw);
    sources[path]={url,retrievedAt:new Date().toISOString(),sha256:hash(raw),sourceAt:value.updated??value.checked??value.generated_at??null};
    return value;
  }catch(e){
    sources[path]={url,retrievedAt:new Date().toISOString(),error:String(e.message)};
    return null;
  }
}
let data;
if(mode==='capture'){
  const input=await loadSources(read), captured=Date.now();
  if(captured<gtaStart||captured>=gtaEnd)throw Error('Capture is outside the event research window.');
  if(!input.manifest||!input.nbaSlate||!input.nhlSlate||!input.schedule)throw Error('Pregame schedule inputs missing.');
  await mkdir(root,{recursive:true});
  data={input,captured,sources,origin};
  await writeFile(bundle,JSON.stringify(data),{flag:'wx'});
}else{data=JSON.parse(await readFile(bundle,'utf8'));}
const supplementFile=join(root,'frozen-total-inputs.json');
if(mode==='supplement'){
  const sources=await captureTotals(async url=>{
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return null;
    const raw=await response.text(),receivedAt=new Date().toISOString();
    return {url,receivedAt,sha256:hash(raw),value:JSON.parse(raw)};
  });
  await writeFile(supplementFile,JSON.stringify(sources),{flag:'wx'});
}
const supplement=await readFile(supplementFile,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const result=supplementalTotals(discover(data.input,data.captured),data.input,supplement);
const snapshot={...result,missing:Object.entries(data.sources).filter(([,v])=>v.error).map(([s])=>s),inputs:hash(JSON.stringify([data.sources,Object.fromEntries(Object.entries(supplement||{}).map(([s,f])=>[s,f?.sha256]))]))};
if(snapshot.date!==gtaDate||!snapshot.rows.length)throw Error('No eligible snapshot offers.');
await mkdir(dirname(dest),{recursive:true});
const temp=dest+'.tmp';
await writeFile(temp,JSON.stringify(snapshot));
await rename(temp,dest);
console.log(snapshot.frozenAt,snapshot.rows.length,JSON.stringify(snapshot.coverage));
console.log(Object.fromEntries(['supported','sensitive','unsupported'].map(c=>[c,snapshot.rows.filter(r=>r.classification===c).length])));
