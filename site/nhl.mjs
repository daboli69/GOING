import {menus,href} from './config.mjs';
import {total,mean,round,pct,div,rate,heat,american,implied,signed,poissonTail,leaderShares} from './math.mjs';
import {current as S,esc,box,grid,card,metric,logo,team,teamName,teamBanner,table,cell,group,tools,btn,toggle,toggles,select,search,info,empty,slate,hero,versus,injuryList,oddsNote,person,market,basePlay,propOdds,gamesFor,gameDay,final,liveGame,dialog,badge,et,action} from './ui.mjs';

const archive=()=>S.data;
const nowData=()=>archive().teamRows||{};
const reg=()=>Object.keys(archive().teams||{});
const canon=s=>(s||'').normalize('NFD').replace(/\p{M}|[^\p{L}\p{N}]/gu,'').toLowerCase();
const areas=['Low Slot','High Slot','Left Circle','Right Circle','Point / Other'];
function zone(p){const d=89-Math.abs(p[3]),w=Math.abs(p[4]);return d<=21&&w<=13?areas[0]:d<=42&&w<=17?areas[1]:d<=40&&p[4]>13?areas[2]:d<=40&&p[4]<-13?areas[3]:areas[4];}
const gameLogs=(id,playedOnly=true)=>(archive().logs?.[id]||[]).filter(r=>!playedOnly||r[1]<S.day);
const currentTeam=x=>(x.teamAbbrevs||'').split(',').at(-1);
function toPerson(x){
  const id=String(x.playerId),l=gameLogs(id),name=x.skaterFullName||x.goalieFullName,team=currentTeam(x)||l.at(-1)?.[2];
  const goal=!!x.goalieFullName,past=l.length&&(S.day<S.today||l.length>=x.gamesPlayed-2);
  return {id,name,pos:x.positionCode||'G',team,img:'https://assets.nhle.com/mugs/nhl/'+S.ice+(S.ice+1)+'/'+team+'/'+id+'.png',
    logs:l,gp:past?l.length:x.gamesPlayed,goal,stats:x,min:past?div(mean(l,r=>r[5]),60):div(x.timeOnIcePerGame??div(x.timeOnIce,x.gamesPlayed),60),
    g:past?mean(l,r=>r[6]):div(x.goals,x.gamesPlayed),a:past?mean(l,r=>r[7]):div(x.assists,x.gamesPlayed),
    pts:past?mean(l,r=>r[6]+r[7]):div(x.points,x.gamesPlayed),sog:past?mean(l,r=>r[8]):div(x.shots,x.gamesPlayed),
    sv:past&&goal?div(total(l,r=>r[9]),total(l,r=>r[10])):x.savePct,saves:past&&goal?mean(l.filter(r=>r[11]),r=>r[9]):div(x.saves,x.gamesStarted),
    gs:past?l.filter(r=>r[11]).length:x.gamesStarted};
}
let last,day,playersCache;
function people(){
  if(last!==archive()||day!==S.day){last=archive();day=S.day;playersCache=[...(last.skaters||[]),...(last.goalies||[])].map(toPerson);}
  return playersCache||[];
}
const roster=(t,g=false)=>people().filter(p=>p.team===t&&p.goal===g);
const findNamed=(t,name,goal=false)=>roster(t,goal).find(p=>canon(p.name)===canon(name))||people().find(p=>p.goal===goal&&canon(p.name)===canon(name));
const before=t=>(archive().schedule?.[t]||[]).filter(g=>g.date<S.day&&final(g)).sort((a,b)=>a.date.localeCompare(b.date));
const newSlate=()=>slate({score:true});
function seasonTeam(t){
  const s=nowData()[t]||{},l=before(t);
  const goal=(g,own)=>g.a===t?(own?g.sa:g.sh):(own?g.sh:g.sa);
  return {t,gp:l.length||s.gamesPlayed,w:l.length?l.filter(g=>goal(g,true)>goal(g,false)).length:s.wins,l:s.losses,ot:s.otLosses,pts:s.points,
    gf:l.length?mean(l,g=>goal(g,true)):s.goalsForPerGame,ga:l.length?mean(l,g=>goal(g,false)):s.goalsAgainstPerGame,
    sf:s.shotsForPerGame,sa:s.shotsAgainstPerGame,pp:s.powerPlayPct,pk:s.penaltyKillPct};
}
const allShotRows=()=>Object.entries(archive().shots||{}).filter(([gid])=>(archive().opening?.[gid]?.[0]||'')<S.day);
function shotsFor(t,against=false){
  const o=archive().opening||{};
  return allShotRows().flatMap(([id,r])=>o[id]&&(o[id][1]===t||o[id][2]===t)?r.filter(x=>(x[0]===t)!==against):[]);
}
function gameLines(g){
  const o=g.odds||{},mlA=implied(o.am),mlH=implied(o.hm),sum=(mlA||0)+(mlH||0);
  return grid(3,[metric('Moneyline · Win Chance',`${logo(g.a)} ${esc(o.am||'—')} <small style="display:inline">${pct(sum?mlA/sum:null)}</small>　${logo(g.h)} ${esc(o.hm||'—')} <small style="display:inline">${pct(sum?mlH/sum:null)}</small>`),
    metric('Puck Line',esc(o.details||'—'),esc([o.ao,o.ho].filter(Boolean).join(' / '))),metric('Total Goals',esc(o.total??'—'),esc([o.over&&'O '+o.over,o.under&&'U '+o.under].filter(Boolean).join(' · ')))]);
}
function goalieBoard(t){
  return table(['Goalie','GP','GS','Record','SV%','GAA','Low Slot SV%','L5 SV%'],roster(t,true).sort((a,b)=>(b.gs||0)-(a.gs||0)).map(p=>{
    const l=p.logs.slice(-5), s=p.stats, ls=shotsFor(t,true).filter(r=>String(r[6])===p.id&&r[5]&&zone(r)===areas[0]);
    return [person(p),p.gp,p.gs,`${s.wins??0}–${s.losses??0}–${s.otLosses??0}`,cell(pct(p.sv,1),heat(p.sv,.901,.015)),round(s.goalsAgainstAverage,2),pct(rate(ls,x=>x[5]===1),1),pct(div(total(l,x=>x[9]),total(l,x=>x[10])),1)];
  }),{sort:'goalies-'+t});
}
function skaterBoard(t){
  return table(['Player','GP','TOI','G','A','PTS','SOG','L5 SOG','PP TOI','Low Slot'],roster(t).sort((a,b)=>b.pts-a.pts).slice(0,15).map(p=>{
    const l=p.logs.slice(-5), s=p.stats, low=shotsFor(t).filter(r=>String(r[1])===p.id&&zone(r)===areas[0]);
    return [person(p),p.gp,round(p.min),round(p.g,2),round(p.a,2),cell(round(p.pts,2),heat(p.pts,.6,.25)),round(p.sog,2),round(mean(l,r=>r[8]),2),round(div(mean(l,r=>r[12]),60)),low.length];
  }),{sort:'skaters-'+t});
}
function hPreview(){
  const g=S.game;if(!g)return newSlate()+box('Game Previews',empty('No game selected.'));
  const {a,h}=g, stats=t=>seasonTeam(t);
  const low=t=>rate(shotsFor(t),r=>zone(r)===areas[0]);
  const teamTiles=t=>{const x=stats(t), rec=[x.w,x.l,x.ot].map(v=>v??'—').join('–');
    return teamBanner(t,rec+(x.pts?' · '+x.pts+' pts':''))+grid(5,[metric('Goal Diff / Game',signed(x.gf==null||x.ga==null?null:x.gf-x.ga,2)),metric('Goals / Game',round(x.gf,2)),metric('Allowed / Game',round(x.ga,2)),metric('Shot Share',pct(div(x.sf,(x.sf||0)+(x.sa||0)),1)),metric('Low Slot Share',pct(low(t),1)),metric('Power Play',pct(x.pp,1)),metric('Penalty Kill',pct(x.pk,1))]);};
  const compared=(t,o)=>{const x=stats(t),y=stats(o);return table(['',logo(t)+' '+t+' OFF',logo(o)+' '+o+' ALLOWS'],[['Goals / Game',round(x.gf,2),round(y.ga,2)],['Shots / Game',round(x.sf),round(y.sa)],['Special Teams',pct(x.pp,1),pct(y.pk,1)],['Low Slot Share',pct(low(t),1),pct(rate(shotsFor(o,true),r=>zone(r)===areas[0]),1)]]);};
  const zoned=(t,o)=>{const own=shotsFor(t),opp=shotsFor(o,true);return table(['Zone','Shot Share','Opp Allows','Goals'],areas.map(z=>{const a=own.filter(x=>zone(x)===z),b=opp.filter(x=>zone(x)===z);return [z,pct(div(a.length,own.length)),pct(div(b.length,opp.length)),a.filter(x=>x[5]===2).length];}));};
  const recent=t=>table(['Date','Opp','Score','Result'],before(t).slice(-7).reverse().map(g=>{const a=g.a===t;return [esc(g.date),team(a?g.h:g.a),(a?g.sa:g.sh)+'–'+(a?g.sh:g.sa),(a?g.sa>g.sh:g.sh>g.sa)?badge('W','g'):badge('L','r')];}));
  return newSlate()+hero(g)+box('The Line',gameLines(g)+`<p class="tiny">${oddsNote(g)}</p>`)+box('The Teams',grid(2,[teamTiles(a),teamTiles(h)]))+
    box('Offense vs Defense',grid(2,[compared(a,h),compared(h,a)]),'Team rates are calculated from the NHL regular season.')+
    box('Where the Shots Come From',grid(2,[card(a,zoned(a,h)),card(h,zoned(h,a))]),'The zone breakdown uses cached NHL shot coordinates.')+
    box('Goalies',grid(2,[goalieBoard(a),goalieBoard(h)]),'The last five are the goalie’s most recent appearances with a recorded shot.')+
    box('Skaters',grid(2,[skaterBoard(a),skaterBoard(h)]),'TOI and scoring use the official NHL box scores.')+
    box('Injuries',grid(2,[card(a,injuryList(a)),card(h,injuryList(h))]))+box('Recent Games',grid(2,[teamBanner(a)+recent(a),teamBanner(h)+recent(h)]));
}
const official=t=>S.lineups?.[t];
function getLine(p){const a=official(p.team);if(!a)return null;if(p.goal)return a.goalies.findIndex(n=>canon(n)===canon(p.name))===0?'Expected':null;let i=a.forwards.findIndex(line=>line.some(n=>canon(n)===canon(p.name)));if(i>=0)return 'L'+(i+1);i=a.defense.findIndex(line=>line.some(n=>canon(n)===canon(p.name)));return i>=0?'D'+(i+1):null;}
function hLines(){
  const g=S.game;if(!g)return slate({tall:true})+box('Line Matchups',empty('No game selected.'));
  const render=t=>{
    const a=official(t);
    if(!a)return teamBanner(t)+empty('No official line combinations are available for this team and date.')+skaterBoard(t);
    const make=(list,label)=>list.map((names,i)=>{
      const p=names.map(n=>findNamed(t,n)).filter(Boolean);
      const shared=p.length?[...new Set(p[0].logs.map(x=>x[0]))].filter(g=>p.every(y=>y.logs.some(x=>x[0]===g))):[];
      const r=S.lineStats?.[t]?.[i+(label==='Pair'?a.forwards.length:0)]||[],sf=total(r,x=>x.sf),sa=total(r,x=>x.sa),ss=div(sf,sf+sa);
      const shares=r.length?grid(4,[metric('Shared ice',round(total(r,x=>x.sec)/60,0)+' min',r.length+' GP'),metric('Shot share',pct(ss),sf+'–'+sa,heat(ss,.5,.08)),metric('Goals',total(r,x=>x.gf)+'–'+total(r,x=>x.ga)),metric('Last 3 GP',pct(div(total(r.slice(0,3),x=>x.sf),total(r.slice(0,3),x=>x.sf+x.sa))))]):'<p class="tiny">'+shared.length+' games with all listed players in the box score · no shared shift totals available.</p>';
      return card(label+' '+(i+1),p.length?table(['Player','TOI / G','G / G','P / G','L5 SOG'],names.map(n=>{const q=findNamed(t,n);return q?[person(q),round(q.min),round(q.g,2),round(q.pts,2),round(mean(q.logs.slice(-5),r=>r[8]),2)]:[esc(n),'—','—','—','—'];}))+shares:esc(names.join(' · ')));
    });
    return teamBanner(t,'Projected Lineup')+'<h3 class="section-label">Forward Lines</h3>'+grid(1,make(a.forwards,'Line'))+'<h3 class="section-label">Defense Pairs</h3>'+grid(1,make(a.defense,'Pair'))+'<h3 class="section-label">Goalies</h3>'+tools(a.goalies.map((n,i)=>badge(n,i===0?'g':'')).join(''));
  };
  return slate({tall:true})+box('Line Matchups · '+g.a+' @ '+g.h,'<p class="subtle">Projected lines from <a href="https://www.nhl.com/news/nhl-lineup-projections-2026-27-season" target="_blank" rel="noopener">NHL.com</a>. Shared ice uses overlapping shifts in the previous five games where the league supplies shift charts.</p>'+grid(2,[render(g.a),render(g.h)]),'Projected lineups can change before puck drop.');
}
const mNames={'Best Plays':'Best Plays',Shots:'Shots on Goal',Goals:'Anytime Goals',Points:'Points',Saves:'Saves'};
const mlist=['Shots on Goal','Anytime Goals','Points','Saves'];
const getLog=(r,m)=>m==='Saves'?r[9]:m==='Shots on Goal'?r[8]:m==='Anytime Goals'?r[6]:r[6]+r[7];
const getAvg=(p,m)=>m==='Saves'?p.saves:m==='Shots on Goal'?p.sog:m==='Anytime Goals'?p.g:p.pts;
let teamMemo={archive:null,date:null,rows:[],by:{}};
function propModel(p,m,g){
  const avg=getAvg(p,m),o=g.a===p.team?g.h:g.a;
  if(teamMemo.archive!==archive()||teamMemo.date!==S.day){
    const rows=reg().map(seasonTeam);teamMemo={archive:archive(),date:S.day,rows,by:Object.fromEntries(rows.map(x=>[x.t,x]))};
  }
  const stat=teamMemo.by[o]||seasonTeam(o);
  const adj=(key)=>{const b=mean(teamMemo.rows.map(x=>x[key]).filter(x=>x!=null)),v=stat[key];return v&&b?Math.max(.78,Math.min(1.25,v/b)):1;};
  const base=m==='Saves'?adj('sf'):m==='Shots on Goal'?adj('sa'):adj('ga');
  const sample=p.logs.filter(x=>m!=='Saves'||x[11]),recent=mean(sample.slice(-5),r=>getLog(r,m));
  const proj=avg==null?null:(.82*avg+.18*(recent??avg))*base;
  return {avg,proj,recent,opp:o,match:base};
}
function propsPage(){
  const name=mNames[S.route.title],best=name==='Best Plays',goals=name==='Anytime Goals',saves=name==='Saves',shots=name==='Shots on Goal',adv=S.f.advanced;
  const pricing=S.f.pricing||'All players', conf=S.f.confirm||'All players',status=S.f.status||'All games';
  const list=[];
  for(const p of people()){
    const g=gamesFor(p.team);
    if(!g||S.game&&!S.f.allGames&&g.id!==S.game.id||S.f.search&&!p.name.toLowerCase().includes(S.f.search.toLowerCase()))continue;
    if(status==='Not started'&&(final(g)||liveGame(g))||status==='Live / final'&&!final(g)&&!liveGame(g))continue;
    if(S.f.skater==='Forwards'&&p.pos==='D'||S.f.skater==='Defense'&&p.pos!=='D')continue;
    if(conf!=='All players'&&conf!=='All goalies'&&!getLine(p))continue;
    for(const m of (best?S.f.markets||mlist:[name])){
      if((m==='Saves')!==p.goal)continue;
      const x=propOdds(p,m),f=propModel(p,m,g);
      if(pricing==='Priced only'&&x?.line==null||best&&x?.line==null)continue;
      if(S.f.zoneMatch==='Zone Match only'&&f.match<1.045)continue;
      const line=x?.line==null?(m==='Anytime Goals'?.5:m==='Shots on Goal'&&S.f.researchLine?+S.f.researchLine:null):+x.line;
      const up=line!=null?poissonTail(f.proj,Math.floor(line)+1):null,under=line!=null?1-poissonTail(f.proj,Math.ceil(line)):null;
      const overEdge=x?.over==null||up==null?null:up-implied(x.over),underEdge=x?.under==null||under==null?null:under-implied(x.under);
      const side=S.f.side==='Unders'?'Under':S.f.side==='Overs'||m==='Anytime Goals'||(overEdge??-1)>=(underEdge??-1)?'Over':'Under';
      const edge=side==='Over'?overEdge:underEdge,prob=side==='Over'?up:under,rating=edge==null?'—':edge>=.12?'Check':edge>=.06?'Play':edge>=.03?'Lean':'—';
      if(S.f.hideCheck&&rating==='Check'||S.f.plays&&(!edge||edge<.06)||+S.f.edge>0&&(edge??-1)*100<+S.f.edge)continue;
      list.push({p,g,m,x,line,side,edge,prob,rating,...f});
    }
  }
  list.sort((a,b)=>Number(final(a.g))-Number(final(b.g))||(b.edge??-1)-(a.edge??-1)||(b.proj??0)-(a.proj??0));
  const baseCols=best?['#','Player','Play','Rating','Chance','Fair','Odds','Good To','Edge','Notes','Puck Drop','Result']:
    ['#',saves?'Goalie':'Player',saves?'Starter':'Line',goals?'Anytime':'Play','Rating',...(goals?['Zone','G','xG']:name==='Points'?['P']:['AVG','PROJ']),'Fair','Edge','Result'];
  const extras=adv?['TOI','Last 5','Opp Adjustment','Games']:[], cols=[...baseCols,...extras];
  const rows=list.slice(0,S.f.more?list.length:100).map((f,i)=>{
    const {p,g,m,x,line,side,edge,prob,rating,avg,proj,recent,opp,match}=f,price=side==='Over'?x?.over:x?.under;
    const play=basePlay(p,m,g,{line,side,odds:price,average:avg,projection:proj,prob,edge,rating});
    const label=x?((side==='Over'?'o':'u')+line+' '+(price??'')):line!=null?(goals?'Goal':(side==='Over'?'o':'u')+line):'—';
    const res=(archive().logs?.[p.id]||[]).find(r=>r[0]===g.id);
    const end=res?getLog(res,m):null;
    const b=[i+1,person(p)],r=badge(rating,rating==='Play'?'g':rating==='Check'?'r':''),e=cell(edge==null?'—':signed(edge*100),heat(edge,0,.045));
    const body=best?[market(label,play),r,pct(prob),american(prob),esc(price??'—'),american(prob==null?null:prob-.03),e,esc(teamName(opp)),et(g),end??'—']:
      [badge(getLine(p)||'—',getLine(p)?'g':''),market(label,play),r,...(goals?[match>1.045?badge('Match','g'):'—',round(avg,2),round(proj,2)]:m==='Points'?[round(proj,2)]:[round(avg,2),cell(round(proj,2),heat(proj,line??avg,.25))]),american(prob),e,end??'—'];
    return {cls:final(g)||liveGame(g)?'dim':'',cells:[...b,...body,...(adv?[round(p.min),round(recent,2),signed((match-1)*100,0)+'%',p.gp]:[])]};
  });
  return slate({date:true,tall:true})+box('',`<details class="details"><summary>How the number is made, and how far to trust it</summary><p class="subtle">Season and recent averages are adjusted by the opposing team’s rates. The fair price is a Poisson estimate at the selected line; edge compares that estimate with the imported price.</p></details><h2 class="heading">${name} ${info('Click a player to see game-by-game results.')}${btn('YTD Model Performance','performance','NHL','outline')}</h2>`+
    tools((best?mlist.map(m=>btn((S.f.markets?.includes(m)??true?'✓ ':'')+m,'marketFilter',m,S.f.markets?.includes(m)??true?'on':'')).join(''):'')+
      (shots?select('Side','side',['Best side','Overs','Unders'],true)+select('Research line','researchLine',[['','None'],[.5,'0.5'],[1.5,'1.5'],[2.5,'2.5'],[3.5,'3.5'],[4.5,'4.5'],[5.5,'5.5']],true):'')+
      (!saves&&!best?select('Skaters','skater',['All skaters','Forwards','Defense'],true):'')+
      select(saves?'Starters':'Lineups','confirm',saves?['All goalies','Projected starter']:['All players','Projected lineup'],true)+
      select('Edge','edge',[[0,'Any edge'],...[3,5,7,10,15].map(n=>[n,n+'+ points'])],true)+
      (!best?select('Odds','pricing',['All players','Priced only'],true):'')+
      (goals?select('Zone Match','zoneMatch',['Everyone','Zone Match only'],true):'')+
      (shots?btn('Plays only','set','plays:1',S.f.plays?'on':'')+btn('Every line','set','plays:0',!S.f.plays?'on':''):'')+
      (goals||saves?btn('Check plays: '+(S.f.hideCheck?'Hidden':'Shown'),'flip','hideCheck'):'')+
      (!best?btn(adv?'Collapse advanced stats':'Expand advanced stats','flip','advanced'):''))+
    tools(toggles(['All games','Not started','Live / final'],'status')+btn(S.f.allGames?'Filter to a game':'Show entire slate','flip','allGames')+search())+
    '<p class="tiny">Line designations are projected. K marks a public Kalshi quote. A dash means no usable price or edge is available.</p>'+
    table(cols,rows,{sort:'nhl-props',wrap:'box',empty:'No plays match these filters. Market edges require an available player price.'})+
    (list.length>100?tools(btn(S.f.more?'Show fewer':'Show all '+list.length,'flip','more')):''));
}
const tabs=menus.nhl.Promos;
const promoTabs=()=>`<div class="tools">${tabs.map(([t,p,id])=>`<a class="pill ${S.route.id===id?'on':''}" href="${href(p)}" ${S.route.id===id?'aria-current="page"':''}>${t}</a>`).join('')}</div>`;
const multiGames=()=>S.games.filter(g=>(S.f.multi||S.games.map(x=>x.id)).includes(g.id));
const selectTimes=()=>tools([...new Set(S.games.map(et))].map(t=>btn(t+' ET '+S.games.filter(g=>et(g)===t).length,'multiTime',t,multiGames().every(g=>et(g)===t)&&multiGames().length?'on':'')).join(''));
const goalieCandidates=(t)=>{
  const raw=roster(t,true), officialNames=official(t)?.goalies||[];
  const p=officialNames.map(n=>findNamed(t,n,true)).find(Boolean)||[...raw].sort((a,b)=>(b.gs||0)-(a.gs||0))[0];
  return p;
};
function crease(){
  const gms=multiGames(),raw=gms.flatMap(g=>[g.a,g.h].map(t=>[goalieCandidates(t),g])).filter(x=>x[0]);
  const samples=raw.map(([p,g])=>{
    const mod=propModel(p,'Saves',g), s=seasonTeam(mod.opp).sf, l=p.logs.filter(r=>r[11]),sd=Math.sqrt(mean(l,r=>(r[9]-(mod.avg||0))**2)||0);
    return {p,g,opp:mod.opp,sf:s,proj:s!=null&&p.sv!=null?mean([s*p.sv,mod.proj].filter(x=>x!=null)):mod.proj,sd:Math.max(4,sd)};
  }).filter(x=>x.proj!=null);
  const share=leaderShares(samples.map(x=>({...x,id:x.p.id})),x=>x.proj,x=>x.sd);
  const rows=samples.sort((a,b)=>share.get(b.p.id)-share.get(a.p.id)).map(({p,g,opp,sf,proj})=>{
    const o=propOdds(p,'Saves'),l=p.logs.filter(r=>r[11]),results=(archive().logs?.[p.id]||[]).find(r=>r[0]===g.id);
    return [person(p),o?.line??'—',round(p.saves),pct(p.sv,1),Math.max(0,...l.map(r=>r[9]||0)),team(opp),round(sf),round(sf),cell(round(proj),heat(proj,25,4)),pct(poissonTail(proj,35)),cell(pct(share.get(p.id),1),heat(share.get(p.id),.08,.045)),o?.line!=null?signed(proj-o.line):'—',results?.[9]??'—'];
  });
  return promoTabs()+slate({multi:true,tall:true})+box('King of the Crease',tools(`<span class="subtle">${samples.length} goalie candidates · based on NHL projected lineups and recent starts</span>`+btn('Save image','export','King of the Crease','primary right'))+
    table(['Goalie','Line','SV/GS','SV%','High','Opp','Shots / G','Shots','Saves','35+','Lead the Day','vs His Line','Result'],rows,{sort:'crease',wrap:'box',groups:[group('',1),group('Market',1),group('His Season',3),group('Matchup',2),group('Tonight',2),group('Upside',2),group('Value',1),group('Result',1)]}),'Saves projections blend the goalie’s record with the opponent’s shot volume. Lead share accounts for ties.')+
    box('Winners',history('crease',18));
}
function openRecords(){
  return Object.entries(archive().opening||{}).filter(([id,[date]])=>date<S.day).map(([id,[date,a,h,goals]])=>({id,date,a,h,goals:[...goals].sort((x,y)=>x[2]-y[2])}));
}
function iceAndHat(ice=true){
  const selected=multiGames(),active=new Set(selected.flatMap(g=>[g.a,g.h])),scope=S.f.teamFilter;
  const all=people().filter(p=>active.has(p.team)&&!p.goal), op=openRecords(), so=allShotRows();
  const st=[...active].map(t=>{
    const g=selected.find(g=>g.a===t||g.h===t), o=g.a===t?g.h:g.a, a=seasonTeam(t),b=seasonTeam(o);
    const q=op.filter(r=>r.a===t||r.h===t), start=q.filter(r=>r.goals[0]?.[0]===t);
    const quick=div(total(so.filter(([id])=>q.some(x=>x.id===id)),([,rows])=>rows.filter(r=>r[0]===t&&r[2]<=300&&r[5]).length),q.length);
    const val=ice?(div(start.length+1,q.length+2)||.5)*Math.sqrt(Math.max(.01,(a.gf??3)*(b.ga??3))):Math.sqrt((a.gf??3)*(b.ga??3));
    return {t,g,o,a,b,val,q,start,quick};
  }).sort((a,b)=>b.val-a.val);
  const denom=total(st,x=>x.val), by=Object.fromEntries(st.map(x=>[x.t,x]));
  const ranking=all.filter(p=>!scope||p.team===scope).map(p=>{
    const x=by[p.team],l=p.logs, avg=p.g||0,opGoals=x.q.flatMap(r=>r.goals.filter(g=>g[0]===p.team&&g[2]<=600)),quick=opGoals.filter(g=>String(g[1])===p.id).length;
    const teamPct=div(x.val,denom), pctTeam=div(quick+avg,opGoals.length+(x.a.gf||3)), proj=avg*x.val/(x.a.gf||3);
    return {p,x,avg,quick,teamPct,pctTeam,proj,model:ice?(teamPct||0)*(pctTeam||0):proj};
  }).sort((a,b)=>b.model-a.model);
  const totalHat=people().filter(p=>!p.goal).reduce((s,p)=>s+p.logs.filter(x=>x[6]>=3).length,0);
  const totals=ice?'':grid(4,[metric('Hat Tricks',totalHat),metric('Games',archive().boxGames??'—'),metric('Players with a Hat Trick',people().filter(p=>!p.goal&&p.logs.some(r=>r[6]>=3)).length),metric('2+ Goal Games',people().filter(p=>!p.goal).reduce((s,p)=>s+p.logs.filter(r=>r[6]>=2).length,0))]);
  const title=ice?'Icebreaker':'King of the Hat Trick';
  const teamCols=ice?['Team','Chance','Top Skaters','1st Goal','Time','SOG 0–5','Opp Allows']:['Team','xG','Total','GF/GP','5+ G','2G','HT','PP%','GA/GP','5+ GA','Goalie','SV%'];
  const teamRows=st.map(x=>{
    const {t,g,o,a,b,q,start,quick,val}=x, goal=goalieCandidates(o),games=before(t),vs=before(o);
    const scored=(g,tm)=>g.a===tm?g.sa:g.sh;
    const left=btn(team(t)+' '+(g.a===t?'@':'vs')+' '+logo(o),'teamPromo',t,scope===t?'on':'');
    return ice?[left,cell(pct(div(val,denom),1),heat(div(val,denom),.065,.025)),esc(ranking.filter(r=>r.p.team===t).slice(0,3).map(r=>r.p.name.split(' ').at(-1)).join(', ')),start.length+'/'+q.length,round(mean(start,r=>r.goals[0][2]/60),1)+' min',round(quick),round(b.ga,2)]:
      [left,round(val,2),g.odds?.total??'—',round(a.gf,2),games.filter(r=>scored(r,t)>=5).length,roster(t).reduce((s,p)=>s+p.logs.filter(r=>r[6]>=2).length,0),roster(t).reduce((s,p)=>s+p.logs.filter(r=>r[6]>=3).length,0),pct(a.pp,1),round(b.ga,2),vs.filter(r=>scored(r,r.a===o?r.h:r.a)>=5).length,esc(goal?.name||'—'),pct(goal?.sv,1)];
  });
  const players=ice?['Player','Line','Chance','1 in','Of Team','First 10 G','SOG','TOI']:['Player','Line','xG','GP','G','G/GP','2G','HT','L10','PPG','TOI','PP TOI','SOG','Slot','Opp GA','Goalie','Result'];
  const rows=ranking.slice(0,S.f.more?500:40).map(({p,x,avg,model,quick,pctTeam,proj})=>{
    const goal=goalieCandidates(x.o),slot=shotsFor(p.team).filter(r=>String(r[1])===p.id&&zone(r)===areas[0]).length, res=(archive().logs?.[p.id]||[]).find(r=>r[0]===x.g.id);
    return ice?[person(p),badge(getLine(p)||'—'),cell(pct(model,1),heat(model,.012,.007)),model>0?Math.round(1/model):'—',pct(pctTeam,1),quick,round(p.sog),round(p.min)]:
      [person(p),badge(getLine(p)||'—'),cell(round(proj,2),heat(proj,.38,.16)),p.gp,total(p.logs,r=>r[6]),round(avg,2),p.logs.filter(r=>r[6]>=2).length,p.logs.filter(r=>r[6]>=3).length,total(p.logs.slice(-10),r=>r[6]),p.stats.ppGoals??'—',round(p.min),round(div(mean(p.logs,r=>r[12]),60)),round(p.sog),slot,round(x.b.ga,2),esc(goal?.name||'—'),res?.[6]??'—'];
  });
  return promoTabs()+`<h1>${title} ${info(ice?'The score uses the team’s first-goal frequency and each skater’s share of early goals.':'Expected goals use each skater’s scoring rate and the matchup’s goal environment.')}</h1>`+
    (ice?tools(btn('Historical Data','history','ice')):'')+
    box('',slate({navOnly:true})+(ice?selectTimes():'')+tools(btn('All games','allmulti','')+btn('Clear','clearmulti','')+selected.length+' games · '+all.length+' skaters')+
      `<div class="chips">${S.games.map(g=>btn((selected.includes(g)?'✓ ':'+ ')+logo(g.a)+' @ '+logo(g.h)+' '+et(g),'multi',g.id,selected.includes(g)?'on':'')).join('')}</div>`)+
    tools(btn('Save image','export',title,'primary'))+totals+box(ice?'Teams':'Teams Tonight',table(teamCols,teamRows,{sort:'promo-teams',cls:'compact'}))+
    box('Players',(scope?tools(btn('Clear '+scope,'teamPromo',scope,'on')):'')+table(players,rows,{sort:'promo-skaters',cls:'compact'})+tools(btn(S.f.more?'Show less':'Show all','flip','more')))+
    box(ice?'Winners':'Hat Tricks This Season',history(ice?'ice':'hat',30))+(ice?'':box('Defenses Giving Up 2+ To One Player',table(['Defense','GP','GA/GP','2G','HT'],reg().map(t=>{
      const x=seasonTeam(t),l=people().flatMap(p=>p.logs.filter(r=>r[3]===t&&r[6]>=2));
      return [team(t),x.gp,round(x.ga,2),l.length,l.filter(r=>r[6]>=3).length];
    }).sort((a,b)=>b[3]-a[3]),{sort:'hat-defense'})));
}
function history(mode,max=50){
  if(mode==='ice'){
    const days=new Map();
    for(const q of openRecords()){const r=q.goals[0];if(r&&(!days.has(q.date)||days.get(q.date).r[2]>r[2]))days.set(q.date,{q,r});}
    return table(['Day','Broke the Ice','When','Game'],[...days].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,max).map(([d,{q,r}])=>[esc(d),person(people().find(x=>x.id===String(r[1])))?.html||'—',Math.floor(r[2]/60)+':'+String(r[2]%60).padStart(2,'0'),versus(q)]),{sort:'ice-history',cls:'compact'});
  }
  if(mode==='hat'){
    return table(['Day','Hat Trick','VS','Goals'],people().filter(p=>!p.goal).flatMap(p=>p.logs.filter(r=>r[6]>=3).map(r=>[p,r])).sort((a,b)=>b[1][1].localeCompare(a[1][1])).slice(0,max).map(([p,r])=>[esc(r[1]),person(p),team(r[3]),r[6]]),{sort:'hat-history',cls:'compact'});
  }
  const days=new Map();
  for(const p of people().filter(p=>p.goal))for(const r of p.logs){if(r[9]!=null&&(!days.has(r[1])||days.get(r[1])[1][9]<r[9]))days.set(r[1],[p,r]);}
  return table(['Day','Goalie','Saves','Shots Against','Opp'],[...days].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,max).map(([d,[p,r]])=>[esc(d),person(p),r[9],r[10],team(r[3])]),{sort:'crease-history',cls:'compact'});
}
export function nhlPlayer(id){
  const p=people().find(p=>p.id===id);if(!p)return;
  const m=p.goal?'Saves':mNames[S.route.title]&&S.route.title!=='Best Plays'?mNames[S.route.title]:'Shots on Goal',o=propOdds(p,m);
  dialog(p.name,teamBanner(p.team,p.pos)+tools(market(o?.line==null?'Save '+m:o.line+' '+(o.over||''),basePlay(p,m,undefined,{line:o?.line,odds:o?.over,side:'Over'})))+
    table(p.goal?['Date','Opp','TOI','Saves','SA','SV%']:['Date','Opp','TOI','G','A','PTS','SOG'],[...p.logs].reverse().map(r=>[esc(r[1]),team(r[3]),round(div(r[5],60)),...(p.goal?[r[9],r[10],pct(div(r[9],r[10]),1)]:[r[6],r[7],r[6]+r[7],r[8]])])),true);
}
export function nhlAction(act,v){if(act==='history'){dialog('Historical Data',history(v,100),true);return true;}return false;}
export function nhlPage(){return ({'nhl-preview':hPreview,'nhl-lines':hLines,'nhl-props':propsPage,crease,ice:()=>iceAndHat(true),hat:()=>iceAndHat(false)})[S.route.id]();}
export function nhlResult(p){
  const row=(archive().logs?.[p.id]||[]).find(x=>x[0]===p.game);
  return row?getLog(row,p.market)??null:null;
}
