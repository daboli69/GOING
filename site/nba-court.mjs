import {leaderShares,mean} from './math.mjs';

const positions=['PG','SG','SF','PF','C'];
export const courtThresholds=[40,45,50,55,60];
export const courtOut=status=>/^(out|inactive|injured reserve|suspended|suspension|not with team)$/i.test(String(status||'').trim());
export const pra=log=>[log[6],log[8],log[9]].every(Number.isFinite)?log[6]+log[8]+log[9]:null;

function positionRate(rows,pos){
  const sample=rows.filter(row=>row.pos===pos);
  const minutes=sample.reduce((sum,row)=>sum+row.minutes,0);
  return minutes?48*sample.reduce((sum,row)=>sum+row.value,0)/minutes:null;
}

export function courtDefense(players){
  const rows=[], opponents=new Map();
  for(const player of players)for(const log of player.logs){
    const value=pra(log);
    if(value==null||!(log[5]>0))continue;
    const row={value,minutes:log[5],pos:player.pos,game:log[0]};
    rows.push(row);
    if(!opponents.has(log[3]))opponents.set(log[3],[]);
    opponents.get(log[3]).push(row);
  }
  const rates=sample=>Object.fromEntries(positions.map(pos=>[pos,positionRate(sample,pos)]));
  const teams=new Map([...opponents].map(([team,sample])=>{
    const highs=new Map();
    for(const row of sample)highs.set(row.game,Math.max(highs.get(row.game)??0,row.value));
    const top=[...highs.values()];
    return [team,{gp:top.length,top:mean(top),rates:rates(sample),
      counts:courtThresholds.map(n=>top.filter(value=>value>=n).length)}];
  }));
  return {teams,league:rates(rows)};
}

export function courtField(players,games,defense,statusFor=()=>null){
  const matchups=new Map(games.flatMap(g=>[[g.a,g],[g.h,g]]));
  const excluded=[], rows=[];
  for(const player of players){
    const g=matchups.get(player.team);
    if(!g||!(player.min>=12))continue;
    const status=statusFor(player);
    if(courtOut(status)){excluded.push(player.name);continue;}
    const values=player.logs.filter(log=>log[5]>0).map(pra).filter(value=>value!=null);
    if(!values.length)continue;
    const opp=g.a===player.team?g.h:g.a;
    const board=defense.teams.get(opp), allowed=board?.rates[player.pos], baseline=defense.league[player.pos];
    const mod=allowed!=null&&baseline?Math.min(1.15,Math.max(.85,allowed/baseline)):1;
    const av=mean(values), sd=Math.sqrt(mean(values,value=>(value-av)**2));
    rows.push({...player,g,opp,av,projected:av*mod,sd:Math.max(4,sd*mod),oppTop:board?.top,mod,status,
      counts:courtThresholds.map(n=>values.filter(value=>value>=n).length)});
  }
  const shares=leaderShares(rows,row=>row.projected,row=>row.sd,10000);
  for(const row of rows)row.lead=shares.get(row.id);
  rows.sort((a,b)=>b.lead-a.lead||b.av-a.av);
  return {rows,excluded};
}
