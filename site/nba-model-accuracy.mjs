import {add,blank,rate} from './track-core.mjs';

const members=['Logistic regression','Random forest','XGBoost','Histogram gradient boosting','RBF support-vector model','MLP neural network'];
const models=['combined',...members];
const validProbability=p=>Number.isFinite(p)&&p>=0&&p<=1;
const pregame=(observed,start)=>Number.isFinite(Date.parse(observed))&&Date.parse(observed)<Date.parse(start);

function trackerGames(picks){
  const games=new Map();
  for(const p of picks){
    if(p?.sport!=='nba'||p.kind!=='model'||p.market!=='Winner'||!models.includes(p.id)||
      !['won','lost'].includes(p.result)||!pregame(p.at,p.start)||!p.game||!p.a||!p.h||p.a===p.h||![p.a,p.h].includes(p.side))continue;
    const tool=p.id==='combined'?'nba-model':'nba-model:'+p.id;
    const probability=p.tools?.[tool]?.prob;
    if(!validProbability(probability)||probability<.5)continue;
    const id=String(p.game), start=Date.parse(p.start), at=Date.parse(p.at);
    const homeWon=(p.side===p.h)===(p.result==='won');
    const game=games.get(id)||{date:p.date,start,a:p.a,h:p.h,homeWon,forecasts:new Map()};
    if(game.a!==p.a||game.h!==p.h||game.start!==start||game.homeWon!==homeWon)game.conflict=true;
    if(!game.forecasts.has(at))game.forecasts.set(at,new Map());
    game.forecasts.get(at).set(p.id,p.side===p.h?probability:1-probability);
    games.set(id,game);
  }
  return games;
}

function feedForecast(game){
  if(!game?.has_forecast||!pregame(game.headline?.saved_at,game.tipoff_utc)||!validProbability(game.headline.p_home)||
    !Array.isArray(game.models)||game.models.length!==members.length)return null;
  const forecasts=new Map(game.models.map(m=>[m?.name,m?.p_home]));
  if(!members.every(name=>validProbability(forecasts.get(name))))return null;
  forecasts.set('combined',game.headline.p_home);
  return forecasts;
}

function record(games){
  const rows=models.map(model=>{
    const stats=blank();
    for(const {forecasts,homeWon} of games){
      const p=forecasts.get(model);
      const hit=(p>=.5)===homeWon;
      add(stats,{result:hit?'won':'lost'},p>=.5?p:1-p);
    }
    return {name:model==='combined'?'Combined ensemble':model,combined:model==='combined',
      won:stats.won,lost:stats.lost,accuracy:rate(stats),brier:stats.n?stats.brier/stats.n:null};
  }).sort((a,b)=>b.won-a.won||a.brier-b.brier||a.name.localeCompare(b.name));
  return {games:games.length,from:games[0]?.date??null,through:games.at(-1)?.date??null,rows};
}

export function nbaModelAccuracy(feed,picks=[]){
  const tracked=trackerGames(picks), games=new Map();
  for(const d of Object.values(feed?.games||{})){
    const forecasts=feedForecast(d);
    if(!forecasts||!d.gid||!d.away||!d.home||d.away===d.home)continue;
    const id=String(d.gid), start=Date.parse(d.tipoff_utc), t=tracked.get(id);
    const matching=t&&t.start===start&&t.a===d.away&&t.h===d.home;
    const scoreFinal=d.completed===true&&Number.isFinite(d.away_score)&&Number.isFinite(d.home_score)&&d.away_score!==d.home_score;
    const homeWon=scoreFinal?d.home_score>d.away_score:matching?t.homeWon:null;
    if(matching&&(t.conflict||t.homeWon!==homeWon)){tracked.delete(id);continue;}
    if(homeWon==null)continue;
    games.set(id,{start,date:d.date,homeWon,forecasts});
  }
  for(const [id,t] of tracked){
    if(t.conflict||games.has(id))continue;
    // Older days roll out of the published forecast export. An entire pregame tracker capture can still be ranked.
    const captures=[...t.forecasts.entries()].sort((a,b)=>b[0]-a[0]);
    const forecasts=captures.find(([,row])=>models.every(name=>row.has(name)))?.[1];
    if(forecasts)games.set(id,{start:t.start,date:t.date,homeWon:t.homeWon,forecasts});
  }
  const sorted=[...games].sort(([id,a],[other,b])=>a.start-b.start||id.localeCompare(other)).map(([,game])=>game);
  return {all:record(sorted),recent:record(sorted.slice(-30))};
}
