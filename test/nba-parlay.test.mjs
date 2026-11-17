import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedRanks,buildTicket,defaults,evaluate,legKey,nbaLegChance,record,ticketMath} from '../site/nba-parlay-engine.mjs';
import {lineupEffect,rotationTeammates,teammateSplits} from '../site/nba-lineup-splits.mjs';
import {captureLegs,finalPlayers,gradeLeg,observeLeg} from '../site/nba-parlay-tracking.mjs';
import {chooseQuotes} from '../scripts/market-data.mjs';
import {parlayPage,savedParlayTickets} from '../site/nba-parlays.mjs';
import {current as S} from '../site/ui.mjs';

const now=Date.parse('2026-11-12T16:00Z');
const lows={rank:2,end:2,total:30}, highs={rank:28,end:28,total:30};
function row(overrides={}){
  const sample=[4,4,9,9,9,9,9,9,9,9];
  return {date:'2026-11-12',game:{id:'1',iso:'2026-11-12T23:00Z',status:'FUT',h:'DET'},
    player:{id:'p1',name:'Example',team:'DET',pos:'SG'},opp:'CHI',stat:'Points',spread:6.5,total:220,
    quote:{line:6.5,over:-110,under:-110,provider:'Kalshi',capturedAt:'2026-11-12T14:00Z'},
    avg:8,form:{season:sample,last10:sample,last5:sample.slice(-5),venue:sample,home:sample,away:[]},
    reads:[7,8,9],type:'A',typeDeltas:[1,2,2,3,1],typeRank:highs,posRank:highs,
    pace:103,threeRate:.42,out:false,injuryReport:true,absences:[],...overrides};
}
const over={...defaults,side:'Over'};
const evaluateRows=(rows,cfg=over,taken=new Set())=>evaluate(rows,cfg,{now,taken});

test('Suggested Parlays opens with incomplete saved filters and shows usable legs without rewriting storage',()=>{
  const key='suite:nba-parlay-tickets';
  const leg={name:'Example',stat:'Points',line:6.5,side:'Over',price:-110,provider:'Kalshi'};
  const original=JSON.stringify([null,{id:'saved',date:'2026-11-12',filters:{stats:null},legs:[null,leg]}]);
  const values=new Map([[key,original],['suite:nba-parlay-settings',JSON.stringify({stats:null,players:{},legs:4})]]);
  const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const {f,route}=S;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)}});
  try{
    Object.assign(S,{f:{},route:{sport:'nba'}});
    const html=parlayPage({rows:[row()],games:[],roster:[]});
    assert.match(html,/data-parlay="legs"[^>]*value="4"/);
    assert.match(html,/Incomplete/);
    assert.doesNotMatch(html,/result:saved:1/);
    assert.match(html,/Awaiting final stats/);
    assert.equal(savedParlayTickets()[0].legs[0].result,'Pending');
    assert.equal(values.get(key),original);
  }finally{
    Object.assign(S,{f,route});
    if(storage)Object.defineProperty(globalThis,'localStorage',storage);
    else delete globalThis.localStorage;
  }
});

test('prop history treats whole-number pushes as neither wins nor losses',()=>{
  assert.deepEqual(record([4,5,6],5,'Under'),{hits:1,n:2,pushes:1,rate:.5});
  assert.deepEqual(record([4,5,6],5,'Over'),{hits:1,n:2,pushes:1,rate:.5});
});

test('Full List ranks the entire eligible pool by adjusted hit rate, even when games repeat',t=>{
  t.mock.method(Date,'now',()=>now);
  const {f,route,day}=S;
  const sample=[4,4,...Array(18).fill(9)];
  const rows=[row({player:{...row().player,id:'short',name:'Short sample'},
      form:{...row().form,season:Array(10).fill(9)}}),
    ...Array.from({length:13},(_,i)=>row({player:{...row().player,id:'long'+i,name:'Long sample '+i},
      form:{...row().form,season:sample},quote:{...row().quote,over:'+120'}})),
    row({player:{...row().player,id:'out',name:'Cut player'},out:true})];
  try{
    Object.assign(S,{f:{},route:{sport:'nba'},day:'2026-11-12'});
    const html=parlayPage({rows,games:[],roster:[]});
    const pool=/<ol class="parlay-pool">([\s\S]*?)<\/ol>/.exec(html)?.[1];
    assert.ok(pool);
    assert.equal([...pool.matchAll(/<li>/g)].length,14);
    assert.ok(pool.indexOf('Long sample 0')<pool.indexOf('Short sample'));
    assert.match(pool,/76\.7%/);
    assert.match(pool,/\+120 Kalshi/);
    assert.match(pool,/Type A edge/);
    assert.match(pool,/>Type A<\/span>/);
    assert.doesNotMatch(pool,/Cut player/);
  }finally{Object.assign(S,{f,route,day});}
});

