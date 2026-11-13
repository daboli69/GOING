import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPro,applyCollege,dueGames,isDone,startOf} from '../site/live-scores.mjs';
import {healthProblems} from '../scripts/health.mjs';

const now=Date.parse('2026-11-14T01:00:00Z');
const iso=m=>new Date(now+m*60000).toISOString();

test('live scores only poll games that are under way or about to start',()=>{
  const games=[{id:'a',iso:iso(-30),status:'FUT'},{id:'b',iso:iso(5)},{id:'c',iso:iso(60)},{id:'d',iso:iso(-30),status:'FINAL',sa:1,sh:2},
    {id:'e',iso:iso(-600)},{id:'f',date:'2026-11-13',time:'19:45'}];
  assert.deepEqual(dueGames(games,now).map(g=>g.id),['a','b','f']);
  assert.equal(isDone({sa:20,sh:17}),true,'NFL archive rows are final once both scores exist');
  assert.equal(startOf({date:'2026-11-13',time:'20:15'}),Date.parse('2026-11-14T01:15:00Z'));
});

test('pro slates take live and final scores, matched by ESPN id or by teams',()=>{
  const games=[{id:'2026_10_WAS_NYG',espn:'401',a:'WAS',h:'NYG',sa:null,sh:null},{id:'2026020309',a:'TBL',h:'SEA',status:'FUT'},{id:'x',a:'BOS',h:'NYR',status:'FUT'}];
  const rows=[{id:'401',a:'WSH',h:'NYG',status:'LIVE',sa:7,sh:3},{id:'999',a:'TBL',h:'SEA',status:'FINAL',sa:4,sh:1},{id:'5',a:'BOS',h:'NYR',status:'FUT',sa:0,sh:0}];
  assert.equal(applyPro(games,rows),true);
  assert.deepEqual(games.map(g=>[g.status,g.sa,g.sh]),[['LIVE',7,3],['FINAL',4,1],['FUT',undefined,undefined]]);
  assert.equal(applyPro(games,rows),false,'nothing changes the second time');
});

test('college slates take ESPN status words, scores and clock',()=>{
  const games=[{id:'100',status:'scheduled',aScore:null,hScore:null,detail:'7:00 PM'}];
  const event=(state,name,completed,detail,a,h)=>({events:[{id:100,competitions:[{status:{type:{state,name,completed,shortDetail:detail}},
    competitors:[{homeAway:'home',score:h},{homeAway:'away',score:a}]}]}]});
  assert.equal(applyCollege(games,event('pre','STATUS_SCHEDULED',false,'7:00 PM','0','0')),false);
  assert.equal(applyCollege(games,event('in','STATUS_IN_PROGRESS',false,'2nd Half 10:23','40','38')),true);
  assert.deepEqual([games[0].status,games[0].aScore,games[0].hScore,games[0].detail],['live',40,38,'2nd Half 10:23']);
  applyCollege(games,event('post','STATUS_FINAL',true,'Final','71','80'));
  assert.equal(games[0].status,'final');
});

test('feed health flags stale and missing feeds but not fresh ones',()=>{
  const t=Date.parse('2026-11-13T12:00:00Z'),ago=h=>new Date(t-h*3600000).toISOString();
  const fresh={live:{updated:ago(1),missing:[]},archive:{updated:ago(20)},college:{cbb:{updated:ago(1)},cwb:{updated:ago(1)},fbs:{updated:ago(1)}},
    tracker:{updated:ago(1)},parlays:{updated:ago(1)}};
  assert.deepEqual(healthProblems(fresh,t),[]);
  const bad=healthProblems({...fresh,live:{updated:ago(5),missing:['injuries nhl']},archive:null,college:{...fresh.college,fbs:{available:false}}},t).map(p=>p.key);
  assert.deepEqual(bad,['Live slates, injuries and prices','live:injuries nhl','Season archives (NFL, NBA, NHL)']);
});

test('player photos and team logos are requested at the size the pages show',async()=>{
  const {headshot,espnLogo}=await import('../site/ui.mjs');
  assert.equal(headshot('https://static.www.nfl.com/image/upload/f_auto,q_auto/league/abc'),'https://static.www.nfl.com/image/upload/f_auto,q_auto,w_96/league/abc');
  assert.equal(headshot('https://a.espncdn.com/i/headshots/nba/players/full/1.png'),'https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/1.png&w=96&h=70');
  assert.equal(headshot('https://assets.nhle.com/mugs/nhl/1.png'),'https://assets.nhle.com/mugs/nhl/1.png');
  assert.equal(espnLogo('nba/500/bos.png'),'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/bos.png&w=96&h=96');
});
