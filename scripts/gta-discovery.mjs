import {nbaLegChance} from '../site/nba-parlay-engine.mjs';
import {nhlResearchUnders} from '../site/nhl.mjs';
import {current as S} from '../site/ui.mjs';
import {kickoff,nflName} from '../site/nfl-availability.mjs';
import {breakEven,classify,gtaDate,gtaQuoteAge,gtaStart,poissonUnder,returnOnDecision,stress} from '../site/gta-event.mjs';

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
  const addBase=(k,v)=>baseline.set(k,baseline.has(k)?null:v);
  for(const sport of ['nba','nfl'])for(const l of input[sport]){
    if(l.date!==gtaDate||l.side!=='Under'||l.result||!(time(l.capturedAt)<=time(l.observedAt)&&time(l.observedAt)<=at&&time(l.observedAt)<time(l.tip)))continue;
    const form=l.form?.season;
    addBase(key(sport,l.game,l.name,l.stat,l.line,l.provider,l.price,l.capturedAt),{
      id:String(l.player),team:l.team,prob:sport==='nba'?nbaChance(l):prob(l.chance),
      projection:l.projection??null,model:sport==='nba'?'nba-form':'nfl-form',
      push:Number.isInteger(l.line)?null:0,modelAt:l.observedAt,unavailable:!!l.checks?.Availability,
      sample:form?.n??null
    });
  }
  if(input.nhl&&time(input.manifest?.archive_updated)<=at){
    const previous={...S};
    try{
      Object.assign(S,{route:{sport:'nhl'},day:gtaDate,today:gtaDate,ice:2026,data:{...input.nhl,shots:input.shots},games:slate.nhl,odds:list(input.nhlQuotes)});
      for(const {game,player,market,quote,projection} of nhlResearchUnders()){
        const qualified=projection!=null?poissonUnder(projection,quote.line):null;
        addBase(key('nhl',game.id,player.name,market,quote.line,quote.provider,quote.under,quote.capturedAt),{
          id:String(player.id),team:player.team,prob:prob(qualified?.prob),push:qualified?.push??null,projection,model:'nhl-poisson',
          unavailable:market==='Saves',starterUnverified:market==='Saves',
          modelAt:new Date(at).toISOString(),sample:player.gp??null
        });
      }
    }finally{Object.assign(S,previous);}
  }
  for(const sport of ['nba','nfl','nhl']){
    const seen=new Map();
    for(const q of list(input[sport+'Quotes'])){
      if(q.date!==gtaDate||!validOdds(q.under)||typeof q.line!=='number'||!Number.isFinite(q.line))continue;
      const matches=slate[sport].filter(g=>g.a===q.a&&g.h===q.h&&scheduled(g,at));
      const atQuote=time(q.capturedAt);
      if(matches.length!==1||!(atQuote<=at&&at-atQuote<=gtaQuoteAge))continue;
      const g=matches[0], k=key(sport,g.id,q.player,q.market,q.line,q.provider,q.under,q.capturedAt);
      const id=[g.id,playerKey(sport,q.player),q.market,q.line,q.provider].join('|');
      const old=seen.get(id);
      if(old&&time(old.quoteAt)>=atQuote)continue;
      const matching=baseline.get(k);
      seen.set(id,{sport,kind:'Player',game:String(g.id),matchup:g.a+' @ '+g.h,start:g.start,subject:q.player,
        market:q.market,line:q.line,odds:+q.under,quoteAt:q.capturedAt,provider:q.provider,liquidity:null,
        executable:!!q.provider,...matching});
    }
    offers.push(...seen.values());
  }
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
  const reliability=historyMetrics(input);
  const rows=offers.map(row=>{
    const cohort=group(row.sport,row.market,row.provider);
    const test=reliability[cohort],classification=classify(row,test);
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
