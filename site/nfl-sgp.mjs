import {href} from './config.mjs';
import {current as S,box,btn,esc,pct,round,slate,table,tools} from './ui.mjs';
import {correlation,markets,tdMarkets,weights,yardMarkets} from './nfl-parlay-engine.mjs';
import {buildSameGame,evaluateSameGame,sgpDefaults} from './nfl-sgp-engine.mjs';
import {legKey} from './parlay-core.mjs';
import {createParlays} from './parlay-ui.mjs';

const name=game=>game.a+' @ '+game.h;
const legText=leg=>tdMarkets.has(leg.stat)?leg.stat+': '+(leg.side==='Over'?'Yes':'No'):
  leg.side+' '+leg.line+' '+leg.stat+(yardMarkets.has(leg.stat)?' yds':'');
const quoteText=leg=>(Number(leg.price)>0?'+':'')+Number(leg.price);

function evidence(_data,report,ticket){
  if(!report.screened.length)return '';
  const selected=new Set(ticket.map(legKey));
  const rows=[...report.screened].sort((a,b)=>Number(!!a.cut)-Number(!!b.cut)||b.score-a.score||a.name.localeCompare(b.name));
  return box('Matchup evidence',table(['Player','Leg','Quote','Projection','Opponent rank','Similar defenses','Decision'],rows.map(l=>{
    const {comparable,games}=l.sgp,rank=l.context.defense?.rank;
    const sample=games.length?'<small>'+esc(games.map(g=>g.opponent+' '+g.date.slice(5)+' · '+round(g.value,1)).join(' / '))+'</small>':'';
    return [esc(l.name+' · '+l.team),esc(legText(l)),esc(quoteText(l)),round(l.projection,1),
      rank?esc(l.opp+' '+rank.rank+'/'+rank.total+' · '+l.context.role):'—',
      comparable.n?esc(comparable.hits+'/'+comparable.n)+' · '+pct(comparable.rate)+'<br>'+sample:sample||'—',
      esc(l.cut||(selected.has(legKey(l))?'On draft':'Eligible'))];
  }),{sort:'nfl-sgp-evidence',wrap:'box'}),'Opponent rank 1 allows the least. Comparisons use yards allowed per attempt or target, volume share, and explosive-run or deep-target rates. Each opponent’s profile uses only games played before that matchup.');
}

function summary(ticket){
  const stacks=[];
  for(let i=0;i<ticket.length;i++)for(let j=i+1;j<ticket.length;j++){
    if(correlation(ticket[i],ticket[j])>0)stacks.push(ticket[i].name+' and '+ticket[j].name);
  }
  return '<p class="subtle">Quotes are for individual legs. Check your sportsbook for same-game combinations, joint odds and payout.</p>'+
    (stacks.length?'<p class="callout">Passing stack: '+esc(stacks.join(', '))+'. These legs can rise and fall together.</p>':'');
}

const sgp=createParlays({
  title:'Same-Game Parlays',singleGame:true,liveDraft:true,
  settingsKey:'nfl-sgp-settings',ticketsKey:'nfl-sgp-tickets',
  engine:{defaults:sgpDefaults,weights,markets,evaluate:evaluateSameGame},build:buildSameGame,ticketSummary:summary,
  weightNames:{form:'Hit rates',matchup:'Defensive matchup',line:'Value and projection',context:'Game context',mix:'Stat variety'},
  fields:[{key:'hit',label:'Min. last-8 hit rate %',min:0,max:100},{key:'sample',label:'Min. games played',min:1,max:17,integer:true},
    {key:'tdMax',label:'Max. TD legs',min:0,max:3,integer:true}],
  checks:[{key:'weather',label:'Cut passing-game Overs in 15+ mph wind or rain'}],
  summary:f=>[f.hit+'% min. last-8 hit rate',f.sample+'+ games played',f.tdMax+' max TD legs'],
  period:()=>S.year+'-'+S.week+'-'+(S.game?.id||''),periodLabel:()=>S.year+' Week '+S.week+(S.game?' · '+name(S.game):''),
  nav:()=>slate()+tools((S.game?`<strong>${esc(name(S.game))}</strong> <a class="pill" href="${href('long/game-previews.html?game='+encodeURIComponent(S.game.id))}">Game Preview</a>`:'')+
    btn('Check for updates','nflParlayCheck','')),
  intro:'<p class="subtle">Choose a matchup to rank its priced player props on both sides. Saved tickets and their results stay in SGP ticket history on this browser.</p>',
  afterTicket:evidence,recent:{key:'last8',label:'L8'},legText,
  noRows:'No current player-prop prices are available for this matchup.',
  hints:{'Last 8 hit rate':'Try your preferred stat types or a lower hit-rate floor.',
    'Matchup evidence insufficient':'Try both sides or other prop types for this matchup.',
    'Quote older than two hours or untimestamped':'Check again when the next price snapshot is published.',
    'Game already started or kickoff time missing':'Choose an upcoming matchup.'}
});

export const nflSgpPage=data=>sgp.page(data);
export const nflSgpAction=(act,value,data,target)=>sgp.action(act,value,data,target);
