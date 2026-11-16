// Keep the original shot indices used by team stats, player types and assist research.
const shotColumns=new Set([0,1,2,5,6,7,8,11]);

export function compactNbaParlays({teams,players,pg,tg,assists,dates,first},shots){
  const gameDates={...dates};
  for(const [id,game] of Object.entries(first||{}))gameDates[id] ||= game.date;
  return {teams,players,pg,tg,assists,dates:gameDates,
    shots:Object.fromEntries(Object.entries(shots).map(([id,rows])=>[id,
      rows.map(row=>row.map((value,i)=>shotColumns.has(i)?value:null))]))};
}
