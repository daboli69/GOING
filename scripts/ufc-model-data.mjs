import {ufcCore} from '../site/fights-feeds.mjs';

const archiveCommit='8524e139a08384cff001c222db3b173e2a7a3776';
const archiveURL=`https://raw.githubusercontent.com/komaksym/UFC-DataLab/${archiveCommit}/data/stats/stats_raw.csv`;
const archiveThrough='2026-06-27';
const normalize=s=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const pairKey=(a,b)=>[normalize(a),normalize(b)].sort().join('|');
const counts=s=>/^(\d+) of (\d+)$/.exec(s||'')?.slice(1).map(Number)||[];
const clock=s=>{const m=/^(\d+):([0-5]\d)$/.exec(s||'');return m?60*Number(m[1])+Number(m[2]):null;};

function fields(line){
  return [...line.matchAll(/(?:^|;)(?:"((?:[^"]|"")*)"|([^;]*))/g)]
    .map(m=>m[1]?.replaceAll('""','"')??m[2]);
}
function statLine(sig,td,sub,control,clinch,ground,kd){
  if(sig.length!==2||td.length!==2||[...sig,...td,sub,clinch,ground,kd].some(v=>!Number.isFinite(v)||v<0))return null;
  return {sig:sig[0],att:sig[1],td:td[0],tdAtt:td[1],sub,control,close:clinch+ground,kd};
}
export function parseUfcArchive(raw){
  const lines=raw.trim().split(/\r?\n/),keys=fields(lines.shift());
  if(!keys.includes('red_fighter_sig_str')||!keys.includes('event_date'))throw new Error('Unexpected UFC Stats archive columns');
  const rows={};
  for(const l of lines){
    const v=fields(l);
    if(v.length!==keys.length)continue;
    const r=Object.fromEntries(keys.map((k,i)=>[k,v[i]]));
    const date=r.event_date.split('/').reverse().join('-');
    if(date<'2019-12-31'||date>archiveThrough||!r.red_fighter_name||!r.blue_fighter_name)continue;
    const names=[r.red_fighter_name,r.blue_fighter_name],time=clock(r.time),round=Number(r.round);
    const minutes=round>0&&time!=null?((round-1)*300+time)/60:0;
    const stats=['red','blue'].map(side=>{
      const f=key=>r[side+'_fighter_'+key],count=v=>v===''||v==null?NaN:Number(v);
      return statLine(counts(f('sig_str')),counts(f('TD')),count(f('sub_att')),clock(f('ctrl')),
        counts(f('sig_str_clinch'))[0],counts(f('sig_str_ground'))[0],count(f('KD')));
    });
    if(minutes>0&&stats.every(Boolean)){
      const item={date,names,minutes,stats};
      (rows[pairKey(...names)]??=[]).push(item);
    }
  }
  return rows;
}

export function archiveFight(rows,card,bout){
  const names=bout.fighters.map(f=>f.name),matches=(rows[pairKey(...names)]||[]).filter(r=>
    Math.abs(Date.parse(card.date)-Date.parse(r.date))<=86400000);
  if(matches.length!==1)return null;
  const r=matches[0];
  return {minutes:r.minutes,stats:normalize(names[0])===normalize(r.names[0])?r.stats:[...r.stats].reverse()};
}

export function espnFightStats(bout,results){
  const time=clock(bout.clock),minutes=bout.round&&time!=null?((bout.round-1)*300+time)/60:0;
  const stats=results.map(data=>{
    const v=Object.fromEntries((data.splits?.categories||[]).flatMap(c=>c.stats.map(s=>[s.name,s.value])));
    return statLine([v.sigStrikesLanded,v.sigStrikesAttempted],[v.takedownsLanded,v.takedownsAttempted],v.submissions,
      Number.isFinite(v.timeInControl)&&v.timeInControl>=0?v.timeInControl:null,
      v.sigClinchHeadStrikesLanded+v.sigClinchBodyStrikesLanded+v.sigClinchLegStrikesLanded,
      v.sigGroundHeadStrikesLanded+v.sigGroundBodyStrikesLanded+v.sigGroundLegStrikesLanded,v.knockDowns);
  });
  return minutes>0&&stats.length===2&&stats.every(Boolean)?{minutes,stats}:null;
}

export async function attachUfcStats(cards,{cached,download,mapLimit,day}){
  const archive=await cached('ufc-stat-archive-v1',30*day,async()=>{
    const data=parseUfcArchive(await download(archiveURL,'text'));
    if(Object.keys(data).length<2000)throw new Error('UFC Stats archive is incomplete');
    return data;
  });
  const rows=archive?.data||{},jobs=[];
  const counts={bouts:0,archive:0,espn:0};
  for(const card of cards)for(const bout of card.bouts){
    if(bout.status!=='final'||(!bout.winner&&bout.outcome!=='draw')||bout.outcome==='no-contest')continue;
    counts.bouts++;
    bout.modelStats=archiveFight(rows,card,bout);
    if(bout.modelStats){counts.archive++;continue;}
    if(card.date<=archiveThrough)continue;
    jobs.push(async()=>{
      const ids=bout.fighters.map(f=>f.id),url=`${ufcCore}/leagues/ufc/events/${card.id}/competitions/${bout.id}/competitors/`;
      const entry=await cached(['model-stats-v1',bout.id,...ids].join('-'),180*day,async()=>{
        const data=espnFightStats(bout,await Promise.all(ids.map(id=>download(url+id+'/statistics'))));
        if(!data)throw new Error('UFC bout statistics unavailable');
        return data;
      });
      if(entry?.data){bout.modelStats=entry.data;counts.espn++;}
    });
  }
  await mapLimit(jobs,8,job=>job());
  return counts;
}
