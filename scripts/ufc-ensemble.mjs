// Every feature is computed before its card. Current ESPN career stats never enter training.
import {fightMinBouts,ufcModelVersion,ufcMembers} from '../site/fights-core.mjs';

const recentLimit=8;
const day=86400000;
const sum=(rows,fn)=>rows.reduce((total,row)=>total+fn(row),0);
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const sigmoid=v=>1/(1+Math.exp(-v));
const elo=(a,b)=>sigmoid((a-b)*Math.log(10)/400);
const logit=p=>Math.log(p/(1-p));
const diff=(a,b,scale)=>clamp((a-b)/scale,-4,4);

function profile(fighter){
  const rows=fighter.bouts.filter(r=>r.stats).slice(0,recentLimit);
  if(rows.length<2)return null;
  const total=(side,k)=>sum(rows,r=>r.stats.stats[side][k]);
  const time=sum(rows,r=>r.stats.minutes),att=total(0,'att'),tdAtt=total(0,'tdAtt');
  const sig=total(0,'sig'),tdAgainst=total(1,'tdAtt');
  return {n:rows.length,strikes:(sig+7)/(time+2),absorbed:(total(1,'sig')+7)/(time+2),
    accuracy:(sig+5)/(att+12),defense:1-(total(1,'sig')+5)/(total(1,'att')+12),
    close:(total(0,'close')+2)/(sig+8),td:(tdAtt+0.4)*15/(time+3),
    tdAcc:(total(0,'td')+1)/(tdAtt+3),tdDef:1-(total(1,'td')+1)/(tdAgainst+3),
    sub:(total(0,'sub')+0.1)*15/(time+3),control:(total(0,'control')+30)/(60*time+180),
    allowedControl:(total(1,'control')+30)/(60*time+180),kd:(total(0,'kd')+0.1)*15/(time+3)};
}

function similarity(a,b){
  return Math.hypot((a.strikes-b.strikes)/2,(a.td-b.td)/3,(a.close-b.close)/0.25,(a.sub-b.sub)/1.5);
}
function styleHistory(fighter,opponentStyle,opponentId){
  if(!opponentStyle)return null;
  const matches=fighter.bouts.filter(r=>r.oppId!==opponentId&&r.oppStyle&&similarity(r.oppStyle,opponentStyle)<=1.75);
  const weight=r=>1/(1+similarity(r.oppStyle,opponentStyle)**2);
  const w=sum(matches,weight),wins=matches.filter(r=>r.score===1).length,draws=matches.filter(r=>r.score===0.5).length;
  return {n:matches.length,wins,draws,losses:matches.length-wins-draws,adjusted:sum(matches,r=>weight(r)*(r.score-r.expected))/(w+3)};
}
const headToHead=(a,opponent)=>a.bouts.filter(r=>r.oppId===opponent);
const residual=(f,count)=>{
  const rows=f.bouts.slice(0,count);
  return sum(rows,r=>r.score-r.expected)/(rows.length+2);
};
const classify=p=>!p?null:p.td>=4&&p.close>=0.31?'Grappling-heavy':p.td<2.7&&p.close<0.26?'Distance striking':'Mixed';

function matchup(a,b,first,second,date){
  const n=[a.bouts.length,b.bouts.length];
  if(Math.min(...n)<fightMinBouts)return null;
  const [p,q]=[first,second],rating=elo(a.rating,b.rating),prior=logit(rating);
  const layoff=f=>clamp((date-f.bouts[0].time)/day,0,1000);
  const direct=headToHead(a,b.id);
  const form=[prior,diff(residual(a,5),residual(b,5),0.25),diff(Math.log1p(n[0]),Math.log1p(n[1]),1),
    diff(layoff(b),layoff(a),365),sum(direct,r=>r.score-r.expected)/(direct.length+3)];
  const similar=[styleHistory(a,q,b.id),styleHistory(b,p,a.id)];
  const style=similar.every(x=>x)&&similar.some(x=>x.n>=2)?[prior,
    diff(similar[0].adjusted,similar[1].adjusted,0.25)]:null;
  const strike=p&&q?[prior,diff(p.strikes-p.absorbed,q.strikes-q.absorbed,2),
    diff(p.accuracy*(1-q.defense),q.accuracy*(1-p.defense),0.12),diff(p.kd,q.kd,0.6)]:null;
  const grappling=p&&q?[prior,diff(p.td*p.tdAcc*(1-q.tdDef),q.td*q.tdAcc*(1-p.tdDef),1),
    diff(p.control+q.allowedControl,q.control+p.allowedControl,0.25),diff(p.sub,q.sub,1.5)]:null;
  return {n,rating,vectors:{form,striking:strike,grappling,styles:style},similar,
    direct:{wins:direct.filter(r=>r.score===1).length,losses:direct.filter(r=>r.score===0).length,draws:direct.filter(r=>r.score===0.5).length},
    profiles:[p,q].map(x=>x?{...x,style:classify(x)}:null)};
}

