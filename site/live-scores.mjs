// Live scores while a page is open. The published slates are snapshots from the last hourly run, so without this a game's
// score and status freeze at whatever that run saw. Polls ESPN's public scoreboard only for games that are under way or
// about to start, and only while the tab is visible, then updates the same game objects the pages already draw.
import {ESPN,sportPath,scoreboard} from './feeds.mjs';
import {collegeSports,collegeStatus,number} from './college-core.mjs';
import {dateKey} from './ui.mjs';
import {kickoff,nflTeamCode} from './nfl-availability.mjs';

const MIN=60000;
export const startOf=g=>Date.parse(g.iso||g.start||'')||Date.parse(kickoff(g.date,g.time));
export const isDone=g=>['FINAL','OFF','final','canceled','postponed'].includes(g.status)||(g.status==null&&g.sa!=null&&g.sh!=null);
// Games worth asking about: not finished, starting within 10 minutes, and started less than 8 hours ago.
export const dueGames=(games,now=Date.now())=>games.filter(g=>{const t=startOf(g);return !isDone(g)&&t<=now+10*MIN&&t>=now-8*60*MIN;});

const urlFor=(s,day)=>{
  const ymd=day.replaceAll('-','');
  return collegeSports[s]?`${ESPN}/${collegeSports[s].path}/scoreboard?groups=${collegeSports[s].group}&limit=300&dates=${ymd}`:`${ESPN}/${sportPath[s]}/scoreboard?dates=${ymd}`;
};
const getJson=url=>fetch(url,{cache:'no-store',signal:AbortSignal.timeout(6500)}).then(r=>r.ok?r.json():null).catch(()=>null);

// Pro slates (NBA, NHL, NFL): match on the ESPN event id when the row has one, otherwise on the two teams.
export function applyPro(games,rows){
  let changed=false;
  for(const g of games){
    const r=rows.find(x=>x.id===g.espn||x.id===g.id)||rows.find(x=>nflTeamCode(x.a)===nflTeamCode(g.a)&&nflTeamCode(x.h)===nflTeamCode(g.h));
    if(!r||!['LIVE','FINAL'].includes(r.status)||!Number.isFinite(r.sa)||!Number.isFinite(r.sh)||
      isDone(g)&&r.status!=='FINAL')continue;
    if(g.status!==r.status||g.sa!==r.sa||g.sh!==r.sh){Object.assign(g,{status:r.status,sa:r.sa,sh:r.sh});changed=true;}
  }
  return changed;
}
// College slates keep ESPN's own ids and status words (see scripts/college-feeds.mjs).
export function applyCollege(games,payload){
  let changed=false;
  for(const e of payload?.events||[]){
    const g=games.find(x=>x.id===String(e.id));if(!g)continue;
    const c=e.competitions?.[0],t=c?.status?.type??e.status?.type;if(!t)continue;
    const status=collegeStatus(t,c?.timeValid);
    if(!['final','live','postponed','canceled'].includes(status))continue;
    const a=c?.competitors?.find(x=>x.homeAway==='away'),h=c?.competitors?.find(x=>x.homeAway==='home');
    const scoring=status==='live'||status==='final';
    const next={status,aScore:scoring?number(a?.score):null,hScore:scoring?number(h?.score):null,detail:t.shortDetail||t.description||g.detail};
    if(scoring&&(next.aScore==null||next.hScore==null))continue;
    if(Object.entries(next).some(([k,v])=>g[k]!==v)){Object.assign(g,next);changed=true;}
  }
  return changed;
}

// Returns true when any game changed, so the caller can redraw.
export async function refreshScores(s,games,read=getJson){
  const due=dueGames(games);
  if(!due.length)return false;
  const days=[...new Set(due.map(g=>dateKey(new Date(startOf(g)))))];
  const changed=await Promise.all(days.map(async day=>{
    const j=await read(urlFor(s,day));if(!Array.isArray(j?.events))return false;
    const slate=due.filter(g=>dateKey(new Date(startOf(g)))===day);
    return collegeSports[s]?applyCollege(slate,j):applyPro(slate,scoreboard(j,s));
  }));
  return changed.some(Boolean);
}
