// GOING landing: one door per sport, each carrying today's real slate and model numbers.
import {sections,menus,href} from './config.mjs';
import {esc,get,dataURL,pct,dateLabel,today} from './ui.mjs';

let summary={};
export async function homeLoad(){
  const [live,models,yard]=await Promise.all([get(dataURL('live/manifest.json'),{}),get(dataURL('models/summary.json'),{}),get(dataURL('yard/summary.json'),{})]);
  summary={live,models,yard};
}
const ago=iso=>{
  if(!iso)return null;
  const m=Math.round((Date.now()-Date.parse(iso))/60000);
  return m<2?'just now':m<90?m+' min ago':m<36*60?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';
};
const fact=(k,v)=>v==null||v===''?'':`<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
const pickLine=p=>p?`${esc(p.team)} ${pct(p.p)} <span class="muted">vs ${esc(p.opp)}</span>`:null;
const record=r=>r?.games?`${pct(r.accuracy,1)} <span class="muted">of ${r.games} graded</span>`:null;
const quick={nba:['Ensemble Forecasts','Slate Standouts','All Props','Shot Charts'],nfl:['Ensemble Forecasts','Game Previews','TD Data','Best Plays'],nhl:['Game Previews','Line Matchups','Best Plays','Shots'],mlb:['HR Board','Top Plays','Game Scan','Model Record']};
const link=(s,t)=>{const r=Object.values(menus[s]).flat().find(x=>x[0]===t);return r?`<a class="pill" href="${href(r[1])}">${esc(t)}</a>`:'';};

function facts(s){
  const L=summary.live?.[s]||{},M=summary.models?.[s]||{};
  if(s==='nba')return fact(L.date===today?'Tonight':L.date?dateLabel(L.date,true):'Slate',L.games==null?null:plural(L.games,'game'))+fact('Strongest model pick',pickLine(M.top))+fact('Model record',record(M.record));
  if(s==='nfl')return fact(L.week?'Week '+L.week:'Week',L.games==null?null:plural(L.games,'game'))+fact('Strongest model pick',pickLine(M.top))+fact('Model record this season',record(M.record));
  if(s==='nhl')return fact(L.date===today?'Tonight':L.date?dateLabel(L.date,true):'Slate',L.games==null?null:plural(L.games,'game'))+fact('Projected lineups posted',L.lineups==null?null:L.lineups+' of '+(L.games*2)+' teams');
  if(s==='mlb'){
    const Y=summary.yard||{};
    return fact(Y.last_slate?'Last slate':Y.slate_date===today?'Today':'Slate',Y.games==null?null:plural(Y.games,'game')+(Y.last_slate&&Y.slate_date?` <span class="muted">${esc(dateLabel(Y.slate_date,true))}</span>`:''))+
      fact('Hottest bat',Y.top?`${esc(Y.top.name)} <span class="muted">${esc(Y.top.team)} · Heat ${esc(Y.top.heat)}</span>`:null)+
      fact('Heat top 10, season',Y.record?`${pct(Y.record.hr/Y.record.n,1)} <span class="muted">homered (${Y.record.hr} of ${Y.record.n})</span>`:null);
  }
  return '';
}
export function homePage(){
  const doors=Object.entries(sections).map(([s,x])=>{
    const name=`<span>GOING</span> <b>${esc(x.word)}</b>`;
    if(!x.home)return `<article class="door soon" data-door="${s}"><h2 class="door-name">${name}</h2><p class="door-sport">${esc(x.sport)} · ${esc(x.league)}</p><p class="door-soon">Coming soon. Baseball dashboards and models are not built yet.</p></article>`;
    return `<article class="door" data-door="${s}"><h2 class="door-name"><a href="${href(x.home)}">${name}</a></h2><p class="door-sport">${esc(x.sport)} · ${esc(x.league)}</p>`+
      `<dl class="door-facts">${facts(s)||'<div><dt>Today</dt><dd class="muted">No snapshot yet</dd></div>'}</dl><nav class="door-links" aria-label="${esc(x.name)} shortcuts">${quick[s].map(t=>link(s,t)).join('')}</nav></article>`;
  }).join('');
  const L=summary.live||{},M=summary.models||{};
  const fresh=[L.updated&&'Slates, injuries and prices '+ago(L.updated),L.archive_updated&&'season archives '+ago(L.archive_updated),
    M.nfl?.generated_at&&'NFL model '+ago(M.nfl.generated_at),M.nba?.generated_at&&'NBA model '+ago(M.nba.generated_at),summary.yard?.generated_at&&'MLB board '+ago(summary.yard.generated_at)].filter(Boolean);
  return `<section class="going-intro"><h1 class="going-title"><img class="going-wordmark" src="${href('brand/going-wordmark.svg')}" width="461" height="100" alt="GOING"></h1><p class="lede">Ensemble models and matchup dashboards for basketball, football, hockey and baseball.</p></section>`+
    `<div class="doors">${doors}</div><p class="tiny freshness">${fresh.length?'Updated: '+fresh.map(esc).join(' · '):'Update times appear after the first automatic refresh.'}</p>`;
}
