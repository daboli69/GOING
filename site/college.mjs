import {current as S,esc,get,dataURL,today,dateLabel,et,tools,select,search,table,box,empty,round,pct,badge} from './ui.mjs';
import {sections,href} from './config.mjs';
import {collegePicks,collegePickLabel,minCollegeGames} from './college-core.mjs';

export const collegeLoad=(s,id)=>get(dataURL('college/'+s+(id==='college-players'?'-players':'')+'.json'),null);
const fmt=(v,d=1)=>v==null?'—':round(v,d);
const percent=v=>v==null?'—':pct(v,1);
const signed=v=>v==null?'—':(v>0?'+':'')+v;
const team=t=>/^\d+$/.test(t.id)?`<span class="team-inline"><img class="team-mark" src="https://a.espncdn.com/i/teamlogos/ncaa/500/${t.id}.png" alt="" loading="lazy" decoding="async"> ${esc(t.name)}</span>`:esc(t.name);
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
    box('Player leaders',table(['Player','Team','Pos.','Games','Min','Pts','Reb','Ast','Stl','Blk','3PM','3PA','3P%'],rows,{sort:'college-players'}),
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
export function collegePage(){
  const {sport,id}=S.route,fbs=sport==='fbs',section=sections[sport],snapshot=S.data;
  const head=`<h1>${esc(S.route.title)} <span class="muted">· ${esc(section.league)}</span></h1>`;
  if(!snapshot)return head+box('',empty('College data has not been published yet.'));
  const q=(S.f.search||'').trim().toLowerCase();
  if(id==='college-players')return head+playerPage(snapshot,q);
  const dates=Object.keys(snapshot.coverage).sort(),day=S.f.collegeDay||(dates.includes(today)?today:dates.at(-1));
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
  const rows=games.map(g=>{
    const a=findTeam(snapshot.teams,g.away.id),h=findTeam(snapshot.teams,g.home.id),f=g.forecast;
    return [matchup(g),esc(status(g)),record(a)+' / '+record(h),winner(g),f?`${fmt(f.awayPts)}–${fmt(f.homePts)}`:'—',
      fmt(a?.recentMargin)+' / '+fmt(h?.recentMargin),g.neutral?badge('Neutral'):'—'];
  });
  return head+controls+meta+box(fbs?'Game previews':'Slate standouts',table(['Matchup','Status','Away / home record','Winner baseline','Projected score','Last 5 margin · away / home','Site'],rows,
    {sort:'college-slate',empty:checked?'No games match this slate and search.':'No schedule snapshot for this day.'}),
    `The season-only baseline uses Elo for winner estimates and blends scoring averages for projected scores. It needs at least ${minCollegeGames} completed games per team. The winner percentages are uncalibrated. The tracker records forecasts before the game and grades them against final scores.`)+
    (active?tools(select('Compare matchup','collegeGame',opts))+comparison(active,snapshot.teams,fbs,snapshot.formAt):'');
}
