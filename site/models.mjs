// Ensemble model views for GOING LONG (NFL lab feed) and GOING UP (NBA Game Center export).
// Both feeds are published from the local labs by publishers/publish_models.py; nothing here is computed from betting prices.
import {current as S,esc,box,grid,metric,logo,team,teamName,teamBanner,table,cell,info,empty,slate,hero,badge,dateKey,dateLabel,today,round,pct,tools} from './ui.mjs';
import {signed,heat} from './math.mjs';

const ago=iso=>{
  if(!iso)return 'unknown';
  const m=Math.round((Date.now()-Date.parse(iso))/60000);
  return m<2?'just now':m<90?m+' min ago':m<36*60?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';
};
const when=iso=>iso?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso))+' ET':'—';
const winPct=(p,t)=>`${logo(t)} ${esc(t)} ${pct(p)}`;
const favored=(p,home,away)=>p>=.5?[home,p]:[away,1-p];
const verdict=(pick,winner)=>winner==null?cell('—','none'):pick===winner?cell('Right','good heat'):cell('Wrong','bad heat');

export function modelLoad(s,feed){
  const selected=S.game?.id;
  S.model=feed;S.data={};S.injuries={};S.odds=[];
  if(s==='nfl'){
    const weeks=[...new Set(feed.games.map(g=>g.season*100+g.week))].sort((a,b)=>a-b);
    const next=feed.games.filter(g=>g.status!=='final').sort((a,b)=>a.kickoff_utc.localeCompare(b.kickoff_utc))[0];
    S.mweeks=weeks;S.mweek??=next?next.season*100+next.week:weeks.at(-1);
    if(!weeks.includes(S.mweek))S.mweek=weeks.at(-1);
    nflGames();
  }else{
    const dates=Object.keys(feed.days||{}).sort();
    S.mdates=dates;
    const pick=dates.includes(S.mday)?S.mday:dates.includes(today)?today:dates.find(d=>d>=today)||dates.at(-1);
    S.mday=pick;nbaGames();
  }
  S.game=S.games.find(g=>g.id===selected)||S.game;
}
export function modelStep(n){
  if(S.route.sport==='nfl'){const w=S.mweeks[S.mweeks.indexOf(S.mweek)+n];if(w==null)return false;S.mweek=w;nflGames();}
  else{const d=S.mdates[S.mdates.indexOf(S.mday)+n];if(d==null)return false;S.mday=d;nbaGames();}
  S.sort=null;return true;
}
export function modelAction(act,v){
  if(act==='game'){S.game=S.games.find(g=>g.id===v)||S.game;return true;}
  if(act==='field'){
    const [k,val]=[v.slice(0,v.indexOf(':')),v.slice(v.indexOf(':')+1)];
    if(k==='mday'&&S.mdates.includes(val)){S.mday=val;nbaGames();return true;}
    if(k==='mweek'&&S.mweeks.includes(+val)){S.mweek=+val;nflGames();return true;}
  }
  return false;
}
export const modelPage=()=>S.route.sport==='nfl'?nflPage():nbaPage();

