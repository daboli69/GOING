import {gtaDate,gtaEnd} from '../site/gta-event.mjs';

const eastern=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
export const espnDaily={
  nfl:['football/nfl',0],cbb:['basketball/mens-college-basketball',50],
  cwb:['basketball/womens-college-basketball',50],fbs:['football/college-football',80]
};
export async function captureTotals(read){
  return Object.fromEntries(await Promise.all(Object.entries(espnDaily).map(async ([sport,[path,groups]])=>{
    const query='?limit=300&dates='+gtaDate.replaceAll('-','')+(groups?'&groups='+groups:'');
    return [sport,await read('https://site.api.espn.com/apis/site/v2/sports/'+path+'/scoreboard'+query)];
  })));
}
export function supplementalTotals(snapshot,frozen,supplement){
  if(!supplement)return snapshot;
  const rows=snapshot.rows.slice(),key=r=>[r.sport,r.game,r.market,r.provider,r.line].join('|');
  const seen=new Set(rows.map(key)),games=new Map(snapshot.games.map(g=>[g.sport+'|'+g.id,g]));
  for(const [sport,feed] of Object.entries(supplement)){
    const quoted=Date.parse(feed?.receivedAt);
    for(const game of feed?.value?.events||[]){
      const competition=game.competitions?.[0], status=competition?.status?.type??game.status?.type;
      const start=Date.parse(game.date);
      if(status?.state!=='pre'||!(quoted<start&&quoted<gtaEnd)||eastern.format(start)!==gtaDate)continue;
      const nfl=sport==='nfl'?frozen.schedule.find(g=>String(g.espn)===String(game.id)):null;
      if(sport==='nfl'&&!nfl)continue;
      const id=String(nfl?.id??game.id);
      const code=side=>competition.competitors?.find(c=>c.homeAway===side)?.team?.abbreviation;
      const matchup=code('away')+' @ '+code('home');
      const college=frozen[sport]?.games?.find(g=>String(g.id)===id);
      const modelAt=frozen[sport]?.updated;
      const f=college?.forecast;
      const projection=Date.parse(modelAt)<=quoted&&Number.isFinite(f?.homePts)&&Number.isFinite(f?.awayPts)?f.homePts+f.awayPts:null;
      for(const x of competition.odds||[]){
        const q=x.total?.under?.close, label=String(q?.line??''),odds=String(q?.odds??'');
        const line=/^u\d+(?:\.\d+)?$/i.test(label)?Number(label.slice(1)):NaN;
        if(!Number.isFinite(line)||!/^[+-]?\d+$/.test(odds)||!Number.isSafeInteger(+odds)||Math.abs(+odds)<100||!x.provider?.name)continue;
        const row={sport,kind:'Game',game:id,matchup,start:game.date,subject:matchup,market:'Game total',line,odds:+odds,
          quoteAt:feed.receivedAt,provider:x.provider.name,liquidity:null,projection,model:projection==null?null:'college-score',
          modelAt:projection==null?null:modelAt,classification:'unsupported',baselineEV:null,executable:true,quoteSource:'ESPN pregame feed'};
        if(seen.has(key(row)))continue;
        seen.add(key(row));
        rows.push(row);
        games.set(sport+'|'+id,{sport,id,start:game.date});
        const data=snapshot.coverage[sport];
        data.priced++;
        if(!data.markets.includes('Game total'))data.markets.push('Game total');
      }
    }
  }
  return {...snapshot,rows,games:[...games.values()],lastSupplementAt:Object.values(supplement).map(f=>f?.receivedAt).filter(Boolean).sort().at(-1)};
}
