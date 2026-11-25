import test from 'node:test';
import assert from 'node:assert/strict';
import {findJackpotTickets,jackpotCandidates,jackpotLegKey,jackpotLegs,jackpotPrice,jackpotReplacements,jackpotTicketKey,jackpotBeforeKickoff,jackpotSlates,tdDefenseProfile} from '../site/nfl-td-jackpot.mjs';

import {tdBoardData} from '../site/nfl.mjs';
import {tdJackpotAction,tdJackpotPage} from '../site/nfl-td-jackpot-page.mjs';
import {current as S} from '../site/ui.mjs';

const jackpotTickets=(rows,source)=>findJackpotTickets(jackpotLegs(rows,source));
const now=Date.parse('2026-11-21T18:00Z');
const sunday={id:'2026_11_BUF_MIA',date:'2026-11-22',time:'20:20',a:'BUF',h:'MIA'};
const row=(id,game=sunday,anytime=.3)=>({id,p:{name:'Player '+id},team:game.a,game,anytime});
const fixture=(id)=>({...sunday,id,a:'Away '+id,h:'Home '+id});
const quote=(p,patch={})=>({date:p.game.date,a:p.game.a,h:p.game.h,player:p.p.name,market:'Anytime TD',line:.5,
  over:'+200',provider:'Kalshi',capturedAt:'2026-11-21T17:30Z',...patch});

test('jackpot uses Eastern Sunday before kickoff and excludes inactive or closed games',()=>{
  assert.ok(jackpotBeforeKickoff(sunday,now)); // Sunday night kickoff falls on Monday UTC.
  assert.equal(jackpotBeforeKickoff(sunday,Date.parse('2026-11-23T01:20Z')),false);
  assert.equal(jackpotBeforeKickoff({...sunday,date:'2026-11-23'},now),false);
  assert.equal(jackpotBeforeKickoff({...sunday,status:'Postponed'},now),false);
  const rows=jackpotCandidates([row('a'),{...row('b'),status:'Out'},{...row('c'),status:'Questionable'}],[],{},now);
  assert.deepEqual(rows.map(x=>x.id),['a','c']);
});

const thanksgiving=[
  {id:'2026_12_CHI_DET',date:'2026-11-26',time:'13:00',a:'CHI',h:'DET'},
  {id:'2026_12_PHI_DAL',date:'2026-11-26',time:'16:30',a:'PHI',h:'DAL'},
  {id:'2026_12_KC_BUF',date:'2026-11-26',time:'20:20',a:'KC',h:'BUF'}
];
const beforeThanksgiving=Date.parse('2026-11-25T18:00Z');
const thursdayQuote=(p,i)=>quote(p,{over:i===2?'+175':'+100',capturedAt:'2026-11-25T17:30Z'});

test('Thursday includes all three Thanksgiving games and uses Eastern kickoff boundaries',()=>{
  const thursday=thanksgiving.map((game,i)=>row('thursday'+i,game));
  const sundayRow=row('sunday',{...sunday,date:'2026-11-29'});
  const fridayRow=row('friday',{...sunday,date:'2026-11-27'});
  const rows=[...thursday,sundayRow,fridayRow];
  assert.deepEqual(jackpotCandidates(rows,[],{},beforeThanksgiving,'Thursday').map(r=>r.id),thursday.map(r=>r.id));
  assert.deepEqual(jackpotCandidates(rows,[],{},beforeThanksgiving).map(r=>r.id),['sunday']);
  const thursdayNightInUtc=Date.parse('2026-11-27T01:20Z');
  assert.equal(jackpotBeforeKickoff(thanksgiving[2],thursdayNightInUtc-1,'Thursday'),true);
  assert.equal(jackpotBeforeKickoff(thanksgiving[2],thursdayNightInUtc,'Thursday'),false);
  assert.equal(jackpotBeforeKickoff({...thanksgiving[0],status:'Postponed'},beforeThanksgiving,'Thursday'),false);
  const quotes=thursday.map(thursdayQuote);
  const candidates=jackpotCandidates(rows,quotes,{},beforeThanksgiving,'Thursday');
  const eligible=jackpotLegs(candidates,'reference');
  const {minimumOdds}=jackpotSlates.Thursday;
  assert.equal(minimumOdds,1000);
  const [ticket]=findJackpotTickets(eligible,{minimumOdds});
  assert.equal(ticket.decimal,11);
  assert.equal(findJackpotTickets(eligible).length,0);
  assert.equal(findJackpotTickets(eligible.slice(1),{minimumOdds}).length,0);
  assert.equal(jackpotLegs(candidates,'fanatics').length,0);
  const substitutes=[{...row('replacement',thanksgiving[2]),reference:{over:'+175'}},
    {...row('below',thanksgiving[2]),reference:{over:'+174'}}];
  const original=ticket.legs.find(leg=>leg.row.game.id===thanksgiving[2].id);
  const replacements=jackpotReplacements(ticket,jackpotLegKey(original),jackpotLegs(substitutes,'reference'),minimumOdds);
  assert.deepEqual(replacements.map(x=>x.leg.row.id),['replacement']);
});

