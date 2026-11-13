import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedRanks,buildTicket,defaults,evaluate,legKey,record,ticketMath} from '../site/nba-parlay-engine.mjs';
import {captureLegs,finalPlayers,gradeLeg,observeLeg} from '../site/nba-parlay-tracking.mjs';
import {chooseQuotes} from '../scripts/market-data.mjs';

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

test('prop history treats whole-number pushes as neither wins nor losses',()=>{
  assert.deepEqual(record([4,5,6],5,'Under'),{hits:1,n:2,pushes:1,rate:.5});
  assert.deepEqual(record([4,5,6],5,'Over'),{hits:1,n:2,pushes:1,rate:.5});
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
