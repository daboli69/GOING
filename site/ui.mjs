import { footers,nflTeams,nhlColors,mlbTeams,sections,BASE } from './config.mjs';
import {round,pct} from './math.mjs';
export const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $=q=>document.querySelector(q);
export const dateKey=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export const today=dateKey();
export const dateAdd=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const dateLabel=(d,short=false)=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:short?'short':'long',month:short?'short':'long',day:'numeric'}).format(new Date(d+'T12:00:00Z'));
export const gameDay=g=>g?.date|| (g?.iso?dateKey(new Date(g.iso)):today);
export const et=(g)=>g?.iso?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(g.iso)):g?.time?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',hour:'numeric',minute:'2-digit'}).format(new Date('2000-01-01T'+g.time+':00Z')):'TBD';
export const final=g=>g&&(['OFF','FINAL'].includes(g.status)||(!g.status&&g.sa!=null&&g.sh!=null));
export const liveGame=g=>['LIVE','CRIT'].includes(g?.status);
export const current={
  day:today,week:null,year:+today.slice(0,4)-(today.slice(5,7)<'09'),
  hoops:+today.slice(0,4)+(today.slice(5,7)>='10'),ice:+today.slice(0,4)-(today.slice(5,7)<'10'),
  data:{},games:[],odds:[],injuries:{},game:null,route:null,f:{},sort:null,loaded:false
};
export const gamesFor=t=>current.games.find(g=>g.a===t||g.h===t);
export const teamName=(t,s=current.route.sport)=>s==='nfl'?nflTeams[t]?.[0]||t:s==='mlb'?mlbTeams[t]?.[0]||t:current.data?.teams?.[t]?.[0]||t;
export const color=(t,s=current.route.sport)=>{
  const c=s==='nfl'?nflTeams[t]?.[1]:s==='nhl'?nhlColors[t]:s==='mlb'?mlbTeams[t]?.[2]:current.data?.teams?.[t]?.[2];
  return '#'+(/^[\da-f]{6}$/i.test(c||'')?c:'657795');
};
export function logoURL(t,s=current.route.sport){
  if(s==='nhl')return 'https://assets.nhle.com/logos/nhl/svg/'+t+'_dark.svg';
  if(s==='mlb')return 'https://www.mlbstatic.com/team-logos/team-cap-on-dark/'+(mlbTeams[t]?.[1]??0)+'.svg';
  const code=s==='nfl'?nflTeams[t]?.[2]||t:({WSH:'wsh',UTAH:'utah'}[t]||t);
  return 'https://a.espncdn.com/i/teamlogos/'+s+'/500/'+(code||'').toLowerCase()+'.png';
}
export const logo=(t,s=current.route.sport)=>t?`<img class="team-mark" src="${logoURL(t,s)}" alt="${esc(t)}" decoding="async">`:'';
export const team=(t,verbose=false)=>`<span class="team-inline">${logo(t)} ${esc(verbose?teamName(t):t)}</span>`;
export const teamBanner=(t,sub='')=>`<div class="team-banner" style="--team:${color(t)}">${logo(t)} ${esc(teamName(t))}<span class="right">${esc(sub)}</span></div>`;
export const action=(act,v)=>`data-act="${esc(act)}" data-v="${esc(v)}"`;
export const btn=(t,act,v,cls='')=>`<button type="button" class="pill ${cls}" ${action(act,v)}>${t}</button>`;
export const toggle=(t,k,v,cls='')=>btn(t,'set',k+':'+v,(current.f[k]===v?'on ':'')+cls);
export const toggles=(list,k,cl='')=>list.map(t=>toggle(esc(t),k,t,cl)).join('');
export const select=(label,k,opts,upper=false)=>`<label class="field ${upper?'upper':''}">${esc(label)} <select aria-label="${esc(label||k)}" data-field="${esc(k)}">${opts.map(o=>{const [v,t]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(current.f[k])===String(v)?'selected':''}>${esc(t)}</option>`;}).join('')}</select></label>`;
export const search=(label='Search players')=>`<input type="search" data-field="search" placeholder="${esc(label)}" aria-label="${esc(label)}" value="${esc(current.f.search||'')}">`;
export const tools=(inner,cls='')=>`<div class="tools ${cls}">${inner}</div>`;
export const info=(text)=>` <button type="button" class="info" aria-label="How to read this" ${action('info',text)}>i</button>`;
export const box=(name,body,help='',cls='')=>`<section class="panel ${cls}">${name?`<h2 class="heading">${name}${help?info(help):''}</h2>`:''}${body}</section>`;
export const plain=(name,body,help='')=>`<section class="flat"><h2>${name}${help?info(help):''}</h2>${body}</section>`;
export const empty=(str)=>`<p class="empty">${esc(str)}</p>`;
export const card=(name,body,cls='')=>`<div class="card ${cls}">${name?`<h3>${name}</h3>`:''}${body}</div>`;
export const grid=(n,body,cl='')=>`<div class="grid ${['','one','two','three','four','five'][n]} ${cl}">${Array.isArray(body)?body.join(''):body}</div>`;
export const metric=(n,v,sub='',cl='')=>`<div class="metric ${cl}"><small>${n}</small><strong>${v}</strong>${sub?`<span class="tiny">${sub}</span>`:''}</div>`;
export const badge=(s,cls='')=>`<span class="badge ${cls}">${esc(s)}</span>`;
export const cell=(html,cls='',title='')=>({html,cls,title});
export const group=(t,span)=>({t,span});
export function table(cols,rows,opts={}){
  if(!rows.length)return empty(opts.empty||'No rows match these filters.');
  const sorted=opts.sort?sortRows(rows,opts.sort):rows;
  return `<div class="tablewrap ${opts.wrap||''}"><table class="board ${opts.cls||''}"><thead>${opts.groups?`<tr>${opts.groups.map(g=>`<th colspan="${g.span}" class="${g.t?'th-group':''}">${g.t}</th>`).join('')}</tr>`:''}<tr>${cols.map((h,i)=>{const p=typeof h==='object'?h:{t:h};return `<th class="${p.cls||''} ${i===0?'left':''}" ${p.span?`colspan="${p.span}"`:''} ${p.style?`style="${p.style}"`:''} ${opts.sort?action('sort',opts.sort+':'+i):''}>${p.t}${current.sort?.table===opts.sort&&current.sort?.col===i?(current.sort.desc?' ▾':' ▴'):''}</th>`;}).join('')}</tr>${opts.extra?`<tr>${opts.extra.map(x=>`<th>${x}</th>`).join('')}</tr>`:''}</thead><tbody>${sorted.map(r=>{const x=Array.isArray(r)?{cells:r}:r;return `<tr class="${x.cls||''}" ${x.act?action(x.act,x.v):''}>${x.cells.map(c=>typeof c==='object'&&c!==null?`<td class="${c.cls||''}" ${c.title?`title="${esc(c.title)}"`:''}>${c.html??'—'}</td>`:`<td>${c??'—'}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`;
}
function sortRows(rows,name){
  const s=current.sort;if(s?.table!==name)return rows;
  const value=r=>{const x=(r.cells||r)[s.col];const v=x?.value??String(x?.html??x??'').replace(/<[^>]*>/g,' ').trim();const n=String(v).match(/^[+-]?\d+(?:\.\d+)?/);return n?+n[0]:v;};
  return [...rows].sort((a,b)=>{const x=value(a),y=value(b);return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)))*(s.desc?-1:1);});
}
export function person(p,detail=true){
  if(!p)return '—';
  const image=detail&&p.img&&/^https:\/\//.test(p.img)?`<img class="head" src="${esc(p.img)}" alt="" loading="lazy" decoding="async">`:'';
  const text=image+`<span>${esc(p.name)}${p.team||p.pos?`<small>${p.team?logo(p.team)+' '+esc(p.team):''} ${esc(p.pos||'')}${p.gp!=null?' · '+p.gp+' GP':''}</small>`:''}</span>`;
  return cell(p.id?`<button class="person" ${action('player',p.id)}>${text}</button>`:`<span class="person">${text}</span>`,'player-cell');
}
export function slate(opts={}){
  const {sport:s}=current.route;
  // GOING YARD shows the one slate hr-board publishes, so there is no day stepping.
  const nav=s==='mlb'?tools(`<span class="period-label">${dateLabel(current.day,true)}</span>${opts.note?`<span class="subtle">${opts.note}</span>`:''}`,'tight'):tools(`<button class="sq" aria-label="Previous ${s==='nfl'?'week':'day'}" ${action('step',-1)}>‹</button><span class="period-label">${s==='nfl'?'Week '+(current.week||'—'):dateLabel(current.day,true)}</span><button class="sq" aria-label="Next ${s==='nfl'?'week':'day'}" ${action('step',1)}>›</button>${opts.date?` <input type="date" data-field="date" aria-label="Pick a day" value="${current.day}">`:''}`,'tight');
  if(opts.navOnly)return nav;
  return box('',nav+`<div class="matchup-row">${current.games.length?current.games.map(g=>{
    const multi=opts.multi&&current.f.multi;
    const on=opts.multi?(multi||[]).includes(g.id):current.game?.id===g.id&&!current.f.allGames;
    const caption=s==='nfl'?dateLabel(gameDay(g),true).replace(/, (\w+) (\d+)/,(_,m,d)=>', '+(1+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m))+'/'+d):final(g)?opts.score?`${g.sa}　　　　　 ${g.sh}`:'Final':liveGame(g)?`${g.sa}–${g.sh} · Live`:et(g);
    const b=opts.primetime&&g.time>='19:00'?badge('PRIMETIME','g'):opts.tall&&s==='nhl'&&current.lineups?.[g.a]&&current.lineups?.[g.h]?badge('✓ LINEUP','g'):'';
    return `<button class="game ${opts.tall?'tall ':''}${on?'on':''}" ${action(opts.multi?'multi':'game',g.id)} aria-label="${g.a} @ ${g.h} ${esc(caption)}" aria-pressed="${!!on}"><span class="game-logo">${logo(g.a)}<span>@</span>${logo(g.h)}</span><span>${esc(caption)}</span>${b}</button>`;
  }).join(''):'<span class="subtle">No games on this slate.</span>'}</div>`,'','slate');
}
export const hero=(g)=>g?box('',`<h1>${logo(g.a)} ${esc(teamName(g.a))} <span class="muted">@</span> ${esc(teamName(g.h))} ${logo(g.h)}</h1><p class="subtle">${dateLabel(gameDay(g))} · ${et(g)} ET${g.tv?' · '+esc(g.tv):''}${final(g)?` · Final: ${g.a} ${g.sa}, ${g.h} ${g.sh}`:''}</p>`,'','matchhero'):'';
export const matchup=()=>current.game||{a:current.f.away,h:current.f.home};
export const versus=g=>`${team(g.a)} <span class="muted">@</span> ${team(g.h)}`;
export const oddsNote=(g)=>g?.odds?.provider?'<span class="tiny">Game lines: '+esc(g.odds.provider)+' via ESPN.</span>':'';
export const injuryList=(t)=>{
  const list=current.injuries[teamName(t)]||[];
  return list.length?`<div class="chips">${list.slice(0,24).map(x=>`<span title="${esc(x.detail)}">${badge([x.name,x.pos,x.status].filter(Boolean).join(' · '),x.status==='Out'||x.status==='Injured Reserve'?'r':'')}</span>`).join('')}</div>`:'<span class="tiny">No entries on the available report.</span>';
};
export function local(k,fallback){try{return JSON.parse(localStorage.getItem('suite:'+k))??fallback;}catch{return fallback;}}
export function keep(k,v){localStorage.setItem('suite:'+k,JSON.stringify(v));}
export const notesKey=()=>current.route.sport+':'+(current.game?.id||[current.f.away,current.f.home].join('-'));
export function notes(){
  const saved=local('plays',[]).filter(p=>p.game===current.game?.id);
  return box('Notes',`<textarea data-field="notes" placeholder="Notes for this matchup…" aria-label="Notes for this matchup">${esc(local('note:'+notesKey(),''))}</textarea><h3 class="section-label">Possible Plays</h3>${saved.length?saved.map(p=>badge(p.title,'g')).join(' '):'<p class="subtle">None yet for this matchup. Check the box next to a line to add one.</p>'}`,'','notes');
}
export const playKey=p=>[p.sport,p.date,p.game,p.id,p.market,p.side,p.line].join('|');
export const playCheck=p=>`<input type="checkbox" aria-label="Save ${esc(p.title)}" title="Save to My Plays" data-play="${esc(JSON.stringify(p))}" ${local('plays',[]).some(x=>playKey(x)===playKey(p))?'checked':''}>`;
export const market=(label,p)=>`<span class="market"><button class="line" ${action('line',JSON.stringify(p))}>${esc(label)}${p.provider&&p.odds!=null?` <small class="muted" title="${esc(p.provider)}">${esc(p.provider==='Kalshi'?'K':p.provider)}</small>`:''}</button>${playCheck(p)}</span>`;
export const basePlay=(p,m,g=gamesFor(p.team),od={})=>({id:p.id,title:p.name+' · '+m,market:m,sport:current.route.sport,date:current.route.sport==='nfl'?gameDay(g):current.day,game:g?.id,team:p.team,provider:propOdds(p,m)?.provider,...od});
export function propOdds(p,m){
  const alias={'Points':'points','Threes':'threes','Assists':'assists','Rebounds':'rebounds','Shots on Goal':'shots','Anytime Goals':'goals','Saves':'saves','Receiving':'receiving','Rushing':'rushing','Passing':'passing','Anytime TD':'td','First TD':'firsttd'};
  const norm=s=>String(s||'').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
  const g=gamesFor(p.team);
  return current.odds.find(o=>(String(o.id)===String(p.id)||norm(o.player)===norm(p.name))&&[m.toLowerCase(),alias[m]].includes(o.market?.toLowerCase())
    &&(!o.date||o.date===(current.route.sport==='nfl'?gameDay(g):current.day))&&(!o.a||o.a===g?.a)&&(!o.h||o.h===g?.h));
}
export function footer(){
  const s=current.route.sport, f=footers[s];
  const lead=current.route.id==='myplays'?'Your saved plays, graded. Saved in this browser.':
    /-models$/.test(current.route.id)?'Model forecasts are published from the local ensemble lab. Research only, not betting advice.':
    f?`Data: <a href="${f[1]}" target="_blank" rel="noopener">${f[0]}</a>. ${f[2]}`:'Public sports data, refreshed automatically. Research only, not betting advice.';
  $('#footer').innerHTML=lead+`<div class="sources">${Object.entries(footers).map(([k,x])=>`<a href="${x[1]}" target="_blank" rel="noopener">${k.toUpperCase()} sources</a>`).join('')}<a href="https://www.espn.com/" target="_blank" rel="noopener">ESPN game lines &amp; injuries</a><a href="https://docs.kalshi.com/api-reference/market/get-markets" target="_blank" rel="noopener">Kalshi public player lines</a></div>`;
}
export function dialog(title,body,wide=false){
  const d=$('#dialog');
  d.className=wide?'dialog-wide':'';
  d.innerHTML=`<button class="sq close" aria-label="Close" ${action('close','')}>×</button><h2>${esc(title)}</h2>${body}`;
  if(!d.open)d.showModal();
}
let toastTimer;
export function toast(text){$('#toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',2800);}
export function saveImage(title,selector='main'){
  const el=$(selector)||$('main'), computed=getComputedStyle(document.documentElement);
  const nodes=[...el.querySelectorAll('h1,h2,h3,table')].filter(x=>x.getClientRects().length);
  const tokens=nodes.flatMap(x=>x.tagName==='TABLE'?[...x.rows].slice(0,34).map(r=>({cols:[...r.cells],head:r.parentElement.tagName==='THEAD'})):[{heading:x.innerText.replace(/\s+/g,' ').trim()}]).slice(0,85);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),v=k=>computed.getPropertyValue('--'+k);
  const photo=selector==='#photo-preview', photoGrid=photo?el.querySelector('.grid'):null, cards=photoGrid?[...photoGrid.children]:[];
  const n=photoGrid?getComputedStyle(photoGrid).gridTemplateColumns.trim().split(/\s+/).length:1;
  canvas.width=photo?Math.max(640,n*320+46):1450;
  canvas.height=110+(photo?Math.max(1,Math.ceil(cards.length/n))*96:tokens.length*31);
  ctx.fillStyle=v('bg');ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=v('accent-text');ctx.font='bold 29px Sofia Sans Condensed, Arial';ctx.fillText(title.toUpperCase(),24,43,canvas.width-48);
  ctx.fillStyle=v('sub');ctx.font='16px Sofia Sans Semi Condensed, Arial';ctx.fillText((sections[current.route.sport]?.name||'GOING')+' · '+dateLabel(current.day,true),24,71);
  const txt=x=>x.innerText.replace(/\s+/g,' ').trim();
  if(photo){
    const w=(canvas.width-48-(n-1)*10)/n;
    if(!cards.length){ctx.fillStyle=v('sub');ctx.fillText('No plays to show.',24,116);}
    cards.forEach((c,i)=>{
      const x=24+i%n*(w+10),y=92+Math.floor(i/n)*96;
      ctx.fillStyle=v('cell');ctx.fillRect(x,y,w,81);
      ctx.fillStyle=v('fg');ctx.font='bold 17px Sofia Sans Semi Condensed, Arial';ctx.fillText(txt(c.querySelector('h3')),x+12,y+29,w-24);
      ctx.fillStyle=v('sub');ctx.font='15px Sofia Sans Semi Condensed, Arial';ctx.fillText(txt(c.querySelector('p')),x+12,y+57,w-24);
    });
  }else{
    tokens.forEach(({heading,cols,head},i)=>{
      const y=92+i*31;
      if(heading){ctx.fillStyle=v('accent-text');ctx.font='bold 18px Sofia Sans Condensed, Arial';ctx.fillText(heading,24,y+20,canvas.width-48);return;}
      const weights=cols.map((c,j)=>(c.colSpan||1)*(j===0&&cols.length>4&&!head?2.0:1)),sum=weights.reduce((a,b)=>a+b,0);
      let x=23;
      cols.forEach((c,j)=>{
        const width=(canvas.width-46)*weights[j]/sum;
        ctx.fillStyle=head?v('high'):c.classList.contains('good')?v('green-bg'):c.classList.contains('mid')?v('yellow-bg'):c.classList.contains('bad')?v('red-bg'):v('cell');
        ctx.fillRect(x,y,width-3,28);
        ctx.fillStyle=head?v('sub'):v('fg');ctx.font=(head?'bold 13px ':'15px ')+'Sofia Sans Semi Condensed, Arial';
        ctx.fillText(txt(c),x+6,y+19,width-13);x+=width;
      });
    });
  }
  canvas.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=title.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),4000);},'image/png');
}
export const dataURL=p=>BASE+'data/'+p;
export async function get(url,fallback){
  try{const r=await fetch(url);if(!r.ok)throw new Error(r.status);return await r.json();}
  catch(e){if(arguments.length>1)return fallback;throw e;}
}
export const numCells=(rows)=>rows.map(x=>[x[0],...x.slice(1).map(y=>round(y,1))]);
export {round,pct};
