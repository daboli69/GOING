import {readFile} from 'node:fs/promises';
import {fightTool,fightVersion,ufcModelVersion} from '../site/fights-core.mjs';

export async function readUfcForecastHistory(cards,tracker){
  const months=new Set(cards.map(card=>card.date.slice(0,7)));
  const files=await Promise.all([...months].map(month=>
    readFile(new URL('picks-'+month+'.json',tracker),'utf8').then(JSON.parse).catch(()=>[])));
  const rows=new Map();
  for(const pick of files.flat()){
    if(pick?.sport!=='ufc'||![fightVersion,ufcModelVersion].includes(pick.version))continue;
    const key=pick.event+'|'+pick.game, list=rows.get(key)||[];
    list.push(pick);
    rows.set(key,list);
  }
  return rows;
}

const before=(value,start)=>Number.isFinite(Date.parse(value))&&Date.parse(value)<Date.parse(start);
const sameFighters=(bout,ids)=>bout.fighters.length===2&&ids.length===2&&
  bout.fighters.every(f=>ids.includes(f.id));

export function retainUfcForecasts(card,previous,tracked){
  for(const bout of card.bouts){
    const old=previous?.bouts?.find(b=>b.id===bout.id&&sameFighters(bout,b.fighters.map(f=>f.id)));
    const at=old?.forecastAt??previous?.checked;
    if(old?.forecast&&before(at,card.start)){
      // The archived arrays follow the original fighter order even if ESPN swaps the display order.
      bout.fighters=old.fighters.map(f=>bout.fighters.find(current=>current.id===f.id));
      Object.assign(bout,{forecast:old.forecast,baseline:old.baseline,forecastAt:at,forecastSource:old.forecastSource??'board'});
      if(!bout.segment&&old.segment)bout.segment=old.segment;
      if(before(old.market?.checked,card.start))bout.market=old.market;
      continue;
    }
    const history=(tracked.get(card.id+'|'+bout.id)||[]).flatMap(pick=>{
      const prob=pick.tools?.[fightTool(pick.version)]?.prob;
      if(!before(pick.at,card.start)||pick.start!==card.start||!sameFighters(bout,[pick.a,pick.h])||
        ![pick.a,pick.h].includes(pick.side)||!Number.isFinite(prob)||prob<=.5||prob>1)return [];
      return [{at:pick.at,forecast:{version:pick.version,prob:bout.fighters.map(f=>f.id===pick.side?prob:1-prob)}}];
    }).sort((a,b)=>b.at.localeCompare(a.at));
    const baseline=history.find(row=>row.forecast.version===fightVersion);
    const latest=history.find(row=>row.forecast.version===ufcModelVersion)||baseline;
    if(latest)Object.assign(bout,{forecast:latest.forecast,forecastAt:latest.at,forecastSource:'tracker',baseline:baseline?.forecast});
  }
}
