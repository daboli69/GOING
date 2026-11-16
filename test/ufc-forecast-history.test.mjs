import test from 'node:test';
import assert from 'node:assert/strict';
import {retainUfcForecasts} from '../scripts/ufc-forecast-history.mjs';
import {healthProblems} from '../scripts/health.mjs';
import {ufcModelVersion,fightVersion} from '../site/fights-core.mjs';

const start='2026-11-14T22:00:00.000Z',before='2026-11-14T21:37:20.895Z',after='2026-11-15T05:00:00.000Z';
const fighters=[{id:'1'},{id:'2'}];
const card=(checked,bout={})=>({id:'333',start,checked,bouts:[{id:'444',fighters,...bout}]});
const forecast={version:ufcModelVersion,prob:[.4,.6],members:[{key:'form',prob:.4}]};

test('live and final UFC refreshes preserve the exact saved pre-event forecast and timestamp',()=>{
  const pregame=card(before,{forecast,market:{checked:before,moneyline:{'2':-115}}});
  const active=card(after);
  retainUfcForecasts(active,pregame,new Map());
  assert.equal(active.bouts[0].forecastAt,before);
  assert.deepEqual(active.bouts[0].forecast,forecast);
  const finished=card(after,{fighters:[...fighters].reverse()});
  retainUfcForecasts(finished,active,new Map());
  assert.deepEqual(finished.bouts[0].forecast,forecast);
  assert.deepEqual(finished.bouts[0].market,pregame.bouts[0].market);
  assert.deepEqual(finished.bouts[0].fighters,fighters);
  assert.equal(finished.bouts[0].forecastAt,before);
});

test('a prior UFC card can recover saved probabilities by fighter ID without inventing member forecasts',()=>{
  const pick={a:'2',h:'1',side:'2',version:ufcModelVersion,at:before,start,tools:{'ufc-ensemble':{prob:.625}}};
  const baseline={...pick,version:fightVersion,side:'1',tools:{'ufc-baseline':{prob:.563}}};
  const current=card(after);
  retainUfcForecasts(current,card(after,{forecast}),new Map([['333|444',[
    pick,baseline,{...pick,at:after},{...pick,at:'2026-11-14T21:59Z',h:'9'}
  ]]]));
  assert.deepEqual(current.bouts[0].forecast,{version:ufcModelVersion,prob:[.375,.625]});
  assert.equal(current.bouts[0].baseline.prob[0],.563);
  assert.equal(current.bouts[0].forecastAt,before);
  assert.equal(current.bouts[0].forecastSource,'tracker');
});

test('health reports an unavailable college slate and a stale UFC schedule',()=>{
  const now=Date.parse(after), fresh={updated:after};
  const problems=healthProblems({live:fresh,archive:fresh,tracker:fresh,parlays:fresh,
    college:{cbb:{...fresh,available:false},cwb:fresh,fbs:fresh},ufc:{updated:before}},now);
  assert.deepEqual(problems.map(p=>p.key),['College CBB feed','UFC card feed']);
});
