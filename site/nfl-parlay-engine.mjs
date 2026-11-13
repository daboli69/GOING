// GOING LONG Suggested Parlays: which priced NFL player props qualify for a ticket, and how they rank.
// Same premise as GOING UP: hard checks remove a leg (the first failed check is its cut), and the legs that pass are
// scored on hit rates, matchup, value against the price, and context. nfl.mjs builds the rows from the play-by-play
// archive, snap counts, coverage and Next Gen stats, schedule lines, the ensemble model, injuries, weather and prices.
//
// The ten steps, in order:
//  1 Rules: leg count, stat types, sides, one leg per game, exclusions (parlay-ui.mjs).
//  2 Game screen: spread, total, game script; wind or rain removes passing-game Overs outdoors; domes noted.
//  3 Role edge: the player's role (slot or outside WR, TE, receiving or rushing RB, QB) against what this defense allows
//    to that role, per play and adjusted for the offenses it has faced. Man and zone splits are not public.
//  4 The defense must rank in the weak third against that role (the strong third for an Under).
//  5 Line vs projection: recent average (last 5) blended with a usage projection (targets x yards per target, ...).
//  6 Hit rate on the last 8, home or away split, reads; a hit rate that conflicts with the role edge removes the leg.
//  7 Volume props (receptions, attempts, completions) use what the defense allows to the position, plus snap share.
//  8 Context: QB, WR1, offensive line and starting cornerbacks out, teammate-out splits, pace, pass rate over expected,
//    red-zone share, rest and weather.
//  9 Build: one leg per game, a mix of stats, optional correlated same-game stacks, negative-correlation warnings.
// 10 Price: hit rates shrink toward 50% harder than GOING UP (8 wins and 8 losses added; touchdown props shrink toward
//    their price instead, since a fair TD chance is rarely near 50%), and touchdown legs are limited.
import {implied,mean} from './math.mjs';
import {clamp,favorable,format,legKey,percent,record,signed} from './parlay-core.mjs';

export const yardMarkets=new Set(['Receiving','Rushing','Passing']);
export const volumeMarkets=new Set(['Receptions','Rush Attempts','Pass Attempts','Completions']);
export const tdMarkets=new Set(['Anytime TD','First TD']);
export const passingGame=new Set(['Receiving','Passing','Receptions','Pass Attempts','Completions']);
const rushingGame=new Set(['Rushing','Rush Attempts']);
const qbMarkets=new Set(['Passing','Pass Attempts','Completions']);
const catchMarkets=new Set(['Receiving','Receptions']);
export const markets=['Receiving','Receptions','Rushing','Rush Attempts','Passing','Pass Attempts','Completions','Anytime TD','First TD'];
export const weights={form:4,matchup:3,line:2,context:1.5,mix:1};
export const PRIOR=8;
// First TD is off by default: no player scores first often enough to clear the hit-rate floor.
export const defaults={legs:4,stats:markets.filter(m=>m!=='First TD'),side:'Both',hit:60,sample:4,spread:10,total:0,tdMax:1,
  minOdds:1.01,maxOdds:101,perGame:true,stacks:false,weather:true,skipTickets:true,players:[],games:[],weights};

const done=g=>['FINAL','OFF','LIVE','CRIT'].includes(g.status)||g.sa!=null&&g.sh!=null;
const rankText=r=>r.rank+'/'+r.total;
// Wins and losses added before dividing: small NFL samples move toward 50% faster than GOING UP's.
// Touchdown props are yes/no bets whose fair chance is often far from 50%, so they shrink toward the price instead.
export const shrunk=(s,prior=PRIOR,toward=.5)=>s?.n==null?null:(s.hits+2*prior*toward)/(s.n+2*prior);
export const badWeather=w=>!!w&&w.roof!=='dome'&&((w.wind??0)>=15||(w.rain??0)>=.1);

