import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNbaFinal} from '../scripts/nba-finals.mjs';
import {tdContracts,tdGrade} from '../scripts/nfl-td-settlement.mjs';
import {snapshotNotice} from '../site/home.mjs';

test('NBA final parsing credits an opening free throw to the first scorer and requires a complete matching game',()=>{
  const pick={athlete:{id:'42'},stats:['17','2-6','4','2']};
  const card={header:{id:'1',competitions:[{status:{type:{completed:true,name:'STATUS_FINAL'}},competitors:[
    {team:{id:'10',abbreviation:'BOS'}},{team:{id:'20',abbreviation:'NY'}}]}]},
  boxscore:{players:[{statistics:[{labels:['PTS','3PT','REB','AST'],athletes:[pick]}]}]},
  plays:[{scoringPlay:true,scoreValue:1,awayScore:1,homeScore:0,participants:[pick],team:{id:'20'}}]};
  const data=parseNbaFinal(card,'1');
  assert.deepEqual(data.first,{athlete:'42',team:'NY'});
  assert.deepEqual(data.players.get('42').values,{Points:17,Threes:2,Rebounds:4,Assists:2});
  assert.equal(parseNbaFinal(card,'2'),null);
  card.plays[0].homeScore=2;
  assert.equal(parseNbaFinal(card,'1').first,null);
  card.header.competitions[0].status.type.name='STATUS_IN_PROGRESS';
  assert.equal(parseNbaFinal(card,'1'),null);
});

test('touchdown grading matches exact game, line and side and excludes nonbinary settlements from unit results',()=>{
  const event='KXNFLTD-26NOV15KCATL';
  const row=(title,result,floor_strike=.5,more={})=>({title,result,floor_strike,status:'finalized',event_ticker:event,...more});
  const states=tdContracts([row('Example Runner: 1+ touchdowns','yes'),row('Example Runner: 2+ touchdowns','no',1.5),
    row('Out Player: 1+ touchdowns','scalar'),row('Conflicting: 1+ touchdowns','yes'),row('Conflicting: 1+ touchdowns','no'),
    row('Open Player: 1+ touchdowns','yes',.5,{status:'active'}),row('Wrong Game: 1+ touchdowns','yes',.5,{event_ticker:'other'})],
  event,'game','Anytime TD');
  const now=Date.parse('2026-11-15T22:00Z');
  const leg={game:'game',market:'Anytime TD',player:'Example Runner',line:.5,side:'Over',provider:'Kalshi'};
  assert.equal(tdGrade(states,leg,now).result,'won');
  assert.equal(tdGrade(states,{...leg,line:1.5},now).result,'lost');
  assert.equal(tdGrade(states,{...leg,line:1.5,side:'Under'},now).result,'won');
  assert.equal(tdGrade(states,{...leg,player:'Out Player'},now).result,'void');
  for(const player of ['Conflicting','Open Player','Wrong Game'])assert.equal(tdGrade(states,{...leg,player},now),null);
  assert.equal(tdGrade(states,{...leg,game:'other'},now),null);
  const first=tdContracts([row('Example Runner: 1st Touchdown','yes',null)],event,'game','First TD');
  assert.equal(tdGrade(first,{...leg,market:'First TD'},now).result,'won');
});

test('landing page flags an aging shared snapshot independently of other feed timestamps',()=>{
  const snapshot={updated:'2026-11-16T01:00:00Z',missing:[]};
  const now=Date.parse('2026-11-16T01:30:00Z');
  assert.equal(snapshotNotice(snapshot,now-1),'');
  assert.equal(snapshotNotice(snapshot,now),'Live snapshot delayed');
  assert.equal(snapshotNotice({...snapshot,missing:['weather nfl']},now),'Live snapshot delayed · 1 feed reported a problem');
  assert.equal(snapshotNotice(null,now),'Live snapshot unavailable');
});