test('NBA lineup context nudges the ticket and full-list chance in either direction',()=>{
  const statSample={name:'Rotation teammate',withTeammate:[3,4,5,6],withoutTeammate:[8,9,10,11]};
  const base=evaluateRows([row()]).eligible[0];
  const getLeg=current=>evaluateRows([row({lineup:[{...statSample,current}]})]).eligible[0];
  const out=getLeg('listed out'),incoming=getLeg('expected in');
  assert.ok(out.score>base.score&&base.score>incoming.score);
  assert.ok(Math.abs(nbaLegChance(out)-nbaLegChance(base)-.03)<1e-12);
  assert.ok(Math.abs(nbaLegChance(incoming)-nbaLegChance(base)+.03)<1e-12);
  assert.match(out.reasons.join(' '),/listed out.*4\.5 avg \(0\/4 hits\) with vs 9\.5 avg \(4\/4 hits\) without/);
  assert.equal(lineupEffect([{...statSample,current:'listed out'}],6.5,'Under').adjustment,-.03);
  assert.equal(lineupEffect([{...statSample,withTeammate:[6.5,6.5,5,6],current:'listed out'}],6.5,'Over'),null);
});

test('NBA teammate history starts after either player changes teams, and availability is labeled by its evidence',()=>{
  const game=(id,team='DET',value=9)=>({id,team,date:'2026-11-'+String(id).padStart(2,'0'),minutes:24,value});
  const entry={id:'mate',name:'Player Mate',games:[game(2),game(3,'CHI'),game(6),game(7),game(9)]};
  const recent=[7,8,9];
  assert.equal(rotationTeammates('DET',[entry],null,recent).length,0);
  assert.equal(rotationTeammates('DET',[entry],[{name:entry.name,status:'Questionable'}],recent).length,0);
  assert.equal(rotationTeammates('DET',[entry],[],recent)[0].current,'expected in');
  const rotation=rotationTeammates('DET',[entry],[{name:entry.name,status:'Available'}],recent);
  assert.equal(rotation[0].current,'listed available');
  const [split]=teammateSplits('player','DET',[game(2),game(3),game(4),game(7,'GS'),game(8),game(9)],rotation);
  assert.deepEqual(split.withTeammate,[9]);
  assert.deepEqual(split.withoutTeammate,[9]);
});

test('the screen keeps the 6.5 default inclusive and enforces the 14.5 hard cutoff',()=>{
  const eligible=evaluateRows([row()]).eligible;
  assert.equal(eligible.length,1);
  assert.ok(eligible[0].flags.includes('Stale quote'));
  assert.ok(evaluateRows([row({spread:7})]).cuts.has('Maximum spread'));
  assert.ok(evaluateRows([row({spread:14.5})],{...over,spread:30}).cuts.has('Spread of 14.5 or more'));
  assert.ok(evaluateRows([row({spread:null})]).cuts.has('Spread unavailable'));
  assert.ok(evaluateRows([row({game:{...row().game,iso:'2026-11-12T15:00Z'}})]).cuts.has('Game already started or tip time missing'));
});

test('type filters, Reads and positional rank gate the correct markets and sides',()=>{
  assert.ok(evaluateRows([row({typeDeltas:[4,4,4,4]})]).cuts.has('Type sample'));
  assert.ok(evaluateRows([row({typeRank:lows})]).cuts.has('Defense rank vs type'));
  assert.ok(evaluateRows([row({reads:[3,4,9]})]).cuts.has('Reads favor the other side'));
  assert.ok(evaluateRows([row({stat:'Assists',posRank:lows})]).cuts.has('Defense rank vs position'));
  assert.equal(evaluateRows([row({stat:'Rebounds',typeDeltas:[]})]).eligible.length,1);
  const sample=[1,2,3,4,2,3,4,5,4,5];
  const under=row({avg:3.3,form:{season:sample,last10:sample,last5:sample.slice(-5),venue:sample,home:sample,away:[]},
    reads:[3,4],typeDeltas:[-1,-2,-2,-1,-1],typeRank:lows});
  assert.equal(evaluateRows([under],{...over,side:'Under'}).eligible.length,1);
  const tied=allowedRanks([['A',1],['B',2],['C',2]]);
  assert.equal(tied.get('B').rank,2);
  assert.equal(tied.get('B').end,3);
});

