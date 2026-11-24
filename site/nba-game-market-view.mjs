import {current as S,badge,box,cell,empty,esc,grid,metric,table,team,tools,select} from './ui.mjs';
import {round,signed} from './math.mjs';
import {marketLean,marketResults,pregameNbaMarkets} from './nba-game-markets.mjs';

const timestamp=iso=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',
  day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(iso));
const label=(side,margin)=>side+' '+signed(-margin,1);
const grade=result=>result?badge(result,result==='Hit'?'g':result==='Miss'?'r':''):'';
const seasonFor=day=>day?Number(day.slice(0,4))+Number(day.slice(5,7)>='10'):null;
const bookLine=(line,book)=>esc(line)+(book?' '+esc(book):'');

function compare(row,kind){
  const info=marketLean(row,kind);
  if(!info)return '—';
  const spread=kind==='spread';
  const book=spread?label(row.h,info.market):round(info.market,1);
  const model=spread?label(row.h,info.model):round(info.model,1);
  const side=Math.abs(info.delta)<.05?'Even':spread?(info.delta>0?row.h:row.a):
    (info.delta>0?'Over':'Under');
  return '<strong>'+esc(model)+'</strong> <span class="subtle">vs '+bookLine(book,spread?row.spreadBook:row.totalBook)+'</span>'+
    '<br><small>'+esc(side==='Even'?side:side+' · '+round(Math.abs(info.delta),1)+' pts')+' '+grade(info.result)+'</small>';
}

export function nbaGameMarkets(){
  const history=Array.isArray(S.nbaMarketRecord?.games)?S.nbaMarketRecord.games:[];
  const date=S.mday;
  const fromHistory=history.filter(g=>g.date===date);
  const merged=new Map(fromHistory.map(g=>[g.id,g]));
  for(const row of pregameNbaMarkets(S.model,S.nbaMarkets))if(row.date===date)merged.set(row.id,row);
  const rows=[...merged.values()].sort((a,b)=>a.iso.localeCompare(b.iso));
  const filter=S.f.nbaMarketView||'All games', market=filter==='Spread comparison'?'spread':'total';
  const filtered=filter==='All games'?rows:rows.filter(row=>marketLean(row,market));
  const slice=history.filter(row=>seasonFor(row.date)===seasonFor(date));
  const results=grid(2,['spread','total'].map(kind=>{
    const r=marketResults(slice,kind);
    return metric(kind==='spread'?'Spread record':'Total record',r.n?
      r.Hit+'–'+r.Miss+' · '+r.Push+' push'+(r.Push===1?'':'es'):'—',r.n?
      r.n+' games · average error: model '+round(r.modelError,1)+' / market '+round(r.marketError,1)+' pts'+(r.Pass?' · '+r.Pass+' even':''):'Waiting for pregame snapshots and finals');
  }));
  const view=table(['Game','Spread · model vs book','Total · model vs book','Final','Pregame captures'],
    filtered.map(row=>[cell(team(row.a)+' @ '+team(row.h)),cell(compare(row,'spread')),cell(compare(row,'total')),
      row.homeScore==null?'—':esc(row.awayScore+'–'+row.homeScore),
      cell('<small>Lines '+esc(timestamp(row.checked))+'<br>Model '+esc(timestamp(row.forecastAt))+'</small>')]),
    {cls:'compact',wrap:'box',empty:'No matched, timestamped pregame lines for this view.'});
  return box('Spread & Total Comparison',tools(select('Market view','nbaMarketView',['All games','Spread comparison','Total comparison']))+
    (filtered.length?view:empty('No matched, timestamped pregame lines for this view.'))+results,
    'Grades use the last recorded pregame line and the same game’s final score. Average error is measured on matching games. A projection difference is stated in points.');
}
