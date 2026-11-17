// Settle the exact saved line from the ESPN game, including lines absent from the public tracker.
import {dateKey,keep,local} from './ui.mjs';
import {legKey} from './parlay-core.mjs';
import {nbaFinalBox,gradeNbaParlayLeg,nbaSummaryUrl} from './nba-parlay-tracking.mjs';
import {readJson} from './pro-refresh.mjs';

export const nbaTicketsKey='nba-parlay-tickets';
const labels={won:'Hit',lost:'Miss',push:'Push',void:'Void'};
const MINUTE=60000;
const savedLegs=ticket=>Array.isArray(ticket?.legs)?ticket.legs:[];
const validGrade=grade=>Object.hasOwn(labels,grade?.result)&&typeof grade.resultSource==='string';
const validLeg=leg=>/^\d+$/.test(leg?.game)&&/^\d+$/.test(leg.player)&&Number.isFinite(leg.line)&&['Over','Under'].includes(leg.side);

export function createNbaTicketResults({read,write,fetchSummary}){
  const nextCheck=new Map(), memory=new Map();
  let checking;
  const grade=leg=>memory.get(legKey(leg))||leg.nbaGrade;
  const resolve=leg=>{
    const official=grade(leg);
    return validGrade(official)?{...leg,result:labels[official.result],value:official.value,resultSource:official.resultSource}:
      {...leg,result:'Pending',value:null,resultSource:null};
  };

  async function check(now){
    const day=dateKey(new Date(now)), games=new Map();
    for(const ticket of read())for(const leg of savedLegs(ticket)){
      if(!validLeg(leg)||validGrade(grade(leg)))continue;
      const tip=Date.parse(leg.tip), id=String(leg.game), next=nextCheck.get(id)||0;
      // Check current games after the scheduled tip. Very old tickets may only have a slate date.
      const due=Number.isFinite(tip)?tip<=now:/^\d{4}-\d{2}-\d{2}$/.test(leg.date||ticket.date)&&(leg.date||ticket.date)<day;
      if(due&&next<=now)games.set(id,next);
    }
    const batch=[...games].sort((a,b)=>a[1]-b[1]).slice(0,8);
    if(!batch.length)return false;
    const finals=new Map();
    await Promise.all(batch.map(async ([id])=>{
      nextCheck.set(id,now+5*MINUTE);
      try{
        const box=nbaFinalBox(await fetchSummary(id),id);
        if(box)finals.set(id,box);
      }catch{}
    }));
    if(!finals.size)return false;
    // Read again after the network call so tickets saved or imported in the meantime are kept.
    let changed=false;
    const tickets=read().map(ticket=>{
      let updated=false;
      const legs=savedLegs(ticket).map(leg=>{
        if(!validLeg(leg)||validGrade(leg.nbaGrade))return leg;
        const result=gradeNbaParlayLeg(leg,finals.get(String(leg.game)),now);
        if(result===leg)return leg;
        const {result:record,value,graded,resultSource}=result, nbaGrade={result:record,value,graded,resultSource};
        const key=legKey(leg);
        if(!memory.has(key))changed=true;
        memory.set(key,nbaGrade);
        updated=true;
        return {...leg,nbaGrade};
      });
      return updated?{...ticket,legs}:ticket;
    });
    if(changed)try{write(tickets);}catch{/* Results can still be shown in this tab. */}
    return changed;
  }
  function refresh(now=Date.now()){
    checking??=check(now).finally(()=>{checking=null;});
    return checking;
  }
  return {resolve,refresh};
}

const results=createNbaTicketResults({
  read:()=>{const tickets=local(nbaTicketsKey,[]);return Array.isArray(tickets)?tickets:[];},
  write:tickets=>keep(nbaTicketsKey,tickets),
  fetchSummary:id=>readJson(nbaSummaryUrl+id,6500)
});
export const resolveNbaTicketLeg=results.resolve;
export const refreshNbaTicketResults=results.refresh;
