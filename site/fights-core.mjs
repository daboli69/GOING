import {impliedProb} from './track-core.mjs';

export const fightMinBouts=3;
export const fightVersion='ufc-elo-v1';
const expected=(a,b)=>1/(1+10**((b-a)/400));

export function fightHistory(cards){
  const fighters=new Map();
  const row=f=>{
    if(!fighters.has(f.id))fighters.set(f.id,{id:f.id,name:f.name,rating:1500,wins:0,losses:0,draws:0,recent:[]});
    return fighters.get(f.id);
  };
  for(const card of [...cards].sort((a,b)=>a.start.localeCompare(b.start))){
    // Update a rating only for a declared winner or an explicitly confirmed draw.
    for(const bout of card.bouts){
      if(bout.status!=='final'||bout.outcome==='no-contest'||(!bout.winner&&bout.outcome!=='draw'))continue;
      const [a,b]=bout.fighters.map(row);
      const score=bout.outcome==='draw'?0.5:Number(a.id===bout.winner);
      const change=32*(score-expected(a.rating,b.rating));
      a.rating+=change;b.rating-=change;
      for(const [f,opp,result] of [[a,b,score],[b,a,1-score]]){
        const key=result===1?'wins':result===0?'losses':'draws';
        f[key]++;
        f.recent.unshift({date:card.date,opponent:opp.name,result:result===1?'W':result===0?'L':'D',method:bout.method??null});
        if(f.recent.length>5)f.recent.pop();
      }
    }
  }
  return fighters;
}

export function fightForecast(bout,history){
  const [a,b]=bout.fighters.map(f=>history.get(f.id));
  if(!a||!b)return null;
  const sample=f=>f.wins+f.losses+f.draws;
  const n=[sample(a),sample(b)];
  if(Math.min(...n)<fightMinBouts)return null;
  return {prob:[expected(a.rating,b.rating),expected(b.rating,a.rating)],n,version:fightVersion};
}

export function fightPick(card,bout){
  const forecast=bout.forecast;
  if(!forecast||forecast.prob[0]===forecast.prob[1])return null;
  const i=forecast.prob[0]>forecast.prob[1]?0:1;
  const f=bout.fighters[i],opp=bout.fighters[1-i];
  const prob=forecast.prob[i],market=bout.market,odds=market?.moneyline?.[f.id]??null;
  const implied=impliedProb(odds);
  return {k:['ufc',bout.id,...bout.fighters.map(x=>x.id).sort()].join('|'),sport:'ufc',kind:'model',
    game:bout.id,event:card.id,date:card.date,start:card.start,id:f.id,side:f.id,player:f.name,opponent:opp.name,
    a:bout.fighters[0].id,h:bout.fighters[1].id,market:'Winner',line:null,odds,
    provider:odds!=null?market.provider:null,version:forecast.version,tools:{'ufc-baseline':{prob,edge:implied==null?null:prob-implied,lean:true}}};
}

export function fightSettlement(p,bout){
  if(!bout)return null;
  if(!bout.fighters.some(f=>f.id===p.a)||!bout.fighters.some(f=>f.id===p.h))return {result:'void',value:'Opponent changed'};
  if(bout.status==='canceled')return {result:'void',value:'Canceled'};
  if(bout.status!=='final')return null;
  if(bout.outcome==='no-contest')return {result:'void',value:'No contest'};
  if(bout.outcome==='draw')return {result:'push',value:'Draw'};
  if(!bout.winner)return null;
  const winner=bout.fighters.find(f=>f.id===bout.winner);
  if(!winner)return null;
  const detail=[bout.method,bout.round?'R'+bout.round:null,bout.clock].filter(Boolean).join(' · ');
  return {result:bout.winner===p.side?'won':'lost',value:winner.name+(detail?' · '+detail:'')};
}
