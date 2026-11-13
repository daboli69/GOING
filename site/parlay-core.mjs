// Ticket logic shared by every sport's parlay generator (GOING UP, GOING LONG): leg identity, hit records, defense
// ranks, ticket building and ticket math. Each sport's engine decides which legs qualify and how they score.
import {implied} from './math.mjs';

export const legKey=leg=>[leg.date,leg.game,leg.player,leg.stat,leg.side,leg.line].join('|');
export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function record(values,line,side){
  if(!Number.isFinite(line))return {hits:0,n:0,pushes:0,rate:null};
  const hits=values.filter(value=>side==='Over'?value>line:value<line).length;
  const pushes=values.filter(value=>value===line).length;
  const n=values.length-pushes;
  return {hits,n,pushes,rate:n?hits/n:null};
}
// Rank 1 allows the least. Keep tie boundaries so a tie spanning a cutoff can't qualify.
export function allowedRanks(entries){
  const sorted=[...entries].filter(([,value])=>Number.isFinite(value)).sort((a,b)=>a[1]-b[1]);
  const ranks=new Map();
  for(let i=0;i<sorted.length;){
    let end=i+1;
    while(end<sorted.length&&sorted[end][1]===sorted[i][1])end++;
    for(const [team] of sorted.slice(i,end))ranks.set(team,{rank:i+1,end,total:sorted.length});
    i=end;
  }
  return ranks;
}
export const favorable=(rank,over)=>!!rank&&rank.total>=3&&
  (over?rank.rank>rank.total-Math.floor(rank.total/3):rank.end<=Math.floor(rank.total/3));
export const format=(x,n=1)=>Number(x).toFixed(n);
export const signed=x=>(x>0?'+':'')+format(x);
export const percent=x=>format(x*100,0)+'%';

// rules (optional, per sport): sameGame(leg,legsInThatGame) may allow a second leg in a game while one leg per game is
// on (NFL correlated stacks); allow(leg,ticket) can refuse a leg (NFL touchdown limit).
export function buildTicket(eligible,cfg,{locked=[],avoid=new Set(),excluded=new Set(),rules={}}={}){
  const available=new Map(eligible.map(leg=>[legKey(leg),leg]));
  const ticket=[], players=new Set(), games=new Set(), counts=new Map();
  const fits=leg=>!players.has(leg.player)&&(!cfg.perGame||!games.has(leg.game)||!!rules.sameGame?.(leg,ticket.filter(x=>x.game===leg.game)))&&
    (rules.allow?rules.allow(leg,ticket):true);
  const add=leg=>{
    ticket.push(leg);players.add(leg.player);games.add(leg.game);
    counts.set(leg.stat,(counts.get(leg.stat)||0)+1);
  };
  for(const key of locked){
    const leg=available.get(key);
    if(!leg||!fits(leg)||ticket.length>=cfg.legs)return {ticket:[],invalidLock:true};
    add(leg);
  }
  while(ticket.length<cfg.legs){
    let best, bestScore=-Infinity;
    for(const leg of eligible){
      const key=legKey(leg);
      if(!fits(leg)||excluded.has(key))continue;
      const score=leg.score-cfg.weights.mix*(counts.get(leg.stat)||0)-(avoid.has(key)?1000:0);
      if(score>bestScore){best=leg;bestScore=score;}
    }
    if(!best)break;
    add(best);
  }
  return {ticket,invalidLock:false};
}

// prior: wins and losses added to each leg's season record before multiplying (GOING UP 5, GOING LONG 8).
export function ticketMath(ticket,prior=5){
  const combine=fn=>ticket.reduce((p,leg)=>p*fn(leg),1);
  const quoted=combine(leg=>implied(leg.price));
  const naive=combine(leg=>leg.form.season.rate);
  const adjusted=combine(leg=>(leg.form.season.hits+prior)/(leg.form.season.n+2*prior));
  return {quoted,naive,adjusted,decimal:1/quoted,sameGame:new Set(ticket.map(leg=>leg.game)).size<ticket.length};
}
