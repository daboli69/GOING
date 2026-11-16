import {american} from '../site/math.mjs';
const host='https://external-api.kalshi.com/trade-api/v2/';
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
async function readListing(u,read,key='markets'){
  for(let i=0;i<2;i++){
    let delay=400;
    try{
      const r=await read(u,{signal:AbortSignal.timeout(4500)});
      if(r.ok){
        const data=await r.json();
        if(Array.isArray(data?.[key]))return data;
      }else if(r.status!==429&&r.status<500){
        return null;
      }else{
        delay=1000*(Number(r.headers.get('retry-after'))||.7);
        if(delay>2500)return null;
      }
    }catch{}
    if(i===0)await new Promise(resolve=>setTimeout(resolve,delay));
  }
  return null;
}

async function readInParallel(items,run){
  let i=0;
  await Promise.all(Array.from({length:Math.min(3,items.length)},async()=>{
    while(i<items.length)await run(items[i++]);
  }));
}

export async function publicQuotes(s,games,{onAlternates,onFailure,read=fetch}={}){
  if(!series[s]||!games.length)return [];
  const by=new Map(games.flatMap(g=>eventSuffixes(s,g).map(k=>[k,g])));
  const capturedAt=new Date().toISOString(), rows=[], failed=[];
  const markets=Object.entries(series[s]);
  if(s==='nfl'){
    const collect=(list,market,game,event)=>{
      for(const m of list){
        const x=m.event_ticker===event&&quote(m,market,game);
        if(x)rows.push(x);
      }
    };
    // Event pages contain whole matchups. Keep the exact lookup when the event
    // listing or its nested markets are incomplete.
    const requests=[];
    await readInParallel(markets,async ([market,ticker])=>{
      const events=[...by].map(([suffix,game])=>({market,game,event:ticker+'-'+suffix}));
      const u=new URL('events',host);
      u.searchParams.set('tickers',events.map(x=>x.event).join(','));
      u.searchParams.set('status','open');
      u.searchParams.set('with_nested_markets','true');
      const j=await readListing(u,read,'events');
      const complete=j?.cursor===''&&j.events.every(e=>typeof e?.event_ticker==='string');
      const found=new Map((complete?j.events:[]).map(e=>[e.event_ticker,e.markets]));
      for(const item of events){
        const list=found.get(item.event);
        if(!complete||found.has(item.event)&&!Array.isArray(list))requests.push(item);
        else if(list)collect(list,market,item.game,item.event);
      }
    });
    await readInParallel(requests,async ({market,game,event})=>{
      const u=new URL('markets',host);
      u.searchParams.set('event_ticker',event);
      const j=await readListing(u,read);
      if(!j||j.cursor){failed.push({market,game});return;}
      collect(j.markets,market,game,event);
    });
  }else{
    const starts=games.map(g=>g.date).sort();
    const after=Math.floor(Date.parse(starts[0]+'T00:00:00Z')/1000)-8*86400;
    await Promise.all(markets.map(async ([market,ticker])=>{
      let cursor='';
      for(let page=0;page<3;page++){
        const u=new URL('markets',host);
        for(const [k,v] of Object.entries({series_ticker:ticker,status:'open',limit:'1000',min_created_ts:String(after),...(cursor?{cursor}:{})}))u.searchParams.set(k,v);
        const j=await readListing(u,read);
        if(!j){failed.push({market});return;}
        for(const m of j.markets){
          const g=by.get(m.event_ticker?.slice(ticker.length+1)),x=g&&quote(m,market,g);
          if(x)rows.push(x);
        }
        cursor=j.cursor;
        if(!cursor)return;
      }
      failed.push({market});
    }));
  }
  if(failed.length)onFailure?.(failed);
  const quotes=chooseQuotes(rows);
  if(s==='nba'&&onAlternates)onAlternates(chooseQuotes(rows,true).map(q=>({...q,capturedAt})));
  return quotes.map(q=>({...q,capturedAt}));
}
