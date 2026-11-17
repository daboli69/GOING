// GOING UP Suggested Parlays: the shared parlay page (parlay-ui.mjs) with the NBA engine and filters.
import {current as S,badge,box,btn,empty,esc,slate,tools} from './ui.mjs';
import {href} from './config.mjs';
import {pct} from './math.mjs';
import {legKey} from './parlay-core.mjs';
import {defaults,evaluate,markets,nbaLegChance,weights} from './nba-parlay-engine.mjs';
import {createParlays} from './parlay-ui.mjs';
import {nbaTicketsKey,resolveNbaTicketLeg} from './nba-parlay-results.mjs';
export {toAmerican,fromAmerican} from './parlay-ui.mjs';

function poolSummary({eligible,screened},cfg){
  const games=new Set(eligible.map(leg=>leg.game)).size;
  const sides=cfg.side==='Both'?['Over','Under']:[cfg.side];
  const quotes=sides.map(side=>{
    const fresh=screened.filter(leg=>leg.side===side&&!leg.checks.Quote&&!leg.checks['Quote freshness']&&!leg.checks['Tip time']).length;
    const qualified=eligible.filter(leg=>leg.side===side).length;
    return fresh?`${qualified} of ${fresh} ${side} quotes qualify`:`No fresh ${side} quotes`;
  });
  return [...quotes,`${games} qualifying ${games===1?'game':'games'}`].join(' · ')+
    (cfg.perGame&&games>0&&games<cfg.legs?`. One leg per game limits this ticket to at most ${games}.`:'');
}

function fullList(_data,{eligible},ticket){
  if(!eligible.length)return box('Full List',empty('No priced legs pass the current filters.'));
  const onTicket=new Set(ticket.map(legKey));
  const ranked=eligible.map(leg=>({leg,chance:nbaLegChance(leg)}))
    .sort((a,b)=>b.chance-a.chance||b.leg.form.season.n-a.leg.form.season.n||b.leg.score-a.leg.score);
  const rows=ranked.map(({leg,chance})=>{
    const {season,last10}=leg.form;
    const price=Number(leg.price)>0?'+'+Number(leg.price):leg.price;
    const type=leg.context.type;
    return `<li><div class="parlay-pool-row"><div><strong>${esc(leg.name)}</strong> ${esc(leg.team+' vs '+leg.opp)}
      <div>${esc(leg.side+' '+leg.line+' '+leg.stat+' · '+price+' '+leg.provider)} ${badge(type&&type!=='—'?'Type '+type:'Type unavailable')} ${onTicket.has(legKey(leg))?badge('On ticket','g'):''}</div></div>
      <strong>${pct(chance,1)}</strong></div>
      <p class="subtle">Season ${season.hits}/${season.n} · Last 10 ${last10.hits}/${last10.n}</p>
      <p><strong>Why it qualifies</strong> ${esc(leg.reasons.join(' · '))}</p>
      ${leg.flags.length?`<p class="subtle"><strong>Watch</strong> ${esc(leg.flags.join(' · '))}</p>`:''}</li>`;
  });
  return box('Full List',`<p class="subtle">${ranked.length} eligible legs, ranked by estimated hit chance. Season rates are pulled toward 50% for small samples. A qualifying teammate split can move the estimate by up to 3 percentage points. Future results can differ.</p>
    <ol class="parlay-pool">${rows.join('')}</ol>`);
}

const nba=createParlays({
  settingsKey:'nba-parlay-settings',ticketsKey:nbaTicketsKey,liveDraft:true,prefill:false,resolveSavedLeg:resolveNbaTicketLeg,
  engine:{defaults,weights,markets,evaluate},
  weightNames:{form:'Hit rates',matchup:'Matchup',line:'Line vs average',context:'Game context',mix:'Stat variety'},
  fields:[{key:'hit',label:'Min. hit rate %',min:0,max:100},{key:'sample',label:'Min. type sample',min:1,max:30,integer:true},
    {key:'spread',label:'Max. spread',min:0,max:14.5,step:.5},{key:'total',label:'Min. total',min:0,max:300,step:.5}],
  summary:f=>[f.hit+'% min. hit rate',f.sample+'-game type sample',f.spread+' max spread',f.total+' min. total'],
  period:()=>S.day,periodLabel:()=>S.day,
  nav:()=>slate({navOnly:true,date:true}),
  intro:()=>tools(`<a class="pill" href="${href('up/parlay-tracker.html')}">Parlay Leg Tracker</a>`+
    btn('Check for updates','nbaParlayCheck','')),
  afterTicket:fullList,poolSummary,
  chance:nbaLegChance,
  chanceNote:'Sample-adjusted season rates with lineup context',
  recent:{key:'last10',label:'L10'},
  noRows:'No priced NBA props were published for this slate. Try again after the next price refresh.',
  hints:{'Maximum spread':'Raise maximum spread toward 14.5.','Minimum total':'Lower the minimum game total.',
    'Type sample':'Try a smaller type-edge sample.','Season or L10 hit rate':'Try a lower minimum hit rate.',
    'Quote older than two hours or untimestamped':'Check again after the next price refresh.'},
});
export const savedParlayTickets=nba.savedTickets;
export const parlayPage=data=>nba.page(data);
export const parlayAction=(act,value,data,target)=>nba.action(act,value,data,target);
