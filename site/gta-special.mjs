import {gtaClasses,gtaQuoteAge,gtaVisible,breakEven,stress} from './gta-event.mjs';
import {current as S,box,btn,cell,dataURL,dateLabel,empty,esc,get,grid,metric,pct,round,select,table,tools} from './ui.mjs';
import {href,sections} from './config.mjs';

const classOptions=[['','All evidence levels'],...Object.entries(gtaClasses)];
const scopes=['Player','Team','Game'];
const moves=[['1','1'],['3','3'],['5','5']];
const countFmt=new Intl.NumberFormat('en-US');
const timestamp=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const time=x=>Number.isFinite(Date.parse(x))?timestamp.format(new Date(x)):'—';
const odds=x=>(x>0?'+':'')+x;
const pp=x=>(x>0?'+':'')+round(x*100,1)+' pp';
const sportName=s=>sections[s]?.league??s.toUpperCase();
const strengths={supported:2,sensitive:1,unsupported:0};
const models={'nba-form':'GOING UP adjusted season hit rate and lineup context','nfl-form':'GOING LONG shrunk hit rate from the leg tracker',
  'nhl-poisson':'GOING GOAL opponent-adjusted count forecast','college-score':'GOING college scoring projection'};
const sources=[
  ['Rockstar launch confirmation','Nov 19, 2026','https://www.rockstargames.com/en/newswire/article/39akk424a9oo53/grand-theft-auto-vi-now-available'],
  ['PlayStation release and preload timing','Nov 10, 2026','https://blog.playstation.com/2026/11/10/pre-load-grand-theft-auto-vi-on-ps5-starting-today/'],
  ['Associated Press athlete interviews','Nov 18, 2026','https://apnews.com/article/gta-grand-theft-auto-nba-nfl-nhl-0d7ac91360ffd7fad8a4446208a77d32'],
  ['Miami Heat promotion announcement','Oct 2, 2026','https://www.nba.com/heat/news/miami-heat-and-rockstar-games-bring-a-night-in-vice-city-to-kaseya-center'],
  ['Colorado game preview','Nov 19, 2026','https://www.nhl.com/avalanche/news/game-preview-11-19-26'],
  ['Controlled pre-sleep gaming study in adolescents','Apr 2010','https://pmc.ncbi.nlm.nih.gov/articles/PMC2854707/'],
  ['Controlled adult gaming experiment','Mar 2025','https://pubmed.ncbi.nlm.nih.gov/40069981/'],
  ['Sleep loss and physical performance meta-analysis','Jun 16, 2022','https://doi.org/10.1007/s40279-022-01706-y']
];

