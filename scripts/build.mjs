// Builds dist/ for GitHub Pages: the site folder plus one real HTML file per route, so deep links load without a server.
//   GOING_BASE=/GOING/ node scripts/build.mjs
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { routes, sections } from '../site/config.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const site=join(root,'site'), dist=join(root,'dist');
const base=(process.env.GOING_BASE||'/').replace(/\/?$/,'/');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

await rm(dist,{recursive:true,force:true});
await cp(site,dist,{recursive:true});
const shell=await readFile(join(site,'index.html'),'utf8');
const page=r=>{
  const sec=sections[r.sport];
  const title=r.id==='home'?'GOING':(sec?sec.name:'GOING')+' · '+r.title;
  return shell.replace('<base href="/">',`<base href="${esc(base)}">`).replace('data-sport="going"',`data-sport="${r.sport}"`).replace('<title>GOING</title>',`<title>${esc(title)}</title>`);
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
console.log(`Built ${written.size} pages into dist/ with base ${base}`);
