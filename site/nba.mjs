import {nbaPropTabs,href} from './config.mjs';
import {total,mean,round,pct,div,rate,heat,signed,seasonLimit,distanceZone,nbaType,leaderShares} from './math.mjs';
import {current as S,esc,box,plain,grid,card,metric,logo,team,teamName,teamBanner,table,cell,group,tools,btn,toggle,toggles,select,search,info,empty,slate,hero,versus,injuryList,oddsNote,person,market,basePlay,propOdds,gameDay,gamesFor,final,dialog,badge,action,local,keep,et} from './ui.mjs';
import {parlayPage,parlayAction} from './nba-parlays.mjs';
import {openingTables,teamFirst,shotTables,makeEdge,earlyShares,blendShare,scorerShares,fairChances,impliedChance,americanFrom,roundRobin} from './first-basket.mjs';
import {propQuotes} from './ui.mjs';
import {allowedRanks,markets} from './nba-parlay-engine.mjs';

const nbaKeys={Points:6,Threes:7,Assists:8,Rebounds:9};
const positions=['All','PG','SG','SF','PF','C','G','F'];
const zones=['Restricted Area','Paint','Mid-Range','Corner 3','Above the Break 3'];
const periods=['Season','Last 10','Last 5','Last 3'];
const source=()=>S.data;
const teams=()=>Object.keys(source().teams||{}).sort((a,b)=>teamName(a).localeCompare(teamName(b)));
const played=(l,d=S.day)=>l.filter(r=>r[1]<d).sort((a,b)=>a[1].localeCompare(b[1]));
let memo, archive, lastDay;
function reset(){
  if(archive!==source()||lastDay!==S.day){
    archive=source();lastDay=S.day;memo={players:null,shots:null,team:{},types:{}};
  }
  return memo;
}
function shots(){
  const m=reset();if(m.shots)return m.shots;
  const map={all:[],players:{},off:{},def:{},games:{}};
  for(const [gid,rs] of Object.entries(source().shots||{})){
    if(source().dates?.[gid]>=S.day)continue;
    map.games[gid]=rs;
    for(const r of rs){map.all.push(r);(map.players[r[0]]??=[]).push(r);(map.off[r[1]]??=[]).push(r);(map.def[r[2]]??=[]).push(r);}
  }
  return m.shots=map;
}
const type=id=>{const m=reset();return m.types[id]??=(nbaType(shots().players[id]||[]));};
function players(){
  const m=reset();if(m.players)return m.players;
  return m.players=Object.entries(source().players||{}).map(([id,[name,pos,img,team]])=>{
    const l=played(source().pg?.[id]||[]),a=mean(l,x=>x[8]),reb=mean(l,x=>x[9]);
    const position=pos==='G'?a>=3.2?'PG':'SG':pos==='F'?reb>=5?'PF':'SF':pos;
    return {id,name,pos:position,rawPos:pos,img,team:l.at(-1)?.[2]||team,logs:l,gp:l.length,min:mean(l,x=>x[5])};
  }).filter(p=>p.gp);
}
const scheduled=(all=false)=>players().filter(p=>all||gamesFor(p.team));
const filtered=()=>scheduled(!S.games.length).filter(p=>(S.f.position==='All'||!S.f.position||p.pos===S.f.position||p.rawPos===S.f.position)&&(!S.f.search||p.name.toLowerCase().includes(S.f.search.toLowerCase()))&&(!S.f.gameFilter||S.f.gameFilter==='All games'||gamesFor(p.team)?.id===S.f.gameFilter)&&(!S.game||S.f.allGames||[S.game.a,S.game.h].includes(p.team)));
const offenseFields=[['PPG','ppg'],['ORTG','ortg'],['3PM','threes'],['3PA Rate','tpr'],['FT Rate','ftr'],['TOV %','tov'],['OREB %','oreb'],['Paint Share','paint'],['Paint FG%','paintFg'],['Mid Share','mid'],['Mid FG%','midFg'],['Trans Share','trans'],['Trans Pts','transPts'],['Ball Move','assist']];
const defFields=offenseFields.map(([a,b])=>[a==='ORTG'?'DRTG':a==='TOV %'?'Forced TOV%':a==='OREB %'?'DREB %':a,b]);
const percentKeys=new Set(['tpr','ftr','tov','oreb','paint','paintFg','mid','midFg','trans','assist','dreb']);
const display=(k,v)=>percentKeys.has(k)?pct(v,0):round(v,['ortg','ppg','pace','net','margin','avgTotal'].includes(k)?1:0);
function teamStat(t,window='Season'){
  const m=reset(), key=t+window;if(m.team[key])return m.team[key];
  const data=source().tg||{}, l=seasonLimit(played(data[t]||[]),window);
  const other=l.map(r=>(data[r[2]]||[]).find(x=>x[0]===r[0])).filter(Boolean);
  const sample=new Set(l.map(x=>x[0]));
  const event=(s)=>s.filter(x=>sample.has(x[0]));
  const n=(rows,x)=>total(rows,r=>r[x]), avg=(rows,x)=>mean(rows,r=>r[x]);
  const poss=rows=>mean(rows,r=>r[7]+.44*r[10]-r[11]+r[13]);
  const shotMap=shots();
  const makes=(raw)=>raw.filter(x=>x[7]).length;
  const sums=(rows,opp,raw)=>{
    const pa=raw.filter(x=>x[5]<13&&x[6]!==3),mid=raw.filter(x=>x[5]>=13&&x[6]!==3);
    return {ppg:avg(rows,4),ortg:div(avg(rows,4)*100,poss(rows)),threes:avg(rows,8),tpr:div(n(rows,9),n(rows,7)),ftr:div(n(rows,10),n(rows,7)),tov:div(avg(rows,13),poss(rows)),
      oreb:div(n(rows,11),n(rows,11)+n(opp,12)),dreb:div(n(rows,12),n(rows,12)+n(opp,11)),paint:div(n(rows,14),n(rows,4)),paintFg:div(makes(pa),pa.length),
      mid:div(mid.length,raw.length),midFg:div(makes(mid),mid.length),trans:div(n(rows,15),n(rows,4)),transPts:avg(rows,15),assist:div(n(rows,16),n(rows,6))};
  };
  const raw=[...sample].flatMap(g=>shotMap.games[g]||[]), o=sums(l,other,raw.filter(r=>r[1]===t)),d=sums(other,l,raw.filter(r=>r[2]===t));
  d.oreb=o.dreb;
  const game={pace:mean([poss(l),poss(other)].filter(x=>x!=null)),net:o.ortg!=null&&d.ortg!=null?o.ortg-d.ortg:null,margin:mean(l,r=>r[4]-r[5]),avgTotal:mean(l,r=>r[4]+r[5])};
  return m.team[key]={t,o,d,game,l,other};
}
const ordinal=n=>n==null?'—':n+((n%100>=11&&n%100<=13)?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'));
function ranks(list,access,inv=false){
  return new Map(list.filter(x=>access(x)!=null).sort((a,b)=>(access(b)-access(a))*(inv?-1:1)).map((x,i)=>[x.t,i+1]));
}
const gameMetrics=[['Pace','pace'],['Net RTG','net'],['Avg Margin','margin'],['Avg Total','avgTotal'],['ATS','ats'],['O/U','ou']];
function league(){
  const w=S.f.window||'Season';
  const list=teams().map(t=>teamStat(t,w));
  const colsets=[['o',offenseFields],['d',defFields],['game',gameMetrics]];
  const metrics=colsets.map(([k,fields])=>fields.map(([,key])=>ranks(list,x=>x[k][key],k==='d'&&key!=='oreb'||k==='o'&&key==='tov')));
  return slate()+box('League Stats Chart',tools(toggles(periods,'window')+btn(S.f.rank?'Show Values':'Show Rank','flip','rank')+btn(S.f.todayTeams?'All Teams':"Today's Teams Only",'flip','todayTeams'))+
    table(['Team',...colsets.flatMap(([,f])=>f.map(([n])=>n))],list.filter(x=>!S.f.todayTeams||gamesFor(x.t)).sort((a,b)=>(b.game.net??-100)-(a.game.net??-100)).map(x=>[team(x.t),...colsets.flatMap(([k,f],i)=>f.map(([,key],j)=>{
      const rank=metrics[i][j].get(x.t),v=x[k][key];return cell(S.f.rank?ordinal(rank):display(key,v),heat(rank,15.5,5,true),ordinal(rank)+' in the league');
    }))]),{cls:'wide',groups:[group('',1),group('Offense',14),group('Defense (Allowed)',14),group('Game & Betting',6)],sort:'nba-league',wrap:'box'}),
    'Rankings compare the selected window of regular-season games. Unavailable historical prices are left blank.');
}
const tabbar=(labels,key)=>`<div class="viewtabs">${labels.map(v=>`<button type="button" class="viewtab ${S.f[key]===v?'on':''}" ${action('set',key+':'+v)}>${esc(v)}</button>`).join('')}</div>`;
function getSummary(g,w){
  const a=teamStat(g.a,w),h=teamStat(g.h,w), league=teams().map(t=>teamStat(t,w));
  const fields=[['Pts / Possession','ortg'],['Pace','pace'],['Transition Share','trans'],['Three Pointers','threes'],['Free Throw Rate','ftr'],['Offensive Rebounds','oreb'],['Turnover %','tov'],['Paint FG%','paintFg'],['Mid-Range FG%','midFg']];
  const ranksFor=(k,key)=>ranks(league,x=>x[k][key],k==='d'&&key!=='oreb'||k==='o'&&key==='tov');
  return table([logo(g.a)+' '+g.a+' OFF',logo(g.h)+' '+g.h+' DEF','Category',logo(g.h)+' '+g.h+' OFF',logo(g.a)+' '+g.a+' DEF'],fields.map(([n,k])=>{
    const heatCell=(x,b)=>{const rk=ranksFor(b,k).get(x.t);return cell(ordinal(rk)+' <small>'+display(k,x[b][k])+'</small>',heat(rk,15,6,true));};
    const b=k==='pace'?'game':'o',d=k==='pace'?'game':'d';
    return [heatCell(a,b),heatCell(h,d),cell(n),heatCell(h,b),heatCell(a,d)];
  }),{groups:[group('Scoring',5)],wrap:'box'});
}
function keys(){
  const g=S.game,w=S.f.window||'Season',v=S.f.view||'Summary',top=slate();
  if(!g)return top+box('Matchup Keys',empty('No matchup selected.'));
  const heading=tools(`${versus(g)}<span class="right"></span>${badge('Spread  '+(g.odds?.details??'—'))}${badge('Total  '+(g.odds?.total??'—'))}${badge('ML  '+g.a+' '+(g.odds?.am??'—')+' / '+g.h+' '+(g.odds?.hm??'—'))}`)+grid(2,[g.a,g.h].map(t=>card(logo(t)+' '+t+' Injuries',injuryList(t))));
  let body='';
  if(v==='Summary')body=`<div style="max-width:780px;margin:auto">${getSummary(g,w)}</div>`;
  if(v==='Categories')body=grid(2,[g.a,g.h].map(t=>{
    const x=teamStat(t,w);
    return card(teamName(t),table(['Metric','Offense','Defense'],offenseFields.map(([n,k])=>[n,display(k,x.o[k]),display(k,x.d[k])])));
  }));
  if(v==='Overview')body=grid(2,[g.a,g.h].map(t=>teamBanner(t)+grid(3,[['PPG','ppg'],['ORtg','ortg'],['3PM','threes'],['Pace','pace'],['Net rating','net'],['Avg margin','margin']].map(([n,k])=>metric(n,display(k,teamStat(t,w).o[k]??teamStat(t,w).game[k]))))))+getSummary(g,w);
  if(v==='Rotations & History')body=grid(2,[g.a,g.h].map(t=>teamBanner(t)+table(['Player','MIN','PTS','AST','REB'],players().filter(p=>p.team===t).sort((a,b)=>b.min-a.min).slice(0,12).map(p=>[person(p),round(p.min),...[6,8,9].map(k=>round(mean(p.logs,r=>r[k])))]))+table(['Date','Opp','Score','Margin'],teamStat(t,w).l.slice(-6).reverse().map(r=>[esc(r[1]),team(r[2]),r[4]+'–'+r[5],signed(r[4]-r[5],0)]))));
  return top+box('Matchup Keys',tools(toggles(periods,'window')+btn('Show All Summaries','allSummaries',''))+heading+tabbar(['Overview','Categories','Rotations & History','Summary'],'view')+body+`<p class="tiny">${oddsNote(g)}</p>`,'Season and recent-game statistics are matched offense against defense.');
}
const navProps=()=>`<div class="subnav">${nbaPropTabs.map(r=>`<a href="${href(r.path)}" class="${S.route.path===r.path?'on':''}" ${S.route.path===r.path?'aria-current="page"':''}>${esc(r.title)}</a>`).join('')}</div>`;
const hitCell=(l,key,line)=>{
  if(line==null)return cell('—','none');
  const hits=l.filter(r=>r[key]>line).length,val=div(hits,l.length);return cell(val==null?'—':pct(val)+'<br><small>'+hits+' of '+l.length+'</small>',heat(val,.5,.1));
};
function propTable(){
  const a=S.route.title,all=a==='All Props',ast=a==='Assist Spots', title=all||ast?a:a+' Research';
  const markets=all?Object.keys(nbaKeys).filter(k=>S.f.markets?.includes(k)??true):[ast?'Assists':a];
  const priced=S.f.pricing==='With A Line', expanded=S.f.filters;
  const data=filtered().filter(p=>p.min>=12);
  const list=data.flatMap(p=>markets.map(m=>({p,m,price:propOdds(p,m),avg:mean(p.logs,r=>r[nbaKeys[m]])}))).filter(r=>!priced||r.price?.line!=null);
  list.sort((a,b)=>b.avg-a.avg);
  const assistsBy=id=>(source().assists?.[id]||[]).filter(x=>(source().dates?.[x[0]]||'')<S.day);
  const rows=list.map(({p,m,price,avg})=>{
    const k=nbaKeys[m],l=p.logs,g=gamesFor(p.team),opp=g?(g.a===p.team?g.h:g.a):null,line=price?.line;
    const play=basePlay(p,m,g,{line,side:'Over',odds:price?.over,average:avg});
    const over=price?.over!=null?market(price.over,play):market('—',play), under=price?.under!=null?market(price.under,{...play,side:'Under',odds:price.under}):'—';
    const b=[person(p),...(all?[badge(m)]:[]),line??'—',over,under,cell(round(avg),heat(avg,line??(m==='Points'?12:2),m==='Points'?4:1))];
    const vs=players().flatMap(x=>x.logs.filter(r=>r[3]===opp&&x.pos===p.pos));
    const trend=mean(l.slice(-5),x=>x[k]);
    if(ast){
      const dest=assistsBy(p.id), counts=new Map();
      for(const x of dest)counts.set(x[1],(counts.get(x[1])||0)+1);
      const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([id,n])=>(source().players?.[id]?.[0]||'Teammate')+' '+n).join(' · ');
      return [...b,pct(div(avg,p.min)),hitCell(l.slice(-5),k,line),hitCell(l,k,line),esc(top||'—'),type(p.id),opp?team(opp):'—',cell(signed(trend-avg),heat(trend-avg,0,.65)),dest.length,round(p.min)];
    }
    const reads=[trend,mean(l.slice(-10),r=>r[k]),avg,mean(l.filter(x=>x[4]==='home'),r=>r[k]),mean(l.filter(x=>x[4]==='away'),r=>r[k]),mean(vs,r=>r[k])];
    return [...b,...(!all?[round(m==='Threes'?mean(l,r=>r[11]):p.min),round(m==='Points'?mean(l,r=>r[10]):m==='Threes'?mean(l,r=>r[11]):p.min)]:[]),l.at(-1)?.[k],
      hitCell(l.slice(-5),k,line),hitCell(l.slice(-10),k,line),hitCell(l,k,line),hitCell(l.filter(x=>x[4]==='home'),k,line),hitCell(l.filter(x=>x[4]==='away'),k,line),
      round(mean(vs,r=>r[k])),type(p.id),opp?team(opp):'—',line==null?'—':reads.filter(x=>x!=null&&x>line).length,line==null?'—':reads.filter(x=>x!=null&&x<line).length,opp?round(teamStat(opp).game.pace):'—',esc(g?.odds?.details||'—'),g?.odds?.total??'—',cell(esc((S.injuries[teamName(p.team)]||[]).slice(0,2).map(x=>x.name).join(' · ')||'—'))];
  });
  const columns=ast?['Player','Line','Over','Under','AVG','Rate','L5','Season','Targets','Types','Lineup','Read','Chances','Volume']:['Player',...(all?['Stat']:[]),'Line','Over','Under','AVG',...(!all?[a==='Threes'?'3PA':'MIN','Volume']:[]),'Last Game','L5','L10','Season','Home','Away','Opp Allows','Type','Matchup','O','U','Pace','Spread','Total','Teammates on the report'];
  return navProps()+box(title,`<p class="lede">Research ${all?'points, threes, assists, and rebounds':a.toLowerCase()} with real game logs, recent hit rates, and opponent context.</p>`+
    (ast?tools(btn('YTD Model Performance','performance','NBA')):''),'Click a player to open the game log. K marks a public Kalshi quote. Guard and forward sub-positions are inferred from box scores when the feed only lists G or F.')+
    slate({date:true})+tools(select('Position','position',positions)+toggles(['With A Line','Every Player'],'pricing')+(!S.f.allGames?btn('All games','flip','allGames'):''))+
    box('',tools(btn('Filters ▾','flip','filters','outline')+(all?Object.keys(nbaKeys).map(k=>btn(k,'marketFilter',k,S.f.markets?.includes(k)??true?'on':'')).join(''):''),'tight')+
      (expanded?tools(search()+select('Game','gameFilter',['All games',...S.games.map(g=>[g.id,g.a+' @ '+g.h])])):''),'','slate')+
    `<p class="tiny">${list.length} ${priced?'priced markets':'player and market rows'}${!S.odds.length?' · No player price feed connected. Season averages are available under Every Player.':''}</p>`+
    table(columns,rows,{cls:'wide',wrap:'box',sort:'nba-props',empty:priced?'No prices match these filters. Choose Every Player to see the public game logs.':'No players match these filters.',
      groups:ast?[group('',6),group('Hit Rate – Over Tonight’s Line',2),group('Reads',4),group('Tonight’s Game',2)]:[group('',all?7:8),group('Hit Rate – Over Tonight’s Line',5),group('Reads',5),group('Tonight’s Game',4)]});
}
const cardCats=['All','Points','Threes','Paint & Mid-Range','Rebounds','Turnovers','Free Throws','Pace & Total'];
const features=[['Points','Scoring','ppg'],['Threes','Three-Point Volume','threes'],['Paint & Mid-Range','Paint Scoring','paint'],['Rebounds','Glass','oreb'],['Turnovers','Ball Security','tov'],['Free Throws','Free Throw Rate','ftr'],['Pace & Total','Pace','pace']];
function standouts(){
  const w=S.f.window||'Season',all=teams().map(t=>teamStat(t,w)),cards=[];
  for(const g of S.games)for(const t of [g.a,g.h]){
    const o=t===g.a?g.h:g.a,x=teamStat(t,w),y=teamStat(o,w);
    for(const [cat,n,k] of features){
      const p=k==='pace'?'game':'o',q=k==='pace'?'game':'d';
      const rr=ranks(all,a=>a[p][k],k==='tov').get(t),dd=ranks(all,a=>a[q][k],q==='d'&&k!=='oreb').get(o);
      if(rr==null||dd==null)continue;
      const strength=dd-rr;
      if(Math.abs(strength)<8)continue;
      cards.push({cat,g,t,o,strength,n,rr,dd,val:x[p][k],opp:y[q][k],k});
    }
  }
  const v=S.f.cat||'All',list=cards.filter(r=>v==='All'||v===r.cat).sort((a,b)=>Math.abs(b.strength)-Math.abs(a.strength));
  const render=r=>card(team(r.t)+' · '+esc(r.n),`<p class="tiny">${versus(r.g)} · ${esc(r.cat)}</p>`+grid(2,[metric(r.t+' Offense',display(r.k,r.val),ordinal(r.rr)),metric(r.o+' Defense',display(r.k,r.opp),ordinal(r.dd))]),r.strength>0?'good':'bad');
  return `<h1>Slate Standouts ${info('Teams stand out when a strength meets a vulnerable opponent, or the reverse.')}</h1>`+slate({navOnly:true})+
    tools(cardCats.map(k=>toggle(k+(k==='All'?'':' '+cards.filter(r=>r.cat===k).length),'cat',k)).join('')+toggles(['Season','Last 10'],'window')+btn(S.f.sortGame?'Sort By Strength':'Sort By Game','flip','sortGame'))+
    tools(badge('▲ '+list.filter(x=>x.strength>0).length+' Standouts','g')+badge('▼ '+list.filter(x=>x.strength<0).length+' Tough Spots','r')+badge(S.games.length+' Games'))+
    (S.f.sortGame?S.games.map(g=>box(versus(g),grid(3,list.filter(x=>x.g===g).map(render)))).join(''):
    box('▲ Biggest Standouts Tonight',grid(3,list.filter(x=>x.strength>0).slice(0,18).map(render)))+box('▼ Tough Spots Tonight',grid(3,list.filter(x=>x.strength<0).slice(0,18).map(render))));
}
function shotZoneReport(list,zone){
  const l=list.filter(r=>distanceZone(r)===zone);return {n:l.length,fg:l.filter(x=>x[7]).length,p:rate(l,x=>x[7]),s:div(l.length,list.length)};
}
function zoneTargets(){
  const source=shots(),m=S.f.zoneMarket||'Points',mv=S.f.zoneView||'Best & Worst Spots', minimum=+(S.f.minimum||0);
  let rows=scheduled().filter(p=>source.players[p.id]?.length>=minimum&&source.players[p.id]?.length>0).map(p=>{
    const g=gamesFor(p.team),opp=g.a===p.team?g.h:g.a,own=source.players[p.id],op=source.def[opp]||[];
    const z=zones.filter(z=>m==='Points'||z.includes('3')).map(z=>[z,shotZoneReport(own,z),shotZoneReport(op,z),shotZoneReport(source.all,z)]);
    const v=total(z,([,p,d,b])=>(p.s||0)*((d.p??b.p??0)-(b.p||0)));
    const sh=total(z,([,p,d,b])=>(p.s||0)*((d.s??b.s??0)-(b.s||0)));
    const top=[...z].sort((a,b)=>(b[1].s||0)-(a[1].s||0)).slice(0,2).map(([z,p])=>z+' '+pct(p.s)).join(' · ');
    return {p,g,opp,v,sh,top,o:propOdds(p,m),n:own.length};
  });
  if(mv==='Matchup View'&&S.game)rows=rows.filter(x=>x.g===S.game);
  const render=(list,side)=>table(['Player','VS','Type','Score','Shots','Makes','Line','Odds','Why','Sample'],list.slice(0,S.f.more?100:10).map(r=>[person(r.p),team(r.opp),type(r.p.id),cell(signed((r.v+r.sh)*100)+'%',heat(r.v+r.sh,0,.025)),signed(r.sh*100)+'%',signed(r.v*100)+'%',r.o?.line??'—',esc((side?r.o?.over:r.o?.under)||'—'),esc(r.top),r.n]),{sort:side?'zones-over':'zones-under',wrap:'box'});
  return `<h1>Zone Matchup Targets ${info('Shot frequency and opponent field-goal percentage by zone, compared with the league.')}</h1>`+
    tools(toggles(['Best & Worst Spots','Matchup View'],'zoneView')+toggles(['Points','Threes'],'zoneMarket')+btn('YTD Model Performance','performance','NBA')+select('His Shots','minimum',[[0,'Any'],[20,'20+'],[50,'50+'],[100,'100+']]))+slate(mv==='Matchup View'?{}:{navOnly:true})+
    '<p class="subtle">Green indicates a favorable zone mix. Red indicates the opponent has defended those shots well.</p>'+
    box('Best Spots · Overs',render([...rows].sort((a,b)=>b.v+b.sh-a.v-a.sh),true))+box('Tough Spots · Unders',render([...rows].sort((a,b)=>a.v+a.sh-b.v-b.sh),false))+tools(btn(S.f.more?'Show less':'Show All','flip','more'));
}
const letters='ABCDEFGHIJK'.split('');
const shotTypes=['Catch & Shoot','Pull-up','Fade','Floater','Hook','Drive','Cut','Lob','Putback'];
function typePage(){
  const v=S.f.view||'The 11 Types',sh=shots(),list=players().filter(p=>(sh.players[p.id]?.length||0)>=15);
  let body;
  if(v==='Defense vs Type'){
    body=table(['Team',...letters],teams().map(t=>[team(t),...letters.map(k=>{const x=(sh.def[t]||[]).filter(r=>type(r[0])===k),p=rate(x,r=>r[7]);return cell(pct(p),heat(p,.47,.045,true));})]),{sort:'types-def',wrap:'box'});
  }else if(v==='Every Player'||v==='Tonight'){
    body=tools(search()+select('Type','typeFilter',['All',...letters]))+table(['Player','Type','Shots','Avg Dist','3PT',...shotTypes],
      list.filter(p=>(v!=='Tonight'||gamesFor(p.team))&&(!S.f.typeFilter||S.f.typeFilter==='All'||type(p.id)===S.f.typeFilter)&&(!S.f.search||p.name.toLowerCase().includes(S.f.search.toLowerCase())))
      .sort((a,b)=>sh.players[b.id].length-sh.players[a.id].length).map(p=>{const s=sh.players[p.id];return [person(p),badge(type(p.id),'g'),s.length,round(mean(s,r=>r[5])),pct(rate(s,r=>r[6]===3)),...shotTypes.map(k=>pct(rate(s,r=>r[8]===k)))];}),{sort:'types-players',wrap:'box'});
  }else{
    body=table(['Type','Players','Avg Dist','3PT',...shotTypes,'Most shots in the type'],letters.map(k=>{
      const p=list.filter(p=>type(p.id)===k).sort((a,b)=>sh.players[b.id].length-sh.players[a.id].length),s=p.flatMap(x=>sh.players[x.id]);
      return [btn(k,'typeOpen',k,'outline'),p.length,round(mean(s,r=>r[5])),pct(rate(s,r=>r[6]===3)),...shotTypes.map(k=>pct(rate(s,r=>r[8]===k))),esc(p.slice(0,6).map(x=>x.name).join(', '))];
    }),{sort:'types-index',wrap:'box'});
  }
  return `<h1>Player Types ${info('Players are grouped by their measured shot mix. These public-data groups use locally defined rules.')}</h1>`+tools(toggles(['Tonight','The 11 Types','Every Player','Defense vs Type'],'view'))+
    '<p class="subtle">Click a letter to see every player in that shot profile.</p>'+body;
}

