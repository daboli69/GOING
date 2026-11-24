import {current as S,esc,get,dataURL,today,dateLabel,et,tools,select,search,table,box,empty,round,pct,badge,espnLogo,btn,card,grid} from './ui.mjs';
import {sections,href} from './config.mjs';
import {collegePicks,collegePickLabel,collegeMarketReads,collegeHomeElo,minCbbMarketGap,minCollegeGames} from './college-core.mjs';
import {americanNumber} from './track-core.mjs';

export const collegeLoad=(s,id)=>get(dataURL('college/'+s+(id==='college-players'?'-players':'')+'.json'),null);
const fmt=(v,d=1)=>v==null?'—':round(v,d);
const percent=v=>v==null?'—':pct(v,1);
const signed=v=>v==null?'—':(v>0?'+':'')+v;
const team=t=>/^\d+$/.test(t.id)?`<span class="team-inline"><img class="team-mark" src="${espnLogo('ncaa/500/'+t.id+'.png')}" alt="" loading="lazy" decoding="async" onerror="this.remove()"> ${esc(t.name)}</span>`:esc(t.name);
const matchup=g=>team(g.away)+` <span class="muted">${g.neutral?'vs':'at'}</span> `+team(g.home);
const stamp=t=>new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const record=t=>t?`${t.wins}–${t.losses}`:'—';
const findTeam=(teams,id)=>teams.find(t=>t.id===id);
const score=g=>g.aScore!=null&&g.hScore!=null?`${g.aScore}–${g.hScore}`:'';
function status(g){
  if(g.status==='scheduled')return et({iso:g.start})+' ET';
  if(g.status==='final')return 'Final '+score(g);
  if(g.status==='live')return 'Live '+score(g)+(g.detail?' · '+g.detail:'');
  return g.detail||'Time TBD';
}
function winner(g){
  const f=g.forecast;
  if(!f)return '—';
  if(f.pHome===0.5)return 'Even';
  const t=f.pHome>0.5?g.home:g.away;
  return esc(t.name)+' '+pct(Math.max(f.pHome,1-f.pHome));
}
function profileRows(a,h,fbs){
  const row=(label,key,format=fmt)=>[label,format(a?.[key]),format(h?.[key])];
  const base=[['Record',record(a),record(h)],row('Points per game','pf'),row('Points allowed per game','pa'),
    row('Last five · average margin','recentMargin')];
  if(fbs)return base;
  return base.concat([row('Estimated possessions per game','pace'),row('Points per 100 possessions','offRtg'),
    row('Allowed per 100 possessions','defRtg'),row('Three-point %','threes',percent),row('Share of attempts from three','threeRate',percent),
    row('Paint points per game','paint'),row('Rebounds per game','rebounds'),row('Turnovers per game','turnovers')]);
}
function comparison(g,teams,fbs,formAt){
  const rows=profileRows(findTeam(teams,g.away.id),findTeam(teams,g.home.id),fbs);
  if(fbs){
    const form=g.form||[];
    for(const [label,key,format=fmt] of [['Offensive EPA/play','offEpa',v=>fmt(v,3)],['EPA/play allowed','defEpa',v=>fmt(v,3)],
      ['Offensive success rate','offSuccess',percent],['Success rate allowed','defSuccess',percent],
      ['Pass EPA/play','pass',v=>fmt(v,3)],['Rush EPA/play','rush',v=>fmt(v,3)],['Offensive plays per game','pace']]){
      rows.push([label,...[0,1].map(i=>format(form[i]?.[key]))]);
    }
  }
  const note=fbs&&formAt?`<p class="tiny">FBS matchup metrics checked ${esc(stamp(formAt))}</p>`:'';
  return box('Matchup keys',table(['Season profile',team(g.away),team(g.home)],rows,{cls:'compact'})+note,
    'Team averages use completed games available in the feeds. FBS play-by-play figures use the latest available pregame SportsDataverse profile.');
}
const matchesSearch=(q,...terms)=>terms.some(t=>String(t??'').toLowerCase().includes(q));
function rankPage(snapshot,fbs,q){
  const teams=snapshot.teams.filter(t=>matchesSearch(q,t.name,t.code)).sort((a,b)=>b.elo-a.elo||a.name.localeCompare(b.name));
  const rows=teams.map(t=>[team(t),t.n,record(t),fmt(t.elo,0),fmt(t.pf),fmt(t.pa),fmt(t.recentMargin),
    ...(fbs?[]:[fmt(t.pace),fmt(t.offRtg),fmt(t.defRtg),percent(t.threes),percent(t.threeRate),fmt(t.paint)])]);
  return tools(search('Search teams'))+box('Team stats',table(['Team','Games','W–L','Elo','Pts/G','Allowed/G','Last 5 margin',
    ...(fbs?[]:['Est. pace','Off/100','Def/100','3P%','3PA share','Paint pts'])],rows,{sort:'college-teams'}),
    'Season-to-date for the games available in the public feeds. Early-season ratings and teams with only a few games can move quickly.');
}
function playerPage(snapshot,q){
  const min=Number(S.f.collegeSample);
  const teams=[...new Map(snapshot.players.map(p=>[p.team.id,p.team.name])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const teamFilter=S.f.collegeTeam||'';
  const rows=snapshot.players.filter(p=>p.n>=min&&(!teamFilter||teamFilter===p.team.id)&&matchesSearch(q,p.name,p.team.name,p.team.code))
    .sort((a,b)=>(b.points??-1)-(a.points??-1)||a.name.localeCompare(b.name))
    .map(p=>[esc(p.name),team(p.team),esc(p.position||'—'),p.n,fmt(p.minutes),fmt(p.points),fmt(p.rebounds),fmt(p.assists),
      fmt(p.steals),fmt(p.blocks),fmt(p.threes),fmt(p.threeAttempts),percent(p.threePct)]);
  return `<p class="subtle">Season ${snapshot.season} · Box scores checked ${esc(stamp(snapshot.checked))}</p>`+
    tools(search('Search players or teams')+select('Team','collegeTeam',[['','All teams'],...teams])+select('Minimum games','collegeSample',['1','3','5','10']))+
    box('Player leaders',table(['Player','Team','Pos.','Games','Min','Pts','Reb','Ast','Stl','Blk','3PM','3PA','3P%'],rows,{sort:'college-players',limit:100}),
      'Per-game averages from completed box scores. Three-point percentage uses total makes and attempts. Games with no minutes are excluded.');
}
function quote(side,market){
  const q=market?.spread?.[side];
  return q?signed(q.line)+(q.odds!=null?' ('+signed(q.odds)+')':''):'—';
}
function gameLines(games){
  const rows=games.filter(g=>g.status==='scheduled').map(g=>{
    const m=g.market,f=g.forecast;
    const leans=collegePicks('fbs',g).filter(p=>p.odds!=null).map(p=>
      [collegePickLabel(p),p.market==='Spread'?signed(p.line):p.line,p.market==='Winner'?'ML':'',`(${signed(p.odds)})`].filter(x=>x!=null&&x!=='').join(' '));
    return [matchup(g),signed(m?.moneyline?.away),signed(m?.moneyline?.home),quote('away',m),quote('home',m),
      m?.total?.line??'—',signed(m?.total?.over),signed(m?.total?.under),f?`${fmt(f.awayPts)}–${fmt(f.homePts)}`:'—',
      esc(leans.join(' · ')||'—'),m?`${esc(m.provider)} · ${esc(stamp(g.marketAt))}`:'—'];
  });
  return box('Game lines',table(['Matchup','Away ML','Home ML','Away spread','Home spread','Total','Over','Under','Projected score','Tracked sides','Source / checked'],
    rows,{sort:'college-lines',empty:'No scheduled games in this view.'}),
    'Pregame moneyline, spread and total when the ESPN feed supplies them. A dash indicates a missing quote or forecast. The tracker grades priced sides from pregame snapshots.');
}

const shortSample=5, clearChance=.60, closeChance=.55;
const forecastFilters=[['all','All games'],['clear','Clearer leans'],['close','Close calls'],['short','Short samples'],['none','No forecast']];
const forecastOrders=[['winner','Winner leans'],['spread','Spread gap'],['total','Total gap']];
const winnerOddsFloor=-200;
const winnerOddsFilters=[['any','Any odds'],[String(winnerOddsFloor),'−200 or better']];
function cbbForecast(g,a,h,now){
  const f=g.forecast, upcoming=g.status==='scheduled'&&Date.parse(g.start)>now;
  const aN=f?.aN??a?.n??0,hN=f?.hN??h?.n??0;
  if(!upcoming)return {kind:'none',reason:g.status==='scheduled'?'Pregame window closed.':
    ['live','final'].includes(g.status)?'See the tracker for recorded pregame picks.':'A confirmed future tip is required.'};
  if(Math.min(aN,hN)<minCollegeGames)return {kind:'none',
    reason:`Needs ${minCollegeGames} completed games per team. ${g.away.code}: ${aN} · ${g.home.code}: ${hN}.`};
  if(!Number.isFinite(f?.pHome)||f.pHome<=0||f.pHome>=1)return {kind:'none',reason:'A pregame forecast is unavailable for this matchup.'};
  const chance=Math.max(f.pHome,1-f.pHome);
  const kind=Math.min(aN,hN)<shortSample?'short':chance<closeChance?'close':chance>=clearChance?'clear':'lean';
  const side=f.pHome>.5?'home':'away';
  const pick=chance===.5?null:g[side];
  const moneyline=pick?americanNumber(g.market?.moneyline?.[side]):null;
  return {kind,chance,pick,moneyline,aN,hN};
}

function cbbMarketPanel(g,{spread,total}){
  const m=g.market,margin=g.forecast.marketMargin;
  const projection=Number.isFinite(margin)?margin===0?'Even margin':(margin>0?g.home.code:g.away.code)+' by '+fmt(Math.abs(margin)):'—';
  const line=m?.spread?.home?.line,bookSpread=line==null?null:g.home.code+' '+signed(line);
  const bookTotal=m?.total?.line>0?String(m.total.line):null;
  const projectedTotal=Number.isFinite(g.forecast.homePts)&&Number.isFinite(g.forecast.awayPts)?fmt(g.forecast.homePts+g.forecast.awayPts):'—';
  const label=(read,fallback)=>{
    if(!read)return fallback;
    if(!read.side)return 'Near the line';
    const side=read.side==='home'?g.home.name:read.side==='away'?g.away.name:read.side;
    return side+' '+(['home','away'].includes(read.side)?signed(read.line):read.line)+(read.odds==null?'':' ('+signed(read.odds)+')');
  };
  const market=(title,read,book,model,missing)=>{
    const details=[book?'Book '+book:'',model!=='—'?'Model '+model:'',read?.side?fmt(read.edge)+' pts from line':''].filter(Boolean);
    return `<div><span class="tiny">${title}</span><strong>${esc(label(read,missing))}</strong>
      ${details.length?`<p class="tiny">${esc(details.join(' · '))}</p>`:''}</div>`;
  };
  return `<div class="cbb-market-reads">${market('Spread',spread,bookSpread,projection,line==null?'No spread posted':'No projected margin')}${
    market('Game total',total,bookTotal,projectedTotal,bookTotal?'No projected total':'No total posted')}</div>`+
    (m?.provider&&Number.isFinite(Date.parse(g.marketAt))?`<p class="tiny">${esc(m.provider)} via ESPN · Checked ${esc(stamp(g.marketAt))}</p>`:'');
}

function cbbCard({g,a,h,f,markets}){
  const caption=`<p class="subtle cbb-matchup">${matchup(g)}</p><p class="tiny">${esc(status(g))}${g.neutral?' · Neutral site':''}</p>`;
  if(f.kind==='none')return card('No pregame forecast',caption+`<p class="subtle">${esc(f.reason)}</p>`,'cbb-forecast-card');
  const flag=f.kind==='clear'?badge('Clearer lean','g'):f.kind==='short'?badge('Short sample'):f.kind==='close'?badge('Close call'):'';
  const venue=g.neutral?'Neutral site\u00a0·\u00a00 home Elo':g.home.code+' home court\u00a0·\u00a0+'+collegeHomeElo+' Elo';
  const gap=Number.isFinite(a?.elo)&&Number.isFinite(h?.elo)?h.elo-a.elo+(g.neutral?0:collegeHomeElo):null, lean=f.pick;
  const reason=gap==null?'Winner estimate uses season Elo and the venue.':!lean?'The adjusted Elo ratings are even.':
    lean.name+' leads by '+fmt(Math.abs(gap),0)+' adjusted Elo points.';
  const evidence=table(['Team comparison',esc(g.away.code),esc(g.home.code)],[
    ['Completed games',f.aN,f.hN],['Season Elo',fmt(a?.elo,0),fmt(h?.elo,0)],['Season record',record(a),record(h)],
    ['Last five · average margin',signed(fmt(a?.recentMargin)),signed(fmt(h?.recentMargin))],
    ['Score projection for total',fmt(g.forecast.awayPts),fmt(g.forecast.homePts)]
  ],{cls:'cbb-forecast-evidence'});
  const body=`<div class="cbb-forecast-pick"><div><span class="tiny">${lean?'Projected winner':'Even matchup'}</span>
    ${lean?`<h3>${team(lean)}</h3>`:''}
    ${f.moneyline!=null?`<div class="tiny">Moneyline <strong>${signed(f.moneyline)}</strong></div>`:''}
    </div><div><strong>${percent(f.chance)}</strong><span class="tiny">Model win chance</span></div></div>`+
    caption+`<p class="cbb-forecast-samples">${esc(g.away.code)} <strong>${f.aN}</strong> games ·
      ${esc(g.home.code)} <strong>${f.hN}</strong> games ${flag}</p>`+cbbMarketPanel(g,markets)+`
    <details data-cbb-forecast="${esc(g.id)}"><summary>Forecast evidence</summary>
      <p class="subtle">${esc(reason)} ${esc(venue)}.</p>${evidence}
      <p class="tiny">Recent form provides context. The total uses the scoring baseline above. The spread uses a separate opponent-adjusted margin.</p>
    </details>`;
  return card('',body,'cbb-forecast-card');
}

function cbbBoard(games,teams,checked,updated){
  const now=Date.now(),byTeam=new Map(teams.map(t=>[t.id,t]));
  const rows=games.map(g=>{
    const a=byTeam.get(g.away.id),h=byTeam.get(g.home.id);
    const f=cbbForecast(g,a,h,now);
    return {g,a,h,f,markets:f.kind==='none'?{}:collegeMarketReads('cbb',g)};
  });
  const filter=S.f.cbbForecastFilter||'all',order=S.f.cbbForecastOrder||'winner';
  const limitOdds=S.f.cbbWinnerOdds===String(winnerOddsFloor);
  const gap=r=>r.markets[order]?.side?r.markets[order].edge:-1;
  const filtered=rows.filter(r=>filter==='all'||r.f.kind===filter)
    .filter(({f})=>!limitOdds||f.moneyline!=null&&f.moneyline>=winnerOddsFloor)
    .sort((a,b)=>(order==='winner'?0:gap(b)-gap(a))||Number(b.f.kind==='clear')-Number(a.f.kind==='clear')||
      (b.f.chance??0)-(a.f.chance??0)||a.g.start.localeCompare(b.g.start));
  const limit=S.f['rows:cbb-forecast']||12, shown=filtered.slice(0,limit);
  const forecasts=rows.filter(r=>r.f.chance!=null).length;
  return box('Model picks',tools(select('Winner filter','cbbForecastFilter',forecastFilters)+
    select('Winner odds','cbbWinnerOdds',winnerOddsFilters)+select('Sort by','cbbForecastOrder',forecastOrders))+
    `<p class="subtle">${forecasts} of ${rows.length} games have a pregame forecast${forecasts&&updated?' · Model snapshot '+esc(stamp(updated)):''}.</p>`+
    (limitOdds?`<p class="tiny">${filtered.length} ${filtered.length===1?'game matches':'games match'} the filters with a projected winner priced at −200 or better.</p>`:'')+
    `<p class="tiny">Clearer winner leans use at least ${pct(clearChance)} model win chance and ${shortSample} completed games per team. Spread and total leans compare projected points with the posted line. Differences under ${minCbbMarketGap} point are marked near the line.</p>`+
    (shown.length?grid(2,shown.map(cbbCard),'cbb-forecast-grid'):
      empty(checked?'No games match these filters.':'No schedule snapshot for this day.'))+
    (filtered.length>limit?tools(btn('Show '+Math.min(12,filtered.length-limit)+' more','moreRows','cbb-forecast:'+(limit+12))+
      `<span class="subtle">${limit} of ${filtered.length}</span>`):''),
    `The winner estimate uses season Elo and adds ${collegeHomeElo} Elo for home court. Win chances are uncalibrated. Spread projections adjust past margins for opponent strength and home court. Total projections blend scoring and points allowed. Each projection needs at least ${minCollegeGames} completed games per team. Short samples use fewer than ${shortSample} games for either team. Close winner calls are below ${pct(closeChance)}.`);
}

export function collegePage(){
  const {sport,id}=S.route,fbs=sport==='fbs',section=sections[sport],snapshot=S.data;
  const head=`<h1>${esc(S.route.title)} <span class="muted">· ${esc(section.league)}</span></h1>`;
  if(!snapshot)return head+box('',empty('College data has not been published yet.'));
  const q=(S.f.search||'').trim().toLowerCase();
  if(id==='college-players')return head+playerPage(snapshot,q);
  const dates=Object.keys(snapshot.coverage).sort(),day=S.f.collegeDay??=(dates.includes(today)?today:dates.at(-1));
  const checked=snapshot.coverage[day];
  const games=snapshot.games.filter(g=>g.date===day&&matchesSearch(q,g.away.name,g.home.name,g.away.code,g.home.code));
  const tracker=`<a class="pill" href="${href('tracker.html')}?sport=${sport.toUpperCase()}">View ${esc(section.league)} tracker</a>`;
  if(id==='college-teams')return head+`<p class="subtle">Season ${snapshot.season} · Snapshot ${esc(stamp(snapshot.updated))}${snapshot.archiveAt?' · Box scores checked '+esc(stamp(snapshot.archiveAt)):''}</p>`+rankPage(snapshot,fbs,q)+tools(tracker);
  const controls=tools(select('Slate','collegeDay',dates.map(d=>[d,dateLabel(d,true)]))+search('Search teams')+tracker);
  const freshness=checked?`Schedule checked ${stamp(checked)} · ${games.length} ${games.length===1?'game':'games'}`:'Schedule unavailable for this date.';
  const meta=`<p class="subtle">${esc(freshness)}</p>`;
  if(id==='college-lines')return head+controls+meta+gameLines(games);
  const active=games.find(g=>g.id===S.f.collegeGame)||games[0];
  const opts=games.map(g=>[g.id,`${g.away.name} ${g.neutral?'vs':'at'} ${g.home.name}`]);
  const keys=active?tools(select('Compare matchup','collegeGame',opts))+comparison(active,snapshot.teams,fbs,snapshot.formAt):'';
  if(sport==='cbb')return head+controls+meta+cbbBoard(games,snapshot.teams,checked,snapshot.updated)+keys;
  const rows=games.map(g=>{
    const a=findTeam(snapshot.teams,g.away.id),h=findTeam(snapshot.teams,g.home.id),f=g.forecast;
    return [matchup(g),esc(status(g)),record(a)+' / '+record(h),winner(g),f?`${fmt(f.awayPts)}–${fmt(f.homePts)}`:'—',
      fmt(a?.recentMargin)+' / '+fmt(h?.recentMargin),g.neutral?badge('Neutral'):'—'];
  });
  return head+controls+meta+box(fbs?'Game previews':'Slate standouts',table(['Matchup','Status','Away / home record','Winner baseline','Projected score','Last 5 margin · away / home','Site'],rows,
    {sort:'college-slate',empty:checked?'No games match this slate and search.':'No schedule snapshot for this day.'}),
    `The season-only baseline uses Elo for winner estimates and blends scoring averages for projected scores. It needs at least ${minCollegeGames} completed games per team. The winner percentages are uncalibrated. The tracker records forecasts before the game and grades them against final scores.`)+
    keys;
}
