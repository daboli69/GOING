import test from 'node:test';
import assert from 'node:assert/strict';
import {assess,evaluate,defaults,shrunk,correlation,ticketRules,warnings,badWeather} from '../site/nfl-parlay-engine.mjs';
import {buildTicket,ticketMath} from '../site/parlay-core.mjs';
import {kickoff,playerRole} from '../site/nfl.mjs';

const now=Date.parse('2026-11-14T12:00:00Z');
const rank=(r,total=32)=>({rank:r,end:r,total});
const values=[80,66,71,90,40,75,62,85];
const row=(over={})=>({date:'2026-11-15',stat:'Receiving',opp:'DAL',home:false,avg:71,recentAvg:71.4,usage:74,projection:72.7,
  player:{id:'p1',name:'Test Receiver',team:'SF',pos:'WR'},game:{id:'2026_10_SF_DAL',iso:'2026-11-15T21:25:00.000Z',a:'SF',h:'DAL',sa:null,sh:null},
  quote:{line:60.5,over:-115,under:-105,provider:'Kalshi',capturedAt:'2026-11-14T11:30:00Z'},
  form:{season:values,last8:values,last5:values.slice(-5),venue:[80,71,40,62],home:[66,90,75,85],away:[80,71,40,62]},
  reads:[74,71,71,71,63,72.7,68],role:'outside WRs',
  defense:{rank:rank(30),value:.25,league:.08,label:'0.25 EPA and 9.8 yds per target, opponent-adjusted',role:'outside WRs',scale:.2},
  spread:3.5,script:-3,total:47.5,teamTotal:22,model:{p:.42,margin:-2},weather:{roof:'outdoors',wind:6,temp:55,rain:0},
  proe:.03,pace:64,leaguePace:62,share:.24,recentShare:.28,shareLabel:'Target share',snaps:.88,rzShare:.2,firstRate:.4,ryoe:null,
  cbRoom:8.4,cbLeague:7.2,cbOut:[],qbOut:null,olOut:[],rest:7,out:false,status:null,injuryReport:true,absences:[],...over});
const run=(o,side='Over',cfg=defaults)=>assess(row(o),side,cfg,{now,taken:new Set()});

test('a receiving Over against a weak defense for his role qualifies, with reasons from each data source',()=>{
  const leg=run();
  assert.equal(leg.cut,null);
  const text=leg.reasons.join(' | ');
  for(const part of ['DAL ranks 30/32 vs outside WRs','vs projection 72.7','Cleared 60.5 in 7 of 8 (last 8)','underdog by 3.0 (game script)',
    'Model: SF 42% to win','Snaps 88% L3','starting corners allow 8.4'])assert.ok(text.includes(part),part);
});

test('the ten-step checks remove the legs the spec says to remove',()=>{
  assert.equal(run({defense:{...row().defense,rank:rank(16)}}).cut,'Defense rank vs role','step 4: a middle-third defense is not enough');
  assert.equal(run({projection:58}).cut,'Line vs projection','step 5');
  assert.equal(run({form:{...row().form,last8:[40,50,55,62,70,58,59,61]}}).cut,'Last 8 hit rate','step 6');
  assert.equal(run({snaps:.42}).cut,'Snap share under 50%','step 7');
  assert.equal(run({weather:{roof:'outdoors',wind:18}}).cut,'Wind or rain','step 2');
  assert.equal(run({weather:{roof:'dome'}}).cut,null,'domes are never cut');
  assert.equal(run({weather:{roof:'outdoors',wind:18}},'Over',{...defaults,weather:false}).cut,null,'the weather cut can be turned off');
  assert.equal(run({out:true}).cut,'Player listed out');
  assert.equal(run({quote:{...row().quote,over:-900}}).cut,'Shrunk hit rate below the price','step 10');
  assert.equal(run({game:{...row().game,iso:'2026-11-14T11:00:00Z'}}).cut,'Game already started or kickoff time missing');
});

test('a hit rate that conflicts with the role edge removes the leg even with a low hit-rate floor',()=>{
  const leg=run({form:{...row().form,last8:[40,50,55,62,70,58,59,30]}},'Over',{...defaults,hit:0});
  assert.equal(leg.checks['Hit rate vs role'],'Hit rate conflicts with role edge');
});

