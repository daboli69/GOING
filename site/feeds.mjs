// Shapes shared by the browser and scripts/live.mjs, so a live ESPN fallback and the published snapshot look identical.
export const ESPN='https://site.api.espn.com/apis/site/v2/sports';
export const sportPath={nfl:'football/nfl',nba:'basketball/nba',nhl:'hockey/nhl'};
export function scoreboard(j,s){
  const norm=t=>s==='nhl'?({TB:'TBL',LA:'LAK',SJ:'SJS',NJ:'NJD',WSH:'WSH',UTAH:'UTA',MON:'MTL'}[t]||t):t;
  return (j.events||[]).map(e=>{
    const c=e.competitions?.[0], a=c?.competitors?.find(x=>x.homeAway==='away'),h=c?.competitors?.find(x=>x.homeAway==='home');
    if(!a||!h)return null;
    const od=c.odds?.[0], status=e.status?.type;
    return {id:e.id,iso:e.date,a:norm(a.team.abbreviation),h:norm(h.team.abbreviation),status:status?.completed?'FINAL':status?.state==='in'?'LIVE':'FUT',
      sa:a.score==null?null:Number(a.score),sh:h.score==null?null:Number(h.score),venue:c.venue?.fullName,tv:c.broadcasts?.flatMap(b=>b.names||[])[0],
      odds:od?{provider:od.provider?.name,details:od.details,total:od.overUnder,spread:od.spread,am:od.moneyline?.away?.close?.odds,hm:od.moneyline?.home?.close?.odds,
      ao:od.pointSpread?.away?.close?.odds,ho:od.pointSpread?.home?.close?.odds,over:od.total?.over?.close?.odds,under:od.total?.under?.close?.odds}:null};
  }).filter(Boolean).sort((a,b)=>a.iso.localeCompare(b.iso)||a.a.localeCompare(b.a));
}
export function nhlSlate(j,espn,date){
  const odds=scoreboard(espn||{},'nhl');
  if(!j)return odds;
  return (j.games||[]).map(g=>({id:String(g.id),iso:g.startTimeUTC,date,a:g.awayTeam.abbrev,h:g.homeTeam.abbrev,sa:g.awayTeam.score,sh:g.homeTeam.score,status:g.gameState,
    venue:g.venue?.default,tv:g.tvBroadcasts?.find(x=>x.countryCode==='US')?.network,odds:odds.find(x=>x.a===g.awayTeam.abbrev&&x.h===g.homeTeam.abbrev)?.odds||null}));
}
export function compactInjuries(j){
  return Object.fromEntries((j.injuries||[]).map(t=>[t.displayName,(t.injuries||[]).map(x=>({name:x.athlete?.displayName,pos:x.athlete?.position?.abbreviation,
    status:x.status,date:x.date,detail:x.shortComment})).filter(x=>x.name)]));
}
