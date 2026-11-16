import {sportPath,compactInjuries} from './feeds.mjs';

// ESPN's web host allows these requests from the published site.
const root='https://site.web.api.espn.com/apis/site/v2/sports/'+sportPath.nfl;
const minute=60000,day=1440*minute;
export const nflTeamCode=code=>({LAR:'LA',WSH:'WAS',JAC:'JAX'}[code]||code);
const instant=ms=>new Date(ms).toISOString();
const eastern=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
// Convert nflverse's Eastern wall clock to an instant with the offset in effect on game day.
export function kickoff(date,time){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{1,2}:\d{2}$/.test(time||''))return null;
  const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number),guess=Date.UTC(y,m-1,d,hh,mm);
  const parts=Object.fromEntries(eastern.formatToParts(guess).map(x=>[x.type,x.value]));
  const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour%24,+parts.minute);
  return instant(guess-(local-guess));
}
export const nflName=x=>String(x||'').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase().replace(/(jr|sr|ii|iii|iv|v)$/,'');
export const upcomingNflGames=(games,now)=>games.filter(g=>{
  if(g.sa!=null||g.sh!=null||['FINAL','OFF','LIVE','CRIT'].includes(g.status))return false;
  const start=Date.parse(kickoff(g.date,g.time));
  return start>now&&start<=now+8*day;
});

export function gameInactives(game,payload,now){
  const header=payload?.header?.competitions?.find(c=>String(c.id)===String(game.espn));
  if(!header)return null;
  const start=Date.parse(kickoff(game.date,game.time)),teams={};
  if(!Number.isFinite(start))return null;
  for(const entry of payload.injuries||[]){
    const code=nflTeamCode(entry.team?.abbreviation);
    if(code!==game.a&&code!==game.h)continue;
    const rows=(entry.injuries||[]).flatMap(i=>{
      const published=Date.parse(i.date);
      if(i.details?.fantasyStatus?.abbreviation!=='INACTIVE'||published<start-day||!(published<=now)||!i.athlete?.displayName)return [];
      return [{name:i.athlete.displayName,pos:i.athlete.position?.abbreviation,status:'Inactive',date:i.date}];
    });
    if(rows.length)teams[code]=rows;
  }
  return Object.keys(teams).length?teams:null;
}

export function nflInjuryContext(availability,injuries,game,team,opponent,teamName){
  const card=availability?.games?.[game.id]||{};
  const reportFor=code=>{
    const general=injuries[teamName(code)]||[];
    const report=new Map(general.map(x=>[nflName(x.name),x]));
    for(const row of card[code]||[])report.set(nflName(row.name),row);
    return [...report.values()];
  };
  return {report:reportFor(team),oppReport:reportFor(opponent),
    inactivesPosted:!!card[team]?.length,hasReport:Object.hasOwn(injuries,teamName(team))||!!card[team]?.length};
}

async function readJson(url){
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(7000)});
  if(!response.ok)return null;
  return response.json();
}
export async function refreshNflAvailability(games,previous,{now=Date.now(),read=readJson}={}){
  const upcoming=upcomingNflGames(games,now);
  const activeIds=new Set(upcoming.map(g=>g.id));
  const applicable=Object.fromEntries(Object.entries(previous?.games||{}).filter(([id])=>activeIds.has(id)));
  const queries=upcoming.filter(g=>/^\d+$/.test(g.espn||'')&&Date.parse(kickoff(g.date,g.time))-now<=110*minute);
  const [league,...cards]=await Promise.all([read(root+'/injuries').catch(()=>null),
    ...queries.map(g=>read(root+'/summary?event='+g.espn).catch(()=>null))]);
  for(const [i,payload] of cards.entries()){
    const card=gameInactives(queries[i],payload,now);
    if(card)applicable[queries[i].id]={...applicable[queries[i].id],...card};
  }
  const reportTime=Date.parse(league?.timestamp),prevTime=Date.parse(previous?.reportAt);
  const hasReport=Array.isArray(league?.injuries)&&league.injuries.some(t=>t.displayName&&Array.isArray(t.injuries));
  const valid=hasReport&&(!Number.isFinite(prevTime)||Number.isFinite(reportTime)&&reportTime>=prevTime);
  if(!hasReport&&!cards.some(p=>p?.header))return previous;
  return {checkedAt:instant(now),reportAt:valid&&Number.isFinite(reportTime)?instant(reportTime):previous?.reportAt??null,
    teams:valid?{...previous?.teams,...compactInjuries(league)}:previous?.teams??{},games:applicable};
}
