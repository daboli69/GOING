// DraftKings exposes its main Over/Under selections as MainPointLine in its public NBA board.
import {markets} from './nba-parlay-engine.mjs';
import {teamCode} from './market-watch-data.mjs';

const base='https://sportsbook-nash.draftkings.com/sites/US-IL-SB/api/sportscontent/controldata/league/leagueSubcategory/v1/markets';
const categories={Points:['12488','Points O/U'],Rebounds:['12492','Rebounds O/U'],
  Assists:['12495','Assists O/U'],Threes:['12497','Three Pointers Made O/U']};
const milestones={Points:['16477','Points Milestones'],Rebounds:['16479','Rebounds Milestones'],
  Assists:['16478','Assists Milestones'],Threes:['16480','Three Pointers Made Milestones']};
const provider='DraftKings';
const halfHour=30*60000;
const freshFor=35*60000;
const usableFor=120*60000;
const openGame=g=>['FUT','PRE'].includes(g.status);
const team=value=>teamCode('nba',value);
const price=value=>{
  const s=String(value??'').replace('−','-').trim();
  const amount=Number(s);
  return /^[+-]?\d+$/.test(s)&&Number.isSafeInteger(amount)&&Math.abs(amount)>=100?s:null;
};

function fixture(event,games,now){
  if(event?.status!=='NOT_STARTED'||event.leagueId!=='42648')return null;
  const start=Date.parse(event.startEventDate);
  if(!(start>now))return null;
  const code=role=>team(event.participants?.find(t=>t.venueRole===role)?.metadata?.shortName);
  const away=code('Away'),home=code('Home');
  if(!away||!home)return null;
  const candidates=games.filter(g=>openGame(g)&&Date.parse(g.iso)>now&&Math.abs(Date.parse(g.iso)-start)<=halfHour&&
    team(g.a)===away&&team(g.h)===home);
  return candidates.length===1?candidates[0]:null;
}

export function draftKingsMainLines(payload,stat,games,now=Date.now()){
  const category=categories[stat];
  if(!category||!Array.isArray(payload?.markets)||!Array.isArray(payload.events)||!Array.isArray(payload.selections))return null;
  const [id,type]=category, events=new Map(payload.events.map(e=>[e.id,fixture(e,games,now)]));
  if(payload.markets.length&&!payload.markets.some(m=>m.subcategoryId===id&&m.marketType?.name===type))return null;
  const selections=new Map();
  for(const offer of payload.selections){
    if(!Array.isArray(offer?.tags)||!offer.tags.includes('MainPointLine')||offer.isSuspended||!['Over','Under'].includes(offer.outcomeType))continue;
    const list=selections.get(offer.marketId)||[];
    list.push(offer);selections.set(offer.marketId,list);
  }
  const capturedAt=new Date(now).toISOString(), rows=new Map();
  for(const m of payload.markets){
    const g=events.get(m.eventId);
    if(!g||m.isSuspended||m.subcategoryId!==id||m.marketType?.name!==type)continue;
    const picks=selections.get(m.id)||[];
    if(picks.length!==2||picks[0].outcomeType===picks[1].outcomeType)continue;
    const over=picks.find(x=>x.outcomeType==='Over'), under=picks.find(x=>x.outcomeType==='Under');
    const person=offer=>offer.participants?.find(p=>p.type==='Player');
    const a=person(over),b=person(under),line=over.points;
    if(!a?.name||!a.id||a.id!==b?.id||a.venueRole!==b?.venueRole||!Number.isFinite(line)||line<0||line!==under.points)continue;
    const playerTeam=a.venueRole==='HomePlayer'?g.h:a.venueRole==='AwayPlayer'?g.a:null;
    if(!playerTeam)continue;
    const o=price(over.displayOdds?.american),u=price(under.displayOdds?.american);
    if(!o||!u)continue;
    const key=g.id+'|'+a.id;
    rows.set(key,rows.has(key)?null:{player:a.name,team:playerTeam,market:stat,line,date:g.date,a:g.a,h:g.h,over:o,under:u,provider,capturedAt});
  }
  return [...rows.values()].filter(Boolean);
}

