// Pick tracker: capture every pick the site shows before games start, then grade it against final results.
// Runs after scripts/live.mjs in the hourly workflow. Reads site/data, writes site/data/tracker/.
//
// Prop picks are collected by rendering each tool with the dashboard's own code and reading the plays it
// offers (the same objects My Plays saves), so a tool is tracked exactly as it appears on the site.
// Model picks come from the published ensemble feeds. Grading reuses each sport's result function.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { current as S } from '../site/ui.mjs';
import { routes, viewSetup } from '../site/config.mjs';
import { nflPage, nflResult } from '../site/nfl.mjs';
import { nbaPage, nbaResult } from '../site/nba.mjs';
import { nhlPage, nhlResult } from '../site/nhl.mjs';
import { outcome, leanOf } from '../site/track-core.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const data=join(root,'site','data'), out=join(data,'tracker');
const now=Date.now(), nowIso=new Date(now).toISOString();
const dayKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const today=dayKey(new Date(now));
const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const read=name=>readFile(join(data,name),'utf8').then(JSON.parse).catch(()=>null);
const seasonFor=(s,d)=>{const y=+d.slice(0,4),m=d.slice(5,7);return s==='nba'?y+(m>='10'):y-(m<(s==='nfl'?'09':'10'));};
// Eastern wall-clock time to UTC, accounting for daylight saving on that date.
function etToIso(date,time='13:00'){
  const guess=Date.parse(`${date}T${time}:00Z`);
  const shown=new Date(new Date(guess).toLocaleString('en-US',{timeZone:'America/New_York'})+' UTC').getTime();
  return new Date(guess+(guess-shown)).toISOString();
}
const unescape=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const harvest=html=>[...html.matchAll(/data-play="([^"]*)"/g)].map(m=>{try{return JSON.parse(unescape(m[1]));}catch{return null;}}).filter(Boolean);

/* ---------- archives ---------- */
const archives={};
function archive(s,y){
  const k=s+y;
  if(!archives[k])archives[k]=(async()=>{
    if(s==='nfl'){const [x,schedule]=await Promise.all([read(`nfl-${y}.json`),read('nfl-schedule.json')]);return x&&{...x,schedule:schedule||[]};}
    if(s==='nba'){const [x,shots]=await Promise.all([read(`nba-${y}.json`),read(`nba-shots-${y}.json`)]);return x&&{...x,shots:shots||{}};}
    const t=''+y+(y+1);const [x,shots]=await Promise.all([read(`nhl-${t}.json`),read(`nhl-shots-${t}.json`)]);return x&&{...x,shots:shots||{}};
  })();
  return archives[k];
}

/* ---------- existing record ---------- */
const store=new Map();
await mkdir(out,{recursive:true});
for(const f of await readdir(out).catch(()=>[]))if(/^picks-\d{4}-\d\d\.json$/.test(f))
  for(const p of JSON.parse(await readFile(join(out,f),'utf8')))store.set(p.k,p);
const before=store.size;

