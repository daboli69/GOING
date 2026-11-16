const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const bound=(value,max)=>Math.max(-max,Math.min(max,value));
const stint=(games,team)=>games.slice(games.findLastIndex(game=>game.team!==team)+1);
const nameKey=name=>name.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();

// Games and recent team game IDs are ordered from oldest to newest.
export function rotationTeammates(team,roster,report,recentGames){
  const statusByName=new Map((report||[]).map(row=>[nameKey(row.name),row.status]));
  return roster.flatMap(({id,name,games})=>{
    const played=stint(games.filter(game=>game.minutes>0),team);
    if(!played.length||mean(played.slice(-10).map(game=>game.minutes))<12)return [];
    const ids=new Set(played.map(game=>game.id));
    const status=statusByName.get(nameKey(name))?.trim();
    let current;
    if(/^(out|injured reserve|suspension|suspended)$/i.test(status||''))current='listed out';
    else if(/^(available|active|in)$/i.test(status||''))current='listed available';
    else if(!status&&Array.isArray(report)&&ids.has(recentGames.at(-1))&&recentGames.filter(id=>ids.has(id)).length>=2)current='expected in';
    if(!current)return [];
    return [{id,name,ids,firstDate:played[0].date,current}];
  });
}

export function teammateSplits(player,team,games,teammates){
  const played=stint(games,team);
  return teammates.filter(teammate=>teammate.id!==player).map(({name,ids,firstDate,current})=>{
    const withTeammate=[],withoutTeammate=[];
    for(const game of played){
      if(game.date<firstDate||!Number.isFinite(game.value))continue;
      (ids.has(game.id)?withTeammate:withoutTeammate).push(game.value);
    }
    return {name,current,withTeammate,withoutTeammate};
  });
}

// One modest adjustment keeps overlapping teammate absences from stacking.
export function lineupEffect(splits,line,side){
  if(!Number.isFinite(line))return null;
  const record=values=>{
    const decisions=values.filter(value=>value!==line);
    return {avg:mean(values),n:decisions.length,hits:decisions.filter(value=>side==='Over'?value>line:value<line).length};
  };
  let best=null;
  for(const {name,current,withTeammate,withoutTeammate} of splits){
    if(withTeammate.length<3||withoutTeammate.length<3)continue;
    const withPlayer=record(withTeammate),withoutPlayer=record(withoutTeammate);
    const sample=Math.min(withPlayer.n,withoutPlayer.n);
    if(sample<3)continue;
    const active=current==='listed out'?withoutPlayer:withPlayer;
    const baseline=(withPlayer.hits+withoutPlayer.hits)/(withPlayer.n+withoutPlayer.n);
    const adjustment=bound((active.hits/active.n-baseline)*sample/(sample+8)*.35,.03);
    if(Math.abs(adjustment)<.005||best&&Math.abs(adjustment)<=Math.abs(best.adjustment))continue;
    best={name,current,withPlayer,withoutPlayer,adjustment};
  }
  return best;
}

export function lineupReason({name,current,withPlayer,withoutPlayer,adjustment}){
  const stats=group=>group.avg.toFixed(1)+' avg ('+group.hits+'/'+group.n+' hits)';
  const points=(adjustment>0?'+':'')+(100*adjustment).toFixed(1);
  return name+' '+current+' · '+stats(withPlayer)+' with vs '+stats(withoutPlayer)+' without · hit estimate '+points+' pp';
}
