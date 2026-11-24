import {teamCode} from './market-watch-data.mjs';

const horizon=2*60*60*1000;
const time=iso=>Date.parse(iso);
const match=(row,market)=>String(row?.gid)===String(market.id)&&
  time(row.tipoff_utc)===time(market.iso)&&
  teamCode('nba',row.away)===teamCode('nba',market.a)&&teamCode('nba',row.home)===teamCode('nba',market.h);

// Use an actual posted line even when multiple books imply a fractional median.
function reference(books,key){
  const sorted=books.filter(b=>Number.isFinite(b[key])&&(key!=='total'||b[key]>0))
    .sort((a,b)=>a[key]-b[key]||a.name.localeCompare(b.name));
  return sorted.find(b=>/^draft\s*kings$/i.test(b.name))||sorted[Math.floor((sorted.length-1)/2)];
}

export function pregameNbaMarkets(feed,snapshot,now=Date.now()){
  const checked=time(snapshot?.checked), issued=time(feed?.generated_at);
  if(!(checked<=now&&now-checked<=horizon&&issued<=now))return [];
  return (snapshot.games||[]).flatMap(game=>{
    const tip=time(game.iso), forecast=feed.games?.[game.id];
    if(!(now<tip&&issued<tip&&checked<tip&&match(forecast,game)&&forecast.has_forecast))return [];
    const {margin,total}=forecast.expected||{};
    const books=Array.isArray(game.books)?game.books.filter(b=>typeof b?.name==='string'):[];
    const spreadBook=reference(books,'spread'), totalBook=reference(books,'total');
    const spread=spreadBook?.spread??null, bookTotal=totalBook?.total??null;
    if(!Number.isFinite(margin)||!Number.isFinite(total)||total<=0||spread==null&&bookTotal==null)return [];
    return [{id:String(game.id),iso:game.iso,date:game.date,a:game.a,h:game.h,forecastAt:feed.generated_at,
      checked:snapshot.checked,margin,total,spread,bookTotal,spreadBook:spreadBook?.name??null,totalBook:totalBook?.name??null}];
  });
}

export function gradeNbaMarket(row,final){
  if(!match(final,row)||!final.completed||![final.home_score,final.away_score].every(Number.isInteger)||
     final.home_score<=0||final.away_score<=0||final.home_score===final.away_score)return row;
  if(row.homeScore===final.home_score&&row.awayScore===final.away_score)return row;
  return {...row,homeScore:final.home_score,awayScore:final.away_score};
}

export function marketLean(row,kind){
  const spread=kind==='spread';
  const model=spread?row.margin:row.total, market=spread?-row.spread:row.bookTotal;
  if((spread?row.spread:row.bookTotal)==null||!Number.isFinite(model)||!Number.isFinite(market))return null;
  const delta=Math.round((model-market)*1000)/1000;
  if(!Number.isInteger(row.homeScore)||!Number.isInteger(row.awayScore))return {model,market,delta};
  const actual=spread?row.homeScore-row.awayScore:row.homeScore+row.awayScore;
  const result=Math.abs(delta)<.05?'Pass':actual===market?'Push':(actual-market)*delta>0?'Hit':'Miss';
  return {model,market,delta,actual,result,modelError:Math.abs(model-actual),marketError:Math.abs(market-actual)};
}

export function marketResults(rows,kind){
  const paired=rows.map(row=>marketLean(row,kind)).filter(x=>x?.result);
  const counts=Object.fromEntries(['Hit','Miss','Push','Pass'].map(k=>[k,paired.filter(x=>x.result===k).length]));
  const avg=key=>paired.length?paired.reduce((sum,x)=>sum+x[key],0)/paired.length:null;
  return {n:paired.length,...counts,modelError:avg('modelError'),marketError:avg('marketError')};
}
