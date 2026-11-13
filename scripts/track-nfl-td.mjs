// TD Board calibration log (GOING LONG). Each hourly run saves the board for every game that has not kicked off (the
// last pregame save counts), grades finished games from the play-by-play, and replays earlier weeks as a backtest.
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {current as S,dateKey} from '../site/ui.mjs';
import {routes,viewDefaults} from '../site/config.mjs';
import {tdBoardData} from '../site/nfl.mjs';
import {offenseTd} from '../site/nfl-td.mjs';

const data=fileURLToPath(new URL('../site/data/',import.meta.url)), out=join(data,'tracker');
const now=Date.parse(process.env.TRACK_NOW||'')||Date.now(), today=dateKey(new Date(now));
const read=name=>readFile(join(data,name),'utf8').then(JSON.parse).catch(()=>null);
await mkdir(out,{recursive:true});
const store=new Map(), changed=new Set(), month=x=>x.date.slice(0,7);
for(const file of await readdir(out))if(/^td-board-\d{4}-\d\d\.json$/.test(file))for(const x of JSON.parse(await readFile(join(out,file),'utf8')))store.set(x.game,x);
const year=+today.slice(0,4)-(today.slice(5,7)<'09');
const [schedule,archive,extra,weather,injuries,odds,models]=await Promise.all([read('nfl-schedule.json'),read(`nfl-${year}.json`),
  read(`nfl-extra-${year}.json`),read('live/weather-nfl.json'),read('live/injuries-nfl.json'),read('live/odds-nfl.json'),read('models/nfl.json')]);
const season=(schedule||[]).filter(g=>+g.id.slice(0,4)===year);
const snapshot=x=>({game:x.g.id,date:x.g.date,week:x.g.week,tip:x.g.iso,a:x.g.a,h:x.g.h,
  players:x.rows.map(r=>[r.id,r.p.name,r.team,r.role,+r.anytime.toFixed(4),+r.first.toFixed(4),+r.lambda.toFixed(3)])});
// Who scored: every offensive TD scorer in the game, and the first TD's scorer (any kind, as Kalshi settles).
const grade=(x,ev)=>{x.tds=[...new Set(ev.map(offenseTd).filter(Boolean))];x.first=ev.find(p=>p[8])?.[9]||null;x.graded=new Date(now).toISOString();return x;};
const setup=(week,games,live)=>Object.assign(S,{route:routes.find(r=>r.id==='nfl-tdboard'),year,week,games,data:{...archive,schedule},extra,
  weather:live?weather:null,injuries:live?injuries||{}:{},odds:live?odds||[]:[],models:live?models:null,f:{...viewDefaults['nfl-tdboard']}});
let saved=0,graded=0;
const next=season.filter(g=>g.date>=today&&g.sa==null).sort((a,b)=>a.date.localeCompare(b.date))[0];
if(next&&archive){
  setup(next.week,season.filter(g=>g.week===next.week),true);
  for(const x of tdBoardData().games){
    if(x.g.sa!=null||!(Date.parse(x.g.iso)>now))continue;
    if(store.get(x.g.id)?.graded)continue;
    store.set(x.g.id,{...snapshot(x),capturedAt:new Date(now).toISOString()});changed.add(month(x.g));saved++;
  }
}
for(const x of store.values()){
  const ev=archive?.events?.[x.game], g=season.find(y=>y.id===x.game);
  if(x.graded||!ev?.length||g?.sa==null)continue;
  grade(x,ev);changed.add(month(x));graded++;
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
await writeFile(join(out,'td-board-index.json'),JSON.stringify({updated:new Date(now).toISOString(),months:[...months.keys()].sort(),count:store.size}));
console.log(`TD Board log: ${store.size} games, ${saved} saved before kickoff, ${graded} newly graded.`);
