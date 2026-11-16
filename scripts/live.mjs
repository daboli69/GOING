// Snapshot of everything the old local server fetched on demand: slates, injuries, public prices,
// NHL projected lineups and line-matchup stats. Writes site/data/live/*.json for the static site.
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ESPN,sportPath,scoreboard,nhlSlate,compactInjuries } from '../site/feeds.mjs';
import { lineupUrl,parseLineups } from './lineups.mjs';
import { publicQuotes } from './market-data.mjs';
import { recentLines } from './lines-data.mjs';
import { nflWeather } from './weather.mjs';
import { kickoff,refreshNflAvailability,upcomingNflGames } from '../site/nfl-availability.mjs';
import { fetchSleeperNfl,mergeSleeperNfl } from '../site/nfl-workload.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const data=join(root,'site','data'), out=join(data,'live'), tmp=out+'.next';
const NHL='https://api-web.nhle.com/v1';
const dayKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const today=dayKey(new Date());
const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const days=[-2,-1,0,1,2,3].map(n=>add(today,n));

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
async function backup(file,label){
  note.push(label);
  const old=await read('live/'+file);
  if(old!=null)await save(file,old);
  return old;
}
const gameKey=g=>[g.date,g.a,g.h].join('|');
async function saveOdds(s,games,file,alternateFile){
  let failed=[];
  let alternate=[];
  const quotes=await publicQuotes(s,games,{onFailure:markets=>{failed=markets;},onAlternates:rows=>{alternate=rows;}});
  if(failed.length)note.push('prices '+s+' ('+[...new Set(failed.map(x=>x.market))].sort().join(', ')+')');
  const active=new Set(games.map(gameKey)), now=Date.now();
  const write=async (name,rows,byLine=false)=>{
    if(failed.length){
      const key=q=>[gameKey(q),q.player,q.market,byLine?q.line:''].join('|');
      const current=new Set(rows.map(key)), old=await read('live/'+name);
      for(const q of Array.isArray(old)?old:[]){
        const stamp=Date.parse(q.capturedAt);
        const affected=failed.some(x=>x.market===q.market&&(!x.game||gameKey(x.game)===gameKey(q)));
        if(affected&&active.has(gameKey(q))&&!current.has(key(q))&&stamp<=now&&now-stamp<=120*60000)rows.push(q);
      }
    }
    await save(name,rows);
  };
  await write(file,quotes);
  if(alternateFile)await write(alternateFile,alternate,true);
}

await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});

// Slates
const slates={nba:{},nhl:{}};
await Promise.all(days.map(async d=>{
  const espnDay=s=>json(`${ESPN}/${sportPath[s]}/scoreboard?dates=${d.replaceAll('-','')}`);
  const [nba,nhlScore,nhlEspn]=await Promise.all([espnDay('nba'),json(`${NHL}/score/${d}`),espnDay('nhl')]);
  const nbaFile='slate-nba-'+d+'.json', nhlFile='slate-nhl-'+d+'.json';
  if(Array.isArray(nba?.events)){slates.nba[d]=scoreboard(nba,'nba');await save(nbaFile,slates.nba[d]);}
  else slates.nba[d]=await backup(nbaFile,'slate nba '+d);
  if(Array.isArray(nhlScore?.games)||Array.isArray(nhlEspn?.events)){
    slates.nhl[d]=nhlSlate(Array.isArray(nhlScore?.games)?nhlScore:null,nhlEspn,d);
    await save(nhlFile,slates.nhl[d]);
  }else slates.nhl[d]=await backup(nhlFile,'slate nhl '+d);
}));

// Injuries
let nflInjuryPayload=null;
await Promise.all(Object.keys(sportPath).map(async s=>{
  const j=await json(`${ESPN}/${sportPath[s]}/injuries`);
  if(s==='nfl')nflInjuryPayload=j;
  const file='injuries-'+s+'.json';
  if(Array.isArray(j?.injuries))await save(file,compactInjuries(j));
  else await backup(file,'injuries '+s);
}));

