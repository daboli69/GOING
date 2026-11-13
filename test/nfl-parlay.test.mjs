import test from 'node:test';
import assert from 'node:assert/strict';
import {assess,evaluate,defaults,blended} from '../site/nfl-parlay-engine.mjs';
import {buildTicket} from '../site/parlay-core.mjs';
import {kickoff} from '../site/nfl.mjs';

const now=Date.parse('2026-11-14T12:00:00Z');
const rank=(r,total=32)=>({rank:r,end:r,total});
const row=(over={})=>({date:'2026-11-15',stat:'Receiving',opp:'DAL',home:false,avg:72,
  player:{id:'p1',name:'Test Receiver',team:'SF',pos:'WR'},game:{id:'2026_10_SF_DAL',iso:'2026-11-15T21:25:00.000Z',a:'SF',h:'DAL',sa:null,sh:null},
  quote:{line:60.5,over:-115,under:null,provider:'Kalshi',capturedAt:'2026-11-14T11:30:00Z'},
  form:{season:[80,66,71,90,40,75,62,85],last5:[90,40,75,62,85],last3:[75,62,85],venue:[80,71,40,62],home:[66,90,75,85],away:[80,71,40,62]},
  reads:[74,70,72,63,68],role:'deep WRs',roleRank:rank(30),roleAllowed:120,roleLeague:95,epaRank:rank(28),epaKind:'pass',
  spread:3.5,teamSpread:3.5,total:47.5,teamTotal:22,model:{p:.42,margin:-2},wind:null,temp:null,share:.24,recentShare:.28,shareLabel:'Target share',
  redZone:1.2,firstRate:.4,out:false,uncertain:null,injuryReport:true,absences:[],...over});

test('a strong receiving Over qualifies, with reasons from every data source',()=>{
  const leg=assess(row(),'Over',defaults,{now,taken:new Set()});
  assert.equal(leg.cut,null);
  assert.ok(leg.score>0);
  const text=leg.reasons.join(' | ');
  for(const part of ['Hit 7/8','Line 60.5 vs avg 72.0','DAL ranks 30/32 in yards allowed to deep WRs','underdog by 3.5','Model: SF 42% to win'])assert.ok(text.includes(part),part);
});

test('legs are cut by the same kinds of checks as GOING UP',()=>{
  const cut=(o,side='Over',cfg=defaults)=>assess(row(o),side,cfg,{now,taken:new Set()}).cut;
  assert.equal(cut({roleRank:rank(2)}),'Defense rank vs role','a defense in the stingy third removes an Over');
  assert.equal(cut({form:{...row().form,season:[80,66,71]}}),'Too few games played');
  assert.equal(cut({out:true}),'Player listed out');
  assert.equal(cut({spread:13}),'Maximum spread');
  assert.equal(cut({quote:{...row().quote,line:95.5}}),'Season or L5 hit rate');
  assert.equal(cut({game:{...row().game,iso:'2026-11-14T11:00:00Z'}}),'Game already started or kickoff time missing');
  assert.equal(cut({quote:{...row().quote,over:-900}}),'Hit rate below the price','a 7/8 hit rate does not justify a 90% price');
});

test('wind and a cold forecast count against passing-game Overs',()=>{
  const calm=assess(row(),'Over',defaults,{now,taken:new Set()}), windy=assess(row({wind:22,temp:18}),'Over',defaults,{now,taken:new Set()});
  assert.ok(windy.score<calm.score);
  assert.deepEqual(windy.flags,['Wind 22 mph','18°F']);
});

test('TD props use scoring rate against the price, and sides without a price are skipped',()=>{
  const td=row({stat:'Anytime TD',quote:{line:.5,over:-150,under:null,provider:'Kalshi',capturedAt:'2026-11-14T11:30:00Z'},avg:.9,
    form:{season:[1,1,0,2,1,1,0,1],last5:[2,1,1,0,1],last3:[1,0,1],venue:[1,0,1,0],home:[1,2,1,1],away:[1,0,1,0]},reads:[],role:'WRs',teamTotal:27});
  const {eligible,screened}=evaluate([td],{...defaults,side:'Both'},{now});
  assert.equal(screened.length,1,'no Under price, so no Under leg');
  assert.equal(eligible.length,1);
  assert.ok(eligible[0].reasons.includes('Team total 27.0'));
});

test('tickets take one leg per game and the best score first',()=>{
  const a=row(), b=row({player:{id:'p2',name:'Second',team:'SF',pos:'WR'}}), c=row({player:{id:'p3',name:'Third',team:'KC',pos:'WR'},game:{...row().game,id:'g2'}});
  const {eligible}=evaluate([a,b,c],{...defaults,legs:3},{now});
  const {ticket}=buildTicket(eligible,{...defaults,legs:3});
  assert.equal(ticket.length,2);
  assert.equal(new Set(ticket.map(l=>l.game)).size,2);
});

test('blended chance pulls small samples toward the price',()=>{
  assert.equal(blended(4,4,.5),.5+(1-.5)*4/10);
  assert.equal(blended(0,0,.6),.6);
});

test('kickoff converts Eastern clock times across daylight saving',()=>{
  assert.equal(kickoff('2026-11-15','13:00'),'2026-11-15T18:00:00.000Z');
  assert.equal(kickoff('2026-09-13','20:20'),'2026-09-14T00:20:00.000Z');
  assert.equal(kickoff('2026-11-15',''),null);
});
