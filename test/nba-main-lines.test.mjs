import test from 'node:test';
import assert from 'node:assert/strict';
import {draftKingsMainLines} from '../scripts/nba-main-lines.mjs';
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
