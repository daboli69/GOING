// GOING UP Suggested Parlays: the shared parlay page (parlay-ui.mjs) with the NBA engine and filters.
import {current as S,btn,slate,tools} from './ui.mjs';
import {href} from './config.mjs';
import {buildNbaTicket,defaults,evaluate,markets,nbaLegChance,weights} from './nba-parlay-engine.mjs';
import {createParlays,parlayPool,parlayPoolSummary} from './parlay-ui.mjs';
import {nbaTicketsKey,resolveNbaTicketLeg} from './nba-parlay-results.mjs';
export {toAmerican,fromAmerican} from './parlay-ui.mjs';

const fullList=(_data,report,ticket)=>parlayPool(report,ticket,{
  chance:nbaLegChance,
  legText:leg=>leg.side+' '+leg.line+' '+leg.stat,
  tag:leg=>leg.context.type&&leg.context.type!=='—'?'Type '+leg.context.type:'Type unavailable',
  form:({form:{season,last10}})=>`Season ${season.hits}/${season.n} · Last 10 ${last10.hits}/${last10.n}`,
  note:'Season rates are pulled toward 50% for small samples. A qualifying teammate split can move the estimate by up to 3 percentage points. Future results can differ.'
});

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
  afterTicket:fullList,poolSummary:(report,cfg)=>parlayPoolSummary(report,cfg,'Tip time'),
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
export const parlayAction=(act,value,data,target)=>nba.action(act,value,data,target);
