// First basket model for GOING UP. One formula:
//   P(player scores first) = P(his team scores first) × P(he is the scorer | his team scores first)
// Team side: the tip (shrunk toward 50%) decides who has the first possession; each team then scores on a possession
// with a matchup probability built from its opening-possession scoring and what the opponent allows there.
// Player side: his share of the team's attempts in the first 8 possessions, blended with his share of first shots and
// shrunk toward his usage, times his chance of converting. Conversion is a league-average early make rate for everyone,
// moved only by a real shot-type edge (his makes by type and the defense's allowed rate by type), plus free throws.
// Data: first[game].poss from scripts/normalize.py ([team, points, shooters, free-throw shooter, scorer] for each of the
// first 16 possessions), shot rows tagged with the team possession number, and box-score logs.

export const settings={tipPrior:6,possPrior:20,shareGames:8,earlyPossessions:8,firstShotWeight:.25,
  playerShotPrior:40,defenseShotPrior:200,edgeCap:.15,benchFloor:.03};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const shotGroup=s=>s[6]===3?'three':['Drive','Cut','Lob','Putback','Inside'].includes(s[8])||s[5]<6?'rim':'mid';

// Tip: each team's rate shrunk toward 50% (6 wins and 6 losses added), then combined head to head (log5).
export const shrinkTip=(wins,n,prior=settings.tipPrior)=>(wins+prior)/(n+2*prior);
export function tipChance(a,b){const x=a*(1-b),y=b*(1-a);return x+y?x/(x+y):.5;}

// Possessions alternate from the tip; the first team to score on its possession scores first. Sums to 1 with the other side.
export function firstScoreChance(tipA,pA,pB){
  const cycle=1-(1-pA)*(1-pB);
  return tipA*pA/cycle+(1-tipA)*(1-pB)*pA/cycle;
}

// Per-team opening tables from every game before the slate day.
export function openingTables(first,beforeDay){
  const team={}, t=k=>team[k]??={tipW:0,tipN:0,offScored:0,offTrials:0,defScored:0,defTrials:0,games:0};
  let scored=0,trials=0;
  for(const z of Object.values(first||{})){
    if(!z.poss?.length||!(z.date<beforeDay))continue;
    const sides=[...new Set(z.poss.map(p=>p[0]))];
    if(sides.length!==2)continue;
    for(const s of sides){
      const o=sides.find(x=>x!==s), mine=z.poss.filter(p=>p[0]===s), k=mine.findIndex(p=>p[1]>0);
      const n=k>=0?k+1:mine.length, hit=k>=0?1:0;
      t(s).offScored+=hit;t(s).offTrials+=n;t(o).defScored+=hit;t(o).defTrials+=n;t(s).games++;
      scored+=hit;trials+=n;
      if(z.tip){t(s).tipN++;if(z.tip===s)t(s).tipW++;}
    }
  }
  return {team,league:trials?scored/trials:.46};
}
export function possessionChance(tables,off,def,prior=settings.possPrior){
  const L=tables.league, o=tables.team[off]||{}, d=tables.team[def]||{};
  const pOff=((o.offScored||0)+prior*L)/((o.offTrials||0)+prior), pAllow=((d.defScored||0)+prior*L)/((d.defTrials||0)+prior);
  return {pOff,pAllow,p:clamp(pOff*pAllow/L,.15,.85)};
}
export function teamFirst(tables,a,h){
  const ta=tables.team[a]||{}, th=tables.team[h]||{};
  const tipA=shrinkTip(ta.tipW||0,ta.tipN||0), tipH=shrinkTip(th.tipW||0,th.tipN||0), tip=tipChance(tipA,tipH);
  const A=possessionChance(tables,a,h), H=possessionChance(tables,h,a);
  const pA=firstScoreChance(tip,A.p,H.p);
  return {tip,tipA,tipH,tipRecord:{[a]:[ta.tipW||0,ta.tipN||0],[h]:[th.tipW||0,th.tipN||0]},pos:{[a]:A,[h]:H},first:{[a]:pA,[h]:1-pA}};
}

// League early make rate overall and by shot group, and each defense's allowed rate by group (all shots, more sample).
export function shotTables(shotGames,beforeDay,dates){
  const lg={three:[0,0],rim:[0,0],mid:[0,0]}, def={}, early=[0,0];
  for(const [gid,rows] of Object.entries(shotGames||{})){
    if(!((dates?.[gid]||'')<beforeDay))continue;
    for(const s of rows){
      const g=shotGroup(s);lg[g][0]+=s[7];lg[g][1]++;
      const d=((def[s[2]]??={three:[0,0],rim:[0,0],mid:[0,0]})[g]);d[0]+=s[7];d[1]++;
      if(s[10]&&s[10]<=settings.earlyPossessions){early[0]+=s[7];early[1]++;}
    }
  }
  const rate=([m,n])=>n?m/n:null;
  return {league:Object.fromEntries(Object.entries(lg).map(([k,v])=>[k,rate(v)])),def,early:rate(early)??.46};
}

