import test from 'node:test';
import assert from 'node:assert/strict';
import {shrinkTip,tipChance,firstScoreChance,openingTables,possessionChance,teamFirst,earlyShares,blendShare,scorerShares,
  fairChances,impliedChance,americanFrom,roundRobin,makeEdge,shotTables,regression,convictionTier} from '../site/first-basket.mjs';

const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,a+' vs '+b);

test('tip rate shrinks toward 50%: 10 of 11 reads as about 70%',()=>{
  const p=shrinkTip(10,11);
  assert.ok(p>.65&&p<.72,String(p));
  near(tipChance(.7,.5),.7);near(tipChance(.6,.6),.5);
});

test('team first-score chances alternate from the tip and sum to 1',()=>{
  near(firstScoreChance(1,1,.5),1,1e-12);
  near(firstScoreChance(0,.5,1),0,1e-12);
  near(firstScoreChance(.6,.45,.5)+firstScoreChance(.4,.5,.45),1);
  assert.ok(firstScoreChance(.7,.46,.46)>.5,'winning the tip is an edge');
});

const game=(date,tip,poss,by={})=>({date,tip,by,poss});
const first={
  g1:game('2026-11-01','AAA',[['AAA',0,['a1'],'',''],['BBB',2,['b1'],'','b1'],['AAA',3,['a2'],'','a2']],{AAA:{shot:'a1'},BBB:{shot:'b1'}}),
  g2:game('2026-11-03','BBB',[['BBB',0,[],'',''],['AAA',2,['a1'],'','a1'],['BBB',1,[],'b2','b2']],{AAA:{shot:'a1'},BBB:{}}),
  g3:game('2026-11-20','AAA',[['AAA',2,['a1'],'','a1']])
};
test('opening tables count possessions to score and allow, and only use earlier games',()=>{
  const t=openingTables(first,'2026-11-10');
  assert.deepEqual([t.team.AAA.offScored,t.team.AAA.offTrials],[2,3]);
  assert.deepEqual([t.team.BBB.offScored,t.team.BBB.offTrials],[2,3]);
  assert.deepEqual([t.team.AAA.defScored,t.team.AAA.defTrials],[2,3]);
  assert.deepEqual([t.team.AAA.tipW,t.team.AAA.tipN],[1,2]);
  near(t.league,4/6);
  const tf=teamFirst(t,'AAA','BBB');
  near(tf.first.AAA+tf.first.BBB,1);
  const p=possessionChance(t,'AAA','BBB');assert.ok(p.p>.15&&p.p<.85);
});

test('early shares count field goals and free-throw trips in the first possessions, plus first shots',()=>{
  const s=earlyShares(first,'AAA',{a1:['g1','g2'],a2:['g1']},'2026-11-10');
  near(s.a1.early,2/3);near(s.a1.firstShot,1);assert.equal(s.a1.games,2);
  near(s.a2.early,1/2);near(s.a2.firstShot,0);
  const blended=blendShare(s.a2,.2);
  assert.ok(blended>.2&&blended<.5,'one game moves a little from usage');
  near(blendShare({games:0,early:null},.25),.25);
});

test('scorer shares are proportional to share times conversion and leave the bench a floor',()=>{
  const r=scorerShares([{id:'x',share:.5,make:.46,ftShare:0,ftScore:.9},{id:'y',share:.5,make:.46,ftShare:0,ftScore:.9}],.46);
  near(r.players.x.given,r.players.y.given);
  near(r.players.x.given+r.players.y.given+r.bench,1);
  assert.ok(r.bench>0);
  const ft=scorerShares([{id:'x',share:.4,make:.46,ftShare:.3,ftScore:.9},{id:'y',share:.4,make:.46,ftShare:0,ftScore:.9}],.46);
  assert.ok(ft.players.x.given>ft.players.y.given,'free-throw trips convert more often');
});

test('make edges are capped, and small ones are ignored',()=>{
  const shot=(kind,three,make,poss=1)=>[ 'p','T','D',0,0,three?25:2,three?3:2,make,kind,1,poss];
  const shots={g:[...Array(60)].map((_,i)=>shot('Inside',false,i%2))};
  const tables=shotTables(shots,'2099-01-01',{g:'2026-01-01'});
  assert.equal(makeEdge(shots.g,'D',tables),1,'a player at the league rate gets no edge');
  const hot=[...Array(200)].map(()=>shot('Inside',false,1));
  assert.ok(makeEdge(hot,'D',tables)<=1.15);
});

test('price checks match the worked examples: 20% at +290 is a skip, 15% at +900 is a play',()=>{
  near(impliedChance('+290'),100/390);
  const fair=fairChances({a:'+290',b:'+900'},.3).fair;
  const play=(model,f,minEdge=.02,ratio=1.2)=>model-f>=minEdge&&model>=ratio*f;
  assert.equal(play(.20,fair.a),false);
  assert.equal(play(.15,fair.b),true);
  const full=fairChances({a:'+150',b:'+150',c:'+150'},.3);
  assert.equal(full.method,'normalized');near(Object.values(full.fair).reduce((s,x)=>s+x,0),1);
  assert.equal(americanFrom(.2),'+400');assert.equal(americanFrom(.6),'-150');
});

test('the round robin takes the top edges, allows several per game, and skips same-game combinations',()=>{
  const rr=roundRobin([{edge:.09,game:'1',r:'a'},{edge:.08,game:'1',r:'b'},{edge:.05,game:'2',r:'c'},{edge:.04,game:'3',r:'d'}],3,2);
  assert.deepEqual(rr.picks.map(x=>x.r),['a','b','c']);
  assert.deepEqual(rr.combos.map(c=>c.map(x=>x.r).join('')),['ac','bc']);
  assert.equal(rr.skipped,1,'a and b share a game: only one can score first');
});

test('regression compares team-first scores with what early volume predicts',()=>{
  const due=regression({games:12,early:.32,teamFirst:1});
  assert.equal(due.kind,'positive');near(due.expected,3.84);
  const hot=regression({games:12,early:.12,teamFirst:5});
  assert.equal(hot.kind,'negative');
  assert.equal(regression({games:12,early:.25,teamFirst:3}).kind,null);
  assert.equal(regression({games:0,early:null}),null);
});

test('conviction tiers need a priced edge once a price exists',()=>{
  assert.equal(convictionTier(5,true,true),'Strong');
  assert.equal(convictionTier(3,true,true),'Lean');
  assert.equal(convictionTier(6,true,false),null,'no edge at the price, no suggestion');
  assert.equal(convictionTier(4,false,false),'Lean');
  assert.equal(convictionTier(3,false,false),null);
});
