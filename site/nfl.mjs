import { nflTeams } from './config.mjs';
import {total,mean,round,pct,div,rate,heat,american,implied,signed,seasonLimit,poissonTail} from './math.mjs';
import {current as S,esc,box,grid,card,metric,logo,color,team,teamName,teamBanner,table,cell,group,tools,btn,toggle,toggles,select,search,info,empty,slate,hero,versus,injuryList,oddsNote,notes,person,market,basePlay,propOdds,gameDay,final,local,dialog,badge,playCheck} from './ui.mjs';

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
    const rec=(id)=>id?(game[id]??={id,targets:0,rec:0,recY:0,yac:0,air:0,rush:0,rushY:0,pass:0,passY:0,comp:0,td:0,first:0,rz:0,rzFirst:0,rzRush:0,rzTgt:0,l20:0,l40:0,long:0,depth:[0,0,0,0],lanes:{},passZones:{}}):null;
    let beforeFirst=true;
    for(const p of q.all){
      if(p[0]===t&&p[1]==='pass'){
        const passer=rec(p[10]);if(passer){passer.pass++;passer.comp+=p[15];passer.passY+=p[15]?p[2]:0;passer.passZones[p[18]||'middle']=(passer.passZones[p[18]||'middle']||0)+1;}
        const r=rec(p[11]);if(r){r.targets++;r.rec+=p[15];r.recY+=p[15]?p[2]:0;r.yac+=p[14]||0;r.air+=p[13]||0;
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
export function nflPlayer(id){
  const p=matchup().map(t=>footballPlayers(t).find(x=>x.id===id)).find(Boolean)||names.map(t=>footballPlayers(t).find(x=>x.id===id)).find(Boolean);
  if(!p)return;
  const m=S.f.view in props?S.f.view:'Anytime TD',o=propOdds(p,m);
  dialog(p.name,teamBanner(p.team,p.pos)+tools(market(o?.line==null?'Save '+m:o.line+' '+(o.over||''),basePlay(p,m,undefined,{line:o?.line,odds:o?.over,side:'Over'})))+
    table(['Date','Opp','Rec','Rec Yd','Rush','Rush Yd','Pass Yd','TD','First TD'],[...p.logs].reverse().map(g=>[esc(g.date),team(g.opponent),g.rec,g.recY,g.rush,g.rushY,g.passY,g.td,g.first])),true);
}
export function nflAction(act,v){
  if(act==='driveDetail'){
    const [a,h]=matchup();dialog(v,grid(2,[a,h].map(t=>card(team(t),table(['Week','Opponent','Results','Plays','Yards'],opening(t,false,S.f.window,S.f.view).map(x=>[x.g.week,team(x.o),esc(x.drives.join(', ')),x.plays,x.yards]))))),true);return true;
  }
  if(act==='pickplayers'){const [a,h]=matchup();dialog('Pick players',grid(2,[tdPlayers(a),tdPlayers(h)]),true);return true;}
  return false;
}
export function nflPage(){return ({td:tdPage,drives:drivesPage,'nfl-preview':nflPreview,'nfl-props':nflProps,'nfl-best':bestNfl,endzone})[S.route.id]();}
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
