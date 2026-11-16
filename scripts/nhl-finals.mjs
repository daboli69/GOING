import {outcome} from '../site/track-core.mjs';

const root='https://api-web.nhle.com/v1/gamecenter/';
const playedSeconds=value=>{
  const m=String(value||'').match(/^(\d+):([0-5]\d)$/);
  return m?Number(m[1])*60+Number(m[2]):null;
};

export function parseNhlFinal(box,id){
  if(String(box?.id)!==String(id)||!['FINAL','OFF'].includes(box.gameState))return null;
  const teams=new Map();
  for(const side of ['awayTeam','homeTeam']){
    const team=box[side]?.abbrev, data=box.playerByGameStats?.[side];
    if(!team||!Array.isArray(data?.forwards)||!Array.isArray(data?.defense)||!Array.isArray(data?.goalies))continue;
    const skaters=[...data.forwards,...data.defense], players=new Map();
    for(const row of [...skaters,...data.goalies]){
      if(!Number.isInteger(row.playerId))continue;
      const stats={};
      if(Number.isInteger(row.goals))stats['Anytime Goals']=row.goals;
      if(Number.isInteger(row.goals)&&Number.isInteger(row.assists))stats.Points=row.goals+row.assists;
      if(Number.isInteger(row.sog))stats['Shots on Goal']=row.sog;
      if(Number.isInteger(row.saves))stats.Saves=row.saves;
      players.set(String(row.playerId),{seconds:playedSeconds(row.toi),stats});
    }
    // Never infer absence from a partial lineup response.
    const complete=skaters.length>=17&&data.goalies.length>=1&&players.size===skaters.length+data.goalies.length&&
      [...players.values()].every(row=>row.seconds!=null);
    teams.set(team,{players,complete});
  }
  return teams;
}

const markets=new Set(['Anytime Goals','Points','Shots on Goal','Saves']);
export function nhlFinalGrade(final,pick,now){
  if(!markets.has(pick.market))return null;
  const team=final?.get(pick.team);
  if(!team)return null;
  const player=team.players.get(String(pick.id));
  const voided=(!player&&team.complete)||player?.seconds===0;
  const value=voided?null:player?.stats[pick.market];
  if(!voided&&!(player?.seconds>0&&Number.isFinite(value)))return null;
  return {value,result:voided?'void':outcome(value,pick.line,pick.side),graded:new Date(now).toISOString(),
    resultSource:voided?'NHL final box score · DNP':'NHL final box score'};
}

export async function loadNhlFinals(ids){
  const out=new Map(), games=[...ids].filter(id=>/^\d+$/.test(id));
  for(let i=0;i<games.length;i+=5)await Promise.all(games.slice(i,i+5).map(async id=>{
    try{
      const r=await fetch(root+id+'/boxscore',{signal:AbortSignal.timeout(6000)});
      const final=r.ok?parseNhlFinal(await r.json(),id):null;
      if(final)out.set(id,final);
    }catch{}
  }));
  return out;
}
