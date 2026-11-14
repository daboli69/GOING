// Pick Tracker page: every pick the site offered before games started, graded against final results.
import {current as S,esc,box,grid,metric,table,cell,info,empty,tools,btn,select,badge,team,get,dataURL,dateAdd,today,round,pct} from './ui.mjs';
import {heat,signed} from './math.mjs';
import {toolLabel,isModelTool,blank,add,rate,roi,breakeven,brier,units,impliedProb} from './track-core.mjs';
import {isCollege,collegePickLabel} from './college-core.mjs';

let picks=[],index={};
export async function trackerLoad(){
  index=await get(dataURL('tracker/index.json'),{});
  const months=await Promise.all((index.months||[]).map(m=>get(dataURL(`tracker/picks-${m}.json`),[])));
  picks=months.flat();
}
export function trackerAction(act,v){
  if(act==='tool'){S.f.tool=S.f.tool===v?null:v;return true;}
  return false;
}
const ago=iso=>{if(!iso)return 'not yet';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<2?'just now':m<90?m+' min ago':m<36*60?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';};
const since={'Last 7 days':7,'Last 30 days':30};
// Each pick counts once per tool that offered it; with "leaned toward" on, only where that tool's own numbers favoured the side.
function memberships(){
  const f=S.f,from=since[f.window]?dateAdd(today,-since[f.window]):'';
  const out=[];
  for(const p of picks){
    if(f.sport!=='All'&&p.sport!==f.sport.toLowerCase()||p.date<from)continue;
    if(f.kind==='Model picks'&&p.kind!=='model'||f.kind==='Prop picks'&&p.kind!=='prop'||f.kind==='Game picks'&&p.kind!=='game')continue;
    if(f.market&&f.market!=='All markets'&&p.market!==f.market)continue;
    for(const [t,m] of Object.entries(p.tools)){
      if(f.lean&&m.lean!==true)continue;
      out.push({p,t,m});
    }
  }
  return out;
}
const record=s=>`${s.won}-${s.lost}${s.push?'-'+s.push:''}`;
const unitsText=x=>x==null?'—':signed(x,1)+'u';
const pickOdds=p=>esc(p.odds??'—')+((isCollege(p.sport)||p.sport==='ufc')&&p.odds!=null&&p.provider?` <span class="muted">${esc(p.provider)}</span>`:'');
const captureTime=iso=>new Date(iso).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const collegeCapture=({p,m})=>[
  p.at?esc(captureTime(p.at)):'—',
  esc(p.version??'—'),
  p.proj==null?'—':p.market==='Spread'?signed(p.proj,1):round(p.proj,1),
  m.edge==null?'—':round(m.edge,1)+' pts'
];
// Hit rate is judged against the break-even rate implied by the prices actually captured.
const hitCell=s=>{const r=rate(s),b=breakeven(s);return r==null?cell('—','none'):cell(pct(r,1),b==null?heat(r,.5,.04):heat(r-b,0,.03));};
const roiCell=s=>{const r=roi(s);return r==null?cell('—','none'):cell(signed(r*100,1)+'%',heat(r,0,.05));};
const brierCell=s=>{const b=brier(s);return b==null?'—':round(b,3);};

export function trackerPage(){
  const f=S.f;
  const college=isCollege(f.sport.toLowerCase()),ufc=f.sport==='UFC';
  const captureCols=college?['Captured','Version','Projection','Gap vs line']:ufc?['Captured','Version']:[];
  const capture=r=>college?collegeCapture(r):ufc?[r.p.at?esc(captureTime(r.p.at)):'—',esc(r.p.version??'—')]:[];
  const head=`<h1>Pick Tracker ${info('Each refresh captures model forecasts and priced picks before play starts. The tracker grades college picks from final scores and UFC winner forecasts from confirmed bout results. UFC draws push and no contests are voided. Missing college and UFC results stay pending. Units assume a 1-unit stake at the recorded price.')}</h1>`+
    `<p class="subtle">Updated ${ago(index.updated)} · ${index.picks??0} picks recorded · ${index.graded??0} graded · ${index.pending??0} waiting on results</p>`;
  if(!picks.length)return head+box('',empty('No picks recorded yet. The tracker records picks every hour before games start, so they will appear after the next update.'));
  const markets=['All markets',...new Set(picks.map(p=>p.market))].sort((a,b)=>a==='All markets'?-1:b==='All markets'?1:a.localeCompare(b));
  const filters=tools(['All','NBA','NFL','NHL','MLB','CBB','CWB','FBS','UFC'].map(s=>btn(s,'set','sport:'+s,f.sport===s?'on':'')).join('')+
    select('Picks','kind',['All picks','Model picks','Prop picks','Game picks'])+select('Market','market',markets)+select('Window','window',['Last 7 days','Last 30 days','Season'])+
    `<label class="field"><input type="checkbox" data-field="lean" ${f.lean?'checked':''}> Only sides the tool leaned toward</label>`);
  const rows=memberships(),scoped=f.tool?rows.filter(r=>r.t===f.tool):rows;

  // Headline: each pick once.
  const seen=new Map();for(const r of scoped)if(!seen.has(r.p.k)||seen.get(r.p.k).m.prob==null&&r.m.prob!=null)seen.set(r.p.k,r);
  const all=blank();for(const {p,m} of seen.values())add(all,p,m.prob);
  const be=breakeven(all);
  const metrics=grid(5,[metric('Graded picks',all.n,record(all)+(all.void?` · ${all.void} void`:'')),
    metric('Hit rate',rate(all)==null?'—':pct(rate(all),1),be==null?'':'Break-even at captured prices '+pct(be,1),rate(all)==null||be==null?'':heat(rate(all)-be,0,.03).replace(' heat','')),
    metric('Units',unitsText(all.priced?all.units:null),roi(all)==null?'':'ROI '+signed(roi(all)*100,1)+'%',roi(all)==null?'':heat(roi(all),0,.05).replace(' heat','')),
    metric('Brier score',brierCell(all),all.brierN?`${all.brierN} picks with a stated chance · lower is better`:'No stated chances in this view'),
    metric('Waiting on results',all.pending)]);

  // By tool, with rated tools split by rating.
  const groups=new Map();
  const bump=(key,label,p,m)=>{if(!groups.has(key))groups.set(key,{key,label,s:blank()});add(groups.get(key).s,p,m.prob);};
  for(const {p,t,m} of rows){bump(t,toolLabel(t),p,m);if(m.rating)bump(t+'|'+m.rating,toolLabel(t)+' · '+m.rating,p,m);}
  const list=[...groups.values()].sort((a,b)=>a.key.split('|')[0].localeCompare(b.key.split('|')[0])||(a.key.includes('|')-b.key.includes('|'))||b.s.n-a.s.n);
  const byTool=table(['Tool','Graded','Record','Hit rate','Break-even','Units','ROI','Brier','Waiting'],list.map(({key,label,s})=>({act:key.includes('|')?'':'tool',v:key,
    cls:(key.includes('|')?'dim ':'clickable ')+(f.tool===key?'selection':''),cells:[cell(esc(label)),s.n,record(s),hitCell(s),breakeven(s)==null?'—':pct(breakeven(s),1),unitsText(s.priced?s.units:null),roiCell(s),brierCell(s),s.pending]})),
    {sort:'tracker-tools',wrap:'box',empty:'No picks match these filters.'});

  // Head to head for the ensemble members.
  const models=list.filter(x=>isModelTool(x.key)&&!x.key.includes('|'));
  const h2h=models.length?box('Models head to head',table(['Model','Graded','Record','Picked the winner','Brier','Log loss'],models.map(({label,s})=>[esc(label),s.n,record(s),hitCell(s),brierCell(s),s.brierN?round(s.ll/s.brierN,3):'—']),{sort:'tracker-models',cls:'compact'}),
    'Each model’s own pick for every game. Brier and log loss reward honest probabilities: a confident wrong pick costs more than a cautious one. Lower is better for both.'):'';

  // Calibration: stated chance against how often it happened.
  const bins=Array.from({length:10},()=>({p:0,y:0,n:0}));
  for(const {p,m} of seen.values())if(m.prob!=null&&p.result&&!['push','void'].includes(p.result)){const b=bins[Math.min(9,Math.floor(m.prob*10))];b.p+=m.prob;b.y+=p.result==='won'?1:0;b.n++;}
  const cal=bins.some(b=>b.n)?box('Calibration',calChart(bins)+table(['Stated chance','Picks','Average stated','Happened'],bins.map((b,i)=>b.n?[`${i*10}–${i*10+10}%`,b.n,pct(b.p/b.n,1),cell(pct(b.y/b.n,1),heat(b.y/b.n-b.p/b.n,0,.05))]:null).filter(Boolean),{cls:'compact'}),
    'Picks grouped by the chance the tool gave them. On a well-calibrated tool, picks given 60% win about 60% of the time, so the dots sit on the diagonal.'):'';

  // By market.
  const mk=new Map();for(const {p,m} of seen.values()){if(!mk.has(p.market))mk.set(p.market,blank());add(mk.get(p.market),p,m.prob);}
  const byMarket=table(['Market','Graded','Record','Hit rate','Units','ROI'],[...mk].sort((a,b)=>b[1].n-a[1].n).map(([k,s])=>[esc(k),s.n,record(s),hitCell(s),unitsText(s.priced?s.units:null),roiCell(s)]),{sort:'tracker-markets',cls:'compact'});

  const describe=p=>{
    if(p.sport==='ufc')return `${esc(p.player)} to win <span class="muted">vs ${esc(p.opponent)}</span>`;
    if(isCollege(p.sport)){
      const pick=esc(collegePickLabel(p))+(p.market==='Winner'?' to win':' '+(p.market==='Spread'?signed(p.line,1):esc(p.line)));
      return `${pick} <span class="muted">· ${esc(p.awayName)} vs ${esc(p.homeName)}</span>`;
    }
    return p.kind==='model'?`${team(p.side)} to win <span class="muted">vs ${esc(p.side===p.h?p.a:p.h)}</span>`:`${esc(p.player)} <span class="muted">${esc(p.side)} ${esc(p.line)} ${esc(p.market)}</span>`;
  };
  const toolsOf=r=>[...new Set(scoped.filter(x=>x.p.k===r.p.k).map(x=>toolLabel(x.t).split(' · ').slice(1).join(' · ')))].join(', ');
  const done=[...seen.values()].filter(r=>r.p.result).sort((a,b)=>b.p.start.localeCompare(a.p.start)).slice(0,f.more?400:40);
  const recent=table(['Date','League','Pick','Tools','Odds','Chance','Result','Actual','Units',...captureCols],done.map(r=>{const p=r.p,u=p.odds==null?null:units(p.result,p.odds);return [esc(p.date),p.sport.toUpperCase(),cell(describe(p)),esc(toolsOf(r)),pickOdds(p),r.m.prob==null?'—':pct(r.m.prob),
    cell(esc(p.result),p.result==='won'?'good heat':p.result==='lost'?'bad heat':''),esc(p.value??'—'),u==null?'—':signed(u,2),...capture(r)];}),{sort:'tracker-recent',wrap:'box',empty:'Nothing graded in this view yet.'});
  const waiting=[...seen.values()].filter(r=>!r.p.result).sort((a,b)=>a.p.start.localeCompare(b.p.start));
  const pending=waiting.length?`<details class="details"><summary>Waiting on results (${waiting.length})</summary>`+table(['Starts','League','Pick','Tools','Odds','Chance',...captureCols],waiting.slice(0,200).map(r=>[esc(captureTime(r.p.start)),r.p.sport.toUpperCase(),cell(describe(r.p)),esc(toolsOf(r)),pickOdds(r.p),r.m.prob==null?'—':pct(r.m.prob),...capture(r)]),{cls:'compact'})+'</details>':'';

  return head+filters+(f.tool?tools(`<span class="subtle">Showing ${esc(toolLabel(f.tool))}</span>`+btn('Show every tool','tool',f.tool)):'')+metrics+
    box('By tool',byTool,'Click a tool to focus every number on this page on it. Rated tools also show each rating on its own row. Hit rate is coloured against the break-even rate of the prices captured, not against 50%.')+
    h2h+(cal||box('Calibration',empty('Calibration appears once tools that state a chance have graded picks.')))+box('By market',byMarket)+
    box('Recent results',recent+(done.length>=40?tools(btn(f.more?'Show fewer':'Show more','flip','more')):''))+pending;
}
function calChart(bins){
  const W=380,H=220,pad=30,X=v=>pad+v*(W-2*pad),Y=v=>H-pad-v*(H-2*pad);
  const grid=[0,.25,.5,.75,1].map(v=>`<line x1="${X(0)}" x2="${X(1)}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--edge)"/><text x="${X(0)-6}" y="${Y(v)+4}" text-anchor="end" fill="var(--sub)" font-size="10">${v*100}%</text><text x="${X(v)}" y="${H-pad+14}" text-anchor="middle" fill="var(--sub)" font-size="10">${v*100}%</text>`).join('');
  const max=Math.max(...bins.map(b=>b.n));
  const dots=bins.filter(b=>b.n).map(b=>`<circle cx="${X(b.p/b.n)}" cy="${Y(b.y/b.n)}" r="${3+7*Math.sqrt(b.n/max)}" fill="var(--accent)" fill-opacity=".8"><title>${b.n} picks: stated ${Math.round(b.p/b.n*100)}%, happened ${Math.round(b.y/b.n*100)}%</title></circle>`).join('');
  return `<svg role="img" aria-label="Calibration: stated chance on the horizontal axis, how often it happened on the vertical axis" class="chart-svg" viewBox="0 0 ${W} ${H}">${grid}<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" stroke="var(--sub)" stroke-dasharray="4 4"/>${dots}<text x="${W/2}" y="${H-4}" text-anchor="middle" fill="var(--sub)" font-size="10">Stated chance</text></svg>`;
}
