import test from 'node:test';
import assert from 'node:assert/strict';
import {draftKingsMainLines,draftKingsMilestones,nbaMainLineBoard} from '../site/nba-main-lines.mjs';
import {buildNbaTicket,defaults,legKey} from '../site/nba-parlay-engine.mjs';

const now=Date.parse('2026-11-17T23:15Z');
const game={id:'401910006',a:'UTAH',h:'LAC',iso:'2026-11-18T03:30Z',date:'2026-11-17',status:'FUT'};
const event={id:'35028657',leagueId:'42648',startEventDate:'2026-11-18T03:40Z',status:'NOT_STARTED',
  participants:[{venueRole:'Away',metadata:{shortName:'UTA'}},{venueRole:'Home',metadata:{shortName:'LAC'}}]};
const market={id:'389949000',eventId:event.id,subcategoryId:'12488',marketType:{name:'Points O/U'}};
const quote=(outcomeType,points,american,tags=['MainPointLine'])=>({marketId:market.id,outcomeType,points,displayOdds:{american},tags,
  participants:[{id:'32966',name:'Kris Dunn',type:'Player',venueRole:'HomePlayer'}]});
const offers=[quote('Over',5.5,'−102'),quote('Under',5.5,'−125'),quote('Over',4.5,'-156',['AlternatePointLine'])];
const payload={events:[event],markets:[market],selections:offers};

test('DraftKings capture uses its marked main threshold and exact scheduled matchup',()=>{
  assert.deepEqual(draftKingsMainLines(payload,'Points',[game],now),[{
    player:'Kris Dunn',team:'LAC',market:'Points',line:5.5,date:game.date,a:'UTAH',h:'LAC',
    over:'-102',under:'-125',provider:'DraftKings',capturedAt:new Date(now).toISOString()
  }]);
  assert.deepEqual(draftKingsMainLines(payload,'Points',[{...game,iso:'2026-11-19T03:30Z'}],now),[]);
  assert.deepEqual(draftKingsMainLines(payload,'Points',[{...game,status:'LIVE'}],now),[]);
  assert.deepEqual(draftKingsMainLines({...payload,selections:[offers[0],{...offers[1],points:6.5}]},'Points',[game],now),[]);
  assert.deepEqual(draftKingsMainLines({...payload,selections:offers.slice(2)},'Points',[game],now),[]);
  assert.equal(draftKingsMainLines(payload,'Threes',[game],now),null);
});

test('DraftKings captures quoted pregame milestones as exact alternate Overs',()=>{
  const alt={...market,subcategoryId:'16477',marketType:{name:'Points Milestones'},tags:['SGP']};
  const offer={marketId:market.id,label:'4+',milestoneValue:4,tags:['SGP'],
    displayOdds:{american:'−240'},participants:offers[0].participants};
  const data={events:[event],markets:[alt],selections:[offer,{...offer,milestoneValue:6},
    {...offer,label:'7+',milestoneValue:7,isSuspended:true},{...offer,label:'9+',milestoneValue:9,tags:[]}]};
  assert.deepEqual(draftKingsMilestones(data,'Points',[game],now),[{
    player:'Kris Dunn',team:'LAC',market:'Points',line:3.5,milestone:4,date:game.date,a:'UTAH',h:'LAC',
    over:'-240',provider:'DraftKings',capturedAt:new Date(now).toISOString()
  }]);
  assert.deepEqual(draftKingsMilestones(data,'Points',[{...game,status:'LIVE'}],now),[]);
  assert.equal(draftKingsMainLines(data,'Points',[game],now),null);
});

test('the mirror keeps milestone snapshots separate and only retains failed alternate categories',async()=>{
  const [main]=draftKingsMainLines(payload,'Points',[game],now);
  const standby={...main,line:3.5,milestone:4,capturedAt:new Date(now-60000).toISOString()};
  delete standby.under;
  const snapshot={date:game.date,checkedAt:main.capturedAt,quotes:[main],failed:[],alternates:[],alternateFailed:[]};
  const read=async()=>snapshot;
  const opts={now,force:true,read,publishedAlternates:[standby]};
  const empty=await nbaMainLineBoard(game.date,[game],[main],opts);
  assert.deepEqual(empty.alternates,[]);
  assert.deepEqual(empty.quotes,[main]);
  snapshot.alternateFailed=[{market:'Points'}];
  const failed=await nbaMainLineBoard(game.date,[game],[main],opts);
  assert.deepEqual(failed.alternates,[standby]);
  const stale={...standby,capturedAt:new Date(now-121*60000).toISOString()};
  const expired=await nbaMainLineBoard(game.date,[game],[main],{...opts,publishedAlternates:[stale]});
  assert.deepEqual(expired.alternates,[]);
});

test('the parlay board gets today’s main lines from the separate feed after an overnight publication gap',async()=>{
  const overnight=Date.parse('2026-11-18T06:00:00Z'), date='2026-11-18';
  const next={...game,date,iso:'2026-11-19T02:00Z'};
  const [line]=draftKingsMainLines(payload,'Points',[game],now);
  const previousQuote={...line,date,capturedAt:new Date(overnight-115*60000).toISOString()};
  const refreshed={...previousQuote,line:6.5,capturedAt:new Date(overnight).toISOString()};
  let calls=0;
  const read=async()=>{
    calls++;
    return {date,checkedAt:refreshed.capturedAt,quotes:[refreshed],failed:[]};
  };
  const board=await nbaMainLineBoard(date,[next],[line,previousQuote],{now:overnight,read});
  assert.deepEqual(board.quotes,[refreshed]);
  assert.equal(board.source,'mirror');
  const later=await nbaMainLineBoard(date,[next],[],{previous:board,now:overnight+60000,read});
  assert.deepEqual(later.quotes,[refreshed]);
  assert.equal(calls,1);
  const published=await nbaMainLineBoard(date,[next],[refreshed],{now:overnight,read});
  assert.equal(published.source,'published');
  assert.equal(calls,1);
  await nbaMainLineBoard(date,[next],[refreshed],{now:overnight,force:true,read});
  assert.equal(calls,2);
  const old=await nbaMainLineBoard(date,[next],[refreshed],{now:overnight,force:true,
    read:async()=>({date,checkedAt:previousQuote.capturedAt,quotes:[previousQuote],failed:[]})});
  assert.equal(old.source,'published');
  assert.deepEqual(old.quotes,[refreshed]);
});

