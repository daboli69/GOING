// Offline support and faster repeat visits. The build fills in VERSION and CORE. The unbuilt site does not register this worker.
// Pages and mutable data revalidate on each visit. Failed requests can use a saved copy.
// Versioned code and tracker history use the cache first. Tracker history shares the 80-file data cache.
const VERSION='__VERSION__';
const CORE=__CORE__;
const CODE='going-code-'+VERSION, PAGES='going-pages', DATA='going-data', STATIC='going-static';
const DATA_LIMIT=80;
const scope=new URL(self.registration.scope);

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CODE).then(c=>c.addAll(CORE.map(p=>new URL(p,scope).href))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  // Open tabs and saved pages can still ask for the preceding build.
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('going-code-')&&k!==CODE).slice(0,-1).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

const cached=(name,req)=>caches.open(name).then(c=>c.match(req,{ignoreVary:true})).catch(()=>undefined);

// Register the background work when handling the event. The response can stream while the cache saves it.
function respond(event,strategy){
  const writes=[];
  const defer=task=>writes.push(task.catch(()=>{}));
  const response=strategy(defer);
  event.respondWith(response);
  event.waitUntil(response.catch(()=>{}).then(()=>Promise.all(writes)));
}

async function save(name,req,response){
  const cache=await caches.open(name);
  await cache.put(req,response);
  if(name===DATA){
    const keys=await cache.keys();
    await Promise.all(keys.slice(0,Math.max(0,keys.length-DATA_LIMIT)).map(key=>cache.delete(key)));
  }
}

async function networkFirst(req,name,defer,fallback){
  const previous=async()=>await cached(name,req)||(fallback&&await cached(name,fallback));
  let response;
  try{
    // Navigation requests cannot be copied with options, so fetch those by URL.
    response=await fetch(req.mode==='navigate'?req.url:req,{cache:'no-cache',credentials:'same-origin'});
  }catch(err){
    const prior=await previous();
    if(prior)return prior;
    throw err;
  }
  if(response.ok)defer(save(name,req,response.clone()));
  if(response.status===429||response.status>=500)return await previous()||response;
  return response;
}

async function staleWhileRevalidate(req,name,defer){
  const hit=await cached(name,req);
  if(hit){
    defer(fetch(req).then(res=>res.ok?save(name,req,res):null));
    return hit;
  }
  const res=await fetch(req);
  if(res.ok)defer(save(name,req,res.clone()));
  return res;
}

async function cacheFirst(req,name,defer){
  const hit=await cached(name,req);
  if(hit)return hit;
  const res=await fetch(req);
  if(res.ok)defer(save(name,req,res.clone()));
  return res;
}

self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const path=url.pathname.slice(scope.pathname.length);
  const version=url.searchParams.get('v');
  if(req.mode==='navigate')respond(e,defer=>networkFirst(req,PAGES,defer,new URL('./',scope).href));
  else if(/^data\/tracker\/history\/[\w-]+-[a-f0-9]{16}\.json$/.test(path))respond(e,defer=>cacheFirst(req,DATA,defer));
  else if(/^[a-f0-9]{10}$/.test(version)&&/^[\w.-]+\.(mjs|css)$/.test(path)){
    if(version===VERSION)respond(e,defer=>cacheFirst(req,CODE,defer));
    else e.respondWith(caches.match(req,{cacheName:'going-code-'+version}).catch(()=>undefined).then(hit=>hit||fetch(req)));
  }
  else if(path.startsWith('data/'))respond(e,defer=>networkFirst(req,DATA,defer));
  else if(/^(fonts|brand)\//.test(path))respond(e,defer=>staleWhileRevalidate(req,STATIC,defer));
});
