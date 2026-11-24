// College projections shared by the snapshot, dashboards, and Pick Tracker.
import {americanNumber,outcome} from './track-core.mjs';

export const collegeSports={
  cbb:{path:'basketball/mens-college-basketball',group:50,archive:'espn_mens_college_basketball'},
  cwb:{path:'basketball/womens-college-basketball',group:50,archive:'espn_womens_college_basketball'},
  fbs:{path:'football/college-football',group:80}
};
export const isCollege=s=>Object.hasOwn(collegeSports,s);
export const collegeSeason=(sport,date)=>{
  const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));
  return sport==='fbs'?year-(month<8):year+(month>=10);
};
export const number=v=>v==null||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
export function collegeStatus(type,timeValid=true){
  if(type?.completed&&/^STATUS_FINAL/.test(type.name))return 'final';
  if(/CANCEL/i.test(type?.name||''))return 'canceled';
  if(type?.name==='STATUS_POSTPONED')return 'postponed';
  if(type?.state==='in')return 'live';
  if(type?.name==='STATUS_SCHEDULED'&&timeValid!==false)return 'scheduled';
  return 'other';
}
export const minCollegeGames=3;
export const collegeHomeElo=45;
const expected=(a,b)=>1/(1+10**((b-a)/400));
const avg=(rows,get)=>{
  const values=rows.map(get).filter(Number.isFinite);
  return values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null;
};
const stats=(rows,key)=>avg(rows,r=>r.box?.[key]);
const proportion=(rows,made,attempted)=>{
  const valid=rows.filter(r=>r.box?.[made]!=null&&r.box?.[attempted]>0);
  return valid.length?valid.reduce((n,r)=>n+r.box[made],0)/valid.reduce((n,r)=>n+r.box[attempted],0):null;
};
function teamProfile(team){
  const rows=team.rows;
  return {id:team.id,name:team.name,code:team.code,n:rows.length,elo:team.elo,
    wins:rows.filter(r=>r.for>r.against).length,losses:rows.filter(r=>r.for<r.against).length,
    pf:avg(rows,r=>r.for),pa:avg(rows,r=>r.against),recentMargin:avg(rows.slice(-5),r=>r.for-r.against),
    pace:stats(rows,'pace'),offRtg:avg(rows,r=>r.box?.pace>0?100*r.for/r.box.pace:null),
    defRtg:avg(rows,r=>r.box?.pace>0?100*r.against/r.box.pace:null),
    threes:proportion(rows,'fg3','fga3'),threeRate:proportion(rows,'fga3','fga'),
    paint:stats(rows,'paint'),rebounds:stats(rows,'rebounds'),turnovers:stats(rows,'turnovers')};
}
export function collegeHistory(finals){
  const byTeam=new Map();
  const get=t=>{
    if(!byTeam.has(t.id))byTeam.set(t.id,{...t,elo:1500,rows:[]});
    return byTeam.get(t.id);
  };
  let total=0,n=0;
  const games=[...finals].filter(g=>g.aScore!=null&&g.hScore!=null).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
  for(const g of games){
    const a=get(g.away),h=get(g.home),p=expected(h.elo,a.elo);
    const move=24*((g.hScore===g.aScore?0.5:Number(g.hScore>g.aScore))-p);
    h.elo+=move;a.elo-=move;
    h.rows.push({for:g.hScore,against:g.aScore,box:g.hBox});
    a.rows.push({for:g.aScore,against:g.hScore,box:g.aBox});
    total+=g.hScore+g.aScore;n+=2;
  }
  return {teams:Object.fromEntries([...byTeam].map(([id,t])=>[id,teamProfile(t)])),leaguePoints:n?total/n:null};
}
export function collegeForecast(game,history){
  const a=history.teams[game.away.id],h=history.teams[game.home.id];
  if(!a||!h||Math.min(a.n,h.n)<minCollegeGames)return null;
  const pHome=expected(h.elo+(game.neutral?0:collegeHomeElo),a.elo);
  const scoring=(t,key)=>(t[key]*t.n+history.leaguePoints*4)/(t.n+4);
  const homePts=(scoring(h,'pf')+scoring(a,'pa'))/2;
  const awayPts=(scoring(a,'pf')+scoring(h,'pa'))/2;
  return {version:'college-v1',pHome,aN:a.n,hN:h.n,awayPts,homePts};
}

