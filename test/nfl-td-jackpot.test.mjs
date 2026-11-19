import test from 'node:test';
import assert from 'node:assert/strict';
import {jackpotCandidates,jackpotPrice,jackpotTickets,sundayBeforeKickoff,tdDefenseProfile} from '../site/nfl-td-jackpot.mjs';

const now=Date.parse('2026-11-21T18:00Z');
const sunday={id:'2026_11_BUF_MIA',date:'2026-11-22',time:'20:20',a:'BUF',h:'MIA'};
const row=(id,game=sunday,anytime=.3)=>({id,p:{name:'Player '+id},team:game.a,game,anytime});
const fixture=(id)=>({...sunday,id,a:'Away '+id,h:'Home '+id});
const quote=(p,patch={})=>({date:p.game.date,a:p.game.a,h:p.game.h,player:p.p.name,market:'Anytime TD',line:.5,
  over:'+200',provider:'Kalshi',capturedAt:'2026-11-21T17:30Z',...patch});

test('jackpot uses Eastern Sunday before kickoff and excludes inactive or closed games',()=>{
  assert.ok(sundayBeforeKickoff(sunday,now)); // Sunday night kickoff falls on Monday UTC.
  assert.equal(sundayBeforeKickoff(sunday,Date.parse('2026-11-23T01:20Z')),false);
  assert.equal(sundayBeforeKickoff({...sunday,date:'2026-11-23'},now),false);
  assert.equal(sundayBeforeKickoff({...sunday,status:'Postponed'},now),false);
  const rows=jackpotCandidates([row('a'),{...row('b'),status:'Out'},{...row('c'),status:'Questionable'}],[],{},now);
  assert.deepEqual(rows.map(x=>x.id),['a','c']);
});

test('source prices require the exact fixture, timestamp and anytime scoring line',()=>{
  const p=row('a');
  const bad=[quote(p,{capturedAt:'2026-11-21T15:30Z'}),quote(p,{capturedAt:'2026-11-21T18:01Z'}),
    quote(p,{h:'NYJ'}),quote(p,{id:'wrong'}),quote(p,{line:1.5}),quote(p,{market:'First TD'})];
  let [candidate]=jackpotCandidates([p],bad,{},now);
  assert.equal(candidate.reference,null);
  assert.equal(candidate.fanatics,null);
  [candidate]=jackpotCandidates([p],[quote(p),quote(p,{provider:'Fanatics Sportsbook',over:'+175'})],{},now);
  assert.equal(candidate.reference.over,'+200');
  assert.equal(candidate.fanatics.over,'+175');
  [candidate]=jackpotCandidates([p],[quote(p)],{[p.game.id+'|a']:'+240'},now);
  assert.deepEqual(candidate.fanatics,{over:240,entered:true});
  const collision={...p,id:'other'};
  assert.ok(jackpotCandidates([p,collision],[quote(p)],{},now).every(r=>r.reference==null));
  const exact=jackpotCandidates([p,collision],[quote(p,{id:p.id})],{},now);
  assert.equal(exact.find(r=>r.id===p.id).reference.over,'+200');
  assert.equal(jackpotPrice('200oops'),null);
  assert.equal(jackpotPrice('+99'),null);
});

test('tickets take exactly three unique players and games, clear +2000 and never mix sources',()=>{
  const odds=(p,over)=>({...p,fanatics:{over}});
  const picks=[
    odds(row('a',fixture('1'),.5),'+200'),
    odds(row('same game',fixture('1'),.9),'+1000'),
    odds(row('b',fixture('2')),'+100'),
    odds(row('c',fixture('3')),'+250'),
    {...row('ref',fixture('4')),reference:{over:'+1000'}},
    {...odds(row('questionable',fixture('5'),.9),'+1000'),status:'Questionable'}
  ];
  const tickets=jackpotTickets(picks,'fanatics');
  assert.deepEqual(tickets.map(t=>t.legs.map(l=>l.row.id)),[['same game','b','c'],['a','b','c']]);
  assert.equal(tickets[1].decimal,21);
  assert.equal(jackpotTickets([picks[0],picks[2],odds(row('c',fixture('3')),'+249')],'fanatics').length,0);
  assert.equal(jackpotTickets([picks[0],picks[2],odds(row('a',fixture('3')),'+250')],'fanatics').length,0);
  assert.equal(jackpotTickets(picks,'reference').length,0);
});

test('defensive weakness counts only earlier completed offensive TDs and keeps receiving roles distinct',()=>{
  const g={...sunday,week:10,sa:14,sh:0};
  const old={...g,id:'2026_09_BUF_MIA',week:9},older={...old,id:'2026_08_BUF_MIA',week:8};
  const upcoming={...g,id:'2026_12_BUF_MIA',week:12};
  const td=(t,type,yards,id,defense=false)=>Object.assign([],{0:t,1:type,3:yards,8:t,9:id,22:defense});
  const plays=[td('BUF','pass',12,'1'),td('BUF','run',5,'2'),td('BUF','run',4,'2',true)];
  const {teams,ranked}=tdDefenseProfile([g,old,older,upcoming],{[g.id]:plays,[old.id]:plays,[older.id]:plays,[upcoming.id]:plays},{1:['Receiver','TE'],2:['Runner','RB']},2026,11);
  assert.equal(ranked,2);
  const allowed=teams.get('MIA');
  assert.equal(allowed.games,3);
  assert.deepEqual(allowed.counts,{rush:3,goalLine:3,pass:3,redZonePass:3,RB:0,WR:0,TE:3});
  assert.equal(allowed.metrics.TE.rank,1);
  assert.equal(teams.get('BUF').counts.pass,0);
});
