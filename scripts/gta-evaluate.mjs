import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {breakEven,gtaDate,gtaEnd,stress} from '../site/gta-event.mjs';
import {sealEvaluation} from './gta-vault.mjs';
import {gameInterval} from './gta-discovery.mjs';
import {loadNhlFinals,nhlFinalGrade} from './nhl-finals.mjs';
import {loadNbaFinals} from './nba-finals.mjs';
import {nflBoxGrade,loadNflFinals} from './nfl-finals.mjs';
import {gradeNbaParlayLeg} from '../site/nba-parlay-tracking.mjs';
import {outcome} from '../site/track-core.mjs';

const localRoot=resolve('site/data'), publicOrigin='https://goingplaybook.com';
async function read(url){
  try{
    const reply=await fetch(url,{signal:AbortSignal.timeout(10000),cache:'no-store'});
    return reply.ok?await reply.json():null;
  }catch{return null;}
}
const local=path=>readFile(join(localRoot,path+'.json'),'utf8').then(JSON.parse).catch(()=>null);
const source=async path=>(await local(path))??await read(publicOrigin+'/data/'+path+'.json');
const espn='https://site.web.api.espn.com/apis/site/v2/sports/';
const nba='basketball/nba',nfl='football/nfl',paths={nba,nfl,cbb:'basketball/mens-college-basketball',cwb:'basketball/womens-college-basketball',fbs:'football/college-football',
  mlb:'baseball/mlb',ufc:'mma/ufc'};
const key=(s,id)=>s+'|'+String(id);
const settled=new Set(['final','canceled']);
function espnResult(g){
  const c=g?.competitions?.[0], teams=c?.competitors;
  const type=c?.status?.type??g?.status?.type;
  const status=type?.completed&&/^STATUS_FINAL(?:_|$)/.test(type.name)?'final':
    /^STATUS_CANCEL(?:L)?ED$/.test(type?.name)?'canceled':null;
  if(!status)return null;
  const score=side=>{const v=teams?.find(t=>t.homeAway===side)?.score;return v==null||v===''?null:Number(v);};
  const a=score('away'),h=score('home');
  return {status,total:Number.isFinite(a)&&Number.isFinite(h)?a+h:null};
}
export function gradeTotal(final,row){
  if(final?.status==='canceled')return {actual:null,result:'void'};
  if(final?.status==='final'&&Number.isFinite(final.total))return {actual:final.total,result:outcome(final.total,row.line,'Under')};
  return null;
}
export function scorePredictions(graded){
  const byGame=new Map(), representative=new Map();
  let scored=0;
  for(const gradedRow of graded){
    const {row}=gradedRow;
    if(row.prob==null)continue;
    const id=[row.sport,row.game,row.id??row.subject,row.market,row.provider].join('|');
    const prior=representative.get(id);
    if(!prior||Math.abs(breakEven(row.odds)-.5)<Math.abs(breakEven(prior.row.odds)-.5))representative.set(id,gradedRow);
  }
  for(const {row,result} of representative.values()){
    if(!['won','lost'].includes(result))continue;
    scored++;
    const y=Number(result==='won');
    const p=stress(row).map(s=>Math.max(1e-6,Math.min(1-1e-6,s.prob)));
    const id=key(row.sport,row.game), values=byGame.get(id)||[];
    values.push(p.map(v=>[(v-y)**2,-Math.log(y?v:1-v)]));
    byGame.set(id,values);
  }
  const average=x=>x.reduce((sum,v)=>sum+v,0)/x.length;
  const blocks=[...byGame.values()].map(rows=>[0,1,2].map(i=>[0,1].map(metric=>average(rows.map(row=>row[i][metric])))));
  const scores=metric=>[0,1,2].map(i=>blocks.length?average(blocks.map(b=>b[i][metric])):null);
  return {games:byGame.size,representative:scored,brier:scores(0),logLoss:scores(1),
    brierDeltaInterval:[0,2].map(i=>gameInterval(blocks.map(b=>b[i][0]-b[1][0])))};
}

