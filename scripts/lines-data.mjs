const base='https://api.nhle.com/stats/rest/en/shiftcharts';
const seconds=s=>{const [m,n]=String(s||'0:00').split(':').map(Number);return m*60+n;};
const norm=s=>String(s||'').normalize('NFD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
export function together(groups){
  if(!groups.length||groups.some(a=>!a.length))return [];
  let result=groups[0];
  for(const other of groups.slice(1)){
    const overlaps=[];
    for(const [a,b] of result)for(const [x,y] of other){const from=Math.max(a,x),to=Math.min(b,y);if(from<to)overlaps.push([from,to]);}
    result=overlaps;
  }
  return result;
}
export function lineStats(rows,shots,team,combos){
  const players=new Map();
  for(const r of rows){
    if(r.teamAbbrev!==team||!(r.period>0))continue;
    const shift=players.get(norm(r.firstName+' '+r.lastName))||[];
    const start=(r.period-1)*1200+seconds(r.startTime), end=(r.period-1)*1200+seconds(r.endTime);
    if(end>start)shift.push([start,end]);
    players.set(norm(r.firstName+' '+r.lastName),shift);
  }
  return combos.map(names=>{
    const spans=together(names.map(n=>players.get(norm(n))||[]));
    const sec=spans.reduce((a,[x,y])=>a+y-x,0);
    let sf=0,sa=0,gf=0,ga=0;
    for(const p of shots)if(p[5]>0&&spans.some(([a,b])=>a<=p[2]&&p[2]<b)){
      if(p[0]===team){sf++;if(p[5]===2)gf++;}else{sa++;if(p[5]===2)ga++;}
    }
    return {sec,sf,sa,gf,ga};
  });
}
export async function recentLines(lineups,hockey,shotGames,load){
  const output={};
  for(const [t,combos] of Object.entries(lineups)){
    const games=(hockey.schedule?.[t]||[]).filter(g=>g.date<hockey.date&&['OFF','FINAL'].includes(g.status)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
    const arr=combos.forwards.concat(combos.defense),values=arr.map(()=>[]);
    for(const g of games){
      const j=await load(base+'?cayenneExp=gameId='+g.id).catch(()=>null);
      if(!j?.data?.length)continue;
      lineStats(j.data,shotGames[g.id]||[],t,arr).forEach((x,i)=>{if(x.sec)values[i].push(x);});
    }
    output[t]=values;
  }
  return output;
}
