import {nbaLegChance} from '../site/nba-parlay-engine.mjs';
import {kickoff,nflName} from '../site/nfl-availability.mjs';
import {breakEven,classify,gtaDate,gtaQuoteAge,gtaStart,returnOnDecision,stress} from '../site/gta-event.mjs';

export const nbaFiles=['live/nba-main-lines-'+gtaDate,'live/odds-nba-'+gtaDate,'live/nba-alternate-lines-'+gtaDate];
export const leagues=['nba','nfl','nhl','mlb','cbb','cwb','fbs','ufc'];
const fixed={
  schedule:'nfl-schedule',nhl:'nhl-20262027',shots:'nhl-shots-20262027',manifest:'live/manifest',
  nbaSlate:'live/slate-nba-'+gtaDate,nhlSlate:'live/slate-nhl-'+gtaDate,
  nflQuotes:'live/odds-nfl',nhlQuotes:'live/odds-nhl-'+gtaDate,
  nbaModels:'models/nba',nflModels:'models/nfl',nhlInjuries:'live/injuries-nhl',
  cbb:'college/cbb',cwb:'college/cwb',fbs:'college/fbs',ufc:'fights/board',mlb:'yard/board',mlbOdds:'yard/odds',
  nbaWatch:'market-watch/nba',nhlWatch:'market-watch/nhl',nflWatch:'market-watch/nfl',cbbWatch:'market-watch/cbb',cwbWatch:'market-watch/cwb',fbsWatch:'market-watch/fbs'
};
const histories={picks:'index',nba:'parlay-legs-index',nfl:'nfl-parlay-legs-index'};
export async function loadSources(read){
  const [feeds,books,trackers]=await Promise.all([
    Promise.all(Object.entries(fixed).map(async ([k,p])=>[k,await read(p)])),
    Promise.all(nbaFiles.map(p=>read(p))),
    Promise.all(Object.entries(histories).map(async ([name,index])=>{
      const meta=await read('tracker/'+index),prefix=name==='picks'?'picks':name==='nba'?'parlay-legs':'nfl-parlay-legs';
      const rows=await Promise.all(Object.entries(meta?.versions||{}).filter(([month])=>month<=gtaDate.slice(0,7))
        .map(([month,version])=>read('tracker/history/'+prefix+'-'+month+'-'+version)));
      return [name,rows.flatMap(list=>list||[])];
    }))
  ]);
  return {...Object.fromEntries(feeds),...Object.fromEntries(trackers),nbaQuotes:books.flatMap(rows=>rows||[])};
}
const list=x=>Array.isArray(x)?x:[];
const names=s=>String(s??'').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const playerKey=(sport,name)=>sport==='nfl'?nflName(name):names(name);
const validOdds=x=>/^[+-]?\d+$/.test(String(x??''))&&Number.isSafeInteger(+x)&&Math.abs(+x)>=100;
const prob=x=>typeof x==='number'&&x>0&&x<1?x:null;
const time=x=>Date.parse(x);
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const eventDay=x=>Number.isFinite(time(x))?formatter.format(time(x)):null;
const nbaChance=l=>l.form?.season?.n>0?prob(nbaLegChance(l)):null;
const key=(sport,g,name,market,line,provider,odds,at)=>JSON.stringify([sport,String(g),playerKey(sport,name),market,line,provider,+odds,time(at)]);
const group=(sport,market,provider)=>[sport,market,provider].join('|');
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
export function gameInterval(values){
  if(values.length<5)return null;
  let seed=16661;
  const draws=Array.from({length:2000},()=>mean(values.map(()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return values[Math.floor(seed/4294967296*values.length)];
  }))).sort((a,b)=>a-b);
  return [draws[50],draws[1949]];
}
function historyMetrics(input){
  const records=new Map();
  for(const sport of ['nba','nfl','nhl']){
    const rows=sport==='nhl'?input.picks.filter(r=>r.sport===sport):input[sport];
    const side=new Map();
    for(const r of rows){
      const at=time(r.observedAt??r.at),quote=time(r.capturedAt),start=time(r.tip??r.start),graded=time(r.graded);
      if(!(at<start&&graded>=start&&graded<gtaStart)||r.date>=gtaDate||!['won','lost'].includes(r.result)||!validOdds(r.price??r.odds))continue;
      if(sport!=='nhl'&&!(quote<=at&&at-quote<=gtaQuoteAge))continue;
      const id=[r.game,r.player??r.id,r.stat??r.market,r.provider,r.line,at,quote].join('|');
      if(!side.has(id))side.set(id,{});
      side.get(id)[r.side]=r;
    }
    const single=new Map();
    for(const {Under:r,Over:o} of side.values()){
      if(!r)continue;
      const p=sport==='nba'?nbaChance(r):sport==='nfl'?prob(r.chance):prob(Object.entries(r.tools||{}).find(([k])=>k!=='nhl-best')?.[1]?.prob);
      if(p==null)continue;
      const ask=breakEven(+(r.price??r.odds)),market=o?ask/(ask+breakEven(+(o.price??o.odds))):null;
      const code=group(sport,r.stat??r.market,r.provider),unique=[code,r.game,r.player??r.id].join('|');
      const balance=Math.abs((market??ask)-.5);
      if(single.has(unique)&&single.get(unique).balance<=balance)continue;
      single.set(unique,{code,game:r.game,date:r.date,balance,p,market,y:Number(r.result==='won')});
    }
    for(const r of single.values()){
      if(!records.has(r.code))records.set(r.code,[]);
      records.get(r.code).push(r);
    }
  }
  return Object.fromEntries([...records].map(([code,rows])=>{
    const games=new Map();
    for(const r of rows){
      if(!games.has(r.game))games.set(r.game,[]);
      games.get(r.game).push(r);
    }
    const clusters=[...games.values()],matched=clusters.map(rs=>rs.filter(r=>r.market!=null)).filter(rs=>rs.length);
    const residual=clusters.map(rs=>mean(rs.map(r=>r.y-r.p)));
    const weeks=new Set(rows.map(r=>{const d=new Date(r.date+'T12:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}));
    return [code,{games:games.size,weeks:weeks.size,matched:matched.length,n:rows.length,
      residual:mean(residual),interval:gameInterval(residual),brier:matched.length?mean(matched.map(rs=>mean(rs.map(r=>(r.y-r.p)**2)))):null,
      marketBrier:matched.length?mean(matched.map(rs=>mean(rs.map(r=>(r.y-r.market)**2)))):null}];
  }));
}
function fixtures(input){
  return {
    nba:list(input.nbaSlate).map(g=>({...g,start:g.iso})),nhl:list(input.nhlSlate).map(g=>({...g,start:g.iso})),
    nfl:list(input.schedule).filter(g=>g.date===gtaDate).map(g=>({...g,start:kickoff(g.date,g.time)})),
    ...Object.fromEntries(['cbb','cwb','fbs'].map(s=>[s,list(input[s]?.games).filter(g=>g.date===gtaDate)])),
    mlb:input.mlb?.slate_date===gtaDate&&!input.mlb.fallback?list(input.mlb.games):[],
    ufc:list(input.ufc?.cards).filter(g=>g.date===gtaDate)
  };
}
const scheduled=(g,at)=>eventDay(g.start)===gtaDate&&time(g.start)>at&&!['FINAL','OFF','LIVE','CRIT','CANCELED','POSTPONED','IN','POST'].includes(String(g.status||'').toUpperCase());
export function discover(input,at){
  const slate=fixtures(input), offers=[], baseline=new Map();
  for(const leg of input.nba){
    if(leg.date!==gtaDate||leg.provider!=='DraftKings'||leg.alternate!==false||leg.side!=='Under'||leg.result||
      !(time(leg.capturedAt)<=time(leg.observedAt)&&time(leg.observedAt)<=at&&time(leg.observedAt)<time(leg.tip)))continue;
    const exact=key('nba',leg.game,leg.name,leg.stat,leg.line,leg.provider,leg.price,leg.capturedAt);
    const record=value=>value?{hits:value.hits,n:value.n,pushes:value.pushes??0}:null;
    baseline.set(exact,baseline.has(exact)?null:{
      id:String(leg.player),team:leg.team,prob:nbaChance(leg),model:'nba-form',
      projection:leg.projection??null, push:Number.isInteger(leg.line)?null:0,modelAt:leg.observedAt,
      unavailable:!!leg.checks?.Availability,
      injuryFlag:(leg.flags||[]).find(flag=>/day.to.day|questionable|doubtful|game.time decision/i.test(flag))??null,
      history:{season:record(leg.form?.season),recent:record(leg.form?.last10)}
    });
  }
  // DraftKings is the sportsbook main-line feed. Exchange threshold listings do not attest to a main line.
  const mainLines=new Map();
  for(const q of list(input.nbaQuotes)){
    if(q.provider!=='DraftKings'||q.date!==gtaDate||!validOdds(q.under)||!Number.isFinite(q.line))continue;
    const matches=slate.nba.filter(g=>g.a===q.a&&g.h===q.h&&scheduled(g,at));
    const quoteTime=time(q.capturedAt);
    if(matches.length!==1||!(quoteTime<=at&&at-quoteTime<=gtaQuoteAge))continue;
    const g=matches[0], id=[g.id,playerKey('nba',q.player),q.market,q.provider].join('|');
    const prior=mainLines.get(id);
    if(prior?.at>quoteTime)continue;
    // Two distinct lines at the same timestamp cannot both be the normal line for that player and stat.
    if(prior?.at===quoteTime){
      if(prior.offer?.line!==q.line||prior.offer?.odds!==+q.under)prior.offer=null;
      continue;
    }
    const exact=key('nba',g.id,q.player,q.market,q.line,q.provider,q.under,q.capturedAt);
    mainLines.set(id,{at:quoteTime,offer:{sport:'nba',kind:'Player',game:String(g.id),matchup:g.a+' @ '+g.h,start:g.start,subject:q.player,
      market:q.market,line:q.line,odds:+q.under,provider:q.provider,quoteAt:q.capturedAt,mainLine:true,...baseline.get(exact)}});
  }
  offers.push(...[...mainLines.values()].map(entry=>entry.offer).filter(Boolean));
  for(const sport of leagues){
    for(const g of slate[sport]){
      if(!scheduled(g,at))continue;
      const book=g.market??g.odds, line=book?.total?.line??book?.total, under=book?.total?.under??book?.under;
      const quoteAt=g.marketAt??input.manifest?.updated,stamp=time(quoteAt);
      if(typeof line!=='number'||!Number.isFinite(line)||!validOdds(under)||!(stamp<=at&&at-stamp<=gtaQuoteAge))continue;
      const f=g.forecast, projection=Number.isFinite(f?.homePts)&&Number.isFinite(f.awayPts)?f.homePts+f.awayPts:null;
      const a=g.a??g.away?.code,h=g.h??g.home?.code;
      offers.push({sport,kind:'Game',game:String(g.id),matchup:a+' @ '+h,start:g.start,subject:a+' @ '+h,market:'Game total',
        line,odds:+under,provider:book.provider,quoteAt,model:projection==null?null:'college-score',projection,
        modelAt:projection==null?null:input[sport].updated,liquidity:null,executable:!!book.provider});
    }
  }
  const reliability=historyMetrics({...input,nba:input.nba.filter(r=>r.provider==='DraftKings'&&r.alternate===false),nfl:[],picks:[]});
  const rows=offers.map(row=>{
    const cohort=group(row.sport,row.market,row.provider);
    const classification=classify(row);
    return {...row,cohort,classification,baselineEV:row.prob==null?null:returnOnDecision(row.prob,row.odds)*(1-(row.push??0)),
      stressRange:stress(row).map(r=>r.prob)};
  });
  const coverage=Object.fromEntries(leagues.map(s=>{
    const pool=rows.filter(r=>r.sport===s);
    const watch=list(input[s+'Watch']?.games).filter(g=>g.date===gtaDate);
    return [s,{events:slate[s].length,open:slate[s].filter(g=>scheduled(g,at)).length,
      priced:pool.length,modeled:pool.filter(r=>r.prob!=null).length,markets:[...new Set(pool.map(r=>r.market))].sort(),
      watchTotals:watch.filter(g=>g.books?.some(b=>b.total!=null)).length}];
  }));
  const games=[...new Map(rows.map(r=>[r.sport+'|'+r.game,{sport:r.sport,id:r.game,start:r.start}])).values()];
  return {frozenAt:new Date(at).toISOString(),date:gtaDate,coverage,reliability,rows,games};
}
