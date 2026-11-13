import {menus,routes,sections,BASE,href,viewDefaults,viewSetup} from './config.mjs';
import {$,current as S,today,dateAdd,get,dataURL,esc,box,empty,tools,btn,select,table,card,grid,cell,info,logo,local,keep,action,dialog,toast,footer,saveImage,notesKey,playKey,playCheck,basePlay,gameDay,final,round,pct,team,versus,sportWordmark} from './ui.mjs';
import {ESPN,sportPath,scoreboard,compactInjuries} from './feeds.mjs';
import {homeLoad,homePage} from './home.mjs';
import {isCollege} from './college-core.mjs';
import {refreshScores} from './live-scores.mjs';

// Each section's code loads the first time one of its pages opens, so a visit downloads only what it shows.
// The build adds a modulepreload hint for the page's own section, so this costs no extra round trip.
const loaders={
  nfl:()=>import('./nfl.mjs').then(m=>({page:m.nflPage,player:m.nflPlayer,action:m.nflAction,result:m.nflResult,tdPrice:m.tdPrice})),
  nba:()=>import('./nba.mjs').then(m=>({page:m.nbaPage,player:m.nbaPlayer,action:m.nbaAction,result:m.nbaResult,fbPrice:m.fbPrice})),
  nhl:()=>import('./nhl.mjs').then(m=>({page:m.nhlPage,player:m.nhlPlayer,action:m.nhlAction,result:m.nhlResult})),
  mlb:()=>Promise.all([import('./yard.mjs'),import('./yard-engine.mjs'),import('./yard-more.mjs')]).then(([y,e,more])=>({page:y.yardPage,player:y.yardPlayer,
    action:y.yardAction,result:y.yardResult,field:y.yardField,input:y.yardInput,engineViews:y.ENGINE_VIEWS,setYardData:e.setYardData,setPrice:more.setPrice})),
  models:()=>import('./models.mjs'),
  college:()=>import('./college.mjs'),
  tracker:()=>import('./tracker.mjs'),
  parlayTracker:()=>import('./nba-parlay-tracker.mjs'),
  nflParlayTracker:()=>import('./nfl-parlay-tracker.mjs'),
};
const M={};
// Parlay leg tracker pages and the module that draws each.
const trackerOf=id=>({'nba-parlay-tracker':'parlayTracker','nfl-parlay-tracker':'nflParlayTracker'})[id];
const need=(...names)=>Promise.all(names.map(n=>M[n]?M[n]:loaders[n]().then(x=>M[n]=x)));
const defaults=viewDefaults;
S.today=today;
const memory={};
let req=0, menu=null, lastDialog=null, resizeTimer, dateHash=location.hash, playArchive={};
const isMulti=id=>['endzone','ice','hat','crease'].includes(id);
const isModel=id=>/-models$/.test(id);
// Path below the site root, e.g. "up/points.html#x"; "index.html" files map to their folder.
const relPath=()=>decodeURIComponent(location.pathname.startsWith(BASE)?location.pathname.slice(BASE.length):location.pathname.replace(/^\//,'')).replace(/(^|\/)index\.html$/,'$1');
function route(){
  const p=relPath();
  // A page whose tabs all live behind a hash (long/player-props.html#receiving) opens its first tab when the hash is missing.
  return routes.find(x=>x.path===p+location.hash)||routes.find(x=>x.path===p)||(p&&routes.find(x=>x.path.split('#')[0]===p))||routes[0];
}
function header(){
  const s=S.route.sport, sec=sections[s];
  const menuHTML=(k,items)=>`<div class="navitem"><button type="button" class="navbutton ${k!=='Sports'&&items.some(([,p])=>p===S.route.path)?'active':''}" aria-expanded="${menu===k}" ${action('menu',k)}>${esc(k)} <small aria-hidden="true">▾</small></button><div class="navmenu" ${menu===k?'':'hidden'}>${items.map(([t,p])=>p?`<a href="${href(p)}" ${S.route.path===p?'aria-current="page"':''}>${esc(t)}</a>`:`<span class="nav-label">${esc(t)}</span>`).join('')}</div></div>`;
  const sportMenu=Object.entries(sections).map(([k,x])=>x.home?['GOING '+x.word+' · '+x.league,x.home]:null).filter(Boolean);
  const nav=sec&&menus[s]?Object.entries(menus[s]).map(([k,items])=>{
    // Parlay pages sit in the nav bar as direct links rather than a one- or two-item menu.
    if((s==='nba'||s==='nfl')&&k==='Parlays')return items.map(([title,path])=>{const on=S.route.path===path;
      return `<a class="navbutton${on?' active':''}" href="${href(path)}" ${on?'aria-current="page"':''}>${esc(title)}</a>`;}).join('');
    return menuHTML(k,items);
  }).join('')+menuHTML('Sports',sportMenu):
    Object.entries(sections).filter(([k,x])=>x.home&&!isCollege(k)).map(([,x])=>`<a class="navbutton" href="${href(x.home)}">${x.league}</a>`).join('')+
    menuHTML('College',Object.entries(sections).filter(([k])=>isCollege(k)).map(([,x])=>[x.name+' · '+x.sport,x.home]));
  $('#site-header').innerHTML=`<a class="brand" href="${href('')}" aria-label="${sec?`${esc(sec.name)} | `:''}GOING home">${sec?`<span class="brand-chip">${sec.league}</span>`:''}${sec?sportWordmark(sec,''):`<img class="going-wordmark brand-main" src="${href('brand/going-wordmark.svg')}" width="461" height="100" alt="">`}</a><nav class="nav" aria-label="${sec?esc(sec.name)+' tools':'Sports'}">${nav}<a class="navbutton ${S.route.id==='tracker'?'active':''}" href="${href('tracker.html')}">Tracker</a><a class="navbutton ${S.route.id==='myplays'?'active':''}" href="${href('plays.html')}">My Plays</a></nav><div class="head-actions"><button type="button" class="icon" aria-label="Switch light/dark theme" title="Switch light/dark theme" ${action('theme','')}>${document.documentElement.dataset.theme==='light'?'☾':'☼'}</button></div>`;
}
function render(options={}){
  if(!S.route)return;
  const main=$('#main'),row=main.querySelector('.matchup-row'),scroll=row?.scrollLeft||0;
  const active=document.activeElement,focus=active?.dataset?.field==='search'?[active.selectionStart,active.selectionEnd]:null;
  if(S.error)main.innerHTML=box('',empty(S.error)+tools(btn('Try again','retry','')));
  else if(!S.loaded)main.innerHTML=box('',empty(S.route.id==='home'?'Loading today’s slates…':'Loading the slate…'));
  else{
    try{main.innerHTML=S.route.id==='home'?homePage():S.route.id==='myplays'?myPlays():S.route.id==='tracker'?M.tracker.trackerPage():trackerOf(S.route.id)?M[trackerOf(S.route.id)].parlayTrackerPage():isCollege(S.route.sport)?M.college.collegePage():isModel(S.route.id)?M.models.modelPage():M[S.route.sport].page();}
    catch(e){console.error(e);main.innerHTML=box('',empty('This view could not be rendered.')+tools(btn('Try again','retry','')));}
  }
  const next=main.querySelector('.matchup-row');
  if(next){next.scrollLeft=scroll;if(options.scrollGame)next.querySelector('.game.on')?.scrollIntoView({block:'nearest',inline:'nearest'});}
  if(focus){const input=main.querySelector('[data-field=search]');input?.focus({preventScroll:true});try{input?.setSelectionRange(...focus);}catch{}}
  footer();
}
function routeTo(p,replace=false){
  if(p!==location.pathname+location.search+location.hash){history[replace?'replaceState':'pushState'](null,'',p);}
  dateHash=location.hash;menu=null;$('#dialog').close();lastDialog=null;
  start();
  window.scrollTo(0,0);
}
function seasonFor(s,d){
  const year=+d.slice(0,4),m=d.slice(5,7);
  return s==='nba'?year+(m>='10'):year-(m<(s==='nfl'?'09':'10'));
}
async function dataFor(s,y){
  const tag=s+':'+y;if(memory[tag])return memory[tag];
  const iceTag=''+y+(y+1);
  let promise;
  if(s==='nfl')promise=Promise.all([get(dataURL('nfl-schedule.json'),[]),get(dataURL('nfl-'+y+'.json'),{})]).then(([schedule,x])=>({...x,schedule}));
  else if(s==='nba')promise=Promise.all([get(dataURL('nba-'+y+'.json'),{}),get(dataURL('nba-shots-'+y+'.json'),{})]).then(([x,shots])=>({...x,shots}));
  else promise=Promise.all([get(dataURL('nhl-'+iceTag+'.json'),{}),get(dataURL('nhl-shots-'+iceTag+'.json'),{})]).then(([x,shots])=>({...x,shots}));
  memory[tag]=promise;return promise;
}
// Hourly snapshots published with the site. If a day was not captured, NBA falls back to ESPN in the browser and NHL to the season archive.
async function slateFor(s,d){
  const saved=await get(dataURL('live/slate-'+s+'-'+d+'.json'),null);
  if(saved)return saved;
  if(s==='nba')return get(`${ESPN}/${sportPath.nba}/scoreboard?dates=${d.replaceAll('-','')}`,null).then(j=>j&&scoreboard(j,'nba'));
  return null;
}
// 1st Basket: the live injury report (starters are a hard input) and the saved calibration log.
const basketInputs=()=>Promise.all([get(`${ESPN}/${sportPath.nba}/injuries`,null).then(j=>j?.injuries?.length?compactInjuries(j):null).catch(()=>null),
  get(dataURL('tracker/first-basket-index.json'),{}).then(i=>Promise.all((i.months||[]).map(m=>get(dataURL('tracker/first-basket-'+m+'.json'),[])))).then(x=>x.flat()).catch(()=>[]),
  get(dataURL('tracker/first-basket-backtest.json'),null)])
  .then(([injuries,live,backtest])=>({injuries,fbLog:{live,backtest:backtest?.games||[]}}));
const nflParlayInputs=(year,tdLog=false)=>Promise.all([get(dataURL('models/nfl.json'),null),get(dataURL('nfl-extra-'+year+'.json'),null),
  get(dataURL('live/weather-nfl.json'),null),get(`${ESPN}/${sportPath.nfl}/injuries`,null).then(j=>j?.injuries?.length?compactInjuries(j):null).catch(()=>null),
  // TD Board calibration: the saved pregame boards and the backtest.
  tdLog?Promise.all([get(dataURL('tracker/td-board-index.json'),{}).then(i=>Promise.all((i.months||[]).map(m=>get(dataURL('tracker/td-board-'+m+'.json'),[])))).then(x=>x.flat()).catch(()=>[]),
    get(dataURL('tracker/td-board-backtest.json'),null).then(x=>x?.games||[])]).then(([live,backtest])=>({live,backtest})):null])
  .then(([models,extra,weather,injuries,tdLog])=>({models,extra,weather,injuries,tdLog}));
const injuriesFor=s=>get(dataURL('live/injuries-'+s+'.json'),null).then(x=>x??get(`${ESPN}/${sportPath[s]}/injuries`,{}).then(compactInjuries).catch(()=>({})));
const oddsFor=(s,d)=>get(dataURL('live/odds-'+s+(s==='nfl'?'':'-'+d)+'.json'),[]);
const savedGames={};
function start(){
  S.route=route();S.sort=null;S.error=null;
  S.f=viewSetup(S.route,location.hash);S.game=null;S.games=[];
  if(S.route.id==='tracker'){
    const league=new URLSearchParams(location.search).get('sport')?.toLowerCase();
    if(isCollege(league))S.f.sport=league.toUpperCase();
  }
  S.loaded=false;
  S.lineStats={};
  document.documentElement.dataset.sport=S.route.sport;
  const sec=sections[S.route.sport];
  document.title=S.route.id==='home'?'GOING':(sec?sec.name:'GOING')+' · '+S.route.title;
  header();render();load();
}
// Offline, a page fails only when this device has never opened it (its code or data was never saved), so say that.
const failed=msg=>navigator.onLine?msg:'You are offline, and this page has not been opened on this device before. It loads once you are back online.';
async function load(){
  const token=++req,{sport:s,id}=S.route;
  if(id==='home'){
    try{await homeLoad();}catch(e){console.error(e);}
    if(token!==req)return;S.loaded=true;render();return;
  }
  if(id==='tracker'){
    try{await need('tracker');await M.tracker.trackerLoad();if(token!==req)return;S.loaded=true;render();}
    catch(e){if(token!==req)return;S.error=failed('The pick record could not load. Try again in a moment.');console.error(e);render();}
    return;
  }
  if(isCollege(s)){
    let data;
    try{await need('college');data=await M.college.collegeLoad(s,id);}
    catch(e){if(token!==req)return;S.error=failed('The college data could not load. Try again in a moment.');console.error(e);render();return;}
    if(token!==req)return;
    S.data=data;
    S.loaded=true;render();tickScores();return;
  }
  if(trackerOf(id)){
    try{await need(trackerOf(id));await M[trackerOf(id)].parlayTrackerLoad();if(token!==req)return;S.loaded=true;render();}
    catch(e){if(token!==req)return;S.error=failed('The parlay leg record could not load. Try again in a moment.');console.error(e);render();}
    return;
  }
  if(id==='myplays'){
    S.loaded=true;
    render();
    const all=local('plays',[]);
    await need(...new Set(all.map(p=>p.sport).filter(x=>loaders[x]))).catch(e=>console.error(e));
    const loadSports=await Promise.all([...new Set(all.map(p=>p.sport+':'+seasonFor(p.sport,p.date)))].map(async k=>{
      const [s,y]=k.split(':');return [k,await dataFor(s,+y)];
    }));
    if(token!==req)return;
    playArchive=Object.fromEntries(loadSports);render();return;
  }
  if(isModel(id)){
    try{await need('models');await M.models.modelLoad(s);if(token!==req)return;S.loaded=true;render();}
    catch(e){if(token!==req)return;S.error=failed('The model feed could not load. Try again in a moment.');console.error(e);render();}
    return;
  }
  if(s==='mlb'){
    // GOING YARD reads hr-board's published slate; there is one slate at a time.
    try{
      await need('mlb');
      const engine=M.mlb.engineViews.has(id);
      const [board,odds,results,history,backtest]=await Promise.all([get(dataURL(engine?'yard/board-full.json':'yard/board.json')),get(dataURL('yard/odds.json'),{}),
        id==='yard-record'?get(dataURL('yard/results.json'),{}):null,engine?get(dataURL('yard/history.json'),{days:[]}):null,engine?get(dataURL('yard/backtest.json'),{}):null]);
      if(token!==req)return;
      if(engine){M.mlb.setYardData({board,odds,history,backtest});S.yardHistory=history;}
      const seen=new Set();
      Object.assign(S,{data:board,odds:[],injuries:{},yardOdds:odds,yardResults:results,day:board.slate_date||today,game:null,
        games:(board.games||[]).filter(g=>!seen.has(g.game_pk)&&seen.add(g.game_pk)).map(g=>({id:String(g.game_pk),a:g.away,h:g.home,iso:g.time,park:g.park,status:Date.parse(g.time)>Date.now()?'FUT':'STARTED'}))});
      S.f.allGames=true;S.loaded=true;render();
    }catch(e){if(token!==req)return;S.error=failed('The GOING YARD board could not load. Try again in a moment.');console.error(e);render();}
    return;
  }
  try{
    const d=S.day,year=s==='nfl'?S.year:seasonFor(s,d);
    const [,data,dayGames,injuries,odds,lineups,models]=await Promise.all([need(s),dataFor(s,year),
      s==='nfl'?null:slateFor(s,d).catch(()=>null),
      injuriesFor(s),oddsFor(s,d),
      s==='nhl'?get(dataURL('live/nhl-lineups-'+d+'.json'),{}):{},
      id==='nfl-parlays'||id==='nfl-tdboard'?nflParlayInputs(year,id==='nfl-tdboard'):id==='basket'?basketInputs():null]);
    if(token!==req)return;
    if(s==='nba')S.hoops=year;if(s==='nhl')S.ice=year;
    S.data=data;S.odds=odds;S.injuries=injuries;S.lineups=lineups;
    // GOING LONG Suggested Parlays: model feed, snap and coverage data, kickoff forecasts, and the live injury report
    // (inactives post about 90 minutes before kickoff, often between hourly refreshes).
    S.models=models?.models||null;S.extra=models?.extra||null;S.weather=models?.weather||null;
    if(models?.injuries)S.injuries=models.injuries;
    S.fbLog=models?.fbLog||null;S.tdLog=models?.tdLog||null;
    if(s==='nfl'){
      const sched=data.schedule?.filter(g=>+g.id.slice(0,4)===S.year)||[];
      S.week??=sched.find(g=>g.date>=today)?.week??sched.at(-1)?.week??1;
      S.games=sched.filter(g=>g.week===S.week).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    }else if(dayGames)S.games=dayGames;
    else if(s==='nhl')S.games=[...new Map(Object.values(data.schedule||{}).flat().filter(g=>g.date===d).map(g=>[g.id,g])).values()].sort((a,b)=>a.iso.localeCompare(b.iso));
    else S.games=[];
    const preferred=S.games.find(g=>g.id===savedGames[s]);
    S.game=preferred||(s==='nba'&&['keys','basket'].includes(id)?S.games.at(-1):S.games[0])||null;
    if(S.game){S.f.away=S.game.a;S.f.home=S.game.h;}
    if(id==='shotcharts'&&S.game){S.f.offense=S.game.a;S.f.defense=S.game.h;}
    if(isMulti(id)){
      if(id==='ice'){
        const groups={};S.games.forEach(g=>(groups[g.iso]??=[]).push(g));
        S.f.multi=(Object.values(groups).sort((a,b)=>b.length-a.length)[0]||[]).map(g=>g.id);
      }else S.f.multi=S.games.map(g=>g.id);
      S.f.teamFilter=null;
    }
    if(id==='nba-props'&&odds.length&&odds.some(x=>S.route.title==='All Props'||x.market===(S.route.title==='Assist Spots'?'Assists':S.route.title)))S.f.pricing='With A Line';
    S.loaded=true;
    render();
    loadLineStats();
    tickScores();
  }catch(e){if(token!==req)return;S.error=failed('The public data could not load. Check your connection and try again.');console.error(e);render();}
}
function chooseGame(g,scroll=false){
  if(!g)return;
  // GOING YARD: a game filters the page; tapping the same game again shows every game.
  if(S.route.sport==='mlb'){S.f.allGames=!S.f.allGames&&S.game?.id===g.id;S.game=S.f.allGames?null:g;render({scrollGame:scroll});return;}
  S.game=g;savedGames[S.route.sport]=g.id;
  S.lineStats={};
  S.f.away=g.a;S.f.home=g.h;
  if(S.route.id==='nhl-props'||S.route.id==='nba-props')S.f.allGames=false;
  if(S.route.id==='shotcharts'){S.f.offense=g.a;S.f.defense=g.h;S.f.player=null;}
  render({scrollGame:scroll});
  loadLineStats();
}
function loadLineStats(){
  if(S.route.id!=='nhl-lines'||!S.game)return;
  const g=S.game,token=req,d=S.day;
  S.lineStats={};
  get(dataURL('live/nhl-lines-'+d+'-'+g.a+'-'+g.h+'.json'),{}).then(x=>{
    if(token!==req||S.game!==g)return;
    S.lineStats=x;render();
  });
}
function updateField(k,v){
  if(k==='date'){
    if(v&&v!==S.day){S.day=v;S.f.gameFilter='All games';S.sort=null;load();}
    return;
  }
  if(k==='notes'){keep('note:'+notesKey(),v);return;}
  if(k==='away'||k==='home'){
    const a=k==='away'?v:S.f.away,h=k==='home'?v:S.f.home;
    if(a===h){toast('Choose two different teams.');render();return;}
    S.f[k]=v;S.game=S.games.find(g=>g.a===a&&g.h===h)||null;
    render();return;
  }
  if(k==='offense')S.f.player=null;
  if(k==='pricing')S.f.touchedPricing=true;
  S.f[k]=v;
  if(S.route.id==='myplays'&&lastDialog==='wheel'&&$('#dialog').open){wheel(false);return;}
  render();
}
function changePeriod(n){
  if(isModel(S.route.id)){if(M.models?.modelStep(n))render();return;}
  if(S.route.sport==='nfl'){
    const list=[...new Set((S.data.schedule||[]).filter(g=>+g.id.slice(0,4)===S.year).map(g=>g.week))].sort((a,b)=>a-b);
    const next=list[list.indexOf(S.week)+n];if(next==null)return;
    S.week=next;
  }else S.day=dateAdd(S.day,n);
  S.f.gameFilter='All games';S.sort=null;load();
}
const showLine=p=>{
  const label=[p.line==null?'No market line':(p.side||'Over')+' '+p.line,p.odds??'No price',p.provider].filter(Boolean).join(' · ');
  dialog(p.title,`<p class="subtle">${esc(label)}</p>`+grid(2,[card('Season Average',esc(round(p.average,2))),card('Projection',esc(round(p.projection,2)))])+
    `<p><label class="field">${playCheck(p)} Save to My Plays</label></p>`);
};
function savePlay(p,on){
  const list=local('plays',[]),i=list.findIndex(x=>playKey(x)===playKey(p));
  if(on&&i<0){list.push({...p,saved:Date.now()});keep('plays',list);toast('Saved to My Plays');}
  if(!on&&i>=0){list.splice(i,1);keep('plays',list);toast('Removed from My Plays');}
  document.querySelectorAll('[data-play]').forEach(x=>{if(playKey(JSON.parse(x.dataset.play))===playKey(p))x.checked=on;});
  if(S.route.id==='myplays'||document.querySelector('.notes'))render();
}
function graded(p){
  const y=seasonFor(p.sport,p.date),data=playArchive[p.sport+':'+y];
  if(!data)return {value:null,label:'Pending'};
  const old=S.data;S.data=data;
  let value;
  try{value=M[p.sport]?M[p.sport].result(p):null;}finally{S.data=old;}
  if(value==null||p.line==null)return {value,label:value==null?'Pending':'Tracked'};
  const threshold=Number(p.line)*(p.market==='Spread'?-1:1);
  return {value,label:value===threshold?'Push':(p.side==='Under'?value<threshold:value>threshold)?'Won':'Lost'};
}
function playList(){
  return local('plays',[]).filter(p=>(S.f.when==='Everything'||S.f.when===p.date)&&(S.f.playType==='Every Type'||S.f.playType===p.market))
    .map(p=>({p,r:graded(p)})).filter(({r})=>S.f.grade==='All'||S.f.grade===r.label).sort((a,b)=>b.p.saved-a.p.saved);
}
function myPlays(){
  const all=local('plays',[]),show=playList();
  const grades=['All','Pending','Won','Lost','Push','Tracked'].filter(k=>k==='All'||all.some(p=>graded(p).label===k));
  return `<h1>My Plays ${info('Check the box next to a player line to save it. When the public archive has a result, priced plays are graded against the saved line.')}</h1>`+
    tools(grades.map(k=>btn(k+' ('+(k==='All'?all.length:all.filter(p=>graded(p).label===k).length)+')','set','grade:'+k,S.f.grade===k?'on':'')).join('')+
      select('When','when',['Everything',...new Set(all.map(p=>p.date))])+select('Type','playType',['Every Type',...new Set(all.map(p=>p.market))])+
      `<span class="right"></span>`+btn('Parlay Wheel','wheel','','primary')+btn('Photo Export','photo','','primary')+
      btn('Back up','backup','')+`<label class="pill" title="Restore a GOING backup file">Restore<input type="file" accept=".json,application/json" data-restore hidden></label>`)+
    box('',show.length?table(['Play','League','Date','Line','Price','Result','Status',''],show.map(({p,r})=>[esc(p.title),p.sport.toUpperCase(),esc(p.date),esc(p.line??'—'),esc(p.odds??'—'),r.value??'—',cell(r.label,r.label==='Won'?'good heat':r.label==='Lost'?'bad heat':''),btn('Remove','remove',playKey(p))]),{sort:'myplays',wrap:'box'}):
      empty('Nothing saved yet. Check the box beside a play on any research page and it shows up here.'));
}
// Backups hold every GOING setting saved in this browser: plays, picks, notes, saved parlays and filters.
const PREFIX='suite:';
function backup(){
  const data={};
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(PREFIX))data[k.slice(PREFIX.length)]=localStorage.getItem(k);}
  const blob=new Blob([JSON.stringify({app:'GOING',version:1,saved:new Date().toISOString(),data},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`going-backup-${today}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast(`Backed up ${local('plays',[]).length} plays and ${Object.keys(data).length} saved settings.`);
}
// Restoring merges: plays from the file are added to the ones here, and other settings fill in only where this browser has none.
async function restore(file){
  let parsed;
  try{parsed=JSON.parse(await file.text());}catch{toast('That file is not a GOING backup.');return;}
  if(parsed?.app!=='GOING'||typeof parsed.data!=='object'){toast('That file is not a GOING backup.');return;}
  let added=0,filled=0;
  for(const [k,raw] of Object.entries(parsed.data)){
    if(typeof raw!=='string')continue;
    if(k==='plays'){
      let incoming=[];try{incoming=JSON.parse(raw);}catch{}
      const list=local('plays',[]),have=new Set(list.map(playKey));
      for(const p of Array.isArray(incoming)?incoming:[])if(p&&!have.has(playKey(p))){list.push(p);have.add(playKey(p));added++;}
      keep('plays',list);
    }else if(localStorage.getItem(PREFIX+k)==null){localStorage.setItem(PREFIX+k,raw);filled++;}
  }
  toast(`Restored ${added} new ${added===1?'play':'plays'} and ${filled} ${filled===1?'setting':'settings'}.`);
  load();
}
const wheelState={checked:new Set(),pending:true,legs:2,result:[]};
function wheel(reset=true){
  lastDialog='wheel';const p=playList().filter(x=>!wheelState.pending||x.r.label==='Pending').map(x=>x.p);
  if(reset){wheelState.checked=new Set(p.map(playKey));wheelState.result=[];}
  dialog('Parlay Wheel',`<p class="subtle">Pick the plays that go on your wheel.</p>`+
    tools(select('When','when',['Everything',...new Set(local('plays',[]).map(p=>p.date))])+`<label class="field"><input type="checkbox" data-field="wheelPending" ${wheelState.pending?'checked':''}> Pending Plays Only</label>`+btn('Check All','wheelAll','yes')+btn('Uncheck All','wheelAll','no'))+
    (p.length?p.map(x=>`<div><label class="field"><input type="checkbox" data-wheel="${esc(playKey(x))}" ${wheelState.checked.has(playKey(x))?'checked':''}> ${esc(x.title)}</label></div>`).join(''):empty('No plays for this filter. Uncheck Pending Plays Only to use graded ones.'))+
    tools(`<label class="field">Legs <input type="number" min="1" max="12" value="${wheelState.legs}" data-field="wheelLegs"></label>`+btn('Spin Wheel','spin','','primary')+`<span class="subtle">${p.filter(x=>wheelState.checked.has(playKey(x))).length} plays</span>`)+
    (wheelState.result.length?grid(1,wheelState.result.map(x=>card(esc(x.title),esc(x.side||'')+' '+esc(x.line??'')))):''));
}
const photoState={results:false,columns:'Auto'};
function photo(){
  lastDialog='photo';const show=playList(),n=photoState.columns==='Auto'?Math.max(1,Math.min(3,Math.ceil(show.length/6))):Number(photoState.columns);
  dialog('Photo Export',`<p class="subtle">Every play shown (${show.length}).</p>`+tools(`<label class="field"><input type="checkbox" data-field="photoResults" ${photoState.results?'checked':''}> Show results</label><span class="subtle">Columns:</span>`+
    ['Auto','1','2','3','4'].map(k=>btn(k,'photoCol',k,photoState.columns===k?'on':'')).join('')+btn('Save image','export','My Plays','primary'))+
    `<div id="photo-preview">${show.length?grid(n,show.map(({p,r})=>`<div class="card"><h3>${esc(p.title)}</h3><p>${esc(p.side||'')} ${esc(p.line??'')} ${esc(p.odds??'')}${photoState.results?' · '+esc(r.label):''}</p></div>`)):empty('No plays to show.')}</div>`,true);
}
function performance(s){
  const rows=local('plays',[]).filter(p=>p.sport===s.toLowerCase()).map(p=>[p,graded(p)]);
  dialog('YTD Play Performance',`<p class="subtle">Results of the plays you saved in this browser.</p>`+
    grid(3,['Won','Lost','Push'].map(k=>card(k,String(rows.filter(([,r])=>r.label===k).length))))+
    table(['Play','Line','Price','Result','Grade'],rows.map(([p,r])=>[esc(p.title),esc(p.line??'—'),esc(p.odds??'—'),r.value??'—',r.label])),true);
}
// Internal links are real hrefs under BASE; intercept them so the shell is not reloaded.
const internal=a=>{
  if(!a||a.target||a.origin!==location.origin||!a.pathname.startsWith(BASE))return false;
  const rel=decodeURIComponent(a.pathname.slice(BASE.length)).replace(/(^|\/)index\.html$/,'$1');
  return routes.some(r=>r.path===rel+a.hash||r.path===rel||(rel&&r.path.split('#')[0]===rel));
};
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');
  if(a&&e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&internal(a)){e.preventDefault();routeTo(a.pathname+a.search+a.hash);return;}
  const t=e.target.closest('[data-act]');
  if(!t){if(menu&&!e.target.closest('.nav')){menu=null;header();}return;}
  const {act,v}=t.dataset;
  if(act==='menu'){menu=menu===v?null:v;header();$('.navbutton[aria-expanded="true"]')?.focus({preventScroll:true});return;}
  if(act==='theme'){const theme=document.documentElement.dataset.theme==='light'?'dark':'light';keep('theme',theme);document.documentElement.dataset.theme=theme;header();return;}
  if(act==='close'){$('#dialog').close();lastDialog=null;return;}
  if(act==='info'){dialog('How to read this','<p class="subtle">'+esc(v)+'</p>');return;}
  if(act==='step'){changePeriod(+v);return;}
  if(act==='retry'){S.error=null;load();return;}
  if(isModel(S.route.id)&&M.models?.modelAction(act,v)){render();return;}
  if(S.route.id==='tracker'&&M.tracker?.trackerAction(act,v)){render();return;}
  if(trackerOf(S.route.id)&&M[trackerOf(S.route.id)]?.parlayTrackerAction(act,v)){render();return;}
  if(act==='game'){chooseGame(S.games.find(g=>g.id===v));return;}
  if(act==='gameStep'){chooseGame(S.games[S.games.indexOf(S.game)+Number(v)],true);return;}
  if(act==='set'){
    const i=v.indexOf(':'),k=v.slice(0,i);let val=v.slice(i+1);
    if(k==='plays')val=val==='1';
    updateField(k,val);return;
  }
  if(act==='sort'){
    const i=v.lastIndexOf(':'),key=v.slice(0,i),col=Number(v.slice(i+1));
    S.sort={table:key,col,desc:S.sort?.table===key&&S.sort?.col===col?!S.sort.desc:true};render();return;
  }
  if(act==='flip'){S.f[v]=!S.f[v];render();return;}
  if(act==='moreRows'){const i=v.lastIndexOf(':');S.f['rows:'+v.slice(0,i)]=Number(v.slice(i+1));render();return;}
  if(act==='player'){M[S.route.sport]?.player(v);return;}
  if(act==='line'){showLine(JSON.parse(v));return;}
  if(act==='export'){saveImage(v,lastDialog==='photo'?'#photo-preview':'main');return;}
  if(act==='performance'){performance(v);return;}
  if(act==='shotMatch'){[S.f.offense,S.f.defense]=v.split(':');S.f.player=null;render();return;}
  if(act==='typeOpen'){S.f.typeFilter=v;S.f.view='Every Player';render();return;}
  if(act==='marketFilter'){
    const list=new Set(S.f.markets|| (S.route.sport==='nba'?['Points','Threes','Assists','Rebounds']:['Shots on Goal','Anytime Goals','Points','Saves']));
    if(list.has(v))list.delete(v);else list.add(v);
    S.f.markets=[...list];render();return;
  }
  if(act==='multi'||act==='allmulti'||act==='clearmulti'||act==='multiTime'){
    const list=new Set(S.f.multi||[]);
    S.f.multi=act==='allmulti'?S.games.map(g=>g.id):act==='clearmulti'?[]:act==='multiTime'?S.games.filter(g=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(g.iso))===v).map(g=>g.id):(list.has(v)?list.delete(v):list.add(v),[...list]);render();return;
  }
  if(act==='teamPromo'){S.f.teamFilter=S.f.teamFilter===v?null:v;render();return;}
  if(act==='pick'||act==='confidence'){
    const i=v.indexOf(':'),key=v.slice(0,i),val=v.slice(i+1),all=local('picks',{}),g=(all[S.game.id]??={}),p=(g[key]??={});
    p[act==='pick'?'label':'confidence']=val;keep('picks',all);render();return;
  }
  if(act==='remove'){const p=local('plays',[]).find(p=>playKey(p)===v);if(p)savePlay(p,false);return;}
  if(act==='wheel'){wheel();return;}
  if(act==='wheelAll'){wheelState.checked=v==='yes'?new Set(playList().filter(x=>!wheelState.pending||x.r.label==='Pending').map(x=>playKey(x.p))):new Set();wheel(false);return;}
  if(act==='spin'){
    const list=playList().filter(x=>(!wheelState.pending||x.r.label==='Pending')&&wheelState.checked.has(playKey(x.p))).map(x=>x.p);
    for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}
    wheelState.result=list.slice(0,wheelState.legs);wheel(false);return;
  }
  if(act==='photo'){photo();return;}
  if(act==='backup'){backup();return;}
  if(act==='photoCol'){photoState.columns=v;photo();return;}
  if(S.route.sport==='mlb'&&M.mlb){const r=M.mlb.action(act,v);if(r){if(typeof r==='string')toast(r);render();return;}}
  if(M[S.route.sport]?.action?.(act,v,t)&&(act.startsWith('parlay')||act.startsWith('fb')||act.startsWith('td')))render();
});
document.addEventListener('input',e=>{
  const t=e.target,k=t.dataset.field;
  if(k==='notes'){keep('note:'+notesKey(),t.value);return;}
  if(k==='search'){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>updateField(k,t.value),125);return;}
  if(t.dataset.weight){t.nextElementSibling.textContent=t.value;}
});
document.addEventListener('change',e=>{
  const t=e.target,k=t.dataset.field;
  if(t.dataset.restore!=null){const f=t.files?.[0];t.value='';if(f)restore(f);return;}
  if(t.dataset.tdPrice!=null&&M.nfl){M.nfl.tdPrice(t.dataset.tdPrice,t.value);render();return;}
  if(t.dataset.fbPrice!=null&&M.nba){M.nba.fbPrice(t.dataset.fbPrice,t.value);render();return;}
  if(t.dataset.play){savePlay(JSON.parse(t.dataset.play),t.checked);return;}
  if(t.dataset.wheel){if(t.checked)wheelState.checked.add(t.dataset.wheel);else wheelState.checked.delete(t.dataset.wheel);wheel(false);return;}
  if(t.dataset.weight){const o=local('nfl-model',{Offense:35,Defense:35,'Recent form':20,'Home field':10});o[t.dataset.weight]=+t.value;keep('nfl-model',o);render();return;}
  if(k==='wheelPending'){wheelState.pending=t.checked;wheel(false);return;}
  if(k==='wheelLegs'){wheelState.legs=Math.max(1,Math.min(12,+t.value||1));return;}
  if(k==='photoResults'){photoState.results=t.checked;photo();return;}
  if(k==='lean'){S.f.lean=t.checked;render();return;}
  if(k==='hideThin'){S.f.hideThin=t.checked;render();return;}
  if(S.route.sport==='mlb'&&M.mlb){const r=M.mlb.input(t);if(r){if(r!=='keep')render();return;}}
  if(t.dataset.yardPrice&&M.mlb){M.mlb.setPrice(t.dataset.yardPrice,t.value);render();return;}
  if((S.route.id==='nba-parlays'||S.route.id==='nfl-parlays')&&t.dataset.parlay){
    M[S.route.sport].action('parlayField',JSON.stringify([t.dataset.parlay,t.type==='checkbox'?t.checked:t.value]),t);
    if(t.type!=='number')render();
    return;
  }
  if(S.route.sport==='mlb'&&k&&M.mlb?.field(k,t.value)){render();return;}
  if(isModel(S.route.id)&&k&&M.models?.modelAction('field',k+':'+t.value)){render();return;}
  if(k&&!['notes','search'].includes(k))updateField(k,t.value);
});
// Pages that change after an async fetch (box-score grading, backup restore) ask for a redraw.
document.addEventListener('going:render',()=>render());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu){menu=null;header();}});
window.addEventListener('popstate',()=>{dateHash=location.hash;start();});
window.addEventListener('hashchange',()=>{if(dateHash!==location.hash){dateHash=location.hash;start();}});
// Live scores: once a minute while the tab is visible, and right away when it comes back into view.
async function tickScores(){
  if(document.visibilityState!=='visible'||!S.loaded||S.error||!S.route)return;
  const s=S.route.sport,token=req;
  const games=['nba','nhl','nfl'].includes(s)&&!isModel(S.route.id)?S.games:isCollege(s)&&S.route.id!=='college-players'?S.data?.games:null;
  if(!games?.length)return;
  if(await refreshScores(s,games).catch(()=>false)&&token===req)render();
}
setInterval(tickScores,60000);
document.addEventListener('visibilitychange',tickScores);
document.documentElement.dataset.theme=local('theme','dark');
start();
// Offline support (site/sw.js). Only built deploys register it: their module URLs carry ?v=, the unbuilt site/ does not.
if('serviceWorker' in navigator&&new URL(import.meta.url).searchParams.has('v'))
  addEventListener('load',()=>navigator.serviceWorker.register(BASE+'sw.js').catch(e=>console.warn('Offline support unavailable',e)));
addEventListener('offline',()=>toast('You are offline. Pages show the data saved on this device.'));
addEventListener('online',()=>{toast('Back online.');if(S.error){S.error=null;load();}});