async function finalInputs(snapshot){
  const active=new Set(snapshot.games.map(g=>g.sport));
  const [schedule,nhlData,...boards]=await Promise.all([
    active.has('nfl')?source('nfl-schedule'):[],
    active.has('nhl')?read('https://api-web.nhle.com/v1/score/'+gtaDate):null,
    ...Object.entries(paths).filter(([s])=>active.has(s)).map(async ([s,path])=>[s,await read(espn+path+'/scoreboard?limit=300'+
      (['cbb','cwb','fbs'].includes(s)?'&groups='+(s==='fbs'?80:50):'')+'&dates='+gtaDate.replaceAll('-',''))])]);
  const finals=new Map();
  for(const [s,board] of boards){
    for(const g of board?.events||[]){
      const result=espnResult(g);
      if(result)finals.set(key(s,g.id),result);
    }
  }
  for(const g of nhlData?.games||[]){
    if(['FINAL','OFF'].includes(g.gameState)&&Number.isFinite(g.awayTeam.score)&&Number.isFinite(g.homeTeam.score))
      finals.set(key('nhl',g.id),{status:'final',total:g.awayTeam.score+g.homeTeam.score});
  }
  for(const g of schedule||[]){
    const f=finals.get(key('nfl',g.espn));
    if(f)finals.set(key('nfl',g.id),f);
  }
  return {finals,recorded:{receivedAt:new Date().toISOString(),nhlData,boards,schedule}};
}

const pop=x=>x?.flat?.()??[];
async function archivedGrades(snapshot){
  // Exact current tracker results may attest to DNP and book settlement. Match the frozen contract without remapping sides.
  const dumps=await Promise.all([['nba','parlay-legs-index','parlay-legs'],['nfl','nfl-parlay-legs-index','nfl-parlay-legs']].map(async ([sport,index,prefix])=>{
    const month=gtaDate.slice(0,7), info=await source('tracker/'+index),version=info?.versions?.[month];
    const records=await source('tracker/'+prefix+'-'+month)??(version?await source('tracker/history/'+prefix+'-'+month+'-'+version):null);
    return (Array.isArray(records)?records:[]).map(r=>[sport,r]);
  }));
  const match=(s,r)=>[s,r.game,r.stat,r.player,r.provider,r.line].join('|');
  const found=new Map(pop(dumps).filter(([,r])=>r.date===gtaDate&&r.side==='Under'&&r.result&&Date.parse(r.graded)>Date.parse(r.tip))
    .map(([s,r])=>[match(s,r),{actual:r.value??null,result:r.result,settledAt:r.graded,source:r.resultSource??'Official tracker grade'}]));
  return row=>found.get(match(row.sport,{game:row.game,stat:row.market,player:row.id,provider:row.provider,line:row.line}));
}

