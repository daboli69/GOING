const repo='https://api.github.com/repos/daboli69/GOING';
const workflow='/actions/workflows/nba-main-lines.yml';
const eastern=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const active=new Set(['queued','in_progress','waiting','pending','requested']);
const staleAfter=35*60000;

export async function refreshIfStale(token,{read=fetch,now=Date.now()}={}){
  if(!token)throw new Error('Missing NBA refresh credential.');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'};
  async function request(path,options={}){
    const response=await read(repo+path,{headers,signal:AbortSignal.timeout(6500),cache:'no-store',...options});
    if(!response.ok)throw new Error('GitHub returned HTTP '+response.status+' for '+(options.method||'GET')+' '+path);
    return response;
  }

  const day=eastern.format(new Date(now));
  const history=await (await request('/commits?'+new URLSearchParams({sha:'nba-live-lines',path:'nba-main-lines-'+day+'.json',
    per_page:'1'}))).json();
  if(!Array.isArray(history))throw new Error('GitHub returned invalid NBA price history.');
  const age=now-Date.parse(history[0]?.commit?.committer?.date);
  if(age>=-2*60000&&age<staleAfter)return 'fresh';

  const runs=await (await request(workflow+'/runs?branch=main&per_page=10')).json();
  if(!Array.isArray(runs?.workflow_runs))throw new Error('GitHub returned an invalid NBA refresh run list.');
  if(runs.workflow_runs.some(run=>active.has(run.status)))return 'running';
  await request(workflow+'/dispatches',{method:'POST',body:JSON.stringify({ref:'main'})});
  return 'dispatched';
}

export default {
  async scheduled(controller,env){
    console.log('NBA price backstop '+await refreshIfStale(env.GITHUB_NBA_REFRESH_TOKEN));
  }
};