export function draftKingsMilestones(payload,stat,games,now=Date.now()){
  const category=milestones[stat];
  if(!category||!Array.isArray(payload?.markets)||!Array.isArray(payload.events)||!Array.isArray(payload.selections))return null;
  const [id,type]=category, events=new Map(payload.events.map(e=>[e.id,fixture(e,games,now)]));
  const matches=payload.markets.filter(m=>m.subcategoryId===id&&m.marketType?.name===type);
  if(payload.markets.length&&!matches.length)return null;
  const byMarket=new Map(matches.filter(m=>!m.isSuspended&&m.tags?.includes('SGP')).map(m=>[m.id,events.get(m.eventId)]));
  const capturedAt=new Date(now).toISOString(), rows=new Map();
  for(const offer of payload.selections){
    const game=byMarket.get(offer.marketId), target=offer.milestoneValue, over=price(offer.displayOdds?.american);
    if(!game||offer.isSuspended||!offer.tags?.includes('SGP')||!Number.isSafeInteger(target)||target<1||
      offer.label!==target+'+'||!(Number(over)<=-100))continue;
    const person=offer.participants?.find(p=>p.type==='Player');
    const playerTeam=person?.venueRole==='HomePlayer'?game.h:person?.venueRole==='AwayPlayer'?game.a:null;
    if(!playerTeam||!person.name||!person.id)continue;
    const key=[game.id,person.id,target].join('|');
    // NBA counts are integers, so a milestone of N+ is equivalent to Over N-0.5.
    rows.set(key,rows.has(key)?null:{player:person.name,team:playerTeam,market:stat,line:target-.5,
      milestone:target,date:game.date,a:game.a,h:game.h,over,provider,capturedAt});
  }
  return [...rows.values()].filter(Boolean);
}

function url(id){
  const u=new URL(base);
  u.search=new URLSearchParams({isBatchable:'false',templateVars:'42648,'+id,
    eventsQuery:`$filter=leagueId eq '42648' AND clientMetadata/Subcategories/any(s: s/Id eq '${id}')`,
    marketsQuery:`$filter=clientMetadata/subCategoryId eq '${id}' AND tags/all(t: t ne 'SportcastBetBuilder')`,include:'Events',entity:'events'});
  return u;
}

async function readBoard(games,categories,parse,read){
  if(!games.length)return {quotes:[],failed:[]};
  const results=await Promise.all(markets.map(async market=>{
    try{
      const r=await read(url(categories[market][0]),{cache:'no-cache',signal:AbortSignal.timeout(6500)});
      const rows=r.ok?parse(await r.json(),market,games):null;
      return {market,rows};
    }catch{return {market,rows:null};}
  }));
  return {quotes:results.flatMap(r=>r.rows||[]),failed:results.filter(r=>!r.rows).map(({market})=>({market}))};
}
export const readDraftKingsMainLines=(games,{read=fetch}={})=>readBoard(games,categories,draftKingsMainLines,read);
export const readDraftKingsMilestones=(games,{read=fetch}={})=>readBoard(games,milestones,draftKingsMilestones,read);

export const nbaPropMarketKey=(date,a,h,market)=>[date,a,h,market].join('|');
export function missingNbaPropMarkets(date,games,exchange,now=Date.now()){
  const priced=new Set(exchange.filter(q=>{
    const age=now-Date.parse(q.capturedAt);
    return q.provider==='Kalshi'&&age>=0&&age<=usableFor&&(q.over!=null||q.under!=null);
  }).map(q=>nbaPropMarketKey(q.date,q.a,q.h,q.market)));
  return new Set(games.filter(g=>openGame(g)&&Date.parse(g.iso)>now)
    .flatMap(g=>markets.map(m=>nbaPropMarketKey(date,g.a,g.h,m))).filter(key=>!priced.has(key)));
}

