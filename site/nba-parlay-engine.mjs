import {implied,mean} from './math.mjs';
import {legKey,clamp,record,allowedRanks,favorable,format,signed,percent,buildTicket,ticketMath} from './parlay-core.mjs';
export {legKey,record,allowedRanks,buildTicket,ticketMath};

export const markets=['Points','Threes','Rebounds','Assists'];
export const weights={form:4,matchup:3,line:2,context:1,mix:1};
export const defaults={legs:6,stats:markets,side:'Both',hit:60,sample:5,spread:6.5,total:0,
  minOdds:1.01,maxOdds:101,perGame:true,skipTickets:true,players:[],games:[],weights};

const active=g=>['FUT','PRE'].includes(g.status);
const typed=stat=>stat==='Points'||stat==='Threes';


export function assess(row,side,cfg,context){
  const {quote,player,game,stat,avg,form,reads}=row;
  const over=side==='Over', direction=over?1:-1;
  const price=quote[over?'over':'under'], prob=implied(price);
  const leg={date:row.date,game:String(game.id),tip:game.iso,player:player.id,name:player.name,
    team:player.team,opp:row.opp,stat,side,line:quote.line,price,provider:quote.provider,
    capturedAt:quote.capturedAt||null,reasons:[],flags:[],score:0};
  const checks={};
  const check=(rule,reason)=>{checks[rule]=reason;};
  const overlap=context.taken.has(legKey(leg));
  const start=Date.parse(game.iso);
  if(overlap)leg.flags.push('On an existing ticket');
  check('Tip time',!active(game)||!Number.isFinite(start)||start<=context.now?'Game already started or tip time missing':null);
  check('Exclusions',cfg.games.includes(leg.game)?'Excluded matchup':cfg.players.includes(leg.player)?'Excluded player':
    cfg.skipTickets&&overlap?'Existing tickets':null);
  check('Quote',!Number.isFinite(leg.line)||!prob||!leg.provider?'No price for selected side':null);
  const decimal=1/prob;
  check('Odds range',decimal<cfg.minOdds||decimal>cfg.maxOdds?'Odds range':null);

  check('Spread',row.spread==null?'Spread unavailable':row.spread>=14.5?'Spread of 14.5 or more':
    row.spread>cfg.spread?'Maximum spread':null);
  check('Total',row.total==null?'Game total unavailable':row.total<cfg.total?'Minimum total':null);
  check('Availability',row.out?'Player listed out':null);
  if(row.uncertain)leg.flags.push(row.uncertain);
  if(!row.injuryReport)leg.flags.push('Player injury report unavailable');
  const captured=Date.parse(leg.capturedAt);
  if(!Number.isFinite(captured)||captured>context.now)leg.flags.push('Quote time unknown');
  else if(context.now-captured>90*60000)leg.flags.push('Stale quote');

  check('Season average',avg==null?'Season average unavailable':null);
  let matchup=0;
  let typeEdge=null;
  if(typed(stat)){
    const deltas=row.typeDeltas;
    const delta=mean(deltas), beat=deltas.filter(x=>direction*x>0).length;
    typeEdge={delta,beat,n:deltas.length};
    check('Type sample',deltas.length<cfg.sample?'Type sample':null);
    if(deltas.length&&avg!=null){
      check('Type edge',direction*delta<Math.max(.3,.05*avg)||beat*2<=deltas.length?'Type edge too small or conflicts':null);
      if(!checks['Type edge']){
        leg.reasons.push('Type '+row.type+' edge '+signed(delta)+' ('+beat+'/'+deltas.length+' '+(over?'above':'below')+')');
        matchup=1+clamp(direction*delta/Math.max(avg,1),0,1);
      }
    }
    check('Defense vs type',favorable(row.typeRank,over)?null:'Defense rank vs type');
    if(!checks['Defense vs type'])leg.reasons.push(row.opp+' ranks '+row.typeRank.rank+'/'+row.typeRank.total+' vs type '+row.type);
  }

  const gap=avg!=null&&Number.isFinite(leg.line)?direction*(avg-leg.line):null;
  if(gap!=null){
    check('Line vs average',gap<0?'Line vs season average':null);
    if(gap>=0)leg.reasons.push('Line '+leg.line+' vs avg '+format(avg));
  }
  const season=record(form.season,leg.line,side), last10=record(form.last10,leg.line,side), venue=record(form.venue,leg.line,side);
  check('History',season.n<5||form.last10.length<10?'Too few recent game logs':null);
  if(!checks.History)check('Hit rate',last10.rate==null||season.rate<cfg.hit/100||last10.rate<cfg.hit/100?'Season or L10 hit rate':null);
  check('Venue split',venue.n<3||venue.rate<.5?'Home or away split':null);
  const forSide=reads.filter(x=>direction*(x-leg.line)>0).length, against=reads.filter(x=>direction*(x-leg.line)<0).length;
  if(reads.length)check('Reads',against>forSide?'Reads favor the other side':null);
  if(!checks['Venue split'])leg.reasons.push((game.h===leg.team?'Home':'Away')+' '+percent(venue.rate)+' ('+venue.hits+'/'+venue.n+')');

  if(!typed(stat)){
    check('Defense vs position',favorable(row.posRank,over)?null:'Defense rank vs position');
    if(!checks['Defense vs position']){
      leg.reasons.push(row.opp+' ranks '+row.posRank.rank+'/'+row.posRank.total+' vs '+player.pos);
      matchup=1;
    }
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
  leg.checks=checks;
  leg.context={spread:row.spread,total:row.total,pace:row.pace,threeRate:row.threeRate,
    position:player.pos,type:row.type,typeEdge,typeRank:row.typeRank,posRank:row.posRank,
    readsFor:forSide,readsAgainst:against,absences:row.absences};
  leg.cut=Object.values(checks).find(Boolean)||null;
  if(!leg.cut){
    leg.score=cfg.weights.form*mean([season.rate,last10.rate,venue.rate])+cfg.weights.matchup*matchup+
      cfg.weights.line*clamp(gap/Math.max(Math.abs(leg.line),1),0,1)+cfg.weights.context*impact;
  }
  return leg;
}

export function evaluate(rows,cfg,{now=Date.now(),taken=new Set()}={}){
  const totals=new Map(rows.filter(r=>r.total!=null&&active(r.game)&&Date.parse(r.game.iso)>now)
    .map(r=>[String(r.game.id),r.total]));
  const floor=totals.size>=3?Math.min(...totals.values()):null;
  const lowTotals=new Set([...totals].filter(([,value])=>value===floor).map(([id])=>id));
  const sides=cfg.side==='Both'?['Over','Under']:[cfg.side];
  const cuts=new Map(), eligible=[], screened=[];
  for(const row of rows){
    if(!cfg.stats.includes(row.stat))continue;
    for(const side of sides){
      const leg=assess(row,side,cfg,{now,taken,lowTotals});
      screened.push(leg);
      if(leg.cut)cuts.set(leg.cut,(cuts.get(leg.cut)||0)+1);
      else eligible.push(leg);
    }
  }
  return {eligible,cuts,screened};
}


