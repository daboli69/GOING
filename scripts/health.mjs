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

// Count only unresolved records from confirmed finals. Give each source time to publish stats.
export function confirmedBacklog(rows,confirmed,now=Date.now()){
  const old=rows.filter(row=>{
    const age=now-Date.parse(row.start||row.tip);
    return confirmed(row)&&age>=8*3600000&&age<7*86400000;
  });
  return {count:old.length,games:new Set(old.map(row=>row.game)).size};
}

// An advancing tracker timestamp does not prove that finished games are being graded.
export function healthProblems({live,archive,college,ufc,tracker,parlays,nflParlays,firstBasket,tdBoard},now=Date.now()){
  const h=iso=>{
    const elapsed=now-Date.parse(iso);
    return Number.isFinite(elapsed)&&elapsed>=-120000?Math.max(0,elapsed)/3600000:Infinity;
  }, problems=[];
  const stale=(name,iso,limit)=>{const x=h(iso);if(!(x<=limit))problems.push({key:name,text:`${name}: ${Number.isFinite(x)?'last updated '+age(x)+' ago':'no update found'} (limit ${limit} h)`});};
  stale('Live slates, injuries and prices',live?.updated,3);
  for(const m of live?.missing||[])problems.push({key:'live:'+m,text:`Live snapshot is missing ${m}`});
  stale('Season archives (NFL, NBA, NHL)',archive?.updated,30);
  for(const s of ['cbb','cwb','fbs'])stale(`College ${s.toUpperCase()} feed`,college?.[s]?.available===false?null:college?.[s]?.updated,3);
  if(ufc!==undefined)stale('UFC card feed',ufc?.updated,3);
  stale('Pick tracker',tracker?.updated,3);
  stale('NBA parlay leg tracker',parlays?.updated,3);
  if(nflParlays!==undefined)stale('NFL parlay leg tracker',nflParlays?.updated,3);
  if(firstBasket!==undefined)stale('First basket log',firstBasket?.updated,3);
  if(tdBoard!==undefined)stale('TD Board log',tdBoard?.updated,3);
  for(const [label,index,minimum] of [['Pick tracker',tracker,5],['NFL parlay leg tracker',nflParlays,5],['TD Board log',tdBoard,1]]){
    const backlog=index?.gradingBacklog;
    if(backlog?.count>=minimum)problems.push({key:'grading:'+label,
      text:label+': '+backlog.count+' unresolved records across '+backlog.games+' confirmed final games started at least eight hours ago'});
  }
  return problems;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [live,archive,college,ufc,tracker,parlays,nflParlays,firstBasket,tdBoard]=await Promise.all(['live/manifest.json','archive.json','college/summary.json','fights/summary.json',
    'tracker/index.json','tracker/parlay-legs-index.json','tracker/nfl-parlay-legs-index.json','tracker/first-basket-index.json','tracker/td-board-index.json'].map(read));
  const problems=healthProblems({live,archive,college,ufc,tracker,parlays,nflParlays,firstBasket,tdBoard});
  await writeFile(join(data,'health.json'),JSON.stringify({checked:new Date().toISOString(),problems:problems.map(p=>p.text),keys:problems.map(p=>p.key)}));
  console.log(problems.length?'Feed problems:\n- '+problems.map(p=>p.text).join('\n- '):'All feeds are fresh.');
  for(const [name,iso] of [['live',live?.updated],['archives',archive?.updated],['college',college?.cbb?.updated],['tracker',tracker?.updated]])
    console.log(`  ${name}: ${age(hours(iso))} old`);
}
