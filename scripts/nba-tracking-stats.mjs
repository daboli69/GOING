// NBA Stats optical tracking. Publish only season-to-yesterday snapshots, never use
// these descriptive aggregates to replay pregame forecasts or to estimate missing games.
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dateAdd,dateKey} from '../site/ui.mjs';
import {parseTrackingRows} from '../site/nba-tracking-stats.mjs';

const today=dateKey(), through=dateAdd(today,-1);
const year=Number(today.slice(0,4))-(today.slice(5,7)<'10');
const season=year+'-'+String(year+1).slice(-2);
const [y,m,d]=through.split('-');
const dest=new URL('../site/data/tracker/',import.meta.url), path=new URL('nba-tracking-stats.json',dest);
const previous=await readFile(path,'utf8').then(JSON.parse).catch(()=>null);
if(previous?.through===through&&previous.assists?.length&&previous.chances?.length){
  console.log('NBA player tracking already captured through '+through+'.');process.exit(0);
}

async function get(type,field){
  const url=new URL('https://stats.nba.com/stats/leaguedashptstats');
  const empty=['College','Conference','Country','DateFrom','Division','DraftPick','DraftYear','GameScope',
    'Height','Location','Outcome','PlayerExperience','PlayerPosition','SeasonSegment','StarterBench','VsConference','VsDivision','Weight'];
  url.search=new URLSearchParams({...Object.fromEntries(empty.map(k=>[k,''])),DateTo:m+'/'+d+'/'+y,
    LastNGames:'0',LeagueID:'00',Month:'0',OpponentTeamID:'0',PORound:'0',PerMode:'PerGame',
    PlayerOrTeam:'Player',PtMeasureType:type,Season:season,SeasonType:'Regular Season',TeamID:'0'});
  const result=await fetch(url,{headers:{Referer:'https://www.nba.com/',Origin:'https://www.nba.com',Accept:'application/json'},
    signal:AbortSignal.timeout(7000)});
  if(!result.ok)throw new Error('NBA Stats '+type+' returned '+result.status);
  return parseTrackingRows(await result.json(),field);
}

const [passing,rebounds]=await Promise.allSettled([get('Passing','POTENTIAL_AST'),get('Rebounding','REB_CHANCES')]);
const assists=passing.status==='fulfilled'&&passing.value.length?passing.value:previous?.through===through?previous.assists||[]:[];
const chances=rebounds.status==='fulfilled'&&rebounds.value.length?rebounds.value:previous?.through===through?previous.chances||[]:[];
if(!assists.length&&!chances.length)throw new Error('NBA player tracking is unavailable');
const tmp=new URL('nba-tracking-stats.json.tmp',dest);
await mkdir(dest,{recursive:true});
await writeFile(tmp,JSON.stringify({season,through,checked:new Date().toISOString(),assists,chances}));
await rename(tmp,path);
console.log('NBA player tracking through '+through+': '+assists.length+' passing and '+chances.length+' rebounding rows.');
