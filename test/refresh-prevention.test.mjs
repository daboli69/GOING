import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {routes} from '../site/config.mjs';
import {deliveryDecision,monitorDelivery} from '../scripts/watch-delivery.mjs';
import {manifestProblem,verifyArtifact} from '../scripts/verify-build.mjs';
import {confirmedBacklog,healthProblems} from '../scripts/health.mjs';
import {publicQuotes} from '../scripts/market-data.mjs';

const now=Date.parse('2026-11-16T02:00:00Z'), ago=m=>new Date(now-m*60000).toISOString();
test('watchdog recovers stale published data once and never duplicates active or recent recoveries',async()=>{
  assert.equal(deliveryDecision({updated:ago(34)},[],now).state,'fresh');
  assert.equal(deliveryDecision({updated:ago(36)},[{status:'queued'}],now).state,'active');
  assert.equal(deliveryDecision({updated:ago(36)},[{status:'completed',display_title:'GOING freshness recovery',created_at:ago(44)}],now).state,'cooldown');
  assert.equal(deliveryDecision(null,[],now).dispatch,true);
  assert.equal(deliveryDecision({updated:ago(-8)},[],now).dispatch,true);
  const events=[];
  const check=await monitorDelivery({manifest:{updated:ago(38)},runs:[],now,dispatch:async()=>events.push('dispatch'),
    report:async message=>events.push(message)});
  assert.equal(check.state,'recover');
  assert.deepEqual(events,['dispatch','The public live snapshot is older than 35 minutes.']);
  await monitorDelivery({manifest:{updated:ago(1)},runs:[],now,dispatch:async()=>assert.fail('unexpected dispatch'),
    report:async message=>assert.equal(message,null)});
});

test('deployment rejects a timestamp regression and a broken tracker or bundle',async t=>{
  const base=resolve(tmpdir()), dir=await mkdtemp(join(base,'going-verify-'));
  assert.equal(dirname(dir),base);
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const write=async (relative,text)=>{
    const file=join(dir,relative);
    await mkdir(dirname(file),{recursive:true});
    await writeFile(file,text);
  };
  const json=(file,data)=>write('data/'+file+'.json',JSON.stringify(data));
  const html='<link href="style.css?v=1234567890"><script src="app.mjs?v=1234567890"></script>';
  const pages=new Set(routes.map(r=>r.path.split('#')[0].replace(/(^|\/)$/,'$1index.html')));
  for(const path of pages)await write(path,html);
  await write('app.mjs','');await write('style.css','');
  await json('live/manifest',{updated:ago(4),missing:[]});await json('archive',{updated:ago(240)});
  await json('health',{checked:ago(1),problems:[]});
  for(const index of ['index','parlay-legs-index','nfl-parlay-legs-index','first-basket-index','td-board-index'])
    await json('tracker/'+index,{updated:ago(3),count:0,months:[]});
  assert.deepEqual(await verifyArtifact(dir,{now,previous:{updated:ago(10)}}),[]);
  assert.match(manifestProblem({updated:ago(10),missing:[]},{updated:ago(4)},now),/newer public/);
  await json('tracker/td-board-index',{updated:ago(3),count:1,months:['2026-11']});
  await write('long/index.html',html.replace('style.css?v=1234567890','style.css?v=0987654321'));
  const errors=await verifyArtifact(dir,{now});
  assert.ok(errors.some(e=>e.includes('bundle in long/index.html')));
  assert.ok(errors.some(e=>e.includes('tracker/td-board-2026-11.json')));
});

test('tracker timestamps cannot hide a grading backlog for confirmed finals',()=>{
  const rows=[{game:'done',start:ago(500)},{game:'not-final',start:ago(500)},{game:'new',start:ago(60)},{game:'future',start:ago(-60)}];
  const backlog=confirmedBacklog(rows,p=>p.game!=='not-final',now);
  assert.deepEqual(backlog,{count:1,games:1});
  const keys=healthProblems({live:{updated:ago(5)},tdBoard:{updated:ago(5),gradingBacklog:backlog}},now).map(x=>x.key);
  assert.ok(keys.includes('grading:TD Board log'));
  assert.ok(!keys.includes('TD Board log'));
});

test('a transient market transport error is retried before cached quotes are needed',async()=>{
  const game={a:'KC',h:'ATL',date:'2026-11-15'};
  let attempts=0,failures=[];
  await publicQuotes('nfl',[game],{onFailure:x=>{failures=x;},read:async url=>{
    if(url.searchParams.get('event_ticker').startsWith('KXNFLRSHYDS')&&++attempts===1)throw new Error('temporary network failure');
    return Response.json({markets:[],cursor:''});
  }});
  assert.equal(attempts,2);
  assert.deepEqual(failures,[]);
});
