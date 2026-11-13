// The leg tracker page shared by GOING UP (nba-parlay-tracker.mjs) and GOING LONG (nfl-parlay-tracker.mjs): every
// screened leg at its last pregame quote, graded after the game, with results by decision, rule and breakdown.
import {href} from './config.mjs';
import {current as S,box,btn,dataURL,dateAdd,dateKey,dialog,empty,esc,get,grid,metric,select,table,tools} from './ui.mjs';
import {pct,round,signed} from './math.mjs';
import {add,blank,brier,breakeven,impliedProb,rate,roi} from './track-core.mjs';
import {legKey} from './parlay-core.mjs';
export {round,signed,pct,impliedProb};

const pageSize=100;
const outcomes={won:'Hit',lost:'Miss',push:'Push',void:'Void'};
const time=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-US',{
  timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'
}):'—';
export const result=leg=>outcomes[leg.result]||'Pending';
export const notes=items=>esc(items.filter(Boolean).join(' · ')||'—');
export const counts=split=>split?.n?split.hits+'/'+split.n+' ('+pct(split.rate)+')':'—';
export const bucket=(x,edges)=>{
  if(!Number.isFinite(x))return 'Unknown';
  return edges.find(([limit])=>x<limit)?.[1]||edges.at(-1)[1];
};
export {time};