test('the jackpot page switches days without mixing drafts and labels Thursday as research',t=>{
  t.mock.method(Date,'now',()=>beforeThanksgiving);
  const old={...S};
  const thursday=thanksgiving.map((game,i)=>({...row('thursday'+i,game),counts:{},opp:game.h}));
  const other={...row('sunday',{...sunday,date:'2026-11-29'}),counts:{},opp:'MIA'};
  const quotes=thursday.map(thursdayQuote);
  try{
    Object.assign(S,{year:2026,week:12,route:{sport:'nfl'},f:{jackpotDay:'Thursday'},odds:quotes,data:{schedule:[]}});
    const html=tdJackpotPage({rows:[...thursday,other]});
    assert.match(html,/value="Thursday" selected/);
    assert.match(html,/Thursday research slate/);
    assert.match(html,/Thursday scorers/);
    assert.doesNotMatch(html,/Player sunday/);
    assert.match(html,/\+1000 estimated combined odds/);
    const draft=S.f.jackpotState.slates.Thursday;
    S.f.jackpotDay='Sunday';
    const sundayPage=tdJackpotPage({rows:[...thursday,other]});
    assert.match(sundayPage,/combined odds of \+2000 or higher/);
    assert.match(sundayPage,/Building a ticket requires three pregame Sunday games/);
    assert.match(sundayPage,/Player sunday/);
    assert.doesNotMatch(sundayPage,/Player thursday/);
    S.f.jackpotDay='Thursday';
    assert.match(tdJackpotPage({rows:thursday}),/\+1000 estimated combined odds/);
    assert.equal(S.f.jackpotState.slates.Thursday,draft);
    assert.equal(tdJackpotAction('tdJackpotRegenerate','["reference"]',{rows:thursday}),true);
    assert.match(tdJackpotPage({rows:thursday}),/player rules and \+1000 minimum/);
  }finally{Object.assign(S,old);}
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

test('blocking and regeneration exclude players or existing combinations from both price pools',()=>{
  const players=['a','b','c','d','e'].map(id=>({...row(id,fixture(id)),fanatics:{over:'+200'},reference:{over:'+200'}}));
  const prefs={blocked:new Set(['a'])};
  for(const source of ['fanatics','reference']){
    const pool=jackpotLegs(players,source,prefs);
    const initial=findJackpotTickets(pool,{limit:1});
    const keys=new Set(initial.map(t=>jackpotTicketKey(t.legs)));
    const newTickets=findJackpotTickets(pool,{skip:keys});
    assert.equal(newTickets.length,3);
    for(const ticket of newTickets){
      assert.ok(!keys.has(jackpotTicketKey(ticket.legs)));
      assert.ok(ticket.legs.every(leg=>leg.row.id!=='a'));
    }
  }
});

test('swap keeps two legs and only offers eligible players that preserve +2000',()=>{
  const p=(id,game,over,chance,status)=>({...row(id,fixture(game),chance),status,fanatics:{over}});
  const rows=[p('a','1',200,.7),p('b','2',200,.6),p('c','3',200,.5),p('value','4',250,.4),
    p('cheap','5',100,.4),p('same-game','2',250,.4),p('doubtful','6',250,.4,'Doubtful'),p('questionable','7',250,.4,'Questionable')];
  const pool=jackpotLegs(rows,'fanatics');
  const [ticket]=findJackpotTickets(pool);
  const old=jackpotLegKey(ticket.legs[2]);
  const choices=jackpotReplacements(ticket,old,pool);
  assert.deepEqual(choices.map(({leg,ticket})=>[leg.row.id,ticket.legs.map(l=>l.row.id)]),[['value',['a','b','value']]]);
  assert.equal(jackpotReplacements(ticket,old,jackpotLegs(rows,'fanatics',{minimum:.45})).length,0);
  const optIn=jackpotLegs(rows,'fanatics',{questionable:true});
  assert.ok(optIn.some(leg=>leg.row.id==='questionable'));
  assert.ok(!optIn.some(leg=>leg.row.id==='doubtful'));
});

test('TD Board gives the remaining rushers a larger share when official inactives override general injuries',()=>{
  const previous={...S};
  try{
    const team=sunday.a;
    const rush=(id,td=false)=>Object.assign([],{0:team,1:'run',3:3,6:1,7:'Touchdown',8:td?team:null,9:td?id:null,12:id});
    const past={...sunday,id:'2026_10_BUF_MIA',week:10,date:'2026-11-15',sa:20,sh:7};
    Object.assign(S,{route:{sport:'nfl'},year:2026,week:11,f:{},games:[{...sunday,total:45,spread:0}],extra:null,
      odds:[],models:null,weather:null,data:{
        schedule:[past],events:{[past.id]:[rush('starter'),rush('starter',true),rush('backup')]},
        players:{starter:['Lead Back','RB'],backup:['Backup Back','RB']}
      },
      injuries:{'Buffalo Bills':[{name:'Lead Back',status:'Questionable'}]},
      nflAvailability:null
    });
    const before=tdBoardData().rows.find(r=>r.id==='backup');
    S.nflAvailability={games:{[sunday.id]:{BUF:[{name:'Lead Back',status:'Inactive'}]}}};
    const refreshed=tdBoardData().rows;
    const after=refreshed.find(r=>r.id==='backup');
    assert.ok(!refreshed.some(r=>r.id==='starter'));
    assert.ok(after.anytime>before.anytime);
    assert.deepEqual(after.availability.missing.map(x=>x.name),['Lead Back']);
    assert.equal(after.availability.inactivesPosted,true);
  }finally{Object.assign(S,previous);}
});
