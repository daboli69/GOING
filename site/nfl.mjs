import { nflTeams } from './config.mjs';
import {total,mean,round,pct,div,rate,heat,american,implied,signed,seasonLimit,poissonTail} from './math.mjs';
import {current as S,esc,box,grid,card,metric,logo,color,team,teamName,teamBanner,table,cell,group,tools,btn,toggle,toggles,select,search,info,empty,slate,hero,versus,injuryList,oddsNote,notes,person,market,basePlay,propOdds,gameDay,final,local,dialog,badge,playCheck,propQuotes,keep} from './ui.mjs';
import {allowedRanks,format as fmt} from './parlay-core.mjs';
import {markets as parlayMarkets,tdMarkets,badWeather} from './nfl-parlay-engine.mjs';
import {bucket,isRush,offenseTd,bucketRates,impliedPoints,impliedTds,rushShare,anytime,firstTdChance,shrink,log5,tdRegression,tdSettings} from './nfl-td.mjs';
import {tdBoardPage,tdBoardAction} from './nfl-td-board.mjs';
import {nflParlayPage,nflParlayAction} from './nfl-parlays.mjs';

const names=Object.keys(nflTeams).sort((a,b)=>nflTeams[a][0].localeCompare(nflTeams[b][0]));
let statsMemo={archive:null,week:null,value:new Map()};
const matchup=()=>[S.f.away||S.game?.a||'WAS',S.f.home||S.game?.h||'NYG'];
const allGames=()=>S.data.schedule||[];
const position=p=>p==='FB'?'RB':p;
const skills=['QB','RB','WR','TE'];
const pool=(t,lim='Season')=>seasonLimit(allGames().filter(g=>+g.id.slice(0,4)===S.year&&g.week<S.week&&(g.a===t||g.h===t)&&S.data.events?.[g.id]).sort((a,b)=>a.week-b.week),lim);
const logs=(t,lim)=>pool(t,lim).map(g=>{
  const all=S.data.events[g.id],o=g.a===t?g.h:g.a;
  return {g,o,all,off:all.filter(p=>p[0]===t),def:all.filter(p=>p[0]===o),first:all.find(p=>p[8])};
});
const getPlayer=(id,t)=>{const p=S.data.players?.[id]||[];return {id,name:p[0]||'Unknown player',pos:position(p[1]),img:p[2],team:t};};
const tdKind=p=>p[22]||!['run','pass'].includes(p[1])||p[8]!==p[0]?'DST':p[1];
const tdDist=p=>Math.max(0,tdKind(p)==='DST'?Number(p[23]?.match(/(\d+)[ -]yard/)?.[1]||p[2]):p[2]);
function stats(t,against=false){
  if(statsMemo.archive!==S.data||statsMemo.week!==S.week)statsMemo={archive:S.data,week:S.week,value:new Map()};
  const key=t+':'+against;
  if(statsMemo.value.has(key))return statsMemo.value.get(key);
  const list=logs(t),td=[],pl=[],first=[],red=[];
  for(const q of list){
    const tm=against?q.o:t, picks=against?q.def:q.off;
    td.push(...q.all.filter(p=>p[8]===tm));
    pl.push(...picks.filter(p=>p[1]==='pass'||p[1]==='run'));
    if(q.first?.[8]===tm)first.push(q.first);
    red.push(...new Set(picks.filter(p=>p[3]!=null&&p[3]<=20&&['run','pass'].includes(p[1])).map(p=>q.g.id+':'+p[6])));
  }
  const offense=td.filter(p=>tdKind(p)!=='DST');
  const result={list,td,pl,first,red,offense,gp:list.length};
  statsMemo.value.set(key,result);return result;
}
function tdPos(p){
  if(tdKind(p)==='DST')return 'DST';
  return getPlayer(p[9]).pos;
}
function tdValues(t,against,mode){
  const s=stats(t,against),{td,first,red,offense,gp}=s;
  const n=(label,c,den)=>[label,c,den?c/den:null];
  if(mode==='type')return [
    n('Pass TD',td.filter(p=>tdKind(p)==='pass').length,gp),
    n('Rush TD',td.filter(p=>tdKind(p)==='run').length,gp),
    n('Total TD',offense.length,gp),n('DST TD',td.length-offense.length,gp),n('First TD',first.length,gp)
  ];
  if(mode==='pos')return [...skills,'DST'].map(k=>n(k,td.filter(p=>tdPos(p)===k).length,offense.length));
  return [[0,10,'≤10 yd'],[11,20,'11–20 yd'],[21,40,'21–40 yd'],[41,100,'41+ yd']].map(([a,b,k])=>n(k,offense.filter(p=>tdDist(p)>=a&&tdDist(p)<=b).length,offense.length))
    .concat([['RZ %',red.length,div(offense.filter(p=>p[3]!=null&&p[3]<=20).length,red.length)]]);
}
function tdCompare(t,o,m){
  const a=tdValues(t,false,m), b=tdValues(o,true,m);
  const lg=[false,true].map(d=>names.map(t=>tdValues(t,d,m)));
  const classify=(v,i,d)=>{
    const row=lg[Number(d)].map(x=>x[i][2]).filter(x=>x!=null).sort((a,b)=>a-b);
    if(v==null||!row.length)return 'none';
    const low=row[Math.floor(row.length*.30)],hi=row[Math.floor(row.length*.68)];
    return v<=low&&v<hi?(d?'good heat':'bad heat'):v>=hi&&v>low?(d?'bad heat':'good heat'):'mid heat';
  };
  const format=(z,k)=>m!=='type'||k===4?pct(z):round(z,2);
  return table(['',{t:logo(t)+' OFF',span:2,cls:'teamhead',style:'--team:'+color(t)},{t:logo(o)+' DEF',span:2,cls:'teamhead',style:'--team:'+color(o)},'ADV'],
    a.map(([label,x,p],k)=>{const [,y,q]=b[k];const av=classify(p,k,false),dv=classify(q,k,true);
      return [cell(esc(label),'plain'),cell(x,av),cell(format(p,k),av),cell(y,dv),cell(format(q,k),dv),cell(av.startsWith('good')&&dv.startsWith('bad')?logo(t):'--','none')];}),
    {extra:['','Total',m==='type'?'Per Game':'%','Total',m==='type'?'Per Game':'%','']});
}
function footballPlayers(t){
  const set={};
  for(const q of logs(t)){
    const game={};
    const rec=(id)=>id?(game[id]??={id,targets:0,mid:0,rec:0,recY:0,yac:0,air:0,rush:0,rushY:0,pass:0,passY:0,comp:0,td:0,first:0,rz:0,rzFirst:0,rzRush:0,rzTgt:0,l20:0,l40:0,long:0,depth:[0,0,0,0],lanes:{},passZones:{}}):null;
    let beforeFirst=true;
    for(const p of q.all){
      if(p[0]===t&&p[1]==='pass'){
        // p[28] marks a sack: a dropback, not an official pass attempt.
        const passer=rec(p[10]);if(passer&&!p[28]){passer.pass++;passer.comp+=p[15];passer.passY+=p[15]?p[2]:0;passer.passZones[p[18]||'middle']=(passer.passZones[p[18]||'middle']||0)+1;}
        const r=rec(p[11]);if(r){r.targets++;r.rec+=p[15];if(p[18]==='middle')r.mid++;r.recY+=p[15]?p[2]:0;r.yac+=p[14]||0;r.air+=p[13]||0;
          const dep=p[13]??0;r.depth[dep>=20?0:dep>=10?1:dep>=0?2:3]++;
          if(p[3]!=null&&p[3]<=20){r.rz++;r.rzTgt++;if(beforeFirst)r.rzFirst++;}
          if(p[15]&&p[2]>=20)r.l20++;if(p[15]&&p[2]>=40)r.l40++;
        }
      }
      if(p[0]===t&&p[1]==='run'){
        const r=rec(p[12]);if(r){r.rush++;r.rushY+=p[2];r.lanes[p[19]||'middle']=(r.lanes[p[19]||'middle']||0)+1;
          if(p[3]!=null&&p[3]<=20){r.rz++;r.rzRush++;if(beforeFirst)r.rzFirst++;}
          if(p[2]>=20)r.l20++;if(p[2]>=40)r.l40++;
        }
      }
      if(p[8]===t){
        const r=rec(p[9]);if(r){r.td++;if(beforeFirst)r.first++;r.long=Math.max(r.long,tdDist(p));}
      }
      if(p[8])beforeFirst=false;
    }
    for(const [id,r] of Object.entries(game))(set[id]??=[]).push({...r,game:q.g.id,date:q.g.date,opponent:q.o});
  }
  return Object.entries(set).map(([id,l])=>({...getPlayer(id,t),logs:l,gp:l.length}));
}
const rowsFor=t=>footballPlayers(t).filter(p=>total(p.logs,g=>g.td)>0).sort((a,b)=>total(b.logs,g=>g.td)-total(a.logs,g=>g.td)||a.name.localeCompare(b.name));
const chooseTeams=(short=false)=>`<div class="selectrow">${select('Away','away',names.map(t=>[t,short?t:teamName(t)]))}${select('Home','home',names.map(t=>[t,short?t:teamName(t)]))}</div>`;
const matchupWait=()=>!S.game&&!S.f.away;
const tdPlayers=(t,first=false)=>teamBanner(t)+table(first?['Player','Pos','First TD','RZ Tgt','RZ Rush','Before First TD']:['Player','Pos','TDs','1st TDs'],
  (first?footballPlayers(t).filter(p=>total(p.logs,x=>x.rzFirst||x.first)).sort((a,b)=>total(b.logs,x=>x.rzFirst)-total(a.logs,x=>x.rzFirst)):rowsFor(t)).slice(0,15).map(p=>{
    const g=first?'First TD':'Anytime TD',o=propOdds(p,g),pl=basePlay(p,g,undefined,{line:o?.line,odds:o?.over,side:'Over'});
    return first?[person(p,false),esc(p.pos),cell(market(total(p.logs,r=>r.first),pl)),total(p.logs,r=>r.rzTgt),total(p.logs,r=>r.rzRush),total(p.logs,r=>r.rzFirst)]:
      [person(p,false),esc(p.pos),cell(market(total(p.logs,r=>r.td),pl)),total(p.logs,r=>r.first)];
  }),{sort:'nfltd-'+t});