export async function loadGta(){
  const [snapshot,status]=await Promise.all([get(href('gta-special-snapshot.json'),null),get(dataURL('gta-special-status.json'),null)]);
  return {snapshot,status};
}
function rank(rows,snapshot){
  return [...rows].sort((a,b)=>strengths[b.classification]-strengths[a.classification]||
    (snapshot.reliability[b.cohort]?.matched??0)-(snapshot.reliability[a.cohort]?.matched??0)||
    (b.baselineEV??-Infinity)-(a.baselineEV??-Infinity)||a.subject.localeCompare(b.subject));
}
function rowNote(row,snapshot){
  if(row.starterUnverified)return 'Goalie starter unverified';
  if(row.unavailable)return 'Availability check failed';
  if(row.prob==null)return row.projection==null?'No matched GOING probability':'Projection only';
  const cohort=snapshot.reliability[row.cohort];
  if(row.classification==='supported')return 'Positive baseline after calibration screen';
  if(row.classification==='sensitive')return 'Stress test crosses the quoted break-even';
  return cohort?.games?'Insufficient independent validation':'No comparable graded cohort';
}
const pricesStale=row=>Date.now()-Date.parse(row.quoteAt)>gtaQuoteAge;
function priceText(row){
  const state=Date.parse(row.start)<=Date.now()?'Game started':pricesStale(row)?'Price aged out':'Frozen price';
  return `<strong>${esc(odds(row.odds))}</strong> <small>${esc(row.provider||'Unknown book')}<br>${esc(time(row.quoteAt))}<br>${state}</small>`;
}
function scenario(row,step){
  const values=stress(row,step);
  if(!values.length)return '—';
  const display=v=>pct(v.prob,1)+(v.projected==null?'':' · '+round(v.projected,2)+' projected')+' · '+pct(v.ev,1)+' EV';
  return `<small>Lower ${display(values[0])}<br>Higher ${display(values[2])}</small>`;
}
function rankings(rows,snapshot,step){
  return table(['Market','Price at capture','GOING baseline','Est. EV','Lift to break-even','Scenario sensitivity','Evidence'],
    rows.map(row=>[
      cell(`<strong>${esc(row.subject)}</strong><br><small>${esc(sportName(row.sport)+' · '+row.market+' Under '+row.line)}<br>${esc(row.matchup+' · '+time(row.start))}</small>`,'gta-subject'),
      cell(priceText(row),'gta-price'),
      cell(row.prob==null&&!Number.isFinite(row.projection)?'—':
        pct(row.prob,1)+(row.projection!=null?'<br><small>'+round(row.projection,2)+' projected</small>':'')+
        '<br><small>'+esc(models[row.model]||'')+(row.modelAt?'<br>'+esc(time(row.modelAt)):'')+'</small>'),
      cell(row.baselineEV==null?'—':pct(row.baselineEV,1)+(row.push==null?'<br><small>per non-push</small>':'')),
      cell(row.prob==null?'—':pp(Math.max(0,breakEven(row.odds)-row.prob))),
      cell(scenario(row,step)),
      cell('<strong>'+gtaClasses[row.classification]+'</strong><br><small>'+esc(rowNote(row,snapshot))+'</small>')
    ]),{wrap:'box',cls:'gta-board',empty:'No markets meet the current filters.'});
}

