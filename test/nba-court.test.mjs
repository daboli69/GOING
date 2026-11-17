import test from 'node:test';
import assert from 'node:assert/strict';
import {courtDefense,courtField,pra} from '../site/nba-court.mjs';
import {courtMatchupBoost} from '../site/nba-court-boost.mjs';

const minutesLog=(id,opponent,points,rebounds,assists)=>[id,'2026-11-15','MIN',opponent,'home',32,points,0,assists,rebounds];
const player=(id,name,points,rebounds,assists)=>({id,name,pos:'SG',team:'MIN',min:32,
  logs:[minutesLog('previous','POR',points,rebounds,assists)]});
const slate=[{id:'today',h:'MIN',a:'POR'}];
const players=[player('edwards','Anthony Edwards',30,7,5),player('a','A',15,11,8),player('b','B',22,3,4)];

test('King of the Court uses PRA for form and defense, including rebounds and assists',()=>{
  const defense=courtDefense(players);
  assert.equal(pra(players[0].logs[0]),42);
  assert.equal(pra(minutesLog('missing','POR',12,null,3)),null);
  assert.equal(defense.teams.get('POR').top,42);
  assert.equal(defense.teams.get('POR').counts[0],1);
  const {rows}=courtField(players,slate,defense);
  assert.ok(rows.find(x=>x.id==='a').projected>rows.find(x=>x.id==='b').projected);
});

test('King of the Court reruns the slate with Out players removed and preserves total probability',()=>{
  const defense=courtDefense(players);
  const before=courtField(players,slate,defense);
  const after=courtField(players,slate,defense,{statusFor:p=>p.id==='edwards'?'Out':p.id==='a'?'Questionable':null});
  assert.deepEqual(after.excluded,['Anthony Edwards']);
  assert.equal(after.rows.length,2);
  assert.ok(after.rows[0].lead>before.rows.find(p=>p.id===after.rows[0].id).lead);
  assert.ok(Math.abs(after.rows.reduce((sum,p)=>sum+p.lead,0)-1)<1e-10);
});

test('King of the Court boosts favorable matchup components within both projection caps',()=>{
  const evidence={type:'A',typeDeltas:[5,6,7,8,9],position:'SG',own:{rebounds:8,assists:9},
    opponent:{pra:50,rebounds:20,assists:15,games:8},league:{pra:45,rebounds:12,assists:8}};
  const result=courtMatchupBoost(40,evidence);
  assert.equal(result.boost,1);
  assert.deepEqual(result.reasons.map(reason=>reason.split(' ').slice(0,2).join(' ')),['Type A','Rebounds vs','Assists vs']);
  assert.equal(courtMatchupBoost(20,evidence).boost,.6);
  assert.equal(courtMatchupBoost(40,{...evidence,typeDeltas:[10,10,10,10],opponent:{...evidence.opponent,games:4}}).boost,0);
  assert.equal(courtMatchupBoost(40,{...evidence,typeDeltas:[-2,-2,-2,1,9],
    opponent:{...evidence.league,pra:55,games:10}}).boost,0);
  const field=courtField(players,slate,courtDefense(players),{scoringType:()=>evidence});
  assert.ok(field.rows.every(row=>row.matchup.boost>0&&Math.abs(row.projected-row.base-row.matchup.boost)<1e-10));
});