// Pages normally supplies the board. Check a live source when publication lags or has no offers yet.
export async function nbaMainLineBoard(date,games,published,{previous,force=false,now=Date.now(),read,recover,publishedAlternates}={}){
  const upcoming=games.filter(g=>openGame(g)&&Date.parse(g.iso)>now);
  if(!upcoming.length)return {date,quotes:[],source:'no-games'};
  const matchups=new Set(upcoming.map(g=>g.a+'|'+g.h));
  const usable=quotes=>(Array.isArray(quotes)?quotes:[]).filter(q=>{
    const age=now-Date.parse(q?.capturedAt);
    return q?.provider===provider&&q.date===date&&matchups.has(q.a+'|'+q.h)&&age>=0&&age<=usableFor;
  });
  const saved=usable(published), savedAlternates=usable(publishedAlternates);
  const latest=quotes=>Math.max(0,...quotes.map(q=>Date.parse(q.capturedAt)));
  const publishedAt=latest(saved), alternatesAt=latest(savedAlternates);
  const slateKey=upcoming.map(g=>g.id+'|'+g.iso).sort().join(',');
  const recent=previous?.date===date&&previous.slateKey===slateKey&&previous.checkedAt>=Math.max(publishedAt,alternatesAt)?previous:null;
  const fresh=saved.length>0&&saved.every(q=>now-Date.parse(q.capturedAt)<=freshFor);
  if(!force&&recent&&now-recent.checkedAt<3*60000)return {...recent,quotes:usable(recent.quotes),alternates:usable(recent.alternates)};
  if(!force&&fresh&&!recent&&(!publishedAlternates||alternatesAt>=now-freshFor))
    return {date,quotes:saved,alternates:savedAlternates,source:'published'};

  const timestamp=snapshot=>{
    const stamp=Date.parse(snapshot?.checkedAt);
    return snapshot?.date===date&&Array.isArray(snapshot.quotes)&&Array.isArray(snapshot.failed)&&
      snapshot.failed.every(item=>markets.includes(item?.market))&&stamp<=now&&now-stamp<=usableFor?stamp:0;
  };
  let mirror=await read(), stamp=timestamp(mirror);
  // GitHub's raw branch URL can still return an old commit after a successful publish.
  if(recover&&(now-stamp>freshFor||stamp<Math.max(publishedAt,alternatesAt))){
    const newer=await recover(), newerStamp=timestamp(newer);
    if(newerStamp>stamp){mirror=newer;stamp=newerStamp;}
  }
  if(!stamp||stamp<publishedAt){
    const prior=usable(recent?.quotes), priorAlternates=usable(recent?.alternates);
    return {date,slateKey,checkedAt:now,quotes:latest(prior)>publishedAt?prior:saved,
      alternates:latest(priorAlternates)>alternatesAt?priorAlternates:savedAlternates,source:fresh?'published':'unavailable'};
  }
  const quotes=usable(mirror.quotes), failed=mirror.failed;
  // A successful empty category is a book response. Only failed requests can reuse recent main lines.
  const backup=failed.flatMap(({market})=>{
    const prior=usable(recent?.quotes).filter(q=>q.market===market), snapshot=saved.filter(q=>q.market===market);
    return latest(prior)>latest(snapshot)?prior:snapshot;
  });
  const alternates=Array.isArray(mirror.alternates)&&Array.isArray(mirror.alternateFailed)&&stamp>=alternatesAt?
    [...usable(mirror.alternates),...mirror.alternateFailed.flatMap(({market})=>{
      const prior=usable(recent?.alternates).filter(q=>q.market===market), snapshot=savedAlternates.filter(q=>q.market===market);
      return latest(prior)>latest(snapshot)?prior:snapshot;
    })]:savedAlternates;
  return {date,slateKey,checkedAt:now,quotes:[...quotes,...backup],alternates,
    source:failed.length===markets.length||now-stamp>freshFor?'unavailable':failed.length?'partial':'mirror'};
}