test('tickets keep eligible locks, respect game limits and do not pad',()=>{
  const a=evaluateRows([row()]).eligible[0];
  const b={...a,player:'p2',stat:'Assists',score:a.score+1};
  const c={...a,player:'p3',game:'2',score:a.score-1};
  const cfg={...over,legs:3};
  assert.deepEqual(buildTicket([a,b,c],cfg,{locked:[legKey(a)]}).ticket.map(l=>l.player),['p1','p3']);
  assert.equal(buildTicket([b,c],cfg,{locked:[legKey(a)]}).invalidLock,true);
  assert.equal(buildTicket([a,b,c],{...cfg,perGame:false}).ticket.length,3);
  assert.ok(evaluateRows([row()],over,new Set([legKey(a)])).cuts.has('Existing tickets'));
  const m=ticketMath([a,c]);
  assert.ok(Math.abs(m.naive-.64)<1e-10);
  assert.ok(Math.abs(m.adjusted-.4225)<1e-10);
  assert.equal(m.sameGame,false);
  assert.equal(ticketMath([a,b]).sameGame,true);
});

test('research keeps all alternate thresholds while the builder still uses one quote',()=>{
  const common={date:'2026-11-12',a:'DET',h:'CHI',player:'Example',market:'Points',volume:0,yes:.5,no:.5};
  const quotes=[{...common,line:6.5},{...common,line:7.5},{...common,line:7.5}];
  assert.equal(chooseQuotes(quotes).length,1);
  assert.deepEqual(chooseQuotes(quotes,true).map(q=>q.line),[6.5,7.5]);
  const main=row(), alternate=row({quote:{...main.quote,line:7.5}});
  const captured=captureLegs([main,alternate],[main],now);
  assert.deepEqual(captured.filter(l=>l.side==='Over').map(l=>[l.alternate,l.decision]),[[false,'Selected'],[true,'Eligible']]);
  const rejected=captured.find(l=>l.side==='Under'&&l.alternate);
  assert.equal(rejected.decision,'Rejected');
  assert.ok(rejected.checks['Type edge']);
  assert.ok(rejected.checks['Defense vs type']);
  assert.ok(rejected.checks['Line vs average']);
  assert.ok(rejected.checks['Hit rate']);
  assert.deepEqual(captureLegs([main],[main],Date.parse(main.game.iso)),[]);
});

test('tracker keeps first and latest pregame observations and grades only confirmed final box scores',()=>{
  const [leg]=captureLegs([row()],[row()],now);
  const store=new Map();
  observeLeg(store,leg);
  const next={...leg,odds:-105,observedAt:'2026-11-12T17:00:00.000Z',decision:'Eligible'};
  observeLeg(store,next);observeLeg(store,leg);
  const saved=store.get(leg.k);
  assert.equal(saved.firstSeen,leg.observedAt);
  assert.equal(saved.firstDecision,'Selected');
  assert.equal(saved.firstOdds,-110);
  assert.equal(saved.everSelected,true);
  assert.equal(saved.odds,-105);
  const box={header:{id:'1',competitions:[{status:{type:{name:'STATUS_FINAL',completed:true}}}]},
    boxscore:{players:[{statistics:[{labels:['PTS','3PT','REB','AST'],athletes:[
      {athlete:{id:'p1'},stats:['9','3-5','2','1']},
      {athlete:{id:'p2'},didNotPlay:true,stats:[]}
    ]}]}]}};
  assert.equal(finalPlayers(box,'2'),null);
  assert.equal(finalPlayers({...box,header:{...box.header,competitions:[{status:{type:{name:'STATUS_CANCELLED',completed:true}}}]}},'1'),null);
  const players=finalPlayers(box,'1');
  assert.deepEqual(players.get('p1').values,{Points:9,Threes:3,Rebounds:2,Assists:1});
  const graded=gradeLeg(saved,players,now);
  assert.equal(graded.result,'won');
  assert.equal(gradeLeg({...saved,line:9},players,now).result,'push');
  assert.equal(gradeLeg({...saved,player:'p2'},players,now).result,'void');
  assert.equal(gradeLeg({...saved,player:'p3'},players,now).result,undefined);
  store.set(saved.k,graded);
  observeLeg(store,{...next,observedAt:'2026-11-12T18:00:00.000Z'});
  assert.equal(store.get(saved.k),graded);
});


test('Assist Spots changes ordering without changing hit rates or upgrading mixed signals',()=>{
  const baseline=row({stat:'Assists'});
  const [before]=evaluateRows([baseline]).eligible;
  const [positive]=evaluateRows([{...baseline,assistResearch:{read:'Over',targetDelta:.8,mixEdge:.4,covered:25,events:30}}]).eligible;
  const [negative]=evaluateRows([{...baseline,assistResearch:{read:'Under',targetDelta:-.8,mixEdge:-.4,covered:25,events:30}}]).eligible;
  const [mixed]=evaluateRows([{...baseline,assistResearch:{read:'Mixed',targetDelta:.8,mixEdge:-.4}}]).eligible;
  assert.ok(positive.score>before.score && before.score>negative.score);
  assert.equal(mixed.score,before.score);
  assert.ok(mixed.flags.includes('Assist Spots signals are mixed'));
  assert.deepEqual(positive.form,before.form);
  assert.deepEqual(ticketMath([positive]),ticketMath([before]));
});

