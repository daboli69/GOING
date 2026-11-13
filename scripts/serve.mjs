// Local preview of the static site. Serves dist/ when built, otherwise site/ with every route falling back to the shell.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const which=process.argv.includes('--dist')?'dist':'site';
const root=fileURLToPath(new URL('../'+which+'/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const port=Number(process.env.PORT||4387);
createServer(async(req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  if(p.endsWith('/'))p+='index.html';
  let file=resolve(root,'.'+p);
  if(!file.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
  const ok=await stat(file).then(s=>s.isFile()).catch(()=>false);
  if(!ok){
    if(extname(p)&&extname(p)!=='.html'){res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');return;}
    file=resolve(root,'index.html');
  }
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
  res.end(await readFile(file));
}).listen(port,'127.0.0.1',()=>console.log(`GOING (${which}): http://localhost:${port}/`));
