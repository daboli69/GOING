import {teamCode} from './market-watch-data.mjs';

const key=(name,code)=>name.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase()+'|'+teamCode('nba',code);

export function parseTrackingRows(body,field){
  const sets=body?.resultSets;
  if(!Array.isArray(sets))return [];
  const data=sets.find(r=>Array.isArray(r.headers)&&r.headers.includes(field));
  if(!Array.isArray(data?.rowSet))return [];
  const indices=['PLAYER_NAME','TEAM_ABBREVIATION','GP',field].map(label=>data.headers.indexOf(label));
  if(indices.includes(-1))return [];
  return data.rowSet.flatMap(row=>{
    const [name,team,games,value]=indices.map(i=>row?.[i]);
    return typeof name==='string'&&typeof team==='string'&&Number.isInteger(games)&&games>0&&
      Number.isFinite(value)&&value>=0?[[name,team,games,value]]:[];
  });
}

export function playerTracking(snapshot,day){
  const result=new Map();
  const age=Date.parse(day)-Date.parse(snapshot?.through);
  if(!(age>0&&age<=3*86400000))return ()=>null;
  for(const [metric,rows] of [['potential',snapshot.assists],['chances',snapshot.chances]]){
    const seen=new Set();
    for(const [name,team,games,value] of Array.isArray(rows)?rows:[]){
      if(typeof name!=='string'||!Number.isFinite(value)||!Number.isInteger(games))continue;
      const id=key(name,team), row=result.get(id)||{};
      row[metric]=seen.has(id)?null:{games,value};
      seen.add(id);result.set(id,row);
    }
  }
  return player=>result.get(key(player.name,player.team))||null;
}
