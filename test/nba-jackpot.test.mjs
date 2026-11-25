import test from 'node:test';
import assert from 'node:assert/strict';
import {findNbaJackpot,jackpotProps} from '../site/nba-jackpot-engine.mjs';

const date='2026-11-25', now=Date.parse(date+'T15:00Z'), tip=date+'T23:00Z';
const leg=(key,game,chance,decimal,options={})=>({key,game,marketKey:key,chance,decimal,kind:'prop',...options});

test('the jackpot search checks different lengths, honors +2000, and rejects opposing outcomes',()=>{
  const a=leg('a','a',.85,5), b=leg('b','b',.68,4.5);
  const opposed=leg('opp','a',.9,15,{marketKey:'a'});
  const other=leg('c','c',.64,1.8);
  const result=findNbaJackpot([a,b,opposed,other]);
  assert.equal(result.limited,false);
  assert.deepEqual(result.ticket.legs.map(x=>x.key).sort(),['b','opp']);
  assert.ok(Math.abs(result.ticket.chance-.9*.68)<1e-12);
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
  const one=leg('p1','one',.65,5,{player:'1',team:'ATL',date,stat:'Points',line:8.5,side:'Over'});
  const two=leg('p2','one',.65,5.5,{player:'2',team:'ATL',date,stat:'Rebounds',line:4.5,side:'Over'});
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

test('game lines cannot qualify a ticket or outrank a qualifying player-prop ticket',()=>{
  const a=leg('a','a',.65,5), b=leg('b','b',.60,4.5);
  const gameLines=['Moneyline','Spread','Total'].map(stat=>leg(stat,stat,.98,10,{kind:'game',stat}));
  assert.equal(findNbaJackpot([...gameLines,a]).ticket,null);
  assert.deepEqual(findNbaJackpot([...gameLines,a,b]).ticket.legs.map(x=>x.key).sort(),['a','b']);
});
