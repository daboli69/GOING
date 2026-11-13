// Touchdown model for GOING LONG's TD Board. Expected touchdowns come from opportunity, not past TD counts:
// every carry and target is worth the league's TD rate for where it happened (a carry at the 1–2 scores about half the
// time, a target outside the 20 about 1%). A player's share of his team's expected TDs, times the touchdowns the market
// implies for his team tonight, gives his expected TDs (lambda). Then
//   anytime TD   P(at least one) = 1 − e^(−lambda)
//   first TD     P(his team scores the first TD) × P(he scores it | his team does)
// nfl.mjs gathers the inputs from the play-by-play archive, snap counts, schedule lines, injuries and weather.

// opportunityWeight: how much of a player's share comes from his red-zone opportunity (the rest from his overall share
// of the team's carries and targets, which is steadier). Set from the backtest, which showed pure red-zone shares were
// overconfident at the top and too low for players with few red-zone looks.
export const tdSettings={opportunityWeight:.5,flatten:.85};

// Opportunity buckets. An end-zone target is any pass thrown at least as far as the goal line.
export function bucket(p){
  const yl=p[3];if(yl==null)return null;
  if(p[1]==='run'&&p[12])return yl<=2?'rush 1-2':yl<=5?'rush 3-5':yl<=10?'rush 6-10':yl<=20?'rush 11-20':'rush 21+';
  if(p[1]==='pass'&&p[11]&&!p[28])return p[13]!=null&&p[13]>=yl?'target end zone':yl<=10?'target 1-10':yl<=20?'target 11-20':'target 21+';
  return null;
}
export const isRush=k=>k.startsWith('rush');
// The player credited with an offensive TD on this play (rusher or receiver), or null.
export const offenseTd=p=>p[8]&&p[8]===p[0]&&!p[22]&&['run','pass'].includes(p[1])&&p[9]?p[9]:null;

// League TD rate per bucket, from every play counted.
export function bucketRates(plays){
  const n={},td={};
  for(const p of plays){const k=bucket(p);if(!k)continue;n[k]=(n[k]||0)+1;const who=offenseTd(p);if(who&&who===(isRush(k)?p[12]:p[11]))td[k]=(td[k]||0)+1;}
  return Object.fromEntries(Object.keys(n).map(k=>[k,(td[k]||0)/n[k]]));
}

// Team touchdowns implied by the market: (implied points − two field goals) ÷ 7.
export const impliedPoints=(total,teamSpread)=>total==null||teamSpread==null?null:total/2-teamSpread/2;
export const impliedTds=points=>points==null?null:Math.max(.8,(points-6)/7);
// Share of a team's TDs on the ground: its season split shrunk toward the league (6 TDs of prior), nudged by game
// script (a favorite runs more late) and bad weather (wind or rain moves scoring to the ground).
export function rushShare(rushTd,passTd,leagueShare,script=0,badWeather=false){
  const base=(rushTd+6*leagueShare)/(rushTd+passTd+6);
  return Math.max(.2,Math.min(.75,base+Math.max(-.08,Math.min(.08,.01*script))+(badWeather?.05:0)));
}
export const anytime=lambda=>1-Math.exp(-Math.max(0,lambda));

// Opening possession and the first touchdown. Drives alternate from the opening kickoff; the receiving team's first
// drive uses its opening-drive TD rate. Returns P(team A scores the first offensive TD), with team B the remainder.
export function firstTdChance(receiveA,a1,b1,a,b){
  const cycle=1-(1-a)*(1-b);
  // A receives: A1, then B1, then A, B, A, ...   B receives: B1, then A1, then B, A, B, ...
  const ifA=a1+(1-a1)*(1-b1)*a/cycle;
  const ifB=(1-b1)*(a1+(1-a1)*(1-b)*a/cycle);
  return receiveA*ifA+(1-receiveA)*ifB;
}
export const shrink=(hits,n,prior,toward)=>(hits+prior*toward)/(n+prior);
export function log5(a,b){const x=a*(1-b),y=b*(1-a);return x+y?x/(x+y):.5;}

// Regression: actual TDs against expected TDs from opportunity. Many chances and few TDs: due. Scoring past his
// opportunity: shrink him.
export function tdRegression(actual,expected){
  const diff=actual-expected, z=diff/Math.sqrt(Math.max(expected,.5));
  return {actual,expected,diff,kind:diff<=-1.25&&z<=-.8?'due':diff>=1.25&&z>=.8?'hot':null};
}

// Prices. Anytime: a two-sided quote has its vig removed directly; a one-sided price is divided by the assumed hold.
export const impliedChance=a=>{const x=Number(a);return !Number.isFinite(x)||x===0||Math.abs(x)<100?null:x>0?100/(x+100):-x/(-x+100);};
export function fairAnytime(yes,no,hold){
  const y=impliedChance(yes),n=impliedChance(no);
  if(y==null)return null;
  return n!=null&&y+n>=1?y/(y+n):y/(1+hold);
}
// First TD: a full board (implied chances past 100%) is normalized; a partial one is divided by the hold.
export function fairField(prices,hold){
  const list=Object.entries(prices).map(([id,a])=>[id,impliedChance(a)]).filter(([,p])=>p!=null);
  const sum=list.reduce((a,[,p])=>a+p,0), div=sum>=1?sum:1+hold;
  return Object.fromEntries(list.map(([id,p])=>[id,p/div]));
}
export const americanFrom=p=>!(p>0&&p<1)?'—':p>=.5?String(-Math.round(100*p/(1-p))):'+'+Math.round(100*(1-p)/p);
