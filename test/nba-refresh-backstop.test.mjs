import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshIfStale} from '../worker/nba-refresh-backstop/index.mjs';

const now=Date.parse('2026-11-22T06:00:00Z');
const stamp=minutes=>({commit:{committer:{date:new Date(now-minutes*60000).toISOString()}}});

function github(history,runs=[]){
  const requests=[];
  return {requests,read:async (url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer test-token');
    const target=new URL(url);
    requests.push({path:target.pathname,search:target.search,method:options.method||'GET',body:options.body});
    if(target.pathname.endsWith('/commits'))return Response.json(history);
    if(target.pathname.endsWith('/runs'))return Response.json({workflow_runs:runs});
    return Response.json({workflow_run_id:42});
  }};
}

test('a fresh Eastern date snapshot avoids any workflow request',async()=>{
  const {read,requests}=github([stamp(10)]);
  assert.equal(await refreshIfStale('test-token',{read,now}),'fresh');
  assert.equal(requests.length,1);
  assert.match(requests[0].search,/path=nba-main-lines-2026-11-22\.json/);
});

test('an expired or missing snapshot dispatches just the NBA publisher at one a.m.',async()=>{
  for(const history of [[stamp(140)],[]]){
    const {read,requests}=github(history,[{status:'completed'}]);
    assert.equal(await refreshIfStale('test-token',{read,now}),'dispatched');
    assert.deepEqual(requests.at(-1),{path:'/repos/daboli69/GOING/actions/workflows/nba-main-lines.yml/dispatches',
      search:'',method:'POST',body:'{"ref":"main"}'});
    assert.equal(requests.filter(r=>r.method==='POST').length,1);
  }
});

test('a pending publisher is not duplicated and API errors stop the check',async()=>{
  const {read,requests}=github([stamp(91)],[{status:'queued'}]);
  assert.equal(await refreshIfStale('test-token',{read,now}),'running');
  assert.equal(requests.length,2);
  await assert.rejects(refreshIfStale('test-token',{read:async()=>new Response(null,{status:403}),now}),/HTTP 403/);
  await assert.rejects(refreshIfStale('',{read,now}),/Missing NBA refresh credential/);
});
