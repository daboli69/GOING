import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {nbaFinalBox,nbaSummaryUrl} from '../site/nba-parlay-tracking.mjs';
const cache=new URL('../.cache/nba-finals/',import.meta.url);

export function parseNbaFinal(summary,id){
  const box=nbaFinalBox(summary,id);
  if(!box||box.canceled)return box;
  const {players}=box;
  const teams=new Map(summary.header.competitions[0].competitors?.map(t=>[String(t.team?.id),t.team?.abbreviation])||[]);
  const score=summary.plays?.find(p=>p.scoringPlay===true&&Number(p.scoreValue)>0);
  const athlete=String(score?.participants?.[0]?.athlete?.id??'');
  const team=teams.get(String(score?.team?.id));
  const total=Number(score?.awayScore)+Number(score?.homeScore);
  const first=team&&players.has(athlete)&&!players.get(athlete).dnp&&[1,2,3].includes(Number(score?.scoreValue))&&
    total===Number(score.scoreValue)?{athlete,team}:null;
  return {players,first};
}

export async function loadNbaFinals(ids,{refresh=false}={}){
  await mkdir(cache,{recursive:true});
  const games=[...ids].map(String).filter(id=>/^\d+$/.test(id));
  const out=new Map();
  for(let i=0;i<games.length;i+=5)await Promise.all(games.slice(i,i+5).map(async id=>{
    const file=new URL(id+'.json',cache);
    const prior=refresh?null:await readFile(file,'utf8').then(JSON.parse).catch(()=>null);
    if(prior?.players?.length&&prior.first){out.set(id,{...prior,players:new Map(prior.players)});return;}
    try{
      const r=await fetch(nbaSummaryUrl+id,{signal:AbortSignal.timeout(6500)});
      const data=r.ok?parseNbaFinal(await r.json(),id):null;
      if(data){
        out.set(id,data);
        if(data.first)await writeFile(file,JSON.stringify({...data,players:[...data.players]}));
      }
    }catch{}
  }));
  return out;
}
