// Hourly snapshot of everything the old local server fetched on demand: slates, injuries, public prices,
// NHL projected lineups and line-matchup stats. Writes site/data/live/*.json for the static site.
import { cp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ESPN,sportPath,scoreboard,nhlSlate,compactInjuries } from '../site/feeds.mjs';
import { lineupUrl,parseLineups } from './lineups.mjs';
import { publicQuotes } from './market-data.mjs';
import { recentLines } from './lines-data.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const data=join(root,'site','data'), out=join(data,'live'), tmp=out+'.next';
const NHL='https://api-web.nhle.com/v1';
const dayKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const today=dayKey(new Date());
const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const days=[-2,-1,0,1,2,3].map(n=>add(today,n));
const marketsOnly=process.argv.includes('--markets');

async function json(url,ms=12000){
  for(let i=0;i<3;i++){
    try{const r=await fetch(url,{signal:AbortSignal.timeout(ms)});if(r.ok)return r.json();if(r.status===404)return null;}catch{}
    await new Promise(r=>setTimeout(r,800*(i+1)));
  }
  return null;
}
const read=name=>readFile(join(data,name),'utf8').then(JSON.parse).catch(()=>null);
const save=(name,value)=>writeFile(join(tmp,name),JSON.stringify(value));
const note=[];

await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});
if(marketsOnly)await cp(out,tmp,{recursive:true});

// Slates
const slates={nba:{},nhl:{}};
await Promise.all((marketsOnly?[today,add(today,1)]:days).map(async d=>{
  const espnDay=s=>json(`${ESPN}/${sportPath[s]}/scoreboard?dates=${d.replaceAll('-','')}`);
  const [nba,nhlScore,nhlEspn]=await Promise.all([espnDay('nba'),json(`${NHL}/score/${d}`),espnDay('nhl')]);
  if(nba){slates.nba[d]=scoreboard(nba,'nba');if(!marketsOnly)await save(`slate-nba-${d}.json`,slates.nba[d]);}
  if(nhlScore||nhlEspn){slates.nhl[d]=nhlSlate(nhlScore,nhlEspn,d);if(!marketsOnly)await save(`slate-nhl-${d}.json`,slates.nhl[d]);}
}));

// Injuries
if(!marketsOnly)await Promise.all(Object.keys(sportPath).map(async s=>{
  const j=await json(`${ESPN}/${sportPath[s]}/injuries`);
  if(j)await save(`injuries-${s}.json`,compactInjuries(j));else note.push('injuries '+s);
}));

// Public player prices (read-only exchange quotes) for today and tomorrow, and the NFL week ahead.
const upcoming=g=>['FUT','PRE'].includes(g.status);
for(const s of ['nba','nhl'])for(const d of [today,add(today,1)]){
  if(marketsOnly&&!slates[s][d])continue;
  const games=(slates[s][d]||[]).filter(upcoming).map(g=>({...g,date:d}));
  await save(`odds-${s}-${d}.json`,await publicQuotes(s,games).catch(()=>[]));
}
const schedule=await read('nfl-schedule.json')||[];
const nextWeek=schedule.filter(g=>g.date>=today&&g.sa==null).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
const nflGames=nextWeek?schedule.filter(g=>g.week===nextWeek.week&&g.id.slice(0,4)===nextWeek.id.slice(0,4)&&g.sa==null):[];
await save('odds-nfl.json',await publicQuotes('nfl',nflGames).catch(()=>[]));

// NHL projected lineups and how each projected line has done together over the last five games.
const html=await fetch(lineupUrl,{signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.text():'').catch(()=>'');
const lineups=html?parseLineups(html,today):{};
if(!marketsOnly)await save(`nhl-lineups-${today}.json`,lineups);
const year=Number(today.slice(0,4))-(today.slice(5,7)<'10'), season=''+year+(year+1);
const [archive,shots]=await Promise.all([read(`nhl-${season}.json`),read(`nhl-shots-${season}.json`)]);
const shiftCache=new Map();
const load=url=>{if(!shiftCache.has(url))shiftCache.set(url,json(url,20000).then(j=>{if(!j)throw new Error('No shift data');return j;}));return shiftCache.get(url);};
let lineGames=0;
if(archive&&shots)for(const g of slates.nhl[today]||[]){
  const teams=Object.fromEntries([g.a,g.h].filter(t=>lineups[t]).map(t=>[t,lineups[t]]));
  if(!Object.keys(teams).length)continue;
  const lines=await recentLines(teams,{...archive,date:today},shots,load).catch(()=>null);
  if(lines||!marketsOnly)await save(`nhl-lines-${today}-${g.a}-${g.h}.json`,lines||{});
  lineGames++;
}

// Small summary for the landing page.
const nflWeek=nextWeek?schedule.filter(g=>g.week===nextWeek.week&&g.id.slice(0,4)===nextWeek.id.slice(0,4)):[];
const firstDay=s=>[today,add(today,1)].find(d=>slates[s][d]?.length)||today;
const nbaDay=firstDay('nba'),nhlDay=firstDay('nhl');
const archiveStamp=await read('archive.json');
if(!marketsOnly)await save('manifest.json',{updated:new Date().toISOString(),archive_updated:archiveStamp?.updated||null,
  nba:{date:nbaDay,games:slates.nba[nbaDay]?.length??null},
  nhl:{date:nhlDay,games:slates.nhl[nhlDay]?.length??null,lineups:nhlDay===today?Object.keys(lineups).length:null},
  nfl:{week:nextWeek?.week??null,games:nflWeek.length||null},missing:note});

await rm(out,{recursive:true,force:true});await rename(tmp,out);
console.log(`Live snapshot: ${Object.keys(slates.nba).length} NBA days, ${Object.keys(slates.nhl).length} NHL days, ${Object.keys(lineups).length} NHL lineups, ${lineGames} line-matchup games.${note.length?' Missing: '+note.join(', '):''}`);
