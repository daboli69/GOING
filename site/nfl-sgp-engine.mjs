import {mean} from './math.mjs';
import {favorable,legKey,record} from './parlay-core.mjs';
import {assess,correlation,defaults as nflDefaults,tdMarkets} from './nfl-parlay-engine.mjs';

export const sgpDefaults={...nflDefaults,legs:3,perGame:false,skipTickets:false,spread:30};
const rushMarkets=new Set(['Rushing','Rush Attempts']);
const passMarkets=new Set(['Passing','Pass Attempts','Completions']);
const positions=new Set(['RB','TE','WR']);
const receiverPosition=pos=>pos==='FB'?'RB':pos;
const scales={rush:[.9,.08,.05],pass:[1.25,.08,.07],receiving:[1.65,.08,.08]};
export const comparableLimit=1;
export function defenseMatchMetrics({kind,target,past}){
  const labels=kind==='rush'?['Yards allowed per carry','Rush share faced','Runs of 10+ yards allowed']:
    kind==='pass'?['Yards allowed per pass attempt','Pass share faced','Throws of 15+ air yards faced']:
      ['Yards allowed per '+kind+' target',kind+' share of targets','Deep '+kind+' target rate'];
  const scale=scales[kind]||scales.receiving;
  return labels.map((label,i)=>({label,target:target[i],past:past[i],scale:scale[i],percentage:i>0}));
}
const sample=()=>({plays:0,yards:0,known:0,explosive:0});
const profile=()=>({rush:sample(),pass:sample(),RB:sample(),TE:sample(),WR:sample(),targets:0});
const add=(bucket,yards,explosive)=>{
  bucket.plays++;
  bucket.yards+=yards;
  if(explosive!=null){bucket.known++;bucket.explosive+=Number(explosive);}
};
const sum=(games,kind,key)=>games.reduce((n,g)=>n+g[kind][key],0);

export function defenseProfiles(games,events,players){
  const history=new Map(), schedule=new Map(), memo=new Map();
  for(const g of games){
    if(!events[g.id]?.length)continue;
    schedule.set(g.id,g);
    const sides={[g.a]:profile(),[g.h]:profile()};
    for(const play of events[g.id]){
      const defense=play[0]===g.a?sides[g.h]:play[0]===g.h?sides[g.a]:null;
      if(!defense)continue;
      if(play[1]==='run'&&play[12])add(defense.rush,play[2],play[2]>=10);
      if(play[1]!=='pass'||!play[10]||play[28])continue;
      const yards=play[15]?play[2]:0, deep=Number.isFinite(play[13])?play[13]>=15:null;
      add(defense.pass,yards,deep);
      if(!play[11])continue;
      defense.targets++;
      const pos=receiverPosition(players[play[11]]?.[1]);
      if(positions.has(pos))add(defense[pos],yards,deep);
    }
    for(const [team,summary] of Object.entries(sides)){
      if(!history.has(team))history.set(team,[]);
      history.get(team).push({...summary,date:g.date});
    }
  }
  function before(team,date,kind){
    const key=[team,date,kind].join('|');
    if(memo.has(key))return memo.get(key);
    const prior=(history.get(team)||[]).filter(x=>x.date<date&&x.rush.plays+x.pass.plays>0);
    const attempts=sum(prior,kind,'plays'), known=sum(prior,kind,'known');
    const volume=positions.has(kind)?prior.reduce((n,g)=>n+g.targets,0):sum(prior,'rush','plays')+sum(prior,'pass','plays');
    const minimum=kind==='pass'?40:kind==='rush'?25:15;
    const result=prior.length>=3&&attempts>=minimum&&known>=minimum&&volume>0?
      [sum(prior,kind,'yards')/attempts,attempts/volume,sum(prior,kind,'explosive')/known]:null;
    memo.set(key,result);
    return result;
  }
  return {before,schedule};
}

export function similarDefenseGames(profiles,row,statKey){
  if(tdMarkets.has(row.stat))return [];
  const pos=receiverPosition(row.player.pos);
  const kind=rushMarkets.has(row.stat)?'rush':passMarkets.has(row.stat)?'pass':positions.has(pos)?pos:null;
  if(!kind)return [];
  const scale=scales[kind]||scales.receiving, target=profiles.before(row.opp,row.date,kind);
  if(!target)return [];
  return row.player.logs.flatMap(log=>{
    const game=profiles.schedule.get(log.game);
    if(!game||game.date>=row.date||!Number.isFinite(log[statKey]))return [];
    const opponent=game.a===row.player.team?game.h:game.a;
    const past=profiles.before(opponent,game.date,kind);
    if(!past)return [];
    const distance=Math.sqrt(mean(target.map((v,i)=>((v-past[i])/scale[i])**2)));
    return distance<=comparableLimit?[{opponent,date:game.date,value:log[statKey],distance,profile:{kind,target,past}}]:[];
  }).sort((a,b)=>a.distance-b.distance).slice(0,6);
}

