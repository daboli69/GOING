// First basket calibration log (GOING UP 1st Basket page). Each hourly run saves the board's probabilities for every
// game that has not tipped yet (the last pregame save is the one that counts), then grades past games with the
// archive's first scorer, which counts free throws like the market does. Files live on the tracker branch.
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {current as S,dateKey} from '../site/ui.mjs';
import {routes} from '../site/config.mjs';
import {firstBasketBoard} from '../site/nba.mjs';

const data=fileURLToPath(new URL('../site/data/',import.meta.url)), out=join(data,'tracker');
const now=Date.parse(process.env.TRACK_NOW||'')||Date.now(), today=dateKey(new Date(now));
const read=name=>readFile(join(data,name),'utf8').then(JSON.parse).catch(()=>null);
await mkdir(out,{recursive:true});
const store=new Map(), changed=new Set(), month=x=>x.date.slice(0,7);
for(const file of await readdir(out))if(/^first-basket-\d{4}-\d\d\.json$/.test(file))
  for(const x of JSON.parse(await readFile(join(out,file),'utf8')))store.set(x.game,x);

const year=+today.slice(0,4)+(today.slice(5,7)>='10');
const [archive,shots,games,odds,injuries]=await Promise.all([read(`nba-${year}.json`),read(`nba-shots-${year}.json`),
  read(`live/slate-nba-${today}.json`),read(`live/odds-nba-${today}.json`),read('live/injuries-nba.json')]);
let saved=0;
if(archive&&games?.length){
  Object.assign(S,{route:routes.find(r=>r.id==='basket'),day:today,hoops:year,data:{...archive,shots:shots||{}},games,odds:odds||[],injuries:injuries||{},f:{}});
  for(const x of firstBasketBoard().games){
    const {g,tf}=x;
    if(!['FUT','PRE'].includes(g.status)||!(Date.parse(g.iso)>now))continue;
    const prior=store.get(String(g.id));
    if(prior?.actual!==undefined)continue;
    store.set(String(g.id),{game:String(g.id),date:today,tip:g.iso,a:g.a,h:g.h,capturedAt:new Date(now).toISOString(),
      teamFirst:{[g.a]:+tf.first[g.a].toFixed(4),[g.h]:+tf.first[g.h].toFixed(4)},sum:+x.sum.toFixed(4),
      players:x.rows.map(r=>[r.p.id,r.p.name,r.team,+r.prob.toFixed(4)])});
    changed.add(today.slice(0,7));saved++;
  }
}
// Grade: the archive's first scorer (free throws included) once the game is in the archive.
let graded=0;
for(const x of store.values()){
  if(x.actual!==undefined||now-Date.parse(x.tip)<3*3600_000)continue;
  const z=archive?.first?.[x.game];
  if(!z?.firstPts)continue;
  x.actual=z.firstPts;x.actualTeam=z.poss?.find(p=>p[1]>0)?.[0]||null;x.graded=new Date(now).toISOString();
  changed.add(month(x));graded++;
}
// Backtest: replay every past night with only the data available before it (starters projected from each team's
// previous game, no injury report), so calibration has a first read before 100 live game-nights exist.
if(archive){
  const days=[...new Set(Object.values(archive.tg||{}).flatMap(rows=>rows.map(r=>r[1])))].filter(d=>d<today).sort();
  const backtest=[];
  for(const day of days){
    const slate=new Map();
    for(const [t,rows] of Object.entries(archive.tg))for(const r of rows)if(r[1]===day){
      const x=slate.get(r[0])||{id:r[0],iso:day+'T23:00Z',status:'FUT'};x[r[3]==='home'?'h':'a']=t;slate.set(r[0],x);
    }
    Object.assign(S,{route:routes.find(r=>r.id==='basket'),day,hoops:year,data:{...archive,shots:shots||{}},games:[...slate.values()].filter(g=>g.a&&g.h),odds:[],injuries:{},f:{}});
    for(const x of firstBasketBoard().games){
      const z=archive.first?.[x.g.id];
      if(!z?.firstPts)continue;
      backtest.push({game:x.g.id,date:day,a:x.g.a,h:x.g.h,sum:+x.sum.toFixed(4),players:x.rows.map(r=>[r.p.id,r.p.name,r.team,+r.prob.toFixed(4)]),
        actual:z.firstPts,actualTeam:z.poss?.find(p=>p[1]>0)?.[0]||null});
    }
  }
  await writeFile(join(out,'first-basket-backtest.json'),JSON.stringify({updated:new Date(now).toISOString(),games:backtest}));
  console.log(`First basket backtest: ${backtest.length} games over ${new Set(backtest.map(x=>x.date)).size} nights.`);
}
const months=new Map();
for(const x of store.values()){const l=months.get(month(x))||[];l.push(x);months.set(month(x),l);}
for(const key of changed)await writeFile(join(out,`first-basket-${key}.json`),JSON.stringify(months.get(key).sort((a,b)=>a.tip.localeCompare(b.tip))));
await writeFile(join(out,'first-basket-index.json'),JSON.stringify({updated:new Date(now).toISOString(),months:[...months.keys()].sort(),count:store.size}));
console.log(`First basket log: ${store.size} games, ${saved} saved before tip, ${graded} newly graded.`);