const nbaName=name=>String(name||'').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const gameNumber=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
function defenseLogs(stat,profile,key,byType){
  const memo=reset();
  memo.parlayDefense??=new Map();
  const tag=[stat,profile,byType].join('/');
  if(memo.parlayDefense.has(tag))return memo.parlayDefense.get(tag);
  const byOpponent=new Map();
  const samples=new Map();
  for(const player of players()){
    if((byType?type(player.id):player.pos)!==profile)continue;
    const usable=player.logs.filter(log=>Number.isFinite(log[key])&&log[5]>0);
    const avg=mean(usable,r=>r[key]);
    for(const log of usable){
      const games=byOpponent.get(log[3])||new Map();
      const values=games.get(log[0])||[];
      values.push(byType?log[key]-avg:log[key]);
      games.set(log[0],values);byOpponent.set(log[3],games);
      const sample=samples.get(log[3])||[];
      sample.push(log[key]);samples.set(log[3],sample);
    }
  }
  const deltas=new Map([...byOpponent].map(([opponent,games])=>[opponent,[...games.values()].map(values=>byType?mean(values):total(values))]));
  const rank=allowedRanks([...deltas].map(([opponent,values])=>[opponent,mean(values)]));
  const result={deltas,rank,samples};
  memo.parlayDefense.set(tag,result);
  return result;
}