test('successful empty markets remove saved lines while failed markets can reuse recent verified lines',async()=>{
  const [line]=draftKingsMainLines(payload,'Points',[game],now);
  const rebounds={...line,market:'Rebounds'};
  const timedOut={...rebounds,capturedAt:new Date(now-121*60000).toISOString()};
  const snapshot=failed=>({date:game.date,checkedAt:line.capturedAt,quotes:[],failed});
  const read=async()=>snapshot([{market:'Rebounds'}]);
  const opts={now,force:true,read};
  const board=await nbaMainLineBoard(game.date,[game],[line,rebounds,timedOut],opts);
  assert.equal(board.source,'partial');
  assert.deepEqual(board.quotes,[rebounds]);
  const empty=await nbaMainLineBoard(game.date,[game],[line,rebounds],{...opts,read:async()=>snapshot([])});
  assert.equal(empty.source,'mirror');
  assert.deepEqual(empty.quotes,[]);
  const sameDate=await nbaMainLineBoard(game.date,[game],[line,rebounds],{now:now+60000,previous:empty,read:async()=>assert.fail('recent check should be reused')});
  assert.deepEqual(sameDate.quotes,[]);
  const started=await nbaMainLineBoard(game.date,[{...game,status:'LIVE'}],[line],opts);
  assert.equal(started.source,'no-games');
  assert.deepEqual(started.quotes,[]);
});

test('an expired branch response is replaced using the current repository contents',async()=>{
  const [line]=draftKingsMainLines(payload,'Points',[game],now);
  const old={...line,capturedAt:new Date(now-125*60000).toISOString()};
  const snapshot=quote=>({date:game.date,checkedAt:quote.capturedAt,quotes:[quote],failed:[]});
  const current=await nbaMainLineBoard(game.date,[game],[old],{now,read:async()=>snapshot(old),
    recover:async()=>snapshot(line)});
  assert.equal(current.source,'mirror');
  assert.deepEqual(current.quotes,[line]);
  const outage=await nbaMainLineBoard(game.date,[game],[old],{now,read:async()=>snapshot(old), recover:async()=>null});
  assert.equal(outage.source,'unavailable');
  assert.deepEqual(outage.quotes,[]);
  const fromRaw=await nbaMainLineBoard(game.date,[game],[old],{now,read:async()=>snapshot(line),
    recover:async()=>assert.fail('Fresh branch data should need no extra request')});
  assert.deepEqual(fromRaw.quotes,[line]);
});

test('the NBA builder prefers estimated chance over price and matchup score, while keeping the game cap',()=>{
  const leg=(player,game,hits,price,score)=>({player,game,stat:'Points',line:5.5,side:'Over',price,score,form:{season:{hits,n:20}}});
  const lower=leg('1','42',12,'-250',10);
  const higher=leg('2','42',16,'+110',5);
  const other=leg('3','43',14,'-150',8);
  const {ticket}=buildNbaTicket([lower,higher,other],{...defaults,legs:2});
  assert.deepEqual(ticket.map(l=>l.player),['2','3']);
});

const mixLeg=(player,game,side,hits)=>({player,game,stat:'Points',line:5.5,side,price:'-110',score:3,form:{season:{hits,n:90}}});
test('Both chooses the highest-chance mixed NBA ticket at the available size',()=>{
  const settings={...defaults,legs:4};
  const under=[mixLeg('1','a','Under',85),mixLeg('2','b','Under',75),mixLeg('3','c','Under',70)];
  const over=[mixLeg('4','a','Over',61),mixLeg('5','b','Over',60),mixLeg('6','c','Over',50)];
  const {ticket}=buildNbaTicket([...under,...over],settings);
  assert.deepEqual(ticket.map(x=>x.player),['1','3','5']);
  assert.equal(new Set(ticket.map(x=>x.game)).size,3);
  assert.deepEqual(buildNbaTicket(under,{...settings,side:'Under'}).ticket,under);
});

test('Both respects retained legs and exclusions and keeps the leg count if the sides cannot fit',()=>{
  const settings={...defaults,legs:2};
  const one=mixLeg('1','a','Under',80), two=mixLeg('2','b','Under',75);
  const blocked=mixLeg('3','a','Over',71), other=mixLeg('4','b','Over',60);
  const locked=[legKey(one)];
  const legs=[one,two,blocked,other];
  assert.deepEqual(buildNbaTicket(legs,settings,{locked}).ticket,[one,other]);
  assert.deepEqual(buildNbaTicket(legs,settings,{locked,excluded:new Set([legKey(other)])}).ticket,[one,two]);
  assert.deepEqual(buildNbaTicket([one,two],settings).ticket,[one,two]);
  assert.deepEqual(buildNbaTicket(legs,settings,{locked:[legKey(one),legKey(two)]}).ticket,[one,two]);
});
