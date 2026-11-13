import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{lifetimes,parseRoute} from '../worker/src/index.js';

test('Worker accepts only supported routes with real calendar dates',()=>{
  assert.deepEqual(parseRoute('/health'),{type:'health'});
  for(const sport of ['nba','nhl']){
    assert.deepEqual(parseRoute('/slate/'+sport+'/2028-02-29'),{type:'slate',name:sport,date:'2028-02-29'});
  }
  for(const name of ['nfl','nba','nhl'])for(const type of ['scores','injuries']){
    assert.deepEqual(parseRoute('/'+type+'/'+name),{type,name});
  }
  for(const name of ['nfl','nba','summary']){
    assert.deepEqual(parseRoute('/models/'+name),{type:'models',name});
  }
  assert.deepEqual(parseRoute('/nhl/lineups/2026-11-12'),{type:'lineups',date:'2026-11-12'});
  for(const path of ['','/','health','/health/','/scores/NFL','/scores/%6efl','/scores/constructor',
    '/scores/mlb','/models/nhl','/injuries/nfl/extra','/odds/nfl/2026-11-12','/slate/nfl/2026-11-12',
    '/slate/nba/2026-02-29','/slate/nhl/2026-04-31','/slate/nhl/2026-00-01','/slate/nba/0000-01-01',
    '/slate/nhl/2026-1-01','/nhl/lineups/2026-11-12/','/nhl/lineups/yesterday']){
    assert.equal(parseRoute(path),null,path);
  }
});

test('Worker keeps the requested cache lifetimes',()=>{
  assert.deepEqual(lifetimes,{scores:30,slate:60,models:60,odds:120,injuries:600,lineups:600});
});

test('Worker reuses fresh scores, reports stale data and throttles retries',async t=>{
  const cache=new Map();
  let now=Date.parse('2026-11-12T00:00:00Z');
  t.mock.method(Date,'now',()=>now);
  Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{
    match:async key=>cache.get(key.url)?.clone(),
    put:async (key,value)=>cache.set(key.url,value)
  }}});
  t.after(()=>delete globalThis.caches);
  const source=t.mock.method(globalThis,'fetch',async ()=>Response.json({events:[]}));
  const pending=[];
  const call=async (path,init,env={})=>{
    const result=await worker.fetch(new Request('https://worker.example'+path,init),env,{
      waitUntil:promise=>pending.push(promise)
    });
    await Promise.all(pending.splice(0));
    return result;
  };
  const first=await call('/scores/nba',{headers:{Origin:'http://localhost:4387'}});
  assert.equal(first.headers.get('X-Going-Cache'),'MISS');
  assert.equal(first.headers.get('Access-Control-Allow-Origin'),'http://localhost:4387');
  assert.equal(first.headers.get('Cache-Control'),'public, max-age=30');
  assert.equal((await call('/scores/nba')).headers.get('X-Going-Cache'),'HIT');
  const production=await call('/scores/nba',{headers:{Origin:'https://goingplaybook.com'}});
  assert.equal(production.headers.get('Access-Control-Allow-Origin'),'https://goingplaybook.com');
  assert.equal(source.mock.callCount(),1);
  assert.equal((await call('/scores/nba',{headers:{Origin:'https://other.example'}})).status,403);
  assert.equal((await call('/scores/nba',{method:'POST'})).status,404);
  assert.equal((await call('/scores/nba?x=1')).status,404);

  now+=31000;
  source.mock.mockImplementation(async ()=>new Response(null,{status:502}));
  const stale=await call('/scores/nba');
  assert.equal(stale.headers.get('X-Going-Cache'),'STALE');
  assert.equal(stale.headers.get('Cache-Control'),'public, max-age=0');
  assert.deepEqual(await stale.json(),{games:[]});
  await call('/scores/nba');
  assert.equal(source.mock.callCount(),2);
  const status=(await (await call('/health')).json()).routes['scores/nba'];
  assert.equal(status.cache,'STALE');
  assert.equal(status.status,200);
  assert.ok(status.at&&status.updated);

  source.mock.mockImplementation(async ()=>Response.json({nfl:{}}));
  const env={GITHUB_TOKEN:'test'};
  assert.equal((await call('/models/summary',undefined,env)).headers.get('Cache-Control'),'public, max-age=29');
  now+=28000;
  assert.equal((await call('/models/summary',undefined,env)).headers.get('X-Going-Cache'),'HIT');
  now+=1000;
  assert.equal((await call('/models/summary',undefined,env)).headers.get('X-Going-Cache'),'MISS');
  const {arguments:[url,options]}=source.mock.calls.at(-1);
  assert.match(url,/\/contents\/models\/summary\.json\?ref=model-feeds$/);
  assert.equal(options.headers.Authorization,'Bearer test');
  assert.equal(options.headers.Accept,'application/vnd.github.raw+json');
});
