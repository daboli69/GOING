import test from 'node:test';
import assert from 'node:assert/strict';
import {defenseTargets,topDefenseTargets} from '../site/nfl-defense-targets.mjs';

const players=Object.fromEntries(Object.entries({thrower:'QB',back:'RB',slot:'WR',wide:'WR',occasional:'WR',tight:'TE'})
  .map(([id,pos])=>[id,[id,pos]]));
function play(off,type,yards,{receiver,air=7,location='left',complete=true,rusher,score=false,sack=false}={}){
  const row=Array(29).fill(null);
  Object.assign(row,{0:off,1:type,2:yards,4:4,8:score?off:'',9:score?receiver||rusher:'',10:type==='pass'?'thrower':'',
    11:receiver,12:rusher,13:air,15:Number(complete),18:location,28:Number(sack)});
  return row;
}
const game=(date,id,score=20)=>({id:'2026_'+id,date,a:'CIN',h:'WAS',sa:score,sh:10,time:'13:00'});
const matchup=game('2026-11-23','11_CIN_WAS',null);
const schedule=[
  ...['02','09','16','19'].map(day=>game('2026-11-'+day,day)),
  game('2026-11-20','pending',null),game('2026-11-21','missing-side'),
  game('2026-11-23','same-day'),game('2026-11-26','future')
];
const events=Object.fromEntries(schedule.map((g,i)=>[g.id,[
  play('CIN','pass',i<4?12+i*2:900,{receiver:'back'}),
  play('CIN','pass',80,{receiver:'back',complete:false}),
  ...Array.from({length:3},()=>play('CIN','pass',6,{receiver:'slot',location:'middle'})),
  ...Array.from({length:3},()=>play('CIN','pass',21,{receiver:'wide',air:19})),
  play('CIN','pass',4,{receiver:'occasional'}),
  play('CIN','pass',15,{receiver:'tight',score:true}),
  play('CIN','run',12,{rusher:'thrower'}),play('CIN','run',3,{rusher:'back'}),
  play('CIN','qb_kneel',-1,{rusher:'thrower'}),play('CIN','pass',-7,{sack:true}),
  ...(g.id==='2026_missing-side'?[]:[play('WAS','run',5,{rusher:'back'})])
]]));

test('defense targets distinguish rushing roles and receiving volume using only prior completed games',()=>{
  const data=defenseTargets({schedule,events,players},matchup);
  assert.equal(data.latest,'2026-11-19');
  const defense=data.teams.get('WAS');
  const angle=(group,stat)=>defense.angles.find(x=>x.group===group&&x.stat===stat);
  assert.equal(defense.games,4);
  assert.equal(angle('qbRush','yards').season,12);
  assert.equal(angle('qbRush','opps').season,1);
  assert.equal(angle('qbRush','explosive').season,1);
  assert.equal(angle('qbPass','opps').season,10);
  assert.equal(angle('qbPass','td').season,1);
  assert.equal(angle('qbPass','efficiency').season,null,'40 attempts are below the QB efficiency minimum');
  assert.equal(angle('rbRush','yards').season,3);
  assert.equal(angle('rbCatch','opps').season,2);
  assert.equal(angle('rbCatch','catches').season,1);
  assert.equal(angle('rbCatch','yards').season,15);
  assert.equal(angle('rbCatch','yards').recent,16);
  assert.equal(angle('slot','catches').season,3);
  assert.equal(angle('outside','explosive').season,3);
  assert.equal(angle('wr','catches').season,7,'low-sample WR targets only enter the overall wide receiver group');
  assert.equal(angle('te','td').season,1);
  assert.deepEqual(angle('qbRush','yards').rank,{rank:2,end:2,total:2});
});

test('rank requires four archived games and the top board keeps one strong angle per role',()=>{
  const early={...matchup,date:'2026-11-18'};
  const result=defenseTargets({schedule,events,players},early).teams.get('WAS');
  assert.equal(result.games,3);
  assert.ok(result.angles.every(x=>!x.rank));
  const angle=(group,rank,season=15,end=rank)=>({group,rank:{rank,end,total:12},season,league:10});
  const top=topDefenseTargets([angle('slot',12),angle('slot',11),angle('rbCatch',10),angle('te',8,19,12),angle('outside',11,9)]);
  assert.deepEqual(top.map(x=>x.group),['slot','rbCatch']);
});