test('questionable players are flagged to re-check after inactives, and flagged harder inside 90 minutes',()=>{
  const leg=assess(row({status:'Questionable'}),'Over',defaults,{now:Date.parse('2026-11-15T20:30:00Z'),taken:new Set()});
  assert.ok(leg.flags.includes('Questionable: re-check after inactives'));
  assert.ok(leg.flags.includes('Inactives are out now'));
});

test('context lowers passing-game scores when the QB or offensive line is out',()=>{
  const base=run().score;
  assert.ok(run({qbOut:'Starter'}).score<base);
  assert.ok(run({olOut:['A','B']}).score<base);
  assert.ok(run({cbOut:['Corner']}).score>base);
});

test('QB and receiver legs correlate; opposite sides warn; touchdown legs are limited',()=>{
  const qb={game:'g',team:'SF',player:'qb',stat:'Passing',side:'Over',name:'QB'}, wr={game:'g',team:'SF',player:'wr',stat:'Receiving',side:'Over',name:'WR'};
  assert.equal(correlation(qb,wr),1);
  assert.equal(correlation({...qb,side:'Under'},wr),-1);
  assert.equal(correlation(qb,{...wr,team:'DAL'}),0);
  assert.match(warnings([{...qb,side:'Under'},wr])[0],/^Negative correlation/);
  const rules=ticketRules({...defaults,stacks:true,tdMax:1});
  assert.equal(rules.sameGame(wr,[qb]),true);
  assert.equal(rules.sameGame({...wr,stat:'Rushing'},[qb]),false);
  assert.equal(rules.allow({stat:'Anytime TD'},[{stat:'First TD'}]),false);
});

test('the builder applies stacks and the touchdown limit',()=>{
  const legs=[{game:'g1',team:'SF',player:'qb',stat:'Passing',side:'Over',score:9,name:'QB'},{game:'g1',team:'SF',player:'wr',stat:'Receiving',side:'Over',score:8,name:'WR'},
    {game:'g2',team:'KC',player:'rb',stat:'Anytime TD',side:'Over',score:7},{game:'g3',team:'DET',player:'rb2',stat:'Anytime TD',side:'Over',score:6}];
  const pick=cfg=>buildTicket(legs,{...defaults,...cfg,legs:4},{rules:ticketRules({...defaults,...cfg})}).ticket.map(l=>l.player);
  assert.deepEqual(pick({}),['qb','rb']);
  assert.deepEqual(pick({stacks:true}),['qb','wr','rb']);
  assert.deepEqual(pick({stacks:true,tdMax:2}),['qb','wr','rb','rb2']);
});

test('hit rates shrink toward 50% harder than GOING UP',()=>{
  assert.equal(shrunk({hits:8,n:8}),16/24);
  const ticket=[{form:{season:{hits:8,n:8}},price:-110,game:'a'}];
  assert.ok(ticketMath(ticket,8).adjusted<ticketMath(ticket,5).adjusted);
  assert.equal(badWeather({roof:'outdoors',rain:.12}),true);
  assert.equal(badWeather({roof:'dome',wind:30}),false);
});

test('roles split receivers by where they are targeted and backs by how they are used',()=>{
  const logs=(o)=>[{targets:8,mid:1,air:110,rush:0,...o}];
  assert.equal(playerRole({pos:'WR',logs:logs({mid:3})}),'slot WRs (est.)');
  assert.equal(playerRole({pos:'WR',logs:logs({})}),'outside WRs');
  assert.equal(playerRole({pos:'RB',logs:[{targets:6,rush:10}]}),'receiving RBs');
  assert.equal(playerRole({pos:'RB',logs:[{targets:2,rush:18}]}),'rushing RBs');
});

test('kickoff converts Eastern clock times across daylight saving',()=>{
  assert.equal(kickoff('2026-11-15','13:00'),'2026-11-15T18:00:00.000Z');
  assert.equal(kickoff('2026-09-13','20:20'),'2026-09-14T00:20:00.000Z');
  assert.equal(kickoff('2026-11-15',''),null);
});

