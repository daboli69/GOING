import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {parseNflFinal,nflBoxGrade} from '../scripts/nfl-finals.mjs';
import {compactNflParlays} from '../scripts/nfl-parlay-archive.mjs';
import {compactNbaParlays} from '../scripts/nba-parlay-archive.mjs';
import {publicQuotes} from '../scripts/market-data.mjs';
import {current as S} from '../site/ui.mjs';
import {nflParlayData,nflSameGameData} from '../site/nfl.mjs';
import {parlayData as nbaParlayData} from '../site/nba.mjs';
import {ticketMath} from '../site/parlay-core.mjs';

test('official NFL grading requires a matching final and uses explicit stats including zero',()=>{
  const game={espn:'123',a:'KC',h:'ATL'}, key='completions/passingAttempts';
  const header={id:'123',status:{type:{completed:true,name:'STATUS_FINAL'}},competitors:[
    {homeAway:'away',team:{abbreviation:'KC'},score:'24'},{homeAway:'home',team:{abbreviation:'ATL'},score:'17'}]};
  const athlete={id:'1',displayName:'Test Player Jr.'};
  const summary={header:{competitions:[header]},boxscore:{players:[{team:{abbreviation:'KC'},statistics:[
    {name:'passing',keys:[key,'passingYards'],athletes:[{athlete,stats:['11/15','120']}]},
    {name:'rushing',keys:['rushingYards','rushingAttempts'],athletes:[{athlete,stats:['0','2']}]}
  ]}]}};
  const parsed=parseNflFinal(summary,game),now=Date.UTC(2026,10,15,22);
  const leg={team:'KC',player:'Test Player',side:'Under',line:1.5};
  assert.deepEqual([parsed.a,parsed.h],[24,17]);
  assert.equal(nflBoxGrade(parsed,{...leg,market:'Rushing'},now).result,'won');
  assert.equal(nflBoxGrade(parsed,{...leg,market:'Pass Attempts'},now).value,15);
  assert.equal(nflBoxGrade(parsed,{...leg,market:'Anytime TD'},now),null);
  assert.equal(nflBoxGrade(parsed,{...leg,team:'ATL',market:'Rushing'},now),null);
  assert.equal(parseNflFinal(summary,{...game,espn:'456'}),null);
  header.status.type.completed=false;
  assert.equal(parseNflFinal(summary,game),null);
});

test('NFL market reads are scoped to exact games and distinguish an empty market from a failure',async()=>{
  const game={a:'KC',h:'ATL',date:'2026-11-15'};
  let failures=[],requests=[];
  const quotes=await publicQuotes('nfl',[game],{onFailure:x=>{failures=x;},read:async u=>{
    if(u.pathname.endsWith('/events'))return Response.json({events:[],cursor:'incomplete'});
    const event=u.searchParams.get('event_ticker');
    requests.push(event);
    if(event.startsWith('KXNFLRSHATT'))return new Response(null,{status:400});
    const markets=event.startsWith('KXNFLRSHYDS')?[{event_ticker:event,title:'Sample Back: rushing',status:'active',
      floor_strike:30.5,yes_ask_dollars:'0.5300',yes_ask_size_fp:'2.00'}]:[];
    return Response.json({markets,cursor:''});
  }});
  assert.equal(requests.length,9);
  assert.ok(requests.every(s=>s.endsWith('-26NOV15KCATL')));
  assert.deepEqual(failures,[{market:'Rush Attempts',game}]);
  assert.equal(quotes.length,1);
  assert.equal(quotes[0].market,'Rushing');
  assert.equal(quotes[0].line,30.5);
});

test('NFL markets batch exact event tickers and retry only a matchup missing its nested markets',async()=>{
  const games=[{a:'KC',h:'ATL',date:'2026-11-15'},{a:'BUF',h:'NYJ',date:'2026-11-15'}];
  const listed='KXNFLRSHYDS-26NOV15KCATL', missing='KXNFLRSHYDS-26NOV15BUFNYJ';
  const market=(event_ticker,player)=>({event_ticker,title:player+': rushing',status:'active',
    floor_strike:31.5,yes_ask_dollars:'0.5300',yes_ask_size_fp:'2.00'});
  const bulk=[], exact=[], failures=[];
  const quotes=await publicQuotes('nfl',games,{onFailure:x=>failures.push(...x),read:async u=>{
    if(u.pathname.endsWith('/markets')){
      exact.push(u.searchParams.get('event_ticker'));
      return Response.json({markets:[market(missing,'Recovered Back')],cursor:''});
    }
    const events=u.searchParams.get('tickers').split(',');
    assert.equal(u.searchParams.get('with_nested_markets'),'true');
    assert.deepEqual(events.map(s=>s.split('-')[1]),['26NOV15KCATL','26NOV15BUFNYJ']);
    bulk.push(events);
    return Response.json({events:events.includes(listed)?[
      {event_ticker:listed,markets:[market(listed,'Listed Back'),market(missing,'Wrong Game')]},
      {event_ticker:missing}]:[],cursor:''});
  }});
  assert.equal(bulk.length,9);
  assert.deepEqual(exact,[missing]);
  assert.deepEqual(failures,[]);
  assert.deepEqual(quotes.map(q=>[q.player,q.a]),[['Listed Back','KC'],['Recovered Back','BUF']]);
});

