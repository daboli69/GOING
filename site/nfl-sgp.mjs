import {href} from './config.mjs';
import {current as S,action,badge,box,btn,cell,dateLabel,dialog,esc,pct,round,slate,table,tools} from './ui.mjs';
import {correlation,markets,tdMarkets,weights,yardMarkets} from './nfl-parlay-engine.mjs';
import {buildSameGame,comparableLimit,defenseMatchMetrics,evaluateSameGame,sgpDefaults} from './nfl-sgp-engine.mjs';
import {legKey} from './parlay-core.mjs';
import {outcome} from './track-core.mjs';
import {createParlays} from './parlay-ui.mjs';

const name=game=>game.a+' @ '+game.h;
const legText=leg=>tdMarkets.has(leg.stat)?leg.stat+': '+(leg.side==='Over'?'Yes':'No'):
  leg.side+' '+leg.line+' '+leg.stat+(yardMarkets.has(leg.stat)?' yds':'');
const quoteText=leg=>(Number(leg.price)>0?'+':'')+Number(leg.price);

function comparisonSummary(leg){
  const {comparable,games}=leg.sgp;
  if(!games.length)return cell(tdMarkets.has(leg.stat)?'Not used for TDs':'No matches','sgp-comparison');
  const result=comparable.n?comparable.hits+'/'+comparable.n+' hit · '+pct(comparable.rate):'All pushes';
  return {...cell(`<button class="sgp-comparison-button" type="button" aria-haspopup="dialog"
    aria-label="View similar defenses for ${esc(leg.name+' '+legText(leg))}" ${action('similarDefenses',legKey(leg))}>
    <strong>${result}</strong><span>View ${games.length} ${games.length===1?'game':'games'}</span></button>`,'sgp-comparison'),value:comparable.rate??-1};
}

function evidence(_data,report,ticket){
  S.f.sgpEvidence=new Map(report.screened.map(leg=>[legKey(leg),leg]));
  if(!report.screened.length)return '';
  const selected=new Set(ticket.map(legKey));
  const rows=[...report.screened].sort((a,b)=>Number(!!a.cut)-Number(!!b.cut)||b.score-a.score||a.name.localeCompare(b.name));
  const intro='<p class="subtle">Select the similar-defense record to see each game and compare its defensive stats with this matchup. Games need enough prior defensive data to qualify.</p>';
  return box('Matchup evidence',intro+table(['Player','Leg','Similar defenses','Quote','Projection','Opponent rank','Decision'],rows.map(l=>{
    const rank=l.context.defense?.rank;
    return [esc(l.name+' · '+l.team),esc(legText(l)),comparisonSummary(l),esc(quoteText(l)),round(l.projection,1),
      rank?esc(l.opp+' '+rank.rank+'/'+rank.total+' · '+l.context.role):'—',
      esc(l.cut||(selected.has(legKey(l))?'On draft':'Eligible'))];
  }),{sort:'nfl-sgp-evidence',wrap:'box',cls:'sgp-evidence'}),'Opponent rank 1 allows the least. Similar-defense games use only defensive stats available before each matchup.');
}

function similarDefenseDetails(leg){
  const {games,comparable}=leg.sgp;
  const kind=games[0]?.profile?.kind;
  const rateName=kind==='rush'?'Explosive runs gain at least 10 yards. Rush share is the percentage of rushes among rushes and pass attempts faced.':
    kind==='pass'?'Deep throws travel at least 15 air yards. Pass share is the percentage of pass attempts among rushes and pass attempts faced.':
      'Deep targets travel at least 15 air yards. Target share is the share of all targets thrown to that position.';
  const comparison=kind==='rush'?'yards per carry, run volume and explosive runs':
    kind==='pass'?'yards per attempt, passing volume and deep throws':'yards per target, target share and deep targets to that position';
  const results={won:['Hit','g'],lost:['Miss','r'],push:['Push','']};
  const history=games.map(game=>{
    const [status,tone]=results[outcome(game.value,leg.line,leg.side)]||['—',''];
    const metrics=game.profile?defenseMatchMetrics(game.profile):[];
    const format=(v,percentage)=>percentage?pct(v,1):round(v,2);
    const rows=metrics.map(({label,target,past,percentage})=>[esc(label),format(target,percentage),format(past,percentage)]);
    return `<article class="card sgp-defense-card">
      <h3>${esc(game.opponent)} <span class="subtle">${esc(dateLabel(game.date,true))}</span></h3>
      <p class="sgp-defense-result"><strong>${esc(String(game.value))}${yardMarkets.has(leg.stat)?' yd':''}</strong> ${badge(status,tone)}
        <span class="subtle">Match distance ${round(game.distance,2)}</span></p>
      ${table(['Defense metric',esc(leg.opp)+' now',esc(game.opponent)+' then'],rows,{cls:'sgp-defense-metrics'})}
    </article>`;
  });
  const scales=games[0]?.profile?defenseMatchMetrics(games[0].profile).map(({scale,percentage})=>percentage?round(scale*100,0)+' percentage points':round(scale,2)+' yards'):[];
  const record=comparable.n?comparable.hits+' hits in '+comparable.n+' graded games · '+pct(comparable.rate):'No graded results';
  return `<p><strong>${esc(leg.name+' · '+legText(leg))}</strong> vs ${esc(leg.opp)}</p>
    <p class="subtle">${record}${comparable.pushes?' · '+comparable.pushes+' '+(comparable.pushes===1?'push':'pushes'):''}. Each result uses the current line and side.</p>
    <p class="subtle">These defenses were close on ${comparison}. A smaller match distance means the profiles are closer.</p>
    <details class="sgp-defense-method"><summary>How defenses are matched</summary>
      <p>Each profile uses only games played before its own matchup. The table compares ${esc(leg.opp)} before this game and each past opponent before the game shown.</p>
      <p>The model scales the three gaps${scales.length?' by '+scales.join(', ')+' in table order':''}, then takes their root mean square. A distance of ${comparableLimit.toFixed(2)} or less qualifies. Up to six games are shown.</p>
      <p>${rateName}</p>
    </details>
    <div class="sgp-defense-list">${history.join('')}</div>`;
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
export function nflSgpAction(act,value,data,target){
  if(act!=='similarDefenses')return sgp.action(act,value,data,target);
  const leg=S.f.sgpEvidence?.get(value);
  if(!leg?.sgp.games.length)return false;
  dialog('Similar defenses',similarDefenseDetails(leg),true);
  const filters=S.f;
  document.querySelector('#dialog').addEventListener('close',()=>{
    if(S.f!==filters)return;
    const selector=`[data-act="similarDefenses"][data-v="${CSS.escape(value)}"]`;
    document.querySelector(selector)?.focus({preventScroll:true});
  },{once:true});
  return true;
}
