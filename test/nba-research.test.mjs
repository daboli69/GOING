import test from 'node:test';
import assert from 'node:assert/strict';
import {playerProfile,assistArchive,assistMatchup} from '../site/nba-research.mjs';

const shot = (kind,feet,points) => ['shooter','A','B',0,0,feet,points,1,kind];

test('the B and C profiles distinguish off-dribble and catch-and-shoot attempts at similar three-point volume',()=>{
  const common=[
    ...Array(16).fill(shot('Catch & Shoot',24,3)),...Array(10).fill(shot('Pull-up',24,3)),
    ...Array(4).fill(shot('Fade',14,2)),...Array(7).fill(shot('Floater',8,2)),
    ...Array(14).fill(shot('Drive',5,2)),...Array(7).fill(shot('Jumper',16,2)),
    ...Array(4).fill(shot('Cut',4,2)),...Array(3).fill(shot('Lob',1,2)),
  ];
  const pullup=[...common,...Array(25).fill(shot('Pull-up',24,3)),...Array(10).fill(shot('Catch & Shoot',16,2))];
  const catchAndShoot=[...common,...Array(25).fill(shot('Catch & Shoot',24,3)),...Array(10).fill(shot('Pull-up',16,2))];
  assert.equal(playerProfile(pullup).letter,'B');
  assert.equal(playerProfile(catchAndShoot).letter,'C');
  assert.equal(playerProfile(pullup.slice(0,49)).letter,null);
  assert.equal(playerProfile(pullup).mix.at(-1),null);
});

test('assisted makes are matched by shooter and game, with zero-make games and a historical cutoff',()=>{
  const games=Object.fromEntries([1,2,3,4].map((n)=>['g'+n,{id:'g'+n,offenses:new Map([['A',n===1?'B':'C']])}]));
  const logs=Object.keys(games).map((game,i)=>[game,'2026-11-0'+(i+1),'A',i===0?'B':'C','home',30]);
  const shooter={id:'shooter',name:'Shooter',logs};
  const bench={id:'bench',name:'Bench',logs:[]};
  const passer={id:'passer',team:'A',logs:[]};
  const data={teams:{B:[],C:[]},assists:{passer:[
    ['g1','shooter','A','Catch & Shoot',3],['g1','shooter','A','Drive',2],
    ['g2','shooter','A','Lob',2],['g2','passer','A','Lob',2],['g3','shooter','A','Hook',1],
    ['future','shooter','A','Lob',2],
  ]}};
  const type=id=>id==='shooter'?'C':null;
  const archive=assistArchive(data,[shooter],games,type);
  const result=assistMatchup(archive,passer,[shooter,bench],'B',new Set(['shooter']),new Set(),type);
  assert.equal(result.events,3);
  assert.deepEqual(result.recipients[0].mix,[1,1,1,0,0]);
  assert.ok(Math.abs(result.recipients[0].defense.delta-5/3)<1e-10);
  assert.equal(result.recipients[0].defense.n,1);
  assert.equal(result.recipients[0].out,true);
  assert.equal(result.recipients[1].n,0);
  assert.equal(result.targetDelta,null);
  assert.equal(result.read,'No Read');
});
