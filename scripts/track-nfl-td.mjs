// TD Board calibration log (GOING LONG). Each hourly run saves the board for every game that has not kicked off (the
// last pregame save counts), grades finished games from the play-by-play, and replays earlier weeks as a backtest.
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {current as S,dateKey} from '../site/ui.mjs';
import {nflTdSweepstakesGame,routes,viewDefaults} from '../site/config.mjs';
import {tdBoardData} from '../site/nfl.mjs';
import {offenseTd} from '../site/nfl-td.mjs';
import {tdSweepstakes} from '../site/nfl-td-sweepstakes.mjs';
import {loadNflFinals,gradeTdBoard} from './nfl-finals.mjs';
import {confirmedBacklog} from './health.mjs';

const data=fileURLToPath(new URL('../site/data/',import.meta.url)), out=join(data,'tracker');
const now=Date.parse(process.env.TRACK_NOW||'')||Date.now(), today=dateKey(new Date(now));
const read=name=>readFile(join(data,name),'utf8').then(JSON.parse).catch(()=>null);
await mkdir(out,{recursive:true});
const store=new Map(), changed=new Set(), month=x=>x.date.slice(0,7);
for(const file of await readdir(out))if(/^td-board-\d{4}-\d\d\.json$/.test(file))for(const x of JSON.parse(await readFile(join(out,file),'utf8')))store.set(x.game,x);
const year=+today.slice(0,4)-(today.slice(5,7)<'09');
const [schedule,archive,extra,weather,injuries,odds,models,availability]=await Promise.all([read('nfl-schedule.json'),read(`nfl-${year}.json`),
  read(`nfl-extra-${year}.json`),read('live/weather-nfl.json'),read('live/injuries-nfl.json'),read('live/odds-nfl.json'),read('models/nfl.json'),
  read('live/nfl-availability.json')]);
const season=(schedule||[]).filter(g=>+g.id.slice(0,4)===year);
const snapshot=x=>({game:x.g.id,date:x.g.date,week:x.g.week,tip:x.g.iso,a:x.g.a,h:x.g.h,
  players:x.rows.map(r=>[r.id,r.p.name,r.team,r.role,+r.anytime.toFixed(4),+r.first.toFixed(4),+r.lambda.toFixed(3)])});
// Who scored: every offensive TD scorer in the game, and the first TD's scorer (any kind, as Kalshi settles).
const grade=(x,ev)=>{
  const touchdowns=ev.filter(p=>p[8]);
  x.tds=[...new Set(touchdowns.map(offenseTd).filter(Boolean))];x.first=touchdowns[0]?.[9]||null;
  if(x.sweepstakes){
    const scorer=p=>p?{name:archive.players?.[p[9]]?.[0]||'Unidentified scorer',team:p[8]}:null;
    x.firstScorer=scorer(touchdowns[0]);x.lastScorer=scorer(touchdowns.at(-1));
  }
  x.graded=new Date(now).toISOString();return x;
};
const setup=(week,games,live)=>Object.assign(S,{route:routes.find(r=>r.id==='nfl-tdboard'),year,week,games,data:{...archive,schedule},extra,
  weather:live?weather:null,injuries:live&&Object.keys(availability?.teams||{}).length?availability.teams:live?injuries||{}:{},
  nflAvailability:live?availability:null,odds:live?odds||[]:[],models:live?models:null,f:{...viewDefaults['nfl-tdboard']}});
let saved=0,graded=0;
const next=season.filter(g=>g.date>=today&&g.sa==null).sort((a,b)=>a.date.localeCompare(b.date))[0];
if(next&&archive){
  setup(next.week,season.filter(g=>g.week===next.week),true);
  const board=tdBoardData();
  for(const x of board.games){
    if(x.g.sa!=null||!(Date.parse(x.g.iso)>now))continue;
    if(store.get(x.g.id)?.graded)continue;
    const sweepstakes=x.g.id===nflTdSweepstakesGame?tdSweepstakes(x,schedule,archive.events,board.rates,now):null;
    const previous=store.get(x.g.id);
    store.set(x.g.id,{...snapshot(x),capturedAt:new Date(now).toISOString(),
      ...(sweepstakes?{sweepstakes}:previous?.sweepstakes?{sweepstakes:previous.sweepstakes,sweepstakesAt:previous.sweepstakesAt??previous.capturedAt}:{})});
    changed.add(month(x.g));saved++;
  }
}
const byGame=new Map(season.map(g=>[g.id,g]));
const pending=[...store.values()].filter(x=>!x.graded&&now-Date.parse(x.tip)>=2.5*3600_000);
const boxes=await loadNflFinals(season,new Set(pending.filter(x=>now-Date.parse(x.tip)<=7*86400_000&&
  (x.sweepstakes||!archive?.events?.[x.game]?.length||byGame.get(x.game)?.sa==null)).map(x=>x.game)));
for(const x of pending){
  const ev=archive?.events?.[x.game], g=byGame.get(x.game);
  const promoResult=x.sweepstakes&&gradeTdBoard(x,boxes.get(x.game),now);
  if(promoResult)Object.assign(x,promoResult);
  else if(ev?.length&&g?.sa!=null){
    grade(x,ev);x.resultSource='Season play-by-play';
  }else{
    const result=gradeTdBoard(x,boxes.get(x.game),now);
    if(!result)continue;
    Object.assign(x,result);
  }
  changed.add(month(x));graded++;
}
// Backtest: each earlier week with only the data before it (no stored lines, injuries or weather for past weeks).
if(archive){
  const weeks=[...new Set(season.filter(g=>g.sa!=null&&archive.events?.[g.id]).map(g=>g.week))].filter(w=>w>=3).sort((a,b)=>a-b);
  const backtest=[];
  for(const w of weeks){
    const games=season.filter(g=>g.week===w).map(g=>({...g,spread:null,total:null}));
    setup(w,games,false);
    for(const x of tdBoardData().games){const ev=archive.events[x.g.id];if(ev?.length)backtest.push(grade(snapshot(x),ev));}
  }
  await writeFile(join(out,'td-board-backtest.json'),JSON.stringify({updated:new Date(now).toISOString(),games:backtest}));
  console.log(`TD backtest: ${backtest.length} games over weeks ${weeks[0]}–${weeks.at(-1)}.`);
}
const months=new Map();
for(const x of store.values()){const l=months.get(month(x))||[];l.push(x);months.set(month(x),l);}
for(const key of changed)await writeFile(join(out,`td-board-${key}.json`),JSON.stringify(months.get(key).sort((a,b)=>a.tip.localeCompare(b.tip))));
const gradingBacklog=confirmedBacklog([...store.values()].filter(x=>!x.graded),x=>boxes.has(x.game)||byGame.get(x.game)?.sa!=null,now);
await writeFile(join(out,'td-board-index.json'),JSON.stringify({updated:new Date(now).toISOString(),months:[...months.keys()].sort(),count:store.size,gradingBacklog}));
console.log(`TD Board log: ${store.size} games, ${saved} saved before kickoff, ${graded} newly graded.`);