/* ---------- GOING LONG ---------- */
function nflGames(){
  S.week=S.mweek%100;
  S.games=S.model.games.filter(g=>g.season*100+g.week===S.mweek).sort((a,b)=>a.kickoff_utc.localeCompare(b.kickoff_utc)).map(g=>({
    id:g.game_id,a:g.away_team,h:g.home_team,iso:g.kickoff_utc,date:dateKey(new Date(g.kickoff_utc)),
    status:g.status==='final'?'FINAL':g.status==='scheduled'?'FUT':'LIVE',sa:g.final_score?.away??null,sh:g.final_score?.home??null,raw:g}));
  S.game=S.games.find(g=>g.status!=='FINAL')||S.games[0]||null;
}
function nflPage(){
  const f=S.model,list=S.games;
  const head=`<h1>Ensemble Forecasts ${info('The champion is the lab’s frozen ensemble of six models (logistic regression, XGBoost, decision tree, random forest and two neural networks). They read the same inputs, so 6-0 agreement is not six independent confirmations.')}</h1>`+
    `<p class="subtle">Published ${ago(f.generated_at)} · champion ${esc(f.source?.champion_version||'')}</p>`;
  if(!list.length)return head+box('',empty('No forecasts are published for this week yet.'));
  const rows=list.map(x=>{
    const g=x.raw,fc=g.forecast||{},c=fc.champion||{},p=c.p_home;
    const [t,pf]=p==null?[null,null]:favored(p,x.h,x.a);
    const m=g.market?.at_forecast?.p_home_novig,edge=g.market?.champion_minus_market_at_forecast;
    const winner=g.final_score?(g.final_score.home>g.final_score.away?x.h:g.final_score.away>g.final_score.home?x.a:'TIE'):null;
    return {act:'game',v:x.id,cls:'clickable'+(S.game?.id===x.id?' selection':''),cells:[
      cell(`${team(x.a)} <span class="muted">@</span> ${team(x.h)}`),when(x.iso),
      t?cell(winPct(pf,t),heat(pf,.5,.12)):cell('—','none'),
      c.margin_home==null?'—':esc(c.margin_home>=0?x.h+' by '+round(c.margin_home,1):x.a+' by '+round(-c.margin_home,1)),
      esc(fc.disagreement?.vote||'—'),
      m==null?'—':esc((m>=.5?x.h:x.a)+' '+pct(m>=.5?m:1-m)),
      edge==null?'—':cell(signed(edge*100,1)+' pts',heat(Math.abs(edge),.05,.05)),
      g.final_score?esc(`${x.a} ${g.final_score.away}, ${x.h} ${g.final_score.home}`):'—',verdict(c.predicted_winner,winner)]};
  });
  const board=box('Week '+S.week+' board',table(['Game','Kickoff','Champion pick','Projected margin','Vote','Market (no-vig)','Model − market','Final','Pick'],rows,{wrap:'box'}),
    'Click a row for the full forecast. Market is the no-vig price at the forecast’s data refresh; a difference from the market is not a proven edge.');
  return head+slate()+board+(S.game?nflDetail(S.game)+nflRecord(f):'');
}
function nflDetail(x){
  const g=x.raw,fc=g.forecast||{},c=fc.champion||{},p=c.p_home;
  if(p==null)return hero(x)+box('',empty('This game has no saved forecast yet.'));
  const [t,pf]=favored(p,x.h,x.a),mk=g.market||{},m=mk.at_forecast?.p_home_novig;
  const metrics=grid(4,[
    metric('Champion pick',`${logo(t)} ${esc(t)} ${pct(pf)}`,esc(fc.stage_label||''),heat(pf,.5,.12).replace(' heat','')),
    metric('Projected margin',c.margin_home==null?'—':esc((c.margin_home>=0?x.h:x.a)+' by '+round(Math.abs(c.margin_home),1))),
    metric('Model vote',esc(fc.disagreement?.vote||'—'),fc.disagreement?'Spread '+pct(fc.disagreement.range):''),
    metric('Market (no-vig)',m==null?'—':esc((m>=.5?x.h:x.a)+' '+pct(m>=.5?m:1-m)),mk.at_forecast?.spread_home!=null?esc(x.h+' '+signed(mk.at_forecast.spread_home,1)):'')]);
  const models=table(['Model',`${x.h} win`,`${x.a} win`,`${x.h} margin`],[
    {cls:'',cells:[cell('<strong>Champion (combined)</strong>'),cell(pct(p),heat(p,.5,.12)),cell(pct(1-p),heat(1-p,.5,.12)),signed(c.margin_home,1)]},
    ...(fc.models||[]).map(r=>[esc(r.label),cell(pct(r.p_home),heat(r.p_home,.5,.12)),cell(pct(1-r.p_home),heat(1-r.p_home,.5,.12)),signed(r.margin_home,1)])],{cls:'compact'});
  const stages=g.stages?.length?table(['Stage','Saved',`${x.h} win`],g.stages.map(s=>[esc(s.stage),when(s.archived_at),pct(s.p_home)]),{cls:'compact'}):empty('No earlier stages saved.');
  const challengers=g.challengers?.length?table(['Challenger',`${x.h} win`],g.challengers.map(r=>[esc(r.label),cell(pct(r.p_home),heat(r.p_home,.5,.12))]),{cls:'compact'}):empty('No challenger forecasts for this game.');
  const side=(k,abbr)=>{
    const q=g.player_intel?.qb?.[k]||{},l=g.player_intel?.lineups?.[k]||{};
    const flags=[q.starter_listed_out&&badge('Starter listed out','r'),q.starter_questionable&&badge('Starter questionable')].filter(Boolean).join(' ');
    return `<div>${teamBanner(abbr,q.champion_assumes?'QB '+q.champion_assumes:'')}${flags?`<div class="chips">${flags}</div>`:''}`+
      `<p class="subtle">${l.available?`Starters expected out: <strong>${round(l.starters_expected_out,1)}</strong> · OL starters ${esc(l.ol_starters_expected??'—')} of ${esc(l.ol_regular_starters??'—')}`:'Lineup analysis unavailable.'}</p>`+
      (l.important_absences?.length?`<div class="chips">${l.important_absences.map(a=>`<span title="${esc(a.type||'')}">${badge([a.player,a.unit,a.status].filter(Boolean).join(' · '),/out/i.test(a.status||'')?'r':'')}</span>`).join('')}</div>`:'<span class="tiny">No important absences listed.</span>')+`</div>`;
  };
  const latest=mk.latest||{};
  const market=table(['Price','Source','When',`${x.h} win (no-vig)`,'Spread','Total'],[
    ['At forecast',esc(mk.at_forecast?.source||'—'),when(mk.at_forecast?.timestamp),pct(mk.at_forecast?.p_home_novig),signed(mk.at_forecast?.spread_home,1),'—'],
    ['Latest',esc(latest.source||'—'),when(latest.retrieved_at),pct(latest.p_home_novig_current),signed(latest.spread_home_current,1),esc(latest.total_current??'—')]],{cls:'compact'});
  return hero(x)+metrics+
    grid(2,[box('Six models',models,'Each model’s chance for each side. The champion row is the combined forecast the lab saves; heat marks how far each number leans from a coin flip.'),
      box('Forecast history',stages+'<h3 class="section-label">Challengers</h3>'+challengers,'Forecasts are frozen at fixed stages before kickoff. Challengers are tracked prospectively and are not promoted until they meet a pre-registered standard.')])+
    box('Availability',grid(2,[side('away',x.a),side('home',x.h)])+`<p class="tiny">${esc(g.player_intel?.lineup_note||'')}</p>`)+
    box('Market benchmark',(mk.warning?`<div class="callout">${esc(mk.warning)}</div>`:'')+market);
}
function nflRecord(f){
  const h=f.performance?.historical,pr=f.performance?.prospective;
  const hist=h?.windows?.length?table(['Window','Games','Accuracy','Log loss','Brier','Margin error'],h.windows.map(w=>[esc(w.window),w.games,cell(pct(w.accuracy,1),heat(w.accuracy,.6,.03)),round(w.log_loss,3),round(w.brier,3),round(w.margin_mae,1)]),{cls:'compact'}):'';
  const pros=pr?.by_version?.length?table(['Version','Games','Accuracy','Log loss','Brier','Margin error'],pr.by_version.map(v=>[esc(v.label||v.version),v.games,cell(pct(v.accuracy,1),heat(v.accuracy,.6,.03)),round(v.log_loss,3),round(v.brier,3),round(v.margin_mae,1)]),{cls:'compact'}):empty(pr?.note||'No graded games yet.');
  const notes=Object.values(f.notices||{}).map(n=>`<li>${esc(n)}</li>`).join('');
  return box('Model record',`<h3 class="section-label">This season, graded as games finish (${esc(pr?.games??0)} of ${esc(pr?.required_games??'—')} games needed)</h3>`+pros+
    (hist?`<h3 class="section-label">Walk-forward history</h3>${hist}<p class="tiny">${esc(h.note||'')}</p>`:'')+(notes?`<ul class="subtle notes-list">${notes}</ul>`:''));
}

