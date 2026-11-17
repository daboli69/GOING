// Research views over the public pick record.
import {current as S,esc,box,grid,metric,table,cell,info,empty,tools,btn,action,select,dateAdd,dateKey,round,pct,local,keep,toast} from './ui.mjs';
import {href,viewDefaults,sections} from './config.mjs';
import {heat,signed} from './math.mjs';
import {toolLabel,isModelTool,rate,roi,breakeven,brier,units} from './track-core.mjs';
import {isCollege,collegePickLabel} from './college-core.mjs';
import {trackerFeed} from './tracker-feed.mjs';
import {trackerDimensions,filterDimensions,trackerLabel,trackerRows,trackerScope,trackerStats,trackerGroups,uniqueTrackerPicks} from './tracker-explore.mjs';

const feed=trackerFeed('picks','index');
const savedView='tracker-view';
const periods=['All recorded','Last 7 days','Last 30 days','Custom'];
const orders=['Decisions','ROI','Hit rate'];
const samples=['0','5','10','25','50','100'];
const results=['Graded','All','Hit','Miss','Push','Void','Pending'];
const resultName={won:'Hit',lost:'Miss',push:'Push',void:'Void'};
let memberships=[],index={},notice='';

export async function trackerLoad(){
  const data=await feed();
  ({index,notice}=data);
  memberships=trackerRows(data.rows);
}
function settings(f){
  const defaults=viewDefaults.tracker;
  const saved={...defaults};
  for(const [key,value] of Object.entries(defaults)){
    if(typeof f?.[key]===typeof value)saved[key]=f[key];
  }
  if(!Object.hasOwn(trackerDimensions,saved.trackerGroup))saved.trackerGroup=defaults.trackerGroup;
  if(!Object.hasOwn(trackerDimensions,saved.trackerSplit))saved.trackerSplit='';
  return saved;
}
function dates(f){
  const today=dateKey();
  if(f.window==='Last 7 days')return {from:dateAdd(today,-6),to:today};
  if(f.window==='Last 30 days')return {from:dateAdd(today,-29),to:today};
  return f.window==='Custom'?{from:f.trackerFrom,to:f.trackerTo}:{};
}
export function trackerAction(act,v){
  if(act==='trackerMoreHistory'){
    S.f.trackerHistoryLimit=(S.f.trackerHistoryLimit||40)+40;
    return true;
  }
  if(act==='trackerDrill'){
    const pairs=JSON.parse(v), f=S.f;
    f.trackerPrevious=settings(f);
    for(const [key,value] of pairs){
      if(key==='week'&&/^\d{4}-\d\d-\d\d$/.test(value)){
        const {from,to}=dates(f), end=dateAdd(value,6);
        f.window='Custom';
        f.trackerFrom=from&&from>value?from:value;
        f.trackerTo=to&&to<end?to:end;
      }else if(filterDimensions.includes(key))f[key]=value;
    }
  }else if(act==='trackerBack'&&S.f.trackerPrevious){
    S.f=S.f.trackerPrevious;
  }else if(act==='trackerReset'){
    S.f=settings({});
  }else if(act==='trackerSave'){
    try{keep(savedView,settings(S.f));toast('Tracker view saved in this browser.');}
    catch{toast('Could not save the tracker view.');}
  }else if(act==='trackerRestore'){
    S.f=settings(local(savedView,{}));
  }else return false;
  S.f.trackerHistoryLimit=40;
  S.sort=null;
  return true;
}
const ago=iso=>{if(!iso)return 'not yet';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<2?'just now':m<90?m+' min ago':m<36*60?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';};
const record=s=>`${s.won}–${s.lost}${s.push?' · '+s.push+' pushes':''}${s.void?' · '+s.void+' void':''}`;
const unitsText=x=>x==null?'—':signed(x,1)+'u';
const captureTime=iso=>new Date(iso).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const brierCell=s=>brier(s)==null?'—':round(brier(s),3);
const hitCell=s=>{
  const hit=rate(s), even=breakeven(s);
  return hit==null?cell('—','none'):cell(pct(hit,1),even==null?'':heat(hit-even,0,.03));
};

function dimensionOptions(rows,key,selected){
  const values=new Set(rows.map(trackerDimensions[key].value));
  if(selected)values.add(selected);
  return [['','All'],...[...values].map(v=>[v,trackerLabel(key,v)]).sort((a,b)=>a[1].localeCompare(b[1]))];
}
const checkbox=(label,key,value)=>`<label class="field"><input type="checkbox" data-field="${key}" ${value?'checked':''}> ${label}</label>`;
const dateField=(label,key,value)=>`<label class="field">${label} <input type="date" data-field="${key}" aria-label="${label}" value="${esc(value)}"></label>`;

function filters(f,options){
  const advanced=filterDimensions.slice(3);
  const controls=tools([
    select('League','sport',[['','All leagues'],...Object.values(sections).map(({league})=>league)]),
    select('Pick category','kind',[['','All picks'],'Model picks','Prop picks','Game picks']),
    select('Market','market',dimensionOptions(options,'market',f.market)),
    select('Period','window',periods),
    `<button type="button" class="pill outline" aria-expanded="${f.trackerAdvanced}" ${action('flip','trackerAdvanced')}>${f.trackerAdvanced?'Fewer filters':'More filters'}</button>`
  ].join(''),'tracker-controls');
  const customDates=f.window==='Custom'?tools(dateField('From','trackerFrom',f.trackerFrom)+dateField('Through','trackerTo',f.trackerTo),'tracker-controls'):'';
  const extra=f.trackerAdvanced?tools(advanced.map(key=>select(trackerDimensions[key].label,key,dimensionOptions(options,key,f[key]))).join('')+
    checkbox('Only sides the tool leaned toward','lean',f.lean),'tracker-controls'):'';
  const active=advanced.filter(key=>f[key]).map(key=>btn(esc(trackerLabel(key,f[key]))+' ×','set',key+':','outline')).join('');
  return box('Filters',controls+customDates+extra+tools(active+
    (f.trackerPrevious?btn('Back to comparison','trackerBack',''):'')+
    btn('Reset','trackerReset','','outline')+btn('Save view','trackerSave','','outline')+
    (local(savedView,null)?btn('Restore saved view','trackerRestore','','outline'):'')+
    (f.lean&&!f.trackerAdvanced?'<span class="subtle">Tool leans only</span>':''),
    'tracker-controls'),'Combine filters to inspect the same slice in the summary, comparison, and pick history.');
}

function comparison(rows,f){
  const dims=[f.trackerGroup];
  if(f.trackerSplit&&f.trackerSplit!==f.trackerGroup)dims.push(f.trackerSplit);
  const dimensionOptions=Object.entries(trackerDimensions).map(([key,{label}])=>[key,label]);
  const controls=tools(select('Group by','trackerGroup',dimensionOptions)+
    select('Then by','trackerSplit',[['','None'],...dimensionOptions])+
    select('Rank by','trackerOrder',orders)+select('Minimum decisions','trackerMin',samples.map(n=>[n,n==='0'?'Any sample':n])), 'tracker-controls');
  const groups=trackerGroups(rows,dims,Number(f.trackerMin),f.trackerOrder);
  const maxRoi=Math.max(.01,...groups.map(({stats})=>Math.abs(roi(stats)??0)));
  const body=table([dims.map(key=>trackerDimensions[key].label).join(' / '),'Decisions','Priced','Record','Hit rate','Break-even','Units','ROI','Waiting'],
    groups.map(({values,stats:s})=>{
      const label=values.map((v,i)=>trackerLabel(dims[i],v)).join(' · ');
      const result=roi(s);
      const bar=result==null?'—':`<div class="tracker-roi" data-positive="${result>=0}" style="--roi-size:${Math.abs(result)/maxRoi*50}%">
        <span aria-hidden="true"></span><strong>${signed(result*100,1)}%</strong></div>`;
      return [cell(btn(esc(label),'trackerDrill',JSON.stringify(dims.map((key,i)=>[key,values[i]])),'outline tracker-drill')),
        s.won+s.lost,s.stake,esc(record(s)),hitCell(s),pct(breakeven(s),1),unitsText(s.stake?s.units:null),bar,s.pending];
    }),{sort:'tracker-comparison',limit:20,wrap:'box',empty:'No groups match these filters and sample size.'});
  return box('Compare results',controls+body,
    'Select a group to filter the tracker to it. ROI uses one unit per priced win or loss. A pick can appear in several tool rows and counts once within each row.');
}

function describe(p){
  if(p.sport==='ufc')return `${esc(p.player)} to win <span class="muted">vs ${esc(p.opponent)}</span>`;
  if(isCollege(p.sport)){
    const pick=esc(collegePickLabel(p))+(p.market==='Winner'?' to win':' '+(p.market==='Spread'?signed(p.line,1):esc(p.line)));
    return `${pick} <span class="muted">· ${esc(p.awayName)} vs ${esc(p.homeName)}</span>`;
  }
  if(p.kind==='model')return `${esc(p.side)} to win <span class="muted">vs ${esc(p.side===p.h?p.a:p.h)}</span>`;
  return `${esc(p.player)} <span class="muted">${esc(p.side)} ${esc(p.line)} ${esc(p.market)}</span>`;
}

function history(picks,rows,f){
  const toolsByPick=new Map();
  for(const {p,t} of rows){
    if(!toolsByPick.has(p.k))toolsByPick.set(p.k,new Set());
    toolsByPick.get(p.k).add(toolLabel(t));
  }
  const current=picks.filter(({p})=>f.trackerResult==='All'||(f.trackerResult==='Graded'?!!p.result:(resultName[p.result]??'Pending')===f.trackerResult))
    .sort((a,b)=>String(b.p.start||b.p.date).localeCompare(String(a.p.start||a.p.date)));
  const limit=f.trackerHistoryLimit||40;
  const body=table(['Date','League','Pick','Tools','Price','Chance','Result','Actual','Units','Captured','Model version'],current.slice(0,limit).map(({p,m})=>{
    const source=trackerDimensions.provider.value({p}),u=source==='Unpriced'?null:units(p.result,p.odds);
    return [esc(p.date),esc(p.sport.toUpperCase()),cell(describe(p)),esc([...toolsByPick.get(p.k)].join(' · ')),
      source==='Unpriced'?'—':esc(p.odds+' · '+source),pct(m.prob,1),cell(resultName[p.result]??'Pending',p.result==='won'?'good heat':p.result==='lost'?'bad heat':''),
      esc(p.value??'—'),u==null?'—':unitsText(u),p.at?esc(captureTime(p.at)):'—',esc(p.version??'—')];
  }),{wrap:'box',empty:'No picks match this result filter.'});
  const more=current.length>limit?tools(btn('Show '+Math.min(40,current.length-limit)+' more','trackerMoreHistory','','outline')+
    `<span class="subtle">${limit.toLocaleString()} of ${current.length.toLocaleString()}</span>`):'';
  return box('Pick history',tools(select('History result','trackerResult',results)+`<span class="subtle">${current.length.toLocaleString()} matching picks</span>`,'tracker-controls')+body+more);
}

function modelChecks(rows,picks){
  const models=trackerGroups(rows.filter(r=>isModelTool(r.t)),['tool'],0,'Decisions');
  const modelTable=table(['Model','Decisions','Record','Hit rate','Brier','Log loss'],models.map(({values:[t],stats:s})=>[
    esc(toolLabel(t)),s.won+s.lost,esc(record(s)),hitCell(s),brierCell(s),s.brierN?round(s.ll/s.brierN,3):'—'
  ]),{sort:'tracker-models',cls:'compact'});
  const bins=Array.from({length:10},()=>({p:0,y:0,n:0}));
  for(const {p,m} of picks){
    if(!Number.isFinite(m.prob)||m.prob<0||m.prob>1||!['won','lost'].includes(p.result))continue;
    const bin=bins[Math.min(9,Math.floor(m.prob*10))];
    bin.p+=m.prob;bin.y+=Number(p.result==='won');bin.n++;
  }
  const calibration=bins.some(b=>b.n)?box('Calibration',calChart(bins)+table(['Stated chance','Picks','Average stated','Happened'],
    bins.flatMap((b,i)=>b.n?[[`${i*10}–${i*10+10}%`,b.n,pct(b.p/b.n,1),cell(pct(b.y/b.n,1),heat(b.y/b.n-b.p/b.n,0,.05))]]:[]),
    {cls:'compact'}),'Reliable probability estimates sit near the diagonal.'):empty('Calibration appears once picks with recorded chances have results.');
  return `<details class="details tracker-models"><summary>Model comparison and calibration</summary>
    ${models.length?box('Models head to head',modelTable,'Lower Brier scores and log loss indicate better probability estimates.'):''}${calibration}</details>`;
}

export function trackerPage(){
  const f=S.f, range=dates(f);
  const head=`<h1>Pick Tracker ${info('The tracker records pregame picks and grades them from reported results. ROI uses the price at capture and a flat one-unit stake per priced win or loss.')}</h1>`+
    (index.updated?`<p class="subtle">Updated ${ago(index.updated)} · ${(index.picks??0).toLocaleString()} picks recorded</p>`:'')+
    (notice?`<p class="subtle" role="status">${esc(notice)}</p>`:'')+
    tools(`<a class="pill outline" href="${href('up/parlay-tracker.html')}">NBA parlay legs</a><a class="pill outline" href="${href('long/parlay-tracker.html')}">NFL parlay legs</a>`);
  if(!memberships.length)return head+(notice?'':box('',empty('No picks recorded yet.')));
  const options=trackerScope(memberships,{sport:f.sport,kind:f.kind},range);
  const scoped=trackerScope(options,f);
  const picks=uniqueTrackerPicks(scoped), all=trackerStats(picks), even=breakeven(all);
  const metrics=grid(5,[
    metric('Decided picks',all.won+all.lost,record(all)),
    metric('Hit rate',pct(rate(all),1),even==null?'':'Captured break-even '+pct(even,1)),
    metric('Net units',unitsText(all.stake?all.units:null),all.stake+' priced decisions'),
    metric('ROI',roi(all)==null?'—':signed(roi(all)*100,1)+'%',all.stake?'Flat 1-unit stake':'Awaiting priced results'),
    metric('Pending',all.pending,all.brierN?'Brier '+brierCell(all):'')
  ]);
  const controls=head+filters(f,options);
  if(range.from&&range.to&&range.from>range.to)return controls+box('',empty('The From date must be on or before the Through date.'));
  return controls+metrics+comparison(scoped,f)+history(picks,scoped,f)+modelChecks(scoped,picks);
}
function calChart(bins){
  const W=380,H=220,pad=30,X=v=>pad+v*(W-2*pad),Y=v=>H-pad-v*(H-2*pad);
  const grid=[0,.25,.5,.75,1].map(v=>`<line x1="${X(0)}" x2="${X(1)}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--edge)"/><text x="${X(0)-6}" y="${Y(v)+4}" text-anchor="end" fill="var(--sub)" font-size="10">${v*100}%</text><text x="${X(v)}" y="${H-pad+14}" text-anchor="middle" fill="var(--sub)" font-size="10">${v*100}%</text>`).join('');
  const max=Math.max(...bins.map(b=>b.n));
  const dots=bins.filter(b=>b.n).map(b=>`<circle cx="${X(b.p/b.n)}" cy="${Y(b.y/b.n)}" r="${3+7*Math.sqrt(b.n/max)}" fill="var(--accent)" fill-opacity=".8"><title>${b.n} picks: stated ${Math.round(b.p/b.n*100)}%, happened ${Math.round(b.y/b.n*100)}%</title></circle>`).join('');
  return `<svg role="img" aria-label="Calibration: stated chance on the horizontal axis, how often it happened on the vertical axis" class="chart-svg" viewBox="0 0 ${W} ${H}">${grid}<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" stroke="var(--sub)" stroke-dasharray="4 4"/>${dots}<text x="${W/2}" y="${H-4}" text-anchor="middle" fill="var(--sub)" font-size="10">Stated chance</text></svg>`;
}
