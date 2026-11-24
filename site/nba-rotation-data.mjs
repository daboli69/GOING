import {teamCode} from './market-watch-data.mjs';

export const summaryUrl='https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=';

function seconds(value){
  if(typeof value!=='string'||!/^\d+(?::[0-5]\d)?(?:\.\d+)?$/.test(value))return null;
  const parts=value.split(':').map(Number);
  return parts.length===1?parts[0]:60*parts[0]+parts[1];
}

function teamBox(summary,id,code){
  if(String(summary?.header?.id)!==String(id))return null;
  const box=summary.boxscore?.players?.find(row=>teamCode('nba',row.team?.abbreviation)===teamCode('nba',code));
  const stats=box?.statistics?.find(row=>row.labels?.includes('MIN'));
  const rows=(stats?.athletes||[]).filter(row=>row.athlete?.id!=null&&!row.didNotPlay&&!row.didNotDress);
  const starters=rows.filter(row=>row.starter===true).map(row=>String(row.athlete.id));
  return box?.team?.id!=null&&new Set(starters).size===5?{team:String(box.team.id),rows,starters,stats}:null;
}

export function officialStarters(summary,id,code){
  const state=summary?.header?.competitions?.[0]?.status?.type?.state;
  if(!['in','post'].includes(state))return null;
  return teamBox(summary,id,code)?.starters||null;
}

// Use event order, not clock alone: a made free throw and a substitution can share a clock.
export function nbaRotation(summary,id,code){
  const box=teamBox(summary,id,code);
  const status=summary?.header?.competitions?.[0]?.status;
  const plays=summary?.plays;
  if(!box||!status?.type?.completed||!Array.isArray(plays)||!plays.length)return null;
  const periods=plays.at(-1)?.period?.number;
  if(!Number.isInteger(periods)||periods<4||periods>8)return null;
  const minIndex=box.stats.labels.indexOf('MIN');
  const official=new Map(box.rows.flatMap(row=>{
    const raw=row.stats?.[minIndex], time=seconds(raw);
    return time==null?[]:[[String(row.athlete.id),raw.includes(':')?time:time*60]];
  }));
  const floor=new Set(box.starters), totals=new Map(), stints=[];
  const competitors=summary.header.competitions[0].competitors;
  const opponent=competitors?.find(row=>String(row.team?.id)!==box.team);
  if(!opponent?.team?.id)return null;
  const opponentId=String(opponent.team.id);
  let period=1, at=720, own=0, allowed=0, changes=0, last=720;
  function flush(to){
    if(to===at&&!own&&!allowed)return;
    const ids=[...floor].sort();
    stints.push({period,from:at,to,ids,own,allowed});
    for(const id of ids)totals.set(id,(totals.get(id)||0)+at-to);
    at=to; own=0; allowed=0;
  }
  for(let i=0;i<plays.length;){
    const play=plays[i], p=play.period?.number, clock=seconds(play.clock?.displayValue);
    i++;
    if(clock==null||!Number.isInteger(p)||p<period||p>period+1||p>periods)return null;
    if(p!==period){flush(0);period=p;at=p<=4?720:300;last=at;}
    if(clock>last+0.01)return null;
    last=clock;
    const team=String(play.team?.id??'');
    if(play.type?.text==='Substitution'&&team===box.team){
      flush(clock);
      const [enter,leave]=(play.participants||[]).map(row=>String(row.athlete?.id||''));
      if(!enter||!leave||enter===leave||!floor.has(leave)||floor.has(enter)||!official.has(enter))return null;
      floor.delete(leave);floor.add(enter);changes++;
    }else if(play.scoringPlay){
      if(![1,2,3].includes(play.scoreValue)||![box.team,opponentId].includes(team))return null;
      if(team===box.team)own+=play.scoreValue;else allowed+=play.scoreValue;
    }
  }
  if(!changes||period!==periods)return null;
  flush(0);
  if(official.size<5||[...official].some(([id,time])=>Math.abs((totals.get(id)||0)-time)>61))return null;
  const forPoints=Number(competitors.find(row=>String(row.team?.id)===box.team)?.score);
  const against=Number(opponent.score);
  if(stints.reduce((sum,s)=>sum+s.own,0)!==forPoints||stints.reduce((sum,s)=>sum+s.allowed,0)!==against)return null;
  return {id:String(id),starters:box.starters,stints,totals};
}

export function rotationSummary(games){
  const lineups=new Map(), players=new Map();
  const typical=new Map();
  const names=new Set(games.flatMap(g=>[...g.totals.keys()]));
  let elapsed=0, net=0;
  for(const game of games)for(const s of game.stints){
    const duration=s.from-s.to, margin=s.own-s.allowed, key=s.ids.join('|');
    const lineup=lineups.get(key)||{ids:s.ids,seconds:0,for:0,against:0,games:new Set()};
    lineup.seconds+=duration;lineup.for+=s.own;lineup.against+=s.allowed;lineup.games.add(game.id);
    lineups.set(key,lineup);
    elapsed+=duration;net+=margin;
    for(const id of s.ids){
      const on=players.get(id)||{seconds:0,net:0};
      on.seconds+=duration;on.net+=margin;players.set(id,on);
      if(s.period>4)continue;
      const map=typical.get(id)||Array(48).fill(0);
      const start=(s.period-1)*720+720-s.from, end=start+duration;
      for(let m=Math.floor(start/60);m<Math.ceil(end/60);m++)map[m]+=Math.max(0,Math.min(end,(m+1)*60)-Math.max(start,m*60));
      typical.set(id,map);
    }
  }
  return {
    lineups:[...lineups.values()].filter(row=>row.seconds>0).sort((a,b)=>b.seconds-a.seconds),
    onOff:[...names].map(id=>{
      const on=players.get(id)||{seconds:0,net:0}, off=elapsed-on.seconds;
      const per48=(points,time)=>time>=60?points*2880/time:null;
      return {id,seconds:on.seconds,on:per48(on.net,on.seconds),off:per48(net-on.net,off),typical:typical.get(id)};
    }).sort((a,b)=>b.seconds-a.seconds)
  };
}
