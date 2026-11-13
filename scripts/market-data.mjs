import {american} from '../site/math.mjs';
const host='https://external-api.kalshi.com/trade-api/v2/markets';
const series={
  nfl:{Receiving:'KXNFLRECYDS',Rushing:'KXNFLRSHYDS',Passing:'KXNFLPASSYDS','Anytime TD':'KXNFLTD','First TD':'KXNFLFIRSTTD',
    Receptions:'KXNFLREC','Rush Attempts':'KXNFLRSHATT','Pass Attempts':'KXNFLPASSATT',Completions:'KXNFLPASSCOMP'},
  nba:{Points:'KXNBAPTS',Threes:'KXNBA3PT',Assists:'KXNBAAST',Rebounds:'KXNBAREB','First Basket':'KXNBAFIRSTBASKET'},
  nhl:{'Anytime Goals':'KXNHLGOAL',Points:'KXNHLPTS',Saves:'KXNHLSAVE'}
};
const months='JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
const aliases={nfl:{LA:['LA','LAR'],WAS:['WAS','WSH'],JAX:['JAX','JAC']},nba:{WSH:['WAS','WSH'],UTAH:['UTA','UTAH'],GS:['GS','GSW'],NY:['NY','NYK'],SA:['SA','SAS'],NO:['NO','NOP']},nhl:{TBL:['TB','TBL'],LAK:['LA','LAK'],NJD:['NJ','NJD'],SJS:['SJ','SJS'],UTA:['UTA','UTAH']}};
const norm=t=>String(t||'').normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
export function eventSuffixes(s,g){
  const [y,m,d]=g.date.split('-'),codes=t=>aliases[s]?.[t]||[t];
  return codes(g.a).flatMap(a=>codes(g.h).map(h=>y.slice(2)+months[+m-1]+d+a+h));
}
export function quote(m,market,g){
  if(!['active','open'].includes(m.status)||g.iso&&Date.parse(g.iso)<=Date.now())return null;
  const player=m.title?.split(':')[0]?.trim();
  if(!player||player===m.title)return null;
  const yes=Number(m.yes_ask_dollars),no=Number(m.no_ask_dollars);
  const over=yes>0&&yes<1&&Number(m.yes_ask_size_fp)>0?american(yes):null,under=no>0&&no<1&&Number(m.no_ask_size_fp)>0?american(no):null;
  if(!over&&!under)return null;
  const line=market==='First TD'||market==='First Basket'?.5:m.floor_strike;
  if(line==null||!Number.isFinite(line)||['Anytime Goals','Anytime TD'].includes(market)&&line!==.5)return null;
  return {player,market,line,date:g.date,a:g.a,h:g.h,over,under,provider:'Kalshi',volume:Number(m.volume_fp)||0,yes:over?yes:null,no:under?no:null};
}
export function chooseQuotes(rows,byLine=false){
  const top=new Map();
  for(const row of rows){
    const key=[row.date,row.a,row.h,norm(row.player),row.market,byLine?row.line:''].join('|');
    const prev=top.get(key);
    const score=x=>(x.yes!=null&&x.no!=null?3:0)-Math.abs((x.yes??1-x.no)-.5)*4+.08*Math.log1p(x.volume);
    if(!prev||score(row)>score(prev))top.set(key,row);
  }
  return [...top.values()].map(({volume,yes,no,...x})=>x);
}
export async function publicQuotes(s,games,{onAlternates}={}){
  if(!series[s]||!games.length)return [];
  const by=new Map(games.flatMap(g=>eventSuffixes(s,g).map(k=>[k,g])));
  const starts=games.map(g=>g.date).sort();
  const after=Math.floor(Date.parse(starts[0]+'T00:00:00Z')/1000)-8*86400;
  const capturedAt=new Date().toISOString();
  const all=await Promise.allSettled(Object.entries(series[s]).map(async ([market,ticker])=>{
    const rows=[];let cursor='';
    for(let page=0;page<3;page++){
      const u=new URL(host);
      for(const [k,v] of Object.entries({series_ticker:ticker,status:'open',limit:'1000',min_created_ts:String(after),...(cursor?{cursor}:{})}))u.searchParams.set(k,v);
      let r=await fetch(u,{signal:AbortSignal.timeout(3500)});
      if(r.status===429||r.status>=500){
        const delay=1000*(Number(r.headers.get('retry-after'))||.7);
        if(delay<=2500){await new Promise(resolve=>setTimeout(resolve,delay));r=await fetch(u,{signal:AbortSignal.timeout(3500)});}
      }
      if(!r.ok)break;
      const j=await r.json();
      for(const m of j.markets||[]){
        const g=by.get(m.event_ticker?.slice(ticker.length+1)),x=g&&quote(m,market,g);
        if(x)rows.push(x);
      }
      cursor=j.cursor;if(!cursor)break;
    }
    return rows;
  }));
  const rows=all.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  const quotes=chooseQuotes(rows);
  if(s==='nba'&&onAlternates)onAlternates(chooseQuotes(rows,true).map(q=>({...q,capturedAt})));
  return quotes.map(q=>({...q,capturedAt}));
}
