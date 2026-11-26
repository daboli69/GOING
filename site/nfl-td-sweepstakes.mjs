import {bucket,offenseTd,rushShare,shrink,tdSettings} from './nfl-td.mjs';
import {clamp} from './parlay-core.mjs';

export const sweepstakesVersion='first-last-td-v1';
const total=values=>values.reduce((sum,value)=>sum+value,0);

// Learn timing and usage from completed games before the matchup's week.
function scoringHistory(game,schedule,events,rates){
  const sides=new Map(), phase=[{offense:0,other:0},{offense:0,other:0}];
  const get=code=>{
    if(!sides.has(code))sides.set(code,{all:0,rush:0,pass:0,usage:new Map()});
    return sides.get(code);
  };
  let games=0;
  for(const g of schedule){
    const plays=events[g.id];
    if(!plays?.length||g.id.slice(0,4)!==game.id.slice(0,4)||g.date>=game.date||g.week>=game.week||
      !Number.isFinite(g.sa)||!Number.isFinite(g.sh))continue;
    games++;
    for(const p of plays){
      const late=p[4]>=4, scored=offenseTd(p);
      if(p[8]){
        phase[Number(late)][scored?'offense':'other']++;
        if(scored){
          const team=get(p[0]);
          team.all++;
          if(late)team[p[1]==='run'?'rush':'pass']++;
        }
      }
      if(late){
        const k=bucket(p), weight=rates[k]??0;
        if(!weight)continue;
        const id=p[1]==='run'?p[12]:p[11], usage=get(p[0]).usage;
        usage.set(id,(usage.get(id)??0)+weight);
      }
    }
  }
  return {sides,phase,games};
}

export function touchdownEndpoints(early,late,earlyShare,lateShare){
  const noneEarly=Math.exp(-early), noneLate=Math.exp(-late);
  const earlyScores=1-noneEarly, lateScores=1-noneLate;
  const first=earlyScores*earlyShare+noneEarly*lateScores*lateShare;
  const last=lateScores*lateShare+noneLate*earlyScores*earlyShare;
  // When there is exactly one TD, its scorer counts as both the first and last.
  const singleEarly=early*noneEarly, singleLate=late*noneLate;
  const both=earlyScores*lateScores*earlyShare*lateShare+
    noneLate*(singleEarly*earlyShare+(earlyScores-singleEarly)*earlyShare**2)+
    noneEarly*(singleLate*lateShare+(lateScores-singleLate)*lateShare**2);
  return {first,last,both,either:first+last-both};
}

export function tdSweepstakes(board,schedule,events,rates,now=Date.now()){
  if(!board||!(now<Date.parse(board.g.iso))||board.g.sa!=null||board.g.sh!=null)return null;
  const {g}=board, teams=[g.a,g.h];
  const history=scoringHistory(g,schedule,events,rates);
  const [earlyHistory,lateHistory]=history.phase;
  if(!earlyHistory.offense||!lateHistory.offense||teams.some(team=>!board.side[team]?.rows.some(r=>r.lambda>0)))return null;
  const {opportunityWeight,flatten}=tdSettings;
  const leagueLate=lateHistory.offense/(earlyHistory.offense+lateHistory.offense);
  const leagueRush=total([...history.sides.values()].map(x=>x.rush))/lateHistory.offense;
  const field=teams.map((team,i)=>{
    const x=board.side[team], h=history.sides.get(team);
    const n=(h?.rush??0)+(h?.pass??0), share=shrink(n,h?.all??0,20,leagueLate);
    const rush=rushShare(h?.rush??0,h?.pass??0,leagueRush,x.script,board.bad);
    const prior=x.rows.map(r=>(opportunityWeight*(rush*r.rushShare+(1-rush)*r.recShare)+
      (1-opportunityWeight)*r.volShare)**flatten*r.m);
    const recent=x.rows.map(r=>h?.usage.get(r.id)??0);
    const priorSum=total(prior), recentSum=total(recent), openerSum=total(x.rows.map(r=>r.given));
    const earlyTeam=i?1-board.firstA:board.firstA;
    return {team,script:x.script,implied:x.implied,fromLines:x.fromLines,rush,early:x.teamTd*(1-share),late:x.teamTd*share,
      players:x.rows.map((r,j)=>{
        const lateBase=priorSum?prior[j]/priorSum:0;
        // Season fourth-quarter opportunities inform the active rotation, with the TD Board role as the prior.
        const lateRole=recentSum?(priorSum?shrink(recent[j],recentSum,6,lateBase):recent[j]/recentSum):lateBase;
        const earlyRole=openerSum?r.given/openerSum:lateBase;
        return {id:r.id,name:r.p.name,team,role:r.role,status:r.status,counts:r.counts,matchup:r.m,snaps:r.snaps,
          openShare:r.openShare,lateRole,missing:r.availability?.missing?.map(row=>row.name)??[],
          early:earlyTeam*earlyRole,late:x.teamTd*share*lateRole};
      })};
  });
  const earlyOffense=total(field.map(t=>t.early)), lateOffense=total(field.map(t=>t.late));
  const dst=(phase,baseline)=>clamp(shrink(phase.other,phase.offense+phase.other,20,baseline),0,.5);
  const earlyOther=dst(earlyHistory,board.dst), lateOther=dst(lateHistory,board.dst);
  const earlyRate=earlyOffense/(1-earlyOther), lateRate=lateOffense/(1-lateOther);
  const players=field.flatMap(t=>t.players).filter(row=>row.name!=='Unknown player');
  const modeled=players.map(({early,late,...row})=>({...row,...touchdownEndpoints(earlyRate,lateRate,
    early*(1-earlyOther),late/lateRate)})).filter(r=>r.either>0);
  return {version:sweepstakesVersion,games:history.games,
    spread:g.spread,total:g.total,weather:board.weather,receiveA:board.receiveA,teams:field.map(({players,...team})=>team),
    other:{first:clamp(1-total(modeled.map(r=>r.first)),0,1),last:clamp(1-total(modeled.map(r=>r.last)),0,1),
      noTd:Math.exp(-earlyRate-lateRate)},players:modeled};
}
