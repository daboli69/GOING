import {pathToFileURL} from 'node:url';

const production='https://goingplaybook.com';
const title='GOING refresh delivery';
const marker='GOING freshness recovery';
const minute=60000;
const threshold=35*minute, cooldown=45*minute;
const active=new Set(['queued','in_progress','waiting','pending','requested']);

export function deliveryDecision(manifest,runs,now=Date.now()){
  const stamp=Date.parse(manifest?.updated);
  const age=now-stamp;
  const valid=Number.isFinite(stamp)&&age>=-2*minute;
  if(valid&&age<threshold)return {state:'fresh',problem:null,dispatch:false};
  const problem=valid?'The public live snapshot is older than 35 minutes.':'The public live snapshot or its timestamp is unavailable.';
  if(runs.some(run=>active.has(run.status)))return {state:'active',problem,dispatch:false};
  if(runs.some(run=>run.display_title===marker&&Date.parse(run.created_at)>now-cooldown))
    return {state:'cooldown',problem,dispatch:false};
  return {state:'recover',problem,dispatch:true};
}

export async function readPublicJson(path,{origin=production,read=fetch,now=Date.now()}={}){
  const url=new URL(path,origin);
  url.searchParams.set('watch',String(now));
  for(let i=0;i<2;i++){
    try{
      const response=await read(url,{cache:'no-store',signal:AbortSignal.timeout(6000)});
      if(response.ok)return await response.json();
    }catch{}
  }
  return null;
}

export async function monitorDelivery({manifest,runs,now,dispatch,report}){
  const check=deliveryDecision(manifest,runs,now);
  if(check.dispatch){
    try{await dispatch();}
    catch(e){
      await report(check.problem+' The recovery request failed.');
      throw e;
    }
  }
  await report(check.problem);
  return check;
}

async function main(){
  const {GITHUB_REPOSITORY:repo,GH_TOKEN:token}=process.env;
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!token)throw new Error('A repository and Actions token are required.');
  const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json'};
  async function github(path,method='GET',body){
    const response=await fetch('https://api.github.com/repos/'+repo+path,
      {method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('GitHub request failed with HTTP '+response.status+' for '+method+' '+path);
    return response.status===204?null:response.json();
  }
  const now=Date.now();
  const [manifest,pages]=await Promise.all([readPublicJson('/data/live/manifest.json',{now}),
    github('/actions/workflows/deploy.yml/runs?branch=main&per_page=30')]);
  if(!Array.isArray(pages?.workflow_runs))throw new Error('GitHub did not return a deployment run list.');
  const check=await monitorDelivery({manifest,runs:pages.workflow_runs,now,
    dispatch:()=>github('/actions/workflows/deploy.yml/dispatches','POST',{ref:'main',inputs:{mode:'live',trigger:'watchdog'}}),
    async report(problem){
      // Filter the repository's own open issues by its exact alert title. Keep one open until recovery.
      const issues=await github('/issues?state=open&per_page=100');
      const old=issues.find(x=>!x.pull_request&&x.title===title);
      if(problem){
        const body=problem+'\n\nThe delivery check requests a recovery refresh when no deployment is active and no recovery was requested in the last 45 minutes.';
        if(!old)await github('/issues','POST',{title,body});
        else if(old.body!==body)await github('/issues/'+old.number,'PATCH',{body});
      }else if(old){
        await github('/issues/'+old.number,'PATCH',{state:'closed',state_reason:'completed'});
      }
    }
  });
  console.log(check.state+(check.problem?' — '+check.problem:''));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main();
