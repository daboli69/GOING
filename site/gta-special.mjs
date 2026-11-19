import {gtaClasses,gtaDate,gtaQuoteAge,gtaVisible,stress} from './gta-event.mjs';
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
  const [snapshot,status,latest]=await Promise.all([get(href('gta-special-snapshot.json'),null),get(dataURL('gta-special-status.json'),null),
    gtaVisible()?get(dataURL('live/nba-main-lines-'+gtaDate+'.json'),null):null]);
  return {snapshot,status,latest};
}
function rank(rows){
  return [...rows].sort((a,b)=>strengths[b.classification]-strengths[a.classification]||
    (b.prob??-Infinity)-(a.prob??-Infinity)||
    (b.history?.recent?.hits??-1)-(a.history?.recent?.hits??-1)||a.subject.localeCompare(b.subject));
}
function rowNote(row){
  if(row.unavailable)return 'Availability check failed';
  if(row.injuryFlag)return row.injuryFlag;
  if(row.prob==null)return row.projection==null?'No matched GOING probability':'Projection only';
  if(row.classification==='supported')return 'GOING estimate and recent results favor the Under';
  if(row.classification==='sensitive')return 'Hypothetical stress test crosses 50%';
  return 'Below the historical support threshold';
}
function record(sample){
  return sample?.n?sample.hits+'/'+sample.n+' · '+pct(sample.hits/sample.n,0):'—';
}
const mainKey=(matchup,player,market,book)=>JSON.stringify([matchup,player,market,book]);
function mainBoard(latest,now){
  const map=new Map();
  for(const q of Array.isArray(latest)?latest:[]){
    const captured=Date.parse(q.capturedAt);
    if(q.date!==gtaDate||q.provider!=='DraftKings'||!Number.isFinite(q.line)||!Number.isInteger(+q.under)||Math.abs(+q.under)<100||!(captured<=now&&now-captured<=gtaQuoteAge))continue;
    const id=mainKey(q.a+' @ '+q.h,q.player,q.market,q.provider);
    const old=map.get(id);
    if(!old||captured>old.captured)map.set(id,{captured,line:q.line});
    else if(captured===old.captured&&q.line!==old.line)old.line=null;
  }
  return map;
}
const currentQuote=(row,board)=>row.mainLine?board.get(mainKey(row.matchup,row.subject,row.market,row.provider)):null;
const moved=(row,board)=>Number.isFinite(currentQuote(row,board)?.line)&&currentQuote(row,board).line!==row.line;
const pricesStale=row=>Date.now()-Date.parse(row.quoteAt)>gtaQuoteAge;
function priceText(row,board){
  const state=Date.parse(row.start)<=Date.now()?'Game started':pricesStale(row)?'Price aged out':'Frozen price';
  const latest=currentQuote(row,board);
  const line=moved(row,board)?'<br>Main line moved to '+esc(latest.line):
    row.mainLine&&latest?.line===row.line?'<br>Main line confirmed '+esc(time(new Date(latest.captured).toISOString())):'';
  return `<strong>${esc(odds(row.odds))}</strong> <small>${esc(row.provider||'Unknown book')}<br>${esc(time(row.quoteAt))}<br>${state}${line}</small>`;
}
function scenario(row,step){
  const values=stress(row,step);
  if(!values.length)return '—';
  const display=v=>pct(v.prob,1)+(v.projected==null?'':' · '+round(v.projected,2)+' projected');
  return `<small>Lower ${display(values[0])}<br>Higher ${display(values[2])}</small>`;
}
function rankings(rows,step,board){
  return table(['Market','Price at capture','GOING Under chance','Season Under','Recent Under','Scenario sensitivity','Evidence'],
    rows.map(row=>[
      cell(`<strong>${esc(row.subject)}</strong><br><small>${esc(sportName(row.sport)+' · '+row.market+' Under '+row.line)}<br>${esc(row.matchup+' · '+time(row.start))}</small>`,'gta-subject'),
      cell(priceText(row,board),'gta-price'),
      cell(row.prob==null&&!Number.isFinite(row.projection)?'—':
        pct(row.prob,1)+(row.projection!=null?'<br><small>'+round(row.projection,2)+' projected</small>':'')+
        '<br><small>'+esc(models[row.model]||'')+(row.modelAt?'<br>'+esc(time(row.modelAt)):'')+'</small>'),
      cell(record(row.history?.season)),
      cell(record(row.history?.recent)),
      cell(scenario(row,step)),
      cell('<strong>'+gtaClasses[row.classification]+'</strong><br><small>'+esc(rowNote(row))+'</small>')
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
    '<p>Data-supported means the Under hit at least 65% of eight or more season decisions and at least 60% of five or more recent decisions, with a GOING estimate of 57% or higher. Questionable, doubtful and day-to-day players are held out. The samples overlap and describe past games. The estimates remain provisional.</p>'+
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
export function gtaPage({snapshot,status,latest}){
  const heading='<h1>🎮 GTA 6 Special</h1>';
  if(!gtaVisible(Date.now(),status))return heading+box('',empty('The November 19 research window has closed.'));
  if(!snapshot?.rows?.length)return heading+box('',empty('The frozen research snapshot is unavailable.'));
  const {gtaSport:sport,gtaMarket:market,gtaClass:level,gtaScope:scope}=S.f;
  const step=Number(S.f.gtaMove)||3;
  const bySport=snapshot.rows.filter(r=>!sport||r.sport===sport);
  const marketOptions=[...new Set(bySport.map(r=>r.market))].sort();
  const rows=rank(bySport.filter(r=>(!market||r.market===market)&&(!level||r.classification===level)&&r.kind===scope));
  const now=Date.now(),board=mainBoard(latest,now);
  const supported=snapshot.rows.filter(r=>r.classification==='supported'&&Date.parse(r.start)>now);
  const recommendation=supported.filter(r=>!board.size||currentQuote(r,board)?.line===r.line);
  const limit=S.f.gtaLimit||30;
  const filters=tools(select('Sport','gtaSport',[['','All sports'],...Object.entries(sections).map(([k,v])=>[k,v.league])])+
    select('Market','gtaMarket',[['','All markets'],...marketOptions])+select('Scope','gtaScope',scopes)+
    select('Evidence','gtaClass',classOptions)+select('Scenario size','gtaMove',moves),'tracker-controls');
  return heading+`<p class="subtle">November 19, 2026 · frozen ${esc(time(snapshot.frozenAt))}. Forecasts and quotes stay fixed at capture.
    ${snapshot.lastSupplementAt?' Game-total supplement frozen '+esc(time(snapshot.lastSupplementAt))+'.':''}</p>`+
    grid(3,[metric('Main lines scanned',countFmt.format(snapshot.rows.length)),metric('Markets with probabilities',countFmt.format(snapshot.rows.filter(r=>r.prob!=null).length)),metric('Data-supported Unders',countFmt.format(snapshot.rows.filter(r=>r.classification==='supported').length))])+
    box('Best Under Discoveries',
      '<p class="subtle">'+(board.size?supported.length-recommendation.length+' qualifying lines moved or are missing from the latest board. The full rankings retain their original numbers.':
        'The current main-line feed is unavailable. The numbers below are verified as of the pregame capture.')+'</p>'+
      (recommendation.length?rankings(rank(recommendation),step,board):empty('No upcoming main-line Unders met the historical support threshold.')))+
    box(scope+' Under Rankings',filters+
      '<p class="subtle">Player props use the DraftKings main lines captured before tipoff. NFL and NHL player props lack a verified sportsbook main line in this snapshot. The game table includes posted main totals.</p>'+
      '<p class="subtle">Rankings favor the highest estimated Under hit chance. The same main line is applied to the season and recent game results. The lower- and higher-output scenarios are hypothetical and use zero GTA adjustment for rankings.</p>'+
      (scope==='Team'&&!snapshot.rows.some(r=>r.kind==='Team')?empty('No timestamped standalone team Under prices were available in the scanned feeds.'):rankings(rows.slice(0,limit),step,board))+(rows.length>limit?tools(btn('Show more markets','gtaMore','','outline')+
        `<span class="subtle">${limit.toLocaleString()} of ${rows.length.toLocaleString()}</span>`):''))+
    coverage(snapshot)+diagnostics(snapshot)+research();
}
