import {number} from '../site/college-core.mjs';
import {americanNumber} from '../site/track-core.mjs';

export const easternDate=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const team=t=>({id:String(t.id),name:t.shortDisplayName||t.displayName,code:t.abbreviation});
const line=v=>/^pk$/i.test(v)?0:number(v);
const totalLine=v=>number(typeof v==='string'?v.replace(/^[ou]\s*/i,''):v);
function footballMarket(od){
  if(!od?.provider?.name)return null;
  const a=od.pointSpread?.away?.close,h=od.pointSpread?.home?.close;
  const over=od.total?.over?.close,under=od.total?.under?.close;
  const al=line(a?.line),hl=line(h?.line),total=number(od.overUnder);
  const price=(q)=>q&&(q.line==null||totalLine(q.line)===total)?americanNumber(q.odds):null;
  return {provider:od.provider.name,
    moneyline:{away:americanNumber(od.moneyline?.away?.close?.odds),home:americanNumber(od.moneyline?.home?.close?.odds)},
    spread:al!=null&&hl!=null&&al===-hl?{away:{line:al,odds:americanNumber(a.odds)},home:{line:hl,odds:americanNumber(h.odds)}}:null,
    total:total>0?{line:total,over:price(over),under:price(under)}:null};
}
export function collegeScoreboard(payload,sport){
  if(!Array.isArray(payload.events))throw new Error('Missing scoreboard events');
  return payload.events.flatMap(e=>{
    const c=e.competitions?.[0],t=c?.status?.type??e.status?.type;
    const a=c?.competitors?.find(x=>x.homeAway==='away'),h=c?.competitors?.find(x=>x.homeAway==='home');
    const time=Date.parse(c?.date||e.date);
    if(!e.id||!a?.team?.id||!h?.team?.id||!Number.isFinite(time)||!t)return [];
    const start=new Date(time).toISOString(),date=easternDate(new Date(time));
    const status=t.completed&&/^STATUS_FINAL/.test(t.name)?'final':/CANCEL/i.test(t.name)?'canceled':
      t.state==='in'?'live':t.name==='STATUS_SCHEDULED'&&c.timeValid!==false?'scheduled':'other';
    return [{id:String(e.id),date,start,status,neutral:c.neutralSite===true,detail:t.shortDetail||t.description,
      away:team(a.team),home:team(h.team),aScore:['final','live'].includes(status)?number(a.score):null,
      hScore:['final','live'].includes(status)?number(h.score):null,market:sport==='fbs'&&status==='scheduled'?footballMarket(c.odds?.[0]):null}];
  });
}
// RFC 4180 fields, including escaped quotes and embedded newlines.
export function csvObjects(csv){
  const rows=[];
  let row=[],field='',quoted=false;
  for(let i=0;i<csv.length;i++){
    const ch=csv[i];
    if(ch==='"'){
      if(quoted&&csv[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    }else if(!quoted&&(ch===','||ch==='\n')){
      row.push(field);field='';
      if(ch==='\n'){rows.push(row);row=[];}
    }else if(ch!=='\r'||quoted)field+=ch;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  const keys=rows.shift()||[];
  return rows.filter(r=>r.length===keys.length).map(r=>Object.fromEntries(keys.map((k,i)=>[k,r[i]])));
}
function box(r){
  const fga=number(r.field_goals_attempted),fta=number(r.free_throws_attempted);
  const orb=number(r.offensive_rebounds),turnovers=number(r.total_turnovers??r.turnovers);
  return {fga,fg3:number(r.three_point_field_goals_made),fga3:number(r.three_point_field_goals_attempted),
    paint:number(r.points_in_paint),rebounds:number(r.total_rebounds),turnovers,
    pace:[fga,fta,orb,turnovers].every(Number.isFinite)&&fga>0?fga+0.44*fta-orb+turnovers:null};
}
export function basketballFinals(rows){
  const games=new Map();
  for(const r of rows){
    if(!r.game_id||!r.team_id||!['home','away'].includes(r.team_home_away))continue;
    if(!games.has(r.game_id))games.set(r.game_id,{});
    games.get(r.game_id)[r.team_home_away]=r;
  }
  const getTeam=r=>team({id:r.team_id,shortDisplayName:r.team_short_display_name,displayName:r.team_display_name,abbreviation:r.team_abbreviation});
  return [...games].flatMap(([id,{home:h,away:a}])=>{
    if(!h||!a)return [];
    const sa=number(a.team_score),sh=number(h.team_score),start=Date.parse(h.game_date_time);
    if(sa==null||sh==null||sa===sh||!Number.isFinite(start)||(sh>sa?h:a).team_winner?.toLowerCase()!=='true')return [];
    return [{id,status:'final',start:new Date(start).toISOString(),date:easternDate(new Date(start)),
      home:getTeam(h),away:getTeam(a),aScore:sa,hScore:sh,aBox:box(a),hBox:box(h)}];
  });
}
export function footballForm(rows){
  const teams={};
  for(const r of rows){
    const start=Date.parse(r.start_date),offEpa=number(r.off_epa);
    if(!r.team_id||offEpa==null||!Number.isFinite(start))continue;
    const profile={start,id:r.team_id,offEpa,defEpa:number(r.def_epa),offSuccess:number(r.off_success_rate),defSuccess:number(r.def_success_rate),
      pass:number(r.off_pass_epa),rush:number(r.off_rush_epa),pace:number(r.off_plays_per_game)};
    (teams[r.team_id]??=[]).push(profile);
  }
  for(const rows of Object.values(teams))rows.sort((a,b)=>b.start-a.start);
  return teams;
}
const playerStats=['minutes','points','rebounds','assists','steals','blocks','three_point_field_goals_made','three_point_field_goals_attempted'];
export const playerFields=['game_id','athlete_id','athlete_display_name','athlete_position_abbreviation','team_id','team_short_display_name',
  'team_display_name','team_abbreviation','did_not_play',...playerStats];
export function basketballPlayers(rows,finished){
  const players=new Map(),seen=new Set();
  for(const r of rows){
    if(!r.athlete_id||!r.athlete_display_name||!r.team_id||!finished.has(r.game_id)||r.did_not_play==='true'||!(number(r.minutes)>0))continue;
    const key=r.team_id+'|'+r.athlete_id,appearance=key+'|'+r.game_id;
    if(seen.has(appearance))continue;
    seen.add(appearance);
    if(!players.has(key))players.set(key,{id:r.athlete_id,name:r.athlete_display_name,position:r.athlete_position_abbreviation,
      team:{id:r.team_id,name:r.team_short_display_name||r.team_display_name,code:r.team_abbreviation},n:0,sums:{}});
    const p=players.get(key);p.n++;
    for(const k of playerStats){
      const v=number(r[k]);
      if(v==null)continue;
      const tally=p.sums[k]??={sum:0,n:0};tally.sum+=v;tally.n++;
    }
  }
  return [...players.values()].map(({sums,...p})=>{
    const avg=k=>sums[k]?sums[k].sum/sums[k].n:null;
    const made=sums.three_point_field_goals_made,attempts=sums.three_point_field_goals_attempted;
    return {...p,minutes:avg('minutes'),points:avg('points'),rebounds:avg('rebounds'),assists:avg('assists'),steals:avg('steals'),blocks:avg('blocks'),
      threes:avg('three_point_field_goals_made'),threeAttempts:avg('three_point_field_goals_attempted'),
      threePct:attempts?.sum>0&&made?.n===attempts.n?made.sum/attempts.sum:null};
  });
}