/* ---------- capture ---------- */
const seen=new Set(), scope=new Set();
const pages={nfl:nflPage,nba:nbaPage,nhl:nhlPage};
function upsert(rec){
  const old=store.get(rec.k);
  if(old&&(old.result||Date.parse(old.start)<=now))return;
  if(seen.has(rec.k)){const cur=store.get(rec.k);Object.assign(cur.tools,rec.tools);return;}
  seen.add(rec.k);
  store.set(rec.k,{...rec,at:nowIso});
}
function render(sport,id,title,f={},hash=''){
  const r=routes.find(x=>x.sport===sport&&x.id===id&&(!title||x.title===title));
  S.route=r;S.f={...viewSetup(r,hash),...f};S.sort=null;
  try{return harvest(pages[sport]());}catch(e){console.warn(`Could not render ${sport} ${id} ${title||''}: ${e.message}`);return [];}
}
function record(sport,tool,play,games){
  const g=games.get(String(play.game));
  if(!g||play.line==null||play.id==null||Date.parse(g.start)<=now)return;
  const k=[sport,play.date,play.game,play.id,play.market,play.side].join('|');
  const meta={prob:play.prob??null,edge:play.edge??null,rating:play.rating&&play.rating!=='—'?play.rating:null};
  meta.lean=tool.endsWith('-best')?true:leanOf({...meta,odds:play.odds,proj:play.projection,avg:play.average,line:+play.line,side:play.side});
  upsert({k,sport,kind:'prop',date:play.date,game:String(play.game),a:g.a,h:g.h,start:g.start,id:String(play.id),player:String(play.title||'').split(' · ')[0],
    team:play.team,market:play.market,side:play.side||'Over',line:+play.line,odds:play.odds??null,provider:play.provider??null,
    proj:play.projection??null,avg:play.average??null,tools:{[tool]:meta}});
}
async function setDay(s,d){
  const year=seasonFor(s,d),[arch,slate,odds,injuries,lineups]=await Promise.all([archive(s,year),read(`live/slate-${s}-${d}.json`),read(`live/odds-${s}-${d}.json`),
    read(`live/injuries-${s}.json`),s==='nhl'?read(`live/nhl-lineups-${d}.json`):null]);
  if(!arch||!slate?.length)return null;
  Object.assign(S,{day:d,today,data:arch,odds:odds||[],injuries:injuries||{},lineups:lineups||{},games:slate,game:slate[0]});
  if(s==='nba')S.hoops=year;else S.ice=year;
  const games=new Map(slate.filter(g=>['FUT','PRE'].includes(g.status)&&Date.parse(g.iso)>now).map(g=>[String(g.id),{...g,start:g.iso}]));
  for(const id of games.keys())scope.add(s+'|'+id);
  return games;
}
for(const d of [today,add(today,1)]){
  let games=await setDay('nba',d);
  if(games?.size)for(const p of render('nba','nba-props','All Props'))record('nba','nba-props',p,games);
  games=await setDay('nhl',d);
  if(games?.size)for(const [title,tool] of [['Best Plays','nhl-best'],['Shots','nhl-shots'],['Goals','nhl-goals'],['Points','nhl-points'],['Saves','nhl-saves']])
    for(const p of render('nhl','nhl-props',title))record('nhl',tool,p,games);
}
{ // NFL: the week of the next unplayed game.
  const schedule=await read('nfl-schedule.json')||[];
  const next=schedule.filter(g=>g.sa==null&&g.date>=today).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
  const year=next?+next.id.slice(0,4):null, arch=year&&await archive('nfl',year);
  if(arch){
    const week=schedule.filter(g=>+g.id.slice(0,4)===year&&g.week===next.week).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    Object.assign(S,{year,week:next.week,day:today,today,data:arch,odds:await read('live/odds-nfl.json')||[],injuries:await read('live/injuries-nfl.json')||{},games:week});
    const games=new Map(week.map(g=>[String(g.id),{...g,start:etToIso(g.date,g.time)}]).filter(([,g])=>Date.parse(g.start)>now));
    for(const id of games.keys())scope.add('nfl|'+id);
    S.game=week[0];
    for(const view of ['Receiving','Rushing','Passing','Anytime TD','First TD'])for(const p of render('nfl','nfl-best',null,{view}))record('nfl','nfl-best',p,games);
    for(const g of week){
      if(!games.has(String(g.id)))continue;
      S.game=g;
      for(const [view,hash] of [['Receiving','#receiving'],['Rushing','#rushing'],['Passing','#passing']])
        for(const p of render('nfl','nfl-props',view,{away:g.a,home:g.h},hash))record('nfl','nfl-props',p,games);
      for(const p of render('nfl','td',null,{away:g.a,home:g.h}))record('nfl','nfl-td',p,games);
    }
  }
}