// Public player prices (read-only exchange quotes) for today and tomorrow, and the NFL week ahead.
const upcoming=g=>['FUT','PRE'].includes(g.status);
for(const s of ['nba','nhl'])for(const d of [today,add(today,1)]){
  const file='odds-'+s+'-'+d+'.json', alternate=s==='nba'?'nba-alternate-lines-'+d+'.json':null;
  if(!slates[s][d]){
    await backup(file,'prices '+s+' '+d);
    if(alternate)await backup(alternate,'alt prices '+s+' '+d);
    continue;
  }
  const games=slates[s][d].filter(g=>upcoming(g)&&Date.parse(g.iso)>Date.now()).map(g=>({...g,date:d}));
  await saveOdds(s,games,file,alternate);
}
const schedule=await read('nfl-schedule.json')||[];
const nflUpcoming=upcomingNflGames(schedule,Date.now()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
const nextWeek=nflUpcoming[0];
const previousAvailability=await read('live/nfl-availability.json');
const [availability,projections]=await Promise.all([
  refreshNflAvailability(schedule,previousAvailability,{read:async url=>url.endsWith('/injuries')?nflInjuryPayload:json(url,6500)}),
  nextWeek?fetchSleeperNfl(Number(nextWeek.id.slice(0,4)),nextWeek.week):null
]);
if(availability)await save('nfl-availability.json',availability);
const previousProjections=await read('live/nfl-projections.json');
const latestProjections=mergeSleeperNfl(previousProjections,projections);
if(latestProjections)await save('nfl-projections.json',latestProjections);
const nflGames=nextWeek?nflUpcoming.filter(g=>g.week===nextWeek.week&&g.id.slice(0,4)===nextWeek.id.slice(0,4))
  .map(g=>({...g,iso:kickoff(g.date,g.time)})):[];
await saveOdds('nfl',nflGames,'odds-nfl.json');

// NHL projected lineups and how each projected line has done together over the last five games.
const html=await fetch(lineupUrl,{signal:AbortSignal.timeout(15000)}).then(r=>r.ok?r.text():'').catch(()=>'');
let lineups=html?parseLineups(html,today):{};
const lineupFile='nhl-lineups-'+today+'.json';
if(!Object.keys(lineups).length&&(slates.nhl[today]||[]).some(upcoming))lineups=await backup(lineupFile,'nhl lineups '+today)||{};
else await save(lineupFile,lineups);
const year=Number(today.slice(0,4))-(today.slice(5,7)<'10'), season=''+year+(year+1);
const [archive,shots]=await Promise.all([read(`nhl-${season}.json`),read(`nhl-shots-${season}.json`)]);
const shiftCache=new Map(), shiftDeadline=AbortSignal.timeout(22000);
let shiftsMissing=false;
const load=url=>{
  if(!shiftCache.has(url))shiftCache.set(url,(async()=>{
    try{
      const r=await fetch(url,{signal:AbortSignal.any([shiftDeadline,AbortSignal.timeout(5000)])});
      if(r.ok){
        const j=await r.json();
        if(j?.data?.length)return j;
      }
    }catch{}
    shiftsMissing=true;
    return null;
  })());
  return shiftCache.get(url);
};
const lineGames=(slates.nhl[today]||[]).filter(g=>lineups[g.a]||lineups[g.h]);
if(archive&&shots){
  let i=0;
  await Promise.all(Array.from({length:Math.min(3,lineGames.length)},async()=>{
    while(i<lineGames.length){
      const g=lineGames[i++], teams=Object.fromEntries([g.a,g.h].filter(t=>lineups[t]).map(t=>[t,lineups[t]]));
      const file='nhl-lines-'+today+'-'+g.a+'-'+g.h+'.json';
      const stats=await recentLines(teams,{...archive,date:today},shots,load);
      if(shiftsMissing){
        const [previous,previousLineups]=await Promise.all([read('live/'+file),read('live/'+lineupFile)]);
        for(const [t,lineup] of Object.entries(teams)){
          if(!stats[t]?.some(rows=>rows.length)&&previous?.[t]&&
            JSON.stringify([lineup.forwards,lineup.defense])===JSON.stringify([previousLineups?.[t]?.forwards,previousLineups?.[t]?.defense]))
            stats[t]=previous[t];
        }
      }
      await save(file,stats);
    }
  }));
}
if(shiftsMissing)note.push('nhl line matchups '+today);

// Small summary for the landing page.
const nflWeek=nextWeek?schedule.filter(g=>g.week===nextWeek.week&&g.id.slice(0,4)===nextWeek.id.slice(0,4)):[];
const firstDay=s=>[today,add(today,1)].find(d=>slates[s][d]?.length)||today;
const nbaDay=firstDay('nba'),nhlDay=firstDay('nhl');
const archiveStamp=await read('archive.json');
// NFL kickoff weather for this week's games (Open-Meteo, no key): temperature, wind, gusts and rain at the stadium.
const weather=await nflWeather(nflGames).catch(e=>{console.warn(e.message);return {};});
const needsWeather=nflGames.filter(g=>!weather[g.id]);
if(needsWeather.length){
  note.push('weather nfl ('+needsWeather.length+' forecasts unavailable)');
  const old=await read('live/weather-nfl.json'), now=Date.now();
  for(const g of needsWeather){
    const stamp=Date.parse(old?.[g.id]?.checked);
    if(stamp<=now&&now-stamp<=6*3600000)weather[g.id]=old[g.id];
  }
}
await save('weather-nfl.json',weather);
await save('manifest.json',{updated:new Date().toISOString(),archive_updated:archiveStamp?.updated||null,
  nba:{date:nbaDay,games:slates.nba[nbaDay]?.length??null},
  nhl:{date:nhlDay,games:slates.nhl[nhlDay]?.length??null,lineups:nhlDay===today?Object.keys(lineups).length:null},
  nfl:{week:nextWeek?.week??null,games:nflWeek.length||null},missing:note});

await rm(out,{recursive:true,force:true});await rename(tmp,out);
console.log(`Live snapshot: ${Object.keys(slates.nba).length} NBA days, ${Object.keys(slates.nhl).length} NHL days, ${Object.keys(lineups).length} NHL lineups, ${archive&&shots?lineGames.length:0} line-matchup games.${note.length?' Missing: '+note.join(', '):''}`);
