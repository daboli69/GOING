import test from 'node:test';
import assert from 'node:assert/strict';
import {nbaModelAccuracy} from '../site/nba-model-accuracy.mjs';

const names=['Logistic regression','Random forest','XGBoost','Histogram gradient boosting','RBF support-vector model','MLP neural network'];
const tip='2026-11-15T22:00:00Z', capture='2026-11-15T20:00:00Z';
const model=(id,changes={})=>({gid:id,date:'2026-11-15',away:'NY',home:'BOS',tipoff_utc:tip,
  has_forecast:true,completed:true,away_score:94,home_score:108,headline:{saved_at:capture,p_home:.6},
  models:names.map((name,i)=>({name,p_home:i===0?.8:.6})),...changes});
const feed=(...games)=>({games:Object.fromEntries(games.map(g=>[g.gid,g]))});
const picks=(g,homeWon=true)=>['combined',...names].map((id,i)=>{
  const probability=i===1?.8:.6, team=g.home, tool=id==='combined'?'nba-model':'nba-model:'+id;
  return {sport:'nba',kind:'model',market:'Winner',id,game:g.gid,date:g.date,start:g.tipoff_utc,at:capture,
    a:g.away,h:g.home,side:team,result:homeWon?'won':'lost',tools:{[tool]:{prob:probability}}};
});

test('all models are evaluated on the same verified pre-tip finals and retain tied winner records',()=>{
  const late=model('late',{headline:{saved_at:tip,p_home:.95}});
  const incomplete=model('incomplete',{models:model('x').models.slice(1)});
  const invalid=model('invalid',{models:[...model('x').models.slice(1),{name:names[0],p_home:1.2}]});
  const games=nbaModelAccuracy(feed(model('valid'),late,incomplete,invalid,model('pending',{completed:false})));
  assert.equal(games.all.games,1);
  assert.equal(games.all.rows.length,7);
  assert.ok(games.all.rows.every(row=>row.won===1&&row.accuracy===1));
  assert.equal(games.all.rows[0].name,'Logistic regression');
  assert.ok(Math.abs(games.all.rows[0].brier-.04)<1e-12);
  assert.equal(games.recent.games,1);
});

test('the tracker can grade a pending saved forecast or recover a complete older capture',()=>{
  const pending=model('pending',{completed:false,home_score:110,away_score:100});
  const old=model('rolled-off');
  const conflict=model('conflict');
  const partial=model('partial');
  const late=model('late');
  const summary=nbaModelAccuracy(feed(pending,conflict),[
    picks(pending,false)[0],...picks(old),...picks(conflict,false),...picks(partial).slice(1),
    ...picks(late).map(p=>({...p,at:tip}))
  ]);
  assert.equal(summary.all.games,2);
  assert.ok(summary.all.rows.every(row=>row.won===1&&row.lost===1&&row.accuracy===.5));
  const combined=summary.all.rows.find(row=>row.combined);
  assert.ok(Math.abs(combined.brier-.26)<1e-12);
});

test('the recent window takes the last 30 graded games in tipoff order',()=>{
  const games=Array.from({length:32},(_,i)=>{
    const start=Date.parse(tip)+i*86400000;
    return model(String(i),{date:new Date(start).toISOString().slice(0,10),tipoff_utc:new Date(start).toISOString(),home_score:i<2?0:108});
  });
  const {all,recent}=nbaModelAccuracy(feed(...games.reverse()));
  assert.equal(all.games,32);
  assert.equal(all.rows[0].won,30);
  assert.equal(recent.games,30);
  assert.equal(recent.rows[0].accuracy,1);
  assert.equal(recent.from,'2026-11-17');
});
