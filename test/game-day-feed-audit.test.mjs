import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseShiftReport,shiftReader} from '../scripts/nhl-shifts.mjs';
import {recentLines} from '../scripts/lines-data.mjs';
import {nflWeather} from '../scripts/weather.mjs';

const game={id:'2026020314',a:'EDM',h:'TOR',date:'2026-11-14',status:'FINAL'};
const row=(...cells)=>'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
const report=(side='Home',number='0314')=>'<html><title>Time On Ice Report '+side+' Team</title><td>Game '+number+'</td>'+
  Array.from({length:15},(_,i)=>'<td class="playerHeading + border">'+(i+1)+' Test, Player '+i+'</td>'+
    Array.from({length:10},(_,j)=>row(j+1,j===9?'OT':1,j+':01 / 15:00',j+':33 / 14:27')).join('')+row('TOT',10)
  ).join('')+'</html>';

test('NHL shift reports verify the game, side and full player shift counts',()=>{
  const home=parseShiftReport(report(),game,'TOR'), away=parseShiftReport(report('Away'),game,'EDM');
  assert.equal(home.length,150);
  assert.equal(away.length,150);
  assert.deepEqual(home[9],{teamAbbrev:'TOR',firstName:'Player 0',lastName:'Test',period:4,startTime:'9:01',endTime:'9:33'});
  assert.equal(parseShiftReport(report(),game,'EDM'),null);
  assert.equal(parseShiftReport(report('Home','0315'),game,'TOR'),null);
  assert.equal(parseShiftReport(report().replace(row(2,1,'1:01 / 15:00','1:33 / 14:27'),''),game,'TOR'),null);
});

test('NHL shift readers reuse completed reports on the next refresh and retry via the stats API',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'going-shifts-'));
  try{
    let calls=0;
    const read=async url=>{
      calls++;
      if(url.includes('/shiftcharts'))return Response.json({data:parseShiftReport(report('Away'),game,'EDM').map(r=>({...r,gameId:game.id}))});
      return url.includes('/TH')?new Response(report()):new Response('unavailable',{status:503});
    };
    const load=await shiftReader('20262027',{dir,read});
    assert.equal((await load(game,'TOR')).length,150);
    assert.equal((await load(game,'EDM')).length,150);
    assert.equal(calls,3);
    const warm=await shiftReader('20262027',{dir,read});
    assert.equal((await warm(game,'TOR')).length,150);
    assert.equal((await warm(game,'EDM')).length,150);
    assert.equal(calls,3);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('line samples exclude games missing shot history instead of counting them as scoreless',async()=>{
  const withoutShots={...game,id:'2026020315'};
  const combo={forwards:[['Player 0 Test','Player 1 Test','Player 2 Test']],defense:[]};
  const load=async g=>{
    assert.equal(g.id,game.id);
    return parseShiftReport(report(),game,'TOR');
  };
  const {stats,coverage}=await recentLines({TOR:combo},{date:'2026-11-15',schedule:{TOR:[game,withoutShots]}},
    {[game.id]:[['TOR',1,10,0,0,1]]},load);
  assert.deepEqual(coverage.TOR,{games:[game.id,withoutShots.id],analyzed:1});
  assert.equal(stats.TOR[0][0].sf,1);
});

test('kickoff weather uses all three UTC hours across midnight and reuses only a matching recent forecast',async()=>{
  const g={id:'example',h:'PIT',date:'2026-09-13',time:'19:25'};
  const now=Date.parse('2026-09-13T21:00Z');
  const hourly={time:['2026-09-13T23:00','2026-09-14T00:00','2026-09-14T01:00'],
    precipitation:[0,.06,.07],temperature_2m:[70],wind_speed_10m:[10],wind_gusts_10m:[15]};
  let requests=0;
  const read=async url=>{
    requests++;
    assert.equal(url.searchParams.get('start_date'),'2026-09-13');
    assert.equal(url.searchParams.get('end_date'),'2026-09-14');
    return {hourly};
  };
  const previous=await nflWeather([g],{now,read});
  assert.equal(previous.example.rain,.13);
  assert.deepEqual(await nflWeather([g],{now:now+1800000,previous,read}),previous);
  assert.equal(requests,1);
  hourly.precipitation.pop();
  assert.deepEqual(await nflWeather([g],{now:now+3600000,previous,read}),{});
  assert.equal(requests,2);
});
