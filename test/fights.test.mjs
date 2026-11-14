import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFightCards,parseFightMarket,parseFightResult} from '../site/fights-feeds.mjs';
import {fightHistory,fightForecast,fightPick,fightSettlement} from '../site/fights-core.mjs';

const a={id:'10',name:'Fighter A'},b={id:'20',name:'Fighter B'};
const bout={id:'200',fighters:[a,b]};
const card={id:'100',start:'2026-11-15T02:00:00.000Z',date:'2026-11-14',bouts:[bout]};
const competitor=f=>({id:f.id,athlete:{fullName:f.name}});

test('UFC cards exclude feeder series and keep the Eastern event date for late bouts',()=>{
  const event={id:card.id,date:card.start,name:'UFC Fight Night: A vs. B',competitions:[{
    id:bout.id,date:'2026-11-15T04:00:00Z',competitors:[competitor(a),competitor(b)]
  }]};
  const cards=parseFightCards({events:[event,{...event,name:"Dana White's Contender Series"},{...event,name:'UFC Fight Night: Road to UFC'}]});
  assert.equal(cards.length,1);
  assert.equal(cards[0].date,'2026-11-14');
  assert.equal(cards[0].bouts[0].winner,null);
});

test('moneyline capture maps both quotes to fighter IDs, even in reverse order',()=>{
  const offer={provider:{name:'Example'},awayAthleteOdds:{athlete:{$ref:'http://espn.test/athletes/20?lang=en'},moneyLine:160},
    homeAthleteOdds:{athlete:{$ref:'http://espn.test/athletes/10?lang=en'},moneyLine:-190},overUnder:2.5,overOdds:-110};
  const market=parseFightMarket({items:[offer]},[b,a]);
  assert.deepEqual(market.moneyline,{'10':-190,'20':160});
  assert.equal(market.total.under,null);
  assert.equal(parseFightMarket({items:[{...offer,awayAthleteOdds:{moneyLine:160}}]},[a,b]),null);
});

test('UFC forecasts require three graded bouts for each fighter and settle only confirmed outcomes',()=>{
  const cards=[1,2,3].map(i=>({...card,start:`2026-01-0${i}T20:00:00Z`,bouts:[{...bout,status:'final',winner:a.id}]}));
  assert.equal(fightForecast(bout,fightHistory(cards.slice(0,2))),null);
  const forecast=fightForecast(bout,fightHistory(cards));
  assert.ok(forecast.prob[0]>0.5);
  const p=fightPick(card,{...bout,forecast,market:{moneyline:{[a.id]:-190}}});
  assert.equal(p.side,a.id);
  assert.equal(p.odds,-190);
  assert.equal(p.start,card.start);
  assert.equal(fightSettlement(p,{...bout,status:'final'}),null);
  assert.equal(fightSettlement(p,{...bout,status:'final',winner:b.id}).result,'lost');
  assert.equal(fightSettlement(p,{...bout,status:'final',...parseFightResult({result:{name:'draw'}})}).result,'push');
  assert.equal(fightSettlement(p,{...bout,status:'final',...parseFightResult({result:{name:'no-contest'}})}).result,'void');
  assert.equal(fightSettlement(p,{...bout,status:'canceled'}).result,'void');
  assert.equal(fightSettlement(p,{...bout,fighters:[a,{id:'30',name:'Replacement'}]}).result,'void');
});