export async function evaluate(snapshot,{privateDir,publicStatus,privateArchive,publicKey,now=Date.now()}={}){
  if(!snapshot?.games?.length||!snapshot.rows?.length)return null;
  const {finals,recorded}=await finalInputs(snapshot);
  const finalCount=snapshot.games.filter(g=>settled.has(finals.get(key(g.sport,g.id))?.status)).length;
  if(!privateDir&&finalCount!==snapshot.games.length)return null;
  // Fetch box scores only when the parent fixture is final.
  const ids=s=>new Set(snapshot.rows.filter(r=>r.sport===s&&r.id&&finals.get(key(s,r.game))?.status==='final').map(r=>r.game));
  const [nhl,nba,nflBoxes,archived]=await Promise.all([loadNhlFinals(ids('nhl')),loadNbaFinals(ids('nba'),{refresh:true}),loadNflFinals(recorded.schedule||[],ids('nfl')),archivedGrades(snapshot)]);
  const graded=snapshot.rows.map(row=>{
    const final=finals.get(key(row.sport,row.game));
    const leg={stat:row.market,line:row.line,player:row.id,side:'Under'};
    let grade=final?.status==='canceled'?{value:null,result:'void'}:null;
    const official=row.kind==='Game'?gradeTotal(final,row):null;
    if(official)grade={...official,value:official.actual};
    if(!grade&&row.id&&final?.status==='final'){
      if(row.sport==='nhl')grade=nhlFinalGrade(nhl.get(row.game),{...row,side:'Under'},now);
      if(row.sport==='nba')grade=gradeNbaParlayLeg(leg,nba.get(row.game),now);
      if(row.sport==='nfl')grade=nflBoxGrade(nflBoxes.get(row.game),{...row,player:row.subject,side:'Under'},now);
      // Prefer verified nonbinary/DNP grades and venue-specific TD settlement.
      const archive=archived(row);
      if(archive)grade={...archive,value:archive.actual};
    }
    return {row,actual:grade?.value??null,result:grade?.result??null,gradedAt:grade?.graded??grade?.settledAt??(grade?.result?recorded.receivedAt:null),
      source:grade?.source??grade?.resultSource??(official?'Official scoreboard':null)};
  });
  const report={frozenAt:snapshot.frozenAt,evaluatedAt:new Date(now).toISOString(),finalCount,eventCount:snapshot.games.length,
    counts:{graded:graded.filter(r=>r.result).length,pending:graded.filter(r=>!r.result).length},scores:scorePredictions(graded)};
  const complete=finalCount===snapshot.games.length&&graded.some(r=>r.result);
  if(privateDir){
    await mkdir(privateDir,{recursive:true});
    await writeFile(join(privateDir,'evaluation-'+now+'.json'),JSON.stringify({...report,graded,recorded}),{flag:'wx'});
  }
  if(complete&&publicStatus){
    if(!privateArchive||!publicKey)throw Error('Publishing completion requires a private evaluation archive.');
    await mkdir(dirname(publicStatus),{recursive:true});
    await mkdir(dirname(privateArchive),{recursive:true});
    const encrypted=JSON.stringify(sealEvaluation({...report,graded,recorded},publicKey));
    await writeFile(privateArchive,encrypted);
    const digest=createHash('sha256').update(encrypted).digest('hex');
    const tmp=publicStatus+'.tmp';
    await writeFile(tmp,JSON.stringify({frozenAt:snapshot.frozenAt,digest,completedAt:report.evaluatedAt}));
    await rename(tmp,publicStatus);
  }
  return {...report,complete};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [mode,privatePath]=process.argv.slice(2);
  if(!['private','publish-status'].includes(mode)||mode==='private'&&!privatePath)throw Error('Use private DIR or publish-status.');
  if(mode==='private'||Date.now()<gtaEnd+86400000){
    const snapshot=JSON.parse(await readFile(resolve('site/gta-special-snapshot.json'),'utf8'));
    let result;
    if(mode==='private')result=await evaluate(snapshot,{privateDir:resolve(privatePath)});
    else{
      const publicStatus=join(localRoot,'gta-special-status.json');
      const prior=await read(publicOrigin+'/data/gta-special-status.json');
      if(prior?.digest&&prior.frozenAt===snapshot.frozenAt&&prior.completedAt){
        await mkdir(dirname(publicStatus),{recursive:true});
        await writeFile(publicStatus,JSON.stringify(prior));
        result='Completion already published.';
      }else{
        const publicKey=await readFile(resolve('scripts/research/gta6-evaluation-public.pem'));
        result=await evaluate(snapshot,{publicStatus,privateArchive:process.env.GTA_PRIVATE_ARCHIVE,publicKey});
      }
    }
    if(mode==='private')console.log(result);
    else console.log(typeof result==='string'?result:result?.complete?'Encrypted evaluation ready.':'Waiting for every frozen event to finish.');
  }
}