test('NFL box-score zeroes require independent participation and a complete stat group',()=>{
  const game={espn:'123',a:'KC',h:'ATL'}, now=Date.UTC(2026,10,15,22);
  const athlete=(id,displayName,stats,didNotPlay=false)=>({athlete:{id,displayName},stats,didNotPlay});
  const receiving={name:'receiving',keys:['receptions','receivingYards'],totals:['3','43'],athletes:[
    athlete('1','Recorded Catch',['3','43']),athlete('2','Listed Player',['0','--'])]};
  const rushing={name:'rushing',keys:['rushingAttempts','rushingYards'],totals:['1','6'],athletes:[
    athlete('3','Rushed Once',['1','6']),athlete('4','Inactive Player',['1','0'],true),
  ]};
  const summary={header:{competitions:[{id:'123',status:{type:{completed:true,name:'STATUS_FINAL'}},competitors:[
    {homeAway:'away',team:{abbreviation:'KC'},score:'24'},{homeAway:'home',team:{abbreviation:'ATL'},score:'17'}]}]},
  boxscore:{players:[{team:{abbreviation:'KC'},statistics:[receiving,rushing]}]}};
  const grade=(player,market,side='Under')=>nflBoxGrade(parseNflFinal(summary,game),{team:'KC',player,market,line:.5,side},now);
  assert.equal(grade('Rushed Once','Receptions').result,'won');
  assert.equal(grade('Rushed Once','Receiving'),null,'an incomplete yardage column is insufficient');
  assert.equal(grade('Inactive Player','Receptions'),null);
  assert.equal(grade('Unknown Player','Receptions'),null);
  assert.equal(grade('Recorded Catch','Rushing'),null,'the rushing totals do not add up');
  receiving.athletes[1].stats[1]='0';
  assert.match(grade('Rushed Once','Receiving','Over').resultSource,/no recorded receiving/);
  assert.equal(grade('Rushed Once','Receiving','Over').result,'lost');
  rushing.athletes.pop();
  assert.equal(grade('Recorded Catch','Rushing').value,0);
  receiving.athletes.push(athlete('9','Rushed Once',['0','0']));
  assert.equal(grade('Rushed Once','Receptions'),null,'an ambiguous name is insufficient');
});

test('NFL final grading voids a documented pregame inactive only for that matchup',()=>{
  const game={espn:'123',a:'KC',h:'ATL',date:'2026-11-15',time:'13:00'}, now=Date.UTC(2026,10,15,22);
  const injury=(displayName,date,abbreviation)=>({athlete:{displayName},date,details:{fantasyStatus:{abbreviation}}});
  const summary={header:{competitions:[{id:'123',status:{type:{completed:true,name:'STATUS_FINAL'}},competitors:[
    {homeAway:'away',team:{abbreviation:'KC'},score:'24'},{homeAway:'home',team:{abbreviation:'ATL'},score:'17'}]}]},
  injuries:[{team:{abbreviation:'KC'},injuries:[
    injury('Inactive Player','2026-11-15T16:30Z','INACTIVE'),injury('Played Anyway','2026-11-15T16:30Z','INACTIVE'),
    injury('Old Report','2026-11-08T16:30Z','INACTIVE'),injury('Left Game','2026-11-15T19:00Z','INACTIVE'),
    injury('Questionable Player','2026-11-15T16:30Z','QUESTIONABLE')]}],
  boxscore:{players:[{team:{abbreviation:'KC'},statistics:[{name:'rushing',keys:['rushingYards'],
    athletes:[{athlete:{id:'1',displayName:'Played Anyway'},stats:['18']}]}]}]}};
  const box=parseNflFinal(summary,game);
  const grade=(player,team='KC')=>nflBoxGrade(box,{team,player,market:'Rushing',line:10.5,side:'Over'},now);
  assert.equal(grade('Inactive Player').result,'void');
  assert.equal(grade('Played Anyway').value,18);
  assert.equal(grade('Inactive Player','ATL'),null);
  for(const name of ['Old Report','Left Game','Questionable Player'])assert.equal(grade(name),null);
});

