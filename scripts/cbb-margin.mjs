import {minCollegeGames} from '../site/college-core.mjs';

const homePoints=3;
const shrinkage=2;
const venue=g=>g.neutral===false?homePoints:0;

// Fit signed game margins as home strength minus away strength plus venue.
// The ridge penalty shrinks small samples toward zero rather than treating a team's schedule as average.
export function fitCbbMargins(games){
  const teams=new Map();
  const get=id=>{
    if(!teams.has(id))teams.set(id,{rating:0,games:[]});
    return teams.get(id);
  };
  for(const g of games){
    if(g.status!=='final'||!Number.isFinite(g.hScore)||!Number.isFinite(g.aScore))continue;
    const a=get(g.away.id),h=get(g.home.id);
    const margin=g.hScore-g.aScore-venue(g);
    h.games.push({opponent:a,margin});
    a.games.push({opponent:h,margin:-margin});
  }
  // Coordinate descent solves the penalized least-squares equations without a matrix dependency.
  for(let pass=0;pass<50;pass++){
    let maxChange=0;
    for(const team of teams.values()){
      const sum=team.games.reduce((total,g)=>total+g.margin+g.opponent.rating,0);
      const next=sum/(team.games.length+shrinkage);
      maxChange=Math.max(maxChange,Math.abs(next-team.rating));
      team.rating=next;
    }
    if(maxChange<1e-5)break;
  }
  return g=>{
    const a=teams.get(g.away.id),h=teams.get(g.home.id);
    if(!a||!h||Math.min(a.games.length,h.games.length)<minCollegeGames)return null;
    return h.rating-a.rating+venue(g);
  };
}