// A player's make edge on the shots he takes early: his makes and the defense's allowed makes by group, both shrunk
// hard toward league, capped at ±15%. Small edges (under 3%) are treated as noise and ignored.
export function makeEdge(playerShots,defense,tables){
  const early=playerShots.filter(s=>s[10]&&s[10]<=settings.earlyPossessions), mixFrom=early.length>=15?early:playerShots;
  if(!mixFrom.length)return 1;
  const mix={three:0,rim:0,mid:0};for(const s of mixFrom)mix[shotGroup(s)]+=1/mixFrom.length;
  let base=0,adj=0;
  for(const g of Object.keys(mix)){
    const L=tables.league[g]??.46, mine=playerShots.filter(s=>shotGroup(s)===g), d=tables.def[defense]?.[g]||[0,0];
    const pl=(mine.reduce((a,s)=>a+s[7],0)+settings.playerShotPrior*L)/(mine.length+settings.playerShotPrior);
    const df=(d[0]+settings.defenseShotPrior*L)/(d[1]+settings.defenseShotPrior);
    base+=mix[g]*L;adj+=mix[g]*(L+(pl-L)+(df-L));
  }
  const m=base?clamp(adj/base,1-settings.edgeCap,1+settings.edgeCap):1;
  return Math.abs(m-1)<.03?1:m;
}

// Early-attempt shares for one team's candidates. starts: per player, the game ids he started for this team.
export function earlyShares(first,teamCode,starts,beforeDay){
  const out={};
  for(const [id,games] of Object.entries(starts)){
    let mine=0,all=0,firstShots=0,n=0,teamFirst=0,gameFirst=0;
    for(const gid of games){
      const z=first?.[gid];
      if(!z?.poss||!(z.date<beforeDay))continue;
      const own=z.poss.filter(p=>p[0]===teamCode).slice(0,settings.earlyPossessions);
      if(!own.length)continue;
      n++;
      for(const p of own){all+=p[2].length+(p[3]?1:0);mine+=p[2].filter(x=>x===id).length+(p[3]===id?1:0);}
      if(z.by?.[teamCode]?.shot===id)firstShots++;
      if(z.by?.[teamCode]?.pts===id)teamFirst++;
      if(z.firstPts===id)gameFirst++;
    }
    out[id]={games:n,early:all?mine/all:null,firstShot:n?firstShots/n:null,firstShots,teamFirst,gameFirst};
  }
  return out;
}
// Regression: how often he actually scored his team's first points, against how often his share of the team's early
// attempts says he should have (conversion treated as noise, as in the model). Well below: positive regression is due,
// and a market that chases recent first baskets may underrate him. Well above: results ran hot, so negative regression.
export function regression({games,early,teamFirst=0}){
  if(!games||early==null)return null;
  const expected=games*early, diff=teamFirst-expected, z=diff/Math.sqrt(Math.max(expected*(1-early),.5));
  return {expected,actual:teamFirst,diff,z,kind:diff<=-1.5&&z<=-1?'positive':diff>=1.5&&z>=1?'negative':null};
}
// Conviction: the sum of signal weights (+ for the play, - against). Tiers decide what the board suggests.
export const convictionTier=(score,priced,play)=>priced?(play&&score>=5?'Strong':play&&score>=3?'Lean':null):(score>=5?'Strong':score>=4?'Lean':null);

// Blend early share and first-shot share, then shrink toward usage by games of sample.
export function blendShare({games,early,firstShot},usage){
  if(!games||early==null)return usage;
  const raw=(1-settings.firstShotWeight)*early+settings.firstShotWeight*firstShot;
  return (games*raw+settings.shareGames*usage)/(games+settings.shareGames);
}

// P(scorer | team scores first) for each starter. candidates: [{id, share, make (FG chance), ftShare, ftScore}].
// The bench keeps whatever share the starters leave (at least 3%).
export function scorerShares(candidates,earlyMake){
  let total=candidates.reduce((a,c)=>a+c.share,0);
  const scale=total>1-settings.benchFloor?(1-settings.benchFloor)/total:1;
  const weights=candidates.map(c=>{
    const s=c.share*scale;
    return {id:c.id,share:s,w:s*((1-c.ftShare)*c.make+c.ftShare*c.ftScore)};
  });
  const bench=Math.max(settings.benchFloor,1-weights.reduce((a,c)=>a+c.share,0));
  const sum=weights.reduce((a,c)=>a+c.w,0)+bench*earlyMake;
  return {players:Object.fromEntries(weights.map(c=>[c.id,{share:c.share,given:sum?c.w/sum:0}])),bench:sum?bench*earlyMake/sum:0};
}

// Price: implied chance of an American price, and the no-vig fair chance for a game's whole set of prices.
export const impliedChance=a=>{const x=Number(a);return !Number.isFinite(x)||x===0||Math.abs(x)<100?null:x>0?100/(x+100):-x/(-x+100);};
export function fairChances(prices,hold){
  const list=Object.entries(prices).map(([id,a])=>[id,impliedChance(a)]).filter(([,p])=>p!=null);
  const sum=list.reduce((a,[,p])=>a+p,0);
  // A full board (implied chances adding past 100%) is normalized; a partial one is divided by the assumed hold.
  const div=sum>=1?sum:1+hold;
  return {fair:Object.fromEntries(list.map(([id,p])=>[id,p/div])),method:sum>=1?'normalized':'hold',overround:sum};
}
export const americanFrom=p=>!(p>0&&p<1)?'—':p>=.5?String(-Math.round(100*p/(1-p))):'+'+Math.round(100*(1-p)/p);

// Round robin: the top edges (several from one game allowed) and every pair, triple or more among them. Only one player
// can score first in a game, so any combination holding two players from the same game is skipped and counted.
export function roundRobin(plays,size,by=2){
  const picks=[...plays].sort((a,b)=>b.edge-a.edge).slice(0,size);
  const combos=[];let skipped=0;
  const walk=(start,cur)=>{
    if(cur.length===by){if(new Set(cur.map(x=>x.game)).size<cur.length)skipped++;else combos.push(cur);return;}
    for(let i=start;i<picks.length;i++)walk(i+1,[...cur,picks[i]]);
  };
  walk(0,[]);
  return {picks,combos,skipped};
}
