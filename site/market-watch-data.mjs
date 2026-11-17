import {nflTeamCode} from './nfl-availability.mjs';

const nbaCodes={GS:'GSW',NOP:'NO',NY:'NYK',SA:'SAS',UTA:'UTAH',WAS:'WSH',PHO:'PHX'};
export function teamCode(sport,value){
  const code=String(value??'').toUpperCase();
  return sport==='nfl'?nflTeamCode(code):nbaCodes[code]||code;
}

export function marketSnapshot(data){
  return Number.isFinite(Date.parse(data?.checked))&&/^\d{4}-\d{2}-\d{2}$/.test(data.through)&&
    Array.isArray(data.games)&&data.games.every(g=>g?.id&&g.a&&g.h&&Number.isFinite(Date.parse(g.iso))&&
      Array.isArray(g.books)&&Array.isArray(g.exchanges));
}

export const marketStale=(checked,now=Date.now())=>{
  const age=now-Date.parse(checked);
  return !(age>=-120000&&age<=45*60000);
};
export const upcomingMarkets=(games,now=Date.now())=>games.filter(g=>Date.parse(g.iso)>now);

export function marketForecast(sport,feed,game){
  const generated=Date.parse(feed?.generated_at), start=Date.parse(game.iso);
  if(!(generated<start))return null;
  const matches=(a,h)=>teamCode(sport,a)===game.a&&teamCode(sport,h)===game.h;
  if(sport==='nba'){
    const row=feed.games?.[game.id];
    const p=row?.headline?.p_home;
    return row?.has_forecast&&matches(row.away,row.home)&&p>=0&&p<=1&&Number.isFinite(p)?p:null;
  }
  // The NFL lab uses nflverse IDs, while market watch uses ESPN IDs. Check both teams and kickoff.
  if(!Array.isArray(feed.games))return null;
  const candidates=feed.games.filter(g=>matches(g.away_team,g.home_team)&&
    Math.abs(Date.parse(g.kickoff_utc)-start)<=90*60000);
  const p=candidates.length===1?candidates[0].forecast?.champion?.p_home:null;
  return Number.isFinite(p)&&p>=0&&p<=1?p:null;
}
