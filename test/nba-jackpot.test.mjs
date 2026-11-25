import test from 'node:test';
import assert from 'node:assert/strict';
import {findNbaJackpot,jackpotProps} from '../site/nba-jackpot-engine.mjs';
import {jackpotGameLegs} from '../site/nba-jackpot-game-lines.mjs';

const date='2026-11-25', now=Date.parse(date+'T15:00Z'), tip=date+'T23:00Z';
const leg=(key,game,chance,decimal,options={})=>({key,game,marketKey:key,chance,decimal,kind:'game',...options});

test('the jackpot search checks different lengths, honors offer minimums, and rejects opposing outcomes',()=>{
  const a=leg('a','a',.85,5), b=leg('b','b',.68,4.5);
  const opposed=leg('opp','a',.9,15,{marketKey:'a'});
  const other=leg('c','c',.64,1.8);
  const result=findNbaJackpot([a,b,opposed,other]);
  assert.equal(result.limited,false);
  assert.deepEqual(result.ticket.legs.map(x=>x.key).sort(),['b','opp']);
  assert.ok(Math.abs(result.ticket.chance-.9*.68)<1e-12);
  assert.equal(findNbaJackpot([a,b,opposed,other],{minLegs:3}).ticket.legs.length,3);
  const favorite=Array.from({length:7},(_,i)=>leg('fav'+i,'game'+i,.9,1.6));
  assert.equal(findNbaJackpot(favorite).ticket.legs.length,7);
  assert.equal(findNbaJackpot(favorite.slice(0,6)).ticket,null);
  assert.equal(findNbaJackpot(favorite,{limit:1}).limited,true);
});

test('the bounded search yields the same best cross-game solution as exhaustive enumeration',()=>{
  const odds=[-50,21,993,17,42]; // Stable seeds for several slate shapes and quote mixes.
  for(const seed of odds){
    const pool=Array.from({length:10},(_,i)=>leg('x'+i,'g'+i%6,
      .35+((i*137+Math.abs(seed))%100)/200,1.1+((i*59+Math.abs(seed))%200)/50));
    let best=null;
    for(let mask=1;mask<(1<<pool.length);mask++){
      const subset=pool.filter((_,i)=>mask&(1<<i));
      if(subset.length<2||new Set(subset.map(x=>x.game)).size<subset.length)continue;
      const price=subset.reduce((p,x)=>p*x.decimal,1), chance=subset.reduce((p,x)=>p*x.chance,1);
      if(price<21)continue;
      if(!best||chance>best.chance)best={chance,price};
    }
    const actual=findNbaJackpot(pool).ticket;
    assert.equal(!!actual,!!best);
    if(best)assert.ok(Math.abs(actual.chance-best.chance)<1e-10);
  }
});

test('a same-game grouping needs enough earlier shared games and prices positive co-hits conservatively',()=>{
  const one=leg('p1','one',.65,5,{kind:'prop',player:'1',team:'ATL',date,stat:'Points',line:8.5,side:'Over'});
  const two=leg('p2','one',.65,5.5,{kind:'prop',player:'2',team:'ATL',date,stat:'Rebounds',line:4.5,side:'Over'});
  const log=(i,day,played)=>['past'+i,day,'ATL','BOS','home',30,played?14:6,0,0,played?7:3];
  const prior=Array.from({length:10},(_,i)=>log(i,'2026-11-'+String(1+i).padStart(2,'0'),i<5));
  const today=log(10,date,true);
  const ticket=findNbaJackpot([one,two],{logs:{1:[...prior,today],2:[...prior,today]}}).ticket;
  assert.equal(ticket.groups[0].n,10);
  assert.equal(ticket.groups[0].hits,5);
  assert.ok(ticket.decimal>=21&&ticket.decimal<27.5);
  assert.ok(Math.abs(ticket.chance-.65**2)<1e-12);
  assert.equal(findNbaJackpot([one,{...two,decimal:5}],{logs:{1:prior,2:prior}}).ticket,null);
  assert.equal(findNbaJackpot([one,two],{logs:{1:prior.slice(0,7),2:prior}}).ticket,null);
  assert.equal(findNbaJackpot([one,{...two,kind:'game'}],{logs:{1:prior,2:prior}}).ticket,null);
});

test('player candidates reuse Suggested Parlays and apply a small, supported minutes adjustment',()=>{
  const results=[6,6,6,14,14,14,14,14,14,14];
  const row={date,player:{id:'1',name:'Player',team:'ATL',pos:'SG'},game:{id:'10',iso:tip,h:'ATL',status:'FUT'},
    stat:'Points',avg:11.6,opp:'BOS',spread:4,total:226,reads:[12],type:'A',typeRank:{rank:29,end:29,total:30},
    typeDeltas:[2,2,2,2,2,2],out:false,injuryReport:true,absences:[],
    form:{season:results,last10:results,last5:results.slice(-5),venue:results,home:results,away:[]},
    quote:{provider:'DraftKings',line:8.5,over:-110,under:-110,capturedAt:date+'T14:00Z'}};
  const history=results.map((points,i)=>['prior'+i,'2026-11-'+String(i+1).padStart(2,'0'),'ATL','BOS','home',i<5?20:30,points]);
  const [adjusted]=jackpotProps([row],[],{1:history},now);
  const [base]=jackpotProps([row],[],{},now);
  assert.ok(adjusted.chance>base.chance&&adjusted.chance-base.chance<=.025);
  assert.match(adjusted.reasons.join(' '),/Recent minutes 30\.0 vs 20\.0/);
  assert.ok(adjusted.reasons.some(reason=>reason.includes('5/5 at similar minutes')));
  assert.deepEqual(jackpotProps([{...row,out:true}],[],{1:history},now),[]);
  assert.deepEqual(jackpotProps([{...row,uncertain:'Questionable'}],[],{1:history},now),[]);
});

test('game legs require verified pregame forecasts and priced sides on the exact fixture',()=>{
  const game={id:'1',date,iso:tip,a:'ATL',h:'BOS',status:'FUT'};
  const forecast={generated_at:date+'T13:00Z',games:{1:{
    gid:'1',date,away:'ATL',home:'BOS',tipoff_utc:tip,has_forecast:true,headline:{saved_at:date+'T12:00Z',p_home:.63},
    distribution:{margin:[{x:-4,p:.35},{x:1,p:.20},{x:4,p:.45}]},
    expected:{total_mid:220,total_range:[201,239]}
  }}};
  const odds={provider:'DraftKings',am:'+124',hm:'-140',spread:-2.5,ho:'-110',ao:'-110',total:219.5,over:'-108',under:'-112'};
  const prices={checked:date+'T14:55Z',games:[{...game,odds}]};
  const result=jackpotGameLegs([game],{forecast,prices},now);
  assert.equal(result.length,6);
  assert.equal(result.find(l=>l.stat==='Moneyline'&&l.side==='Home').chance,.63);
  assert.equal(result.find(l=>l.stat==='Spread'&&l.side==='Home').chance,.45);
  assert.ok(result.find(l=>l.stat==='Total'&&l.side==='Over').chance>.5);
  assert.equal(jackpotGameLegs([game],{forecast,prices:{...prices,checked:date+'T12:59Z'}},now).length,0);
  assert.equal(jackpotGameLegs([{...game,h:'PHI'}],{forecast,prices},now).length,0);
  assert.equal(jackpotGameLegs([game],{forecast,prices},Date.parse(tip)).length,0);
  assert.equal(jackpotGameLegs([game],{forecast,prices:{...prices,games:[{...game,odds:{...odds,over:null,under:null}}]}},now).length,4);
});
