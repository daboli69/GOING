import {ESPN,sportPath,scoreboard,nhlSlate,compactInjuries} from '../../site/feeds.mjs';
import {lineupUrl,lineupReport} from '../../scripts/lineups.mjs';

export const lifetimes={scores:30,slate:60,models:60,odds:120,injuries:600,lineups:600};
const retention=7*86400;
const nhl='https://api-web.nhle.com/v1';
const repo='https://api.github.com/repos/daboli69/GOING';
const jsonType='application/json; charset=utf-8';
const refreshing=new Set();
const allowedOrigin=origin=>origin==='https://goingplaybook.com'||origin==='https://daboli69.github.io'||
  /^http:\/\/localhost:[1-9]\d{0,4}$/.test(origin||'')&&Number(origin.slice(17))<=65535;
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!value.startsWith('0000-')&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export function parseRoute(path){
  if(path==='/health')return {type:'health'};
  const parts=path.split('/');
  const [,type,name,date]=parts;
  if(parts[0]!=='')return null;
  if(parts.length===3){
    if((type==='scores'||type==='injuries')&&Object.hasOwn(sportPath,name))return {type,name};
    if(type==='models'&&['nfl','nba','summary'].includes(name))return {type,name};
  }
  if(parts.length===4&&validDate(date)){
    if(type==='slate'&&['nba','nhl'].includes(name))return {type,name,date};
    if(type==='nhl'&&name==='lineups')return {type:'lineups',date};
  }
  return null;
}

const healthKeys=['scores/nfl','scores/nba','scores/nhl','slate/nba','slate/nhl','injuries/nfl',
  'injuries/nba','injuries/nhl','nhl/lineups','models/nfl','models/nba','models/summary'];
const healthKey=({type,name})=>type==='lineups'?'nhl/lineups':type+'/'+name;
const keyFor=(url,key)=>new Request(new URL('/_going-cache/v1/'+key,url));
const json=(value,headers={})=>new Response(JSON.stringify(value),{headers:{'Content-Type':jsonType,...headers}});
const error=(status,message)=>new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':jsonType,'Cache-Control':'no-store'}});
const match=(key)=>caches.default.match(key).catch(()=>undefined);
const put=(key,response)=>caches.default.put(key,response).catch(()=>{});
const timestamp=()=>new Date(Date.now()).toISOString();

async function upstream(url,headers){
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(2500),cache:'no-store',redirect:'manual'});
  if(!response.ok)throw new Error('Upstream HTTP '+response.status);
  return response;
}

async function espn(name,endpoint,field){
  const data=await (await upstream(`${ESPN}/${sportPath[name]}/${endpoint}`)).json();
  if(!Array.isArray(data?.[field]))throw new Error('Unexpected ESPN response');
  return data;
}

async function load({type,name,date},env){
  if(type==='models'){
    if(!env.GITHUB_TOKEN)throw new Error('Model secret unavailable');
    const response=await upstream(`${repo}/contents/models/${name}.json?ref=model-feeds`,{
      Accept:'application/vnd.github.raw+json',Authorization:'Bearer '+env.GITHUB_TOKEN,
      'User-Agent':'going-live'
    });
    return new Response(response.body,{headers:{'Content-Type':jsonType}});
  }
  if(type==='lineups'){
    const report=lineupReport(await (await upstream(lineupUrl)).text());
    if(!report)throw new Error('NHL lineup report unavailable');
    return json(report.lineups,{'X-Lineup-Date':report.date});
  }
  if(type==='injuries'){
    // ESPN embeds megabytes of athlete and team metadata for NFL injuries.
    if(name==='nfl'){
      const response=await upstream('https://goingplaybook.com/data/live/injuries-nfl.json');
      return new Response(response.body,{headers:{'Content-Type':jsonType}});
    }
    return json(compactInjuries(await espn(name,'injuries','injuries')));
  }
  if(type==='scores'){
    const data=await espn(name,'scoreboard','events');
    return json({games:scoreboard(data,name),...(name==='nfl'?{week:data.week?.number??null}:{})});
  }
  const board=espn(name,'scoreboard?dates='+date.replaceAll('-',''),'events');
  if(name==='nba')return json(scoreboard(await board,name));
  const [data,es]=await Promise.all([upstream(nhl+'/score/'+date).then(r=>r.json()),board]);
  if(!Array.isArray(data?.games))throw new Error('Unexpected NHL response');
  return json(nhlSlate(data,es,date));
}

