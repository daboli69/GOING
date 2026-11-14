// Builds dist/ for GitHub Pages: the site folder plus one real HTML file per route, so deep links load without a server.
//   GOING_BASE=/GOING/ node scripts/build.mjs
import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routes, sections } from '../site/config.mjs';
import { isCollege } from '../site/college-core.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const site=join(root,'site'), dist=join(root,'dist');
const base=(process.env.GOING_BASE||'/').replace(/\/?$/,'/');
// Absolute site address for link previews (actions/configure-pages base_url, e.g. https://goingplaybook.com).
const origin=(process.env.GOING_SITE||'').replace(/\/$/,'');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

await rm(dist,{recursive:true,force:true});
await cp(site,dist,{recursive:true});
// Version every script and stylesheet by a hash of the site code. GitHub Pages lets browsers cache files for ten
// minutes; without this a visitor right after a deploy can mix old and new modules. Every import of a module gets the
// same versioned name, so each module still loads once. Data-only deploys keep the same version (and the cache).
const code=(await readdir(site)).filter(f=>/\.(mjs|css)$/.test(f)).sort();
const hash=createHash('sha1');for(const f of code)hash.update(f).update(await readFile(join(site,f)));
const v=hash.digest('hex').slice(0,10);
for(const f of code.filter(f=>f.endsWith('.mjs'))){
  const p=join(dist,f),src=await readFile(p,'utf8');
  await writeFile(p,src.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.\/[\w.-]+\.mjs)\2/g,(_,kw,q,spec)=>`${kw}${q}${spec}?v=${v}${q}`));
}
// Static imports of each module, so every page can preload its whole module tree in one round trip. app.mjs loads each
// section's code on demand; without these hints the browser would discover it only after app.mjs runs.
const deps={};
for(const f of code.filter(f=>f.endsWith('.mjs')))deps[f]=[...(await readFile(join(site,f),'utf8')).matchAll(/\bfrom\s*['"]\.\/([\w.-]+\.mjs)['"]/g)].map(m=>m[1]);
const tree=(...roots)=>{const seen=new Set(),walk=f=>{if(seen.has(f)||!deps[f])return;seen.add(f);deps[f].forEach(walk);};roots.forEach(walk);return [...seen];};
const core=tree('app.mjs');
const sectionCode=r=>r.id==='tracker'?['tracker.mjs']:r.id==='nba-parlay-tracker'?['nba-parlay-tracker.mjs']:r.id==='nfl-parlay-tracker'?['nfl-parlay-tracker.mjs']:/-models$/.test(r.id)?['models.mjs']:
  isCollege(r.sport)?['college.mjs']:{nfl:['nfl.mjs'],nba:['nba.mjs'],nhl:['nhl.mjs'],mlb:['yard.mjs','yard-engine.mjs','yard-more.mjs'],ufc:['fights.mjs']}[r.sport]||[];
const preload=r=>tree(...core,...sectionCode(r)).filter(f=>f!=='app.mjs').map(f=>`<link rel="modulepreload" href="${f}?v=${v}">`).join('\n');
const describe=r=>{
  const sec=sections[r.sport];
  return sec?`${sec.name}: ${r.title} for ${sec.league==='CBB'||sec.league==='CWB'||sec.league==='FBS'?sec.sport.toLowerCase():sec.league} research, refreshed through the day.`:
    'GOING: models and matchup dashboards for the NBA, NFL, NHL, MLB, UFC and college basketball and football.';
};
const shell=(await readFile(join(site,'index.html'),'utf8')).replace('src="app.mjs"',`src="app.mjs?v=${v}"`).replace('href="style.css"',`href="style.css?v=${v}"`);
const page=r=>{
  const sec=sections[r.sport];
  const title=r.id==='home'?'GOING':(sec?sec.name:'GOING')+' · '+r.title;
  const url=origin?origin+base+r.path.split('#')[0]:'';
  const meta=[['og:type','website'],['og:site_name','GOING'],['og:title',title],['og:description',describe(r)],url&&['og:url',url],
    origin&&['og:image',origin+base+'brand/going-og.png'],origin&&['og:image:width','1200'],origin&&['og:image:height','630']].filter(Boolean)
    .map(([k,x])=>`<meta property="${k}" content="${esc(x)}">`).join('\n')+`\n<meta name="twitter:card" content="summary_large_image">`;
  return shell.replace('<base href="/">',`<base href="${esc(base)}">`).replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${esc(describe(r))}">`)
    .replace('</head>',meta+'\n'+preload(r)+'\n</head>').replace('data-sport="going"',`data-sport="${r.sport}"`).replace('<title>GOING</title>',`<title>${esc(title)}</title>`);
};
const written=new Set();
for(const r of routes){
  const file=r.path.split('#')[0].replace(/(^|\/)$/,'$1index.html');
  if(written.has(file))continue;
  written.add(file);
  await mkdir(dirname(join(dist,file)),{recursive:true});
  await writeFile(join(dist,file),page(r));
}
await writeFile(join(dist,'404.html'),page(routes[0]));
await writeFile(join(dist,'.nojekyll'),'');
// Offline support: stamp the worker with this build's version and the files every page needs.
const offline=['./',`app.mjs?v=${v}`,`style.css?v=${v}`,...core.filter(f=>f!=='app.mjs').map(f=>`${f}?v=${v}`),
  'fonts/sofia-sans-condensed-latin.woff2','fonts/sofia-sans-semi-condensed-latin.woff2','brand/going-wordmark.svg'];
const worker=await readFile(join(site,'sw.js'),'utf8');
await writeFile(join(dist,'sw.js'),worker.replace("'__VERSION__'",JSON.stringify(v)).replace('__CORE__',JSON.stringify(offline)));
console.log(`Built ${written.size} pages into dist/ with base ${base}, code version ${v}`);