export function assess(row,side,cfg,context){
  const {quote,player,game,stat,form,reads}=row;
  const over=side==='Over', direction=over?1:-1, yards=yardMarkets.has(stat), volume=volumeMarkets.has(stat), td=tdMarkets.has(stat);
  const price=quote[over?'over':'under'], prob=implied(price);
  const leg={date:row.date,game:String(game.id),tip:game.iso,player:player.id,name:player.name,pos:player.pos,
    team:player.team,opp:row.opp,stat,side,line:quote.line,price,provider:quote.provider,
    capturedAt:quote.capturedAt||null,reasons:[],flags:[],score:0};
  const checks={};
  const check=(rule,reason)=>{checks[rule]=reason;};
  const overlap=context.taken.has(legKey(leg));
  const start=Date.parse(game.iso);
  if(overlap)leg.flags.push('On an existing ticket');

  // 1 and 2: rules, price and the game screen.
  check('Kickoff',done(game)||!Number.isFinite(start)||start<=context.now?'Game already started or kickoff time missing':null);
  check('Exclusions',cfg.games.includes(leg.game)?'Excluded matchup':cfg.players.includes(leg.player)?'Excluded player':
    cfg.skipTickets&&overlap?'Existing tickets':null);
  check('Quote',!Number.isFinite(leg.line)||!prob||!leg.provider?'No price for selected side':null);
  check('Odds range',1/prob<cfg.minOdds||1/prob>cfg.maxOdds?'Odds range':null);
  check('Spread',row.spread==null?'Spread unavailable':row.spread>cfg.spread?'Maximum spread':null);
  check('Total',row.total==null?'Game total unavailable':row.total<cfg.total?'Minimum total':null);
  const w=row.weather;
  if(passingGame.has(stat)){
    check('Weather',cfg.weather&&over&&badWeather(w)?'Wind or rain':null);
    if(badWeather(w))leg.flags.push('Forecast '+[w.wind!=null?w.wind+' mph wind':'',w.rain?w.rain+' in rain':''].filter(Boolean).join(', '));
  }
  check('Availability',row.out?'Player listed out':null);
  if(row.status){
    leg.flags.push(row.status+': re-check after inactives');
    if(Number.isFinite(start)&&start-context.now<=90*60000)leg.flags.push('Inactives are out now');
  }
  if(!row.injuryReport)leg.flags.push('Injury report unavailable');
  const captured=Date.parse(leg.capturedAt);
  if(!Number.isFinite(captured)||captured>context.now)leg.flags.push('Quote time unknown');
  else if(context.now-captured>90*60000)leg.flags.push('Stale quote');
  check('Games played',form.season.length<cfg.sample?'Too few games played':null);

  // 3 and 4: role edge, and the defense must be weak (or strong for an Under) against that role.
  let matchup=0;
  const d=row.defense;
  if(d?.rank){
    check('Defense vs role',favorable(d.rank,over)?null:'Defense rank vs role');
    if(favorable(d.rank,over)){
      matchup=1+clamp(direction*(d.value-d.league)/Math.max(Math.abs(d.league),d.scale||1),0,1);
      leg.reasons.push(row.opp+' ranks '+rankText(d.rank)+' vs '+d.role+' ('+d.label+')');
    }
  }else check('Defense vs role','Defense sample vs role');

  // 5: line against the projection.
  let gap=null;
  if(!td){
    check('Projection',row.projection==null?'Projection unavailable':null);
    if(row.projection!=null){
      gap=direction*(row.projection-leg.line);
      check('Line vs projection',gap<0?'Line vs projection':null);
      if(gap>=0)leg.reasons.push('Line '+leg.line+' vs projection '+format(row.projection)+' (L5 '+format(row.recentAvg)+(row.usage!=null?', usage '+format(row.usage):'')+')');
    }
  }

  // 6: hit rates on the last 8, venue, reads, and agreement with the role edge.
  const last8=record(form.last8,leg.line,side), season=record(form.season,leg.line,side), venue=record(form.venue,leg.line,side);
  if(!checks['Games played'])check('Hit rate',last8.rate==null||last8.rate<cfg.hit/100?'Last 8 hit rate':null);
  if(last8.n)leg.reasons.push('Cleared '+leg.line+' in '+last8.hits+' of '+last8.n+' (last 8)');
  if(venue.n>=3){
    check('Venue split',venue.rate<.5?'Home or away split':null);
    if(!checks['Venue split'])leg.reasons.push((row.home?'Home':'Away')+' '+percent(venue.rate)+' ('+venue.hits+'/'+venue.n+')');
  }
  if(!td&&reads.length){
    const forSide=reads.filter(x=>direction*(x-leg.line)>0).length, against=reads.filter(x=>direction*(x-leg.line)<0).length;
    check('Reads',against>forSide?'Reads favor the other side':null);
    leg.readsFor=forSide;leg.readsAgainst=against;
  }
  if(d?.rank&&favorable(d.rank,over))check('Hit rate vs role',last8.rate!=null&&last8.rate<.5?'Hit rate conflicts with role edge':null);

  // 10: value after shrinking toward 50%.
  const chance=shrunk(season,PRIOR,td&&prob!=null?prob:.5), edge=chance==null||prob==null?null:chance-prob;
  if(edge!=null){
    check('Value',edge<0?'Shrunk hit rate below the price':null);
    if(edge>=0)leg.reasons.push('Shrunk chance '+percent(chance)+' vs '+percent(prob)+' implied');
  }

  // 7: usage. A part-time snap share removes yardage and volume Overs.
  if(!td&&player.pos!=='QB'&&row.snaps!=null){
    check('Snap share',over&&row.snaps<.5?'Snap share under 50%':null);
    if(row.snaps>=.5)leg.reasons.push('Snaps '+percent(row.snaps)+' L3');
  }

  // 8: context.
  let impact=0;
  const lift=(x,limit,text)=>{const v=clamp(x,-limit,limit);impact+=direction*v;if(text&&direction*v>=limit/3)leg.reasons.push(text);};
  if(row.script!=null){
    // Positive script means the team is expected to lead: more runs late, fewer throws.
    const s=row.script/14;
    lift(rushingGame.has(stat)?s:passingGame.has(stat)?-s:0,.4,(row.script>0?player.team+' favored by '+format(row.script):player.team+' underdog by '+format(-row.script))+' (game script)');
  }
  if(row.teamTotal!=null)lift((row.teamTotal-22.5)/(td?10:25),.5,'Team total '+format(row.teamTotal));
  if(row.model)leg.reasons.push('Model: '+player.team+' '+percent(row.model.p)+' to win');
  if(row.proe!=null){
    const p=passingGame.has(stat)?row.proe:rushingGame.has(stat)?-row.proe:0;
    lift(p*4,.3,player.team+' pass rate over expected '+signed(row.proe*100)+'%');
  }
  if(row.pace!=null&&(volume||yards))lift((row.pace-row.leaguePace)/12,.3,'Pace '+format(row.pace)+' plays per game');
  if(w){
    if(w.roof==='dome')leg.reasons.push('Dome');
    else if(passingGame.has(stat)){
      if((w.wind??0)>=10&&(w.wind??0)<15)lift(-.15,.15);
      if(w.temp!=null&&w.temp<=25){lift(-.15,.15);leg.flags.push(w.temp+'°F');}
      if((w.rainChance??0)>=60&&!badWeather(w))lift(-.1,.1);
      if(w.roof==='retractable')leg.flags.push('Retractable roof');
    }
  }
  if(row.share!=null&&row.recentShare!=null&&row.share>0){
    const t=(row.recentShare-row.share)/row.share;
    impact+=direction*clamp(t,-.3,.3);
    if(Math.abs(t)>=.15)leg.reasons.push(row.shareLabel+' L3 '+percent(row.recentShare)+' vs '+percent(row.share)+' season');
  }
  if(td){
    if(row.rzShare!=null){impact+=direction*clamp((row.rzShare-.2)*2,-.3,.4);leg.reasons.push('Red-zone share '+percent(row.rzShare));}
    if(stat==='First TD'&&row.firstRate!=null){impact+=direction*clamp(row.firstRate-.5,-.3,.3);leg.reasons.push(player.team+' scored first in '+percent(row.firstRate));}
  }
  if(row.ryoe!=null&&rushingGame.has(stat)){
    lift(row.ryoe/2,.4,(row.ryoe>=0?'Rush yards over expected ':'Rush yards under expected ')+signed(row.ryoe)+' per carry (player and defense)');
  }
  if(row.cbRoom!=null&&catchMarkets.has(stat)&&player.pos!=='RB'){
    lift((row.cbRoom-row.cbLeague)/4,.3,row.opp+' starting corners allow '+format(row.cbRoom)+' yards per target');
  }
  if(row.cbOut?.length&&catchMarkets.has(stat)&&player.pos==='WR'){
    lift(.2*row.cbOut.length,.4);leg.reasons.push(row.opp+' CB out: '+row.cbOut.join(', '));
  }
  if(row.qbOut&&player.pos!=='QB'&&passingGame.has(stat)){lift(-.4,.4);leg.flags.push('Starting QB '+row.qbOut+' out');}
  if(row.olOut?.length&&(passingGame.has(stat)||rushingGame.has(stat))){
    lift(-.12*row.olOut.length,.4);leg.flags.push(row.olOut.length+' starting OL out');
  }
  for(const absent of row.absences){
    leg.reasons.push(absent.name+' out'+(absent.delta==null?'':' · '+signed(absent.delta)+' in '+absent.n+' games without'));
    if(absent.delta!=null)impact+=clamp(direction*absent.delta/Math.max(row.avg||1,1),-.3,.3);
  }
  if(row.rest!=null){
    if(row.rest<=5){impact-=.1;leg.flags.push('Short week ('+row.rest+' days)');}
    else if(row.rest>=13){impact+=.1;leg.reasons.push('Off a bye');}
  }
  if(row.status)impact-=.25;

  leg.form={season,last8,venue,last5:record(form.last5,leg.line,side),home:record(form.home,leg.line,side),away:record(form.away,leg.line,side)};
  leg.avg=row.avg;leg.recentAvg=row.recentAvg;leg.projection=row.projection;leg.edge=edge;leg.chance=chance;
  leg.checks=checks;
  leg.context={role:row.role,defense:d?{rank:d.rank,value:d.value,league:d.league,label:d.label}:null,spread:row.spread,script:row.script,total:row.total,
    teamTotal:row.teamTotal,model:row.model,weather:w||null,proe:row.proe,pace:row.pace,snaps:row.snaps,share:row.share,recentShare:row.recentShare,
    rzShare:row.rzShare,ryoe:row.ryoe,cbRoom:row.cbRoom,cbOut:row.cbOut,qbOut:row.qbOut,olOut:row.olOut,rest:row.rest,absences:row.absences,status:row.status};
  leg.cut=Object.values(checks).find(Boolean)||null;
  if(!leg.cut){
    const value=clamp((edge||0)*5,0,1)+(gap==null?0:clamp(gap/Math.max(Math.abs(leg.line),1),0,1));
    leg.score=cfg.weights.form*mean([last8.rate,shrunk(season),venue.n>=3?venue.rate:null].filter(x=>x!=null))+cfg.weights.matchup*matchup+
      cfg.weights.line*value+cfg.weights.context*impact;
  }
  return leg;
}

