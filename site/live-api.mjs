import {LIVE_API} from './config.mjs';
import {dataURL,dateKey,final,liveGame} from './ui.mjs';

export async function liveGet(path,file,fallback,valid=value=>value!==null){
  if(LIVE_API&&path){
    try{
      const response=await fetch(LIVE_API.replace(/\/$/,'')+path,{signal:AbortSignal.timeout(3000),cache:'no-cache'});
      if(response.ok){
        const value=await response.json();
        if(valid(value))return value;
      }
    }catch{}
  }
  if(!file)return fallback;
  try{
    const response=await fetch(dataURL(file),{cache:'no-cache'});
    if(!response.ok)throw new Error(response.status);
    return await response.json();
  }catch(error){
    if(fallback===undefined)throw error;
    return fallback;
  }
}

export const liveSlate=(sport,day)=>liveGet('/slate/'+sport+'/'+day,'live/slate-'+sport+'-'+day+'.json',null,Array.isArray);
export const liveScores=sport=>liveGet('/scores/'+sport,null,null,value=>Array.isArray(value?.games));
export const liveModels=(name,fallback)=>liveGet('/models/'+name,'models/'+name+'.json',fallback,value=>
  name==='nfl'?Array.isArray(value?.games):name==='nba'?!!value?.days:!!value&&(!!value.nfl||!!value.nba));
export const liveOdds=(sport,day)=>liveGet(null,'live/odds-'+sport+(sport==='nfl'?'':'-'+day)+'.json',null);

const aliases={nfl:{WSH:'WAS',LAR:'LA',JAC:'JAX'},nba:{NY:'NYK',GS:'GSW',NO:'NOP',SA:'SAS',UTAH:'UTA',WSH:'WAS'}};
export function withScores(sport,games,board){
  if(!board)return games;
  const team=t=>aliases[sport]?.[t]||t;
  const key=g=>[g.date||(g.iso&&dateKey(new Date(g.iso))),team(g.a),team(g.h)].join('/');
  const byId=new Map(board.games.map(g=>[String(g.id),g])), byGame=new Map(board.games.map(g=>[key(g),g]));
  return games.map(g=>{
    const score=byId.get(String(g.espn||g.id))||byGame.get(key(g));
    if(!score||final(g))return g;
    if(score.status==='FUT')return g.iso?g:{...g,iso:score.iso};
    return {...g,iso:g.iso||score.iso,status:score.status,sa:score.sa,sh:score.sh};
  });
}

const easternClock=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function gamesOn(games){
  const now=Date.now();
  const local=Date.parse(easternClock.format(new Date(now)).replace(' ','T')+':00Z');
  return games.some(g=>{
    if(final(g))return false;
    const elapsed=g.iso?now-Date.parse(g.iso):local-Date.parse(g.date+'T'+g.time+':00Z');
    return elapsed<8*3600000&&(liveGame(g)||elapsed>-15*60000);
  });
}