/* ---------- GOING UP ---------- */
function nbaGames(){
  S.day=S.mday;
  const list=S.model.days?.[S.mday]||[];
  // Team names and colours for hero/banners come from the feed itself.
  S.data={teams:Object.fromEntries(Object.values(S.model.games||{}).flatMap(d=>[[d.away,[d.away_name,null,(d.away_color||'').slice(1)]],[d.home,[d.home_name,null,(d.home_color||'').slice(1)]]]))};
  S.games=list.map(g=>({id:String(g.gid),a:g.away,h:g.home,iso:g.tipoff_utc,date:S.mday,
    status:g.completed?'FINAL':g.started&&g.home_score!=null?'LIVE':'FUT',sa:g.away_score,sh:g.home_score,raw:g}));
  S.game=S.games.find(g=>g.status!=='FINAL')||S.games[0]||null;
}
function nbaPage(){
  const f=S.model,m=f.meta||{},tr=m.track_record||{};
  const head=`<h1>Ensemble Forecasts ${info('Six statistical models trained on past games. The headline win chance is their frozen combination. The models use no betting prices and current injuries do not change the original forecast.')}</h1>`+
    `<p class="subtle">Published ${ago(f.generated_at)} · ${esc(m.evaluation_status||'')}</p>`;
  const record=grid(3,[metric('Graded games',esc(tr.games??'—')),metric('Picked the winner',tr.accuracy==null?'—':pct(tr.accuracy,1),'',tr.accuracy==null?'':heat(tr.accuracy,.6,.03).replace(' heat','')),
    metric('Average margin miss',tr.margin_miss?.points==null?'—':round(tr.margin_miss.points,1)+' pts')]);
  const picker=S.mdates.length?tools(`<label class="field upper">Saved day <select data-field="mday" aria-label="Saved forecast day">${[...S.mdates].reverse().map(d=>`<option value="${d}" ${d===S.mday?'selected':''}>${esc(dateLabel(d,true))}</option>`).join('')}</select></label>`):'';
  if(!S.games.length)return head+record+picker+box('',empty('No saved forecasts for this day.'));
  const details=f.games||{};
  const rows=S.games.map(x=>{
    const d=details[x.id],p=x.raw.p_home,[t,pf]=p==null?[null,null]:favored(p,x.h,x.a);
    const winner=x.status==='FINAL'&&x.sa!=null?(x.sh>x.sa?x.h:x.a):null;
    const e=d?.expected;
    return {act:'game',v:x.id,cls:'clickable'+(S.game?.id===x.id?' selection':''),cells:[
      cell(`${team(x.a)} <span class="muted">@</span> ${team(x.h)}`),when(x.iso),
      t?cell(winPct(pf,t),heat(pf,.5,.12)):cell('No forecast','none'),
      d?.vote?esc(d.vote.tie?`${d.vote.home}-${d.vote.away} split`:d.vote.home>d.vote.away?`${d.vote.home}-${d.vote.away} ${x.h}`:`${d.vote.away}-${d.vote.home} ${x.a}`):'—',
      e?esc((e.margin>=0?x.h:x.a)+' by '+round(Math.abs(e.margin),1)):'—',e?round(e.total,1):'—',
      x.status==='FINAL'?esc(`${x.a} ${x.sa}, ${x.h} ${x.sh}`):'—',verdict(t,winner)]};
  });
  return head+record+picker+slate()+box(dateLabel(S.mday)+' board',table(['Game','Tip','Six-model pick','Vote','Score model spread','Total','Final','Pick'],rows,{wrap:'box'}),
    'Click a row for the full forecast. Spread and total come from a separate score model, not a sportsbook.')+
    (S.game?nbaDetail(S.game,details[S.game.id]):'')+(m.reality_check?`<div class="callout">${esc(m.reality_check)}</div>`:'');
}
function nbaDetail(x,d){
  if(!d||!d.has_forecast)return hero(x)+box('',empty('This game has no saved forecast.'));
  const h=d.headline,e=d.expected||{};
  const metrics=grid(4,[
    metric('Six-model pick',`${logo(h.favored)} ${esc(h.favored)} ${pct(h.p_favored)}`,esc(h.p_label||''),heat(h.p_favored,.5,.12).replace(' heat','')),
    metric('Model vote',esc(`${x.h} ${d.vote?.home??'—'} · ${x.a} ${d.vote?.away??'—'}`),d.vote?.tie?'Tied vote':''),
    metric('Score model',e.margin==null?'—':esc((e.margin>=0?x.h:x.a)+' by '+round(Math.abs(e.margin),1)),e.margin_range?`8 in 10: ${x.h} ${signed(e.margin_range[0],0)} to ${signed(e.margin_range[1],0)}`:''),
    metric('Projected total',round(e.total,1),e.total_range?`8 in 10: ${round(e.total_range[0],0)} to ${round(e.total_range[1],0)}`:'')]);
  const models=table(['Model',`${x.h} win`,`${x.a} win`],[
    {cells:[cell('<strong>Combined (frozen)</strong>'),cell(pct(h.p_home),heat(h.p_home,.5,.12)),cell(pct(1-h.p_home),heat(1-h.p_home,.5,.12))]},
    ...(d.models||[]).map(r=>[esc(r.name),cell(pct(r.p_home),heat(r.p_home,.5,.12)),cell(pct(1-r.p_home),heat(1-r.p_home,.5,.12))])],{cls:'compact'});
  const research=d.sources?.length?table(['Research copy',`${x.h} win`],d.sources.map(r=>[esc(r.name),cell(pct(r.p_home),heat(r.p_home,.5,.12))]),{cls:'compact'}):empty('No research copies saved.');
  const form=t=>{const mu=d.matchup?.[t];return `<div>${teamBanner(t,mu?.record||d.records?.[t]||'')}`+
    (mu?`<p class="subtle">Scores ${round(mu.pf,1)} · allows ${round(mu.pa,1)} · last ${mu.last?.length||0}: ${(mu.last||[]).map(r=>badge(r,r==='W'?'g':'r')).join(' ')}</p>`:'')+
    ((d.injuries?.teams?.[t]||[]).length?`<div class="chips">${d.injuries.teams[t].map(i=>badge(i.player+' · '+i.status,i.tone==='red'?'r':'')).join('')}</div>`:'<span class="tiny">No injury entries saved.</span>')+'</div>';};
  return hero(x)+metrics+
    grid(2,[box('Six models',models,'Each model’s chance for each side. Several agreeing is expected because they see the same inputs.'),
      box('Score model range',marginChart(d,x)+research,'Bars show how often each final margin happens in the score model’s saved range. The shaded band holds 8 in 10 outcomes.')])+
    box('Teams and injuries',grid(2,[form(x.a),form(x.h)])+`<p class="tiny">Injury list retrieved ${ago(d.injuries?.retrieved)}. ${esc(d.forecast_warning||'')}</p>`);
}
function marginChart(d,x){
  const pts=d.distribution?.margin||[];
  if(!pts.length)return '';
  const W=380,H=150,pad=18,max=Math.max(...pts.map(p=>p.p)),lo=pts[0].x,hi=pts.at(-1).x,bw=(W-2*pad)/(hi-lo+1);
  const X=v=>pad+(v-lo)*bw,[a,b]=d.expected?.margin_range||[null,null];
  const band=a==null?'':`<rect x="${X(a)}" y="8" width="${X(b)-X(a)}" height="${H-34}" fill="var(--accent)" opacity=".12"/>`;
  const bars=pts.map(p=>`<rect x="${X(p.x)+.5}" y="${H-26-(p.p/max)*(H-40)}" width="${Math.max(1,bw-1)}" height="${(p.p/max)*(H-40)}" fill="${p.x>=0?'var(--accent)':'var(--muted)'}"/>`).join('');
  const axis=`<line x1="${X(0)+bw/2}" x2="${X(0)+bw/2}" y1="6" y2="${H-24}" stroke="var(--sub)" stroke-dasharray="3 3"/>`+
    [lo,0,hi].map(v=>`<text x="${X(v)+bw/2}" y="${H-8}" text-anchor="middle" fill="var(--sub)" font-size="11">${v===0?'Even':(v>0?x.h+' +':x.a+' +')+Math.abs(v)}</text>`).join('');
  return `<svg role="img" aria-label="Score model margin distribution: ${esc(x.h)} wins on bars right of even" class="chart-svg" viewBox="0 0 ${W} ${H}">${band}${bars}${axis}</svg>`;
}
