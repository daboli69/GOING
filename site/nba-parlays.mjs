// GOING UP Suggested Parlays: the shared parlay page (parlay-ui.mjs) with the NBA engine and filters.
import {current as S,slate} from './ui.mjs';
import {href} from './config.mjs';
import {defaults,evaluate,markets,weights} from './nba-parlay-engine.mjs';
import {createParlays} from './parlay-ui.mjs';
export {toAmerican,fromAmerican} from './parlay-ui.mjs';

const nba=createParlays({
  settingsKey:'nba-parlay-settings',ticketsKey:'nba-parlay-tickets',
  engine:{defaults,weights,markets,evaluate},
  weightNames:{form:'Hit rates',matchup:'Matchup',line:'Line vs average',context:'Game context',mix:'Stat variety'},
  fields:[{key:'hit',label:'Min. hit rate %',min:0,max:100},{key:'sample',label:'Min. type sample',min:1,max:30,integer:true},
    {key:'spread',label:'Max. spread',min:0,max:14.5,step:.5},{key:'total',label:'Min. total',min:0,max:300,step:.5}],
  summary:f=>[f.hit+'% min. hit rate',f.sample+'-game type sample',f.spread+' max spread',f.total+' min. total'],
  period:()=>S.day,periodLabel:()=>S.day,
  nav:()=>slate({navOnly:true,date:true}),
  intro:`<p><a class="pill" href="${href('up/parlay-tracker.html')}">Parlay Leg Tracker</a></p>`,
  recent:{key:'last10',label:'L10'},
  noRows:'No priced NBA props were published for this slate. Try again after the next price refresh.',
  hints:{'Maximum spread':'Raise maximum spread toward 14.5.','Minimum total':'Lower the minimum game total.',
    'Type sample':'Try a smaller type-edge sample.','Season or L10 hit rate':'Try a lower minimum hit rate.'},
});
export const savedParlayTickets=nba.savedTickets;
export const parlayPage=data=>nba.page(data);
export const parlayAction=(act,value,data,target)=>nba.action(act,value,data,target);
