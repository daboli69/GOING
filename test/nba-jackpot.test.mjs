import test from 'node:test';
import assert from 'node:assert/strict';
import {findNbaJackpot,jackpotProps,nbaJackpotTicketKey} from '../site/nba-jackpot-engine.mjs';
import {nbaJackpotAction,nbaJackpotPage} from '../site/nba-jackpot-page.mjs';
import {current as S} from '../site/ui.mjs';

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
    const expected=[];
    for(let mask=1;mask<(1<<pool.length);mask++){
      const subset=pool.filter((_,i)=>mask&(1<<i));
      if(subset.length<2||new Set(subset.map(x=>x.game)).size<subset.length)continue;
      const price=subset.reduce((p,x)=>p*x.decimal,1), chance=subset.reduce((p,x)=>p*x.chance,1);
      if(price<21)continue;
      expected.push({chance,price,key:nbaJackpotTicketKey(subset)});
    }
    expected.sort((a,b)=>b.chance-a.chance||b.price-a.price);
    const actual=findNbaJackpot(pool,{count:3}).tickets.map(t=>nbaJackpotTicketKey(t.legs));
    assert.deepEqual(actual,expected.slice(0,3).map(t=>t.key));
    const more=findNbaJackpot(pool,{count:3,skip:new Set(actual)}).tickets.map(t=>nbaJackpotTicketKey(t.legs));
    assert.deepEqual(more,expected.slice(3,6).map(t=>t.key));
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

const results=[6,6,6,14,14,14,14,14,14,14];
function propRow(i){
  return {date,player:{id:String(i),name:'Player '+i,team:'ATL',pos:'SG'},game:{id:'game'+i,iso:tip,h:'ATL',status:'FUT'},
    stat:'Points',avg:11.6,opp:'BOS',spread:4,total:226,reads:[12],type:'A',typeRank:{rank:29,end:29,total:30},
    typeDeltas:[2,2,2,2,2,2],out:false,injuryReport:true,absences:[],
    form:{season:results,last10:results,last5:results.slice(-5),venue:results,home:results,away:[]},
    quote:{provider:'DraftKings',line:8.5,over:-110,under:-110,capturedAt:date+'T14:00Z'}};
}

test('player candidates reuse Suggested Parlays and apply a small, supported minutes adjustment',()=>{
  const row=propRow(1);
  const history=results.map((points,i)=>['prior'+i,'2026-11-'+String(i+1).padStart(2,'0'),'ATL','BOS','home',i<5?20:30,points]);
  const [adjusted]=jackpotProps([row],[],{1:history},now);
  const [base]=jackpotProps([row],[],{},now);
  assert.ok(adjusted.chance>base.chance&&adjusted.chance-base.chance<=.025);
  assert.match(adjusted.reasons.join(' '),/Recent minutes 30\.0 vs 20\.0/);
  assert.ok(adjusted.reasons.some(reason=>reason.includes('5/5 at similar minutes')));
  assert.deepEqual(jackpotProps([{...row,out:true}],[],{1:history},now),[]);
  assert.deepEqual(jackpotProps([{...row,uncertain:'Questionable'}],[],{1:history},now),[]);
});

function milestone(i){
  const row=propRow(i);
  return {...row,quote:{...row.quote,line:5.5,milestone:6,over:-170,under:null}};
}

test('a seven-leg builder ticket can reach the minimum from verified quotes even when main lines are missing',()=>{
  const alternates=Array.from({length:7},(_,i)=>milestone(i+1));
  const eligible=jackpotProps([],alternates,{},now);
  assert.equal(eligible.length,7);
  assert.ok(eligible.every(leg=>leg.milestone===6&&leg.side==='Over'&&leg.price===-170));
  const ticket=findNbaJackpot(eligible).ticket;
  assert.equal(ticket.legs.length,7);
  assert.ok(ticket.decimal>=21);
  assert.equal(findNbaJackpot(eligible.slice(1)).ticket,null);
  const unverified={...alternates[0],quote:{...alternates[0].quote,milestone:null}};
  assert.deepEqual(jackpotProps([],[unverified],{},now),[]);
});

test('the jackpot regenerates after blocking an exact leg or whole player and restores blocks after reload',t=>{
  const previous={day:S.day,route:S.route,f:S.f}, stored=new Map();
  const localStorageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)}});
  t.after(()=>{
    Object.assign(S,previous);
    if(localStorageDescriptor)Object.defineProperty(globalThis,'localStorage',localStorageDescriptor);
    else delete globalThis.localStorage;
  });
  Object.assign(S,{day:date,route:{sport:'nba'},f:{}});
  const alternates=Array.from({length:8},(_,i)=>milestone(i+1));
  const render=()=>nbaJackpotPage({rows:[],alternates,logs:{}},now);
  assert.match(render(),/7 legs/);
  assert.match(render(),/Alternative tickets/);
  const [first]=jackpotProps([],alternates,{},now);
  const shown=html=>html.split('Best estimated +2000 parlay')[1];
  assert.match(shown(render()),/Player 1 Over 5\.5 Points/);
  assert.equal(nbaJackpotAction('nbaJackpotBlockLeg',JSON.stringify([first.key,'Player 1 Over 5.5 Points'])),true);
  assert.match(render(),/Unblock Player 1 Over 5\.5 Points/);
  assert.doesNotMatch(shown(render()),/Player 1 Over/);
  S.f={};
  assert.doesNotMatch(shown(render()),/Player 1 Over/);
  nbaJackpotAction('nbaJackpotBlockPlayer','["2","Player 2"]');
  assert.match(render(),/No complete \+2000 ticket/);
  nbaJackpotAction('nbaJackpotUnblockLeg',first.key);
  assert.match(shown(render()),/Player 1 Over/);
  assert.doesNotMatch(shown(render()),/Player 2 Over/);
  nbaJackpotAction('nbaJackpotClear','');
  assert.doesNotMatch(render(),/Clear all blocks/);
});

test('game lines cannot qualify a ticket or outrank a qualifying player-prop ticket',()=>{
  const a=leg('a','a',.65,5), b=leg('b','b',.60,4.5);
  const gameLines=['Moneyline','Spread','Total'].map(stat=>leg(stat,stat,.98,10,{kind:'game',stat}));
  assert.equal(findNbaJackpot([...gameLines,a]).ticket,null);
  assert.deepEqual(findNbaJackpot([...gameLines,a,b]).ticket.legs.map(x=>x.key).sort(),['a','b']);
});