function coverage(snapshot){
  return box('Slate and market coverage',table(['Sport','Listed events','Pregame at capture','Priced unders','GOING probability','Market families'],
    Object.entries(snapshot.coverage).map(([s,c])=>[esc(sportName(s)),c.events,c.open,c.priced,c.modeled,esc(c.markets.join(', '))+
      (c.watchTotals>0&&!c.markets.includes('Game total')?`<small> ${c.watchTotals} game totals without an executable Under price</small>`:'')]),
    {wrap:'box'})+(snapshot.missing.length?'<p class="subtle">Unavailable source files '+esc(snapshot.missing.join(', '))+'.</p>':''));
}
function diagnostics(snapshot){
  const rows=Object.entries(snapshot.reliability).map(([key,c])=>{
    const [sport,market,book]=key.split('|');
    return [esc(sportName(sport)+' · '+market+' · '+book),c.n,c.games,c.matched,pp(c.residual),
      c.interval?pp(c.interval[0])+' to '+pp(c.interval[1]):'—',
      c.brier==null?'—':round(c.brier,3)+' / '+round(c.marketBrier,3)];
  });
  return box('Statistical evidence and uncertainty',
    '<p>Calibration uses previously settled pregame Under forecasts, one representative line per player, game, market and provider. Games receive equal weight. The interval resamples games, and markets still share players, dates and teams.</p>'+
    '<p>A baseline recommendation needs positive value after a conservative calibration adjustment, at least 30 independent games with paired prices across four weeks, and Brier score at least as good as the paired market. Quotes and fees can change.</p>'+
    table(['Cohort','Offers','Games','Paired games','Observed minus forecast','95% game-bootstrap interval','Matched Brier · GOING / market'],rows,{wrap:'box'})+
    '<p class="subtle">Placebo check on November 12 found zero directly quoted, settled Under forecasts that met the screen. A half-point outcome-only check yielded 85 NHL observations in two games. That sample is too small to estimate a release effect or validate returns.</p>');
}
function research(){
  return box('Event exposure research',
    '<p>Rockstar confirmed a November 19 console launch. PlayStation reported a rolling midnight release by country. Miami held an official promotion on November 18. It documents arena programming, with individual athlete play and sleep unmeasured.</p>'+
    '<p>Devin Booker said he preordered. Anaheim’s Leo Carlsson said he intended to wait until returning from a road trip. Those are stated intentions. This review found no verified pregame session or measured sleep disruption on the slate.</p>'+
    '<p>Sleep loss is a plausible mechanism. Small gaming experiments studied different populations and exposures. Travel, short rest, injuries, late lineup changes, pace and ordinary variance all offer competing explanations. Reduced defensive effort could increase an opponent’s scoring. Golden State and Memphis also played the previous night, and Indianapolis and Houston were on an ordinary Thursday short week. The dashboard assigns no player-specific exposure score.</p>')+
    box('Research sources','<ul>'+sources.map(([name,date,url])=>`<li><a href="${url}" target="_blank" rel="noopener">${esc(name)}</a> · ${date}</li>`).join('')+'</ul>');
}
export function gtaPage({snapshot,status}){
  const heading='<h1>🎮 GTA 6 Special</h1>';
  if(!gtaVisible(Date.now(),status))return heading+box('',empty('The November 19 research window has closed.'));
  if(!snapshot?.rows?.length)return heading+box('',empty('The frozen research snapshot is unavailable.'));
  const {gtaSport:sport,gtaMarket:market,gtaClass:level,gtaScope:scope}=S.f;
  const step=Number(S.f.gtaMove)||3;
  const bySport=snapshot.rows.filter(r=>!sport||r.sport===sport);
  const marketOptions=[...new Set(bySport.map(r=>r.market))].sort();
  const rows=rank(bySport.filter(r=>(!market||r.market===market)&&(!level||r.classification===level)&&r.kind===scope),snapshot);
  const recommendation=snapshot.rows.filter(r=>r.classification==='supported'&&Date.parse(r.start)>Date.now()&&!pricesStale(r));
  const limit=S.f.gtaLimit||30;
  const filters=tools(select('Sport','gtaSport',[['','All sports'],...Object.entries(sections).map(([k,v])=>[k,v.league])])+
    select('Market','gtaMarket',[['','All markets'],...marketOptions])+select('Scope','gtaScope',scopes)+
    select('Evidence','gtaClass',classOptions)+select('Scenario size','gtaMove',moves),'tracker-controls');
  return heading+`<p class="subtle">November 19, 2026 · frozen ${esc(time(snapshot.frozenAt))}. Forecasts and quotes stay fixed at capture.
    ${snapshot.lastSupplementAt?' Game-total supplement frozen '+esc(time(snapshot.lastSupplementAt))+'.':''}</p>`+
    grid(3,[metric('Priced unders',countFmt.format(snapshot.rows.length)),metric('Markets with probabilities',countFmt.format(snapshot.rows.filter(r=>r.prob!=null).length)),metric('Documented pregame sessions','0 found')])+
    box('Best Under Discoveries',recommendation.length?rankings(rank(recommendation,snapshot).slice(0,12),snapshot,step):empty('No data-supported Under recommendations at the available prices.'))+
    box(scope+' Under Rankings',filters+
      '<p class="subtle">Lowest output, unchanged baseline and higher output are hypothetical stress tests. The table shows baseline odds and EV, plus the lower and higher cases. Scenario size is a percentage change to the NHL count projection and a percentage-point change to the modeled chance elsewhere.</p>'+
      '<p class="subtle">An event-sensitive row crosses break-even under the standard size-3 stress test with at least a 2.5-point probability change. No GTA adjustment is used in the baseline. Liquidity was unavailable for the captured quotes.</p>'+
      (scope==='Team'&&!snapshot.rows.some(r=>r.kind==='Team')?empty('No timestamped standalone team Under prices were available in the scanned feeds.'):rankings(rows.slice(0,limit),snapshot,step))+(rows.length>limit?tools(btn('Show more markets','gtaMore','','outline')+
        `<span class="subtle">${limit.toLocaleString()} of ${rows.length.toLocaleString()}</span>`):''))+
    coverage(snapshot)+diagnostics(snapshot)+research();
}
