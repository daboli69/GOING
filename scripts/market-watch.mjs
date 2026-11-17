// Capture pregame markets through Sports Leader MCP's pinned, local stdio server.
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dateAdd,dateKey} from '../site/ui.mjs';
import {marketSnapshot,teamCode} from '../site/market-watch-data.mjs';
import {collegeSports} from '../site/college-core.mjs';

const leagues={nba:'basketball/nba',nfl:'football/nfl',nhl:'hockey/nhl',mlb:'baseball/mlb',
  ...Object.fromEntries(Object.entries(collegeSports).map(([sport,x])=>[sport,x.path]))};
const venues=['kalshi','polymarket','polymarket_us'];
const number=x=>Number.isFinite(x)?x:null;
const probability=x=>x>0&&x<1?number(x):null;
const line=x=>Math.abs(x)>=100?number(x):null;
const name=x=>typeof x==='string'?x.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
  .replace(/&/g,' and ').replace(/\bst\b\.?\s*$/,'state').replace(/[^a-z0-9]/g,''):'';

function booksFor(odds){
  const books=(odds?.markets??[]).flatMap(x=>{
    if(typeof x.provider!=='string'||!x.provider.trim()||x.threeWay)return [];
    const row={name:x.provider,away:line(x.awayMoneyLine),home:line(x.homeMoneyLine),spread:number(x.homeSpread),total:number(x.total)};
    return [row.away,row.home,row.spread,row.total].some(v=>v!=null)?[row]:[];
  });
  const c=odds?.consensus;
  return {books,noVig:probability(c?.homeNoVigProb),count:c?.providerCount??0};
}

function exchangePrices(venue,teams,sport){
  if(venue.events?.length!==1)return [null,null];
  const [e]=venue.events;
  const codes=code=>teamCode(sport,code);
  const labels=teams.map(t=>[t.abbrev,t.name,t.displayName,t.location].map(name).filter(Boolean));
  const rows=teams.map(()=>[]);
  function add(code,label,value){
    const p=probability(value);
    if(p==null)return;
    const byCode=teams.map(t=>code&&codes(code)===codes(t.abbrev));
    const hits=byCode.includes(true)?byCode:labels.map(xs=>xs.includes(name(label)));
    // Name fallbacks are useful for college aliases. Shared mascots alone cannot identify a side.
    if(hits.filter(Boolean).length===1)rows[hits.indexOf(true)].push(p);
  }
  if(venue.venue==='kalshi'){
    for(const m of e.markets||[]){
      const side=[e.away,e.home].find(s=>codes(s?.code)===codes(m.outcome));
      add(m.outcome,side?.name,m.yesAsk);
    }
  }else if(venue.venue==='polymarket'){
    const market=e.markets?.find(m=>m.sportsMarketType==='moneyline');
    for(const o of market?.outcomes||[])add(null,o.name,o.price);
  }else if(venue.venue==='polymarket_us'){
    for(const side of [e.long,e.short])if(side)add(side.code,side.name,side.mid);
  }
  return rows.map(side=>side.length===1?side[0]:null);
}

export function readExchanges(result,game,league,previous,now){
  const sides=['away','home'];
  const same=String(result?.eventId)===game.id&&Math.abs(Date.parse(result.game?.startUtc)-Date.parse(game.iso))<60000&&
    sides.every(side=>!result.game[side]?.id||!game[side].id||String(game[side].id)===String(result.game[side].id));
  const teams=sides.map(side=>({...game[side],location:result?.game?.[side]?.location}));
  const checked=Date.parse(result?.fetchedAt);
  return venues.map(id=>{
    const source=same&&Math.abs(now-checked)<5*60000?result.venues?.find(v=>v.venue===id):null;
    if(source?.status==='ok'||source?.status==='no market found'){
      const [away,home]=source.status==='ok'?exchangePrices(source,teams,league):[null,null];
      return {id,checked:result.fetchedAt,away,home,status:away!=null||home!=null?'ok':'missing'};
    }
    const saved=previous?.exchanges?.find(v=>v.id===id&&v.status==='ok');
    const age=now-Date.parse(saved?.checked);
    if(age>=0&&age<=2*3600000)return {...saved,retained:true};
    return {id,status:'unavailable'};
  });
}

async function scoreboard(call,args){
  const events=new Map();
  let offset=0;
  for(let page=0;page<10;page++){
    const board=await call('get_scoreboard',offset?{...args,offset}:args);
    if(!Array.isArray(board?.events)||board.events.some(e=>!/^\d+$/.test(e.id)||!Number.isFinite(Date.parse(e.date))||!e.status?.state))break;
    for(const event of board.events)events.set(String(event.id),event);
    if(!board.page||offset+board.events.length>=board.page.total)return [...events.values()];
    if(!board.events.length||board.page.offset!==offset)break;
    offset+=board.events.length;
  }
  throw new Error('Invalid or incomplete scoreboard');
}