/* opts:
   prefix          tracker file prefix ('parlay-legs' for GOING UP, 'nfl-parlay-legs' for GOING LONG)
   title, suggested  page title and the Suggested Parlays path it links to
   markets         stat names for the Stat filter
   prior           wins and losses added per leg for the adjusted chance
   breakdowns      {label: leg => group}
   recent          {key,label} recent-form record shown in the leg table
   legText(leg)    how a leg reads
   savedTickets()  the user's saved tickets from Suggested Parlays
   alternates      whether alternate lines are tracked
   coverage(index) note under the capture coverage table
   detail(leg)     HTML lines for the leg detail dialog
   forms           form records shown in the detail dialog: [[label,key]]
   empty           message before the first capture
*/
export function createTracker(opts){
let index={}, legs=[], missingMonths=0;
const adjusted=leg=>leg.form?.season?.n?(leg.form.season.hits+opts.prior)/(leg.form.season.n+2*opts.prior):null;
const legText=opts.legText||(l=>l.side+' '+l.line+' '+l.stat);

async function load(){
  const next=await get(dataURL('tracker/'+opts.prefix+'-index.json'),{});
  const files=await Promise.all((next.months||[]).map(m=>get(dataURL('tracker/'+opts.prefix+'-'+m+'.json'),null)));
  index=next;
  missingMonths=files.filter(file=>!Array.isArray(file)).length;
  legs=files.filter(Array.isArray).flat();
}

function groups(rows,keys){
  const map=new Map();
  for(const leg of rows)for(const key of keys(leg)){
    if(!map.has(key))map.set(key,blank());
    add(map.get(key),leg,adjusted(leg));
  }
  return map;
}
const summarize=rows=>rows.reduce((s,leg)=>add(s,leg,adjusted(leg)),blank());
const statCells=s=>[s.won+s.lost,s.won+'–'+s.lost,s.push,s.void,s.pending,pct(rate(s),1),pct(breakeven(s),1),
  s.stake?signed(s.units,1):'—',roi(s)==null?'—':signed(roi(s)*100,1)+'%',round(brier(s),3)];
const statCols=['Decided','Hit–miss','Push','Void','Pending','Hit rate','Break-even','Units','ROI','Brier'];
const tableGroups=(name,map,key)=>table([name,...statCols],[...map].map(([label,s])=>[esc(label),...statCells(s)]),
  {wrap:'box',sort:key,empty:'No legs in this view.'});
function breakdown(rows){
  const view=S.f.legBreakdown||'Stat & side';
  const keys=opts.breakdowns;
  return box('Breakdown',tools(select('Group by','legBreakdown',Object.keys(keys)))+
    tableGroups(view,groups(rows,leg=>[(keys[view]||keys['Stat & side'])(leg)]),'parlay-groups'));
}


function calibration(rows){
  const bins=Array.from({length:10},()=>({n:0,sum:0,wins:0}));
  for(const leg of rows){
    const p=adjusted(leg);
    if(p==null||!['won','lost'].includes(leg.result))continue;
    const bin=bins[Math.min(9,Math.floor(p*10))];
    bin.n++;bin.sum+=p;bin.wins+=Number(leg.result==='won');
  }
  return box('Chance vs. actual hit rate',table(['Adjusted chance range','Decided legs','Average estimate','Actual hit rate'],
    bins.flatMap((b,i)=>b.n?[[i*10+'–'+(i+1)*10+'%',b.n,pct(b.sum/b.n,1),pct(b.wins/b.n,1)]]:[]),
    {wrap:'box',empty:'Calibration appears after legs with a hit-rate estimate are decided.'}));
}

function byRule(rows,rules){
  const group=groups(rows,leg=>Object.entries(leg.checks||{}).map(([rule,reason])=>rule+'|'+(reason?'Failed':'Passed')));
  const missed=groups(rows,leg=>{
    const cuts=Object.entries(leg.checks||{}).filter(([,reason])=>reason);
    return cuts.length===1?[cuts[0][0]]:[];
  });
  const cells=s=>[s.won+s.lost,pct(rate(s),1),roi(s)==null?'—':signed(roi(s)*100,1)+'%'];
  return box('Filter results',table(['Rule','Passed N','Passed hit rate','Passed ROI','Failed N','Failed hit rate','Failed ROI',
    'Only this rule failed N','Only this rule failed hit rate','Only this rule failed ROI'],rules.map(rule=>[esc(rule),
    ...cells(group.get(rule+'|Passed')||blank()),...cells(group.get(rule+'|Failed')||blank()),...cells(missed.get(rule)||blank())]),
    {wrap:'box',sort:'parlay-rules',empty:'No screened legs yet.'}),
    'A leg can fail several rules. The final three columns isolate legs this one rule kept off the eligible list. Counts exclude pushes, voids, and pending results.');
}

function filtered(){
  const f=S.f, days={'Last 7 days':7,'Last 30 days':30};
  const from=days[f.legWindow]?dateAdd(dateKey(),1-days[f.legWindow]):'';
  const query=f.search?.trim().toLowerCase();
  return legs.filter(l=>l.date>=from&&(!query||[l.name,l.team,l.opp].some(x=>x?.toLowerCase().includes(query)))&&
    (f.legDecision==='All'||(f.legDecision==='Ever selected'?l.everSelected:l.decision===f.legDecision))&&
    (f.legMarket==='All'||l.stat===f.legMarket)&&(f.legSide==='All'||l.side===f.legSide)&&
    (f.legResult==='All'||result(l)===f.legResult)&&(f.legSource==='All'||l.alternate===(f.legSource==='Alternate lines'))&&
    (f.legRule==='All'||!!l.checks?.[f.legRule]));
}

function legTable(rows){
  const limit=S.f.legLimit||pageSize;
  const shown=[...rows].sort((a,b)=>b.tip.localeCompare(a.tip)||Number(!!a.alternate)-Number(!!b.alternate)||a.name.localeCompare(b.name)).slice(0,limit);
  return table(['Date','Player','Matchup','Leg','Quote','Decision','Season',opts.recent.label,'Adjusted','First cut','Result','Actual',''],shown.map(l=>[
    esc(l.date),esc(l.name),esc(l.team+' vs '+l.opp),esc(legText(l)),esc(l.odds),
    esc(l.alternate?'Alternate · '+l.decision:l.decision),pct(l.form?.season?.rate),pct(l.form?.[opts.recent.key]?.rate),pct(adjusted(l),1),
    esc(l.cut||'—'),esc(result(l)),esc(l.value??'—'),btn('Details','parlayTrackDetail',l.k,'outline')]),
    {wrap:'box',sort:'parlay-legs',empty:'No tracked legs match these filters.'})+
    (rows.length>limit?tools(btn('Show '+Math.min(pageSize,rows.length-limit)+' more','parlayTrackMore','')):'');
}

function savedResults(){
  const byKey=new Map(legs.map(leg=>[leg.k,leg]));
  const tickets=opts.savedTickets();
  if(!tickets.length)return '';
  const results=tickets.flatMap(ticket=>ticket.legs.map(leg=>{
    const tracked=byKey.get(legKey(leg));
    const manual=leg.result&&leg.result!=='Pending'?leg.result:null;
    return [esc(ticket.date),esc(leg.name),esc(legText(leg)),esc(leg.price),
      esc(manual||result(tracked||{})),esc(manual?'Manual':tracked?.resultSource||'Waiting for matching public result')];
  }));
  return box('Legs on your saved tickets',table(['Date','Player','Leg','Saved quote','Result','Source'],results,
    {wrap:'box',sort:'parlay-personal'}),'Manual results from Suggested Parlays take priority. Matching public results appear here automatically.');
}

function page(){
  const head=`<h1>${esc(opts.title)}</h1><p><a class="pill" href="${href(opts.suggested)}">Suggested Parlays</a></p>
    <p class="subtle">Latest capture ${esc(time(index.updated))} · ${legs.length} distinct priced legs</p>`;
  const coverage=box('Capture coverage',table(['Slate','Games','Quoted lines','Matched legs','Archive available'],
    Object.entries(index.coverage||{}).map(([date,c])=>[esc(date),c.games??'—',c.prices??'—',c.legs,c.archive?'Yes':'No']),
    {empty:'The first scheduled capture is pending.'}),opts.coverage(index));
  if(!legs.length)return head+coverage+box('',empty(opts.empty))+savedResults();
  const rules=[...new Set(legs.flatMap(l=>Object.keys(l.checks||{})))];
  const rows=filtered(), s=summarize(rows);
  const filters=tools(select('Period','legWindow',['Last 7 days','Last 30 days','All time'])+
    select('Decision','legDecision',['All','Selected','Ever selected','Eligible','Rejected'])+
    (opts.alternates?select('Lines','legSource',['All','Builder lines','Alternate lines']):'')+
    select('Stat','legMarket',['All',...opts.markets])+select('Side','legSide',['All','Over','Under'])+
    select('Result','legResult',['All','Pending',...Object.values(outcomes)])+
    select('Failed rule','legRule',['All',...rules])+
    `<input type="search" data-field="search" aria-label="Search player or team" placeholder="Search player or team" value="${esc(S.f.search||'')}">`);
  return head+coverage+(missingMonths?`<p class="subtle">${missingMonths} monthly files could not load.</p>`:'')+filters+
    grid(4,[metric('Decided legs',s.won+s.lost,s.won+' hits · '+s.lost+' misses'),
      metric('Hit rate',pct(rate(s),1),'Break-even '+pct(breakeven(s),1)),
      metric('Flat-stake ROI',roi(s)==null?'—':signed(roi(s)*100,1)+'%',s.stake?signed(s.units,1)+' hypothetical units':''),
      metric('Pending',s.pending,s.push+' pushes · '+s.void+' voids')])+
    box('Selection results',tableGroups('Decision',groups(rows,l=>[l.alternate?'Alternate · '+l.decision:l.decision]),'parlay-decisions'),
      'These are leg-level results at captured quotes before fees. Multiple lines on the same player are related observations. Use sample counts and future slates to check any apparent improvement.')+
    byRule(rows,rules)+breakdown(rows)+calibration(rows)+box('Leg history',legTable(rows))+savedResults();
}

function action(act,value){
  if(act==='parlayTrackMore'){S.f.legLimit=(S.f.legLimit||pageSize)+pageSize;return true;}
  if(act!=='parlayTrackDetail')return false;
  const l=legs.find(leg=>leg.k===value);
  if(!l)return true;
  dialog(l.name+' · '+legText(l),
    `<p>${notes([l.team+' vs '+l.opp,l.date,(opts.startLabel||'Tip')+' '+time(l.tip),l.decision,l.alternate?'Alternate line':opts.alternates?'Builder line':''])}</p>
    <p>${notes([l.provider+' '+l.odds,'Quote '+time(l.capturedAt),'First seen '+time(l.firstSeen),'Last seen '+time(l.observedAt),
      l.firstDecision?'First decision '+l.firstDecision:'',l.firstOdds!=null?'First odds '+l.firstOdds:'',l.everSelected?'Previously selected':''])}</p>
    <p>${notes([result(l),l.value==null?'':'Actual '+l.value,l.resultSource,l.graded?'Graded '+time(l.graded):''])}</p>`+opts.detail(l)+
    table(opts.forms.map(x=>x[0]),[opts.forms.map(([,k])=>counts(l.form?.[k]))],{wrap:'box'})+
    `<p>${notes([...l.reasons,...l.flags])}</p>`+
    table(['Rule','Screen result'],Object.entries(l.checks||{}).map(([name,reason])=>[esc(name),esc(reason||'Passed')]),{wrap:'box'}),true);
  return true;
}
return {load,page,action};
}
