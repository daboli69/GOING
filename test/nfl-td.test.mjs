import test from 'node:test';
import assert from 'node:assert/strict';
import {bucket,bucketRates,impliedPoints,impliedTds,rushShare,anytime,firstTdChance,tdRegression,fairAnytime,fairField,offenseTd,shrink,log5} from '../site/nfl-td.mjs';

const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,a+' vs '+b);
const play=o=>{const p=Array(29).fill(null);Object.entries(o).forEach(([i,v])=>p[i]=v);return p;};

test('opportunities are bucketed by where they happen, with end-zone targets separate',()=>{
  assert.equal(bucket(play({1:'run',3:1,12:'rb'})),'rush 1-2');
  assert.equal(bucket(play({1:'run',3:8,12:'rb'})),'rush 6-10');
  assert.equal(bucket(play({1:'pass',3:15,11:'wr',13:16})),'target end zone');
  assert.equal(bucket(play({1:'pass',3:15,11:'wr',13:5})),'target 11-20');
  assert.equal(bucket(play({1:'pass',3:8,10:'qb',28:1})),null,'a sack is not a target');
});

test('bucket rates count the scorer on that play only',()=>{
  const plays=[play({0:'A',1:'run',3:1,12:'rb',8:'A',9:'rb'}),play({0:'A',1:'run',3:1,12:'rb'}),
    play({0:'A',1:'pass',3:5,11:'wr',13:6,8:'A',9:'wr'}),play({0:'A',1:'run',3:2,12:'rb',8:'B',9:'lb'})];
  const r=bucketRates(plays);
  near(r['rush 1-2'],1/3);near(r['target end zone'],1);
  assert.equal(offenseTd(plays[3]),null,'a defensive TD is not an offensive one');
});

test('team TDs come from implied points less two field goals, split by run and pass',()=>{
  near(impliedPoints(47,-3),25);
  near(impliedTds(27),3);
  assert.ok(rushShare(10,10,.42,7)>rushShare(10,10,.42,-7),'favorites score more on the ground');
  assert.ok(rushShare(10,10,.42,0,true)>rushShare(10,10,.42,0,false),'wind and rain move scoring to the run');
});

test('anytime TD is 1 − e^(−expected TDs)',()=>{
  near(anytime(1),1-Math.exp(-1));near(anytime(0),0);
});

test('first-TD chances alternate from the opening kickoff and sum to 1',()=>{
  const a=firstTdChance(.7,.21,.21,.23,.23), b=firstTdChance(.3,.21,.21,.23,.23);
  assert.ok(a>.5,'receiving first is an edge');
  near(a+b,1,1e-12);
  near(firstTdChance(1,1,.5,.3,.3),1);
  near(shrink(10,11,6,.5),13/17);near(log5(.6,.5),.6);
});

test('regression flags due and hot scorers against expected TDs',()=>{
  assert.equal(tdRegression(3,6.2).kind,'due');
  assert.equal(tdRegression(9,5.3).kind,'hot');
  assert.equal(tdRegression(7,7.5).kind,null);
});

test('prices: two-sided quotes lose their vig, one-sided ones lose the assumed hold, a first-TD field is normalized',()=>{
  near(fairAnytime('+150','-200',.2),.4/(.4+2/3));
  near(fairAnytime('+150',null,.2),.4/1.2);
  const f=fairField({a:'+300',b:'+300',c:'+300',d:'+300',e:'+300'},.25);
  near(Object.values(f).reduce((s,x)=>s+x,0),1);
});
