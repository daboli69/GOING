import assert from 'node:assert/strict';
import test from 'node:test';
import {gradeNbaMarket,marketLean,marketResults,pregameNbaMarkets} from '../site/nba-game-markets.mjs';
import {nbaRotation,officialStarters,rotationSummary} from '../site/nba-rotation-data.mjs';

const iso='2026-11-25T00:00:00Z', before='2026-11-24T23:30:00Z', now=Date.parse('2026-11-24T23:45:00Z');
const forecast={gid:'123',home:'BOS',away:'NY',tipoff_utc:iso,has_forecast:true,expected:{margin:7,total:219}};
const feed={generated_at:before,games:{123:forecast}};
const market={id:'123',date:'2026-11-24',a:'NYK',h:'BOS',iso,books:[
  {name:'Other',spread:-4,total:218},{name:'Draft Kings',spread:-5,total:220},{name:'Third',spread:-9,total:221}
]};
const snapshot={checked:before,games:[market]};

test('game records capture the matched pregame model and a posted spread and total',()=>{
  const [row]=pregameNbaMarkets(feed,snapshot,now);
  assert.equal(row.spread,-5);
  assert.equal(row.bookTotal,220);
  assert.equal(row.spreadBook,'Draft Kings');
  assert.equal(marketLean(row,'spread').delta,2);
  assert.equal(marketLean(row,'total').delta,-1);
  assert.deepEqual(pregameNbaMarkets(feed,snapshot,Date.parse(iso)),[]);
  assert.deepEqual(pregameNbaMarkets({...feed,generated_at:iso},snapshot,now),[]);
  assert.deepEqual(pregameNbaMarkets(feed,{...snapshot,checked:'2026-11-24T20:00:00Z'},now),[]);
  assert.deepEqual(pregameNbaMarkets(feed,{...snapshot,games:[{...market,a:'BKN'}]},now),[]);
});

test('grade the archived spread and total independently using only the matching final',()=>{
  const [row]=pregameNbaMarkets(feed,snapshot,now);
  const final={...forecast,completed:true,home_score:113,away_score:108};
  const graded=gradeNbaMarket(row,final);
  assert.equal(marketLean(graded,'spread').result,'Push');
  assert.equal(marketLean(graded,'total').result,'Miss');
  assert.equal(marketResults([row,graded],'spread').n,1);
  assert.equal(marketResults([row,graded],'total').marketError,1);
  assert.equal(gradeNbaMarket(graded,{...final,tipoff_utc:before}),graded);
  assert.equal(row.homeScore,undefined);
});

const clocks=(period,clock,other={})=>({period:{number:period},clock:{displayValue:clock},...other});
const competition={
  status:{type:{completed:true,state:'post'}},
  competitors:[{team:{id:'1'},score:'3'},{team:{id:'2'},score:'2'}]
};
const summary={
  header:{id:'123',competitions:[competition]},
  boxscore:{players:[{team:{id:'1',abbreviation:'BOS'},statistics:[{labels:['MIN'],athletes:
    [1,2,3,4,5,6].map(id=>({athlete:{id},starter:id!==6,stats:[id===5?'6':id===6?'42':'48']}))
  }]}]},
  plays:[clocks(1,'6:00',{scoringPlay:true,scoreValue:3,team:{id:'1'}}),
    clocks(1,'6:00',{type:{text:'Substitution'},team:{id:'1'},participants:[{athlete:{id:6}},{athlete:{id:5}}]}),
    clocks(1,'6:00',{scoringPlay:true,scoreValue:2,team:{id:'2'}}),
    clocks(2,'0.0'),clocks(3,'0.0'),clocks(4,'0.0')]
};

test('rotation reconstruction uses actual event order and checks minutes and points before showing on/off',()=>{
  assert.deepEqual(officialStarters(summary,'123','BOS'),['1','2','3','4','5']);
  assert.equal(officialStarters(summary,'456','BOS'),null);
  const game=nbaRotation(summary,'123','BOS');
  assert.equal(game.stints[0].own,3);
  assert.equal(game.stints[0].allowed,0);
  assert.equal(game.stints[1].allowed,2);
  assert.equal(game.totals.get('6'),2520);
  const rotation=rotationSummary([game]);
  assert.equal(rotation.onOff.find(p=>p.id==='6').seconds,2520);
  assert.equal(rotation.onOff.find(p=>p.id==='6').typical[5],0);
  assert.equal(rotation.onOff.find(p=>p.id==='6').typical[6],60);
  const broken=structuredClone(summary);
  broken.boxscore.players[0].statistics[0].athletes[5].stats[0]='13';
  assert.equal(nbaRotation(broken,'123','BOS'),null);
});
