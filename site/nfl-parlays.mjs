// GOING LONG Suggested Parlays: the shared parlay page (parlay-ui.mjs) with the NFL engine and filters.
import {current as S,slate,tools,btn,esc} from './ui.mjs';
import {href} from './config.mjs';
import {defaults,evaluate,markets,weights,yardMarkets,tdMarkets,ticketRules,warnings,PRIOR} from './nfl-parlay-engine.mjs';
import {createParlays} from './parlay-ui.mjs';

const nfl=createParlays({
  settingsKey:'nfl-parlay-settings',ticketsKey:'nfl-parlay-tickets',
  liveDraft:true,
  engine:{defaults,weights,markets,evaluate},
  weightNames:{form:'Hit rates',matchup:'Role matchup',line:'Value and projection',context:'Game context',mix:'Stat variety'},
  fields:[{key:'hit',label:'Min. last-8 hit rate %',min:0,max:100},{key:'sample',label:'Min. games played',min:1,max:17,integer:true},
    {key:'spread',label:'Max. spread',min:0,max:30,step:.5},{key:'total',label:'Min. total',min:0,max:70,step:.5},
    {key:'tdMax',label:'Max. TD legs',min:0,max:3,integer:true}],
  checks:[{key:'stacks',label:'Allow correlated same-game stacks (QB with his receiver)'},{key:'weather',label:'Cut passing-game Overs in 15+ mph wind or rain'}],
  rules:ticketRules,warnings,prior:PRIOR,chanceNote:'Season rates with 8 wins and 8 losses added',
  summary:f=>[f.hit+'% min. last-8 hit rate',f.sample+'+ games played',f.spread+' max spread',f.total+' min. total',
    (f.tdMax??1)+' max TD legs',f.stacks?'correlated stacks allowed':'',f.weather===false?'weather cut off':''].filter(Boolean),
  period:()=>S.year+'-'+S.week,periodLabel:()=>S.year+' Week '+S.week,
  nav:()=>slate({navOnly:true}),
  intro:()=>{
    const availability=S.nflAvailability;
    const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
    const stamp=iso=>Number.isFinite(Date.parse(iso))?format.format(new Date(iso)):null;
    const report=stamp(availability?.reportAt),checked=stamp(availability?.checkedAt);
    const games=S.games.filter(g=>availability?.games?.[g.id]&&Object.keys(availability.games[g.id]).length===2).length;
    const status=[report?'ESPN injury report '+report:null,checked?'Last checked '+checked:null,
      games?games+' games with inactives reported for both teams':null].filter(Boolean).join(' · ');
    return tools(`<a class="pill" href="${href('long/parlay-tracker.html')}">NFL Leg Tracker</a>`+
      btn('Check for updates','nflParlayCheck','')+`<span class="subtle">${esc(status||'Waiting for a timestamped injury report')}</span>`)+
      '<p class="subtle">The suggested draft updates as injury reports, game-day inactives and published prices change. Generate to save a ticket to your history.</p>';
  },
  recent:{key:'last8',label:'L8'},
  legText:leg=>tdMarkets.has(leg.stat)?leg.stat+': '+(leg.side==='Over'?'Yes':'No'):leg.side+' '+leg.line+' '+leg.stat+(yardMarkets.has(leg.stat)?' yds':''),
  noRows:'No priced NFL player props were published for this week yet. Prices usually post a few days before kickoff.',
  hints:{'Maximum spread':'Raise the maximum spread.','Minimum total':'Lower the minimum game total.',
    'Last 8 hit rate':'Try a lower minimum hit rate (TD props rarely clear 60%).','Too few games played':'Lower the minimum games played.',
    'Defense rank vs role':'Fewer defenses rank in the weak third for every role; try more stat types or both sides.',
    'Line vs projection':'Most lines sit above the projection this week; try Unders or more stat types.',
    'Wind or rain':'Turn off the weather cut to keep passing-game Overs in bad weather.'},
});
export const nflParlayPage=data=>nfl.page(data);
export const nflParlayAction=(act,value,data,target)=>nfl.action(act,value,data,target);
export const savedNflTickets=nfl.savedTickets;
