// GOING LONG leg tracker: capture every screened NFL leg before kickoff and grade it after the game.
// Results come from the nflverse play-by-play (usually updated the morning after a game), so they follow the same
// stat definitions the engine uses. Snap counts separate "did not play" (void) from "played and got nothing".
import {evaluate,defaults,ticketRules,markets} from './nfl-parlay-engine.mjs';
import {buildTicket,legKey} from './parlay-core.mjs';
import {outcome} from './track-core.mjs';

// Stored legs keep 3 decimals: the tracker files grow every week and the page loads them all.
const compact=x=>typeof x==='number'?(Number.isInteger(x)?x:Math.round(x*1000)/1000):Array.isArray(x)?x.map(compact):
  x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='checked').map(([k,v])=>[k,compact(v)])):x;
// Every market is screened so each rule's record covers all of them; the Selected ticket uses the default filters.
export function captureLegs(rows,now){
  rows=rows.filter(({quote})=>!quote.capturedAt||Date.parse(quote.capturedAt)<=now);
  const {eligible}=evaluate(rows,defaults,{now});
  const selected=new Set(buildTicket(eligible,defaults,{rules:ticketRules(defaults)}).ticket.map(legKey));
  return evaluate(rows,{...defaults,stats:markets},{now}).screened
    .filter(leg=>leg.price!=null&&Number.isFinite(leg.line)&&!leg.checks.Kickoff&&!leg.checks.Quote)
    .map(leg=>{
      const k=legKey(leg);
      return {...compact(leg),k,alternate:false,decision:leg.cut?'Rejected':selected.has(k)?'Selected':'Eligible',
        observedAt:new Date(now).toISOString(),odds:leg.price};
    });
}

// One player's line in one game, from the play-by-play rows (see scripts/normalize.py for the columns).
export function playerGame(events,id){
  const v=Object.fromEntries(markets.map(m=>[m,0]));
  let touched=false;
  for(const p of events){
    if(p[1]==='pass'){
      if(p[11]===id){touched=true;if(p[15]){v.Receptions++;v.Receiving+=p[2];}}
      if(p[10]===id){touched=true;if(!p[28]){v['Pass Attempts']++;if(p[15]){v.Completions++;v.Passing+=p[2];}}}
    }
    if(p[1]==='run'&&p[12]===id){touched=true;v['Rush Attempts']++;v.Rushing+=p[2];}
    if(p[8]&&p[9]===id){touched=true;v['Anytime TD']++;}
  }
  const first=events.find(p=>p[8]);
  v['First TD']=first&&first[9]===id?1:0;
  return {values:v,touched};
}
const nameKey=x=>String(x||'').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase().replace(/(jr|sr|ii|iii|iv|v)$/,'');

// game: the schedule row; events: its play-by-play; snaps: that team's snap counts for the game (or undefined).
export function gradeLeg(leg,game,events,snaps,now){
  if(leg.result||!game||game.sa==null||game.sh==null||!events?.length)return leg;
  const {values,touched}=playerGame(events,leg.player);
  const played=snaps?.length?snaps.some(r=>nameKey(r[0])===nameKey(leg.name)&&r[2]>0)||touched:null;
  const stamp={graded:new Date(now).toISOString()};
  if(played===false)return {...leg,...stamp,value:null,result:'void',resultSource:'nflverse snap counts · did not play'};
  if(played==null&&!touched){
    // Without snap counts an untouched player may simply have been inactive. Wait four days, then void.
    if(now-Date.parse(leg.tip)<4*86400000)return leg;
    return {...leg,...stamp,value:null,result:'void',resultSource:'No participation data'};
  }
  const value=values[leg.stat];
  return {...leg,...stamp,value,result:outcome(value,leg.line,leg.side),resultSource:'nflverse play-by-play'};
}
