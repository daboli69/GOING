import {kickoff,nflName,nflTeamCode} from './nfl-availability.mjs';
import {mean,total} from './math.mjs';

const positions=['QB','RB','WR','TE'];
const sleeperRoot='https://api.sleeper.com/projections/nfl';
const statFields={Receiving:'rec_yd',Receptions:'rec',Rushing:'rush_yd','Rush Attempts':'rush_att',
  Passing:'pass_yd','Pass Attempts':'pass_att',Completions:'pass_cmp'};
const stats=[...Object.values(statFields),'rec_tgt'];
const groups={
  QB:[{key:'pass',projected:'pass_att',min:10,markets:['Passing','Pass Attempts','Completions']}],
  RB:[{key:'rush',projected:'rush_att',min:3,markets:['Rushing','Rush Attempts']},
    {key:'targets',projected:'rec_tgt',min:2,markets:['Receiving','Receptions']}],
  WR:[{key:'targets',projected:'rec_tgt',min:2,markets:['Receiving','Receptions']}],
  TE:[{key:'targets',projected:'rec_tgt',min:2,markets:['Receiving','Receptions']}]
};
const perOpportunity={Receiving:['recY','targets',6],Receptions:['rec','targets',6],
  Rushing:['rushY','rush',8],Passing:['passY','pass',10],Completions:['comp','pass',10]};
const key=(date,team,opponent,name)=>[date,team,opponent,nflName(name)].join('|');
export const nflOut=x=>/^(inactive|out|injured reserve|suspen|physically unable|pup|non-football)/i.test(x||'');
const validStat=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;

export function parseSleeperNfl(rows,season,week,now=Date.now()){
  if(!Array.isArray(rows))return null;
  const players={};
  for(const r of rows){
    const p=r?.player,name=[p?.first_name,p?.last_name].filter(Boolean).join(' ');
    const updated=r?.updated_at,team=nflTeamCode(r?.team),opponent=nflTeamCode(r?.opponent);
    if(r?.company!=='rotowire'||r.category!=='proj'||r.season_type!=='regular'||Number(r.season)!==season||Number(r.week)!==week||
      !positions.includes(p?.position)||!nflName(name)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')||!team||!opponent||
      typeof updated!=='number'||!Number.isFinite(updated)||updated<=0||updated>now)continue;
    const values=Object.fromEntries(stats.filter(k=>validStat(r.stats?.[k])).map(k=>[k,r.stats[k]]));
    if(!Object.keys(values).length)continue;
    const id=key(r.date,team,opponent,name);
    if(!players[id]||players[id].updated<updated)players[id]={updated,position:p.position,stats:values};
  }
  return Object.keys(players).length?{season,week,players}:null;
}

export async function fetchSleeperNfl(season,week){
  if(!Number.isInteger(season)||!Number.isInteger(week)||week<1||week>18)return null;
  const query=new URLSearchParams({season_type:'regular'});
  for(const pos of positions)query.append('position[]',pos);
  try{
    const r=await fetch(`${sleeperRoot}/${season}/${week}?${query}`,{signal:AbortSignal.timeout(6500)});
    return r.ok?parseSleeperNfl(await r.json(),season,week):null;
  }catch{return null;}
}

export function mergeSleeperNfl(previous,next){
  if(!next)return previous;
  if(previous?.season!==next.season||previous?.week!==next.week)return next;
  const players={...previous.players};
  let changed=false;
  for(const [id,row] of Object.entries(next.players)){
    if(players[id]&&players[id].updated>=row.updated)continue;
    players[id]=row;changed=true;
  }
  return changed?{...next,players}:previous;
}