function targets(t,o){
  const vals=['type','pos','dist'].map(m=>{
    const a=tdValues(t,false,m),b=tdValues(o,true,m);return a.filter((x,i)=>x[2]!=null&&b[i][2]!=null&&x[1]>0&&b[i][1]>0).sort((x,y)=>y[2]-x[2]).slice(0,2).map(x=>x[0]);
  });
  return card(versus({a:t,h:o}),`<div class="chips">${vals.map((list,i)=>badge(['TYPE','POSITION','DISTANCE'][i]+': '+(list.join(' · ')||'—'),i?'g':'')).join('')}</div><p class="tiny">Season scoring distribution and opposing defense</p>`);
}
function tdPage(){
  const [a,h]=matchup(),v=S.f.view||'Season TDs';
  const top=slate()+chooseTeams()+tools(toggles(['Season TDs','First TD','Summary'],'view'));
  if(matchupWait())return top+box('',empty('Choose a matchup to see touchdown data.'));
  if(v==='Summary')return top+box('Touchdown Summary',tools(btn('Save image','export','Touchdown Summary','primary')+btn('Pick players','pickplayers','')+btn(S.f.hideRail?'Show TD Odds':'Hide TD Odds','flip','hideRail'))+hero(S.game)+grid(2,[targets(a,h),targets(h,a)])+(S.f.hideRail?'':grid(2,[tdPlayers(a),tdPlayers(h)])))+notes();
  if(v==='First TD'){
    const opportunities=(t,o)=>{
      const x=stats(t),y=stats(o,true);
      return card(versus({a:t,h:o}),table(['Metric','Offense','Defense'],[['Scored first',pct(rate(x.list,g=>g.first?.[8]===t)),pct(div(y.first.length,y.gp))],['First TD pass',x.first.filter(p=>tdKind(p)==='pass').length,y.first.filter(p=>tdKind(p)==='pass').length],['First TD rush',x.first.filter(p=>tdKind(p)==='run').length,y.first.filter(p=>tdKind(p)==='run').length],['Avg. time to first TD',round(mean(x.first,p=>(3600-p[5])/60),1)+' min',round(mean(y.first,p=>(3600-p[5])/60),1)+' min']]));
    };
    return top+box('First TD Basics',grid(2,[opportunities(a,h),opportunities(h,a)]))+box('Opportunities',grid(2,[targets(a,h),targets(h,a)]))+box('First TD Targets',grid(2,[tdPlayers(a,true),tdPlayers(h,true)]))+box('Red Zone Usage Before First TD',grid(2,[tdPlayers(a,true),tdPlayers(h,true)]))+notes();
  }
  return top+box('Touchdowns: Type, Position & Distance',grid(3,['type','pos','dist'].map((m,i)=>`<div><h3 class="section-label">${['TD Type','TD Position','TD Distance'][i]}</h3>${tdCompare(a,h,m)}<div class="flat">${tdCompare(h,a,m)}</div></div>`))+`<h3 class="section-label">Targets</h3>`+grid(2,[targets(a,h),targets(h,a)]))+box('Player Touchdowns',grid(2,[tdPlayers(a),tdPlayers(h)]))+notes();
}
const tdOrFg=p=>tdKind(p)!=='DST'&&p[8]&&p[8]===p[0];
function opening(t,def=false,lim='Season',scope='Opening Drive'){
  return logs(t,lim).map(g=>{
    const team=def?g.o:t, source=def?g.def:g.off;
    const plays=source.filter(p=>p[6]!=null&&['pass','run','field_goal','punt','no_play','qb_kneel','qb_spike'].includes(p[1]));
    const firstDrive=plays.find(p=>['pass','run','punt','field_goal'].includes(p[1]))?.[6];
    const list=scope==='Opening Drive'?plays.filter(p=>p[6]===firstDrive):scope==='First Half'?plays.filter(p=>p[4]<=2):plays;
    const set=[...new Map(list.map(p=>[p[6],p])).values()];
    const result=p=>p[7]==='Touchdown'?'TD':/field goal/i.test(p[7])?'FG Att':p[7]==='Punt'?'Punt':'Other';
    return {g:g.g,o:g.o,team,drives:set.map(result),plays:list.filter(p=>['pass','run'].includes(p[1])).length,yards:total(list,p=>['pass','run'].includes(p[1])?p[2]:0)};
  });
}
const driveTypes=['TD','FG Att','Punt','Other'];
const driveRate=(rows,key)=>div(total(rows,r=>r.drives.filter(d=>d===key).length),total(rows,r=>r.drives.length));
function drivesPage(){
  const [a,h]=matchup(),span=S.f.view||'Opening Drive',lim=S.f.window||'Season';
  const list=(t,d)=>opening(t,d,lim,span), aa=list(a),ah=list(h,true),ha=list(h),hh=list(a,true);
  const cap=span==='Opening Drive'?'Opening Drives':span;
  const match=table(['',...[a,h].flatMap(t=>{const o=t===a?h:a;return [{t:logo(t)+' '+t+' Offense',cls:'teamhead',style:'--team:'+color(t)},{t:logo(o)+' '+o+' Defense',cls:'teamhead',style:'--team:'+color(o)},'Fair'];})],driveTypes.map(k=>{
    const cells=(x,y)=>{const z=driveRate(x,k),w=driveRate(y,k);return [cell(pct(z),heat(z,.31,.12)),cell(pct(w),heat(w,.31,.12)),american(mean([z,w].filter(v=>v!=null)))];};
    return [btn(k,'driveDetail',k,'outline'),...cells(aa,ah),...cells(ha,hh)];
  }),{cls:'compact',groups:[group('',1),group(cap,6)]});
  const all=table(['Team','G',...driveTypes,...driveTypes,'3 & Out Off','3 & Out Def','Plays','Yards'],names.map(t=>{
    const a=list(t),b=list(t,true);return [team(t),a.length,...[a,b].flatMap(q=>driveTypes.map(k=>cell(pct(driveRate(q,k)),heat(driveRate(q,k),.32,.14)))),pct(rate(a,r=>r.plays<=3&&r.drives[0]==='Punt')),pct(rate(b,r=>r.plays<=3&&r.drives[0]==='Punt')),round(mean(a,r=>r.plays),1),round(mean(a,r=>r.yards),1)];
  }),{sort:'drives',groups:[group('',2),group('Offense: '+span,4),group('Defense: Opponent '+span,4),group('Drive length',4)]});
  return slate({tall:true,primetime:true})+box('Opening Drive Tool',`<p class="callout">Compare how both teams start games. Change the sample or look at the first half and full game to see whether an opening-drive tendency holds up.</p>`+
    tools(toggles(['Opening Drive','First Half','Full Game'],'view')+select('Games','window',['Season','Last 3','Last 5','Last 8'])+`<span class="right"></span>`+select('Matchup','away',names)+select('@','home',names))+match+
    `<div class="flat">${table(['',team(a),team(h)],[['Average plays',round(mean(aa,x=>x.plays)),round(mean(ha,x=>x.plays))],['Average yards',round(mean(aa,x=>x.yards)),round(mean(ha,x=>x.yards))],['Three and out',pct(rate(aa,x=>x.plays<=3&&x.drives[0]==='Punt')),pct(rate(ha,x=>x.plays<=3&&x.drives[0]==='Punt'))]],{cls:'compact'})}</div>`,'Drive results come from official play-by-play. Fair odds average the two observed rates.')+box('All Teams',all);
}
function gameLines(g){
  const o=g?.odds||{spread:g?.spread,total:g?.total,am:g?.am,hm:g?.hm,details:g?.spread!=null?g.h+' '+signed(-g.spread):null};
  return {spread:o.details??'—',total:o.total??'—',ml:o.am!=null||o.hm!=null?`${g.a} ${o.am??'—'} / ${g.h} ${o.hm??'—'}`:'—',o};
}
function recent(t){
  return table(['WK','OPP','Half','Final','W/L','Spread','ATS','Total','O/U'],pool(t).slice(-6).reverse().map(g=>{
    const home=g.h===t,o=home?g.a:g.h,score=home?g.sh:g.sa,vs=home?g.sa:g.sh,spread=g.spread==null?null:home?-g.spread:g.spread;
    const q=(S.data.events[g.id]||[]).filter(p=>p[4]<=2&&p[8]);
    return [g.week,team(o),q.length?`${q.filter(p=>p[8]===t).length}–${q.filter(p=>p[8]===o).length} TD`:'—',`${score}–${vs}`,badge(score>vs?'W':score===vs?'T':'L',score>vs?'g':'r'),signed(spread),spread==null?'—':score-vs+spread>0?'W':score-vs+spread<0?'L':'P',g.total??'—',g.total==null?'—':score+vs>g.total?'O':score+vs<g.total?'U':'P'];
  }));
}
function scheme(t,def=false){
  const s=stats(t,def),p=s.pl, pass=p.filter(x=>x[1]==='pass'),run=p.filter(x=>x[1]==='run');
  return {s,p,pass,run,yd:div(total(p,x=>x[2]),s.gp),passyd:div(total(pass,x=>x[2]),s.gp),rushyd:div(total(run,x=>x[2]),s.gp),
    epa:mean(p.filter(x=>x[17]!=null),x=>x[17]),suc:mean(p.filter(x=>x[16]!=null),x=>x[16]),ypp:mean(p,x=>x[2]),throw:div(pass.length,p.length),ppg:mean(s.list,x=>def?(x.g.a===t?x.g.sh:x.g.sa):(x.g.a===t?x.g.sa:x.g.sh))};
}
const schemeFields=[['Points','ppg',22],['Total Yards','yd',330],['Pass Yards','passyd',215],['Rush Yards','rushyd',110],['Yards / Play','ypp',5.4],['EPA / Play','epa',0],['Success Rate','suc',.44],['Pass Rate','throw',.56]];
function schemeTable(a,b,adjust=false){
  const vals=scheme(a),defs=scheme(b,true);
  return table(['Per Game',logo(a)+' Off',logo(b)+' Def','ADV'],schemeFields.map(([n,k,avg])=>{
    let x=vals[k],y=defs[k];
    if(adjust&&x!=null&&y!=null){
      const oppositionA=mean(vals.s.list.map(q=>scheme(q.o,true)[k]).filter(v=>v!=null));
      const oppositionB=mean(defs.s.list.map(q=>scheme(q.o,false)[k]).filter(v=>v!=null));
      x=oppositionA==null?x:x-(oppositionA-avg);y=oppositionB==null?y:y-(oppositionB-avg);
    }
    const f=v=>['suc','throw'].includes(k)?pct(v,1):round(v,k==='epa'?3:1),tol=Math.abs(avg)*.08||.07;
    return [esc(n),cell(f(x),heat(x,avg,tol)),cell(f(y),heat(y,avg,tol,true)),cell(x>avg+tol&&y>avg+tol?logo(a):'--','none')];
  }));
}
function nflPreview(){
  const g=S.game,a=g?.a,h=g?.h;
  const top=slate()+hero(g);
  if(!g)return top;
  const v=S.f.view||'Full Preview';
  const header=tools(btn('‹','gameStep',-1,'sq')+`<span class="period-label">Game ${S.games.indexOf(g)+1} of ${S.games.length}</span>`+btn('›','gameStep',1,'sq'),'center')+tools(toggles(['Full Preview','Build Your Model','Summary'],'view'));
  const o=gameLines(g),weights=local('nfl-model',{Offense:35,Defense:35,'Recent form':20,'Home field':10});
  const statsBox=box('General Stats & Scheme',tools(toggles(['Raw Stats','vs Opponents'],'scheme'))+grid(2,[schemeTable(a,h,S.f.scheme==='vs Opponents'),schemeTable(h,a,S.f.scheme==='vs Opponents')]),'Success rate is the share of plays with positive expected points added. Opponent adjustment compares each team with the opponents it faced.');
  const picks=pickTracker(g,o);
  if(v==='Build Your Model'){
    const x=scheme(a),y=scheme(h),w=Object.values(weights).reduce((a,b)=>a+b,0)||1;
    const score=((y.ppg-x.ppg)*weights.Offense+(scheme(a,true).ppg-scheme(h,true).ppg)*weights.Defense+(mean(pool(h).slice(-3),q=>q.h===h?q.sh-q.sa:q.sa-q.sh)-mean(pool(a).slice(-3),q=>q.h===a?q.sh-q.sa:q.sa-q.sh))*weights['Recent form']+2.5*weights['Home field'])/w;
    return top+header+box('Build Your Model',`<p class="subtle">Set the weights used for this matchup. The projection uses season scoring, points allowed, recent margin, and home field.</p>`+grid(2,Object.entries(weights).map(([k,val])=>card(esc(k),`<label class="field"><input type="range" min="0" max="100" value="${val}" data-weight="${esc(k)}" aria-label="${esc(k)}"> <output>${val}</output></label>`)))+`<p>${metric('Projected home margin',signed(score,1),teamName(h))}</p>`)+statsBox+picks+notes();
  }
  if(v==='Summary')return top+header+box('Game Summary',tools(btn('Save image','export','NFL Game Preview','primary'))+grid(3,[metric('Spread',esc(o.spread)),metric('Total',esc(o.total)),metric('Moneyline',esc(o.ml))]))+statsBox+notes();
  return top+header+box('Injuries','<p class="subtle">From the most recent ESPN report on file.</p>'+grid(2,[card(a,injuryList(a)),card(h,injuryList(h))]))+
    box('Odds',grid(3,[metric('Spread',esc(o.spread)),metric('Total',esc(o.total)),metric('Moneyline',esc(o.ml))]))+
    box('Recent Games',grid(2,[teamBanner(a)+recent(a),teamBanner(h)+recent(h)]))+statsBox+picks+notes();
}
function pickTracker(g,o){
  const picks=local('picks',{}),p=picks[g.id]||{};
  const items=[
    ['Spread',[g.a+' '+signed(o.o.spread),g.a,o.o.spread,o.o.ao],[g.h+' '+signed(o.o.spread==null?null:-o.o.spread),g.h,o.o.spread==null?null:-o.o.spread,o.o.ho]],
    ['Total',['Over '+o.total,'Over',o.o.total,o.o.over],['Under '+o.total,'Under',o.o.total,o.o.under]],
    ['Moneyline',[g.a+' '+(o.o.am??'—'),g.a,0,o.o.am],[g.h+' '+(o.o.hm??'—'),g.h,0,o.o.hm]]
  ];
  const hist=Object.entries(picks).flatMap(([id,v])=>{
    const g=allGames().find(x=>x.id===id);
    return Object.entries(v).filter(([,x])=>x.label).map(([k,x])=>{
      let grade='Pending';
      if(g&&final(g)){
        const t=x.label.split(' ')[0],line=k==='Total'||k==='Spread'?Number(x.label.split(' ').at(-1)):0;
        const margin=k==='Total'?(g.sa+g.sh-line)*(t==='Under'?-1:1):(t===g.a?g.sa-g.sh:g.sh-g.sa)+(Number.isFinite(line)?line:0);
        if(Number.isFinite(margin))grade=margin>0?'Won':margin<0?'Lost':'Push';
      }
      return [id,k,x.label,grade];
    });
  });
  const record=['Won','Lost','Push'].map(k=>hist.filter(x=>x[3]===k).length).join('–');
  return box('Pick Tracker',grid(3,items.map(([k,a,b])=>card(k,
    tools([a,b].map(([x,side,line,odds])=>`<span class="market">${btn(esc(x),'pick',k+':'+x,p[k]?.label===x?'on':'')}${line!=null?playCheck({id:k,title:x+' · '+k,market:k,sport:'nfl',date:g.date,game:g.id,side,line,odds}):''}</span>`).join(''))+
    tools(['Good Play','Lean','No Confidence'].map(x=>btn(x,'confidence',k+':'+x,p[k]?.confidence===x?'on':'')).join('')))))+
    `<div class="flat">${grid(2,[metric('Your Record',record,hist.filter(x=>x[3]==='Pending').length+' pending'),card('Recent Picks',hist.slice(-5).reverse().map(([k,m,v,r])=>`<div class="tiny">${esc(k)} · ${esc(v)} · ${esc(r)}</div>`).join('')||'<p class="subtle">No picks yet.</p>')])}</div>`);
}
const props={Receiving:{value:'recY',usage:'targets',columns:['Player','Pos','Tgt/g','Rec/g','Yds/g','ADOT','YAC','Tgt%','20+','10–19','0–9','SCN','Line']},Rushing:{value:'rushY',usage:'rush',columns:['Player','Pos','Att/g','Yds/g','Y/A','20+','RZ Att','Left','Middle','Right','Line']},Passing:{value:'passY',usage:'pass',columns:['Player','Pos','Att/g','Comp/g','Comp%','Yds/g','Y/A','Left','Middle','Right','Line']}};
const property=(p,m)=>m==='Anytime TD'?'td':m==='First TD'?'first':props[m]?.value;
function nflProps(){
  const [a,h]=matchup(),v=S.f.view||'Receiving',m=v==='Summary'?'Receiving':v,def=props[m];
  const top=slate()+chooseTeams()+tools(toggles(['Receiving','Rushing','Passing','Summary'],'view'));
  const tableOf=t=>{
    const rows=footballPlayers(t).filter(p=>total(p.logs,g=>g[def.usage])>0&&(m!=='Passing'||p.pos==='QB')).sort((a,b)=>total(b.logs,g=>g[def.value])-total(a.logs,g=>g[def.value]));
    const teamTargets=total(rows,p=>total(p.logs,r=>r.targets));
    return teamBanner(t)+table(def.columns,rows.map(p=>{
      const l=p.logs,av=k=>round(mean(l,x=>x[k]),1), sum=k=>total(l,x=>x[k]),zone=(field,k)=>total(l,x=>x[field][k]);
      let vals=[];
      if(m==='Receiving')vals=[av('targets'),av('rec'),av('recY'),round(div(sum('air'),sum('targets')),1),av('yac'),pct(div(sum('targets'),teamTargets)),...l.reduce((a,x)=>a.map((z,k)=>z+x.depth[k]),[0,0,0,0])];
      else if(m==='Rushing')vals=[av('rush'),av('rushY'),round(div(sum('rushY'),sum('rush')),1),sum('l20'),sum('rzRush'),...['left','middle','right'].map(k=>zone('lanes',k))];
      else vals=[av('pass'),av('comp'),pct(div(sum('comp'),sum('pass'))),av('passY'),round(div(sum('passY'),sum('pass')),1),...['left','middle','right'].map(k=>zone('passZones',k))];
      const o=propOdds(p,m);return [person(p),esc(p.pos),...vals,market(o?.line==null?'—':o.line,basePlay(p,m,undefined,{line:o?.line,odds:o?.over,side:'Over',average:mean(l,x=>x[def.value])}))];
    }),{sort:'nflprops-'+t,wrap:'box'});
  };
  if(v==='Summary')return top+box('Player Props Summary',tools(btn('Save image','export','Player Props Summary','primary'))+grid(2,[tableOf(a),tableOf(h)]))+notes();
  return top+box(m,grid(2,[tableOf(a),tableOf(h)]))+(['Receiving','Passing'].includes(m)?box(m==='Receiving'?'Target Zones':'Pass Zones',grid(2,[a,h].map(t=>card(team(t),table(['Location','Attempts','Yards','Success'],['left','middle','right'].map(zone=>{
    const p=scheme(t).pass.filter(x=>x[18]===zone);return [esc(zone),p.length,total(p,x=>x[2]),pct(mean(p,x=>x[16]))];
  })))))):'')+notes();
}
function bestNfl(){
  const m=S.f.view||'Receiving',pkey=property(null,m);
  const prices=[];
  for(const g of S.games.filter(g=>!S.f.gameFilter||S.f.gameFilter==='All games'||g.id===S.f.gameFilter)){
    for(const t of [g.a,g.h])for(const p of footballPlayers(t)){
      const o=propOdds(p,m);if(!o||o.line==null)continue;
      const marketChance=implied(o.over);
      if(marketChance==null||!p.logs.length)continue;
      const raw=rate(p.logs,x=>x[pkey]>o.line),weight=p.logs.length/(p.logs.length+6),over=marketChance+(raw-marketChance)*weight;
      const edge=over-marketChance,rating=edge>=.12?'Strong':edge>=.06?'Lean':'Check';
      if(edge<.025)continue;
      if(S.f.rating&&S.f.rating!=='All Ratings'&&S.f.rating!==rating)continue;
      prices.push({p,o,g,over,edge,rating,raw});
    }
  }
  return `<h1>Best Plays · Week ${S.week||'—'} ${info('These are empirical hit rates, compared with any imported market prices.')}</h1>`+tools(btn('YTD Model Performance','performance','NFL'))+
    '<p class="callout">Small samples move these rates quickly. Use the underlying game logs to see what drove a result.</p>'+slate({navOnly:true})+tools(toggles(['Receiving','Rushing','Passing','Anytime TD','First TD'],'view')+select('Rating','rating',['All Ratings','Strong','Lean','Check'])+select('Game','gameFilter',['All games',...S.games.map(g=>[g.id,g.a+' @ '+g.h])]))+
    table(['Rating','Player','Bet','Chance','Fair','Best Price','Edge','Hit','Why'],prices.sort((a,b)=>b.edge-a.edge).map(({p,o,g,over,edge,rating,raw})=>[badge(rating,rating==='Strong'?'g':''),person(p),market('o'+o.line,basePlay(p,m,g,{line:o.line,odds:o.over,side:'Over',prob:over,edge,rating})),pct(over),american(over),esc(o.over),cell(signed(edge*100),heat(edge,0,.05)),pct(raw),p.logs.length+' games']),{sort:'nflbest',wrap:'box',empty:'No priced props meet these filters. Use the Receiving, Rushing, Passing, and TD Data tabs to research the full slate.'});
}
function endzone(){
  const list=S.f.multi||S.games.map(g=>g.id);
  const players=[...new Set(S.games.filter(g=>list.includes(g.id)).flatMap(g=>[g.a,g.h]))].flatMap(footballPlayers);
  const pfilter=S.f.position||'All', rows=players.filter(p=>['RB','WR','TE','QB'].includes(p.pos)&&(pfilter==='All'||p.pos===pfilter)).map(p=>{
    const long=Math.max(...p.logs.map(x=>x.long)), explosive=mean(p.logs,x=>x.l20),big=mean(p.logs,x=>x.l40),air=div(total(p.logs,x=>x.air),total(p.logs,x=>x.targets));
    const g=S.games.find(g=>g.a===p.team||g.h===p.team),opp=g.a===p.team?g.h:g.a,def=stats(opp,true),allow=div(def.pl.filter(p=>p[2]>=20).length,def.gp);
    return {p,long,explosive,big,air,allow,opp,value:long/90+explosive*.7+big*1.25+Math.max(0,air||0)/40+(allow||0)*.055};
  });
  if(pfilter==='All'||pfilter==='DST')for(const t of [...new Set(players.map(p=>p.team))]){
    const g=S.games.find(g=>g.a===t||g.h===t),opp=g.a===t?g.h:g.a,def=stats(t),td=def.td.filter(p=>tdKind(p)==='DST');
    rows.push({p:{name:teamName(t)+' D/ST',team:t,pos:'DST',gp:def.gp},long:Math.max(0,...td.map(tdDist)),explosive:div(td.filter(p=>tdDist(p)>=20).length,def.gp),big:div(td.filter(p=>tdDist(p)>=40).length,def.gp),air:null,allow:null,opp,value:Math.max(0,...td.map(tdDist))/90+(div(td.length,def.gp)||0)});
  }
  rows.sort((a,b)=>b.value-a.value);
  const history=allGames().filter(g=>g.week<S.week&&S.data.events?.[g.id]&&final(g)).map(g=>[g,[...S.data.events[g.id].filter(p=>p[8])].sort((a,b)=>tdDist(b)-tdDist(a))[0]]).filter(x=>x[1]).sort((a,b)=>b[0].date.localeCompare(a[0].date));
  return tools(btn('King of the Endzone','noop','','on'))+`<h1>King of the Endzone</h1><p class="lede">Compare long-touchdown upside using past touchdown lengths, explosive plays, target depth, and opponent allowances. Defense and special teams touchdowns count.</p>`+slate({multi:true})+
    tools(btn('All games','allmulti','')+btn('Clear','clearmulti','')+select('Position','position',['All',...skills,'DST'])+btn('Save image','export','King of the Endzone','primary right'))+
    table(['#','Player','Opp','Upside','Longest TD','20+ / G','40+ / G','ADOT','Opp 20+ / G'],rows.slice(0,S.f.more?250:48).map(({p,long,explosive,big,air,allow,opp,value},i)=>[i+1,person(p),team(opp),cell(pct((rows.length-i)/rows.length),heat(value,.55,.22)),long,round(explosive,2),round(big,2),round(air),round(allow)]),{sort:'endzone',cls:'compact'})+
    tools(btn(S.f.more?'Show less':'Show all','flip','more'))+box('Winners',table(['Date','Matchup','Player','Longest TD'],history.slice(0,40).map(([g,p])=>[esc(g.date),versus(g),person(getPlayer(p[9],p[8]),false),tdDist(p)+' yd']),{sort:'endzonehistory'}));
}
// ---- Suggested Parlays: one row per priced player prop, with every input nfl-parlay-engine.mjs reads. ----
const nflName=x=>String(x||'').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase().replace(/(jr|sr|ii|iii|iv|v)$/,'');
// Schedule rows give an Eastern date and clock; turn them into an exact kickoff instant.
export function kickoff(date,time){
  if(!date||!/^\d{1,2}:\d{2}$/.test(time||''))return null;
  const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number),guess=Date.UTC(y,m-1,d,hh,mm);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
    .formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
  const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour%24,+parts.minute);
  return new Date(guess-(local-guess)).toISOString();
}
export const marketValue={Receiving:'recY',Receptions:'rec',Rushing:'rushY','Rush Attempts':'rush',Passing:'passY','Pass Attempts':'pass',
  Completions:'comp','Anytime TD':'td','First TD':'first'};
