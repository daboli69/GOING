import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openEvaluation} from '../scripts/gta-vault.mjs';
import {breakEven,classify,gtaStart,gtaEnd,gtaVisible,poissonUnder,stress} from '../site/gta-event.mjs';
import {discover} from '../scripts/gta-discovery.mjs';
import {evaluate,gradeTotal,scorePredictions} from '../scripts/gta-evaluate.mjs';

test('release tab uses the Eastern date, completion marker, off switch and expiration',()=>{
  assert.equal(new Date(gtaEnd).toISOString(),'2026-11-21T11:00:00.000Z');
  assert.ok(!gtaVisible(gtaStart-1));
  assert.ok(gtaVisible(gtaStart));
  assert.ok(!gtaVisible(gtaStart+10,{completedAt:'2026-11-20T13:00Z'}));
  assert.ok(!gtaVisible(gtaStart,null,false));
  assert.ok(!gtaVisible(gtaEnd));
});

test('stress preserves the baseline, tests both directions and handles integer pushes',()=>{
  const mean=3,line=3,model='nhl-poisson';
  const input=poissonUnder(mean,line);
  assert.ok(input.push>0);
  const result=stress({projection:mean,line,model,odds:-110,...input});
  assert.ok(result[0].prob>result[1].prob&&result[1].prob>result[2].prob);
  assert.equal(result[1].prob,input.prob);
  assert.equal(stress({odds:120}).length,0);
  assert.equal(breakEven(200),1/3);
});

test('historical support depends on recent and season results rather than the price',()=>{
  const supported={odds:-500,prob:.64,history:{season:{hits:11,n:15},recent:{hits:7,n:10}}};
  assert.equal(classify(supported),'supported');
  assert.equal(classify({...supported,odds:150}),'supported');
  assert.equal(classify({...supported,unavailable:true}),'unsupported');
  assert.equal(classify({...supported,injuryFlag:'Questionable'}),'unsupported');
  assert.equal(classify({...supported,history:{season:{hits:11,n:15},recent:{hits:5,n:10}}}),'unsupported');
  assert.equal(classify({odds:100,prob:.49}),'sensitive');
});

test('discovery only joins an exact pregame snapshot from a timestamped source',()=>{
  const frozen=Date.parse('2026-11-19T18:00Z'),at='2026-11-19T17:45Z', date='2026-11-19',tip='2026-11-20T01:00Z';
  const game={id:'100',a:'SF',h:'NY',iso:tip,status:'FUT'};
  const prop={a:'SF',h:'NY',date,player:'Example Player',market:'Arbitrary count market',line:4.5,under:+125,provider:'DraftKings',capturedAt:at};
  const leg={name:prop.player,player:'1',date,side:'Under',tip,game:game.id,stat:prop.market,line:4.5,price:125,provider:prop.provider,alternate:false,
    capturedAt:at,observedAt:'2026-11-19T17:50Z',form:{season:{n:20,hits:11}}};
  const data={nbaSlate:[game],nba:[leg],nbaQuotes:[prop,{...prop,line:3.5,provider:'Kalshi'},{...prop,line:2.5,capturedAt:tip}],nfl:[],picks:[]};
  const first=discover(data,frozen);
  assert.equal(first.rows.length,1);
  assert.equal(first.rows.find(r=>r.line===4.5)?.prob,16/30);
  assert.equal(first.rows.find(r=>r.line===3.5)?.prob,undefined);
  assert.equal(discover(data,Date.parse(tip)).rows.length,0);
});

test('postgame scores use one representative line and leave unfinished games unresolved',()=>{
  assert.equal(gradeTotal({status:'scheduled',total:100},{line:102}),null);
  assert.deepEqual(gradeTotal({status:'final',total:102},{line:102}),{actual:102,result:'push'});
  const row={sport:'nba',game:'11',id:'1',market:'Points',provider:'Book',odds:100,prob:.6,line:3.5};
  const sample=[{row,result:'won'},{row:{...row,odds:300,prob:.2,line:9.5},result:'lost'}];
  const scored=scorePredictions(sample);
  assert.equal(scored.representative,1);
  assert.equal(scored.games,1);
  assert.ok(Math.abs(scored.brier[1]-.16)<1e-8);
  assert.equal(scorePredictions([{row,result:null},sample[1]]).representative,0);
});

test('final results produce a completion marker and save the graded research encrypted',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'going-gta-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const publicStatus=join(dir,'status.json'),privateArchive=join(dir,'result.enc');
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const start='2026-11-19T22:00:00Z';
  const row={sport:'fbs',kind:'Game',game:'1234',start,line:51.5,odds:-110,provider:'Book',subject:'A @ B'};
  const snapshot={frozenAt:'2026-11-19T19:00:00Z',games:[{sport:'fbs',id:'1234',start}],rows:[row]};
  let final=false;
  t.mock.method(globalThis,'fetch',async url=>String(url).includes('/scoreboard?')?{
    ok:true,json:async()=>({events:[{id:'1234',competitions:[{
      status:{type:final?{name:'STATUS_FINAL',completed:true}:{name:'STATUS_SCHEDULED',completed:false}},
      competitors:[{homeAway:'home',score:'25'},{homeAway:'away',score:'24'}]
    }]}]})
  }:{ok:false});
  const cfg={publicStatus,privateArchive,publicKey,now:Date.parse('2026-11-20T04:00Z')};
  assert.equal(await evaluate(snapshot,cfg),null);
  await assert.rejects(readFile(publicStatus));
  final=true;
  const report=await evaluate(snapshot,cfg);
  assert.equal(report.complete,true);
  const marker=JSON.parse(await readFile(publicStatus,'utf8'));
  assert.deepEqual(Object.keys(marker).sort(),['completedAt','digest','frozenAt']);
  assert.ok(!gtaVisible(cfg.now,marker));
  const encrypted=JSON.parse(await readFile(privateArchive,'utf8'));
  const saved=openEvaluation(encrypted,privateKey);
  assert.equal(saved.graded[0].actual,49);
  assert.equal(saved.graded[0].result,'won');
});
