// GOING LONG Suggested Parlays: the shared parlay page (parlay-ui.mjs) with the NFL engine and filters.
import {current as S,slate,tools,btn,esc,box,table,round,teamName,today} from './ui.mjs';
import {href} from './config.mjs';
import {nflInjuryContext} from './nfl-availability.mjs';
import {nflOut} from './nfl-workload.mjs';
import {defaults,evaluate,markets,weights,yardMarkets,tdMarkets,ticketRules,warnings,PRIOR} from './nfl-parlay-engine.mjs';
import {createParlays} from './parlay-ui.mjs';
import {legKey} from './parlay-core.mjs';

function workloadChanges(data,report,ticket){
  if(!data.changes.length)return '';
  const key=(player,game,stat)=>[player,game,stat].join('|');
  const priced=new Set(data.rows.map(r=>key(r.player.id,r.game.id,r.stat)));
  const reviewed=new Map(), selected=new Set(ticket.map(legKey));
  for(const leg of report.screened){
    const id=key(leg.player,leg.game,leg.stat);
    if(!reviewed.has(id))reviewed.set(id,[]);
    reviewed.get(id).push(leg);
  }
  const screening=r=>{
    const id=key(r.player.id,r.game.id,r.stat);
    const legs=reviewed.get(id);
    if(!legs)return priced.has(id)?'Outside selected sides or stat filters':'No published price';
    return legs.map(leg=>{
      const price=Number(leg.price)>0?'+'+Number(leg.price):leg.price;
      const cuts=Object.values(leg.checks).filter(Boolean);
      const reasons=[...new Set([...cuts.slice(0,2),leg.checks.Value||cuts[2]].filter(Boolean))];
      const decision=selected.has(legKey(leg))?'On draft':!leg.cut?'Eligible · outside draft':reasons.join(' · ');
      return `<div><strong>${esc(leg.side+' '+leg.line+' ('+price+')')}</strong><br>${esc(decision)}</div>`;
    }).join('');
  };
  const rows=[...data.changes].sort((a,b)=>Math.abs(b.value-b.baseline)/Math.max(b.baseline,1)-Math.abs(a.value-a.baseline)/Math.max(a.baseline,1));
  return box('Injury-adjusted projections',table(['Player','Game','Stat','Baseline','Adjusted','RotoWire via Sleeper','Teammates out','Price and screening'],
    rows.map(r=>[esc(r.player.name+' · '+r.player.team),esc(r.game.a+' @ '+r.game.h),esc(r.stat),round(r.baseline,1),
      round(r.value,1),r.sleeper==null?'—':round(r.sleeper,1),esc(r.absences.join(', ')),screening(r)]),{sort:'nfl-workload',wrap:'box'}),
    'A workload change can move the projection across a line. The price and screening column shows whether that leg qualifies. With at least four comparable games, the engine can use form from games without the same teammates.','nfl-workload');
}

function injuryReport(){
  const rows=S.games.filter(g=>g.date>=today).flatMap(g=>[g.a,g.h].flatMap(team=>{
    const opponent=team===g.a?g.h:g.a;
    const {report}=nflInjuryContext(S.nflAvailability,S.injuries,g,team,opponent,teamName);
    return report.filter(r=>nflOut(r.status)||/questionable|doubtful/i.test(r.status||'')).map(r=>[
      esc(g.a+' @ '+g.h),esc(team),esc(r.name),esc(r.pos??'—'),esc(r.status)]);
  }));
  return rows.length?`<details class="details" data-nfl-injuries ${S.f.nflInjuriesOpen?'open':''}><summary>Injuries and inactives (${rows.length})</summary>`+
    table(['Matchup','Team','Player','Pos.','Status'],rows,{sort:'nfl-reported-injuries',wrap:'box'})+'</details>':'';
}

const nfl=createParlays({
  settingsKey:'nfl-parlay-settings',ticketsKey:'nfl-parlay-tickets',
  liveDraft:true,
  engine:{defaults,weights,markets,evaluate},
  weightNames:{form:'Hit rates',matchup:'Role matchup',line:'Value and projection',context:'Game context',mix:'Stat variety'},
  fields:[{key:'hit',label:'Min. last-8 hit rate %',min:0,max:100},{key:'sample',label:'Min. games played',min:1,max:17,integer:true},
    {key:'spread',label:'Max. spread',min:0,max:30,step:.5},{key:'total',label:'Min. total',min:0,max:70,step:.5},
    {key:'tdMax',label:'Max. TD legs',min:0,max:3,integer:true}],
  checks:[{key:'stacks',label:'Allow correlated same-game stacks (QB with his receiver)'},{key:'weather',label:'Cut passing-game Overs in 15+ mph wind or rain'}],
  rules:ticketRules,warnings,prior:PRIOR,chance:leg=>leg.chance,
  chanceNote:'Applicable hit rates shrunk toward 50%, or toward the quoted chance for TD legs',
  summary:f=>[f.hit+'% min. last-8 hit rate',f.sample+'+ games played',f.spread+' max spread',f.total+' min. total',
    (f.tdMax??1)+' max TD legs',f.stacks?'correlated stacks allowed':'',f.weather===false?'weather cut off':''].filter(Boolean),
  period:()=>S.year+'-'+S.week,periodLabel:()=>S.year+' Week '+S.week,
  nav:()=>slate({navOnly:true}),
  afterTicket:(data,report,ticket)=>workloadChanges(data,report,ticket)+injuryReport(),
  intro:()=>{
    const availability=S.nflAvailability;
    const format=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
    const stamp=iso=>Number.isFinite(Date.parse(iso))?format.format(new Date(iso)):null;
    const report=stamp(availability?.reportAt),checked=stamp(availability?.checkedAt);
    const games=S.games.filter(g=>availability?.games?.[g.id]&&Object.keys(availability.games[g.id]).length===2).length;
    const status=[report?'ESPN injury report '+report:null,checked?'Last checked '+checked:null,
      games?games+' games with inactives reported for both teams':null].filter(Boolean).join(' · ');
    return tools(`<a class="pill" href="${href('long/parlay-tracker.html')}">NFL Leg Tracker</a> <a class="pill" href="${href('long/same-game-parlays.html')}">Same-Game Parlays</a>`+
      btn('Check for updates','nflParlayCheck','')+`<span class="subtle">${esc(status||'Waiting for a timestamped injury report')}</span>`)+
      '<p class="subtle">The suggested draft updates as injury reports, game-day inactives, projections and published prices change. Generate to save a ticket to your history.</p>';
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
