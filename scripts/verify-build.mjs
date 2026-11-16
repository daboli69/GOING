import {access,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {routes} from '../site/config.mjs';
import {readPublicJson} from './watch-delivery.mjs';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const trackFiles={'index':'picks','parlay-legs-index':'parlay-legs','nfl-parlay-legs-index':'nfl-parlay-legs',
  'first-basket-index':'first-basket','td-board-index':'td-board'};
const timestamp=x=>Number.isFinite(Date.parse(x));
export function manifestProblem(local,previous,now=Date.now()){
  if(!timestamp(local?.updated)||!Array.isArray(local?.missing)||Date.parse(local.updated)>now+120000)
    return 'The live snapshot has an invalid timestamp or shape.';
  if(timestamp(previous?.updated)&&Date.parse(local.updated)<Date.parse(previous.updated))
    return 'The deployment would replace a newer public live snapshot.';
  return null;
}

export async function verifyArtifact(dir,{previous,priorModels,now=Date.now()}={}){
  const errors=[], assets=new Set();
  const read=async file=>{
    try{return await readFile(join(dir,file),'utf8');}
    catch{errors.push('Missing '+file);return null;}
  };
  const json=async file=>{
    const text=await read(file);
    if(text==null)return null;
    try{return JSON.parse(text);}catch{errors.push('Invalid JSON in '+file);return null;}
  };
  const htmlPaths=new Set(routes.map(r=>r.path.split('#')[0].replace(/(^|\/)$/,'$1index.html')));
  for(const path of htmlPaths){
    const text=await read(path);
    if(text==null)continue;
    const app=text.match(/src="(app\.mjs\?v=[a-f0-9]{10})"/)?.[1], css=text.match(/href="(style\.css\?v=[a-f0-9]{10})"/)?.[1];
    if(!app||!css||app.split('=')[1]!==css.split('=')[1]){
      errors.push('Inconsistent application bundle in '+path);
      continue;
    }
    assets.add('app.mjs');assets.add('style.css');
    for(const [,file,version] of text.matchAll(/rel="modulepreload" href="([\w.-]+\.mjs)\?v=([a-f0-9]+)"/g)){
      if(version!==app.split('=')[1])errors.push('Asset version mismatch for '+file+' in '+path);
      assets.add(file);
    }
  }
  for(const file of assets)await access(join(dir,file)).catch(()=>errors.push('Bundle references missing '+file));
  const [live,archive,health]=await Promise.all(['data/live/manifest.json','data/archive.json','data/health.json'].map(json));
  const problem=manifestProblem(live,previous,now);
  if(problem)errors.push(problem);
  if(!timestamp(archive?.updated))errors.push('The season archive has no valid timestamp.');
  if(!timestamp(health?.checked)||!Array.isArray(health?.problems))errors.push('The health report is incomplete.');
  if(priorModels?.nfl||priorModels?.nba){
    const [summary,nfl,nba]=await Promise.all(['summary','nfl','nba'].map(key=>json('data/models/'+key+'.json')));
    if(!Object.hasOwn(nfl||{},'games')||!Object.hasOwn(nba||{},'days')||!summary?.nfl||!summary?.nba)
      errors.push('This build would remove an existing ensemble forecast feed.');
  }

  for(const [index,prefix] of Object.entries(trackFiles)){
    const path='data/tracker/'+index+'.json';
    const info=await json(path), count=info?.count??info?.picks;
    if(!timestamp(info?.updated)||!Number.isInteger(count)||count<0||!Array.isArray(info?.months)||
      new Set(info.months).size!==info.months.length||info.months.some(m=>!/^\d{4}-\d\d$/.test(m))){
      errors.push('Invalid tracker index in '+path);
      continue;
    }
    let rows=0;
    for(const m of info.months){
      const file='data/tracker/'+prefix+'-'+m+'.json', records=await json(file);
      if(!Array.isArray(records))errors.push('Invalid tracker records in '+file);
      else rows+=records.length;
    }
    if(rows!==count)errors.push('Tracker count mismatch in '+path);
  }
  return errors;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const [previous,priorModels]=await Promise.all(['/data/live/manifest.json','/data/models/summary.json'].map(path=>readPublicJson(path)));
  const errors=await verifyArtifact(root,{previous,priorModels});
  if(errors.length){
    for(const problem of errors)console.error(problem);
    process.exitCode=1;
  }else console.log('Pages routes, bundle versions, feed timestamps and tracker datasets verified.');
}
