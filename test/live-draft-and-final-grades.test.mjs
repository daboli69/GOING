import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNflFinal,gradeTdBoard} from '../scripts/nfl-finals.mjs';
import {nhlFinalGrade,parseNhlFinal} from '../scripts/nhl-finals.mjs';

const now=Date.parse('2026-11-16T02:00Z');
test('TD Board uses reconciled final scoring and separates offensive touchdowns from a defensive first TD',()=>{
  const game={espn:'11',a:'KC',h:'ATL'};
  const team=(homeAway,abbreviation,score)=>({homeAway,team:{abbreviation},score});
  const play=(id,text,type,scorer,awayScore,homeScore)=>({id,text,type:{text:type},scoringType:{abbreviation:'TD'},team:{abbreviation:scorer},awayScore,homeScore});
  const summary={header:{competitions:[{id:'11',status:{type:{completed:true,name:'STATUS_FINAL'}},
    competitors:[team('away','KC',7),team('home','ATL',6)]}]},
  boxscore:{players:[{team:{abbreviation:'KC'},statistics:[{
    name:'rushing',keys:['rushingYards','rushingAttempts','rushingTouchdowns'],athletes:[
      {athlete:{id:'1',displayName:'Example Back Jr.'},stats:['39','9','1']}
    ]
  }]}]},scoringPlays:[
    play('a','Example Defender Fumble Recovery in End Zone','Sack Opp Fumble Recovery','ATL',0,6),
    play('b','Example Back Jr. 2 Yd Rush','Rushing Touchdown','KC',7,6)
  ]};
  const snapshot={players:[['gsis-rb','Example Back','KC'],['gsis-other','Example Defender','ATL']]};
  const result=gradeTdBoard(snapshot,parseNflFinal(summary,game),now);
  assert.equal(result.first,'gsis-other');
  assert.deepEqual(result.tds,['gsis-rb']);
  assert.equal(result.firstScorer.offensive,false);
  summary.scoringPlays[1].awayScore=6;
  const incomplete=parseNflFinal(summary,game);
  assert.equal(incomplete.players.get('KC|exampleback').stats.Rushing,39);
  assert.equal(gradeTdBoard(snapshot,incomplete,now),null);
  summary.scoringPlays[1].awayScore=7;
  summary.boxscore.players[0].statistics[0].athletes[0].stats[2]='0';
  assert.equal(gradeTdBoard(snapshot,parseNflFinal(summary,game),now),null);
});

test('NHL official finals grade played skaters and void verified nonparticipants only with a complete lineup',()=>{
  const skaters=Array.from({length:18},(_,i)=>({playerId:i+1,toi:'12:34',goals:0,assists:1,sog:4}));
  const box={id:77,gameState:'OFF',awayTeam:{abbrev:'EDM'},homeTeam:{abbrev:'PHI'},playerByGameStats:{awayTeam:{
    forwards:skaters.slice(0,12),defense:skaters.slice(12),
    goalies:[{playerId:20,toi:'60:00',saves:32},{playerId:19,toi:'00:00',saves:0}]
  }}};
  const data=parseNhlFinal(box,'77'), p={team:'EDM',id:'1',market:'Shots on Goal',side:'Over',line:3.5};
  assert.equal(nhlFinalGrade(data,p,now).result,'won');
  assert.equal(nhlFinalGrade(data,{...p,market:'Anytime Goals',line:.5},now).result,'lost');
  assert.equal(nhlFinalGrade(data,{...p,id:'19',market:'Saves',line:18.5},now).result,'void');
  assert.equal(nhlFinalGrade(data,{...p,id:'90'},now).result,'void');
  assert.equal(nhlFinalGrade(data,{...p,team:'PHI'},now),null);
  box.playerByGameStats.awayTeam.defense=[];
  assert.equal(nhlFinalGrade(parseNhlFinal(box,'77'),{...p,id:'90'},now),null);
  assert.equal(parseNhlFinal({...box,gameState:'LIVE'},'77'),null);
});
