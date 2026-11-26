import {current as S,badge,box,btn,card,cell,dateLabel,empty,esc,grid,metric,select,table,tools,versus} from './ui.mjs';
import {pct,round} from './math.mjs';
import {nflTdSweepstakesGame} from './config.mjs';
import {tdSweepstakes} from './nfl-td-sweepstakes.mjs';

const rankOptions=[['either','Either'],['first','First'],['last','Last'],['both','Both']];
const time=stamp=>Number.isFinite(Date.parse(stamp))?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
  hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(stamp)):'time unavailable';
const probability=p=>pct(p,p<.01?2:1);
const playerName=r=>esc(r.name)+' <span class="subtle">'+esc(r.team+' · '+r.role)+'</span>'+(r.status?' '+badge(r.status,'y'):'');
const line=(n,type)=>n>0?n+' '+type:'';

function playerEvidence(r){
  return esc([line(r.counts?.in5,'carries inside the 5'),line(r.counts?.ez,'end-zone targets'),
    r.openShare>=.08?pct(r.openShare)+' of opening-drive opportunities':null,
    r.lateRole>=.06?pct(r.lateRole)+' projected share of team late TDs':null,
    r.matchup>=1.10||r.matchup<=.90?'×'+round(r.matchup,2)+' opponent adjustment':null,
    r.snaps!=null?pct(r.snaps)+' recent snaps':null,
    r.missing?.length?'Teammates out with shared usage: '+r.missing.join(', '):null].filter(Boolean).join(' · ')||'Tracked offensive role');
}

export function tdSweepstakesPage(data,now=Date.now()){
  const current=data.games.find(x=>x.g.id===nflTdSweepstakesGame);
  const saved=(S.tdLog?.live||[]).find(x=>x.game===nflTdSweepstakesGame);
  const g=current?.g??(saved?{...saved,iso:saved.tip}:null);
  const open=g&&Date.parse(g.iso)>now&&g.sa==null&&g.sh==null&&!['LIVE','FINAL'].includes(g.status);
  const head='<h1>FanDuel TD Sweepstakes</h1>'+
    (g?'<p>'+versus(g)+' · '+esc(dateLabel(g.date,true)+' · '+time(g.iso))+'</p>':'<p>KC at BUF · November 26, 2026</p>')+
    '<p class="subtle">FanDuel’s Thanksgiving offer has two shared $1 million Bonus Bet pools, one for the first touchdown and one for the last. The in-app token lists a straight pregame Anytime TD wager of at least $5 on KC at BUF. See your FanDuel token for eligibility.</p>';
  const live=open?tdSweepstakes(current,S.data.schedule||[],S.data.events||{},data.rates,now):null;
  const savedAt=saved?.sweepstakesAt??saved?.capturedAt;
  const model=live??(Date.parse(savedAt)<Date.parse(saved?.tip)?saved.sweepstakes:null);
  if(!model)return head+box('Scorer probabilities',empty(open?'Waiting for enough pregame data on both teams.':'The pregame board is closed. No saved forecast is available.')+
    (open?tools(btn('Check for updates','nflParlayCheck','','outline')):''));
  const sort=rankOptions.some(([key])=>key===S.f.sweepstakesRank)?S.f.sweepstakesRank:'either';
  const rows=[...model.players].sort((a,b)=>b[sort]-a[sort]||a.name.localeCompare(b.name));
  const leaders=grid(3,rankOptions.slice(0,3).map(([key,title])=>{
    const r=[...rows].sort((a,b)=>b[key]-a[key])[0];
    return metric(key==='either'?'First or last':title+' TD',probability(r[key]),esc(r.name+' · '+r.team));
  }));
  const score=result=>result?esc(result.name+' · '+result.team):'No touchdown';
  const results=saved?.graded&&'lastScorer' in saved?grid(2,[metric('Final first TD',score(saved.firstScorer),''),
    metric('Final last TD',score(saved.lastScorer),'')]):'';
  const tableHtml=table(['Player','First TD','Last TD','Either','Both'],rows.map(r=>
    [cell(playerName(r)+'<details><summary class="tiny">Why this player</summary><div class="subtle">'+playerEvidence(r)+'</div></details>','player-cell'),
      probability(r.first),probability(r.last),probability(r.either),probability(r.both)]),{wrap:'box',cls:'td-sweepstakes'});
  const context=grid(2,model.teams.map(t=>card(esc(t.team),'<p class="subtle">'+
    esc(round(t.implied,1)+(t.fromLines?' implied points':' points per game baseline')+' · '+
    (Math.abs(t.script)<.5?'Close projected script':'Projected margin '+(t.script>0?'+':'')+round(t.script,1))+
    ' · '+pct(t.rush)+' projected rushing share of late offensive TDs')+'</p>')));
  const controls=tools(select('Rank by','sweepstakesRank',rankOptions)+(open?btn('Check for updates','nflParlayCheck','','outline'):''));
  const timing=live?'Live pregame estimate'+(S.nflAvailability?.reportAt?' · Injury report checked '+time(S.nflAvailability.reportAt):''):
    'Pregame snapshot saved '+time(savedAt);
  return head+results+leaders+box('Scorer probabilities','<p class="subtle">'+esc(timing)+
    '. Questionable players are estimated if active. Either counts a player once if he scores both.</p>'+controls+tableHtml)+
    box('Projected game script',context+'<p class="subtle">'+esc((model.total!=null?'Game total '+model.total+' · ':'')+
    (model.weather?.wind!=null?model.weather.wind+' mph forecast wind · ':'')+model.games+' earlier games with play-by-play')+'.</p>'+
    '<p class="subtle">First TD uses opening possessions and drive scoring. Last TD gives more weight to fourth-quarter and overtime usage, with projected margin shifting the rush/pass mix. Both includes the possibility of a single-TD game.</p>'+
    '<p class="subtle">Chance assigned to unlisted players, defense or returns, or no TD is '+probability(model.other.first)+' for first and '+
    probability(model.other.last)+' for last. No TD alone is '+probability(model.other.noTd)+'. These are model estimates. The actual share of a pool depends on how many entrants picked the scorer.</p>');
}
