// Checks how fresh every published feed is after a refresh run. The refresh steps keep deploying the last good data when a
// source fails, so without this a dead feed could go unnoticed for days. Writes site/data/health.json, prints a summary,
// and exits 0 either way; the workflow turns problems into a GitHub issue (and closes it once everything is fresh again).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const data=fileURLToPath(new URL('../site/data/',import.meta.url));
const read=p=>readFile(join(data,p),'utf8').then(JSON.parse).catch(()=>null);
const hours=iso=>iso?(Date.now()-Date.parse(iso))/3600000:Infinity;
const age=h=>!Number.isFinite(h)?'never':h<2?Math.round(h*60)+' min':h<48?Math.round(h)+' h':Math.round(h/24)+' days';

// How old each feed may get before it counts as a problem. Hourly feeds get a few missed runs of slack.
export function healthProblems({live,archive,college,tracker,parlays,nflParlays,firstBasket},now=Date.now()){
  const h=iso=>iso?(now-Date.parse(iso))/3600000:Infinity, problems=[];
  const stale=(name,iso,limit)=>{const x=h(iso);if(!(x<=limit))problems.push({key:name,text:`${name}: ${Number.isFinite(x)?'last updated '+age(x)+' ago':'no update found'} (limit ${limit} h)`});};
  stale('Live slates, injuries and prices',live?.updated,3);
  for(const m of live?.missing||[])problems.push({key:'live:'+m,text:`Live snapshot is missing ${m}`});
  stale('Season archives (NFL, NBA, NHL)',archive?.updated,30);
  for(const s of ['cbb','cwb','fbs'])if(college?.[s]?.available!==false)stale(`College ${s.toUpperCase()} feed`,college?.[s]?.updated,3);
  stale('Pick tracker',tracker?.updated,3);
  stale('NBA parlay leg tracker',parlays?.updated,3);
  if(nflParlays!==undefined)stale('NFL parlay leg tracker',nflParlays?.updated,3);
  if(firstBasket!==undefined)stale('First basket log',firstBasket?.updated,3);
  return problems;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [live,archive,college,tracker,parlays,nflParlays,firstBasket]=await Promise.all(['live/manifest.json','archive.json','college/summary.json',
    'tracker/index.json','tracker/parlay-legs-index.json','tracker/nfl-parlay-legs-index.json','tracker/first-basket-index.json'].map(read));
  const problems=healthProblems({live,archive,college,tracker,parlays,nflParlays,firstBasket});
  await writeFile(join(data,'health.json'),JSON.stringify({checked:new Date().toISOString(),problems:problems.map(p=>p.text),keys:problems.map(p=>p.key)}));
  console.log(problems.length?'Feed problems:\n- '+problems.map(p=>p.text).join('\n- '):'All feeds are fresh.');
  for(const [name,iso] of [['live',live?.updated],['archives',archive?.updated],['college',college?.cbb?.updated],['tracker',tracker?.updated]])
    console.log(`  ${name}: ${age(hours(iso))} old`);
}
