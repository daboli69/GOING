import assert from 'node:assert/strict';
import test from 'node:test';
import {currentStint,evidenceGroups,exactRecord,firstBasketHistory,roleTrend,sharedAvailability} from '../site/nba-role-data.mjs';
import {exactQuoteComparison} from '../site/nba-evidence-view.mjs';
import {parseTrackingRows,playerTracking} from '../site/nba-tracking-stats.mjs';

const row=(day,options={})=>[String(day),'2026-11-'+String(day).padStart(2,'0'),options.team||'BOS',
  options.opp||'DET',options.venue||'home',options.min??30,options.points??10,1,3,5,options.attempts??8,3,1,2,3,4,options.start??1];

test('role deltas compare disjoint, current-team games and withhold small baselines',()=>{
  const logs=[row(1,{team:'NY',min:40}),...Array.from({length:5},(_,i)=>row(i+2,{min:20,attempts:7})),
    row(7),row(8),row(9),row(10,{min:48})];
  const current=currentStint(logs,'BOS','2026-11-10');
  assert.deepEqual(current.map(r=>r[0]),['2','3','4','5','6','7','8','9']);
  const trend=roleTrend(current,3);
  assert.equal(trend.minutes,10);
  assert.equal(trend.attempts,1);
  assert.equal(roleTrend(current.slice(1),3).minutes,null);
});

test('joint availability uses the common stint and requires everybody in or everybody out',()=>{
  const logs=[row(1),row(2),row(3),row(4),row(5)];
  const split=sharedAvailability(logs,[
    {firstDate:'2026-11-02',ids:new Set(['2','3'])},
    {firstDate:'2026-11-03',ids:new Set(['3','4'])}
  ]);
  assert.deepEqual(split.together.map(r=>r[0]),['3']);
  assert.deepEqual(split.without.map(r=>r[0]),['5']);
});

test('exact lines separate pushes, use team rest and never include games on or after the slate',()=>{
  const logs=[row(2,{points:10}),row(3,{points:12}),row(6,{points:8}),row(7,{points:100})];
  const groups=evidenceGroups(logs,{opponent:'DET',team:'BOS',venue:'home',day:'2026-11-07',teamGames:{BOS:logs}});
  const b2b=groups.find(g=>g.label==='Back-to-back');
  assert.equal(b2b.todayBackToBack,true);
  assert.deepEqual(b2b.sample.map(r=>r[0]),['3']);
  assert.deepEqual(exactRecord(groups.find(g=>g.label==='Season').sample,'Points',10,'Under'),{hits:1,n:2,pushes:1,rate:.5});
  assert.deepEqual(exactRecord([row(2)],'PRA',18,'Over'),{hits:0,n:0,pushes:1,rate:null});
});

test('opening history separates first-shot and first-score coverage and limits head-to-head to starts',()=>{
  const logs=[row(1),row(2,{start:0}),row(3,{opp:'NY'}),row(4),row(5)];
  const games={1:{firstPts:'p'},2:{firstShot:'p',firstPts:'p'},3:{firstShot:'p',firstPts:'p'},4:{firstShot:'p',firstPts:'q'}};
  assert.deepEqual(firstBasketHistory(logs,games,'p','DET','Head-to-head'),{n:2,firstPoints:1,firstShots:1,tookFirstShot:1});
});

test('price comparisons match the exact line, exclude post-tip or stale prices and keep newest source quote',()=>{
  const now=Date.parse('2026-11-24T23:00:00Z'), detail={tip:'2026-11-25T00:00:00Z',line:12.5,side:'Under'};
  const price=(provider,capturedAt,under,line=12.5)=>({provider,capturedAt,under,line});
  const rows=[
    price('A','2026-11-24T22:00:00Z',-102), price('A','2026-11-24T22:30:00Z',-110),
    price('B','2026-11-24T22:20:00Z',-104), price('B','2026-11-24T22:50:00Z',120,11.5),
    price('C','2026-11-24T20:59:00Z',125), price('D','2026-11-25T00:00:00Z',130)
  ];
  assert.deepEqual(exactQuoteComparison(rows,detail,{now}).map(r=>[r.provider,r.price]),[['B',-104],['A',-110]]);
});

test('optical tracking requires compatible cutoff and a unique name and team match',()=>{
  const headers=['POTENTIAL_AST','GP','PLAYER_NAME','TEAM_ABBREVIATION'];
  const assists=parseTrackingRows({resultSets:[{headers,rowSet:[[12,9,'José Test','WAS'],[null,9,'C Test','WAS']]}]},'POTENTIAL_AST');
  assert.deepEqual(assists,[['José Test','WAS',9,12]]);
  const snapshot={through:'2026-11-23',assists,chances:[['Jose Test','WSH',8,6],['Jose Test','WSH',6,4]]};
  const player={name:'Jose Test',team:'WSH'};
  assert.deepEqual(playerTracking(snapshot,'2026-11-24')(player),{potential:{games:9,value:12},chances:null});
  assert.equal(playerTracking(snapshot,'2026-11-23')(player),null);
  assert.equal(playerTracking(snapshot,'2026-11-27')(player),null);
});
