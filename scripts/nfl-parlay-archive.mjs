// Same play indices as the NFL archive. The parlay builders don't read drive outcomes,
// scoring descriptions or non-scrimmage plays unless they scored a touchdown.
const columns=new Set([0,1,2,3,4,6,8,9,10,11,12,13,14,15,17,18,19,22,26,27,28]);
export function compactNflParlays({events,players}){
  return {players,events:Object.fromEntries(Object.entries(events).map(([game,plays])=>[game,
    plays.filter(p=>p[1]==='run'||p[1]==='pass'||p[8]).map(p=>p.map((v,i)=>columns.has(i)?v:null))]))};
}
