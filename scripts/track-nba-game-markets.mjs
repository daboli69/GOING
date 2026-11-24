import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {gradeNbaMarket,pregameNbaMarkets} from '../site/nba-game-markets.mjs';
import {teamCode} from '../site/market-watch-data.mjs';

const root=new URL('../site/data/',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8').then(JSON.parse).catch(error=>{
  if(error.code==='ENOENT')return null;
  throw error;
});
const name='tracker/nba-game-markets.json';
const [prior,feed,snapshot]=await Promise.all([read(name),read('models/nba.json'),read('market-watch/nba.json')]);
if(prior&&!Array.isArray(prior.games))throw new Error('NBA game market archive is invalid');
const now=Date.now();
const rows=new Map((prior?.games||[]).map(game=>[game.id,game]));
for(const row of pregameNbaMarkets(feed,snapshot,now)){
  const old=rows.get(row.id);
  if(!old||Date.parse(old.checked)<Date.parse(row.checked)||
    old.checked===row.checked&&Date.parse(old.forecastAt)<Date.parse(row.forecastAt))rows.set(row.id,row);
}
const byGame=new Map(Object.values(feed?.games||{}).map(row=>[String(row.gid),row]));
const season=day=>Number(day.slice(0,4))+Number(day.slice(5,7)>='10');
const years=new Set([...rows.values()].filter(row=>Date.parse(row.iso)<now).map(row=>season(row.date)));
const archives=new Map(await Promise.all([...years].map(async year=>[year,(await read('nba-'+year+'.json'))?.tg||{}])));
const scores=new Map();
for(const [year,teams] of archives)for(const [team,games] of Object.entries(teams))for(const log of games){
  if(log[3]==='home')scores.set(year+'|'+log[0],{home:team,log});
}
function finalFor(row){
  const archived=scores.get(season(row.date)+'|'+row.id);
  if(archived){
    const {home,log}=archived;
    if(log[1]===row.date&&teamCode('nba',home)===row.h&&teamCode('nba',log[2])===row.a)
      return {gid:row.id,tipoff_utc:row.iso,home,away:log[2],home_score:log[4],away_score:log[5],completed:true};
  }
  return byGame.get(row.id);
}
const games=[...rows.values()].map(row=>gradeNbaMarket(row,finalFor(row))).sort((a,b)=>a.iso.localeCompare(b.iso));
if(JSON.stringify(games)!==JSON.stringify(prior?.games||[])){
  await mkdir(new URL('tracker/',root),{recursive:true});
  const tmp=new URL(name+'.tmp',root);
  await writeFile(tmp,JSON.stringify({updated:new Date(now).toISOString(),games}));
  await rename(tmp,new URL(name,root));
}
console.log('NBA spread and total tracker: '+games.length+' matched pregame snapshots, '+games.filter(g=>g.homeScore!=null).length+' final scores.');
