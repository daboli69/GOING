import test from 'node:test';
import assert from 'node:assert/strict';
import {current as S} from '../site/ui.mjs';
import {nflTdSweepstakesGame} from '../site/config.mjs';
import {tdSweepstakes,touchdownEndpoints} from '../site/nfl-td-sweepstakes.mjs';
import {tdSweepstakesPage} from '../site/nfl-td-sweepstakes-page.mjs';
import {gradeTdBoard} from '../scripts/nfl-finals.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,a+' differs from '+b);
const now=Date.parse('2026-11-26T14:00:00Z');
const game={id:nflTdSweepstakesGame,a:'KC',h:'BUF',week:12,date:'2026-11-26',iso:'2026-11-27T01:20:00Z',
  spread:3,total:48};
const play=(team,type,quarter,player)=>{
  const row=Array(29).fill(null);
  Object.assign(row,{0:team,1:type,3:4,4:quarter,8:team,9:player,11:type==='pass'?player:null,12:type==='run'?player:null});
  return row;
};
const prior={id:'2026_11_KC_BUF',a:'KC',h:'BUF',week:11,date:'2026-11-19',sa:10,sh:14};
const earlier=[
  play('KC','run',1,'KC-RB'),play('BUF','pass',3,'BUF-WR'),
  play('KC','pass',4,'KC-WR'),play('BUF','run',4,'BUF-RB'),play('BUF','field_goal',4,'DEF')
];
const role=(team,rb)=>({id:team+(rb?'-RB':'-WR'),p:{name:team+(rb?' Runner':' Receiver')},role:rb?'RB':'WR',
  rushShare:rb?1:0,recShare:rb?0:1,volShare:.5,m:1,lambda:1,given:.5,openShare:.5,counts:{},status:rb?'Questionable':null});
const makeBoard=script=>({g:game,firstA:.55,dst:.04,receiveA:.5,side:Object.fromEntries(['KC','BUF'].map(team=>[team,
  {teamTd:2,implied:24,fromLines:true,script:team==='KC'?script:-script,rows:[role(team,true),role(team,false)]}]))});
const rates={'rush 3-5':.3,'target 1-10':.25}, events={[prior.id]:earlier,[game.id]:earlier};

test('first, last, either and both account for single-touchdown and no-touchdown games',()=>{
  const singlePhase=touchdownEndpoints(2,0,.5,0);
  near(singlePhase.first,singlePhase.last);
  near(singlePhase.both,2*Math.exp(-2)*.5+(1-3*Math.exp(-2))*.25);
  const a=touchdownEndpoints(3,1,.7,.2),b=touchdownEndpoints(3,1,.3,.8);
  near(a.first+b.first,1-Math.exp(-4));
  near(a.last+b.last,1-Math.exp(-4));
  for(const p of [a,b]){
    near(p.either,p.first+p.last-p.both);
    assert.ok(p.both<=Math.min(p.first,p.last)&&p.either<=1);
  }
});

test('late lead favors the rusher, the total probability reconciles, and current-game plays are excluded',()=>{
  const schedule=[prior,{...game,sa:21,sh:24}];
  const leading=tdSweepstakes(makeBoard(12),schedule,events,rates,now);
  const trailing=tdSweepstakes(makeBoard(-12),schedule,events,rates,now);
  const runner=board=>board.players.find(r=>r.id==='KC-RB');
  assert.equal(leading.games,1);
  assert.ok(runner(leading).last>runner(trailing).last);
  assert.equal(runner(leading).status,'Questionable');
  assert.ok(leading.other.noTd>0);
  for(const key of ['first','last']){
    near(leading.players.reduce((s,r)=>s+r[key],0)+leading.other[key],1);
    assert.ok(leading.other[key]>=leading.other.noTd);
  }
  assert.equal(tdSweepstakes(makeBoard(12),schedule,events,rates,Date.parse(game.iso)),null);
  assert.equal(tdSweepstakes(makeBoard(12),[game],events,rates,now),null);
});

test('the sweepstakes page uses the correct game and closes to a frozen forecast at kickoff',()=>{
  const old={route:S.route,f:S.f,data:S.data,tdLog:S.tdLog,nflAvailability:S.nflAvailability};
  const board=makeBoard(2), data={games:[board],rates};
  try{
    Object.assign(S,{route:{sport:'nfl'},f:{sweepstakesRank:'last'},data:{schedule:[prior],events},nflAvailability:null,tdLog:null});
    const page=tdSweepstakesPage(data,now);
    assert.match(page,/Rank by/);
    assert.match(page,/\$1 million Bonus Bet pools/);
    assert.match(page,/Live pregame estimate/);
    assert.match(page,/KC Runner/);
    assert.match(tdSweepstakesPage(data,Date.parse(game.iso)),/pregame board is closed/);
    const sweepstakes=tdSweepstakes(board,[prior],events,rates,now);
    const saved={game:game.id,capturedAt:new Date(now).toISOString(),tip:game.iso,sweepstakes,
      players:[['KC-RB','KC Runner','KC'],['BUF-WR','BUF Receiver','BUF']]};
    const touchdowns=[{name:'KC Runner',team:'KC',offensive:true},{name:'BUF Receiver',team:'BUF',offensive:true}];
    Object.assign(saved,gradeTdBoard(saved,{touchdowns},Date.parse(game.iso)+4*3600000));
    S.tdLog={live:[saved]};
    const after=tdSweepstakesPage(data,Date.parse(game.iso));
    assert.match(after,/Pregame snapshot saved/);
    assert.match(after,/Final last TD[\s\S]*BUF Receiver/);
    assert.doesNotMatch(after,/Live pregame estimate/);
  }finally{Object.assign(S,old);}
});
