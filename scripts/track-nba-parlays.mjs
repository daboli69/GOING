// Shares the public dashboard inputs and the existing Pages tracker branch.
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {current as S,dateKey,dateAdd} from '../site/ui.mjs';
import {ESPN,sportPath} from '../site/feeds.mjs';
import {parlayData} from '../site/nba.mjs';
import {captureLegs,finalPlayers,gradeLeg,observeLeg} from '../site/nba-parlay-tracking.mjs';
import {defaults} from '../site/nba-parlay-engine.mjs';

const data=fileURLToPath(new URL('../site/data/',import.meta.url)), out=join(data,'tracker');
const now=Date.parse(process.env.TRACK_NOW||'')||Date.now(), today=dateKey(new Date(now));
const read=name=>readFile(join(data,name),'utf8').then(JSON.parse).catch(()=>null);
const save=(name,value)=>writeFile(join(out,name),JSON.stringify(value));
await mkdir(out,{recursive:true});
const store=new Map(), changed=new Set();
const month=leg=>leg.date.slice(0,7);
for(const file of await readdir(out))if(/^parlay-legs-\d{4}-\d\d\.json$/.test(file)){
  for(const leg of JSON.parse(await readFile(join(out,file),'utf8')))store.set(leg.k,leg);
}

const archives=new Map(), coverage={};
for(const date of [today,dateAdd(today,1)]){
  const year=+date.slice(0,4)+(date.slice(5,7)>='10');
  if(!archives.has(year))archives.set(year,Promise.all([read(`nba-${year}.json`),read(`nba-shots-${year}.json`)]));
  const [[archive,shots],games,odds,alternates,injuries]=await Promise.all([archives.get(year),read(`live/slate-nba-${date}.json`),
    read(`live/odds-nba-${date}.json`),read(`live/nba-alternate-lines-${date}.json`),read('live/injuries-nba.json')]);
  coverage[date]={games:games?.length??null,prices:(alternates??odds)?.length??null,legs:0,archive:!!archive};
  if(!archive||!games?.length||!(alternates?.length||odds?.length))continue;
  Object.assign(S,{route:{sport:'nba'},day:date,data:{...archive,shots:shots||{}},games,odds:odds||[],injuries:injuries||{}});
  const official=parlayData().rows;
  const rows=alternates?.length?parlayData(alternates).rows:official;
  const legs=captureLegs(rows,official,now);
  coverage[date].legs=legs.length;
  for(const leg of legs){observeLeg(store,leg);changed.add(month(leg));}
}

const pending=new Map();
for(const leg of store.values()){
  const age=now-Date.parse(leg.tip);
  if(leg.result||age<2*3600_000)continue;
  const group=pending.get(leg.game)||[];
  group.push(leg);pending.set(leg.game,group);
}
// Retry recent games hourly and rotate older unresolved games through the remaining request budget.
const hour=Math.floor(now/3600_000);
const games=[...pending].filter(([,legs])=>now-Date.parse(legs[0].tip)<7*86400_000||
  Number(legs[0].game.slice(-3))%24===hour%24)
  .sort(([,a],[,b])=>a[0].tip.localeCompare(b[0].tip)).slice(0,32);
for(let i=0;i<games.length;i+=5)await Promise.all(games.slice(i,i+5).map(async ([game,legs])=>{
  if(!/^\d+$/.test(game))return;
  const box=await fetch(`${ESPN}/${sportPath.nba}/summary?event=${game}`,{signal:AbortSignal.timeout(8000)})
    .then(r=>r.ok?r.json():null).catch(()=>null);
  const players=finalPlayers(box,game);
  for(const leg of legs){
    const updated=gradeLeg(leg,players,now);
    if(updated!==leg){store.set(leg.k,updated);changed.add(month(leg));}
  }
}));

const months=new Map();
for(const leg of store.values()){
  const list=months.get(month(leg))||[];
  list.push(leg);months.set(month(leg),list);
}
for(const key of changed)await save(`parlay-legs-${key}.json`,months.get(key).sort((a,b)=>a.tip.localeCompare(b.tip)||a.k.localeCompare(b.k)));
await save('parlay-legs-index.json',{updated:new Date(now).toISOString(),months:[...months.keys()].sort(),
  count:store.size,coverage,filters:defaults});
console.log(`NBA parlay tracker: ${store.size} distinct legs, ${games.length} final box scores checked.`);
