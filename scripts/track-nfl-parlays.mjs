// GOING LONG leg tracker: each hourly run screens every priced NFL prop with the Suggested Parlays engine, keeps its last
// pregame observation, and grades it once the play-by-play for its game is published. Files live on the tracker branch.
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {current as S,dateKey} from '../site/ui.mjs';
import {routes} from '../site/config.mjs';
import {nflParlayData} from '../site/nfl.mjs';
import {captureLegs,gradeLeg} from '../site/nfl-parlay-tracking.mjs';
import {observeLeg} from '../site/nba-parlay-tracking.mjs';
import {defaults} from '../site/nfl-parlay-engine.mjs';
import {loadNflFinals,nflBoxGrade} from './nfl-finals.mjs';
import {loadTdContracts,neededTdContracts,tdGrade} from './nfl-td-settlement.mjs';

const data=fileURLToPath(new URL('../site/data/',import.meta.url)), out=join(data,'tracker');
const now=Date.parse(process.env.TRACK_NOW||'')||Date.now(), today=dateKey(new Date(now));
const read=name=>readFile(join(data,name),'utf8').then(JSON.parse).catch(()=>null);
const save=(name,value)=>writeFile(join(out,name),JSON.stringify(value));
await mkdir(out,{recursive:true});
const store=new Map(), changed=new Set();
const month=leg=>leg.date.slice(0,7);
for(const file of await readdir(out))if(/^nfl-parlay-legs-\d{4}-\d\d\.json$/.test(file)){
  for(const leg of JSON.parse(await readFile(join(out,file),'utf8')))store.set(leg.k,leg);
}

const year=+today.slice(0,4)-(today.slice(5,7)<'09');
const [schedule,archive,extra,weather,injuries,odds,models,availability,projections]=await Promise.all([read('nfl-schedule.json'),read(`nfl-${year}.json`),
  read(`nfl-extra-${year}.json`),read('live/weather-nfl.json'),read('live/injuries-nfl.json'),read('live/odds-nfl.json'),read('models/nfl.json'),
  read('live/nfl-availability.json'),read('live/nfl-projections.json')]);
const season=(schedule||[]).filter(g=>+g.id.slice(0,4)===year);
const next=season.filter(g=>g.date>=today&&g.sa==null).sort((a,b)=>a.date.localeCompare(b.date))[0];
const coverage={};
if(next&&archive){
  const games=season.filter(g=>g.week===next.week);
  Object.assign(S,{route:routes.find(r=>r.id==='nfl-parlays'),year,week:next.week,games,data:{...archive,schedule},extra,weather,
    injuries:availability?.teams&&Object.keys(availability.teams).length?availability.teams:injuries||{},
    nflAvailability:availability,nflProjections:projections,nflAsOf:now,odds:odds||[],models,f:{}});
  const legs=captureLegs(nflParlayData().rows,now);
  coverage['Week '+next.week]={games:games.length,prices:odds?.length??null,legs:legs.length,archive:true};
  for(const leg of legs){observeLeg(store,leg);changed.add(month(leg));}
}else coverage[next?'Week '+next.week:'No upcoming week']={games:next?season.filter(g=>g.week===next.week).length:0,prices:odds?.length??null,legs:0,archive:!!archive};

// Settle official box-score markets while the detailed play-by-play is still pending.
const byGame=new Map((schedule||[]).map(g=>[g.id,g]));
const due=r=>{const age=now-Date.parse(r.tip);return !r.result&&age>=2.5*3600_000&&age<=6*86400_000;};
const [boxes,tdDone]=await Promise.all([
  loadNflFinals(schedule||[],new Set([...store.values()].filter(r=>due(r)&&
    (!archive?.events?.[r.game]?.length||byGame.get(r.game)?.sa==null)).map(r=>r.game))),
  loadTdContracts(schedule||[],neededTdContracts(store.values(),now))]);
let graded=0;
for(const leg of store.values()){
  if(leg.result||now-Date.parse(leg.tip)<2.5*3600_000)continue;
  const g=byGame.get(leg.game), events=archive?.events?.[leg.game];
  const exact=tdGrade(tdDone,{...leg,player:leg.name,market:leg.stat},now);
  const prior=exact?{...leg,...exact}:gradeLeg(leg,g,events,extra?.snaps?.[leg.game]?.[leg.team],now);
  const fromBox=prior===leg?nflBoxGrade(boxes.get(leg.game),{...leg,player:leg.name,market:leg.stat},now):null;
  const updated=fromBox?{...leg,...fromBox}:prior;
  if(updated!==leg){store.set(leg.k,updated);changed.add(month(leg));graded++;}
}

const months=new Map();
for(const leg of store.values()){
  const list=months.get(month(leg))||[];
  list.push(leg);months.set(month(leg),list);
}
for(const key of changed)await save(`nfl-parlay-legs-${key}.json`,months.get(key).sort((a,b)=>a.tip.localeCompare(b.tip)||a.k.localeCompare(b.k)));
await save('nfl-parlay-legs-index.json',{updated:new Date(now).toISOString(),months:[...months.keys()].sort(),
  count:store.size,coverage,filters:defaults});
console.log(`NFL parlay tracker: ${store.size} distinct legs, ${graded} newly graded.`);