test('NBA parlay suggestions withhold expired quotes and quotes with no verifiable time',()=>{
  for(const capturedAt of ['2026-11-12T13:59:59Z',null,'2026-11-12T16:01Z']){
    const candidate=row({quote:{...row().quote,capturedAt}});
    assert.equal(evaluateRows([candidate]).eligible.length,0);
    assert.equal(evaluateRows([candidate]).screened[0].checks['Quote freshness'],'Quote older than two hours or untimestamped');
  }
});

test('saved NBA tickets settle the exact line and side automatically, including pushes, DNP and canceled games',async()=>{
  const {createNbaTicketResults}=await import('../site/nba-parlay-results.mjs');
  const t=Date.parse('2026-11-17T03:30:00Z'), tip='2026-11-17T00:00Z', date='2026-11-16';
  const prop={game:'42',tip,date,player:'101',name:'Example',stat:'Points',line:9,side:'Over',result:'Miss'};
  const canceled={...prop,game:'43'}, dnp={...prop,player:'102'}, missing={...prop,player:'103'};
  const future={...prop,game:'44',tip:'2026-11-18T00:00Z'}, wrong={...prop,game:'45'};
  let tickets=[null,{id:'old',date,legs:[prop,{...prop,side:'Under',line:10.5},{...prop,line:10},
    {...prop,stat:'Threes',line:2.5},dnp,canceled,missing,future,wrong]}];
  const summary=(id,status='STATUS_FINAL')=>({header:{id,competitions:[{id,status:{type:{name:status,completed:status==='STATUS_FINAL'}}}]},
    boxscore:{players:[{statistics:[{labels:['PTS','3PT','AST','REB'],athletes:[
      {athlete:{id:'101'},stats:['10','2-7','0','5']},{athlete:{id:'102'},didNotPlay:true,stats:[]}
    ]}]}]}});
  const queries=[];
  const config={read:()=>tickets,write:stored=>{tickets=stored;},fetchSummary:async id=>{
    queries.push(id);
    // A ticket was saved while the results request was still pending.
    if(id==='42')tickets=[...tickets,{id:'new',date,legs:[{...prop,stat:'Assists',line:.5,side:'Under'}]}];
    return id==='43'?summary(id,'STATUS_CANCELED'):id==='45'?summary('99'):summary(id);
  }};
  const results=createNbaTicketResults(config);
  assert.equal(results.resolve(prop).result,'Pending','legacy manual grades are replaced by official results');
  assert.equal(await results.refresh(t),true);
  assert.deepEqual(queries,['42','43','45']);
  const cache=createNbaTicketResults(config);
  const settled=tickets[1].legs.map(cache.resolve);
  assert.deepEqual(settled.map(x=>x.result),['Hit','Hit','Push','Miss','Void','Void','Pending','Pending','Pending']);
  assert.deepEqual(settled.slice(0,6).map(x=>x.value),[10,10,10,2,null,null]);
  assert.equal(settled[4].resultSource,'ESPN final · DNP');
  assert.equal(settled[5].resultSource,'ESPN · Canceled');
  assert.equal(cache.resolve(tickets[2].legs[0]).value,0);
  assert.equal(await results.refresh(t+60_000),false,'unfinished or mismatched games are retried later');
  assert.deepEqual(queries,['42','43','45']);
});

test('live and postponed NBA games stay pending until ESPN confirms a final',async()=>{
  const {createNbaTicketResults}=await import('../site/nba-parlay-results.mjs');
  const now=Date.parse('2026-11-17T04:00:00Z');
  let tickets=[{id:'saved',date:'2026-11-16',legs:[{game:'42',player:'101',date:'2026-11-16',tip:'2026-11-17T00:00Z',stat:'Points',line:0,side:'Under'}]}];
  let status='STATUS_IN_PROGRESS';
  const r=createNbaTicketResults({read:()=>tickets,write:rows=>{tickets=rows;},fetchSummary:async id=>({
    header:{id,competitions:[{id,status:{type:{name:status,completed:status==='STATUS_FINAL'}}}]},
    boxscore:{players:[{statistics:[{labels:['PTS'],athletes:[{athlete:{id:'101'},stats:['0']}]}]}]}
  })});
  assert.equal(await r.refresh(now),false);
  status='STATUS_POSTPONED';
  assert.equal(await r.refresh(now+6*60_000),false);
  status='STATUS_FINAL';
  assert.equal(await r.refresh(now+12*60_000),true);
  assert.equal(r.resolve(tickets[0].legs[0]).result,'Push');
});