const marketGroup=m=>tdMarkets.has(m)?'td':['Receiving','Receptions'].includes(m)?'catch':['Rushing','Rush Attempts'].includes(m)?'rush':'pass';
const OL=new Set(['T','G','C','OL','OT','OG']);
const outNow=x=>/^(out|injured reserve|suspen|physically unable|pup|non-football)/i.test(x||'');
const doubtful=x=>/^doubtful/i.test(x||'');
// Roles, the NFL version of player types. Slot is estimated from where a receiver is targeted (middle of the field)
// and how deep; alignment and man/zone coverage are not in the public data.
export function playerRole(p){
  const sum=k=>total(p.logs,x=>x[k]||0);
  if(p.pos==='QB')return 'QBs';
  if(p.pos==='TE')return 'TEs';
  if(p.pos==='RB'||p.pos==='FB')return sum('targets')/Math.max(1,sum('targets')+sum('rush'))>=.26?'receiving RBs':'rushing RBs';
  if(p.pos==='WR'){
    const t=sum('targets'),mid=t?sum('mid')/t:0,adot=t?sum('air')/t:null;
    return mid>=.27||mid>=.21&&adot!=null&&adot<9.6?'slot WRs (est.)':'outside WRs';
  }
  return null;
}
let parlayMemo={};
// League tables for the slate's week: players and roles, what each defense allows by role (opponent-adjusted), team
// tendencies, cornerback rooms and starting offensive lines.
function league(){
  const X=S.extra||{};
  if(parlayMemo.archive===S.data&&parlayMemo.extra===X&&parlayMemo.week===S.week&&parlayMemo.year===S.year)return parlayMemo.league;
  const byTeam=new Map(names.map(t=>[t,footballPlayers(t)])), roles=new Map(), byId=new Map();
  for(const players of byTeam.values())for(const p of players){roles.set(p.id,playerRole(p));byId.set(p.id,p);}
  const season=allGames().filter(g=>+g.id.slice(0,4)===S.year&&g.week<S.week&&S.data.events?.[g.id]);
  // Per-play efficiency by role, against each offense's own average to that role, so a defense that faced strong
  // offenses is not punished for it.
  const plays=[];
  const team={};
  for(const g of season)for(const p of S.data.events[g.id]){
    if(p[1]!=='pass'&&p[1]!=='run')continue;
    const off=p[0],def=off===g.a?g.h:off===g.h?g.a:null;if(!def)continue;
    const T=team[off]??={plays:0,games:new Set(),proe:[],pass:0,rush:0};
    T.plays++;T.games.add(g.id);if(p[1]==='pass'&&!p[28])T.pass++;if(p[1]==='run')T.rush++;
    if(p[26]!=null&&p[27]!=null&&p[27]>=.2&&p[27]<=.8&&p[4]<=4)T.proe.push((p[1]==='pass'?1:0)-p[26]);
    if(p[17]==null)continue;
    if(p[1]==='pass'&&p[10])plays.push({kind:'pass',role:'QBs',off,def,epa:p[17],yd:p[2]});
    if(p[1]==='pass'&&p[11]&&!p[28]){const role=roles.get(p[11]);if(role)plays.push({kind:'catch',role,off,def,epa:p[17],yd:p[2]});}
    if(p[1]==='run'&&p[12]){const role=roles.get(p[12]);if(role)plays.push({kind:'rush',role,off,def,epa:p[17],yd:p[2]});}
  }
  const avg=(list,k)=>list.length?list.reduce((a,x)=>a+x[k],0)/list.length:null;
  const by=(list,keyFn)=>{const m=new Map();for(const x of list){const k=keyFn(x);(m.get(k)||m.set(k,[]).get(k)).push(x);}return m;};
  const offMean=new Map([...by(plays,x=>x.kind+'|'+x.role+'|'+x.off)].map(([k,l])=>[k,{epa:avg(l,'epa'),yd:avg(l,'yd')}]));
  const tables={};
  const unit={catch:'target',rush:'carry',pass:'dropback'};
  for(const [key,list] of by(plays,x=>x.kind+'|'+x.role)){
    const [kind,role]=key.split('|'), lgEpa=avg(list,'epa'), lgYd=avg(list,'yd');
    const perDef=[...by(list,x=>x.def)].filter(([,l])=>l.length>=12).map(([d,l])=>{
      const resid=k=>avg(l.map(x=>({v:x[k]-(offMean.get(kind+'|'+role+'|'+x.off)?.[k]??0)})),'v');
      return [d,lgEpa+resid('epa'),lgYd+resid('yd'),l.length];
    });
    tables[key]={ranks:allowedRanks(perDef.map(x=>[x[0],x[1]])),value:new Map(perDef.map(x=>[x[0],x])),league:lgEpa,
      label:x=>fmt(x[1],2)+' EPA and '+fmt(x[2],1)+' yds per '+unit[kind]+', opponent-adjusted',scale:.2};
  }
  // Volume and touchdowns allowed per game to each role (raw, like GOING UP's rebounds and assists by position).
  const defGames={};for(const t of names)defGames[t]=stats(t,true).gp;
  const counted={};
  for(const players of byTeam.values())for(const p of players)for(const m of ['Receptions','Rush Attempts','Pass Attempts','Completions','Anytime TD','Receiving','Rushing','Passing']){
    const role=roles.get(p.id);if(!role||(marketGroup(m)==='pass'&&role!=='QBs'))continue;
    for(const x of p.logs){const c=((counted[x.opponent]??={})[m+'|'+role]??={sum:0,n:0});c.sum+=x[marketValue[m]]||0;c.n++;}
  }
  const keys=new Set(Object.values(counted).flatMap(o=>Object.keys(o)));
  const perGameTables={};
  for(const key of keys){
    const rows=names.filter(t=>defGames[t]).map(t=>[t,(counted[t]?.[key]?.sum||0)/defGames[t],counted[t]?.[key]?.sum&&counted[t][key].sum/counted[t][key].n]);
    const [m,role]=key.split('|'), noun={Receptions:'receptions','Rush Attempts':'rush attempts','Pass Attempts':'pass attempts',Completions:'completions','Anytime TD':'TDs',Receiving:'receiving yds',Rushing:'rushing yds',Passing:'passing yds'}[m];
    perGameTables[key]={ranks:allowedRanks(rows.map(x=>[x[0],x[1]])),value:new Map(rows.map(x=>[x[0],x])),league:mean(rows,x=>x[1]),
      perPlayer:new Map(rows.map(x=>[x[0],x[2]||null])),label:x=>fmt(x[1],1)+' '+noun+' allowed per game',scale:null};
  }
  // Team tendencies: pass rate over expected in neutral situations, offensive plays per game, last game date.
  const teamInfo={};
  for(const t of names){
    const T=team[t];
    teamInfo[t]={proe:T?.proe.length>=40?mean(T.proe):null,pace:T?.games.size?T.plays/T.games.size:null,
      passAtt:T?.games.size?T.pass/T.games.size:null,carries:T?.games.size?T.rush/T.games.size:null,
      last:season.filter(g=>g.a===t||g.h===t).map(g=>g.date).sort().at(-1)||null};
  }
  const leaguePace=mean(Object.values(teamInfo).filter(x=>x.pace),x=>x.pace);
  // Snap counts, cornerback rooms and starting linemen from the last three games each team played.
  const snapsIn=(id,t)=>X.snaps?.[id]?.[t]||[];
  const recentIds=t=>season.filter(g=>g.a===t||g.h===t).sort((a,b)=>a.date.localeCompare(b.date)).slice(-3).map(g=>g.id);
  const starters=(t,test,pctIndex)=>{
    const ids=recentIds(t),count=new Map();
    for(const id of ids)for(const r of snapsIn(id,t))if(test(r[1])&&r[pctIndex]>=(pctIndex===2?.8:.7))count.set(nflName(r[0]),r[0]);
    return [...new Set(ids.flatMap(id=>snapsIn(id,t).filter(r=>test(r[1])&&r[pctIndex]>=(pctIndex===2?.8:.7)).map(r=>nflName(r[0]))))]
      .filter(n=>ids.filter(id=>snapsIn(id,t).some(r=>nflName(r[0])===n&&r[pctIndex]>=(pctIndex===2?.8:.7))).length>=Math.min(2,ids.length)).map(n=>count.get(n));
  };
  const cbStarters={},olStarters={},cbRoom={};
  for(const t of names){
    cbStarters[t]=starters(t,pos=>pos==='CB',3);olStarters[t]=starters(t,pos=>OL.has(pos),2);
    const set=new Set(cbStarters[t].map(nflName));let tg=0,yd=0;
    for(const g of season)for(const r of X.cover?.[g.id]?.[t]||[])if(set.has(nflName(r[0]))){tg+=r[1];yd+=r[3];}
    cbRoom[t]=tg>=20?yd/tg:null;
  }
  const cbLeague=mean(Object.values(cbRoom).filter(x=>x!=null));
  // Rush yards over expected: each rusher's own, and what each defense allows, from Next Gen Stats.
  const ryoePlayer=new Map(), ryoeDef={};
  for(const [id,rows] of Object.entries(X.ngs_rushing||{})){
    let att=0,over=0;
    for(const [week,t,a,ryoe] of rows){
      if(week>=S.week||a==null||ryoe==null)continue;
      att+=a;over+=ryoe;
      const g=season.find(x=>x.week===week&&(x.a===t||x.h===t));if(!g)continue;
      const d=(ryoeDef[g.a===t?g.h:g.a]??={att:0,over:0});d.att+=a;d.over+=ryoe;
    }
    if(att>=20)ryoePlayer.set(id,over/att);
  }
  const value={byTeam,byId,roles,tables,perGameTables,teamInfo,leaguePace,cbStarters,olStarters,cbRoom,cbLeague,ryoePlayer,
    ryoeDef:Object.fromEntries(Object.entries(ryoeDef).filter(([,d])=>d.att>=40).map(([t,d])=>[t,d.over/d.att])),recentIds,snapsIn};
  parlayMemo={archive:S.data,extra:X,week:S.week,year:S.year,league:value};
  return value;
}
export function nflParlayData(quotes=S.odds){
  const key=[S.data,S.extra,S.week,S.year,quotes,S.injuries,S.games,S.models,S.weather];
  if(parlayMemo.dataKey&&parlayMemo.dataKey.length===key.length&&parlayMemo.dataKey.every((x,i)=>x===key[i]))return parlayMemo.data;
  const L=league(), schedule=new Map(allGames().map(g=>[g.id,g])), rows=[], roster=new Map();
  const forecasts=new Map((S.models?.games||[]).map(x=>[x.game_id,x.forecast?.champion]));
  for(const g of S.games){
    const iso=kickoff(g.date,g.time), game={...g,iso};
    const weather=S.weather?.[g.id]||(g.wind!=null||g.temp!=null?{roof:/dome|closed/i.test(g.roof||'')?'dome':g.roof||'outdoors',wind:g.wind,temp:g.temp}:null);
    for(const t of [g.a,g.h]){
      const home=g.h===t, opp=home?g.a:g.h, players=L.byTeam.get(t)||[], info=L.teamInfo[t]||{};
      const teamGames=pool(t).map(x=>x.id), recentGames=new Set(teamGames.slice(-3));
      const teamSpread=g.spread==null?null:home?-g.spread:g.spread;
      const model=forecasts.get(g.id), modelP=model?.p_home==null?null:home?model.p_home:1-model.p_home;
      const modelMargin=model?.margin_home==null?null:home?model.margin_home:-model.margin_home;
      const script=teamSpread==null&&modelMargin==null?null:mean([teamSpread==null?null:-teamSpread,modelMargin].filter(x=>x!=null));
      const report=S.injuries[teamName(t)]||[], oppReport=S.injuries[teamName(opp)]||[];
      const statusOf=name=>report.find(x=>nflName(x.name)===nflName(name))?.status;
      const listedOut=(list,name)=>list.some(x=>nflName(x.name)===nflName(name)&&(outNow(x.status)||doubtful(x.status)));
      const usage=p=>mean(p.logs,x=>x.targets+x.rush);
      const missing=report.filter(x=>outNow(x.status)).flatMap(x=>{
        const mate=players.find(p=>nflName(p.name)===nflName(x.name));
        if(!mate||usage(mate)<4||mate.logs.filter(r=>recentGames.has(r.game)).length<2)return [];
        return [{name:mate.name,played:new Set(mate.logs.map(r=>r.game))}];
      });
      const lastGame=teamGames.at(-1), qb=players.filter(p=>p.pos==='QB').map(p=>[p,p.logs.find(x=>x.game===lastGame)?.pass||0]).sort((a,b)=>b[1]-a[1])[0]?.[0];
      const qbOut=qb&&outNow(statusOf(qb.name))?qb.name:null;
      const olOut=L.olStarters[t].filter(n=>listedOut(report,n));
      const cbOut=L.cbStarters[opp].filter(n=>listedOut(oppReport,n));
      const teamTotals=k=>new Map(teamGames.map(id=>[id,total(players,p=>p.logs.find(r=>r.game===id)?.[k]||0)]));
      const targets=teamTotals('targets'), carries=teamTotals('rush'), redZone=teamTotals('rz');
      const rest=info.last?Math.round((Date.parse(g.date)-Date.parse(info.last))/86400000):null;
      const s=stats(t);
      for(const p of players){
        const status=statusOf(p.name), role=L.roles.get(p.id);
        for(const m of parlayMarkets){
          const matches=propQuotes(p,m,quotes);
          if(!matches.length)continue;
          const k=marketValue[m], logs=p.logs, values=logs.map(x=>x[k]||0), avg=mean(values), last5=logs.slice(-5);
          const venueValues=logs.filter(x=>(schedule.get(x.game)?.h===t)===home).map(x=>x[k]||0);
          const sum=f=>total(logs,x=>x[f]||0), recent=f=>mean(last5,x=>x[f]||0);
          const recentAvg=mean(values.slice(-5));
          const usageProj={Receiving:sum('targets')?recent('targets')*sum('recY')/sum('targets'):null,
            Receptions:sum('targets')?recent('targets')*sum('rec')/sum('targets'):null,
            Rushing:sum('rush')?recent('rush')*sum('rushY')/sum('rush'):null,
            'Rush Attempts':info.carries&&sum('rush')?info.carries*total(last5,x=>x.rush)/Math.max(1,total(last5,x=>carries.get(x.game)||0)):null,
            Passing:sum('pass')?recent('pass')*sum('passY')/sum('pass'):null,
            'Pass Attempts':info.passAtt??null,
            Completions:sum('pass')?recent('pass')*sum('comp')/sum('pass'):null}[m]??null;
          const projection=tdMarkets.has(m)||recentAvg==null?null:usageProj==null?recentAvg:(recentAvg+usageProj)/2;
          const shareKey=['Receiving','Receptions'].includes(m)?'targets':['Rushing','Rush Attempts'].includes(m)?'rush':null;
          const teamCount=shareKey==='targets'?targets:carries;
          const share=list=>{if(!shareKey||!list.length)return null;const all=total(list,x=>teamCount.get(x.game)||0);return all?total(list,x=>x[shareKey])/all:null;};
          const kind=marketGroup(m), table=role?(kind==='td'||['Receptions','Rush Attempts','Pass Attempts','Completions'].includes(m)?L.perGameTables[(kind==='td'?'Anytime TD':m)+'|'+role]:L.tables[kind+'|'+role]):null;
          const dv=table?.value.get(opp);
          const defense=table&&dv&&table.ranks.get(opp)?{rank:table.ranks.get(opp),value:dv[1],league:table.league,label:table.label(dv),role,scale:table.scale}:null;
          const allowedPerPlayer=L.perGameTables[(kind==='td'?'Anytime TD':m)+'|'+role]?.perPlayer.get(opp)??null;
          const snapList=L.recentIds(t).map(id=>L.snapsIn(id,t).find(r=>nflName(r[0])===nflName(p.name))?.[2]).filter(x=>x!=null);
          const ryoe=['Rushing','Rush Attempts'].includes(m)?[L.ryoePlayer.get(p.id),L.ryoeDef[opp]].filter(x=>x!=null):[];
          roster.set(p.id,{id:p.id,name:p.name,team:t});
          for(const quote of matches)rows.push({date:g.date,player:p,game,opp,stat:m,quote,home,avg,recentAvg,usage:usageProj,projection,
            form:{season:values,last8:values.slice(-8),last5:values.slice(-5),venue:venueValues,
              home:logs.filter(x=>schedule.get(x.game)?.h===t).map(x=>x[k]||0),away:logs.filter(x=>schedule.get(x.game)?.h!==t).map(x=>x[k]||0)},
            reads:tdMarkets.has(m)?[]:[mean(values.slice(-3)),recentAvg,mean(values.slice(-8)),avg,mean(venueValues),projection,allowedPerPlayer].filter(x=>x!=null),
            role:role||p.pos,defense,
            spread:g.spread==null?null:Math.abs(g.spread),script,total:g.total??null,
            teamTotal:g.total==null||teamSpread==null?null:g.total/2-teamSpread/2,
            model:modelP==null?null:{p:modelP,margin:modelMargin},weather,
            proe:info.proe,pace:info.pace,leaguePace:L.leaguePace,
            share:share(logs),recentShare:logs.length>=5?share(logs.slice(-3)):null,shareLabel:shareKey==='targets'?'Target share':'Carry share',
            snaps:snapList.length?mean(snapList):null,
            rzShare:(()=>{const all=total(logs,x=>redZone.get(x.game)||0);return all?sum('rz')/all:null;})(),
            firstRate:s.gp?s.first.length/s.gp:null,ryoe:ryoe.length?mean(ryoe):null,
            cbRoom:L.cbRoom[opp],cbLeague:L.cbLeague,cbOut,qbOut:qbOut&&qbOut!==p.name?qbOut:null,olOut,rest,
            out:outNow(status),status:/questionable|doubtful/i.test(status||'')?status:null,injuryReport:Object.hasOwn(S.injuries,teamName(t)),
            absences:missing.filter(x=>x.name!==p.name).map(({name,played})=>{
              const without=logs.filter(r=>!played.has(r.game)).map(r=>r[k]||0);
              return {name,n:without.length,delta:without.length>=2&&avg!=null?mean(without)-avg:null};
            })});
        }
      }
    }
  }
  const data={rows,roster:[...roster.values()],games:S.games};
  parlayMemo.dataKey=key;parlayMemo.data=data;
  return data;
}
// ---- TD Board: expected touchdowns from opportunity (nfl-td.mjs holds the model). ----
let tdMemo={};
const tdPeriod=()=>S.year+'-'+S.week;
export const tdPrices=()=>local('td-prices:'+tdPeriod(),{});
export const tdScratched=()=>local('td-out:'+tdPeriod(),[]);
export function tdPrice(key,value){const all=tdPrices();if(String(value).trim())all[key]=String(value).trim();else delete all[key];keep('td-prices:'+tdPeriod(),all);}
export function tdBoardData(){
  const key=[S.data,S.extra,S.week,S.year,S.odds,S.injuries,S.games,S.models,S.weather,JSON.stringify(tdScratched()),S.f?.tdDst,JSON.stringify(Object.entries(S.f||{}).filter(([k])=>k.startsWith('tdOpen:')))];
  if(tdMemo.key&&tdMemo.key.every((x,i)=>x===key[i]))return tdMemo.data;
  const season=allGames().filter(g=>+g.id.slice(0,4)===S.year&&g.week<S.week&&S.data.events?.[g.id]).sort((a,b)=>a.date.localeCompare(b.date));
  const rates=bucketRates(season.flatMap(g=>S.data.events[g.id]));
  const P={},T={},pos=id=>getPlayer(id).pos;
  const team=t=>T[t]??={games:[],rushTd:0,passTd:0,drives:0,tdDrives:0,open:[0,0],recv:[0,0],rz:[0,0],aDrives:0,aTdDrives:0,aRz:[0,0],
    x:{},allowed:{},openTouches:{},firstTd:[0,0]};
  const player=(id,t)=>P[id]??={id,team:t,games:{},td:0,tdGames:{}};
  let dstFirst=0,firstGames=0,openN=0,openTd=0;
  for(const g of season){
    const ev=S.data.events[g.id], A=team(g.a), H=team(g.h);A.games.push(g.id);H.games.push(g.id);
    const off=ev.filter(p=>p[1]==='pass'||p[1]==='run');
    if(!off.length)continue;
    const recv=off[0][0];for(const t of [g.a,g.h]){T[t].recv[1]++;if(t===recv)T[t].recv[0]++;}
    // Drives: result, red-zone trips, opening drives.
    const drives=new Map();
    for(const p of off){const k=p[0]+'|'+p[6];const d=drives.get(k)||{team:p[0],n:p[6],result:p[7],rz:false,touch:new Set()};d.result=p[7];if(p[3]!=null&&p[3]<=20)d.rz=true;drives.set(k,d);}
    const firstDrive={};for(const d of drives.values())if(firstDrive[d.team]==null||d.n<firstDrive[d.team])firstDrive[d.team]=d.n;
    for(const d of drives.values()){
      const def=d.team===g.a?g.h:g.a, td=d.result==='Touchdown';
      T[d.team].drives++;T[def].aDrives++;if(td){T[d.team].tdDrives++;T[def].aTdDrives++;}
      if(d.rz){T[d.team].rz[1]++;T[def].aRz[1]++;if(td){T[d.team].rz[0]++;T[def].aRz[0]++;}}
      if(firstDrive[d.team]===d.n){T[d.team].open[1]++;openN++;if(td){T[d.team].open[0]++;openTd++;}}
    }
    const first=ev.find(p=>p[8]);
    if(first){firstGames++;if(!offenseTd(first))dstFirst++;}
    for(const p of off){
      const t=p[0], def=t===g.a?g.h:g.a, k=bucket(p);
      if(k){
        const id=isRush(k)?p[12]:p[11], x=rates[k]||0, pl=player(id,t), gm=pl.games[g.id]??={xr:0,xc:0,v:0,b:{}};
        pl.team=t;gm[isRush(k)?'xr':'xc']+=x;gm.v++;gm.b[k]=(gm.b[k]||0)+1;
        const tx=(T[t].x[g.id]??={xr:0,xc:0,rz:0});tx[isRush(k)?'xr':'xc']+=x;if(p[3]<=20)tx.rz++;
        const role=pos(id);if(role){const a=((T[def].allowed[role]??={})[g.id]??={x:0,off:t});a.x+=x;}
        if(firstDrive[t]===p[6]){(T[t].openTouches[g.id]??={})[id]=((T[t].openTouches[g.id]??={})[id]||0)+1;}
      }
      const who=offenseTd(p);
      if(who){player(who,t).td++;player(who,t).tdGames[g.id]=(player(who,t).tdGames[g.id]||0)+1;T[t][p[1]==='run'?'rushTd':'passTd']++;}
    }
  }
  const sum=(o,k)=>Object.values(o).reduce((a,x)=>a+x[k],0);
  const lgRushShare=(()=>{const r=Object.values(T).reduce((a,t)=>a+t.rushTd,0),q=Object.values(T).reduce((a,t)=>a+t.passTd,0);return r+q?r/(r+q):.42;})();
  const lgDrive=(()=>{const d=Object.values(T).reduce((a,t)=>a+t.drives,0);return d?Object.values(T).reduce((a,t)=>a+t.tdDrives,0)/d:.23;})();
  const lgOpen=openN?openTd/openN:.21, lgRz=(()=>{const n=Object.values(T).reduce((a,t)=>a+t.rz[1],0);return n?Object.values(T).reduce((a,t)=>a+t.rz[0],0)/n:.55;})();
  const dst=firstGames?(dstFirst+2)/(firstGames+40):.04;
  // Defense by role, adjusted for schedule: expected TDs it allowed to a role against what those offenses usually
  // generate for that role, shrunk (2 expected TDs of prior) and capped.
  const offRoleAvg={};
  for(const [id,pl] of Object.entries(P)){const role=pos(id);if(!role)continue;for(const [gid,gm] of Object.entries(pl.games)){((offRoleAvg[pl.team]??={})[role]??={x:0,games:new Set()}).x+=gm.xr+gm.xc;offRoleAvg[pl.team][role].games.add(gid);}}
  const roleMult={};
  for(const [d,info] of Object.entries(T))for(const [role,byGame] of Object.entries(info.allowed)){
    let allowed=0,expected=0;
    for(const a of Object.values(byGame)){allowed+=a.x;const o=offRoleAvg[a.off]?.[role];expected+=o?o.x/Math.max(1,T[a.off].games.length):0;}
    (roleMult[d]??={})[role]={m:Math.max(.75,Math.min(1.3,((allowed+2)/(expected+2))**.6)),allowed,expected,games:Object.keys(byGame).length};
  }
  const forecasts=new Map((S.models?.games||[]).map(x=>[x.game_id,x.forecast?.champion]));
  const scratched=tdScratched(), games=[];
  for(const g of S.games){
    const iso=kickoff(g.date,g.time), weather=S.weather?.[g.id]||null, bad=badWeather(weather), side={};
    for(const t of [g.a,g.h]){
      const home=g.h===t, opp=home?g.a:g.h, info=T[t]||team(t), oi=T[opp]||team(opp);
      const teamSpread=g.spread==null?null:home?-g.spread:g.spread, model=forecasts.get(g.id);
      const modelMargin=model?.margin_home==null?null:home?model.margin_home:-model.margin_home;
      const script=teamSpread==null&&modelMargin==null?0:mean([teamSpread==null?null:-teamSpread,modelMargin].filter(x=>x!=null));
      let implied=impliedPoints(g.total,teamSpread);
      const fromLines=implied!=null;
      if(implied==null)implied=mean(info.games.map(id=>{const x=allGames().find(y=>y.id===id);return x?(x.a===t?x.sa:x.sh):null;}).filter(x=>x!=null))??21;
      // Red-zone TD rate allowed against league, square-rooted and capped: the total already prices most of the matchup.
      const rzAllowed=shrink(oi.aRz[0],oi.aRz[1],8,lgRz), rzFactor=Math.max(.9,Math.min(1.1,(rzAllowed/lgRz)**.5));
      const teamTd=impliedTds(implied)*rzFactor, rs=rushShare(info.rushTd,info.passTd,lgRushShare,script,bad);
      const report=S.injuries[teamName(t)]||[], statusOf=name=>report.find(x=>nflName(x.name)===nflName(name))?.status;
      const recent=new Set(info.games.slice(-3)), last4=info.games.slice(-4);
      const cands=Object.values(P).filter(pl=>pl.team===t&&Object.keys(pl.games).some(id=>recent.has(id))&&!scratched.includes(pl.id)&&!outNow(statusOf(getPlayer(pl.id).name)));
      const perGame=(pl,ids,k)=>{const l=ids.filter(id=>pl.games[id]);return l.length?l.reduce((a,id)=>a+pl.games[id][k],0)/l.length:0;};
      const blend=(pl,k)=>{const all=Object.keys(pl.games);return .4*perGame(pl,all,k)+.6*(last4.some(id=>pl.games[id])?perGame(pl,last4,k):perGame(pl,all,k));};
      const xr=new Map(cands.map(pl=>[pl.id,blend(pl,'xr')])), xc=new Map(cands.map(pl=>[pl.id,blend(pl,'xc')])), vol=new Map(cands.map(pl=>[pl.id,blend(pl,'v')]));
      const sR=[...xr.values()].reduce((a,b)=>a+b,0)||1, sC=[...xc.values()].reduce((a,b)=>a+b,0)||1, sV=[...vol.values()].reduce((a,b)=>a+b,0)||1;
      const W=tdSettings.opportunityWeight;
      const gl=cands.filter(pl=>pos(pl.id)==='RB').map(pl=>[pl,Object.values(pl.games).reduce((a,gm)=>a+(gm.b['rush 1-2']||0)+(gm.b['rush 3-5']||0),0)]).sort((a,b)=>b[1]-a[1])[0];
      const openAll={};for(const [gid,o] of Object.entries(info.openTouches))for(const [id,n] of Object.entries(o))openAll[id]=(openAll[id]||0)+n;
      const openTotal=cands.reduce((a,pl)=>a+(openAll[pl.id]||0),0);
      // Each player's share of the team's TDs; flatten (a power under 1, renormalized) pulls the extremes in, as the
      // backtest showed raw shares were too spread out.
      const rawShare=new Map(cands.map(pl=>[pl.id,(W*(rs*xr.get(pl.id)/sR+(1-rs)*xc.get(pl.id)/sC)+(1-W)*vol.get(pl.id)/sV)**tdSettings.flatten]));
      const sShare=[...rawShare.values()].reduce((a,b)=>a+b,0)||1;
      const rows=cands.map(pl=>{
        const pp=getPlayer(pl.id,t), role=pp.pos, m=roleMult[opp]?.[role]?.m??1;
        const lambda=teamTd*rawShare.get(pl.id)/sShare*m;
        const count=k=>Object.values(pl.games).reduce((a,gm)=>a+(gm.b[k]||0),0);
        const played=Object.keys(pl.games), xSeason=played.reduce((a,id)=>a+pl.games[id].xr+pl.games[id].xc,0);
        const rzMine=played.reduce((a,id)=>a+Object.entries(pl.games[id].b).filter(([k])=>!k.endsWith('21+')).reduce((s,[,n])=>s+n,0),0);
        const rzTeam=played.reduce((a,id)=>a+(info.x[id]?.rz||0),0);
        const snapList=(S.extra?.snaps?info.games.slice(-3).map(id=>S.extra.snaps[id]?.[t]?.find(r=>nflName(r[0])===nflName(pp.name))?.[2]).filter(x=>x!=null):[]);
        return {p:pp,id:pl.id,team:t,opp,role,game:{...g,iso},lambda,anytime:anytime(lambda),m,
          rushShare:xr.get(pl.id)/sR,recShare:xc.get(pl.id)/sC,volShare:vol.get(pl.id)/sV,rzShare:rzTeam?rzMine/rzTeam:null,snaps:snapList.length?mean(snapList):null,
          counts:{in5:count('rush 1-2')+count('rush 3-5'),in10:count('rush 1-2')+count('rush 3-5')+count('rush 6-10'),t10:count('target 1-10')+count('target end zone'),
            t20:count('target 1-10')+count('target 11-20')+count('target end zone'),ez:count('target end zone')},
          games:played.length,td:pl.td,xtd:xSeason,regression:tdRegression(pl.td,xSeason),goalLine:gl&&gl[0]===pl&&gl[1]>=2,
          openShare:openTotal?(openAll[pl.id]||0)/openTotal:0,status:/questionable|doubtful/i.test(statusOf(pp.name)||'')?statusOf(pp.name):null,
          quotes:{any:propQuotes(pp,'Anytime TD',S.odds)[0]||null,first:propQuotes(pp,'First TD',S.odds)[0]||null}};
      });
      side[t]={opp,home,teamTd,rs,implied,fromLines,script,rzFactor,rows,receive:shrink(info.recv[0],info.recv[1],6,.5),
        drive:{off:shrink(info.tdDrives,info.drives,10,lgDrive),allow:shrink(oi.aTdDrives,oi.aDrives,10,lgDrive),open:info.open}};
    }
    // First TD: who receives, then drive-by-drive TD chances.
    const A=side[g.a],H=side[g.h], drive=x=>Math.max(.08,Math.min(.5,x.drive.off*x.drive.allow/lgDrive));
    const pA=drive(A),pH=drive(H), a1=shrink(A.drive.open[0],A.drive.open[1],8,pA*lgOpen/lgDrive), h1=shrink(H.drive.open[0],H.drive.open[1],8,pH*lgOpen/lgDrive);
    const override=S.f?.['tdOpen:'+g.id], receiveA=override===g.a?1:override===g.h?0:log5(A.receive,H.receive);
    const firstA=firstTdChance(receiveA,a1,h1,pA,pH), offense=S.f?.tdDst==='No'?1:1-dst;
    for(const [t,share] of [[g.a,firstA],[g.h,1-firstA]]){
      const rows=side[t].rows, L=rows.reduce((a,r)=>a+r.lambda,0)||1, O=rows.reduce((a,r)=>a+r.openShare,0)||1;
      for(const r of rows){r.teamFirst=share*offense;r.given=.8*r.lambda/L+.2*r.openShare/O;r.first=r.teamFirst*r.given;}
    }
    games.push({g:{...g,iso},weather,bad,side,receiveA,receiveSource:override?'set here':'model',pA,pH,a1,h1,firstA,dst,rows:[...A.rows,...H.rows]});
  }
  const data={games,rows:games.flatMap(x=>x.rows),rates,league:{rushShare:lgRushShare,drive:lgDrive,open:lgOpen,rz:lgRz,dst}};
  tdMemo={key,data};
  return data;
}
export function nflPlayer(id){
  const p=matchup().map(t=>footballPlayers(t).find(x=>x.id===id)).find(Boolean)||names.map(t=>footballPlayers(t).find(x=>x.id===id)).find(Boolean);
  if(!p)return;
  const m=S.f.view in props?S.f.view:'Anytime TD',o=propOdds(p,m);
  dialog(p.name,teamBanner(p.team,p.pos)+tools(market(o?.line==null?'Save '+m:o.line+' '+(o.over||''),basePlay(p,m,undefined,{line:o?.line,odds:o?.over,side:'Over'})))+
    table(['Date','Opp','Rec','Rec Yd','Rush','Rush Yd','Pass Yd','TD','First TD'],[...p.logs].reverse().map(g=>[esc(g.date),team(g.opponent),g.rec,g.recY,g.rush,g.rushY,g.passY,g.td,g.first])),true);
}
export function nflAction(act,v,target){
  if(act==='driveDetail'){
    const [a,h]=matchup();dialog(v,grid(2,[a,h].map(t=>card(team(t),table(['Week','Opponent','Results','Plays','Yards'],opening(t,false,S.f.window,S.f.view).map(x=>[x.g.week,team(x.o),esc(x.drives.join(', ')),x.plays,x.yards]))))),true);return true;
  }
  if(S.route.id==='nfl-parlays'&&act.startsWith('parlay'))return nflParlayAction(act,v,nflParlayData(),target);
  if(S.route.id==='nfl-tdboard'&&act.startsWith('td'))return tdBoardAction(act,v,tdBoardData());
  if(act==='pickplayers'){const [a,h]=matchup();dialog('Pick players',grid(2,[tdPlayers(a),tdPlayers(h)]),true);return true;}
  return false;
}
export function nflPage(){return ({'nfl-tdboard':()=>tdBoardPage(tdBoardData()),'nfl-parlays':()=>nflParlayPage(nflParlayData()),td:tdPage,drives:drivesPage,'nfl-preview':nflPreview,'nfl-props':nflProps,'nfl-best':bestNfl,endzone})[S.route.id]();}
export function nflResult(p){
  const g=allGames().find(x=>x.id===p.game);
  if(!g||!final(g))return null;
  if(p.market==='Total')return g.sa+g.sh;
  if(p.market==='Moneyline'||p.market==='Spread')return p.side===g.a?g.sa-g.sh:g.sh-g.sa;
  if(!S.data.events?.[g.id])return null;
  const rows=S.data.events[g.id],m=p.market,id=p.id;
  if(m==='Anytime TD'||m==='First TD')return (m==='First TD'?rows.filter(r=>r[8]).slice(0,1):rows.filter(r=>r[8])).filter(r=>r[9]===id).length;
  if(m==='Receiving')return total(rows,r=>r[11]===id&&r[1]==='pass'&&r[15]?r[2]:0);
  if(m==='Rushing')return total(rows,r=>r[12]===id&&r[1]==='run'?r[2]:0);
  if(m==='Passing')return total(rows,r=>r[10]===id&&r[1]==='pass'&&r[15]?r[2]:0);
  return null;
}
