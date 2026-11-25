import {teamCode} from './market-watch-data.mjs';
import {implied,signed} from './math.mjs';

const book=value=>/^draft\s*kings$/i.test(value||'');
const validPrice=value=>/^[+-]?\d+$/.test(String(value??''))&&Math.abs(Number(value))>=100;
const half=value=>Number.isFinite(value)&&Math.abs(value%1)===.5;
const fresh=(at,now)=>Date.parse(at)<=now&&now-Date.parse(at)<=120*60000;
const team=value=>teamCode('nba',value);
const identity=(row,game,away,home,tip)=>row&&String(row.id??row.gid)===String(game.id)&&
  Date.parse(tip)===Date.parse(game.iso)&&team(away)===team(game.a)&&team(home)===team(game.h);

function homeCover(distribution,line){
  const points=Array.isArray(distribution)?distribution:[];
  let sum=0, cover=0;
  for(const {x,p} of points){
    if(!Number.isInteger(x)||!Number.isFinite(p)||p<0)return null;
    if(x===0)continue;
    sum+=p;
    if(x+line>0)cover+=p;
  }
  return sum>=.90&&sum<=1.001?cover/sum:null;
}

// Use the score model's published 10th and 90th percentiles to approximate the total distribution.
function overTotal(expected,line){
  const [low,high]=expected?.total_range??[], median=expected?.total_mid;
  if(![low,median,high].every(Number.isFinite)||!(low<median&&median<high))return null;
  const scale=(line<median?median-low:high-median)/1.2815515655;
  const z=(line-median)/(scale*Math.SQRT2), x=Math.abs(z), t=1/(1+.3275911*x);
  const erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);
  return (1-Math.sign(z)*erf)/2;
}

export function jackpotGameLegs(games,inputs,now){
  const {forecast,prices,market}=inputs??{};
  return games.flatMap(game=>{
    const id=String(game.id), start=Date.parse(game.iso), row=forecast?.games?.[id];
    if(!['FUT','PRE'].includes(game.status)||!(start>now)||!row?.has_forecast||row.completed||
      !identity(row,game,row.away,row.home,row.tipoff_utc)||row.date!==game.date||
      !(Date.parse(row.headline?.saved_at)<=now&&Date.parse(forecast.generated_at)<=now&&now-Date.parse(row.headline?.saved_at)<36*3600000))return [];
    const quote=prices?.games?.find(q=>identity(q,game,q.a,q.h,q.iso)&&['FUT','PRE'].includes(q.status))?.odds;
    const gameOdds=fresh(prices?.checked,now)&&book(quote?.provider)?quote:null;
    const watch=market?.games?.find(q=>identity(q,game,q.a,q.h,q.iso))?.books?.find(q=>book(q.name));
    const odds=gameOdds??(fresh(market?.checked,now)&&watch?{hm:watch.home,am:watch.away}:null);
    if(!odds)return [];

    const result=[];
    const capturedAt=gameOdds?prices.checked:market.checked;
    function add(stat,name,side,p,price,reason){
      if(!Number.isFinite(p)||p<=0||p>=1||!validPrice(price))return;
      result.push({kind:'game',game:id,date:game.date,tip:game.iso,key:[id,stat,side].join('|'),marketKey:id+'|'+stat,
        a:game.a,h:game.h,name,stat,side,chance:p,decimal:1/implied(price),price,capturedAt,
        provider:'DraftKings',reasons:[reason],flags:[]});
    }
    const win=row.headline?.p_home;
    if(win!=null){
      add('Moneyline',game.h+' moneyline','Home',win,odds.hm,'Frozen NBA ensemble win probability');
      add('Moneyline',game.a+' moneyline','Away',1-win,odds.am,'Frozen NBA ensemble win probability');
    }
    if(half(odds.spread)){
      const p=homeCover(row.distribution?.margin,odds.spread);
      if(p!=null){
        add('Spread',game.h+' '+signed(odds.spread,1),'Home',p,odds.ho,'Score model margin distribution');
        add('Spread',game.a+' '+signed(-odds.spread,1),'Away',1-p,odds.ao,'Score model margin distribution');
      }
    }
    if(half(odds.total)){
      const p=overTotal(row.expected,odds.total);
      if(p!=null){
        add('Total','Game total over '+odds.total,'Over',p,odds.over,'Approximation from the score model total range');
        add('Total','Game total under '+odds.total,'Under',1-p,odds.under,'Approximation from the score model total range');
      }
    }
    return result;
  });
}