function archiveRows(cards){
  const fighters=new Map(),rows=[];
  const fighter=id=>{
    if(!fighters.has(id))fighters.set(id,{id,rating:1500,bouts:[]});
    return fighters.get(id);
  };
  const ordered=[...cards].sort((a,b)=>a.start.localeCompare(b.start));
  const byDate=Map.groupBy(ordered,card=>card.date);
  for(const sameDay of byDate.values()){
    const updates=[];
    for(const card of sameDay){
      const time=Date.parse(card.start);
      for(const bout of card.bouts){
        if(bout.status!=='final'||bout.outcome==='no-contest'||(!bout.winner&&bout.outcome!=='draw'))continue;
        const [a,b]=bout.fighters.map(f=>fighter(f.id)),pa=profile(a),pb=profile(b);
        const score=bout.outcome==='draw'?0.5:Number(a.id===bout.winner),expected=elo(a.rating,b.rating);
        const input=matchup(a,b,pa,pb,time);
        if(input&&score!==0.5)rows.push({date:card.date,y:score,input});
        const stats=bout.modelStats;
        updates.push(()=>{
          const change=32*(score-expected);
          a.rating+=change;b.rating-=change;
          a.bouts.unshift({score,expected,time,oppId:b.id,oppStyle:pb,stats});
          b.bouts.unshift({score:1-score,expected:1-expected,time,oppId:a.id,oppStyle:pa,
            stats:stats?{minutes:stats.minutes,stats:[stats.stats[1],stats.stats[0]]}:null});
        });
      }
    }
    for(const update of updates)update();
  }
  return {fighters,rows};
}

// Zero intercept preserves symmetry when the fighters are swapped. L2 regularization shrinks unstable slopes.
function fit(rows,key){
  const samples=rows.filter(r=>r.input.vectors[key]);
  if(samples.length<100)return null;
  const dim=samples[0].input.vectors[key].length,coef=Array(dim).fill(0);
  for(let step=0;step<200;step++){
    const gradient=Array(dim).fill(0);
    for(const r of samples){
      const vector=r.input.vectors[key];
      const error=sigmoid(vector.reduce((s,v,i)=>s+v*coef[i],0))-r.y;
      for(let i=0;i<dim;i++)gradient[i]+=error*vector[i];
    }
    for(let i=0;i<dim;i++)coef[i]-=0.6*(gradient[i]/samples.length+0.035*coef[i]);
  }
  return {coef,n:samples.length};
}
const fitMembers=rows=>Object.fromEntries(Object.keys(ufcMembers).map(k=>[k,fit(rows,k)]));
function predict(input,models){
  const members=Object.entries(ufcMembers).flatMap(([key,{weight}])=>{
    const vector=input.vectors[key],model=models[key];
    if(!vector||!model)return [];
    return [{key,weight,prob:sigmoid(vector.reduce((s,v,i)=>s+v*model.coef[i],0))}];
  });
  if(members.length<2||!members.some(m=>m.key==='form'))return null;
  return {first:sum(members,m=>m.prob*m.weight)/sum(members,m=>m.weight),members};
}

function metrics(rows,key){
  const p=r=>clamp(r[key],0.00001,0.99999);
  const n=rows.length;
  if(!n)return {n};
  return {n,accuracy:sum(rows,r=>p(r)===0.5?0.5:Number((p(r)>0.5)===Boolean(r.y)))/n,
    brier:sum(rows,r=>(p(r)-r.y)**2)/n,logLoss:-sum(rows,r=>r.y?Math.log(p(r)):Math.log1p(-p(r)))/n};
}

export function buildUfcEnsemble(cards){
  const {fighters,rows}=archiveRows(cards),models=fitMembers(rows);
  const folds=[],graded=[];
  for(const year of [...new Set(rows.map(r=>r.date.slice(0,4)))].filter(y=>y>='2024')){
    const fit=fitMembers(rows.filter(r=>r.date.slice(0,4)<year));
    const test=rows.filter(r=>r.date.startsWith(year)).flatMap(r=>{
      const forecast=predict(r.input,fit);
      return forecast?[{y:r.y,elo:r.input.rating,ensemble:forecast.first,
        styleCovered:forecast.members.some(m=>m.key==='styles')}]:[];
    });
    graded.push(...test);
    folds.push({year,ensemble:metrics(test,'ensemble'),elo:metrics(test,'elo')});
  }
  const covered=graded.filter(r=>r.styleCovered);
  const report={version:ufcModelVersion,training:rows.length,members:Object.fromEntries(Object.entries(models).map(([k,v])=>[k,v?.n??0])),
    first:rows[0]?.date??null,last:rows.at(-1)?.date??null,folds,ensemble:metrics(graded,'ensemble'),elo:metrics(graded,'elo'),
    styleCovered:{ensemble:metrics(covered,'ensemble'),elo:metrics(covered,'elo')}};
  return {report,forecast(bout,card){
    const [a,b]=bout.fighters.map(f=>fighters.get(f.id));
    if(!a||!b)return null;
    const input=matchup(a,b,profile(a),profile(b),Date.parse(card.start));
    if(!input)return null;
    const predicted=predict(input,models);
    if(!predicted)return null;
    return {prob:[predicted.first,1-predicted.first],n:input.n,version:ufcModelVersion,
      members:predicted.members,similar:input.similar,direct:input.direct,profiles:input.profiles};
  }};
}
