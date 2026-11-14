export const total=(rows,fn=x=>x)=>rows.reduce((s,x)=>s+(Number(fn(x))||0),0);
export const mean=(rows,fn=x=>x)=>rows.length?total(rows,fn)/rows.length:null;
export const round=(x,n=1)=>{
  if(x==null||!Number.isFinite(+x))return '—';
  const f=10**n,m=Math.abs(+x)*f,i=Math.floor(m);
  const v=Math.abs(m-i-.5)<1e-9?(i%2===0?i:i+1):Math.round(m);
  return ((+x<0?-v:v)/f).toFixed(n);
};
export const pct=(x,n=0)=>x==null||!Number.isFinite(+x)?'—':(+x*100).toFixed(n)+'%';
export const div=(x,y)=>y?x/y:null;
export const signed=(x,n=1)=>x==null?'—':(x>0?'+':'')+round(x,n);
export const seasonLimit=(x,n)=>n==='Season'?x:x.slice(-Number(String(n).replace(/[^0-9]/g,'')));
export const rate=(x,fn)=>div(x.filter(fn).length,x.length);
export const heat=(x,m=0.5,step=0.15,invert=false)=>{
  if(x==null||!Number.isFinite(+x))return 'none';
  const z=(x-m)*(invert?-1:1);return z>=step?'good heat':z<=-step?'bad heat':'mid heat';
};
export const american=p=>p>0&&p<1?(p>=.5?String(-Math.round(100*p/(1-p))):'+'+Math.round(100*(1-p)/p)):'—';
export const implied=a=>a==null||!Number.isFinite(+a)||+a===0?null:+a>0?100/(+a+100):(-a)/(-a+100);
export function poissonTail(lambda,k){
  if(lambda==null||!Number.isFinite(lambda)||lambda<0||!Number.isFinite(k))return null;
  if(k<1)return 1;
  let p=Math.exp(-lambda),s=p;
  for(let i=1;i<k;i++){p*=lambda/i;s+=p;}
  return Math.max(0,Math.min(1,1-s));
}
export function distanceZone(s){
  if(s[6]===3)return Math.abs(s[4]||0)>=21.5&&s[5]<24?'Corner 3':'Above the Break 3';
  return s[5]<=4?'Restricted Area':s[5]<13?'Paint':'Mid-Range';
}
export function leaderShares(players, key, spread, runs=1200){
  if(!players.length)return new Map();
  let seed=11921;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)+1)/4294967297;
  const gaussian=()=>Math.sqrt(-2*Math.log(rand()))*Math.cos(2*Math.PI*rand());
  const counts=new Map(players.map(p=>[p.id,0]));
  for(let j=0;j<runs;j++){
    let best=-Infinity,winners=[];
    for(const p of players){const x=Math.max(0,Math.round(key(p)+spread(p)*gaussian()));if(x>best){best=x;winners=[p];}else if(x===best)winners.push(p);}
    for(const p of winners)counts.set(p.id,counts.get(p.id)+1/winners.length/runs);
  }
  return counts;
}