export const minCbbMarketGap=1;
export function collegeMarketReads(sport,g){
  const f=g.forecast,m=g.market;
  if(!f||!m)return {spread:null,total:null};
  const margin=sport==='cbb'?f.marketMargin:f.homePts-f.awayPts;
  const cutoff=sport==='cbb'?minCbbMarketGap:0;
  const read=(diff,a,b,quote,proj)=>{
    const edge=Math.abs(diff);
    const side=edge>0&&edge>=cutoff?(diff>0?a:b):null;
    const line=quote[side||b].line;
    return {side,line,odds:side?americanNumber(quote[side].odds):null,proj:proj(side),edge};
  };
  const spread=Number.isFinite(margin)&&Number.isFinite(m.spread?.home?.line)&&m.spread.away?.line===-m.spread.home.line?
    read(margin+m.spread.home.line,'home','away',m.spread,side=>side==='away'?-margin:margin):null;
  const total=Number.isFinite(f.homePts)&&Number.isFinite(f.awayPts)&&Number.isFinite(m.total?.line)&&m.total.line>0?
    read(f.homePts+f.awayPts-m.total.line,'Over','Under',
      {Over:{line:m.total.line,odds:m.total.over},Under:{line:m.total.line,odds:m.total.under}},()=>f.homePts+f.awayPts):null;
  return {spread,total};
}

export function collegePicks(sport,g){
  const f=g.forecast;
  if(!f)return [];
  const market=g.market||{},picks=[];
  const add=(tool,kind,name,side,line,odds,proj,prob,edge,version=f.version)=>{
    const rating=kind==='game'?(edge<3?'Under 3 pts':edge<7?'3 to under 7 pts':'7+ pts'):null;
    picks.push({k:['college',sport,g.id,tool].join('|'),sport,kind,game:g.id,date:g.date,start:g.start,
      a:g.away.id,h:g.home.id,awayName:g.away.name,homeName:g.home.name,market:name,side,line,odds,
      provider:odds!=null?market.provider:null,proj,version,tools:{[tool]:{prob,edge,lean:true,rating}}});
  };
  const winner=f.pHome>0.5?'home':'away';
  if(f.pHome!==0.5)add(sport+'-baseline','model','Winner',winner,null,sport==='fbs'?market.moneyline?.[winner]??null:null,null,Math.max(f.pHome,1-f.pHome),null);
  if(sport==='fbs'||sport==='cbb'){
    const {spread,total}=collegeMarketReads(sport,g);
    if(spread?.side&&spread.odds!=null)add(sport+'-spread','game','Spread',spread.side,spread.line,spread.odds,spread.proj,null,spread.edge,
      sport==='cbb'?'cbb-margin-v1':f.version);
    if(total?.side&&total.odds!=null)add(sport+'-total','game','Game total',total.side,total.line,total.odds,total.proj,null,total.edge);
  }
  return picks;
}
export function collegeScheduleChange(p,game){
  if(!p||!game||(game.a&&game.a!==p.a)||(game.h&&game.h!==p.h))return null;
  if(game.status==='postponed')return 'Postponed';
  // Early corrections and ordinary delays still belong to the original slot.
  const moved=Math.abs(Date.parse(game.start)-Date.parse(p.start));
  return ['scheduled','live','final'].includes(game.status)&&moved>=12*3600000?'Rescheduled':null;
}
export function collegeCaptureKey(pick,prior,game){
  if(!prior)return pick.k;
  if(prior.rescheduled&&Date.parse(game.marketAt)<=Date.parse(prior.graded))return null;
  return prior.rescheduled||!prior.result&&collegeScheduleChange(prior,game)?pick.k+'|'+pick.date:pick.k;
}
export function collegeSettlement(p,final){
  if(!final||(final.a&&final.a!==p.a)||(final.h&&final.h!==p.h))return null;
  const change=collegeScheduleChange(p,final);
  if(change)return {result:'void',value:change,rescheduled:true};
  if(final?.status==='canceled')return {result:'void',value:'Canceled'};
  if(final?.status!=='final'||final.aScore==null||final.hScore==null)return null;
  const {aScore:a,hScore:h}=final,margin=p.side==='home'?h-a:a-h;
  const result=p.market==='Winner'?outcome(margin,0,'Over'):
    p.market==='Spread'?outcome(margin,-p.line,'Over'):
    p.market==='Game total'?outcome(h+a,p.line,p.side):null;
  return result?{result,value:p.market==='Game total'?h+a:p.market==='Spread'?margin:`${p.awayName} ${a}, ${p.homeName} ${h}`}:null;
}
export const collegePickLabel=p=>p.side==='home'?p.homeName:p.side==='away'?p.awayName:p.side;