export async function captureMarket(key,call,previous,{now=Date.now,signal}={}){
  const [sport,league]=leagues[key].split('/'), today=dateKey(new Date(now()));
  const through=dateAdd(today,key==='nfl'||key==='fbs'?7:1);
  const dateRange=[today,through].map(d=>d.replaceAll('-','')).join('-');
  const groups=collegeSports[key]&&String(collegeSports[key].group);
  const board=await scoreboard(call,{sport,league,dateRange,...(groups?{groups}:{})});
  const checked=new Date(now()).toISOString();
  const listed=board.flatMap(e=>{
    const away=e.competitors?.find(c=>c.homeAway==='away')?.team, home=e.competitors?.find(c=>c.homeAway==='home')?.team;
    if(!away?.abbrev||!home?.abbrev)return [];
    const iso=new Date(e.date).toISOString(), date=dateKey(new Date(iso)), a=teamCode(key,away.abbrev), h=teamCode(key,home.abbrev);
    return [{id:String(e.id),iso,date,a,h,away,home,state:e.status.state,...booksFor(e.odds)}];
  });
  const games=listed.filter(g=>g.state==='pre'&&Date.parse(g.iso)>now()).sort((a,b)=>a.iso.localeCompare(b.iso));
  const paired=new Map();
  const pairKey=g=>g.date+'|'+[g.a,g.h].sort().join('|');
  // Exchange matchers identify baseball by teams and date. Same-day rematches need a unique game mapping.
  if(key==='mlb')for(const g of listed)paired.set(pairKey(g),(paired.get(pairKey(g))||0)+1);
  const prior=new Map((previous?.games??[]).map(g=>[g.id,g]));
  // Visit the closest dates first, with priced games first on each day. The upstream cache is short-lived.
  const ordered=[...games].sort((a,b)=>a.date.localeCompare(b.date)||Number(!!b.books.length)-Number(!!a.books.length));
  for(let i=0;i<ordered.length;i+=4){
    await Promise.all(ordered.slice(i,i+4).map(async g=>{
      if(key==='mlb'&&paired.get(pairKey(g))>1){
        g.exchangeNote='Exchange markets cannot be matched to one game of this doubleheader.';
        g.exchanges=[];
        return;
      }
      const old=prior.get(g.id);
      const saved=old?.iso===g.iso&&old.a===g.a&&old.h===g.h?old:null;
      let result;
      if(!signal?.aborted)try{
        result=await call('get_market_odds',{sport,league,date:g.date.replaceAll('-',''),eventId:g.id});
      }catch{}
      g.exchanges=readExchanges(result,g,key,saved,now());
    }));
  }
  return {checked,through,games:games.map(({away,home,state,...g})=>({
    ...g,aId:away.id,hId:home.id,aName:away.displayName||away.name,hName:home.displayName||home.name
  }))};
}

async function previousMarket(path,league){
  const local=await readFile(path,'utf8').then(JSON.parse).catch(()=>null);
  if(marketSnapshot(local))return local;
  const response=await fetch('https://goingplaybook.com/data/market-watch/'+league+'.json',{signal:AbortSignal.timeout(7000)})
    .then(r=>r.ok?r.json():null).catch(()=>null);
  return marketSnapshot(response)?response:null;
}

async function main(){
  const out=fileURLToPath(new URL('../site/data/market-watch/',import.meta.url));
  await mkdir(out,{recursive:true});
  if(process.argv.includes('--restore')){
    await Promise.all(Object.keys(leagues).map(async key=>{
      const path=join(out,key+'.json');
      const snapshot=await previousMarket(path,key);
      if(snapshot)await writeFile(path,JSON.stringify(snapshot));
    }));
    return;
  }
  const server=process.env.SPORTS_LEADER_MCP;
  if(!server)throw new Error('Set SPORTS_LEADER_MCP to the checkout of Sports Leader MCP after building it.');
  const root=resolve(server), require=createRequire(join(root,'package.json'));
  const {Client}=require('@modelcontextprotocol/client'), {StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
  const client=new Client({name:'going-market-watch',version:'1'});
  const signal=AbortSignal.timeout(100000);
  const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'dist','index.js')],env:{SPORTS_LEADER_TIMEOUT:'6500'},stderr:'inherit'});
  try{
    await client.connect(transport,{signal,timeout:10000});
    const call=async (tool,args)=>{
      const r=await client.callTool({name:tool,arguments:args},{timeout:12000,signal});
      if(r.isError)throw new Error(tool+' returned an error');
      return r.structuredContent;
    };
    const results=await Promise.allSettled(Object.keys(leagues).map(async league=>{
      const path=join(out,league+'.json');
      const previous=await previousMarket(path,league);
      let data;
      try{data=await captureMarket(league,call,previous,{signal});}
      catch(e){
        console.warn(league+' market watch: '+e.message+(previous?' (keeping previous snapshot)':''));
        data=previous;
      }
      if(!data)return;
      await writeFile(path+'.tmp',JSON.stringify(data));
      await rename(path+'.tmp',path);
      const available=data.games.filter(g=>g.exchanges.some(v=>v.status==='ok')).length;
      console.log(league+' market watch: '+data.games.length+' games, '+available+' with exchange prices ('+data.checked+')');
    }));
    for(const result of results)if(result.status==='rejected')throw result.reason;
  }finally{await client.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
