import {draftKingsMainLineURL} from '../../site/nba-main-lines.mjs';

const allowed=origin=>origin==='https://goingplaybook.com'||/^http:\/\/localhost:[1-9]\d{0,4}$/.test(origin||'');
const errors={'403':'Origin unavailable','404':'Market unavailable','502':'DraftKings feed unavailable'};
const error=(status,headers)=>new Response(JSON.stringify({error:errors[status]}),{status,headers});

export default {
  async fetch(request,env,ctx){
    const origin=request.headers.get('Origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(origin&&!allowed(origin))return error(403,headers);
    if(origin)headers['Access-Control-Allow-Origin']=origin;
    const path=new URL(request.url);
    const market=path.pathname.match(/^\/nba-main-lines\/(Points|Rebounds|Assists|Threes)$/)?.[1];
    if(request.method!=='GET'||!market)return error(404,headers);
    path.search='';
    const key=new Request(path);
    const cached=await caches.default.match(key);
    if(cached)return new Response(cached.body,{headers:{...headers,'Cache-Control':'public, max-age=30'}});
    const upstream=await fetch(draftKingsMainLineURL(market),{signal:AbortSignal.timeout(5000)}).catch(()=>null);
    if(!upstream?.ok||!upstream.headers.get('Content-Type')?.includes('json'))return error(502,headers);
    const snapshot=new Response(upstream.body,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=90'}});
    ctx.waitUntil(caches.default.put(key,snapshot.clone()).catch(()=>{}));
    return new Response(snapshot.body,{headers:{...headers,'Cache-Control':'public, max-age=30'}});
  }
};
