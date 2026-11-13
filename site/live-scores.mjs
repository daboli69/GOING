// Live scores while a page is open. The published slates are snapshots from the last hourly run, so without this a game's
// score and status freeze at whatever that run saw. Polls ESPN's public scoreboard only for games that are under way or
// about to start, and only while the tab is visible, then updates the same game objects the pages already draw.
import {ESPN,sportPath,scoreboard} from './feeds.mjs';
import {collegeSports} from './college-core.mjs';
import {dateKey} from './ui.mjs';

const MIN=60000;
// NFL schedule rows carry an Eastern date and clock time instead of a timestamp; an hour off around DST is fine here.
export const startOf=g=>Date.parse(g.iso||g.start||'')||(g.date&&g.time?Date.parse(g.date+'T'+g.time+':00-05:00'):NaN);
export const isDone=g=>['FINAL','OFF','final','canceled'].includes(g.status)||(g.status==null&&g.sa!=null&&g.sh!=null);
// Games worth asking about: not finished, starting within 10 minutes, and started less than 8 hours ago.
export const dueGames=(games,now=Date.now())=>games.filter(g=>{const t=startOf(g);return !isDone(g)&&t<=now+10*MIN&&t>=now-8*60*MIN;});

const urlFor=(s,day)=>{
  const ymd=day.replaceAll('-','');
  return collegeSports[s]?`${ESPN}/${collegeSports[s].path}/scoreboard?groups=${collegeSports[s].group}&limit=300&dates=${ymd}`:`${ESPN}/${sportPath[s]}/scoreboard?dates=${ymd}`;
};
const getJson=url=>fetch(url,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);

// Pro slates (NBA, NHL, NFL): match on the ESPN event id when the row has one, otherwise on the two teams.
export function applyPro(games,rows){
  let changed=false;
  for(const g of games){
    const r=rows.find(x=>x.id===g.espn||x.id===g.id)||rows.find(x=>x.a===g.a&&x.h===g.h);
    if(!r||!['LIVE','FINAL'].includes(r.status)||r.sa==null||r.sh==null)continue;
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
    const status=t.completed&&/^STATUS_FINAL/.test(t.name)?'final':t.state==='in'?'live':null;if(!status)continue;
    const a=c?.competitors?.find(x=>x.homeAway==='away'),h=c?.competitors?.find(x=>x.homeAway==='home');
    const next={status,aScore:Number(a?.score),hScore:Number(h?.score),detail:t.shortDetail||t.description||g.detail};
    if(!Number.isFinite(next.aScore)||!Number.isFinite(next.hScore))continue;
    if(Object.entries(next).some(([k,v])=>g[k]!==v)){Object.assign(g,next);changed=true;}
  }
  return changed;
}

// Returns true when any game changed, so the caller can redraw.
export async function refreshScores(s,games){
  const due=dueGames(games);
  if(!due.length)return false;
  const days=[...new Set(due.map(g=>dateKey(new Date(startOf(g)))))];
  let changed=false;
  for(const day of days){
    const j=await getJson(urlFor(s,day));if(!j)continue;
    changed=(collegeSports[s]?applyCollege(due,j):applyPro(due,scoreboard(j,s)))||changed;
  }
  return changed;
}
