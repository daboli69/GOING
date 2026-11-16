import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {eventSuffixes} from './market-data.mjs';
import {nflName} from '../site/nfl-availability.mjs';

const root='https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=';
const cache=new URL('../.cache/nfl-td-finals/',import.meta.url);
const series={'Anytime TD':'KXNFLTD','First TD':'KXNFLFIRSTTD'};
const key=(game,market,name,line)=>[game,market,nflName(name),line].join('|');
export const trackedTdMarket=market=>Object.hasOwn(series,market);

export function tdContracts(rows,event,game,market){
  const contracts=new Map();
  for(const row of rows){
    if(row.event_ticker!==event||!['finalized','settled'].includes(row.status)||!['yes','no','scalar'].includes(row.result))continue;
    const title=String(row.title||'');
    const name=title.split(':')[0], line=market==='First TD'?.5:row.floor_strike;
    if(!nflName(name)||name===title||!Number.isFinite(line))continue;
    const id=key(game,market,name,line);
    const prior=contracts.get(id);
    if(prior&&prior!==row.result)contracts.set(id,'ambiguous');
    else if(!prior)contracts.set(id,row.result);
  }
  return contracts;
}
export function tdGrade(contracts,{game,market,player,line,side,provider},now){
  if(provider!=='Kalshi'||!trackedTdMarket(market)||!['Over','Under'].includes(side))return null;
  const result=contracts.get(key(game,market,player,line));
  if(!['yes','no','scalar'].includes(result))return null;
  const value=result==='scalar'?null:Number(result==='yes');
  return {value,result:value==null?'void':(value===Number(side==='Over')?'won':'lost'),
    graded:new Date(now).toISOString(),resultSource:value==null?'Kalshi final · nonbinary':'Kalshi final contract'};
}

export async function loadTdContracts(schedule,needed){
  await mkdir(cache,{recursive:true});
  const contracts=new Map();
  const jobs=schedule.flatMap(g=>[...(needed.get(g.id)||[])].flatMap(market=>
    eventSuffixes('nfl',g).map(suffix=>({game:g.id,market,event:series[market]+'-'+suffix}))));
  for(let i=0;i<jobs.length;i+=4)await Promise.all(jobs.slice(i,i+4).map(async ({game,market,event})=>{
    if(!/^[A-Z0-9-]+$/.test(event))return;
    try{
      const file=new URL(event+'.json',cache);
      const prior=await readFile(file,'utf8').then(JSON.parse).catch(()=>null);
      let entries=prior;
      if(!entries){
        const r=await fetch(root+event,{signal:AbortSignal.timeout(5000)});
        const data=r.ok?await r.json():null;
        if(!Array.isArray(data?.markets)||data.cursor)return;
        entries=[...tdContracts(data.markets,event,game,market)];
        if(entries.length&&data.markets.every(m=>['finalized','settled'].includes(m.status)))await writeFile(file,JSON.stringify(entries));
      }
      for(const [id,state] of entries)contracts.set(id,contracts.has(id)&&contracts.get(id)!==state?'ambiguous':state);
    }catch{}
  }));
  return contracts;
}

export function neededTdContracts(picks,now){
  const needed=new Map();
  for(const p of picks){
    const age=now-Date.parse(p.tip||p.start),market=p.stat||p.market;
    if(p.result||p.provider!=='Kalshi'||!trackedTdMarket(market)||!(age>=2.5*3600_000&&age<=7*86400_000))continue;
    if(!needed.has(p.game))needed.set(p.game,new Set());
    needed.get(p.game).add(market);
  }
  return needed;
}
