import {buildNbaTicket,defaults,evaluate,legKey} from './nba-parlay-engine.mjs';
import {outcome} from './track-core.mjs';

export const nbaSummaryUrl='https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=';

export function captureLegs(rows,officialRows,now){
  const knownAt=({quote})=>!quote.capturedAt||Date.parse(quote.capturedAt)<=now;
  rows=rows.filter(knownAt);officialRows=officialRows.filter(knownAt);
  const {eligible}=evaluate(officialRows,defaults,{now});
  const selected=new Set(buildNbaTicket(eligible,defaults).ticket.map(legKey));
  const offered=new Set(officialRows.map(row=>legKey({date:row.date,game:row.game.id,player:row.player.id,
    stat:row.stat,line:row.quote.line,side:'Over'})));
  return evaluate(rows,defaults,{now}).screened.filter(leg=>leg.price!=null&&Number.isFinite(leg.line)&&!leg.checks['Tip time']&&!leg.checks.Quote)
    .map(leg=>{
      const k=legKey(leg);
      const alternate=!offered.has(legKey({...leg,side:'Over'}));
      return {...leg,k:leg.provider==='DraftKings'?k+'|DraftKings':k,alternate,decision:leg.cut?'Rejected':selected.has(k)?'Selected':'Eligible',
        observedAt:new Date(now).toISOString(),odds:leg.price};
    });
}

export function observeLeg(store,leg){
  const prior=store.get(leg.k);
  if(prior&&(prior.result||prior.observedAt>=leg.observedAt))return;
  store.set(leg.k,{...leg,firstSeen:prior?.firstSeen||leg.observedAt,
    firstOdds:prior?.firstOdds??prior?.odds??leg.odds,firstDecision:prior?.firstDecision||prior?.decision||leg.decision,
    everSelected:prior?.everSelected||leg.decision==='Selected'});
}

const labels={Points:'PTS',Threes:'3PT',Rebounds:'REB',Assists:'AST'};
function finalStatus(summary,id){
  const game=summary?.header?.competitions?.[0], type=game?.status?.type;
  if(String(summary?.header?.id)!==String(id)||game?.id!=null&&String(game.id)!==String(id))return null;
  if(/^STATUS_CANCEL(?:L)?ED$/.test(type?.name||''))return 'canceled';
  return type?.completed&&/^STATUS_FINAL(?:_|$)/.test(type.name||'')?'final':null;
}
export function finalPlayers(summary,id){
  if(finalStatus(summary,id)!=='final')return null;
  const players=new Map();
  for(const team of summary.boxscore?.players||[])for(const group of team.statistics||[]){
    for(const athlete of group.athletes||[]){
      if(athlete.athlete?.id==null)continue;
      const values={};
      for(const [stat,label] of Object.entries(labels)){
        const raw=athlete.stats?.[group.labels?.indexOf(label)];
        if(typeof raw==='string'&&(stat==='Threes'?/^\d+-\d+$/:/^\d+$/).test(raw))values[stat]=Number(raw.split('-')[0]);
      }
      players.set(String(athlete.athlete.id),{values,dnp:athlete.didNotPlay===true||athlete.didNotDress===true});
    }
  }
  return players;
}

export function gradeLeg(leg,players,now){
  const player=players?.get(String(leg.player));
  if(!player)return leg;
  const value=player.values[leg.stat];
  if(!player.dnp&&!Number.isFinite(value))return leg;
  return {...leg,value:player.dnp?null:value,result:player.dnp?'void':outcome(value,leg.line,leg.side),
    graded:new Date(now).toISOString(),resultSource:player.dnp?'ESPN final · DNP':'ESPN final'};
}

export function nbaFinalBox(summary,id){
  if(finalStatus(summary,id)==='canceled')return {canceled:true};
  const players=finalPlayers(summary,id);
  return players?.size?{players}:null;
}

export function gradeNbaParlayLeg(leg,box,now){
  if(!Object.hasOwn(labels,leg.stat)||!Number.isFinite(leg.line)||!['Over','Under'].includes(leg.side))return leg;
  if(box?.canceled)
    return {...leg,value:null,result:'void',graded:new Date(now).toISOString(),resultSource:'ESPN · Canceled'};
  return gradeLeg(leg,box?.players,now);
}

export function reconcileNbaParlayLeg(leg,box,now){
  const updated=gradeNbaParlayLeg(leg,box,now);
  if(updated.result===leg.result&&updated.value===leg.value)return leg;
  return updated;
}
