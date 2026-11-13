// Build static college snapshots for the existing Pages deployment. No keys required.
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {collegeSports,collegeSeason,collegeHistory,collegeForecast} from '../site/college-core.mjs';
import {collegeScoreboard,csvObjects,basketballFinals,basketballPlayers,playerFields,easternDate,footballForm} from './college-feeds.mjs';
import {ESPN} from '../site/feeds.mjs';

const cache=new URL('../.cache/college/',import.meta.url),out=new URL('../site/data/college/',import.meta.url);
await Promise.all([mkdir(cache,{recursive:true}),mkdir(out,{recursive:true})]);
const now=Date.now(),updated=new Date(now).toISOString(),today=easternDate(new Date(now));
const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const readJson=url=>readFile(url,'utf8').then(JSON.parse).catch(()=>null);
async function write(file,value){
  const tmp=new URL(file.href+'.tmp');
  await writeFile(tmp,value);
  await rename(tmp,file);
}
async function pull(name,url,maxAge,parse){
  const file=new URL(name+'.json',cache),saved=await readJson(file);
  if(saved&&now-Date.parse(saved.at)<maxAge)return saved;
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const item={at:updated,data:parse(await response.text())};
    await write(file,JSON.stringify(item));
    return item;
  }catch(e){
    console.warn(name+': '+e.message+(saved?' (using last snapshot)':''));
    return saved;
  }
}
const hour=3600000;
const scoreboard=(s,key,query,ttl)=>pull(s+'-'+key,`${ESPN}/${collegeSports[s].path}/scoreboard?groups=${collegeSports[s].group}&limit=300&${query}`,ttl,
  body=>collegeScoreboard(JSON.parse(body),s));
const archive=(key,part,parse)=>pull(key,'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/'+part,3*hour,body=>parse(csvObjects(body)));
async function footballArchive(year){
  const weeks=[];
  // Stop after the current week. The dated scoreboard supplies the immediate slate and its latest lines.
  for(let w=1;w<=20;w++){
    if(year===Number(today.slice(0,4))&&Date.parse(`${year}-08-22`)+(w-2)*7*86400000>now)break;
    weeks.push(w);
  }
  const items=await Promise.all(weeks.map(w=>scoreboard('fbs',year+'-week-'+w,`dates=${year}&seasontype=2&week=${w}`,6*hour)));
  const post=weeks.length>=15?await scoreboard('fbs',year+'-post',`dates=${year}&seasontype=3`,6*hour):null;
  return items.concat(post).flatMap(item=>item?.data.filter(g=>g.status==='final')||[]);
}
async function make(s){
  const year=collegeSeason(s,today),config=collegeSports[s];
  const days=Array.from({length:10},(_,i)=>add(today,i-4));
  const [slates,raw,form,players]=await Promise.all([
    Promise.all(days.map(d=>scoreboard(s,d,'dates='+d.replaceAll('-',''),d<add(today,-1)?6*hour:0))),
    s==='fbs'?footballArchive(year):archive(s+'-box-'+year,`${config.archive}_team_boxscores/team_box_${year}.csv`,basketballFinals),
    s==='fbs'?archive('fbs-form-'+year,`cfb_matchup_features/cfb_matchup_features_${year}.csv`,footballForm):null,
    s!=='fbs'?archive(s+'-player-rows-'+year,`${config.archive}_player_boxscores/player_box_${year}.csv`,rows=>rows
      .filter(r=>r.athlete_id&&Number(r.minutes)>0).map(r=>Object.fromEntries(playerFields.map(k=>[k,r[k]])))):null
  ]);
  const matches=new Map(),finals=new Map();
  for(const g of (s==='fbs'?raw:raw?.data)||[])if(Date.parse(g.start)<now)finals.set(g.id,g);
  for(const item of slates)for(const g of item?.data||[]){
    if(g.status==='final'&&g.aScore!=null&&g.hScore!=null&&Date.parse(g.start)<now){
      finals.set(g.id,{...finals.get(g.id),...g});
    }
    if(days.includes(g.date)){
      const old=matches.get(g.id);
      if(!old||old.marketAt<=item.at)matches.set(g.id,{...g,marketAt:item.at});
    }
  }
  const completed=[...finals.values()].filter(g=>collegeSeason(s,g.date)===year);
  const history=collegeHistory(completed),games=[...matches.values()].sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
  if(players){
    const finished=new Set(completed.map(g=>g.id));
    await write(new URL(s+'-players.json',out),JSON.stringify({season:year,checked:players.at,players:basketballPlayers(players.data,finished)}));
  }
  for(const g of games){
    if(collegeSeason(s,g.date)!==year)continue;
    if(g.status==='scheduled'&&Date.parse(g.start)>now)g.forecast=collegeForecast(g,history);
    if(form){
      const asOf=Math.min(now,Date.parse(g.start));
      g.form=[g.away,g.home].map(t=>form.data[t.id]?.find(x=>x.start<=asOf)??null);
    }
  }
  const coverage=Object.fromEntries(days.map((d,i)=>[d,slates[i]?.at??null]));
  const snapshot={sport:s,season:year,updated,coverage,games,teams:Object.values(history.teams),
    archiveAt:s==='fbs'?null:raw?.at??null,formAt:form?.at??null,
    results:[...completed,...games.filter(g=>g.status==='canceled')].map(({id,status,aScore,hScore})=>({id,status,aScore,hScore}))};
  if(!slates.some(Boolean))throw new Error('No scoreboard snapshots');
  await write(new URL(s+'.json',out),JSON.stringify(snapshot));
  return [s,{date:today,games:games.filter(g=>g.date===today).length,available:coverage[today]!=null,updated:coverage[today]}];
}
const sports=Object.keys(collegeSports),results=await Promise.allSettled(sports.map(make));
const summaryPath=new URL('summary.json',out),summary=await readJson(summaryPath)||{};
for(const [i,r] of results.entries()){
  if(r.status==='fulfilled'){const [s,x]=r.value;summary[s]=x;console.log(s+': '+x.games+' games today');}
  else{console.warn(sports[i]+': '+r.reason.message);process.exitCode=1;}
}
await write(summaryPath,JSON.stringify(summary));