test('evaluate skips sides with no published price',()=>{
  const {screened}=evaluate([row({quote:{...row().quote,under:null}})],{...defaults,side:'Both'},{now});
  assert.deepEqual(screened.map(l=>l.side),['Over']);
});

test('legs are graded from the play-by-play, with snap counts marking players who did not play',async()=>{
  const {gradeLeg,playerGame}=await import('../site/nfl-parlay-tracking.mjs');
  // [posteam,type,yards,yardline,qtr,secs,drive,result,tdTeam,tdPlayer,passer,receiver,rusher,air,yac,complete,...,sack at 28]
  const play=(o)=>{const p=Array(29).fill(null);Object.entries(o).forEach(([i,v])=>p[i]=v);return p;};
  const events=[play({0:'SF',1:'pass',2:12,10:'qb',11:'wr',15:1}),play({0:'SF',1:'pass',2:0,10:'qb',11:'wr',15:0}),
    play({0:'SF',1:'pass',2:-7,10:'qb',15:0,28:1}),play({0:'SF',1:'run',2:5,12:'rb'}),play({0:'SF',1:'pass',2:30,10:'qb',11:'wr',15:1,8:'SF',9:'wr'})];
  const {values}=playerGame(events,'wr');
  assert.deepEqual([values.Receiving,values.Receptions,values['Anytime TD'],values['First TD']],[42,2,1,1]);
  assert.deepEqual([playerGame(events,'qb').values['Pass Attempts'],playerGame(events,'qb').values.Passing],[3,42],'the sack is not a pass attempt');
  const game={sa:24,sh:20}, leg={player:'wr',name:'Test Receiver',stat:'Receiving',side:'Over',line:40.5,tip:'2026-11-15T18:00:00Z'};
  const later=Date.parse('2026-11-16T12:00:00Z');
  assert.equal(gradeLeg(leg,game,events,[['Test Receiver','WR',.9,0]],later).result,'won');
  assert.equal(gradeLeg({...leg,player:'x',name:'Benched'},game,events,[['Test Receiver','WR',.9,0]],later).result,'void');
  assert.equal(gradeLeg({...leg,player:'x',name:'Unknown'},game,events,undefined,later).result,undefined,'without snap counts, wait');
  assert.equal(gradeLeg(leg,{sa:null,sh:null},events,undefined,later).result,undefined,'not final yet');
});

test('play-by-play grading agrees with the archive game logs on real games',{skip:!(await import('node:fs')).existsSync(new URL('../site/data/nfl-2026.json',import.meta.url))&&'no local snapshot'},async()=>{
  const {readFileSync}=await import('node:fs');
  const {playerGame}=await import('../site/nfl-parlay-tracking.mjs');
  const archive=JSON.parse(readFileSync(new URL('../site/data/nfl-2026.json',import.meta.url),'utf8'));
  const [id,events]=Object.entries(archive.events).at(-1);
  const receivers=[...new Set(events.filter(p=>p[1]==='pass'&&p[11]).map(p=>p[11]))];
  for(const r of receivers.slice(0,5)){
    const yards=events.filter(p=>p[1]==='pass'&&p[11]===r&&p[15]).reduce((a,p)=>a+p[2],0);
    assert.equal(playerGame(events,r).values.Receiving,yards,id+' '+r);
  }
});

test('touchdown props shrink toward their price, not toward 50%',()=>{
  const td=row({stat:'Anytime TD',quote:{line:.5,over:567,under:null,provider:'Kalshi',capturedAt:'2026-11-14T11:30:00Z'},projection:null,reads:[],
    form:{season:[0,0,0,0,0],last8:[0,0,0,0,0],last5:[0,0,0,0,0],venue:[0,0],home:[0,0,0],away:[0,0]}});
  const leg=assess(td,'Over',{...defaults,hit:0},{now,taken:new Set()});
  assert.ok(leg.chance<.15,'0 for 5 stays below the 15% price');
  assert.equal(leg.checks.Value,'Shrunk hit rate below the price');
});