async function cached(url,route,env){
  const ttl=lifetimes[route.type];
  // The lineup article has one report date, shared by all lineup requests.
  const path=route.type==='lineups'?'/nhl/lineups':url.pathname;
  const key=keyFor(url,'data'+path);
  const previous=await match(key);
  const fetched=Date.parse(previous?.headers.get('X-Data-Updated'));
  const period=ttl*1000;
  const expires=route.type==='models'?(Math.floor(fetched/period)+1)*period:fetched+period;
  const remaining=expires-Date.now();
  if(remaining>0)return {response:previous,cache:'HIT',maxAge:Math.floor(remaining/1000)};

  const failure=keyFor(url,'retry'+path);
  const recentFailure=await match(failure);
  if(!recentFailure&&!refreshing.has(key.url)){
    refreshing.add(key.url);
    try{
      const response=await load(route,env);
      response.headers.set('X-Data-Updated',timestamp());
      response.headers.set('Cache-Control','public, max-age='+retention);
      await put(key,response.clone());
      const maxAge=route.type==='models'?Math.floor((period-Date.now()%period)/1000):ttl;
      return {response,cache:'MISS',maxAge};
    }catch(error){
      console.warn('Refresh failed for '+healthKey(route),error.message);
      await put(failure,json(null,{'Cache-Control':'public, max-age='+ttl}));
    }finally{
      refreshing.delete(key.url);
    }
  }
  if(previous)return {response:previous,cache:'STALE',maxAge:0};
  return {response:error(503,'Upstream unavailable'),cache:'ERROR',maxAge:0};
}

async function health(url){
  const routes={};
  await Promise.all(healthKeys.map(async key=>{
    routes[key]=await (await match(keyFor(url,'health/'+key)))?.json()??null;
  }));
  return json({ok:true,routes},{'Cache-Control':'no-store'});
}

function cors(response,origin){
  response.headers.set('Vary','Origin');
  if(allowedOrigin(origin)){
    response.headers.set('Access-Control-Allow-Origin',origin);
    response.headers.set('Access-Control-Allow-Methods','GET');
    response.headers.set('Access-Control-Expose-Headers','X-Going-Cache, X-Data-Updated');
  }
  return response;
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url), origin=request.headers.get('Origin');
    const route=request.method==='GET'&&!url.search&&parseRoute(url.pathname);
    if(!route)return cors(error(404,'Not found'),origin);
    if(origin&&!allowedOrigin(origin))return cors(error(403,'Origin not allowed'),origin);
    if(route.type==='health')return cors(await health(url),origin);
    const {response,cache,maxAge}=await cached(url,route,env);
    const updated=response.headers.get('X-Data-Updated');
    const status={path:url.pathname,status:response.status,cache,at:timestamp(),updated};
    ctx.waitUntil(put(keyFor(url,'health/'+healthKey(route)),json(status,{'Cache-Control':'public, max-age='+retention})));
    const body=route.type==='lineups'&&response.ok&&response.headers.get('X-Lineup-Date')!==route.date?'{}':response.body;
    const headers={'Content-Type':jsonType,'X-Going-Cache':cache,
      'Cache-Control':response.ok?'public, max-age='+maxAge:'no-store'};
    if(updated)headers['X-Data-Updated']=updated;
    return cors(new Response(body,{status:response.status,headers}),origin);
  }
};
