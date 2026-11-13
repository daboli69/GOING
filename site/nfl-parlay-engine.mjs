// GOING LONG Suggested Parlays: which priced NFL player props qualify for a ticket, and how they rank.
// Same premise as the GOING UP engine: hard checks remove a leg (the first failed check is its cut), and the legs that
// pass are scored on hit rates, matchup, value against the price, and game context. nfl.mjs builds the rows from the
// play-by-play archive, the schedule lines, injuries, the ensemble model feed and the public player prices.
import {implied,mean} from './math.mjs';
import {clamp,favorable,format,legKey,percent,record,signed} from './parlay-core.mjs';

export const markets=['Receiving','Rushing','Passing','Anytime TD','First TD'];
export const yardMarkets=new Set(['Receiving','Rushing','Passing']);
export const weights={form:4,matchup:3,line:2,context:1,mix:1};
// First TD is off by default: no player scores first often enough to clear a 60% hit rate.
export const defaults={legs:4,stats:['Receiving','Rushing','Passing','Anytime TD'],side:'Both',hit:60,sample:4,spread:10,total:0,
  minOdds:1.01,maxOdds:101,perGame:true,skipTickets:true,players:[],games:[],weights};

const done=g=>['FINAL','OFF','LIVE','CRIT'].includes(g.status)||g.sa!=null&&g.sh!=null;
// The opposite third of the league: the defense allows the least for an Over, or the most for an Under.
const unfavorable=(rank,over)=>favorable(rank,!over);
const rankText=r=>r.rank+'/'+r.total;
// Sample-weighted blend of the player's hit rate and the price, the same shrinkage Best Plays uses.
export const blended=(hits,n,price)=>price==null?null:n?price+(hits/n-price)*n/(n+6):price;

