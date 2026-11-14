import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFightCards,parseFightMarket,parseFightResult} from '../site/fights-feeds.mjs';
import {fightHistory,fightForecast,fightPick,fightSettlement} from '../site/fights-core.mjs';
import {buildUfcEnsemble} from '../scripts/ufc-ensemble.mjs';
import {archiveFight,parseUfcArchive} from '../scripts/ufc-model-data.mjs';

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

test('ensemble probabilities swap with the fighters and Elo records keep their original key',()=>{
  const stats=(sig,td)=>({sig,att:sig*2,td,tdAtt:td+1,sub:0,control:70,close:15,kd:0});
  const cards=Array.from({length:115},(_,i)=>{
    const date=new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10);
    return {...card,date,start:date+'T20:00:00.000Z',bouts:[{...bout,status:'final',winner:i%3?a.id:b.id,
      modelStats:{minutes:15,stats:[stats(50,2),stats(35,0)]}}]};
  });
  const model=buildUfcEnsemble(cards);
  const f=model.forecast(bout,card),reverse=model.forecast({...bout,fighters:[b,a]},card);
  assert.ok(f.members.some(m=>m.key==='striking'));
  assert.ok(Math.abs(f.prob[0]-reverse.prob[1])<1e-12);
  assert.equal(f.direct.wins+f.direct.losses,115);
  assert.deepEqual(f.similar.map(m=>m.n),[0,0]);
  const baseline=fightPick(card,bout,fightForecast(bout,fightHistory(cards))),pick=fightPick(card,bout,f);
  assert.equal(baseline.k,'ufc|200|10|20');
  assert.notEqual(baseline.k,pick.k);
  assert.ok(pick.tools['ufc-ensemble']);
});

test('UFC archive matches both names and date and keeps the statistics with the correct fighter',()=>{
  const keys=['event_date','red_fighter_name','blue_fighter_name','time','round'];
  const short=['sig_str','TD','sub_att','ctrl','sig_str_clinch','sig_str_ground','KD'];
  for(const side of ['red','blue'])keys.push(...short.map(s=>side+'_fighter_'+s));
  const raw=keys.join(';')+'\n27/06/2026;Fighter B;Fighter A;5:00;3;60 of 80;2 of 4;1;2:00;8 of 9;4 of 6;0;40 of 75;1 of 6;0;1:15;10 of 15;2 of 4;1';
  const data=parseUfcArchive(raw);
  const matched=archiveFight(data,{date:'2026-06-27'},bout);
  assert.equal(matched.minutes,15);
  assert.deepEqual(matched.stats.map(s=>s.sig),[40,60]);
  assert.equal(archiveFight(data,{date:'2026-07-01'},bout),null);
});
