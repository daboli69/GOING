import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {round,american,implied,poissonTail,distanceZone,leaderShares} from '../site/math.mjs';
import {parseLineups} from '../scripts/lineups.mjs';
import {eventSuffixes,quote,chooseQuotes} from '../scripts/market-data.mjs';
import {routes} from '../site/config.mjs';
import {together,lineStats} from '../scripts/lines-data.mjs';

test('every tool has one unique path inside its sport section',()=>{
  assert.equal(routes.length,65);
  assert.equal(new Set(routes.map(r=>r.path)).size,routes.length);
  assert.equal(routes.filter(r=>r.group==='Promos').length,5);
  const home={nfl:'long/',nba:'up/',nhl:'goal/',mlb:'yard/'};
  for(const r of routes)if(home[r.sport])assert.ok(r.path.startsWith(home[r.sport]),r.path);
});
test('the snapshot contains regular-season NFL play-by-play with resolvable players',{skip:!existsSync(new URL('../site/data/nfl-2026.json',import.meta.url))&&'no local snapshot'},()=>{
  const read=x=>JSON.parse(readFileSync(new URL('../site/data/'+x+'.json',import.meta.url),'utf8'));
  const schedule=read('nfl-schedule'),pbp=read('nfl-2026'),game=schedule.find(g=>g.id==='2026_10_WAS_NYG');
  assert.deepEqual([game.a,game.h,game.date],['WAS','NYG','2026-11-12']);
  const plays=Object.entries(pbp.events).filter(([id])=>id.startsWith('2026_')&&id.includes('WAS')&&+id.slice(5,7)<10).flatMap(([,p])=>p);
  assert.equal(plays.filter(x=>x[0]==='WAS'&&x[1]==='pass'&&x[8]==='WAS'&&!x[22]).length,12);
  assert.ok(plays.some(x=>x[8]==='WAS'&&pbp.players[x[9]]?.[0]==='Stefon Diggs'));
});
test('shot and fair-price calculations handle their boundaries',()=>{
  assert.equal(round(5/8,2),'0.62');
  assert.equal(round(17/8,2),'2.12');
  assert.equal(implied(american(.4)),.4);
  assert.ok(Math.abs(poissonTail(2,1)-(1-Math.exp(-2)))<1e-10);
  assert.equal(poissonTail(2,0),1);
  assert.equal(distanceZone([0,'DET','WSH',39,22,22,3,1]),'Corner 3');
  const dist=leaderShares([{id:'a',x:10},{id:'b',x:10}],p=>p.x,()=>0,20);
  assert.ok(Math.abs(dist.get('a')-.5)<1e-10);
});
test('official lineups retain combinations and respect the report date',()=>{
  const body='## THURSDAY\n\n**Hurricanes projected lineup**\n\nWilliam Carrier -- Sebastian Aho -- Andrei Svechnikov\n\nJacob Slavin -- Jalen Chatfield\n\nBrandon Bussi\n\n***Scratched:** None*';
  const html='<script type="application/ld&#x2B;json">'+JSON.stringify({articleBody:body,dateModified:'2026-11-12T20:00:00Z'})+'</script>';
  const r=parseLineups(html,'2026-11-12');
  assert.equal(r.CAR.forwards[0][1],'Sebastian Aho');
  assert.deepEqual(r.CAR.goalies,['Brandon Bussi']);
  assert.deepEqual(parseLineups(html,'2026-11-11'),{});
});
test('exchange prices require quoted size and keep the exact event and line',()=>{
  const g={a:'TBL',h:'NJD',date:'2026-11-12'};
  assert.ok(eventSuffixes('nhl',g).includes('26NOV12TBNJ'));
  const market={title:'Example Skater: 2+ points',status:'active',floor_strike:1.5,yes_ask_dollars:'.45',yes_ask_size_fp:'20',no_ask_dollars:'.60'};
  const x=quote(market,'Points',g);
  assert.equal(x.under,null);
  assert.equal(x.line,1.5);
  assert.equal(quote({...market,status:'settled'},'Points',g),null);
  const twoSided=quote({...market,floor_strike:.5,no_ask_size_fp:'10'},'Points',g);
  const list=chooseQuotes([x,twoSided]);
  assert.equal(list.length,1);
  assert.equal(list[0].provider,'Kalshi');
  assert.equal(list[0].line,.5);
});
test('line matchups count only the time when all players share the ice',()=>{
  assert.deepEqual(together([[[0,25]],[[10,30]],[[15,35]]]),[[15,25]]);
  const names=['One Player','Two Player','Three Player'];
  const rows=names.map((n,i)=>({firstName:n.split(' ')[0],lastName:'Player',teamAbbrev:'CAR',period:1,startTime:'00:'+String(i*5).padStart(2,'0'),endTime:'00:25'}));
  const shots=[['CAR',1,9,65,0,2],['CAR',1,10,65,0,1],['SEA',2,24,65,0,2],['CAR',1,25,65,0,2]];
  assert.deepEqual(lineStats(rows,shots,'CAR',[names]),[{sec:15,sf:1,sa:1,gf:0,ga:1}]);
});
test('the pick tracker grades sides, pushes and units at the captured price',async()=>{
  const {outcome,units,leanOf,impliedProb,blank,add,rate,roi}=await import('../site/track-core.mjs');
  assert.equal(outcome(3,2.5,'Over'),'won');
  assert.equal(outcome(2,2.5,'Under'),'won');
  assert.equal(outcome(3,3,'Over'),'push');
  assert.equal(outcome(null,2.5,'Over'),null);
  assert.equal(units('won','+150'),1.5);
  assert.ok(Math.abs(units('won','-120')-100/120)<1e-12);
  assert.equal(units('lost','-120'),-1);
  assert.equal(units('push','+200'),0);
  assert.equal(units('won',null),null);
  assert.ok(Math.abs(impliedProb('-150')-.6)<1e-12);
  assert.equal(leanOf({edge:.04}),true);
  assert.equal(leanOf({prob:.4,odds:'+200'}),true);
  assert.equal(leanOf({avg:3.1,line:2.5,side:'Under'}),false);
  assert.equal(leanOf({line:2.5}),null);
  const s=blank();
  for(const [result,odds] of [['won','+100'],['lost','+100'],['push','+100'],['won','-200']])add(s,{result,odds},.6);
  assert.equal(rate(s),2/3);
  assert.equal(s.units,.5);
  assert.equal(roi(s),.5/3);
});
test('MLB picks grade from the official box score and skip players who did not bat',async()=>{
  const {mlbStat,outcome}=await import('../site/track-core.mjs');
  const box={teams:{away:{players:{ID1:{stats:{batting:{plateAppearances:4,homeRuns:1,hits:2,runs:1,rbi:3},pitching:{}}},ID2:{stats:{batting:{},pitching:{strikeOuts:7}}}}},home:{players:{ID3:{stats:{batting:{plateAppearances:0},pitching:{}}}}}}};
  assert.equal(mlbStat(box,1,'Home Run'),1);
  assert.equal(mlbStat(box,1,'H+R+RBI'),6);
  assert.equal(outcome(mlbStat(box,1,'Hits'),.5,'Over'),'won');
  assert.equal(mlbStat(box,2,'Strikeouts'),7);
  assert.equal(mlbStat(box,2,'Hits'),null);
  assert.equal(mlbStat(box,3,'Hits'),null);
  assert.equal(mlbStat(box,9,'Home Run'),null);
});
