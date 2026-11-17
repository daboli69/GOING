// Capture pregame markets through Sports Leader MCP's pinned, local stdio server.
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dateAdd,dateKey} from '../site/ui.mjs';
import {marketSnapshot,teamCode} from '../site/market-watch-data.mjs';

const leagues={nba:['basketball',1],nfl:['football',7]};
const venues=['kalshi','polymarket','polymarket_us'];
const number=x=>Number.isFinite(x)?x:null;
const probability=x=>x>0&&x<1?number(x):null;
const line=x=>Math.abs(x)>=100?number(x):null;
const name=x=>typeof x==='string'?x.trim().toLowerCase().replace(/[^a-z0-9]/g,''):'';

function booksFor(odds){
  const books=(odds?.markets??[]).flatMap(x=>{
    if(typeof x.provider!=='string'||!x.provider.trim()||x.threeWay)return [];
    const row={name:x.provider,away:line(x.awayMoneyLine),home:line(x.homeMoneyLine),spread:number(x.homeSpread),total:number(x.total)};
    return [row.away,row.home,row.spread,row.total].some(v=>v!=null)?[row]:[];
  });
  const c=odds?.consensus;
  return {books,noVig:probability(c?.homeNoVigProb),count:c?.providerCount??0};
}

function exchangePrices(venue,game,league){
  if(venue.events?.length!==1)return [null,null];
  const [e]=venue.events;
  const codes=code=>teamCode(league,code);
  const teams=[game.away,game.home];
  switch(venue.venue){
    case 'kalshi':
      return teams.map(t=>probability(e.markets?.find(m=>codes(m.outcome)===codes(t.abbrev))?.yesAsk));
    case 'polymarket':
      return teams.map(t=>{
        const labels=[t.name,t.displayName,t.abbrev].map(name).filter(Boolean);
        const market=e.markets?.find(m=>m.sportsMarketType==='moneyline');
        return probability(market?.outcomes?.find(o=>labels.includes(name(o.name)))?.price);
      });
    case 'polymarket_us':
      return teams.map(t=>probability([e.long,e.short].find(x=>codes(x?.code)===codes(t.abbrev))?.mid));
  }
}

export function readExchanges(result,game,league,previous,now){
  const same=String(result?.eventId)===game.id&&Math.abs(Date.parse(result.game?.startUtc)-Date.parse(game.iso))<60000;
  const checked=Date.parse(result?.fetchedAt);
  return venues.map(id=>{
    const source=same&&Math.abs(now-checked)<5*60000?result.venues?.find(v=>v.venue===id):null;
    if(source?.status==='ok'||source?.status==='no market found'){
      const [away,home]=source.status==='ok'?exchangePrices(source,game,league):[null,null];
      return {id,checked:result.fetchedAt,away,home,status:away!=null||home!=null?'ok':'missing'};
    }
    const saved=previous?.exchanges?.find(v=>v.id===id&&v.status==='ok');
    const age=now-Date.parse(saved?.checked);
    if(age>=0&&age<=2*3600000)return {...saved,retained:true};
    return {id,status:'unavailable'};
  });
}

export async function captureMarket(league,call,previous,{now=Date.now,signal}={}){
  const [sport,horizon]=leagues[league], today=dateKey(new Date(now()));
  const dateRange=[today,dateAdd(today,horizon)].map(d=>d.replaceAll('-','')).join('-');
  const board=await call('get_scoreboard',{sport,league,dateRange});
  if(!Array.isArray(board?.events)||board.page||board.events.some(e=>!/^\d+$/.test(e.id)||!Number.isFinite(Date.parse(e.date))||!e.status?.state))
    throw new Error('Invalid or incomplete scoreboard');
  const checked=new Date(now()).toISOString();
  const games=board.events.flatMap(e=>{
    if(e.status.state!=='pre'||Date.parse(e.date)<=now())return [];
    const away=e.competitors?.find(c=>c.homeAway==='away')?.team, home=e.competitors?.find(c=>c.homeAway==='home')?.team;
    if(!away?.abbrev||!home?.abbrev)return [];
    return [{id:String(e.id),iso:new Date(e.date).toISOString(),away,home,...booksFor(e.odds)}];
  }).sort((a,b)=>a.iso.localeCompare(b.iso));
  const prior=new Map((previous?.games??[]).map(g=>[g.id,g]));
  // Keep one small batch in flight. The upstream client shares its short cache across game calls.
  for(let i=0;i<games.length;i+=4){
    await Promise.all(games.slice(i,i+4).map(async g=>{
      const date=dateKey(new Date(g.iso)).replaceAll('-','');
      let result;
      if(!signal?.aborted)try{result=await call('get_market_odds',{sport,league,date,eventId:g.id});}catch{}
      const old=prior.get(g.id);
      g.exchanges=readExchanges(result,g,league,old?.iso===g.iso&&old?.a===teamCode(league,g.away.abbrev)&&old?.h===teamCode(league,g.home.abbrev)?old:null,now());
      g.a=teamCode(league,g.away.abbrev);
      g.h=teamCode(league,g.home.abbrev);
      delete g.away;
      delete g.home;
    }));
  }
  return {checked,through:dateAdd(today,horizon),games};
}

async function previousMarket(path,league){
  const local=await readFile(path,'utf8').then(JSON.parse).catch(()=>null);
  if(marketSnapshot(local))return local;
  const response=await fetch('https://goingplaybook.com/data/market-watch/'+league+'.json',{signal:AbortSignal.timeout(7000)})
    .then(r=>r.ok?r.json():null).catch(()=>null);
  return marketSnapshot(response)?response:null;
}

async function main(){
  const server=process.env.SPORTS_LEADER_MCP;
  if(!server)throw new Error('Set SPORTS_LEADER_MCP to the checkout of Sports Leader MCP after building it.');
  const root=resolve(server), require=createRequire(join(root,'package.json'));
  const {Client}=require('@modelcontextprotocol/client'), {StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
  const client=new Client({name:'going-market-watch',version:'1'});
  const signal=AbortSignal.timeout(60000);
  const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'dist','index.js')],env:{SPORTS_LEADER_TIMEOUT:'6500'},stderr:'inherit'});
  const out=fileURLToPath(new URL('../site/data/market-watch/',import.meta.url));
  await mkdir(out,{recursive:true});
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
