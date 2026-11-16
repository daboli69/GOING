import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {trackerFeed} from '../site/tracker-feed.mjs';

const origin='https://example.com/GOING/';
const history='data/tracker/history/picks-2026-11-0123456789abcdef.json';
const sw=(await readFile(new URL('../site/sw.js',import.meta.url),'utf8'))
  .replace('__VERSION__','1234567890').replace('__CORE__','[]');

function worker({network,write}){
  let onFetch;
  const cache=new Map();
  const key=req=>req.url||req;
  const storage={match:req=>Promise.resolve(cache.get(key(req))?.clone()),
    put:async (req,res)=>{await write?.();cache.set(key(req),res);},
    keys:async()=>[...cache.keys()],delete:async req=>cache.delete(key(req))};
  runInNewContext(sw,{URL,fetch:network,caches:{open:async()=>storage},
    self:{registration:{scope:origin},addEventListener:(type,fn)=>{if(type==='fetch')onFetch=fn;}}});
  return path=>{
    let response,background;
    onFetch({request:new Request(origin+path),respondWith:p=>{response=p;},waitUntil:p=>{background=p;}});
    return {response,background};
  };
}

test('a successful response arrives while the cache write is still pending, even if the write fails',async()=>{
  const gate=Promise.withResolvers(), started=Promise.withResolvers();
  const load=worker({network:async()=>new Response('fresh'),write:async()=>{started.resolve();await gate.promise;}});
  const request=load('data/live/manifest.json');
  await started.promise;
  try{
    const response=await request.response;
    assert.equal(await response.text(),'fresh');
  }finally{gate.reject(new Error('Storage quota exceeded'));}
  await request.background;
});

test('mutable data uses the saved copy on transport failures, throttling and 5xx, but honors 404',async()=>{
  let status=200;
  const load=worker({network:async()=>{
    if(!status)throw new Error('Offline');
    return new Response('upstream '+status,{status});
  }});
  const path='data/live/manifest.json';
  const first=load(path);
  await first.response;
  await first.background;
  for(const fallback of [503,429,0]){
    status=fallback;
    const response=await load(path).response;
    assert.equal(await response.text(),'upstream 200');
  }
  status=404;
  assert.equal((await load(path).response).status,404);
});

test('immutable tracker files skip the network on another visit, while refreshed versions fetch',async()=>{
  let fetches=0;
  const load=worker({network:async()=>new Response('snapshot '+ ++fetches)});
  const first=load(history);
  assert.equal(await (await first.response).text(),'snapshot 1');
  await first.background;
  assert.equal(await (await load(history).response).text(),'snapshot 1');
  assert.equal(await (await load(history.replace('0123456789abcdef','fedcba9876543210')).response).text(),'snapshot 2');
  assert.equal(fetches,2);
});

test('tracker feeds reuse parsed revisions and disclose incomplete files and saved snapshots',async()=>{
  const month='2026-11', another='2026-12';
  const versions={[month]:'0123456789abcdef',[another]:'abcdef0123456789'};
  const initial={months:[month],picks:1,updated:'2026-11-16T02:00Z',versions};
  let next=initial, reads=0;
  const load=()=>trackerFeed('picks','index',async path=>{
    if(path.endsWith('/index.json'))return next;
    reads++;
    if(path.endsWith(history.split('/').at(-1)))return [{k:'pick'}];
    return null;
  });
  const existing=load();
  assert.equal((await existing()).notice,'');
  assert.equal((await existing()).rows.length,1);
  assert.equal(reads,1);
  next={...initial,months:[month,another],picks:2,updated:'2026-11-16T03:00Z'};
  const fallback=await existing();
  assert.equal(fallback.index.updated,initial.updated);
  assert.match(fallback.notice,/last complete snapshot/);
  assert.match((await load()()).notice,/Loaded 1 of 2/);
  next=null;
  assert.match((await load()()).notice,/index could not load/);
});
