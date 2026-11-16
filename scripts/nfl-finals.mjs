import {nflName,nflTeamCode} from '../site/nfl-availability.mjs';
import {outcome} from '../site/track-core.mjs';

const root='https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=';
const fields={rushing:{'Rush Attempts':'rushingAttempts',Rushing:'rushingYards'},
  receiving:{Receptions:'receptions',Receiving:'receivingYards'},passing:{Passing:'passingYards'}};
const count=x=>typeof x==='number'||typeof x==='string'&&/^-?\d+$/.test(x)?Number(x):NaN;

export function parseNflFinal(summary,game){
  const final=summary?.header?.competitions?.find(c=>String(c.id)===String(game.espn)&&
    c.status?.type?.completed===true&&/^STATUS_FINAL/.test(c.status.type.name));
  if(!final)return null;
  const away=final.competitors?.find(t=>t.homeAway==='away'),home=final.competitors?.find(t=>t.homeAway==='home');
  const a=count(away?.score),h=count(home?.score);
  if(nflTeamCode(away?.team?.abbreviation)!==game.a||nflTeamCode(home?.team?.abbreviation)!==game.h||
    !Number.isInteger(a)||!Number.isInteger(h))return null;
  const players=new Map();
  for(const team of summary.boxscore?.players||[]){
    const code=nflTeamCode(team.team?.abbreviation);
    if(code!==game.a&&code!==game.h)continue;
    for(const group of team.statistics||[]){
      const keys=group.keys||[], stats=fields[group.name];
      if(!stats)continue;
      for(const row of group.athletes||[]){
        const id=row.athlete?.id, name=nflName(row.athlete?.displayName);
        if(id==null||!name||row.didNotPlay===true)continue;
        const key=code+'|'+name, previous=players.get(key);
        if(previous===null||previous&&String(previous.id)!==String(id)){players.set(key,null);continue;}
        const p=previous||{id,stats:{}};
        for(const [market,field] of Object.entries(stats)){
          const value=count(row.stats?.[keys.indexOf(field)]);
          if(Number.isInteger(value))p.stats[market]=value;
        }
        if(group.name==='passing'){
          const completions=row.stats?.[keys.indexOf('completions/passingAttempts')]?.match?.(/^(\d+)\/(\d+)$/);
          if(completions){p.stats.Completions=Number(completions[1]);p.stats['Pass Attempts']=Number(completions[2]);}
        }
        players.set(key,p);
      }
    }
  }
  return {a,h,players};
}

export function nflBoxGrade(box,{team,player,market,line,side},now){
  const value=box?.players.get(team+'|'+nflName(player))?.stats[market];
  if(!Number.isFinite(value))return null;
  return {value,result:outcome(value,line,side),graded:new Date(now).toISOString(),resultSource:'ESPN final box score'};
}

export async function loadNflFinals(schedule,ids){
  const games=schedule.filter(g=>ids.has(g.id)&&/^\d+$/.test(g.espn||''));
  const boxes=new Map();
  for(let i=0;i<games.length;i+=5)await Promise.all(games.slice(i,i+5).map(async g=>{
    try{
      const r=await fetch(root+g.espn,{signal:AbortSignal.timeout(6500)});
      const result=r.ok?parseNflFinal(await r.json(),g):null;
      if(result)boxes.set(g.id,result);
    }catch{}
  }));
  return boxes;
}