function screen(row,side,cfg,context){
  const leg=assess(row,side,cfg,{...context,angles:true});
  const over=side==='Over', defense=row.defense?.rank;
  const games=row.sgpComparisons||[];
  const comparable=record(games.map(g=>g.value),leg.line,side);
  const comparableBacks=comparable.n>=3&&comparable.rate>=.6;
  const rankBacks=favorable(defense,over);
  const projectionBacks=leg.angles.gap>=Math.max(.5,Math.abs(leg.line)*.08)&&leg.form.last8.rate>=.6;
  const neutral=defense?.total>=3&&!favorable(defense,!over);
  const matchupPass=rankBacks||comparableBacks||neutral&&projectionBacks;
  leg.checks['Defense vs role']=matchupPass?null:'Matchup evidence insufficient';
  leg.checks['Similar defenses']=comparable.n>=3&&comparable.rate<=.33?'Similar-defense results conflict':null;
  leg.cut=Object.values(leg.checks).find(Boolean)||null;
  leg.sgp={comparable,games};
  if(comparable.n){
    const description=comparable.hits+'/'+comparable.n+' vs similar defenses';
    if(comparable.n>=3)leg.reasons.push(description);
    else leg.flags.push(description+' · limited sample');
  }
  if(!rankBacks&&matchupPass)leg.reasons.push(comparableBacks?'Comparable defenses support this side':
    'Projection and recent form support this side against a middle-third defense');
  if(!leg.cut){
    const comparisonScore=comparable.n>=3?(comparable.hits-.5*comparable.n)/(comparable.n+4):0;
    leg.score=cfg.weights.form*leg.angles.form+cfg.weights.matchup*(leg.angles.matchup+comparisonScore)+
      cfg.weights.line*leg.angles.value+cfg.weights.context*leg.angles.impact;
  }
  delete leg.angles;
  return leg;
}

export function evaluateSameGame(rows,cfg,{now=Date.now(),taken=new Set()}={}){
  const sides=cfg.side==='Both'?['Over','Under']:[cfg.side];
  const eligible=[],screened=[],cuts=new Map();
  for(const row of rows){
    if(!cfg.stats.includes(row.stat))continue;
    for(const side of sides){
      if(row.quote[side==='Over'?'over':'under']==null)continue;
      const leg=screen(row,side,cfg,{now,taken});
      screened.push(leg);
      if(leg.cut)cuts.set(leg.cut,(cuts.get(leg.cut)||0)+1);
      else eligible.push(leg);
    }
  }
  return {eligible,screened,cuts};
}

// A bounded search finds full tickets before ranking by score. Locks still have to qualify.
export function buildSameGame(eligible,cfg,{locked=[],avoid=new Set(),excluded=new Set()}={}){
  const byKey=new Map(eligible.map(leg=>[legKey(leg),leg]));
  const fit=(leg,ticket)=>leg&&!excluded.has(legKey(leg))&&ticket.every(other=>
    leg.game===other.game&&leg.player!==other.player&&correlation(leg,other)>=0)&&
    (!tdMarkets.has(leg.stat)||ticket.filter(other=>tdMarkets.has(other.stat)).length<cfg.tdMax);
  const score=(leg,ticket)=>leg.score-cfg.weights.mix*ticket.filter(other=>other.stat===leg.stat).length-
    (avoid.has(legKey(leg))?1000:0);
  const seed={ticket:[],score:0,after:0};
  for(const key of locked){
    const leg=byKey.get(key);
    if(seed.ticket.length>=cfg.legs||!fit(leg,seed.ticket))return {ticket:[],invalidLock:true};
    seed.score+=score(leg,seed.ticket);
    seed.ticket.push(leg);
  }
  const pool=[...eligible].sort((a,b)=>b.score-a.score||legKey(a).localeCompare(legKey(b)));
  let best=seed, search=[seed];
  while(best.ticket.length<cfg.legs&&search.length){
    const next=[];
    for(const state of search)for(let i=state.after;i<pool.length;i++){
      const leg=pool[i];
      if(fit(leg,state.ticket))next.push({ticket:[...state.ticket,leg],score:state.score+score(leg,state.ticket),after:i+1});
    }
    search=next.sort((a,b)=>b.score-a.score).slice(0,32);
    if(search.length)best=search[0];
  }
  return {ticket:best.ticket,invalidLock:false};
}
