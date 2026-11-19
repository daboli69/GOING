import {kickoff,nflName} from './nfl-availability.mjs';
import {nflOut} from './nfl-workload.mjs';
import {impliedChance,offenseTd} from './nfl-td.mjs';
import {final} from './ui.mjs';

const minimumDecimal=21;
const freshFor=120*60_000;
export const tdDefenseMetrics={
  rush:'Rushing TDs',goalLine:'Rush TDs from the 5 or closer',pass:'Receiving TDs',redZonePass:'Receiving TDs from the red zone',
  RB:'RB receiving TDs',WR:'WR receiving TDs',TE:'TE receiving TDs'
};
const metricKeys=Object.keys(tdDefenseMetrics);
const emptyCounts=()=>Object.fromEntries(metricKeys.map(key=>[key,0]));

export function tdDefenseProfile(schedule,events,players,year,week){
  const totals=new Map();
  const entry=code=>{
    if(!totals.has(code))totals.set(code,{games:0,counts:emptyCounts()});
    return totals.get(code);
  };
  for(const game of schedule){
    const plays=events?.[game.id];
    if(+game.id.slice(0,4)!==year||game.week>=week||!final(game)||!plays?.length)continue;
    entry(game.a).games++;
    entry(game.h).games++;
    for(const play of plays){
      const id=offenseTd(play);
      if(!id||![game.a,game.h].includes(play[0]))continue;
      const {counts}=entry(play[0]===game.a?game.h:game.a);
      const yards=play[3],role=players?.[id]?.[1];
      if(play[1]==='run'){
        counts.rush++;
        if(yards>0&&yards<=5)counts.goalLine++;
      }else{
        counts.pass++;
        if(yards>0&&yards<=20)counts.redZonePass++;
        const receiver=role==='FB'?'RB':role;
        if(['RB','WR','TE'].includes(receiver))counts[receiver]++;
      }
    }
  }
  const teamGames=[...totals.values()].reduce((sum,t)=>sum+t.games,0);
  const league=Object.fromEntries(metricKeys.map(key=>[key,teamGames?
    [...totals.values()].reduce((sum,t)=>sum+t.counts[key],0)/teamGames:null]));
  for(const result of totals.values()){
    result.metrics=Object.fromEntries(metricKeys.map(key=>{
      const rate=result.counts[key]/result.games;
      const adjusted=(result.counts[key]+4*league[key])/(result.games+4);
      return [key,{rate,adjusted,rank:null}];
    }));
  }
  const ranked=[...totals.values()].filter(team=>team.games>=3);
  for(const key of metricKeys)for(const team of ranked){
    const m=team.metrics[key];
    m.rank=1+ranked.filter(other=>other.metrics[key].adjusted>m.adjusted+1e-9).length;
  }
  return {teams:totals,league,ranked:ranked.length};
}

export function sundayBeforeKickoff(game,now){
  const start=Date.parse(kickoff(game.date,game.time));
  return new Date(game.date+'T12:00:00Z').getUTCDay()===0&&start>now&&!final(game)&&
    !['LIVE','CRIT','IN','STARTED','POST','CANCELED','CANCELLED','POSTPONED','PPD','SUSPENDED'].includes(String(game.status||'').toUpperCase());
}

export function jackpotPrice(value){
  const text=String(value??'').trim();
  const price=/^[+-]?\d+$/.test(text)?Number(text):NaN;
  return Number.isSafeInteger(price)&&impliedChance(price)!=null?price:null;
}

export const jackpotKey=row=>row.game.id+'|'+row.id;
const nameKey=(game,name)=>game.id+'|'+nflName(name);
function matchingQuote(row,quotes,provider,allowName){
  const {game,p,team,id}=row;
  // Quotes arrive newest first. Require a matching ID when supplied and decline ambiguous names.
  return quotes.find(q=>provider.test(q.provider||'')&&q.date===game.date&&q.a===game.a&&q.h===game.h&&
    (!q.game||String(q.game)===String(game.id))&&(!q.team||q.team===team)&&
    (q.id!=null?String(q.id)===String(id):allowName&&nflName(q.player)===nflName(p.name)))??null;
}
export function jackpotCandidates(rows,quotes,entered,now){
  const candidates=rows.filter(row=>sundayBeforeKickoff(row.game,now)&&row.p?.name&&row.p.name!=='Unknown player'&&
    Number.isFinite(row.anytime)&&row.anytime>0&&row.anytime<=1&&!nflOut(row.status));
  const names=new Map();
  for(const row of candidates){
    const key=nameKey(row.game,row.p.name);
    names.set(key,(names.get(key)||0)+1);
  }
  const fresh=quotes.filter(q=>{
    if(q.market!=='Anytime TD'||q.line!==.5||jackpotPrice(q.over)==null)return false;
    const at=Date.parse(q.capturedAt);
    return at<=now&&now-at<=freshFor;
  }).sort((a,b)=>Date.parse(b.capturedAt)-Date.parse(a.capturedAt));
  return candidates.map(row=>{
    const allowName=names.get(nameKey(row.game,row.p.name))===1;
    const manual=jackpotPrice(entered[jackpotKey(row)]);
    return {...row,fanatics:manual==null?matchingQuote(row,fresh,/^Fanatics(?: Sportsbook)?$/i,allowName):
      {over:manual,entered:true},reference:matchingQuote(row,fresh,/^Kalshi$/i,allowName)};
  }).sort((a,b)=>b.anytime-a.anytime||a.p.name.localeCompare(b.p.name));
}

// Three different Sunday games make the price estimate a product of single-game decimal quotes.
export function jackpotTickets(rows,source,limit=4){
  const eligible=rows.filter(row=>!row.status).flatMap(row=>{
    const price=jackpotPrice(row[source]?.over);
    return price==null?[]:[{row,price,decimal:1/impliedChance(price)}];
  }).sort((a,b)=>b.row.anytime-a.row.anytime);
  const tickets=[];
  const conflict=(a,b)=>a.row.game.id===b.row.game.id||String(a.row.id)===String(b.row.id);
  for(let i=0;i<eligible.length-2;i++){
    const a=eligible[i];
    for(let j=i+1;j<eligible.length-1;j++){
      const b=eligible[j];
      if(conflict(a,b))continue;
      for(let k=j+1;k<eligible.length;k++){
        const c=eligible[k],chance=a.row.anytime*b.row.anytime*c.row.anytime;
        if(tickets.length===limit&&chance<tickets.at(-1).chance)break;
        if(conflict(a,c)||conflict(b,c))continue;
        const decimal=a.decimal*b.decimal*c.decimal;
        if(decimal<minimumDecimal-1e-10)continue;
        tickets.push({legs:[a,b,c],decimal,chance});
        tickets.sort((x,y)=>y.chance-x.chance||y.decimal-x.decimal);
        if(tickets.length>limit)tickets.pop();
      }
    }
  }
  return tickets;
}
