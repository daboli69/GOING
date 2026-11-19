import {poissonTail} from './math.mjs';

export const gtaDate='2026-11-19';
export const gtaEnabled=true;
export const gtaStart=Date.parse('2026-11-19T05:00:00Z');
export const gtaEnd=Date.parse('2026-11-21T11:00:00Z');
export const gtaVisible=(now=Date.now(),status=null,enabled=gtaEnabled)=>enabled&&now>=gtaStart&&now<gtaEnd&&!status?.completedAt;
export const gtaQuoteAge=120*60000;
export const gtaClasses={supported:'Data-supported under',sensitive:'Event-sensitive under',unsupported:'Unsupported'};
export const breakEven=odds=>odds>0?100/(100+odds):-odds/(100-odds);
export const returnOnDecision=(p,odds)=>p/breakEven(odds)-1;
const clamp=p=>Math.min(1,Math.max(0,p));
export function poissonUnder(mean,line){
  const under=1-poissonTail(mean,Math.ceil(line));
  const over=poissonTail(mean,Math.floor(line)+1);
  return under+over>0?{prob:under/(under+over),push:Math.max(0,1-under-over)}:null;
}

export function stress(row,step=3){
  if(row.prob==null)return [];
  return [-1,0,1].map(dir=>{
    const projected=row.model==='nhl-poisson'?row.projection*(1+dir*step/100):null;
    const count=projected==null?null:poissonUnder(projected,row.line);
    const p=count?.prob??clamp(row.prob-dir*step/100);
    const push=count?.push??row.push;
    return {dir,projected,prob:p,ev:returnOnDecision(p,row.odds)*(push==null?1:1-push)};
  });
}

export function classify(row,reliability){
  if(row.prob==null||row.unavailable)return 'unsupported';
  const lower=reliability?.interval?.[0];
  if(reliability?.games>=30&&reliability.weeks>=4&&reliability.matched>=30&&Number.isFinite(lower)&&
    Number.isFinite(reliability.brier)&&Number.isFinite(reliability.marketBrier)&&reliability.brier<=reliability.marketBrier&&row.prob+Math.min(0,lower)>breakEven(row.odds)&&row.executable)return 'supported';
  const pressures=stress(row);
  const threshold=breakEven(row.odds);
  return pressures.some(x=>Math.abs(x.prob-row.prob)>=.025&&(x.prob>threshold)!==(row.prob>threshold))?'sensitive':'unsupported';
}
