// GOING landing: one door per sport, each carrying today's real slate and model numbers.
import {gtaVisible} from './gta-event.mjs';
import {sections,menus,href} from './config.mjs';
import {esc,get,dataURL,pct,dateLabel,today,sportWordmark} from './ui.mjs';

let summary={},nextCheck=0,loading=null;
export async function homeLoad(){
  if(loading)return loading;
  const feeds={live:'live/manifest.json',models:'models/summary.json',yard:'yard/summary.json',
    college:'college/summary.json',ufc:'fights/summary.json'};
  if(gtaVisible())feeds.gta='gta-special-status.json';
  nextCheck=(Math.floor(Date.now()/60000)+5)*60000;
  loading=Promise.all(Object.entries(feeds).map(async ([key,path])=>[key,await get(dataURL(path),null)]))
    .then(rows=>{
      const changed=rows.filter(([key,value])=>value&&JSON.stringify(value)!==JSON.stringify(summary[key]));
      Object.assign(summary,Object.fromEntries(changed));
      return changed.length>0;
    }).finally(()=>{loading=null;});
  return loading;
}
const eastern={timeZone:'America/New_York'};
const clockTime=new Intl.DateTimeFormat('en-US',{...eastern,hour:'numeric',minute:'2-digit'});
const clockDate=new Intl.DateTimeFormat('en-US',{...eastern,month:'short',day:'numeric'});
const fullDate=new Intl.DateTimeFormat('en-US',{...eastern,year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const dayKey=new Intl.DateTimeFormat('en-CA',{...eastern,year:'numeric',month:'2-digit',day:'2-digit'});
const minutesFormat=new Intl.NumberFormat('en-US');
const elapsed=(ms,now)=>minutesFormat.format(Math.max(0,Math.floor((now-ms)/60000)))+' min ago';
const clockLabel=(ms,now)=>(dayKey.format(ms)===dayKey.format(now)?'':clockDate.format(ms)+' · ')+clockTime.format(ms)+' ET';
const clockIcon='<span class="update-clock-icon" aria-hidden="true"></span>';
export function snapshotNotice(live,now=Date.now()){
  const stamp=Date.parse(live?.updated);
  if(!Number.isFinite(stamp))return 'Live snapshot unavailable';
  const problems=new Set(Array.isArray(live.missing)?live.missing:[]);
  const parts=[];
  if(now-stamp>=30*60000)parts.push('Live snapshot delayed');
  if(problems.size)parts.push(problems.size===1?'1 feed reported a problem':problems.size+' feeds reported problems');
  return parts.join(' · ');
}

function clock(label,iso,now){
  const ms=Date.parse(iso);
  const value=Number.isFinite(ms)?
    `<time datetime="${new Date(ms).toISOString()}" title="${esc(fullDate.format(ms))}" data-update-clock>${esc(clockLabel(ms,now))}</time><span class="update-age">${elapsed(ms,now)}</span>`:
    '<span class="muted">Timestamp unavailable</span>';
  return `<div class="update-clock">${clockIcon}<div class="update-clock-body"><span class="update-label">${esc(label)}</span><span class="update-value">${value}</span></div></div>`;
}
export function tickHomeClocks(){
  const now=Date.now();
  for(const time of document.querySelectorAll('[data-update-clock]')){
    const ms=Date.parse(time.dateTime);
    time.textContent=clockLabel(ms,now);
    time.nextElementSibling.textContent=elapsed(ms,now);
  }
  const featured=document.querySelector('[data-gta-featured]');
  if(featured&&!gtaVisible(now,summary.gta))featured.hidden=true;
  const status=document.querySelector('[data-snapshot-status]');
  const message=snapshotNotice(summary.live,now);
  if(status&&status.textContent!==message){status.textContent=message;status.hidden=!message;}
  return navigator.onLine&&now>=nextCheck?homeLoad():false;
}

function updates(s){
  const slate=summary.live?.updated;
  if(s==='nba'||s==='nfl')return [['Live snapshot',slate],['Ensemble forecast',summary.models?.[s]?.generated_at]];
  if(s==='nhl')return [['Live snapshot',slate]];
  if(s==='mlb')return [['Board generated',summary.yard?.generated_at]];
  if(s==='ufc')return [['Card snapshot',summary.ufc?.updated]];
  return [['Schedule checked',summary.college?.[s]?.updated]];
}
const fact=(k,v)=>v==null||v===''?'':`<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
const pickLine=p=>p?`${esc(p.team)} ${pct(p.p)} <span class="muted">vs ${esc(p.opp)}</span>`:null;
const record=r=>r?.games?`${pct(r.accuracy,1)} <span class="muted">of ${r.games} graded</span>`:null;
const quick={nba:['Ensemble Forecasts','Slate Standouts','All Props','Shot Charts','Suggested Parlays'],nfl:['Ensemble Forecasts','Game Previews','TD Data','Best Plays'],nhl:['Game Previews','Line Matchups','Best Plays','Shots'],mlb:['HR Board','Top Plays','Game Scan','Model Record'],
  cbb:['Slate Standouts','Team Stats','Player Leaders'],cwb:['Slate Standouts','Team Stats','Player Leaders'],fbs:['Game Previews','Game Lines','Team Stats'],
  ufc:['Fight Cards','Ensemble Forecasts','Fighter Stats','Fight Lines']};
const link=(s,t)=>{const r=Object.values(menus[s]).flat().find(x=>x[0]===t);return r?`<a class="pill" href="${href(r[1])}">${esc(t)}</a>`:'';};

function facts(s){
  const L=summary.live?.[s]||{},M=summary.models?.[s]||{};
  if(s==='nba')return fact(L.date===today?'Tonight':L.date?dateLabel(L.date,true):'Slate',L.games==null?null:plural(L.games,'game'))+fact('Strongest model pick',pickLine(M.top))+fact('Model record',record(M.record));
  if(s==='nfl')return fact(L.week?'Week '+L.week:'Week',L.games==null?null:plural(L.games,'game'))+fact('Strongest model pick',pickLine(M.top))+fact('Model record this season',record(M.record));
  if(s==='nhl')return fact(L.date===today?'Tonight':L.date?dateLabel(L.date,true):'Slate',L.games==null?null:plural(L.games,'game'))+fact('Projected lineups posted',L.lineups==null?null:L.lineups+' of '+(L.games*2)+' teams');
  if(s==='ufc'){
    const U=summary.ufc||{};
    return U.event?fact(U.status==='live'?'Live card':U.status==='final'?'Latest result':'Next card',esc(U.event))+
      fact(dateLabel(U.date,true),plural(U.bouts,'bout')):'';
  }
  if(s==='mlb'){
    const Y=summary.yard||{};
    return fact(Y.last_slate?'Last slate':Y.slate_date===today?'Today':'Slate',Y.games==null?null:plural(Y.games,'game')+(Y.last_slate&&Y.slate_date?` <span class="muted">${esc(dateLabel(Y.slate_date,true))}</span>`:''))+
      fact('Hottest bat',Y.top?`${esc(Y.top.name)} <span class="muted">${esc(Y.top.team)} · Heat ${esc(Y.top.heat)}</span>`:null)+
      fact('Heat top 10, season',Y.record?`${pct(Y.record.hr/Y.record.n,1)} <span class="muted">homered (${Y.record.hr} of ${Y.record.n})</span>`:null);
  }
  const C=summary.college?.[s];
  return C?.available?fact(C.date===today?'Today':dateLabel(C.date,true),plural(C.games,'game')):'';
}
export function homePage(){
  const now=Date.now();
  const status=snapshotNotice(summary.live,now);
  const doors=Object.entries(sections).map(([s,x])=>{
    const name=sportWordmark(x);
    if(!x.home)return `<article class="door soon" data-door="${s}"><h2 class="door-name">${name}</h2><p class="door-sport">${esc(x.sport)} · ${esc(x.league)}</p><p class="door-soon">Coming soon. Baseball dashboards and models are not built yet.</p></article>`;
    return `<article class="door" data-door="${s}"><h2 class="door-name"><a href="${href(x.home)}">${name}</a></h2><p class="door-sport">${esc(x.sport)} · ${esc(x.league)}</p>`+
      `<dl class="door-facts">${facts(s)||'<div><dt>Today</dt><dd class="muted">No snapshot yet</dd></div>'}</dl><nav class="door-links" aria-label="${esc(x.name)} shortcuts">${quick[s].map(t=>link(s,t)).join('')}</nav>`+
      `<div class="door-updates">${updates(s).map(([label,iso])=>clock(label,iso,now)).join('')}</div></article>`;
  }).join('');
  const introClock=clock('Live snapshot',summary.live?.updated,now);
  return `<section class="going-intro"><div><h1 class="going-title"><img class="going-wordmark" src="${href('brand/going-wordmark.svg')}" width="461" height="100" alt="GOING"></h1><p class="lede">Ensemble models and matchup dashboards for basketball, football, hockey, baseball and UFC.</p></div><div class="going-update">${introClock}<p class="tiny" data-snapshot-status ${status?'':'hidden'}>${esc(status)}</p></div></section>`+
    (gtaVisible(now,summary.gta)?`<nav class="tools gta-featured" aria-label="Featured research" data-gta-featured><a class="pill primary" href="${href('gta6-special.html')}">🎮 GTA 6 SPECIAL</a></nav>`:'')+
    `<div class="doors">${doors}</div>`;
}