export function nflWorkload(game,team,players,teamGames,report,sleeper,now=Date.now()){
  const statuses=new Map(report.map(r=>[nflName(r.name),r]));
  const status=p=>statuses.get(nflName(p.name));
  const start=Date.parse(kickoff(game.date,game.time));
  const opponent=team===game.a?game.h:game.a;
  const isPregame=Number.isFinite(start)&&start>now&&start<=now+8*86400000&&game.sa==null&&game.sh==null;
  const recent=teamGames.slice(-5),shift=new Map();
  const prefix=[game.date,team,opponent].join('|')+'|';
  const sameSlate=sleeper?.week===game.week&&sleeper?.season===Number(game.id.slice(0,4));
  const fresh=entry=>entry&&entry.updated<=now&&now-entry.updated<=48*3600000;
  const knownNames=new Set(players.map(p=>nflName(p.name)));
  const outside=Object.entries(sameSlate?sleeper.players||{}:{}).flatMap(([id,p])=>{
    if(!id.startsWith(prefix)||!fresh(p))return [];
    const name=id.slice(prefix.length);
    return knownNames.has(name)||nflOut(statuses.get(name)?.status)?[]:[p];
  });
  const external=p=>{
    const entry=sameSlate?sleeper.players?.[key(game.date,team,opponent,p.name)]:null;
    return isPregame&&entry?.position===p.pos&&fresh(entry)?entry:null;
  };
  for(const [position,channels] of Object.entries(groups)){
    if(!isPregame||recent.length<2)break;
    const positionPlayers=players.filter(p=>p.pos===position);
    for(const channel of channels){
      const volume=p=>total(recent,id=>p.logs.find(l=>l.game===id)?.[channel.key])/recent.length;
      const absent=positionPlayers.filter(p=>nflOut(status(p)?.status)&&volume(p)>=channel.min);
      if(!absent.length)continue;
      const candidates=positionPlayers.flatMap(p=>{
        if(nflOut(status(p)?.status))return [];
        const historical=volume(p), projected=external(p)?.stats[channel.projected]??0;
        const weight=Math.max(historical,projected)*(/doubtful/i.test(status(p)?.status||'')?0.25:1);
        return weight>0?[{p,weight}]:[];
      });
      const externalPeers=total(outside.filter(p=>p.position===position),p=>p.stats[channel.projected]);
      const all=total(candidates,r=>r.weight)+externalPeers,vacated=total(absent,volume)*0.75;
      const absences=absent.map(p=>p.name);
      const asOf=Math.max(0,...absent.map(p=>Date.parse(status(p)?.date)).filter(Number.isFinite));
      for(const {p,weight} of candidates){
        const add=vacated*weight/all;
        // A small share of extra work does not justify a change of role.
        if(add<0.5)continue;
        for(const market of channel.markets){
          const [value,usage,min]=perOpportunity[market]||[];
          const opportunities=value?total(p.logs,l=>l[usage]):0;
          const multiplier=value&&opportunities>=min?total(p.logs,l=>l[value])/opportunities:value?null:1;
          shift.set(p.id+'|'+market,{add,multiplier,absences,asOf});
        }
      }
    }
  }
  return {status,projection(p,market,baseline,historicalSplit=0){
    if(!Object.hasOwn(statFields,market))return {value:baseline};
    if(start>now-86400000&&start<=now+8*86400000&&nflOut(status(p)?.status))return {value:null,out:true};
    if(!isPregame)return {value:null};
    const role=shift.get(p.id+'|'+market),entry=external(p);
    const sleeperValue=entry&&(!role||entry.updated>=role.asOf)?entry.stats[statFields[market]]??null:null;
    const hasWorkload=role?.multiplier!=null&&baseline!=null;
    const local=baseline==null?null:baseline+(hasWorkload?role.add*role.multiplier:historicalSplit);
    const weight=role?0.65:0.25;
    const value=sleeperValue==null?local:local==null?sleeperValue:(1-weight)*local+weight*sleeperValue;
    return {value,baseline,local,sleeper:sleeperValue,sleeperAt:sleeperValue!=null?new Date(entry.updated).toISOString():null,
      absences:role?.absences??[],extraOpportunities:role?.add??null,usageShift:hasWorkload,
      splitApplied:!hasWorkload&&baseline!=null?historicalSplit:0};
  }};
}
