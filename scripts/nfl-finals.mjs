import {nflName,nflTeamCode} from '../site/nfl-availability.mjs';
import {outcome} from '../site/track-core.mjs';

const root='https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=';
const fields={rushing:{'Rush Attempts':'rushingAttempts',Rushing:'rushingYards'},
  receiving:{Receptions:'receptions',Receiving:'receivingYards'},passing:{Passing:'passingYards'}};
const count=x=>typeof x==='number'||typeof x==='string'&&/^-?\d+$/.test(x)?Number(x):NaN;

// The scoring summary has to account for the entire final, and offensive scorers
// have to agree with the rushing and receiving TD columns in the official box.
function touchdownResults(plays,game,scores,offensiveBox){
  if(!Array.isArray(plays))return null;
  const total={[game.a]:0,[game.h]:0}, ids=new Set(), scoresByPlayer=new Map(), touchdowns=[];
  for(const play of plays){
    const team=nflTeamCode(play.team?.abbreviation), a=count(play.awayScore),h=count(play.homeScore);
    const deltaA=a-total[game.a],deltaH=h-total[game.h],points=deltaA||deltaH;
    if(play.id==null||ids.has(String(play.id))||!Object.hasOwn(total,team)||!Number.isInteger(a)||!Number.isInteger(h)||
      (team===game.a?deltaH!==0:deltaA!==0)||![1,2,3,6,7,8].includes(points))return null;
    ids.add(String(play.id));total[game.a]=a;total[game.h]=h;
    const td=play.scoringType?.name==='touchdown'||play.scoringType?.abbreviation==='TD';
    if(td!==(points>=6))return null;
    if(!td)continue;
    const text=String(play.text||'');
    const name=text.match(/^(.+?)\s+\d+\s+(?:Yd(?:s)?|Yards?)\b/i)?.[1]||
      text.match(/^(.+?)\s+Fumble Recovery in End Zone\b/i)?.[1];
    const type=play.type?.text, offensive=type==='Passing Touchdown'||type==='Rushing Touchdown';
    if(!name||!type)return null;
    touchdowns.push({name,team,offensive});
    if(offensive){
      const key=team+'|'+nflName(name);
      scoresByPlayer.set(key,(scoresByPlayer.get(key)||0)+1);
    }
  }
  if(total[game.a]!==scores.a||total[game.h]!==scores.h||offensiveBox.size!==scoresByPlayer.size||
    [...offensiveBox].some(([key,n])=>scoresByPlayer.get(key)!==n))return null;
  return touchdowns;
}

export function parseNflFinal(summary,game){
  const final=summary?.header?.competitions?.find(c=>String(c.id)===String(game.espn)&&
    c.status?.type?.completed===true&&/^STATUS_FINAL/.test(c.status.type.name));
  if(!final)return null;
  const away=final.competitors?.find(t=>t.homeAway==='away'),home=final.competitors?.find(t=>t.homeAway==='home');
  const a=count(away?.score),h=count(home?.score);
  if(nflTeamCode(away?.team?.abbreviation)!==game.a||nflTeamCode(home?.team?.abbreviation)!==game.h||
    !Number.isInteger(a)||!Number.isInteger(h))return null;
  const players=new Map(), offensiveBox=new Map();
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
        const tdField=group.name==='rushing'?'rushingTouchdowns':group.name==='receiving'?'receivingTouchdowns':null;
        const tds=tdField?count(row.stats?.[keys.indexOf(tdField)]):0;
        if(Number.isInteger(tds)&&tds>0)offensiveBox.set(key,(offensiveBox.get(key)||0)+tds);
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
  return {a,h,players,touchdowns:touchdownResults(summary.scoringPlays,game,{a,h},offensiveBox)};
}

export function gradeTdBoard(snapshot,box,now){
  if(!Array.isArray(box?.touchdowns))return null;
  const known=new Map();
  for(const [id,name,team] of snapshot.players){
    const key=team+'|'+nflName(name);
    known.set(key,known.has(key)&&known.get(key)!==id?null:id);
  }
  const player=score=>known.get(score.team+'|'+nflName(score.name))??null;
  const firstScorer=box.touchdowns[0]||null;
  const tds=[...new Set(box.touchdowns.filter(x=>x.offensive).map(player).filter(Boolean))];
  return {tds,first:firstScorer?player(firstScorer):null,firstScorer,graded:new Date(now).toISOString(),
    resultSource:'ESPN final scoring summary'};
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
