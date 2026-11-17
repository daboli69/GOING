// Shares the public dashboard inputs and the existing Pages tracker branch.
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {current as S,dateKey,dateAdd} from '../site/ui.mjs';
import {loadNbaFinals} from './nba-finals.mjs';
import {parlayData} from '../site/nba.mjs';
import {captureLegs,reconcileNbaParlayLeg,observeLeg} from '../site/nba-parlay-tracking.mjs';
import {confirmedBacklog} from './health.mjs';
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
  const [[archive,shots],games,main,alternates,injuries]=await Promise.all([archives.get(year),read(`live/slate-nba-${date}.json`),
    read(`live/nba-main-lines-${date}.json`),read(`live/nba-alternate-lines-${date}.json`),read('live/injuries-nba.json')]);
  coverage[date]={games:games?.length??null,prices:(main||alternates)?(main?.length||0)+(alternates?.length||0):null,legs:0,archive:!!archive};
  if(!archive||!games?.length||!(main?.length||alternates?.length))continue;
  Object.assign(S,{route:{sport:'nba'},day:date,data:{...archive,shots:shots||{}},games,odds:main||[],injuries:injuries||{}});
  const official=parlayData().rows;
  const legs=[...captureLegs(official,official,now),...captureLegs(alternates?.length?parlayData(alternates).rows:[],[],now)];
  coverage[date].legs=legs.length;
  for(const leg of legs){observeLeg(store,leg);changed.add(month(leg));}
}

const hourMs=3600000, weekMs=7*24*hourMs;
const previous=await read('tracker/parlay-legs-index.json');
const checks={}, candidates=new Map();
for(const leg of store.values()){
  const tip=Date.parse(leg.tip), age=now-tip;
  if(!Number.isFinite(age)||age<2*hourMs)continue;
  if(age<weekMs&&previous?.finalChecks?.[leg.game])checks[leg.game]=previous.finalChecks[leg.game];
  if(age>=weekMs&&(leg.result||Number(leg.game.slice(-3))%24!==Math.floor(now/hourMs)%24))continue;
  const group=candidates.get(leg.game)||[];
  group.push(leg);
  candidates.set(leg.game,group);
}
// Give recent games a fresh box score at least hourly as capacity permits. Serve never-checked games first.
const games=[...candidates].filter(([game])=>now-(checks[game]?.checkedAt??0)>=hourMs)
  .sort(([a],[b])=>(checks[a]?.checkedAt??0)-(checks[b]?.checkedAt??0)).slice(0,32);
const finals=await loadNbaFinals(games.map(([game])=>game),{refresh:true});
for(const [game,legs] of games){
  const box=finals.get(game);
  if(now-Date.parse(legs[0].tip)<weekMs)checks[game]={checkedAt:now,confirmed:!!box||!!checks[game]?.confirmed};
  for(const leg of legs){
    const updated=reconcileNbaParlayLeg(leg,box,now);
    if(updated!==leg){store.set(leg.k,updated);changed.add(month(leg));}
  }
}
const gradingBacklog=confirmedBacklog([...store.values()],leg=>!leg.result&&checks[leg.game]?.confirmed,now);

const months=new Map();
for(const leg of store.values()){
  const list=months.get(month(leg))||[];
  list.push(leg);months.set(month(leg),list);
}
for(const key of changed)await save(`parlay-legs-${key}.json`,months.get(key).sort((a,b)=>a.tip.localeCompare(b.tip)||a.k.localeCompare(b.k)));
await save('parlay-legs-index.json',{updated:new Date(now).toISOString(),months:[...months.keys()].sort(),
  count:store.size,coverage,filters:defaults,finalChecks:checks,gradingBacklog});
console.log(`NBA parlay tracker: ${store.size} distinct legs, ${games.length} final box scores checked.`);
