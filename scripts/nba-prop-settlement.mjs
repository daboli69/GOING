import {eventSuffixes,host,series,marketName,readListing,readInParallel} from './market-data.mjs';

const stats=new Set(['Points','Threes','Rebounds','Assists']);
const key=(game,stat,name,line)=>JSON.stringify([game,stat,marketName(name),line]);
const eligible=leg=>leg.provider==='Kalshi'&&stats.has(leg.stat)&&Number.isFinite(leg.line)&&marketName(leg.name);

export async function loadNbaPropSettlements(legs,finals,read=fetch){
  const events=new Map(), settlements=new Map(), failed=new Set();
  for(const leg of legs){
    const box=finals.get(leg.game);
    if(!eligible(leg)||!box?.a||!box.h||!/^\d{4}-\d\d-\d\d$/.test(leg.date))continue;
    for(const suffix of eventSuffixes('nba',{date:leg.date,a:box.a,h:box.h})){
      const event=series.nba[leg.stat]+'-'+suffix;
      if(!events.has(event))events.set(event,{game:leg.game,stat:leg.stat,keys:new Set()});
      events.get(event).keys.add(key(leg.game,leg.stat,leg.name,leg.line));
    }
  }
  await readInParallel([...events],async ([event,{game,stat,keys}])=>{
    const url=new URL('markets',host);
    url.search=new URLSearchParams({event_ticker:event,limit:'1000'});
    const listing=await readListing(url,read);
    if(!listing||listing.cursor!==''){failed.add(game);return;}
    for(const market of listing.markets){
      if(market.event_ticker!==event||!['finalized','settled'].includes(market.status)||!['yes','no','scalar'].includes(market.result))continue;
      const colon=market.title?.indexOf(':');
      if(!(colon>0)||!Number.isFinite(market.floor_strike))continue;
      const id=key(game,stat,market.title.slice(0,colon),market.floor_strike);
      if(!keys.has(id))continue;
      const previous=settlements.get(id);
      settlements.set(id,previous&&previous!==market.result?'ambiguous':market.result);
    }
  });
  return {settlements,failed};
}

export function gradeNbaPropSettlement(leg,settlements,now){
  if(!eligible(leg)||!['Over','Under'].includes(leg.side))return leg;
  const settlement=settlements.get(key(leg.game,leg.stat,leg.name,leg.line));
  if(!['yes','no','scalar'].includes(settlement))return leg;
  const scalar=settlement==='scalar';
  return {...leg,value:null,result:scalar?'void':(settlement==='yes')===(leg.side==='Over')?'won':'lost',
    graded:new Date(now).toISOString(),resultSource:scalar?'Kalshi final · nonbinary':'Kalshi final contract'};
}
