import {mkdir,readdir,readFile,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const cacheDir=fileURLToPath(new URL('../.live-cache/nhl-shifts/',import.meta.url));
const chartUrl='https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=';
const reportRoot='https://www.nhl.com/scores/htmlreports/';
const name=s=>s.trim().replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,code)=>{
  const number=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);
  return number<=0x10ffff?String.fromCodePoint(number):'';
});
const matchRows=/<tr\b[^>]*>\s*<td\b[^>]*>\s*(\d+)\s*<\/td>\s*<td\b[^>]*>\s*([1-4]|OT)\s*<\/td>\s*<td\b[^>]*>\s*(\d{1,2}:[0-5]\d)\s*\/[^<]*<\/td>\s*<td\b[^>]*>\s*(\d{1,2}:[0-5]\d)\s*\//gi;

export function parseShiftReport(html,game,team){
  const side=team===game.h?'Home':team===game.a?'Away':null;
  if(!side||!html.includes('<title>Time On Ice Report '+side+' Team</title>')||
    !html.includes('>Game '+String(game.id).slice(-4)+'</td>')||!/<\/html>\s*$/i.test(html))return null;
  const sections=[...html.matchAll(/<td\b[^>]*class="playerHeading[^"]*"[^>]*>\s*\d+\s+([^,<]+),\s*([^<]+)<\/td>/gi)];
  const data=[];
  let played=0;
  for(const [i,section] of sections.entries()){
    const body=html.slice(section.index+section[0].length,sections[i+1]?.index);
    const shifts=[...body.matchAll(matchRows)];
    const total=body.match(/>TOT<\/td>\s*<td\b[^>]*>\s*(\d+)\s*<\/td>/i);
    if(!total&&shifts.length||total&&shifts.length!==Number(total[1])||
      shifts.some((row,index)=>Number(row[1])!==index+1))return null;
    if(shifts.length)played++;
    for(const [, ,period,startTime,endTime] of shifts)data.push({
      teamAbbrev:team,firstName:name(section[2]),lastName:name(section[1]),period:period==='OT'?4:Number(period),startTime,endTime
    });
  }
  return played>=15&&data.length>=150?data:null;
}

// Cache only reports for completed games. A missed or incomplete game can be retried on the next refresh.
export async function shiftReader(season,{read=fetch,dir=cacheDir,signal=AbortSignal.timeout(22000)}={}){
  const fromDisk=await mkdir(dir,{recursive:true}).then(()=>true,()=>false);
  const games=new Map(), reports=new Map();
  const request=(url,method,ms)=>read(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(ms)])})
    .then(r=>r.ok?r[method]():null).catch(()=>null);
  return function load(game,team){
    const id=String(game.id),key=id+'-'+team;
    if(!/^\d{10}$/.test(id)||!['FINAL','OFF'].includes(game.status)||
      !/^[A-Z]{2,3}$/.test(team)||(team!==game.a&&team!==game.h))return Promise.resolve(null);
    if(!reports.has(key))reports.set(key,(async()=>{
      const file=join(dir,key+'.json');
      const saved=fromDisk?await readFile(file,'utf8').then(JSON.parse).catch(()=>null):null;
      if(Array.isArray(saved)&&saved.length>=150)return saved;
      const side=team===game.h?'TH':'TV';
      const html=await request(reportRoot+season+'/'+side+id.slice(4)+'.HTM','text',3500);
      let data=html?parseShiftReport(html,game,team):null;
      if(!data&&!signal.aborted){
        if(!games.has(id))games.set(id,request(chartUrl+id,'json',3500));
        const chart=await games.get(id);
        data=chart?.data?.filter?.(row=>String(row?.gameId)===id&&row.teamAbbrev===team);
      }
      if(!data||data.length<150)return null;
      if(fromDisk)await writeFile(file,JSON.stringify(data)).catch(()=>{});
      return data;
    })());
    return reports.get(key);
  };
}

export async function pruneShiftCache(schedule,day,dir=cacheDir){
  const cutoff=new Date(Date.parse(day+'T12:00:00Z')-28*86400000).toISOString().slice(0,10);
  const keep=new Set(Object.values(schedule||{}).flat().filter(g=>g.date>=cutoff).map(g=>String(g.id)));
  const files=await readdir(dir).catch(()=>[]);
  await Promise.all(files.map(file=>{
    const id=file.match(/^(\d{10})-[A-Z]{2,3}\.json$/)?.[1];
    return id&&!keep.has(id)?unlink(join(dir,file)).catch(()=>{}):null;
  }));
}
