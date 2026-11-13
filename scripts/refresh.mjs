import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { lineupUrl,parseLineups } from './lineups.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const cache=join(root,'.cache'), out=join(root,'site','data');
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const year=Number(process.argv.find(x=>/^20\d\d$/.test(x))) || Number(day.slice(0,4))-(day.slice(5,7)<'09');
const hockeyYear=Number(process.argv.find(x=>/^20\d\d$/.test(x))) || Number(day.slice(0,4))-(day.slice(5,7)<'10');
const hoopsYear=Number(process.argv.find(x=>/^20\d\d$/.test(x))) || Number(day.slice(0,4))-(day.slice(5,7)<'10');
const hockey=Number(''+hockeyYear+(hockeyYear+1)), hoops=hoopsYear+1;
await Promise.all([mkdir(cache,{recursive:true}),mkdir(out,{recursive:true})]);
const exists=async p=>!!(await stat(p).catch(()=>null));
const nflBase='https://github.com/nflverse/nflverse-data/releases/download';
const nbaBase='https://github.com/sportsdataverse/sportsdataverse-data/releases/download';
const nhlBase='https://api-web.nhle.com/v1';
const nhlStats='https://api.nhle.com/stats/rest/en';
const espn='https://site.api.espn.com/apis/site/v2/sports';
let nhlNext=0, nhlPause=0;
const checked=async url=>{
  let last;
  const nhl=url.startsWith('https://api-web.nhle.com')||url.startsWith('https://api.nhle.com');
  for(let i=0;i<3;i++){
    try{
      if(nhl){const now=Date.now();const slot=Math.max(now,nhlNext,nhlPause);nhlNext=slot+430;if(slot>now)await new Promise(r=>setTimeout(r,slot-now));}
      const r=await fetch(url,{signal:AbortSignal.timeout(45_000)});if(r.ok)return r;last=new Error(`${r.status}: ${url}`);if(r.status===404)break;
      if(r.status===429&&nhl){nhlPause=Math.max(nhlPause,Date.now()+1000*(Number(r.headers.get('retry-after'))||30));}
    }catch(e){last=e;}
  }
  throw last;
};
const json=async url=>(await checked(url)).json();
async function download(name,url){
  const p=join(cache,name);
  if(process.argv.includes('--cached') && await exists(p))return;
  try{const r=await checked(url);await pipeline(Readable.fromWeb(r.body),createWriteStream(p+'.tmp'));await rename(p+'.tmp',p);}
  catch(e){console.warn(e.message);if(!await exists(p))return false;}
  return true;
}
async function save(name,data){
  const p=join(out,name+'.json');
  await writeFile(p+'.tmp',JSON.stringify(data));
  await rename(p+'.tmp',p);
}
async function pool(list,n,fn){
  let k=0;const results=[];
  await Promise.all(Array.from({length:Math.min(n,list.length)},async()=>{while(k<list.length){const i=k++;try{results[i]=await fn(list[i],i);}catch(e){console.warn(e.message);}}}));
  return results.filter(Boolean);
}
const archives=async()=>{
  const files=[
    ['nfl-schedule.csv','https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'],
    [`nfl-${year}.csv.gz`,`${nflBase}/pbp/play_by_play_${year}.csv.gz`],
    [`nfl-roster-${year}.csv`,`${nflBase}/rosters/roster_${year}.csv`],
    [`nba-box-${hoops}.csv`,`${nbaBase}/espn_nba_player_boxscores/player_box_${hoops}.csv`],
    [`nba-team-${hoops}.csv`,`${nbaBase}/espn_nba_team_boxscores/team_box_${hoops}.csv`],
    [`nba-pbp-${hoops}.csv`,`${nbaBase}/espn_nba_pbp/play_by_play_${hoops}.csv`]
  ];
  await Promise.all(files.map(x=>download(...x)));
  await new Promise((resolve,reject)=>{
    const p=spawn(process.env.PYTHON || 'python',[join(root,'scripts','normalize.py'),year,hoops],{stdio:'inherit',windowsHide:true});
    p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error('Archive normalization failed.')));
  });
  console.log('NFL and NBA archives refreshed.');
};
const seasonPath=(part)=>`${nhlStats}/${part}?limit=100&cayenneExp=${encodeURIComponent('seasonId='+hockey+' and gameTypeId=2')}`;
async function pages(part){
  const url=seasonPath(part)+'&sort='+encodeURIComponent(JSON.stringify([{property:'playerId',direction:'ASC'}]));
  const j=await json(url);
  const rest=await pool(Array.from({length:Math.max(0,Math.ceil(j.total/100)-1)},(_,i)=>(i+1)*100),5,async i=>(await json(url+'&start='+i)).data);
  return j.data.concat(...rest);
}
const keyNhl={};
const dur=s=>{const [m,sec]=String(s||'0:00').split(':').map(Number);return m*60+sec;};
function toNhlGame(g,date){
  const map=x=>{
    const t=x.abbrev;const name=[x.placeName?.default,x.commonName?.default].filter(Boolean).join(' ');
    if(name)keyNhl[t]=[name,x.darkLogo||x.logo,x.id];
    return t;
  };
  return {id:String(g.id),date:date||g.gameDate,iso:g.startTimeUTC,a:map(g.awayTeam),h:map(g.homeTeam),sa:g.awayTeam.score,sh:g.homeTeam.score,
    status:g.gameState,venue:g.venue?.default,tv:g.tvBroadcasts?.find(x=>x.countryCode==='US')?.network};
}
async function hockeyArchive(){
  const [stand,teams,skaters,goalies]=await Promise.all([json(nhlBase+'/standings/'+day),json(seasonPath('team/summary')),pages('skater/summary'),pages('goalie/summary')]);
  for(const x of stand.standings||[]) keyNhl[x.teamAbbrev.default]=[x.teamName.default,x.teamLogo];
  const teamIds=Object.keys(keyNhl);
  const seasonGames=Object.fromEntries((await pool(teamIds,8,async t=>{
    const j=await json(`${nhlBase}/club-schedule-season/${t}/${hockey}`);
    return [t,j.games.filter(g=>g.gameType===2).map(g=>toNhlGame(g))];
  })));
  const unique=[...new Map(Object.values(seasonGames).flat().filter(g=>['FINAL','OFF'].includes(g.status)).map(g=>[g.id,g])).values()].sort((a,b)=>b.date.localeCompare(a.date));
  const logs={}, events={}, opening={};
  const previous=await readFile(join(out,'nhl-'+hockey+'.json'),'utf8').then(JSON.parse).catch(()=>null);
  const previousShots=await readFile(join(out,'nhl-shots-'+hockey+'.json'),'utf8').then(JSON.parse).catch(()=>({}));
  Object.assign(opening,previous?.opening);Object.assign(events,previousShots);
  const dayList=[...new Set(unique.map(g=>g.date))];
  const logDays=await pool(dayList,4,async date=>{
    const p=join(cache,'nhl-logs-'+date+'.json');
    if(await exists(p))return JSON.parse(await readFile(p,'utf8'));
    const all=await Promise.all(['skater','goalie'].map(async k=>{
      const url=`${nhlStats}/${k}/summary?limit=100&isGame=true&isAggregate=false&cayenneExp=${encodeURIComponent('gameDate="'+date+'" and gameTypeId=2')}&sort=${encodeURIComponent('[{"property":"gameId","direction":"ASC"},{"property":"playerId","direction":"ASC"}]')}`;
      const j=await json(url);
      const rest=await pool(Array.from({length:Math.max(0,Math.ceil(j.total/100)-1)},(_,i)=>(i+1)*100),3,async i=>(await json(url+'&start='+i)).data);
      return j.data.concat(...rest);
    }));
    const records=all.flat();
    if(records.length&&date<day)await writeFile(p,JSON.stringify(records));return records;
  });
  for(const x of logDays.flat())(logs[x.playerId]??=[]).push([String(x.gameId),x.gameDate,x.teamAbbrev,x.opponentTeamAbbrev,x.homeRoad==='H'?'home':'away',
    x.timeOnIce||x.timeOnIcePerGame||0,x.goals,x.assists,x.shots||0,x.saves??null,x.shotsAgainst??null,x.gamesStarted||0,0]);
  const teamRows=Object.fromEntries((stand.standings||[]).map(s=>[s.teamAbbrev.default,teams.data.find(x=>x.teamFullName===s.teamName.default)||s]));
  const output=()=>save('nhl-'+hockey,{teams:keyNhl,teamRows,skaters,goalies,logs,opening,schedule:seasonGames,boxGames:unique.length});
  await output();
  const budget=process.argv.includes('--deep')?unique.length:12;
  const warm=(await pool(unique,10,async g=>await exists(join(cache,'nhl-'+g.id+'.json'))?g:null));
  const cold=unique.filter(g=>!warm.some(x=>x.id===g.id)).slice(0,budget);
  const games=await pool([...warm,...cold],4,async g=>{
    const p=join(cache,'nhl-'+g.id+'.json');
    try {if(await exists(p))return JSON.parse(await readFile(p,'utf8'));}catch{}
    const [box,pbp]=await Promise.all([json(`${nhlBase}/gamecenter/${g.id}/boxscore`),json(`${nhlBase}/gamecenter/${g.id}/play-by-play`)]);
    const pg={}; const shots=[]; const goals=[];
    for(const [side,t,o] of [['awayTeam',g.a,g.h],['homeTeam',g.h,g.a]]){
      const team=box.playerByGameStats?.[side]||{};
      for(const x of [...(team.forwards||[]),...(team.defense||[]),...(team.goalies||[])]){
        const gp=dur(x.toi);
        if(!gp)continue;
        pg[x.playerId]=[g.id,g.date,t,o,side==='homeTeam'?'home':'away',gp,x.goals||0,x.assists||0,x.sog||0,x.saves??null,x.shotsAgainst??null,Number(x.starter??0),dur(x.powerPlayToi)];
      }
    }
    for(const p of pbp.plays||[]){
      if(!['goal','shot-on-goal','missed-shot'].includes(p.typeDescKey)||p.periodDescriptor?.periodType==='SO')continue;
      const d=p.details||{};const t=d.eventOwnerTeamId===pbp.awayTeam.id?g.a:g.h;
      const sec=dur(p.timeInPeriod)+1200*(p.periodDescriptor.number-1);
      const isGoal=p.typeDescKey==='goal';
      const id=d.scoringPlayerId||d.shootingPlayerId||null;
      const v=[t,id,sec,d.xCoord??null,d.yCoord??null,isGoal?2:p.typeDescKey==='shot-on-goal'?1:0,d.goalieInNetId??null,d.shotType||''];
      if(isGoal)goals.push(v);
      if(v[3]!=null&&v[4]!=null)shots.push(v);
    }
    const item=[g,pg,shots,goals];await writeFile(p,JSON.stringify(item));return item;
  });
  for(const [g,pg,shots,goals] of games){
    for(const [id,p] of Object.entries(pg)){
      const arr=(logs[id]??=[]);const index=arr.findIndex(x=>x[0]===g.id);
      if(index>=0)arr[index]=p;else arr.push(p);
    }
    events[g.id]=shots;
    opening[g.id]=[g.date,g.a,g.h,goals];
  }
  for(const list of Object.values(logs))list.sort((a,b)=>a[1].localeCompare(b[1]));
  await Promise.all([output(),save('nhl-shots-'+hockey,events)]);
  console.log(`NHL archive refreshed: ${Object.keys(logs).length} player logs and ${games.length} play-by-play games.`);
}
// Daily slates, injuries, prices and lineups are captured hourly by scripts/live.mjs; this script only rebuilds the season archives.
const tasks=await Promise.allSettled([archives(),hockeyArchive()]);
for(const r of tasks)if(r.status==='rejected'){console.error(r.reason);process.exitCode=1;}
if(!process.exitCode)await save('archive',{updated:new Date().toISOString()});