export function evaluate(rows,cfg,{now=Date.now(),taken=new Set()}={}){
  const sides=cfg.side==='Both'?['Over','Under']:[cfg.side];
  const cuts=new Map(), eligible=[], screened=[];
  for(const row of rows){
    if(!cfg.stats.includes(row.stat))continue;
    for(const side of sides){
      if(row.quote[side==='Over'?'over':'under']==null)continue;
      const leg=assess(row,side,cfg,{now,taken});
      screened.push(leg);
      if(leg.cut)cuts.set(leg.cut,(cuts.get(leg.cut)||0)+1);
      else eligible.push(leg);
    }
  }
  return {eligible,cuts,screened};
}

// 9: same-team correlation. A QB's passing Over and his receiver's Over rise and fall together; opposite sides fight.
export function correlation(a,b){
  if(a.game!==b.game||a.team!==b.team||a.player===b.player)return 0;
  const qb=x=>qbMarkets.has(x.stat), catcher=x=>catchMarkets.has(x.stat);
  if(!(qb(a)&&catcher(b)||qb(b)&&catcher(a)))return 0;
  return a.side===b.side?1:-1;
}
export const ticketRules=cfg=>({
  sameGame:(leg,inGame)=>cfg.stacks&&inGame.every(x=>correlation(leg,x)>0),
  allow:(leg,ticket)=>!tdMarkets.has(leg.stat)||ticket.filter(x=>tdMarkets.has(x.stat)).length<cfg.tdMax
});
export function warnings(ticket){
  const out=[];
  for(let i=0;i<ticket.length;i++)for(let j=i+1;j<ticket.length;j++){
    const c=correlation(ticket[i],ticket[j]), a=ticket[i], b=ticket[j];
    if(c<0)out.push('Negative correlation: '+a.name+' '+a.side+' '+a.stat+' with '+b.name+' '+b.side+' '+b.stat+'. One leg needs the passing game to go well and the other needs it to go badly.');
    if(c>0)out.push('Correlated stack: '+a.name+' and '+b.name+' tend to hit or miss together. The chance estimates assume independent legs, so they understate how often both hit and overstate how often exactly one does.');
  }
  return out;
}
