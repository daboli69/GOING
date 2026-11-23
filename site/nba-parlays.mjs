// GOING UP Suggested Parlays: the shared parlay page (parlay-ui.mjs) with the NBA engine and filters.
import {current as S,btn,esc,keep,local,playCheck,slate,tools} from './ui.mjs';
import {href} from './config.mjs';
import {builderLegs,buildNbaTicket,defaults,evaluate,markets,nbaLegChance,weights} from './nba-parlay-engine.mjs';
import {createParlays,parlayPool,parlayPoolSummary,timeLabel} from './parlay-ui.mjs';
import {nbaTicketsKey,resolveNbaTicketLeg} from './nba-parlay-results.mjs';
export {toAmerican,fromAmerican} from './parlay-ui.mjs';

const poolDisplay={
  chance:nbaLegChance,
  legText:leg=>leg.side+' '+leg.line+' '+leg.stat,
  tag:leg=>leg.context.type&&leg.context.type!=='—'?'Type '+leg.context.type:'Type unavailable',
  form:({form:{season,last10}})=>`Season ${season.hits}/${season.n} · Last 10 ${last10.hits}/${last10.n}`,
  note:'Season rates are pulled toward 50% for small samples. A qualifying teammate split can move the estimate by up to 3 percentage points. Future results can differ.'
};
const builderRangeKey='nba-builder-range';
const builderRanges={core:[-300,-200],wider:[-400,-150],heavier:[-500,-300]};
function builderPool(data,cfg,taken){
  const savedRange=local(builderRangeKey,'core'), range=Object.hasOwn(builderRanges,savedRange)?savedRange:'core';
  const [minPrice,maxPrice]=builderRanges[range], report=builderLegs(data.rows,data.alternates??[],cfg,{minPrice,maxPrice,taken});
  return parlayPool(report,[],{
    ...poolDisplay,title:'Builder Legs',
    intro:'<p class="subtle">Alternate player lines for building your own ticket. Uses the matchup filters above and requires '+
      esc(Math.max(cfg.hit,70))+'% in both season and last-10 results at the alternate line. Kalshi prices are exchange quotes.</p>'+
      tools(Object.entries(builderRanges).map(([key,[min,max]])=>btn(min+' to '+max,'parlayBuilderRange',key,key===range?'on':'')).join('')),
    emptyText:report.priced?'The alternate lines in this range are available, but none pass the current matchup and form filters.':
      'No recent alternate prices in this range match a current main line on this slate.',
    legText:leg=>leg.milestone?leg.milestone+'+ '+leg.stat:poolDisplay.legText(leg),
    tag:leg=>'DK main '+leg.mainLine,
    form:leg=>poolDisplay.form(leg)+' · Quoted '+timeLabel(leg.capturedAt),
    actions:leg=>{
      const play={sport:'nba',date:leg.date,game:leg.game,id:leg.player,team:leg.team,market:leg.stat,
        side:leg.side,line:leg.line,odds:leg.price,provider:leg.provider,title:leg.name+' · '+leg.stat};
      return `<p><label class="field">${playCheck(play)} Save to My Plays</label></p>`;
    }
  });
}

const nba=createParlays({
  settingsKey:'nba-parlay-settings',ticketsKey:nbaTicketsKey,liveDraft:true,prefill:false,resolveSavedLeg:resolveNbaTicketLeg,
  engine:{defaults,weights,markets,evaluate},build:buildNbaTicket,rankByChance:true,
  weightNames:{form:'Hit rates',matchup:'Matchup',line:'Line vs average',context:'Game context',mix:'Stat variety'},
  fields:[{key:'hit',label:'Min. hit rate %',min:0,max:100},{key:'sample',label:'Min. type sample',min:1,max:30,integer:true},
    {key:'spread',label:'Max. spread',min:0,max:14.5,step:.5},{key:'total',label:'Min. total',min:0,max:300,step:.5}],
  summary:f=>[f.hit+'% min. hit rate',f.sample+'-game type sample',f.spread+' max spread',f.total+' min. total'],
  period:()=>S.day,periodLabel:()=>S.day,
  nav:()=>slate({navOnly:true,date:true}),
  intro:()=>tools(`<a class="pill" href="${href('up/parlay-tracker.html')}">Parlay Leg Tracker</a>`+
    btn('Check for updates','nbaParlayCheck',''))+
    '<p class="subtle">DraftKings main lines · Qualifying legs are ranked by estimated hit chance. Both includes an Over and an Under when they fit the same ticket.</p>'+
    (S.f.nbaPriceBoard?.source==='mirror'&&S.odds.length?'<p class="subtle">Main lines loaded from the separate NBA price feed.</p>':
      ['partial','unavailable'].includes(S.f.nbaPriceBoard?.source)&&S.odds.length?
        '<p class="subtle">Some DraftKings markets could not refresh. Recent verified main lines are shown where available.</p>':''),
  afterTicket:(data,report,ticket,cfg,taken)=>builderPool(data,cfg,taken)+parlayPool(report,ticket,poolDisplay),
  poolSummary:(report,cfg)=>parlayPoolSummary(report,cfg,'Tip time'),
  chance:nbaLegChance,
  chanceNote:'Sample-adjusted season rates with lineup context',
  recent:{key:'last10',label:'L10'},
  noRows:()=>S.f.nbaPriceBoard?.source==='no-games'?'No upcoming NBA games on this slate.':
    S.f.nbaPriceBoard?.source==='unavailable'||S.f.nbaPriceBoard?.source==='partial'?
      'The DraftKings main-line feed is unavailable. We’ll retry automatically.':
    S.odds.length?'Available DraftKings main lines could not be matched to the player data.':
      'DraftKings hasn’t posted main player lines for this slate yet. We’ll check again automatically.',
  hints:{'Maximum spread':'Raise maximum spread toward 14.5.','Minimum total':'Lower the minimum game total.',
    'Type sample':'Try a smaller type-edge sample.','Season or L10 hit rate':'Try a lower minimum hit rate.',
    'Quote older than two hours or untimestamped':'Check again after the next price refresh.'},
});
export const savedParlayTickets=nba.savedTickets;
export const parlayPage=data=>nba.page(data);
export function parlayAction(act,value,data,target){
  if(act==='parlayBuilderRange'){
    if(Object.hasOwn(builderRanges,value))keep(builderRangeKey,value);
    return true;
  }
  return nba.action(act,value,data,target);
}
