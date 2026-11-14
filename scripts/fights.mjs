// Fetch public ESPN UFC cards, stat profiles, and quotes for the static site.
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {parseFightCards,parseFightMarket,parseFightResult,parseFighter,ufcScoreboard,ufcCore} from '../site/fights-feeds.mjs';
import {fightHistory,fightForecast} from '../site/fights-core.mjs';

const cache=new URL('../.cache/fights/',import.meta.url),out=new URL('../site/data/fights/',import.meta.url);
await Promise.all([mkdir(cache,{recursive:true}),mkdir(out,{recursive:true})]);
const hour=3600000,day=24*hour,now=Date.now(),year=new Date(now).getUTCFullYear();
const historyStart=2020;

async function save(file,data){
  const tmp=new URL(file.href+'.tmp');
  await writeFile(tmp,JSON.stringify(data));
  await rename(tmp,file);
}

async function download(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
}

async function cached(name,maxAge,read,stale=true){
  const path=new URL(name+'.json',cache);
  const stored=await readFile(path,'utf8').then(JSON.parse).catch(()=>null);
  if(stored&&now-Date.parse(stored.at)<maxAge)return stored;
  try{
    const data=await read(),at=new Date().toISOString();
    const item={at,data};
    await save(path,item);
    return item;
  }catch(e){
    console.warn(name+': '+e.message+(stale&&stored?' (using cached data)':''));
    return stale?stored:null;
  }
}

async function mapLimit(rows,limit,fn){
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(limit,rows.length)},async()=>{
    while(cursor<rows.length)await fn(rows[cursor++]);
  }));
}

const years=Array.from({length:year-historyStart+1},(_,i)=>historyStart+i);
if(new Date(now).getUTCMonth()===11)years.push(year+1);
const seasons=await Promise.all(years.map(async y=>[y,await cached('season-'+y,y<year?7*day:0,async()=>{
  const data=parseFightCards(await download(ufcScoreboard+'?dates='+y+'&limit=150'));
  if(y<=year&&!data.length)throw new Error('No UFC cards in the season feed');
  return data;
})]));
const current=seasons.find(([y])=>y===year)?.[1];
if(!current)throw new Error('No current UFC feed or cached schedule');

const byId=new Map();
for(const [,source] of seasons)for(const card of source?.data||[]){
  if(!byId.has(card.id)||byId.get(card.id).checked<source.at)byId.set(card.id,{...card,checked:source.at});
}
const all=[...byId.values()].sort((a,b)=>b.start.localeCompare(a.start));
const recent=all.filter(c=>c.status==='final').slice(0,8);
const active=all.filter(c=>c.status==='live'||c.status==='scheduled'&&Date.parse(c.start)>now-day).reverse();
const visible=[...active,...recent];
const isRecent=new Set(recent.map(c=>c.id));
const boutURL=(c,b)=>ufcCore+'/leagues/ufc/events/'+c.id+'/competitions/'+b.id;

const jobs=[];
for(const card of all)for(const bout of card.bouts){
  // A short retry interval for result details lets the tracker distinguish a draw from a no contest even if the result lags.
  if(bout.status==='final'&&(isRecent.has(card.id)||Date.parse(card.start)>now-45*day||!bout.winner)){
    jobs.push(async()=>{
      const entry=await cached('result-'+bout.id,Date.parse(card.start)>now-2*day?hour:14*day,async()=>{
        const result=parseFightResult(await download(boutURL(card,bout)+'/status'));
        if(!result.method)throw new Error('Result details pending');
        return result;
      });
      if(entry)Object.assign(bout,entry.data);
    });
  }
  if(active.includes(card)&&card.status==='scheduled'&&Date.parse(card.start)>now&&Date.parse(card.start)<now+35*day&&bout.status==='scheduled'){
    jobs.push(async()=>{
      const [entry,details]=await Promise.all([
        cached('odds-'+bout.id,0,async()=>parseFightMarket(await download(boutURL(card,bout)+'/odds'),bout.fighters),false),
        cached('segment-'+bout.id,day,async()=>{
          const fight=await download(boutURL(card,bout));
          return fight.cardSegment?.description??null;
        })
      ]);
      if(details?.data)bout.segment=details.data;
      if(entry?.data&&Date.parse(entry.at)<Date.parse(card.start))bout.market={...entry.data,checked:entry.at};
    });
  }
}

const profiles={}, ids=new Set(visible.flatMap(c=>c.bouts.flatMap(b=>b.fighters.map(f=>f.id))));
for(const id of ids){
  jobs.push(async()=>{
    const athlete=ufcCore+'/athletes/'+id;
    const [profile,stats]=await Promise.all([
      cached('bio-'+id,14*day,()=>download(athlete)),
      cached('stats-'+id,day,()=>download(athlete+'/statistics'))
    ]);
    if(profile||stats)profiles[id]=parseFighter(profile?.data||{},stats?.data);
  });
}
await mapLimit(jobs,8,job=>job());

const completed=all.filter(c=>Date.parse(c.start)<now&&c.bouts.some(b=>b.status==='final'));
const history=fightHistory(completed);
for(const card of active){
  if(card.status!=='scheduled'||Date.parse(card.start)<=now)continue;
  for(const bout of card.bouts)if(bout.status==='scheduled')bout.forecast=fightForecast(bout,history);
}
const fighters=Object.fromEntries([...ids].map(id=>[id,{...history.get(id),...profiles[id]}]));
const results=all.flatMap(c=>c.bouts.filter(b=>b.status==='final'||b.status==='canceled').map(b=>({
  id:b.id,status:b.status,winner:b.winner,outcome:b.outcome??null,method:b.method??null,round:b.round,clock:b.clock,fighters:b.fighters
})));
const updated=current.at;
await save(new URL('board.json',out),{updated,historyStart,archiveYears:seasons.filter(([,data])=>data).map(([y])=>y),cards:visible,fighters});
await save(new URL('results.json',out),results);
const featured=active.find(c=>c.status==='live')||active.find(c=>Date.parse(c.start)>now)||recent[0];
await save(new URL('summary.json',out),{updated,event:featured?.name??null,date:featured?.date??null,bouts:featured?.bouts.length??null,status:featured?.status??null});
console.log('UFC:',active.length,'active and upcoming cards,',recent.length,'recent cards,',results.length,'results,',ids.size,'fighter profiles.');
