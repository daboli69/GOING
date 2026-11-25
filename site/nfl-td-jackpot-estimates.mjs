const minGames=8;
const bin=p=>Math.min(4,Math.floor(p*5));
const key=(size,sameTeam)=>size+(sameTeam?' team':' mixed');
const product=values=>values.reduce((total,p)=>total*p,1);

export function fitTdCoScoring(log,before,now){
  const games=new Map();
  for(const row of log){
    const captured=Date.parse(row.capturedAt), tip=Date.parse(row.tip), graded=Date.parse(row.graded);
    if(!row.game||!row.date||row.date>=before||!(captured<tip&&tip<graded&&graded<=now)||
      !Array.isArray(row.tds)||!Array.isArray(row.players))continue;
    if(captured<=Date.parse(games.get(row.game)?.capturedAt))continue;
    games.set(row.game,row);
  }
  const sample=[...games.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,60).map(row=>{
    const scored=new Set(row.tds.map(String)), unique=new Map();
    for(const player of row.players){
      if(!Array.isArray(player))continue;
      const [id,,team,,p]=player;
      if(id!=null&&(team===row.a||team===row.h)&&Number.isFinite(p)&&p>0&&p<1){
        unique.set(String(id),{team,p,hit:Number(scored.has(String(id)))});
      }
    }
    return [...unique.values()];
  });

  // Center away pooled marginal error before estimating same-game dependence.
  const bins=Array.from({length:5},()=>({predicted:0,hits:0,n:0}));
  for(const game of sample)for(const {p,hit} of game){
    const group=bins[bin(p)];
    group.predicted+=p;group.hits+=hit;group.n++;
  }
  const factors={}, all=new Map();
  for(const game of sample){
    const players=game.map(({p,...rest})=>{
      const group=bins[bin(p)];
      return {...rest,p:Math.max(.001,Math.min(.999,p+(group.hits-group.predicted)/(group.n+40)))};
    });
    const seen=new Set();
    function add(type,expected,observed){
      const total=all.get(type)??{expected:0,observed:0,games:0};
      if(!seen.has(type))total.games++;
      seen.add(type);
      total.expected+=expected;
      total.observed+=observed;
      all.set(type,total);
    }
    for(let i=0;i<players.length-1;i++)for(let j=i+1;j<players.length;j++){
      const a=players[i],b=players[j], same=a.team===b.team, expected=a.p*b.p, observed=a.hit*b.hit;
      add(key(2,same),expected,observed);
      for(let k=j+1;k<players.length;k++){
        const c=players[k];
        add(key(3,same&&a.team===c.team),expected*c.p,observed*c.hit);
      }
    }
  }
  for(const [type,total] of all){
    if(total.games<minGames)continue;
    // Shrink by the number of independent games, since combinations overlap inside each game.
    const lift=(total.observed+10)/(total.expected+10);
    factors[type]=1+Math.max(-.25,Math.min(.25,lift-1))*total.games/(total.games+24);
  }
  return {factors,games:sample.length};
}

function joint(probabilities,lift){
  const low=Math.max(0,probabilities.reduce((sum,p)=>sum+p,1)-probabilities.length);
  return Math.max(low,Math.min(Math.min(...probabilities),product(probabilities)*lift));
}

export function thursdayOdds(legs,coScoring){
  const groups=new Map();
  for(const leg of legs){
    const game=leg.row.game.id, group=groups.get(game)||[];
    group.push(leg);
    groups.set(game,group);
  }
  let ask=1;
  for(const group of groups.values()){
    if(group.length===1){
      ask/=group[0].decimal;
      continue;
    }
    const sameTeam=group.every(leg=>leg.row.team===group[0].row.team);
    const lift=coScoring.factors[key(group.length,sameTeam)];
    if(lift==null)return null;
    // Discount estimated payout for positive dependence. Negative lift never lengthens a reference price.
    ask*=joint(group.map(leg=>1/leg.decimal),Math.max(1,lift));
  }
  return {chance:product(legs.map(leg=>leg.row.anytime)),decimal:1/ask,format:groups.size===1?'SGP':groups.size===2?'SGPx':'One per game'};
}