export function assess(row,side,cfg,context){
  const {quote,player,game,stat,avg,form,reads}=row;
  const over=side==='Over', direction=over?1:-1, yards=yardMarkets.has(stat);
  const price=quote[over?'over':'under'], prob=implied(price);
  const leg={date:row.date,game:String(game.id),tip:game.iso,player:player.id,name:player.name,
    team:player.team,opp:row.opp,stat,side,line:quote.line,price,provider:quote.provider,
    capturedAt:quote.capturedAt||null,reasons:[],flags:[],score:0};
  const checks={};
  const check=(rule,reason)=>{checks[rule]=reason;};
  const overlap=context.taken.has(legKey(leg));
  const start=Date.parse(game.iso);
  if(overlap)leg.flags.push('On an existing ticket');
  check('Kickoff',done(game)||!Number.isFinite(start)||start<=context.now?'Game already started or kickoff time missing':null);
  check('Exclusions',cfg.games.includes(leg.game)?'Excluded matchup':cfg.players.includes(leg.player)?'Excluded player':
    cfg.skipTickets&&overlap?'Existing tickets':null);
  check('Quote',!Number.isFinite(leg.line)||!prob||!leg.provider?'No price for selected side':null);
  const decimal=1/prob;
  check('Odds range',decimal<cfg.minOdds||decimal>cfg.maxOdds?'Odds range':null);
  check('Spread',row.spread==null?'Spread unavailable':row.spread>cfg.spread?'Maximum spread':null);
  check('Total',row.total==null?'Game total unavailable':row.total<cfg.total?'Minimum total':null);
  check('Availability',row.out?'Player listed out':null);
  if(row.uncertain)leg.flags.push(row.uncertain);
  if(!row.injuryReport)leg.flags.push('Injury report unavailable');
  const captured=Date.parse(leg.capturedAt);
  if(!Number.isFinite(captured)||captured>context.now)leg.flags.push('Quote time unknown');
  else if(context.now-captured>90*60000)leg.flags.push('Stale quote');

  // Form: every game this season, the last five, and home or away.
  const season=record(form.season,leg.line,side), last5=record(form.last5,leg.line,side), venue=record(form.venue,leg.line,side);
  check('Games played',form.season.length<cfg.sample?'Too few games played':null);
  if(!checks['Games played'])check('Hit rate',season.rate==null||last5.rate==null||season.rate<cfg.hit/100||last5.rate<cfg.hit/100?'Season or L5 hit rate':null);
  if(venue.n>=3){
    check('Venue split',venue.rate<.5?'Home or away split':null);
    if(!checks['Venue split'])leg.reasons.push((row.home?'Home':'Away')+' '+percent(venue.rate)+' ('+venue.hits+'/'+venue.n+')');
  }

  // Value: the hit rate, shrunk toward the price by sample size, against the price's implied chance.
  const fair=blended(season.hits,season.n,prob), edge=fair==null||prob==null?null:fair-prob;
  if(edge!=null){
    check('Value',edge<0?'Hit rate below the price':null);
    if(edge>=0)leg.reasons.push('Hit '+season.hits+'/'+season.n+' vs '+percent(prob)+' implied');
  }
  let gap=null;
  if(yards){
    check('Season average',avg==null?'Season average unavailable':null);
    gap=avg!=null&&Number.isFinite(leg.line)?direction*(avg-leg.line):null;
    if(gap!=null){
      check('Line vs average',gap<0?'Line vs season average':null);
      if(gap>=0)leg.reasons.push('Line '+leg.line+' vs avg '+format(avg));
    }
    const forSide=reads.filter(x=>direction*(x-leg.line)>0).length, against=reads.filter(x=>direction*(x-leg.line)<0).length;
    if(reads.length)check('Reads',against>forSide?'Reads favor the other side':null);
    leg.readsFor=forSide;leg.readsAgainst=against;
  }

  // Matchup: what this defense allows to the player's role (deep, intermediate or short receiver, tight end, back,
  // quarterback). The opposite third of the league removes the leg; the favorable third adds to its score.
  let matchup=0;
  const r=row.roleRank;
  if(r){
    check('Defense vs role',unfavorable(r,over)?'Defense rank vs role':null);
    if(favorable(r,over)){
      matchup=1+clamp(direction*(row.roleAllowed-row.roleLeague)/Math.max(row.roleLeague,1),0,1);
      leg.reasons.push(row.opp+' ranks '+rankText(r)+' in '+(yards?'yards':'TDs')+' allowed to '+row.role);
    }
  }else check('Defense vs role','Defense sample vs role');

  // Context: efficiency allowed, game script, team total, weather, usage trend, red-zone work, teammates out.
  let impact=0;
  const e=row.epaRank;
  if(e){
    impact+=clamp(direction*(e.rank/e.total-.5),-.5,.5);
    if(direction*(e.rank/e.total-.5)>.15)leg.reasons.push(row.opp+' '+row.epaKind+' defense '+rankText(e)+' in EPA allowed');
  }
  if(row.teamSpread!=null){
    // Favorites lean on the run late; underdogs throw. TDs follow the team's implied points.
    const fav=-row.teamSpread;
    const script=stat==='Rushing'?fav/14:stat==='Receiving'||stat==='Passing'?-fav/14:0;
    impact+=direction*clamp(script,-.4,.4);
    if(direction*script>=.15)leg.reasons.push(row.player.team+' '+(fav>0?'favored by '+format(fav):'underdog by '+format(-fav)));
  }
  if(row.teamTotal!=null){
    const lift=(row.teamTotal-22.5)/(yards?20:10);
    impact+=direction*clamp(lift,-.5,.5);
    if(!yards||direction*lift>=.1)leg.reasons.push('Team total '+format(row.teamTotal));
  }
  if(row.model){
    leg.reasons.push('Model: '+row.player.team+' '+percent(row.model.p)+' to win');
    if(stat==='Rushing'||!yards)impact+=direction*clamp((row.model.p-.5)*.6,-.2,.2);
  }
  if(row.wind!=null&&row.wind>=15&&(stat==='Passing'||stat==='Receiving')){
    impact-=direction*.4;leg.flags.push('Wind '+row.wind+' mph');
  }
  if(row.temp!=null&&row.temp<=25&&(stat==='Passing'||stat==='Receiving')){
    impact-=direction*.15;leg.flags.push(row.temp+'°F');
  }
  if(row.share!=null&&row.recentShare!=null&&row.share>0){
    const trend=(row.recentShare-row.share)/row.share;
    impact+=direction*clamp(trend,-.3,.3);
    if(Math.abs(trend)>=.15)leg.reasons.push(row.shareLabel+' L3 '+percent(row.recentShare)+' vs '+percent(row.share)+' season');
  }
  if(!yards&&row.redZone!=null){
    impact+=direction*clamp((row.redZone-1)/3,-.3,.4);
    leg.reasons.push(format(row.redZone)+' red-zone touches per game');
  }
  if(stat==='First TD'&&row.firstRate!=null){
    impact+=direction*clamp(row.firstRate-.5,-.3,.3);
    leg.reasons.push(row.player.team+' scored first in '+percent(row.firstRate)+' of games');
  }
  for(const absent of row.absences){
    leg.reasons.push(absent.name+' out'+(absent.delta==null?'':' · '+signed(absent.delta)+' in '+absent.n+' games without'));
    if(absent.delta!=null)impact+=clamp(direction*absent.delta/Math.max(avg||1,1),-.3,.3);
  }
  if(row.uncertain)impact-=.25;

  leg.form={season,last5,venue,last3:record(form.last3,leg.line,side),home:record(form.home,leg.line,side),away:record(form.away,leg.line,side)};
  leg.avg=avg;
  leg.edge=edge;
  leg.checks=checks;
  leg.context={spread:row.spread,teamSpread:row.teamSpread,total:row.total,teamTotal:row.teamTotal,role:row.role,roleRank:r,
    epaRank:e,model:row.model,wind:row.wind,temp:row.temp,share:row.share,recentShare:row.recentShare,absences:row.absences};
  leg.cut=Object.values(checks).find(Boolean)||null;
  if(!leg.cut){
    const value=clamp((edge||0)*5,0,1)+(gap==null?0:clamp(gap/Math.max(Math.abs(leg.line),1),0,1));
    leg.score=cfg.weights.form*mean([season.rate,last5.rate,venue.n>=3?venue.rate:null].filter(x=>x!=null))+cfg.weights.matchup*matchup+
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