/* ---------- model picks ---------- */
function modelPick(sport,tool,key,{game,date,a,h,start,pHome,odds}){
  if(pHome==null||Date.parse(start)<=now)return;
  const side=pHome>=.5?h:a,prob=pHome>=.5?pHome:1-pHome;
  upsert({k:['model',sport,game,key].join('|'),sport,kind:'model',date,game:String(game),a,h,start,id:key,player:null,team:side,
    market:'Winner',side,line:null,odds:odds?.[side]??null,provider:odds?.[side]!=null?'Market at forecast':null,proj:null,avg:null,tools:{[tool]:{prob,edge:null,rating:null,lean:true}}});
  scope.add(sport+'|'+game);
}
const nflFeed=await read('models/nfl.json');
for(const g of nflFeed?.games||[]){
  const fc=g.forecast;if(!fc?.champion)continue;
  const m=g.market?.at_forecast,odds=m?{[g.home_team]:m.home_moneyline,[g.away_team]:m.away_moneyline}:null;
  const base={game:g.game_id,date:dayKey(new Date(g.kickoff_utc)),a:g.away_team,h:g.home_team,start:g.kickoff_utc,odds};
  modelPick('nfl','nfl-model','champion',{...base,pHome:fc.champion.p_home});
  for(const x of fc.models||[])modelPick('nfl','nfl-model:'+x.label,x.key,{...base,pHome:x.p_home});
}
const nbaFeed=await read('models/nba.json');
for(const [d,rows] of Object.entries(nbaFeed?.days||{}))for(const r of rows){
  const det=nbaFeed.games?.[r.gid],base={game:r.gid,date:d,a:r.away,h:r.home,start:r.tipoff_utc};
  modelPick('nba','nba-model','combined',{...base,pHome:r.p_home});
  for(const x of det?.models||[])modelPick('nba','nba-model:'+x.name,x.name,{...base,pHome:x.p_home});
}

// A line that disappeared before its game started was not available to bet; drop it.
let dropped=0;
for(const [k,p] of store)if(!p.result&&Date.parse(p.start)>now&&scope.has(p.sport+'|'+p.game)&&!seen.has(k)&&p.kind==='prop'){store.delete(k);dropped++;}

/* ---------- grading ---------- */
const finals=new Map();
const fin=(s,id,a,h)=>{if(a!=null&&h!=null)finals.set(s+'|'+id,{a:+a,h:+h});};
for(const g of nflFeed?.games||[])if(g.final_score)fin('nfl',g.game_id,g.final_score.away,g.final_score.home);
for(const g of await read('nfl-schedule.json')||[])fin('nfl',g.id,g.sa,g.sh);
for(const rows of Object.values(nbaFeed?.days||{}))for(const r of rows)if(r.completed)fin('nba',r.gid,r.away_score,r.home_score);
for(const f of await readdir(join(data,'live')).catch(()=>[])){
  const m=f.match(/^slate-(nba|nhl)-/);if(!m)continue;
  for(const g of await read('live/'+f)||[])if(['FINAL','OFF'].includes(g.status))fin(m[1],g.id,g.sa,g.sh);
}
const results={nfl:nflResult,nba:nbaResult,nhl:nhlResult};
let graded=0;
for(const p of store.values()){
  if(p.result||Date.parse(p.start)>now-2*3600_000)continue;
  let value=null;
  if(p.kind==='model'){
    const f=finals.get(p.sport+'|'+p.game);
    if(f){value=f.a===f.h?null:(f.h>f.a?p.h:p.a);p.value=value?`${p.a} ${f.a}, ${p.h} ${f.h}`:'Tie';p.result=value==null?'push':value===p.side?'won':'lost';}
  }else{
    const arch=await archive(p.sport,seasonFor(p.sport,p.date));
    if(arch){S.data=arch;S.route={sport:p.sport};try{value=results[p.sport]({...p,game:p.game});}catch{value=null;}}
    if(value!=null){p.value=value;p.result=outcome(+value,p.line,p.side);}
  }
  if(p.result){p.graded=nowIso;graded++;}
  else if(Date.parse(p.start)<now-4*86400_000){p.result='void';p.graded=nowIso;}  // no result after four days: did not play or no data
}

/* ---------- write ---------- */
const months={};
for(const p of store.values())(months[p.date.slice(0,7)]??=[]).push(p);
for(const [m,list] of Object.entries(months)){
  list.sort((a,b)=>a.start.localeCompare(b.start)||a.k.localeCompare(b.k));
  await writeFile(join(out,`picks-${m}.json`),JSON.stringify(list));
}
const all=[...store.values()];
await writeFile(join(out,'index.json'),JSON.stringify({updated:nowIso,months:Object.keys(months).sort(),
  picks:all.length,pending:all.filter(p=>!p.result).length,graded:all.filter(p=>p.result&&p.result!=='void').length}));
console.log(`Tracker: ${store.size} picks (${store.size-before>=0?'+':''}${store.size-before}), ${seen.size} captured this run, ${dropped} pulled lines dropped, ${graded} newly graded.`);