test('NFL combined estimates use the supplied leg estimate, including a touchdown’s price-based shrinkage',()=>{
  const leg={game:'g',price:300,form:{season:{hits:2,n:8}},chance:.25};
  assert.equal(ticketMath([leg],8,l=>l.chance).adjusted,.25);
  assert.ok(ticketMath([leg],8).adjusted>.4);
});

const data=new URL('../site/data/',import.meta.url);
const read=f=>JSON.parse(readFileSync(new URL(f,data),'utf8'));
test('the compact NBA archive preserves parlay form, type, pace and assist inputs',()=>{
  const day='2026-11-12', games=[{id:'next',a:'BOS',h:'NYK',odds:{spread:-3,total:224}}];
  const archive={teams:{BOS:['Celtics'],NYK:['Knicks']},players:{
    '10':['Test Guard','PG','','BOS'],'11':['Test Wing','SG','','BOS']},
  pg:{'10':[],'11':[]},tg:{BOS:[],NYK:[]},first:{},assists:{'10':[]},dates:{}};
  const shots={};
  for(let i=1;i<=8;i++){
    const id='game'+i, date='2026-11-0'+i;
    if(i===1)archive.first[id]={date,poss:[{ignored:true}]};
    else archive.dates[id]=date;
    archive.pg['10'].push([id,date,'BOS','NYK','away',31,16+i,3,7,4]);
    archive.pg['11'].push([id,date,'BOS','NYK','away',25,10+i,2,3,2]);
    archive.tg.BOS.push([id,date,'NYK','away',119,105,40,90,15,40,10,12,31,14,48,18,29]);
    archive.tg.NYK.push([id,date,'BOS','home',105,119,35,85,10,30,12,8,29,15,45,11,22]);
    shots[id]=[
      ...Array.from({length:8},()=>['10','BOS','NYK',40,22,24,3,1,'Catch & Shoot',1,1,0]),
      ...Array.from({length:8},()=>['11','BOS','NYK',40,12,10,2,1,'Drive',1,1,1])];
    archive.assists['10'].push(...Array.from({length:3},()=>[id,'11','BOS','Drive',2]));
  }
  const odds=['Points','Threes','Rebounds','Assists'].map(market=>({id:'10',date:day,a:'BOS',h:'NYK',market,line:5.5,over:-110}));
  Object.assign(S,{route:{id:'nba-parlays',sport:'nba'},day,games,odds,injuries:{},data:{...archive,shots}});
  const full=nbaParlayData();
  assert.equal(full.rows.length,4);
  assert.match(full.rows[0].type,/^[A-L]$/);
  assert.ok(full.rows[0].pace>0);
  assert.equal(full.rows.find(row=>row.stat==='Assists').assistResearch.events,24);
  S.data=JSON.parse(JSON.stringify(compactNbaParlays(archive,shots)));
  assert.deepEqual(nbaParlayData(),full);
});

test('the compact NFL archive produces the same parlay and similar-defense inputs as the full archive',
  {skip:!existsSync(new URL('nfl-2026.json',data))&&'no local snapshot'},()=>{
  const archive=read('nfl-2026.json'),schedule=read('nfl-schedule.json');
  const games=schedule.filter(g=>g.id.startsWith('2026_')&&g.week===10),game=games.find(g=>g.a==='KC');
  Object.assign(S,{route:{id:'nfl-sgp',sport:'nfl'},year:2026,week:10,games,game,
    nflAsOf:Date.parse('2026-11-15T17:00Z'),injuries:{},odds:[{player:'Emmett Johnson',market:'Rushing',line:40.5,over:100,
      a:game.a,h:game.h,date:game.date}]});
  S.data={...archive,schedule};
  const long=nflParlayData(), same=nflSameGameData();
  assert.ok(long.rows.length&&same.rows.length);
  S.data={...compactNflParlays(archive),schedule};
  assert.deepEqual(nflParlayData(),long);
  assert.deepEqual(nflSameGameData(),same);
});

test('NHL lineup updates just after UTC midnight still belong to the Eastern game day',async()=>{
  const {parseLineups}=await import('../scripts/lineups.mjs');
  const html='<script type="application/ld+json">'+JSON.stringify({
    articleBody:'## SUNDAY\n**Oilers projected lineup**\nFirst Skater -- Second Skater -- Third Skater\n',
    datePublished:'2026-11-15T22:30:00Z',dateModified:'2026-11-16T00:22:22Z'
  })+'</script>';
  assert.deepEqual(Object.keys(parseLineups(html,'2026-11-15')),['EDM']);
  assert.deepEqual(parseLineups(html,'2026-11-16'),{});
});
