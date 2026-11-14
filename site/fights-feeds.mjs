import {americanNumber} from './track-core.mjs';
import {ESPN} from './feeds.mjs';

export const ufcScoreboard=ESPN+'/mma/ufc/scoreboard';
export const ufcCore='https://sports.core.api.espn.com/v2/sports/mma';
const dateET=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const timestamp=value=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const id=value=>/^\d+$/.test(value??'')?String(value):null;
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;

function state(type){
  if(/CANCEL/i.test(type?.name||''))return 'canceled';
  if(type?.name==='STATUS_FINAL'&&type.completed)return 'final';
  if(type?.state==='in')return 'live';
  if(type?.name==='STATUS_SCHEDULED')return 'scheduled';
  return 'other';
}

export function parseFightCards(payload){
  if(!Array.isArray(payload.events))throw new Error('UFC scoreboard has no events field');
  return payload.events.flatMap(event=>{
    // ESPN's UFC league also carries Contender Series and Road to UFC cards.
    if(!/^(?:UFC\b|Noche UFC\b)/i.test(event.name||'')||/\bRoad to UFC\b/i.test(event.name))return [];
    const start=timestamp(event.date);
    if(!id(event.id)||!start)return [];
    const eventStatus=state(event.status?.type);
    const bouts=(event.competitions||[]).flatMap(c=>{
      const fighters=(c.competitors||[]).filter(f=>id(f.id)&&f.athlete?.fullName)
        .map(f=>({id:String(f.id),name:f.athlete.fullName,record:f.records?.find(r=>r.type==='total')?.summary??null}));
      if(!id(c.id)||fighters.length!==2||fighters[0].id===fighters[1].id)return [];
      const status=eventStatus==='canceled'?'canceled':state(c.status?.type);
      const winners=c.competitors.filter(f=>f.winner===true&&fighters.some(x=>x.id===String(f.id)));
      return [{id:String(c.id),start:timestamp(c.date),status,fighters,division:c.type?.abbreviation??null,
        rounds:numeric(c.format?.regulation?.periods),round:numeric(c.status?.period)||null,
        clock:/^\d{1,2}:\d{2}$/.test(c.status?.displayClock||'')?c.status.displayClock:null,
        winner:status==='final'&&winners.length===1?String(winners[0].id):null}];
    });
    const venue=event.venues?.[0]||event.competitions?.[0]?.venue;
    return [{id:String(event.id),name:event.name,date:dateET.format(new Date(start)),start,status:eventStatus,
      venue:[venue?.fullName,venue?.address?.city,venue?.address?.state||venue?.address?.country].filter(Boolean).join(' · '),bouts:bouts.reverse()}];
  });
}

export function parseFightMarket(payload,fighters){
  for(const offer of payload.items||[]){
    if(!offer.provider?.name)continue;
    const moneyline={};
    for(const entry of [offer.homeAthleteOdds,offer.awayAthleteOdds]){
      const athlete=entry?.athlete?.$ref?.match(/\/athletes\/(\d+)(?:\?|$)/)?.[1];
      if(!fighters.some(f=>f.id===athlete))continue;
      const price=americanNumber(entry.current?.moneyLine?.american??entry.moneyLine);
      if(price!=null)moneyline[athlete]=price;
    }
    // Require both prices from the same provider, correctly matched to the competitors.
    if(!fighters.every(f=>moneyline[f.id]!=null))continue;
    const rounds=numeric(offer.overUnder);
    return {provider:offer.provider.name,moneyline,total:rounds>0?{line:rounds,over:americanNumber(offer.overOdds),under:americanNumber(offer.underOdds)}:null};
  }
  return null;
}

export function parseFightResult(payload){
  const result=payload.result;
  const outcome=result?.name==='draw'?'draw':result?.name==='no-contest'?'no-contest':null;
  return {outcome,method:result?.displayName||null};
}

export function parseFighter(profile,statistics){
  const named=Object.fromEntries((statistics?.splits?.categories||[]).flatMap(c=>(c.stats||[]).map(s=>[s.name,numeric(s.value)])));
  const portrait=profile.headshot?.href;
  return {height:profile.displayHeight??null,reach:profile.displayReach??null,stance:profile.stance?.text??null,
    country:profile.citizenship??null,headshot:/^https:\/\/a\.espncdn\.com\/i\/headshots\//.test(portrait||'')?portrait:null,
    strikesPerMinute:named.strikeLPM??null,strikeAccuracy:named.strikeAccuracy??null,
    takedowns:named.takedownAvg??null,takedownAccuracy:named.takedownAccuracy??null,submissions:named.submissionAvg??null};
}
