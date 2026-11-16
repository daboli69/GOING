import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveCache,mergeNbaSlate,newerModel,quoteAgeChanged} from '../site/pro-refresh.mjs';
import {setModelFeed} from '../site/models.mjs';
import {current as S} from '../site/ui.mjs';

test('a failed archive read can recover and simultaneous callers share a valid load',async()=>{
  let now=0, calls=0;
  const load=archiveCache({now:()=>now,ttl:10});
  const data={players:{},games:[1]};
  const read=async()=>++calls===1?null:data;
  await assert.rejects(load('nba',read),/Archive unavailable/);
  const [a,b]=await Promise.all([load('nba',read),load('nba',read)]);
  assert.equal(a,data);
  assert.equal(a,b);
  assert.equal(calls,2);
  now=11;
  assert.equal(await load('nba',async()=>{throw Error('offline');}),data);
  now+=60001;
  assert.equal(await load('nba',async()=>({games:[2]})).then(x=>x.games[0]),2);
});

test('open ensemble pages check a small digest and hold known models through a staggered publish',async()=>{
  const prior={generated_at:'2026-11-16T09:40:00Z',days:{}};
  const current={generated_at:'2026-11-16T09:50:00Z',days:{}};
  const now=Date.parse('2026-11-16T10:00Z');
  const calls=[];
  let summary=prior,feed=prior;
  const read=async file=>{calls.push(file);return file.endsWith('summary.json')?{nba:summary}:feed;};
  assert.equal(await newerModel('nba',prior,read,now),null);
  assert.deepEqual(calls,['models/summary.json']);
  summary=current;
  assert.equal(await newerModel('nba',prior,read,now),null,'summary reached the browser first');
  feed={...current,days:null};
  assert.equal(await newerModel('nba',prior,read,now),null,'broken model is ignored');
  feed=current;
  assert.equal(await newerModel('nba',prior,read,now),current);
});

test('a refreshed model keeps the selected week and game in view',()=>{
  S.mweek=202610;
  const games=['one','two'].map((game_id,i)=>({game_id,season:2026,week:10,away_team:'BAL',home_team:'BUF',
    kickoff_utc:`2026-11-16T1${i}:00Z`,status:i?'scheduled':'final'}));
  setModelFeed('nfl',{generated_at:'2026-11-16T09:50Z',games},'one');
  assert.equal(S.mweek,202610);
  assert.equal(S.game.id,'one');
  assert.equal(S.games.length,2);
});

test('NBA slate refreshes merge odds and new games while retaining newer live scores',()=>{
  const cached={id:'123',a:'BOS',h:'NYK',iso:'2026-11-16T23:00Z',status:'LIVE',sa:55,sh:57,odds:{total:215}};
  const previous=[cached];
  const newer=[{...cached,status:'FUT',sa:null,sh:null,odds:{total:219}},
    {id:'456',a:'TOR',h:'DET',iso:'2026-11-17T01:00Z',status:'FUT'}];
  const slate=mergeNbaSlate(previous,newer);
  assert.equal(slate.length,2);
  assert.deepEqual(slate[0],{...cached,odds:{total:219}});
  assert.equal(mergeNbaSlate(slate,newer),slate);
  assert.equal(mergeNbaSlate(slate,{events:[]}),slate);
  assert.equal(mergeNbaSlate(previous,[{...cached,status:'FINAL',sa:110,sh:115}])[0].status,'FINAL');
});

test('parlay lines are flagged and expire even while the published snapshots stay unchanged',()=>{
  const seen=Date.parse('2026-11-16T08:00Z'), quotes=[{capturedAt:new Date(seen).toISOString()}];
  assert.equal(quoteAgeChanged(quotes,seen+89*60000,seen+91*60000),true);
  assert.equal(quoteAgeChanged(quotes,seen+119*60000,seen+121*60000),true);
  assert.equal(quoteAgeChanged(quotes,seen+121*60000,seen+122*60000),false);
});
