import test from 'node:test';
import assert from 'node:assert/strict';
import {captureMarket} from '../scripts/market-watch.mjs';
import {marketForecast,marketSnapshot,marketStale,upcomingMarkets} from '../site/market-watch-data.mjs';

const checked='2026-11-17T17:00:00Z', now=Date.parse(checked), iso='2026-11-18T00:30:00.000Z';
const away={abbrev:'NY',name:'Knicks'}, home={abbrev:'TOR',name:'Raptors'};
const game={id:'401910002',a:'NYK',h:'TOR',iso};
const event={id:game.id,date:iso,status:{state:'pre'},
  competitors:[{homeAway:'away',team:away},{homeAway:'home',team:home}],
  odds:{markets:[{provider:'Example Book',awayMoneyLine:-148,homeMoneyLine:125,homeSpread:2.5,total:215.5}],
    consensus:{providerCount:1,homeNoVigProb:.4269}}};
const data=venues=>({eventId:game.id,game:{startUtc:iso},fetchedAt:checked,venues});
const kalshi={venue:'kalshi',status:'ok',events:[{markets:[{outcome:'TOR',yesAsk:.43},{outcome:'NYK',yesAsk:.57}]}]};
const poly={venue:'polymarket',status:'ok',events:[{markets:[{sportsMarketType:'moneyline',
  outcomes:[{name:'Raptors',price:.425},{name:'Knicks',price:.575}]}]}]};
const us={venue:'polymarket_us',status:'ok',events:[{long:{code:'tor',mid:.425},short:{code:'ny',mid:.575}}]};
const prior={games:[{...game,exchanges:[{id:'kalshi',status:'ok',away:.60,home:.41,checked:'2026-11-17T16:00:00Z'}]}]};

test('MCP capture compares the right teams across venues and only collects pregame markets',async()=>{
  const called=[];
  const snapshot=await captureMarket('nba',async (tool,args)=>{
    called.push([tool,args]);
    return tool==='get_scoreboard'?{events:[event,{...event,id:'123',status:{state:'in'}}]}:data([kalshi,poly,us]);
  },null,{now:()=>now});
  assert.ok(marketSnapshot(snapshot));
  assert.deepEqual(called.map(x=>x[0]),['get_scoreboard','get_market_odds']);
  assert.equal(called[0][1].dateRange,'20261117-20261118');
  assert.equal(called[1][1].date,'20261117');
  const [g]=snapshot.games;
  assert.deepEqual([g.a,g.h,g.noVig],['NYK','TOR',.4269]);
  assert.deepEqual(g.books,[{name:'Example Book',away:-148,home:125,spread:2.5,total:215.5}]);
  assert.deepEqual(g.exchanges.map(q=>[q.id,q.status,q.away,q.home]),[
    ['kalshi','ok',.57,.43],['polymarket','ok',.575,.425],['polymarket_us','ok',.575,.425]]);
});

test('an exchange failure retains recent prices only for the same game and a missing listing clears the prior price',async()=>{
  const snapshot=async (previous,result)=>captureMarket('nba',async tool=>
    tool==='get_scoreboard'?{events:[event]}:result,previous,{now:()=>now});
  const [saved]=(await snapshot(prior,data([poly]))).games[0].exchanges;
  assert.deepEqual([saved.status,saved.away,saved.retained,saved.checked],['ok',.60,true,'2026-11-17T16:00:00Z']);
  const [removed]=(await snapshot(prior,data([{venue:'kalshi',status:'no market found'}]))).games[0].exchanges;
  assert.equal(removed.status,'missing');
  assert.equal(removed.away,null);
  const previous={games:[{...prior.games[0],iso:'2026-11-18T01:00:00Z'}]};
  const [rescheduled]=(await snapshot(previous,null)).games[0].exchanges;
  assert.equal(rescheduled.status,'unavailable');
  const [wrongEvent]=(await snapshot(null,{...data([kalshi]),eventId:'123'})).games[0].exchanges;
  assert.equal(wrongEvent.status,'unavailable');
  assert.deepEqual(upcomingMarkets([game],Date.parse(iso)),[]);
  assert.ok(marketStale(checked,now+46*60000));
});

test('market comparisons use published ensemble probabilities and reject unmatched or later forecasts',()=>{
  const nba={generated_at:checked,games:{[game.id]:{away:'NY',home:'TOR',has_forecast:true,headline:{p_home:.48}}}};
  assert.equal(marketForecast('nba',nba,game),.48);
  assert.equal(marketForecast('nba',nba,{...game,h:'DET'}),null);
  assert.equal(marketForecast('nba',{...nba,generated_at:iso},game),null);
  const nflGame={...game,a:'WAS',h:'LA'};
  const nflRow={away_team:'WSH',home_team:'LAR',kickoff_utc:iso,forecast:{champion:{p_home:.6}}};
  assert.equal(marketForecast('nfl',{generated_at:checked,games:[nflRow]},nflGame),.6);
  assert.equal(marketForecast('nfl',{generated_at:checked,games:[nflRow,nflRow]},nflGame),null);
});