export function parlayData(quotes=S.odds){
  const memo=reset(), previous=memo.parlayData;
  const useCache=quotes===S.odds;
  if(useCache&&previous&&previous.games===S.games&&previous.odds===S.odds&&previous.injuries===S.injuries)return previous;
  const byPlayer=new Map();
  for(const quote of quotes){
    const key=quote.id==null?'name:'+nbaName(quote.player):'id:'+quote.id, list=byPlayer.get(key)||[];
    list.push(quote);byPlayer.set(key,list);
  }
  const roster=scheduled();
  const byTeam=new Map();
  for(const p of roster){
    const list=byTeam.get(p.team)||[];
    list.push(p);byTeam.set(p.team,list);
  }
  const rows=roster.flatMap(player=>{
    const game=gamesFor(player.team), opp=game.a===player.team?game.h:game.a;
    const spread=gameNumber(game.odds?.spread)??gameNumber(game.odds?.details?.match(/([+-]\d+(?:\.\d+)?)\s*$/)?.[1]);
    const report=S.injuries[teamName(player.team)]||[];
    const status=report.find(x=>nbaName(x.name)===nbaName(player.name))?.status;
    const isOut=x=>/^(out|injured reserve|suspension|suspended)$/i.test(x||'');
    const teammates=byTeam.get(player.team)||[];
    const absences=report.filter(x=>/^out$|^injured reserve$/i.test(x.status||'')&&nbaName(x.name)!==nbaName(player.name)).flatMap(x=>{
      const teammate=teammates.find(p=>nbaName(p.name)===nbaName(x.name));
      const recent=teamStat(player.team).l.slice(-3);
      if(!teammate||recent.filter(game=>teammate.logs.some(r=>r[0]===game[0]&&r[5]>0)).length<2)return [];
      const played=new Set(teammate.logs.filter(r=>r[2]===player.team&&r[5]>0).map(r=>r[0]));
      return [{name:x.name,played}];
    });
    return markets.flatMap(stat=>{
      const matches=propQuotes(player,stat,[...byPlayer.get('id:'+player.id)||[],...byPlayer.get('name:'+nbaName(player.name))||[]]);
      if(!matches.length)return [];
      const key=nbaKeys[stat], logs=player.logs.filter(r=>r[5]>0&&Number.isFinite(r[key]));
      const season=logs.map(r=>r[key]), home=logs.filter(r=>r[4]==='home').map(r=>r[key]),
        away=logs.filter(r=>r[4]==='away').map(r=>r[key]);
      const last5=season.slice(-5), last10=season.slice(-10), avg=mean(season);
      const pType=type(player.id), needsType=stat==='Points'||stat==='Threes';
      const defense=defenseLogs(stat,needsType?pType:player.pos,key,needsType);
      const vs=defenseLogs(stat,player.pos,key,false);
      // Match the prop board's read inputs, including the position average per player appearance.
      return matches.map(quote=>({date:S.day,player,game,opp,stat,quote,spread:spread==null?null:Math.abs(spread),
        total:gameNumber(game.odds?.total),avg,form:{season,last5,last10,home,away,venue:game.h===player.team?home:away},
        reads:[mean(last5),mean(last10),avg,mean(home),mean(away),mean(vs.samples.get(opp)||[])].filter(x=>x!=null),
        type:pType,typeDeltas:needsType&&pType!=='—'?defense.deltas.get(opp)||[]:[],typeRank:needsType?defense.rank.get(opp):null,posRank:vs.rank.get(opp),
        pace:mean([teamStat(player.team).game.pace,teamStat(opp).game.pace].filter(x=>x!=null)),
        threeRate:teamStat(player.team).o.tpr,out:isOut(status),uncertain:/day.to.day|questionable|doubtful|^dtd$/i.test(status||'')?status:null,
        injuryReport:Object.hasOwn(S.injuries,teamName(player.team)),
        absences:absences.map(({name,played})=>{
          const without=logs.filter(r=>r[2]===player.team&&!played.has(r[0]));
          return {name,n:without.length,delta:without.length>=3?mean(without,r=>r[key])-avg:null};
        })}));
    });
  });
  const data={rows,roster,games:S.games,odds:S.odds,injuries:S.injuries};
  if(useCache)memo.parlayData=data;
  return data;
}
function courtSvg(data,label){
  const dots=data.filter(r=>r[3]!=null&&r[4]!=null).slice(-1600).map(r=>{
    const x=190+(r[4]||0)*7.15,y=324-(47-Math.abs(r[3]))*6.9;
    return `<circle cx="${Math.min(372,Math.max(8,x))}" cy="${Math.min(330,Math.max(9,y))}" r="3" fill="${r[7]?'#35db89':'#f37682'}" opacity=".62"/>`;
  }).join('');
  return `<svg role="img" aria-label="${esc(label)}" class="chart-svg" viewBox="0 0 380 345"><g fill="none" stroke="#607393" stroke-width="1.4"><path d="M11 13 H369 V331 H11 Z M11 13 A53 53 0 0 0 117 13 M137 331 V198 H243 V331 M150 331 V198 H230 V331 M137 198 A53 53 0 0 1 243 198 M32 331 V243 A170 170 0 0 1 348 243 V331 M158 302 H222"/><circle cx="190" cy="287" r="7"/><path d="M160 289 A30 30 0 0 1 220 289"/></g>${dots}</svg>`;
}
function shotCharts(){
  const g=S.game, t=S.f.offense||g?.a||teams()[0],o=S.f.defense||g?.h||teams().find(x=>x!==t);
  const sh=shots(), roster=players().filter(p=>p.team===t).sort((a,b)=>(sh.players[b.id]?.length||0)-(sh.players[a.id]?.length||0)),p=roster.find(p=>p.id===S.f.player)||roster[0];
  const ps=p?sh.players[p.id]||[]:[],ds=sh.def[o]||[];
  const head=tools(S.games.flatMap(g=>[[g.a,g.h],[g.h,g.a]].map(([a,b])=>btn(logo(a)+' '+a,'shotMatch',a+':'+b,t===a?'on':''))).join(''))+
    tools(roster.slice(0,18).map(x=>btn(esc(x.name),'set','player:'+x.id,p?.id===x.id?'on':'')).join(''));
  const sec=tools(select('Offense','offense',teams().map(x=>[x,teamName(x)]))+select('Player','player',roster.map(x=>[x.id,x.name+' ('+(sh.players[x.id]?.length||0)+')']))+'<span class="subtle">vs</span>'+select('Defense','defense',teams().map(x=>[x,teamName(x)])));
  return slate()+head+box('Shot Charts',sec+grid(2,[card(esc(p?.name||'Offense'),courtSvg(ps,'Player shot chart')),card(esc(teamName(o))+' Defense',courtSvg(ds,'Opponent shot chart'))],'courtgrid')+
    '<p class="tiny">Green = made; red = missed. Free throws are excluded.</p>','Shot coordinates and outcomes come from hoopR play-by-play.')+box('Zone By Zone',
      table(['Zone','FG','FG%','vs LG','Share','FG','FG%','vs LG','Share','FG%','Share','Call'],zones.map(k=>{
        const a=shotZoneReport(ps,k),b=shotZoneReport(ds,k),c=shotZoneReport(sh.all,k);
        return [esc(k),a.fg+'/'+a.n,cell(pct(a.p),heat(a.p,c.p,.06)),a.p!=null&&c.p!=null?signed((a.p-c.p)*100)+'%':'—',pct(a.s),b.fg+'/'+b.n,cell(pct(b.p),heat(b.p,c.p,.06,true)),b.p!=null&&c.p!=null?signed((b.p-c.p)*100)+'%':'—',pct(b.s),pct(c.p),pct(c.s),a.n&&b.p>c.p?'Favorable':'—'];
      }),{groups:[group('',1),group(esc(p?.name||'Offense'),4),group(o+' Defense Allows',4),group('League',2),group('',1)],sort:'shot-zones',wrap:'box'}));
}
// ---- First basket: the whole-slate board (first-basket.mjs holds the model). ----
const fbOutNow=x=>/^(out|injured reserve|suspension|suspended)$/i.test(x||'');
const fbPrices=()=>local('fb-prices:'+S.day,{});
const fbScratched=()=>local('fb-out:'+S.day,[]);
export function fbPrice(id,value){const all=fbPrices();if(String(value).trim())all[id]=String(value).trim();else delete all[id];keep('fb-prices:'+S.day,all);}
// Projected starters: who started the team's last game, minus anyone listed out or scratched here, filled by recent starts.
function projectedStarters(t,report,scratched){
  const roster=players().filter(p=>p.team===t);
  const games=(source().tg?.[t]||[]).filter(r=>r[1]<S.day).sort((a,b)=>a[1].localeCompare(b[1]));
  const last=games.at(-1)?.[0], recent=new Set(games.slice(-5).map(r=>r[0]));
  const status=p=>report.find(x=>nbaName(x.name)===nbaName(p.name))?.status;
  const starts=p=>p.logs.filter(r=>r[16]&&recent.has(r[0])).length;
  const ranked=[...roster].sort((a,b)=>Number(b.logs.some(r=>r[0]===last&&r[16]))-Number(a.logs.some(r=>r[0]===last&&r[16]))||starts(b)-starts(a)||b.min-a.min);
  const out=roster.filter(p=>fbOutNow(status(p))||scratched.includes(p.id));
  return {starters:ranked.filter(p=>!out.includes(p)).slice(0,5).map(p=>({p,status:status(p)||null,lastStarted:p.logs.some(r=>r[0]===last&&r[16])})),
    out:out.filter(p=>ranked.indexOf(p)<5).map(p=>({p,status:scratched.includes(p.id)?'Scratched here':status(p)}))};
}
export function firstBasketBoard(){
  const m=reset(), key=JSON.stringify([fbScratched(),S.games.map(g=>g.id)]);
  if(m.fb&&m.fbKey===key&&m.fbInjuries===S.injuries)return m.fb;
  const src=source(), first=src.first||{}, opening=openingTables(first,S.day), shotT=shotTables(src.shots,S.day,src.dates), sh=shots();
  const scratched=fbScratched(), games=[];
  for(const g of S.games){
    const tf=teamFirst(opening,g.a,g.h), side={};
    for(const t of [g.a,g.h]){
      const opp=t===g.a?g.h:g.a, report=S.injuries[teamName(t)]||[], {starters,out}=projectedStarters(t,report,scratched);
      const tg=new Map((src.tg?.[t]||[]).map(r=>[r[0],r]));
      const startsBy=Object.fromEntries(starters.map(({p})=>[p.id,p.logs.filter(r=>r[16]&&r[2]===t).map(r=>r[0])]));
      const early=earlyShares(first,t,startsBy,S.day);
      const cands=starters.map(({p})=>{
        const l=p.logs, att=total(l,r=>r[10]+.44*r[12]), mins=total(l,r=>r[5]), teamAtt=total(l,r=>{const x=tg.get(r[0]);return x?x[7]+.44*x[10]:0;});
        const usage=mins&&teamAtt?Math.min(.45,att/mins*48*l.length/teamAtt):.2;
        const fta=total(l,r=>r[12]), ftm=total(l,r=>r[6]-2*r[15]-r[7]), ftPct=(ftm+20*.78)/(fta+20);
        const edge=makeEdge(sh.players[p.id]||[],opp,shotT);
        return {id:p.id,share:blendShare(early[p.id]||{},usage),usage,make:shotT.early*edge,edge,
          ftShare:att?.44*fta/att:.15,ftScore:1-(1-ftPct)**2,parts:early[p.id]||{}};
      });
      const given=scorerShares(cands,shotT.early);
      side[t]={opp,out,bench:given.bench,starters:starters.map(({p,status,lastStarted},i)=>{
        const c=cands[i], s=given.players[p.id];
        return {p,status,lastStarted,team:t,opp,game:g,teamFirst:tf.first[t],share:s.share,given:s.given,prob:tf.first[t]*s.given,
          usage:c.usage,edge:c.edge,ftShare:c.ftShare,early:c.parts.early,firstShot:c.parts.firstShot,games:c.parts.games||0};
      })};
    }
    const rows=[g.a,g.h].flatMap(t=>side[t].starters);
    games.push({g,tf,side,rows,sum:rows.reduce((a,r)=>a+r.prob,0),opening});
  }
  m.fb={games,rows:games.flatMap(x=>x.rows),league:opening.league,early:shotT.early};m.fbKey=key;m.fbInjuries=S.injuries;
  return m.fb;
}
function firstBasketView(){
  const board=firstBasketBoard(), f=S.f, prices=fbPrices(), hold=(+f.fbHold||30)/100, minEdge=(+f.fbMinEdge||0)/100, ratio=+f.fbRatio||1;
  if(!board.rows.length)return box('First Basket Board · Whole Slate',empty('No games on this slate.'));
  const kalshi=r=>propQuotes(r.p,'First Basket',S.odds)[0]?.over;
  const priceOf=r=>prices[r.p.id]??kalshi(r)??'';
  const fair={};
  for(const x of board.games)Object.assign(fair,fairChances(Object.fromEntries(x.rows.map(r=>[r.p.id,priceOf(r)]).filter(([,v])=>v!=='')),hold).fair);
  const verdict=r=>{const fc=fair[r.p.id];if(fc==null)return null;const e=r.prob-fc;return {fair:fc,edge:e,play:e>=minEdge&&r.prob>=ratio*fc};};
  const rows=[...board.rows].sort((a,b)=>b.prob-a.prob), shown=f.fbShow==='All starters'?rows:rows.slice(0,30);
  const plays=rows.map(r=>({r,v:verdict(r)})).filter(x=>x.v?.play).map(x=>({...x,edge:x.v.edge,game:x.r.game.id}));
  const rr=roundRobin(plays,Math.max(2,Math.min(8,+f.fbRR||3)),Math.max(2,Math.min(4,+f.fbBy||2)));
  const nameCell=r=>cell(person(r.p).html+(r.status?' '+badge(r.status,'r'):'')+(!r.lastStarted?' '+badge('Fill-in starter'):''),'player-cell');
  const board1=table(['#','Player','Game','Team 1st','Share if team 1st','First basket','Fair odds','Price','No-vig','Edge','Call',''],shown.map((r,i)=>{
    const v=verdict(r);
    return [i+1,nameCell(r),esc(r.game.a+' @ '+r.game.h+' · '+et(r.game)),pct(r.teamFirst,1),pct(r.given,1),cell(pct(r.prob,1),heat(r.prob,.08,.04)),
      esc(americanFrom(r.prob)),`<input class="fb-price" type="text" inputmode="numeric" placeholder="+600" aria-label="Price for ${esc(r.p.name)}" data-fb-price="${esc(r.p.id)}" value="${esc(priceOf(r))}">`,
      v?pct(v.fair,1):'—',v?cell((v.edge>=0?'+':'')+pct(v.edge,1),heat(v.edge,0,.03)):'—',v?badge(v.play?'Play':'Skip',v.play?'g':''):'—',btn('Scratch','fbOut',r.p.id,'outline')];
  }),{wrap:'box',cls:'compact'});
  const scratched=board.games.flatMap(x=>Object.values(x.side).flatMap(s=>s.out)).map(o=>btn(esc(o.p.name+' · '+(o.status||'out'))+(fbScratched().includes(o.p.id)?' ×':''),fbScratched().includes(o.p.id)?'fbOut':'noop',o.p.id,'outline')).join('');
  const checks=table(['Game','Tip','Score per possession','Team scores first','Starters total',''],board.games.map(x=>{
    const {g,tf}=x, ok=x.sum>=.9&&x.sum<=1.001;
    return [esc(g.a+' @ '+g.h),esc(g.a+' '+pct(tf.tip,0)+' ('+tf.tipRecord[g.a].join('/')+' tips) · '+g.h+' '+pct(1-tf.tip,0)+' ('+tf.tipRecord[g.h].join('/')+')'),
      esc(g.a+' '+pct(tf.pos[g.a].p,0)+' · '+g.h+' '+pct(tf.pos[g.h].p,0)),esc(g.a+' '+pct(tf.first[g.a],1)+' · '+g.h+' '+pct(tf.first[g.h],1)),
      cell(pct(x.sum,1),ok?'good heat':'bad heat'),ok?'':badge('Check model','r')];
  }),{wrap:'box',cls:'compact'});
  const rrBody=rr.picks.length<2?empty('Fewer than two plays clear the edge filters. Enter prices to compare, or lower the minimum edge.'):
    `<p class="subtle">${rr.picks.length} plays, one per game, by ${rr.combos[0].length}s: ${rr.combos.length} tickets. Each ticket pays only if every player in it scores first in his game.</p>`+
    table(['Ticket','Players','Model chance','Price (combined)'],rr.combos.map((c,i)=>{
      const p=c.reduce((a,x)=>a*x.r.prob,1), q=c.reduce((a,x)=>a*impliedChance(priceOf(x.r)),1);
      return [i+1,esc(c.map(x=>x.r.p.name).join(' + ')),pct(p,2),esc(americanFrom(q))];
    }),{wrap:'box',cls:'compact'});
  return box('First Basket Board · Whole Slate',
    `<p class="subtle">P(first basket) = P(team scores first) × P(he scores | team scores first). Team: tip rate shrunk toward 50%, then alternating possessions scored at each team's opening-possession rate against what the opponent allows (league ${pct(board.league,0)}). Player: share of the team's attempts in its first 8 possessions, blended with first-shot share and shrunk toward usage, times a ${pct(board.early,0)} early make rate adjusted only for a real shot-type edge, plus free throws. Free throws count as the first basket.</p>`+
    tools(select('Show','fbShow',['Top 30','All starters'])+`<label class="field">Min. edge (pts) <input type="number" min="0" max="20" step=".5" data-field="fbMinEdge" value="${esc(f.fbMinEdge)}"></label>`+
      `<label class="field">Min. ratio <input type="number" min="1" max="3" step=".05" data-field="fbRatio" value="${esc(f.fbRatio)}"></label>`+
      `<label class="field">Hold for partial boards % <input type="number" min="0" max="80" step="1" data-field="fbHold" value="${esc(f.fbHold)}"></label>`)+
    (scratched?tools('<span class="subtle">Out or scratched:</span>'+scratched):'')+board1+
    `<p class="subtle">Type your sportsbook price for any player (Kalshi prices fill in when Kalshi lists this market). No-vig: a full board is normalized to 100%; a partial board is divided by the hold above. A play needs the edge and the ratio (model ÷ no-vig) both. Starters are projected from the last game and the injury report; scratch anyone ruled out when lineups post and the board re-runs.</p>`,
    'Your prices are saved in this browser for this date. First basket is a hard market: even good picks hit single digits to low double digits per leg, so size it as a small side bet.')+
  box('Round Robin',tools(`<label class="field">Plays <input type="number" min="2" max="8" data-field="fbRR" value="${esc(f.fbRR)}"></label>`+select('By','fbBy',[['2','2s'],['3','3s'],['4','4s']]))+rrBody)+
  box('Model Check',checks+'<p class="subtle">Across a game\'s ten starters the first-basket chances should total about 95–100% (the bench takes the rest). A total outside 90–100% means a starter is missing or a share is off.</p>')+
  fbCalibration();
}
function fbCalibration(){
  const summary=(list,label)=>{
    const graded=list.filter(x=>x.actual!=null), nights=new Set(graded.map(x=>x.date)).size;
    const rows=graded.flatMap(x=>x.players.map(([id,,,p])=>({p,hit:x.actual===id?1:0})));
    const bins=[[0,.05],[.05,.1],[.1,.15],[.15,.2],[.2,.3],[.3,1]].map(([a,b])=>{const r=rows.filter(x=>x.p>=a&&x.p<b);return [pct(a,0)+'–'+pct(b,0),r.length,r.length?pct(mean(r,x=>x.p),1):'—',r.length?pct(mean(r,x=>x.hit),1):'—'];});
    const brier=rows.length?mean(rows,x=>(x.p-x.hit)**2):null, even=rows.length?mean(rows,x=>(.097-x.hit)**2):null;
    const teamRight=graded.filter(x=>x.actualTeam).filter(x=>{const t=k=>x.players.filter(p=>p[2]===k).reduce((a,p)=>a+p[3],0);return (t(x.a)>t(x.h))===(x.actualTeam===x.a);}).length;
    const missed=graded.filter(x=>!x.players.some(p=>p[0]===x.actual)).length;
    return card(label,`<p class="subtle">${graded.length} games over ${nights} game-nights.${brier!=null?' Brier '+round(brier,4)+' vs '+round(even,4)+' for an even split among starters (lower is better).':''}${graded.length?' Team side right in '+teamRight+' of '+graded.length+'. First scorer not on the board: '+missed+'.':''}</p>`+
      table(['Model chance','Starters','Average model','Scored first'],bins,{wrap:'box',cls:'compact'}));
  };
  const log=S.fbLog||{live:[],backtest:[]}, nights=new Set((log.live||[]).filter(x=>x.actual!=null).map(x=>x.date)).size;
  return box('Calibration Log',`<p class="subtle">${nights<100?'Under 100 live game-nights: treat the numbers as rough.':'Use this to adjust the shrinkage and weights.'} The backtest replays each past night with only the data available before it and starters projected from the previous game, without injury reports, so most of its misses are lineup changes.</p>`+
    grid(2,[summary(log.live||[],'Live: saved before tip'),summary(log.backtest||[],'Backtest: this season')]),
    'Each hourly run saves the board before tip; the archive\'s first scorer (free throws count) grades it the next morning.');
}
function basket(){
  const g=S.game;if(!g)return slate()+firstBasketView();
  const first=source().first||{},sh=shots();
  const roster=t=>players().filter(p=>p.team===t&&p.logs.some(x=>x[16])).sort((a,b)=>total(b.logs.slice(-5),x=>x[16])-total(a.logs.slice(-5),x=>x[16])||b.min-a.min).slice(0,5);
  const item=(t,o)=>teamBanner(t,'Recent starters')+table(['Player','Shot Early','1st Shot','Scored 1st','Team Share','1st FG','Defense Type','Best'],roster(t).map(p=>{
    const r=p.logs.filter(x=>x[16]&&first[x[0]]);
    const event=(k,teamOnly=false)=>rate(r,x=>(teamOnly?first[x[0]].by[t]?.[k]:first[x[0]][k])===p.id);
    const open=(sh.players[p.id]||[]).filter(x=>x[9]),all=sh.players[p.id]||[];
    return [person(p),pct(div(open.length,all.length)),pct(event('firstShot')),pct(event('firstPts')),pct(event('shot',true)),pct(event('firstFg')),type(p.id),cell(pct(event('pts',true)),heat(event('pts',true),.14,.1))];
  }),{sort:'basket-'+t});
  const history=t=>Object.values(first).filter(x=>x.date<S.day&&x.by[t]);
  return slate()+firstBasketView()+hero(g)+tools(btn((S.hoops-1)+'–'+String(S.hoops).slice(-2),'noop','','on'))+box('Starters',
    '<p class="subtle">Starting candidates from recent box scores. First points include free throws.</p>'+grid(2,[item(g.a,g.h),item(g.h,g.a)]),'Click a player to see game-by-game stats.')+
    box('The Matchup',table([team(g.a),'The Tip',team(g.h)],[['Tip win rate','Season','Tip win rate'],[pct(rate(history(g.a),x=>x.tip===g.a)),'Jump ball',pct(rate(history(g.h),x=>x.tip===g.h))]]))+
    box('By Player Type: Every Letter Against Tonight’s Defense',table(['Team',...letters],[g.a,g.h].map(t=>[team(t),...letters.map(k=>history(t).filter(x=>x.by[t]?.pts&&type(x.by[t].pts)===k).length)]),{sort:'basket-types'}));
}
function kotc(){
  const target=scheduled().filter(p=>p.min>=12), samples=target.map(p=>{
    const g=gamesFor(p.team),opp=g.a===p.team?g.h:g.a,av=mean(p.logs,r=>r[6]), def=teamStat(opp).d.ppg;
    const leagueMean=mean(teams().map(t=>teamStat(t).d.ppg).filter(x=>x!=null)), mod=leagueMean?Math.min(1.15,Math.max(.85,def/leagueMean)):1;
    const sd=Math.sqrt(mean(p.logs,r=>(r[6]-av)**2)||0);
    return {...p,g,opp,av,projected:av*mod,sd:Math.max(4,sd),mod};
  });
  const prob=leaderShares(samples,x=>x.projected,x=>x.sd);
  samples.sort((a,b)=>prob.get(b.id)-prob.get(a.id)||b.av-a.av);
  const cutoff=S.f.more?samples.length:25;
  const defBoard=teams().filter(t=>!S.f.todayTeams||gamesFor(t)).map(t=>{
    const out=players().flatMap(p=>p.logs.filter(r=>r[3]===t).map(r=>[p,r]));
    const high=Object.values(out.reduce((m,[p,r])=>{m[r[0]]=Math.max(m[r[0]]||0,r[6]);return m;},{}));
    return [team(t),gamesFor(t)?'✓':'—',...[40,45,50,55,60].map(n=>high.filter(x=>x>=n).length),round(mean(high)),...['PG','SG','SF','PF','C'].map(k=>round(mean(out.filter(([p])=>p.pos===k),([p,r])=>r[6]))),high.length];
  });
  return `<h1>King of the Court ${info('Lead share estimates the chance of recording the most points across this slate. Ties split the share. This uses season scoring, variation, and opponent points allowed.')}</h1>`+
    tools(btn('Historical Data','history','NBA')+btn('Save image','export','King of the Court','primary right'))+slate({navOnly:true})+
    `<p class="subtle">${S.hoops-1}–${String(S.hoops).slice(-2)} regular season · ${Object.values(source().dates||{}).filter(d=>d<S.day).length} games before this slate.</p>`+
    table(['#','Player','Lead %','Proj','Avg','40+','45+','50+','55+','60+','Opp','Opp Top','VS Pos','Total','Spread'],samples.slice(0,cutoff).map((p,i)=>[i+1,person(p),cell(pct(prob.get(p.id),1),heat(prob.get(p.id),.065,.035)),cell(round(p.projected),heat(p.projected,18,7)),round(p.av),...[40,45,50,55,60].map(n=>{const c=p.logs.filter(r=>r[6]>=n).length;return cell(c,heat(c,1,.5));}),team(p.opp),round(mean(players().flatMap(x=>x.logs.filter(r=>r[3]===p.opp&&x.pos===p.pos)),r=>r[6])),signed((p.mod-1)*100,0)+'%',p.g.odds?.total??'—',esc(p.g.odds?.details??'—')]),{sort:'kotc',cls:'compact'})+
    tools(btn(S.f.more?'Show less':'Show all '+samples.length,'flip','more'))+box('Defense Board',tools(btn(S.f.todayTeams?'Show All Teams':'Hide Teams Not Playing','flip','todayTeams')+btn('Save image','export','Defense Board','primary'))+
    table(['Team','Tonight','40+','45+','50+','55+','60+','Top Opp','vs PG','vs SG','vs SF','vs PF','vs C','GP'],defBoard,{sort:'kotc-defense'}))+
    box('Nightly Leaders',nightly(16)+tools(btn('Show more','history','NBA')))+box('Leader Trends',tools(toggles(['Pregame Rank','Spread & Total'],'trend')+btn('Save image','export','Leader Trends','primary'))+
      (S.f.trend==='Spread & Total'?table(['Game','Spread','Total'],S.games.map(g=>[versus(g),esc(g.odds?.details||'—'),g.odds?.total??'—'])):nightly(8)));
}
function nightly(n=40){
  const map=new Map();
  for(const p of players())for(const r of p.logs)if(!map.has(r[1])||map.get(r[1])[1]<r[6])map.set(r[1],[p,r[6]]);
  return table(['Day','Nightly Leader','Points'],[...map].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,n).map(([date,[p,pt]])=>[esc(date),person(p),pt]),{sort:'nba-history',cls:'compact'});
}
export function nbaPlayer(id){
  const p=players().find(p=>p.id===id);if(!p)return;
  const m=nbaKeys[S.route.title]?S.route.title:S.route.title==='Assist Spots'?'Assists':'Points',o=propOdds(p,m);
  dialog(p.name,teamBanner(p.team,p.pos)+tools(market(o?.line==null?'Save '+m:o.line+' '+(o.over||''),basePlay(p,m,undefined,{line:o?.line,odds:o?.over,side:'Over'})))+
    table(['Date','Opp','MIN','PTS','3PM','AST','REB','FGA','3PA','FTA'],[...p.logs].reverse().map(x=>[esc(x[1]),team(x[3]),...x.slice(5,13)])),true);
}
export function nbaAction(act,v,target){
  if(S.route.id==='nba-parlays'&&act.startsWith('parlay'))return parlayAction(act,v,parlayData(),target);
  if(act==='fbOut'){const list=fbScratched();keep('fb-out:'+S.day,list.includes(v)?list.filter(x=>x!==v):[...list,v]);return true;}
  if(act==='allSummaries'){dialog('All Matchup Summaries',S.games.map(g=>plain(versus(g),getSummary(g,S.f.window||'Season'))).join(''),true);return true;}
  if(act==='history'){dialog('Historical Data',nightly(75),true);return true;}
  return false;
}
export function nbaPage(){
  return ({'nba-props':propTable,'nba-parlays':()=>parlayPage(parlayData()),league,keys,standouts,zones:zoneTargets,types:typePage,shotcharts:shotCharts,basket,court:kotc})[S.route.id]();
}
export function nbaResult(p){
  const idx=nbaKeys[p.market];if(idx==null)return null;
  return (source().pg?.[p.id]||[]).find(r=>r[0]===p.game)?.[idx]??null;
}
