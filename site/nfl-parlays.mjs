// GOING LONG Suggested Parlays: the shared parlay page (parlay-ui.mjs) with the NFL engine and filters.
import {current as S,slate} from './ui.mjs';
import {defaults,evaluate,markets,weights,yardMarkets} from './nfl-parlay-engine.mjs';
import {createParlays} from './parlay-ui.mjs';

const nfl=createParlays({
  settingsKey:'nfl-parlay-settings',ticketsKey:'nfl-parlay-tickets',
  engine:{defaults,weights,markets,evaluate},
  weightNames:{form:'Hit rates',matchup:'Matchup',line:'Value vs price',context:'Game context',mix:'Stat variety'},
  fields:[{key:'hit',label:'Min. hit rate %',min:0,max:100},{key:'sample',label:'Min. games played',min:1,max:17,integer:true},
    {key:'spread',label:'Max. spread',min:0,max:30,step:.5},{key:'total',label:'Min. total',min:0,max:70,step:.5}],
  summary:f=>[f.hit+'% min. hit rate',f.sample+'+ games played',f.spread+' max spread',f.total+' min. total'],
  period:()=>S.year+'-'+S.week,periodLabel:()=>S.year+' Week '+S.week,
  nav:()=>slate({navOnly:true}),
  intro:'<p class="subtle">Priced NFL player props screened on game logs, what each defense allows to the player’s role, value against the price, and game context: spread, team total, the ensemble model, weather, usage trends and injuries.</p>',
  recent:{key:'last5',label:'L5'},
  legText:leg=>yardMarkets.has(leg.stat)?leg.side+' '+leg.line+' '+leg.stat+' yds':leg.stat+': '+(leg.side==='Over'?'Yes':'No'),
  noRows:'No priced NFL player props were published for this week yet. Prices usually post a few days before kickoff.',
  hints:{'Maximum spread':'Raise the maximum spread.','Minimum total':'Lower the minimum game total.',
    'Season or L5 hit rate':'Try a lower minimum hit rate (TD props rarely clear 60%).','Too few games played':'Lower the minimum games played.',
    'Defense rank vs role':'Try Over and Under, or more stat types.','Hit rate below the price':'Widen the odds range or add stat types.'},
});
export const nflParlayPage=data=>nfl.page(data);
export const nflParlayAction=(act,value,data,target)=>nfl.action(act,value,data,target);
