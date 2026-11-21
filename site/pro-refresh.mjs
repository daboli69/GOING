import {dataURL} from './ui.mjs';
import {kickoff} from './nfl-availability.mjs';

export const readJson=(url,timeout=7000,headers)=>fetch(url,{headers,cache:'no-cache',signal:AbortSignal.timeout(timeout)})
  .then(r=>r.ok?r.json():null).catch(()=>null);
export const readSnapshot=(file,timeout)=>readJson(dataURL(file),timeout);
export const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
export const different=(a,b)=>a!==b&&JSON.stringify(a)!==JSON.stringify(b);
const crossed=(at,since,now)=>at>=since&&at<now;
export const quoteAgeChanged=(quotes,since,now)=>quotes.some(q=>{
  const seen=Date.parse(q?.capturedAt);
  return [90,120].some(minutes=>crossed(seen+minutes*60000,since,now));
});
export const nflDeadlineChanged=(quotes,games,since,now)=>quoteAgeChanged(quotes,since,now)||
  games.some(g=>crossed(Date.parse(kickoff(g.date,g.time))-90*60000,since,now));

// Share simultaneous loads, remember good archives and allow failed cold loads to be retried.
export function archiveCache({now=Date.now,ttl=15*60000}={}){
  const entries=new Map();
  return function load(key,read){
    const prior=entries.get(key);
    if(prior?.pending)return prior.pending;
    if(prior&&prior.expires>now())return Promise.resolve(prior.value);
    const pending=Promise.resolve().then(read).then(value=>{
      if(!value)throw new Error('Archive unavailable');
      entries.set(key,{value,expires:now()+ttl});
      return value;
    }).catch(error=>{
      if(prior){entries.set(key,{value:prior.value,expires:now()+60000});return prior.value;}
      entries.delete(key);
      throw error;
    });
    entries.set(key,{pending});
    return pending;
  };
}

export function modelFeed(s,feed){
  return Number.isFinite(Date.parse(feed?.generated_at))&&(s==='nfl'?Array.isArray(feed.games):object(feed.days));
}

export async function newerModel(s,prior,read=readSnapshot,now=Date.now()){
  const known=Date.parse(prior?.generated_at)||0;
  const summary=await read('models/summary.json'), announced=Date.parse(summary?.[s]?.generated_at);
  if(!(announced>known&&announced<=now+120000))return null;
  const feed=await read('models/'+s+'.json',25000), updated=Date.parse(feed?.generated_at);
  return modelFeed(s,feed)&&updated>=announced&&updated<=now+120000?feed:null;
}

export function mergeNbaSlate(previous,incoming){
  if(!Array.isArray(incoming)||!incoming.every(g=>g?.id&&g.a&&g.h&&Number.isFinite(Date.parse(g.iso))))return previous;
  const byId=new Map(previous.map(g=>[g.id,g]));
  const games=incoming.map(g=>{
    const old=byId.get(g.id), same=g.a===old?.a&&g.h===old?.h;
    // The published slate can lag the live scoreboard. Keep the newer score and take the latest odds.
    if(same&&((old.status==='FINAL'&&g.status!=='FINAL')||(old.status==='LIVE'&&['LIVE','FUT'].includes(g.status)))){
      return {...g,status:old.status,sa:old.sa,sh:old.sh};
    }
    return g;
  });
  return different(games,previous)?games:previous;
}
