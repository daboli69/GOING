import {mean} from './math.mjs';
import {record} from './parlay-core.mjs';

export const propStats={Points:6,Threes:7,Assists:8,Rebounds:9};

export function propValue(log,stat){
  if(stat==='PRA'){
    const parts=[log[6],log[8],log[9]];
    return parts.every(Number.isFinite)?parts.reduce((sum,v)=>sum+v,0):null;
  }
  const value=log[propStats[stat]];
  return Number.isFinite(value)?value:null;
}

export function currentStint(logs,team,before){
  const history=logs.filter(log=>log[1]<before&&log[5]>0);
  return history.slice(history.findLastIndex(log=>log[2]!==team)+1);
}

// Both windows are in the current team stint. Keep the recent window out of its own baseline.
export function roleTrend(logs,size=5){
  const recent=logs.slice(-size), prior=logs.slice(0,-size);
  const summarize=rows=>{
    const metric=index=>mean(rows.map(row=>row[index]).filter(Number.isFinite));
    const minutes=metric(5), fga=metric(10);
    const made=rows.filter(row=>Number.isFinite(row[15])&&row[10]>0);
    const attempts=made.reduce((sum,row)=>sum+row[10],0);
    return {n:rows.length,starts:rows.filter(row=>row[16]===1).length,minutes,
      fga,three:metric(11),fta:metric(12),points:metric(6),assists:metric(8),rebounds:metric(9),
      fg:attempts?made.reduce((sum,row)=>sum+row[15],0)/attempts:null};
  };
  const a=summarize(recent),b=summarize(prior);
  const change=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)?x-y:null;
  const comparable=a.n>=3&&b.n>=5;
  return {recent:a,prior:b,comparable,
    minutes:comparable?change(a.minutes,b.minutes):null,
    attempts:comparable?change(a.fga,b.fga):null};
}

// Require each teammate to have appeared for this team before the comparison starts.
export function sharedAvailability(logs,teammates){
  if(!teammates.length)return null;
  const first=teammates.reduce((date,p)=>p.firstDate>date?p.firstDate:date,'');
  const together=[],without=[];
  for(const log of logs){
    if(log[1]<first)continue;
    const available=teammates.filter(p=>p.ids.has(log[0])).length;
    if(available===teammates.length)together.push(log);
    if(!available)without.push(log);
  }
  return {together,without};
}

const previousDay=day=>new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);

export function evidenceGroups(logs,{opponent,team,venue,day,teamGames,without=[]}){
  const history=logs.filter(log=>log[1]<day&&log[5]>0);
  const b2b=new Map();
  for(const [code,games] of Object.entries(teamGames)){
    const dates=new Set(games.filter(log=>log[1]<day).map(log=>log[1]));
    b2b.set(code,dates);
  }
  return [
    ['Last 5',history.slice(-5)],['Last 10',history.slice(-10)],['Last 20',history.slice(-20)],
    ['Season',history],['Home',history.filter(log=>log[4]==='home')],['Away',history.filter(log=>log[4]==='away')],
    ['Tonight’s venue',history.filter(log=>log[4]===venue)],['Vs '+opponent,history.filter(log=>log[3]===opponent)],
    ['Back-to-back',history.filter(log=>b2b.get(log[2])?.has(previousDay(log[1])))],
    ['Started',history.filter(log=>log[16]===1)],['Off the bench',history.filter(log=>log[16]===0)],
    ...(without.length?[['Current absences',without]]:[])
  ].map(([label,sample])=>({label,sample,todayBackToBack:!!b2b.get(team)?.has(previousDay(day))}));
}

export function exactRecord(logs,stat,line,side){
  return record(logs.map(log=>propValue(log,stat)).filter(Number.isFinite),line,side);
}

export function firstBasketHistory(logs,byGame,id,opponent,window){
  const covered=logs.filter(log=>log[16]===1&&byGame[log[0]]?.firstPts);
  const sample=window==='Head-to-head'?covered.filter(log=>log[3]===opponent):
    window==='Season'?covered:covered.slice(-Number(window.slice(5)));
  return {n:sample.length, firstPoints:sample.filter(log=>String(byGame[log[0]].firstPts)===String(id)).length,
    firstShots:sample.filter(log=>byGame[log[0]].firstShot).length,
    tookFirstShot:sample.filter(log=>String(byGame[log[0]].firstShot)===String(id)).length};
}

export function teamStrength(games){
  const valid=games.filter(g=>[4,5,7,10,11,13].every(i=>Number.isFinite(g[i])));
  const possessions=valid.reduce((sum,g)=>sum+g[7]+.44*g[10]-g[11]+g[13],0);
  const scoring=index=>possessions>0?100*valid.reduce((sum,g)=>sum+g[index],0)/possessions:null;
  const offense=scoring(4), defense=scoring(5);
  return {n:valid.length,offense,defense,net:offense==null?null:offense-defense,pace:valid.length?possessions/valid.length:null};
}
