import {builderLegs,defaults,evaluate,nbaLegChance} from './nba-parlay-engine.mjs';
import {currentStint,propValue,roleTrend} from './nba-role-data.mjs';
import {clamp,legKey,record} from './parlay-core.mjs';
import {implied} from './math.mjs';

export const jackpotMinimum=21;
const screening={...defaults,spread:14.5,skipTickets:false,minOdds:1,maxOdds:Number.MAX_VALUE};
const minLegs=2;
const product=values=>values.reduce((value,p)=>value*p,1);

export function jackpotProps(rows,alternates,logs,now){
  const main=rows.filter(row=>row.quote.provider==='DraftKings'&&!row.uncertain&&row.quote.line%1===.5);
  const milestones=alternates.filter(row=>row.quote.provider==='DraftKings'&&!row.uncertain);
  const regular=evaluate(main,screening,{now}).eligible;
  const alt=builderLegs(main,milestones,screening,{now,minPrice:-Number.MAX_SAFE_INTEGER,maxPrice:-100}).eligible;
  return [...regular,...alt].map(leg=>{
    const history=currentStint(logs[leg.player]||[],leg.team,leg.date), trend=roleTrend(history);
    const minutes=trend.recent.minutes;
    const adjustment=trend.comparable&&Math.abs(trend.minutes)>=2&&Number.isFinite(minutes);
    const comparable=adjustment?record(history.filter(row=>Math.abs(row[5]-minutes)<=4)
      .map(row=>propValue(row,leg.stat)).filter(Number.isFinite),leg.line,leg.side):null;
    const change=comparable?.n>=5?clamp((comparable.rate-leg.form.season.rate)*.20*comparable.n/(comparable.n+8),-.025,.025):0;
    const minutesNote=Number.isFinite(minutes)?'Recent minutes '+minutes.toFixed(1)+
      (trend.comparable?' vs '+trend.prior.minutes.toFixed(1)+' earlier in this team stint':''):'Minutes sample unavailable';
    return {...leg,kind:'prop',key:legKey(leg),marketKey:[leg.game,leg.player,leg.stat].join('|'),chance:clamp(nbaLegChance(leg)+change,.001,.999),
      decimal:1/implied(leg.price),reasons:[...leg.reasons,minutesNote,
        ...(comparable?.n>=5?[comparable.hits+'/'+comparable.n+' at similar minutes']:[])]};
  });
}

function groupEvidence(logs){
  const history=new Map(), samples=new Map();
  const outcomes=leg=>{
    if(!history.has(leg.key)){
      const id=String(leg.player);
      const rows=currentStint(logs[id]||[],leg.team,leg.date).flatMap(item=>{
        const value=propValue(item,leg.stat);
        if(value==null||value===leg.line)return [];
        return [[String(item[0]),Number(leg.side==='Over'?value>leg.line:value<leg.line)]];
      });
      history.set(leg.key,new Map(rows));
    }
    return history.get(leg.key);
  };
  return group=>{
    if(group.length===1)return {lift:1};
    const key=group.map(leg=>leg.key).sort().join('~');
    if(samples.has(key))return samples.get(key);
    const histories=group.map(outcomes);
    let n=0,hits=0;
    const marginals=group.map(()=>0);
    for(const id of histories[0].keys()){
      if(!histories.every(h=>h.has(id)))continue;
      n++;
      let all=1;
      histories.forEach((h,i)=>{const hit=h.get(id);marginals[i]+=hit;all*=hit;});
      hits+=all;
    }
    // Shrink the exact-line co-hit ratio toward independent outcomes. No upward hit-chance adjustment.
    const expected=n*product(marginals.map(count=>(count+.5)/(n+1)));
    const support=n>=8?{n,hits,lift:clamp((hits+8)/(expected+8),.75,1.25)}:null;
    samples.set(key,support);
    return support;
  };
}

function pricedGroup(group,support){
  const chance=product(group.map(leg=>leg.chance))*Math.min(1,support.lift);
  const decimal=product(group.map(leg=>leg.decimal))/Math.max(1,support.lift);
  return {chance,decimal,...support,game:group[0].game};
}

// Bounds use the independent products, which always upper-bound our estimated chance and combined odds.
export function findNbaJackpot(pool,{logs={},minimum=jackpotMinimum,limit=100000}={}){
  const candidates=pool.filter(leg=>leg.kind==='prop'&&leg.chance>0&&leg.chance<1&&Number.isFinite(leg.decimal)&&leg.decimal>1)
    .map(leg=>({leg,weight:Math.log(leg.decimal),loss:-Math.log(leg.chance)}))
    .sort((a,b)=>b.weight/b.loss-a.weight/a.loss||b.leg.chance-a.leg.chance);
  const n=candidates.length, suffix=Array(n+1).fill(0), target=Math.log(minimum), evidence=groupEvidence(logs);
  for(let i=n-1;i>=0;i--)suffix[i]=suffix[i+1]+candidates[i].weight;
  const selected=[], used=new Set(), groups=new Map();
  let best=null, examined=0, limited=false;
  function walk(start,weight,loss,price,chance){
    if(selected.length>=minLegs&&price>=minimum-1e-10&&
      (!best||chance>best.chance+1e-12||Math.abs(chance-best.chance)<=1e-12&&price>best.decimal)){
      best={legs:[...selected],chance,decimal:price,groups:[...groups.values()].map(g=>g.estimated)};
    }
    for(let i=start;i<n&&n-i+selected.length>=minLegs;i++){
      const {leg,weight:addedWeight,loss:addedLoss}=candidates[i];
      const remaining=Math.max(0,target-weight);
      if(suffix[i]+1e-12<remaining)break;
      // Even a fractional use of the remaining legs at their best efficiency cannot beat this bound.
      if(best&&Math.exp(-loss-remaining*addedLoss/addedWeight)<best.chance-1e-12)break;
      if(used.has(leg.marketKey)||best&&Math.exp(-loss-addedLoss)<best.chance-1e-12)continue;
      if(examined>=limit){limited=true;return;}
      examined++;
      const old=groups.get(leg.game), legs=old?[...old.legs,leg]:[leg], support=evidence(legs);
      if(!support)continue;
      const estimated=pricedGroup(legs,support);
      groups.set(leg.game,{legs,estimated});
      selected.push(leg);
      used.add(leg.marketKey);
      walk(i+1,weight+addedWeight,loss+addedLoss,
        price*estimated.decimal/(old?.estimated.decimal??1),chance*estimated.chance/(old?.estimated.chance??1));
      used.delete(leg.marketKey);selected.pop();
      if(old)groups.set(leg.game,old);else groups.delete(leg.game);
      if(limited)return;
    }
  }
  walk(0,0,0,1,1);
  return {ticket:best,examined,limited};
}
