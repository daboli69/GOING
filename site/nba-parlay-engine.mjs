import {implied,mean} from './math.mjs';

export const markets=['Points','Threes','Rebounds','Assists'];
export const weights={form:4,matchup:3,line:2,context:1,mix:1};
export const defaults={legs:6,stats:markets,side:'Both',hit:60,sample:5,spread:6.5,total:0,
  minOdds:1.01,maxOdds:101,perGame:true,skipTickets:true,players:[],games:[],weights};

export const legKey=leg=>[leg.date,leg.game,leg.player,leg.stat,leg.side,leg.line].join('|');
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const active=g=>['FUT','PRE'].includes(g.status);
const typed=stat=>stat==='Points'||stat==='Threes';
export function record(values,line,side){
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
const favorable=(rank,over)=>!!rank&&rank.total>=3&&
  (over?rank.rank>rank.total-Math.floor(rank.total/3):rank.end<=Math.floor(rank.total/3));
const format=(x,n=1)=>Number(x).toFixed(n);
const signed=x=>(x>0?'+':'')+format(x);
const percent=x=>format(x*100,0)+'%';

export function assess(row,side,cfg,context){
  const {quote,player,game,stat,avg,form,reads}=row;
  const over=side==='Over', direction=over?1:-1;
  const price=quote[over?'over':'under'], prob=implied(price);
  const leg={date:row.date,game:String(game.id),tip:game.iso,player:player.id,name:player.name,
    team:player.team,opp:row.opp,stat,side,line:quote.line,price,provider:quote.provider,
    capturedAt:quote.capturedAt||null,reasons:[],flags:[],score:0};
  const cut=reason=>({...leg,cut:reason});
  const overlap=context.taken.has(legKey(leg));
  if(overlap)leg.flags.push('On an existing ticket');
  if(!active(game)||!Number.isFinite(Date.parse(game.iso))||Date.parse(game.iso)<=context.now)return cut('Game already started or tip time missing');
  if(cfg.games.includes(leg.game))return cut('Excluded matchup');
  if(cfg.players.includes(leg.player))return cut('Excluded player');
  if(cfg.skipTickets&&overlap)return cut('Existing tickets');
  if(!Number.isFinite(leg.line)||!prob||!leg.provider)return cut('No price for selected side');
  const decimal=1/prob;
  if(decimal<cfg.minOdds||decimal>cfg.maxOdds)return cut('Odds range');

  if(row.spread==null)return cut('Spread unavailable');
  if(row.spread>=14.5)return cut('Spread of 14.5 or more');
  if(row.spread>cfg.spread)return cut('Maximum spread');
  if(row.total==null)return cut('Game total unavailable');
  if(row.total<cfg.total)return cut('Minimum total');
  if(row.out)return cut('Player listed out');
  if(row.uncertain)leg.flags.push(row.uncertain);
  if(!row.injuryReport)leg.flags.push('Player injury report unavailable');
  const captured=Date.parse(leg.capturedAt);
  if(!Number.isFinite(captured)||captured>context.now)leg.flags.push('Quote time unknown');
  else if(context.now-captured>90*60000)leg.flags.push('Stale quote');

  if(avg==null)return cut('Season average unavailable');
  let matchup=0;
  if(typed(stat)){
    const deltas=row.typeDeltas;
    if(deltas.length<cfg.sample)return cut('Type sample');
    const delta=mean(deltas), beat=deltas.filter(x=>direction*x>0).length;
    if(direction*delta<Math.max(.3,.05*avg)||beat*2<=deltas.length)return cut('Type edge too small or conflicts');
    if(!favorable(row.typeRank,over))return cut('Defense rank vs type');
    leg.reasons.push('Type '+row.type+' edge '+signed(delta)+' ('+beat+'/'+deltas.length+' '+(over?'above':'below')+')',
      row.opp+' ranks '+row.typeRank.rank+'/'+row.typeRank.total+' vs type '+row.type);
    matchup=1+clamp(direction*delta/Math.max(avg,1),0,1);
  }

  const gap=direction*(avg-leg.line);
  if(gap<0)return cut('Line vs season average');
  leg.reasons.push('Line '+leg.line+' vs avg '+format(avg));
  const season=record(form.season,leg.line,side), last10=record(form.last10,leg.line,side), venue=record(form.venue,leg.line,side);
  if(season.n<5||form.last10.length<10)return cut('Too few recent game logs');
  if(last10.rate==null||season.rate<cfg.hit/100||last10.rate<cfg.hit/100)return cut('Season or L10 hit rate');
  if(venue.n<3||venue.rate<.5)return cut('Home or away split');
  const forSide=reads.filter(x=>direction*(x-leg.line)>0).length, against=reads.filter(x=>direction*(x-leg.line)<0).length;
  if(against>forSide)return cut('Reads favor the other side');
  leg.reasons.push((game.h===leg.team?'Home':'Away')+' '+percent(venue.rate)+' ('+venue.hits+'/'+venue.n+')');

  if(!typed(stat)){
    if(!favorable(row.posRank,over))return cut('Defense rank vs position');
    leg.reasons.push(row.opp+' ranks '+row.posRank.rank+'/'+row.posRank.total+' vs '+player.pos);
    matchup=1;
  }

  let impact=context.lowTotals.has(leg.game)?-.35:0;
  if(impact)leg.reasons.push('Low total on the slate');
  if(row.pace!=null){
    impact+=clamp(direction*(row.pace-100)/10,-.5,.5);
    leg.reasons.push('Est. pace '+format(row.pace));
  }
  if(stat==='Threes'&&row.threeRate!=null){
    impact+=clamp(direction*(row.threeRate-.4)*4,-.5,.5);
    leg.reasons.push('Team 3PA rate '+percent(row.threeRate));
  }
  for(const absent of row.absences){
    leg.reasons.push(absent.name+' out'+(absent.delta==null?'':' · '+signed(absent.delta)+' in '+absent.n+' games without'));
    if(absent.delta!=null)impact+=clamp(direction*absent.delta/Math.max(avg,1),-.3,.3);
  }
  if(row.uncertain)impact-=.25;
  leg.form={season,last10,venue,last5:record(form.last5,leg.line,side),home:record(form.home,leg.line,side),away:record(form.away,leg.line,side)};
  leg.avg=avg;
  leg.recentAvg=mean(form.last10);
  leg.score=cfg.weights.form*mean([season.rate,last10.rate,venue.rate])+cfg.weights.matchup*matchup+
    cfg.weights.line*clamp(gap/Math.max(Math.abs(leg.line),1),0,1)+cfg.weights.context*impact;
  return leg;
}

export function evaluate(rows,cfg,{now=Date.now(),taken=new Set()}={}){
  const totals=new Map(rows.filter(r=>r.total!=null&&active(r.game)&&Date.parse(r.game.iso)>now)
    .map(r=>[String(r.game.id),r.total]));
  const floor=totals.size>=3?Math.min(...totals.values()):null;
  const lowTotals=new Set([...totals].filter(([,value])=>value===floor).map(([id])=>id));
  const sides=cfg.side==='Both'?['Over','Under']:[cfg.side];
  const cuts=new Map(), eligible=[];
  for(const row of rows){
    if(!cfg.stats.includes(row.stat))continue;
    for(const side of sides){
      const leg=assess(row,side,cfg,{now,taken,lowTotals});
      if(leg.cut)cuts.set(leg.cut,(cuts.get(leg.cut)||0)+1);
      else eligible.push(leg);
    }
  }
  return {eligible,cuts};
}

export function buildTicket(eligible,cfg,{locked=[],avoid=new Set(),excluded=new Set()}={}){
  const available=new Map(eligible.map(leg=>[legKey(leg),leg]));
  const ticket=[], players=new Set(), games=new Set(), counts=new Map();
  const fits=leg=>!players.has(leg.player)&&(!cfg.perGame||!games.has(leg.game));
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

export function ticketMath(ticket){
  const combine=fn=>ticket.reduce((p,leg)=>p*fn(leg),1);
  const quoted=combine(leg=>implied(leg.price));
  const naive=combine(leg=>leg.form.season.rate);
  const adjusted=combine(leg=>(leg.form.season.hits+5)/(leg.form.season.n+10));
  return {quoted,naive,adjusted,decimal:1/quoted,sameGame:new Set(ticket.map(leg=>leg.game)).size<ticket.length};
}
