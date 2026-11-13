// Offline support and faster repeat visits. scripts/build.mjs fills in VERSION and CORE; under `npm start` (unbuilt
// site/) the app does not register this worker at all.
//   Pages:            network first, so a deploy shows up at once; the saved copy (or the app shell) when offline.
//   Code (?v=…):      cache first. Each build gets new URLs, so a cached file is never stale.
//   Data (data/*):    network first, saved copy when offline. Only the newest 80 files are kept.
//   Fonts and brand:  saved copy at once, refreshed in the background for the next visit.
// Other sites (ESPN, NHL and MLB images and scores) go straight to the network and the browser's own cache.
const VERSION='__VERSION__';
const CORE=__CORE__;
const CODE='going-code-'+VERSION, PAGES='going-pages', DATA='going-data', STATIC='going-static';
const DATA_LIMIT=80;
const scope=new URL(self.registration.scope);

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CODE).then(c=>c.addAll(CORE.map(p=>new URL(p,scope).href))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('going-code-')&&k!==CODE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

async function trim(name,limit){
  const c=await caches.open(name),keys=await c.keys();
  for(const k of keys.slice(0,Math.max(0,keys.length-limit)))await c.delete(k);
}
async function networkFirst(req,name,fallback){
  try{
    const res=await fetch(req);
    if(res.ok){const c=await caches.open(name);await c.delete(req);await c.put(req,res.clone());if(name===DATA)trim(DATA,DATA_LIMIT);}
    return res;
  }catch(err){
    const hit=await caches.match(req,{ignoreVary:true})||(fallback&&await caches.match(fallback));
    if(hit)return hit;
    throw err;
  }
}
async function staleWhileRevalidate(req,name,e){
  const hit=await caches.match(req);
  const update=fetch(req).then(async res=>{if(res.ok)await (await caches.open(name)).put(req,res.clone());return res;});
  if(hit){e.waitUntil(update.catch(()=>{}));return hit;}
  return update;
}
async function cacheFirst(req,name){
  const hit=await caches.match(req);
  if(hit)return hit;
  const res=await fetch(req);
  if(res.ok)(await caches.open(name)).put(req,res.clone());
  return res;
}

self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const path=url.pathname.slice(scope.pathname.length);
  if(req.mode==='navigate')e.respondWith(networkFirst(req,PAGES,new URL('./',scope).href));
  else if(url.searchParams.has('v'))e.respondWith(cacheFirst(req,CODE));
  else if(path.startsWith('data/'))e.respondWith(networkFirst(req,DATA));
  else if(/^(fonts|brand)\//.test(path))e.respondWith(staleWhileRevalidate(req,STATIC,e));
});
