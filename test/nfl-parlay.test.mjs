import test from 'node:test';
import assert from 'node:assert/strict';
import {assess,buildNflTicket,evaluate,defaults,shrunk,correlation,ticketRules,warnings,badWeather} from '../site/nfl-parlay-engine.mjs';
import {buildTicket,ticketMath,legKey} from '../site/parlay-core.mjs';
import {buildSameGame,defenseProfiles,evaluateSameGame,sgpDefaults,similarDefenseGames} from '../site/nfl-sgp-engine.mjs';
import {kickoff,playerRole} from '../site/nfl.mjs';
import {nflInjuryContext,refreshNflAvailability} from '../site/nfl-availability.mjs';
import {mergeSleeperNfl,nflReplacementGames,nflWorkload,parseSleeperNfl} from '../site/nfl-workload.mjs';

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

test('game-day inactives override an earlier questionable report and stay scoped to that matchup',async()=>{
  const checkTime=Date.parse('2026-11-15T16:40Z');
  const game={id:'week10',a:'SF',h:'DAL',espn:'123',date:'2026-11-15',time:'13:00'};
  const dated='2026-11-15T16:35Z',name='Test Receiver';
  const league={timestamp:dated,injuries:[{displayName:'SF',injuries:[{athlete:{displayName:name},status:'Questionable'}]}]};
  const gamecast={header:{competitions:[{id:'123'}]},injuries:[{team:{abbreviation:'SF'},injuries:[
    {athlete:{displayName:name},date:dated,status:'Out',details:{fantasyStatus:{abbreviation:'INACTIVE'}}},
    {athlete:{displayName:'Last Week'},date:'2026-11-08T16:35Z',status:'Out',details:{fantasyStatus:{abbreviation:'INACTIVE'}}}
  ]}]};
  const availability=await refreshNflAvailability([game],null,{now:checkTime,
    read:async url=>url.endsWith('/injuries')?league:gamecast});
  const context=fixture=>nflInjuryContext(availability,availability.teams,fixture,'SF','DAL',x=>x);
  assert.equal(context(game).report[0].status,'Inactive');
  assert.equal(context(game).report.length,1);
  assert.equal(context({...game,id:'week11'}).report[0].status,'Questionable');
  assert.equal(run({out:true,inactive:true}).cut,'Confirmed inactive');
  const unavailable=await refreshNflAvailability([game],availability,{now:checkTime+60000,read:async()=>null});
  assert.equal(unavailable,availability);
});

test('an injured lead back redistributes workload and older fantasy projections cannot override the shift',()=>{
  const game={id:'2026_10_KC_ATL',week:10,date:'2026-11-15',time:'13:00',a:'KC',h:'ATL'};
  const asOf=Date.parse('2026-11-15T16:40Z'),games=['g1','g2','g3','g4','g5'];
  const player=(id,name,rush)=>({id,name,pos:'RB',logs:games.map(game=>({game,rush,rushY:rush*4,targets:0}))});
  const [starter,backup,other]=[player('1','Lead Back',18),player('2','Next Back',3),player('3','Other Back',2)];
  const projections=(updated,week=10)=>parseSleeperNfl([{company:'rotowire',category:'proj',season_type:'regular',season:'2026',week,
    updated_at:updated,date:game.date,team:'KC',opponent:'ATL',player:{first_name:'Next',last_name:'Back',position:'RB'},
    stats:{rush_att:14,rush_yd:55,pts_ppr:16}}],2026,10,asOf);
  const current=projections(asOf-60000),old=projections(asOf-600000);
  const report=[{name:starter.name,status:'Inactive',date:'2026-11-15T16:35Z'}];
  const context=rows=>nflWorkload(game,'KC',[starter,backup,other],games,report,rows,asOf);
  const result=context(current).projection(backup,'Rushing',12);
  assert.ok(result.value>50);
  assert.equal(result.sleeper,55);
  assert.deepEqual(result.absences,[starter.name]);
  assert.equal(result.materialShift,true);
  assert.equal(result.opportunityKey,'rush');
  assert.equal(context(current).projection(backup,'Anytime TD',null).materialShift,true);
  assert.equal(context(current).projection(starter,'Rushing',72).out,true);
  const stale=context(old).projection(backup,'Rush Attempts',3);
  assert.equal(stale.sleeper,null);
  assert.ok(stale.value>3);
  assert.equal(mergeSleeperNfl(current,old),current);
  assert.equal(projections(asOf+1000),null);
  assert.equal(projections(asOf,11),null);
});

test('comparable games require a verified replacement appearance after the teammate had played for that team',()=>{
  const games=['too-early','first-together','comparable','teammate-played','missing-coverage','did-not-play','stat-conflict'];
  const starter={name:'Lead Receiver',logs:[{game:'first-together'},{game:'stat-conflict'}]};
  const player={name:'Next Receiver'};
  const offense=Array.from({length:11},(_,i)=>['Offensive player '+i,'WR',.8,0]);
  const backup=[player.name,'WR',.82,0], lead=[starter.name,'WR',.75,0];
  const snapsFor=game=>({
    'too-early':[...offense,backup], 'first-together':[...offense,backup,lead],
    comparable:[...offense,backup], 'teammate-played':[...offense,backup,lead],
    'missing-coverage':[backup], 'did-not-play':offense, 'stat-conflict':[...offense,backup]
  })[game];
  assert.deepEqual(nflReplacementGames(player,[starter.name],[starter,player],games,snapsFor),[{game:'comparable',snaps:.82}]);
});

test('a live role change can add a leg when comparable form supports it and removes an inactive leg',()=>{
  const backup=row({player:{id:'backup',name:'Next Receiver',team:'SF',pos:'WR'},
    form:{season:[14,20,24,8],last8:[14,20,24,8],last5:[14,20,24,8],venue:[14,20,24],home:[8],away:[14,20,24]},
    reads:[15,20,60],snaps:.27,workload:{usageShift:true,absences:['Test Receiver']}});
  const comparable=[80,70,90,82].map((value,i)=>({value,home:i===0,snaps:.85}));
  const rank=rows=>buildTicket(evaluate(rows,defaults,{now}).eligible,defaults,{rules:ticketRules(defaults)}).ticket.map(l=>l.name);
  assert.deepEqual(rank([row(),backup]),['Test Receiver']);
  assert.deepEqual(rank([row({out:true}),{...backup,replacement:{games:comparable}}]),['Next Receiver']);
  const changed=assess({...backup,replacement:{games:comparable}},'Over',defaults,{now,taken:new Set()});
  assert.equal(changed.context.formSource,'comparable-role');
  assert.equal(changed.form.season.n,4);
  assert.equal(changed.form.venue.n,3);
  assert.match(changed.reasons.join(' '),/4 games without Test Receiver/);
  const small=assess({...backup,replacement:{games:comparable.slice(0,3)}},'Over',defaults,{now,taken:new Set()});
  assert.equal(small.cut,'Last 8 hit rate');
  assert.equal(small.context.formSource,'full-season');
  assert.ok(small.flags.includes('Limited comparable-role history'));
  const expensive=assess({...backup,quote:{...backup.quote,over:-525},replacement:{games:comparable}},'Over',defaults,{now,taken:new Set()});
  assert.equal(expensive.cut,'Shrunk hit rate below the price');
});

test('a promoted back cannot qualify from backup numbers, and a supported role can still qualify for an Under',()=>{
  const backupHistory=[16,21,14,17,15,24,33,101], starterOut=['Lead Back'];
  const o={stat:'Rushing',player:{id:'promotion',name:'Next Back',team:'SF',pos:'RB'},
    quote:{...row().quote,line:89.5},projection:80,reads:[16,21,19,47,80],
    form:{season:backupHistory,last8:backupHistory,last5:backupHistory.slice(-5),venue:backupHistory,home:[],away:backupHistory},
    defense:{...row().defense,rank:rank(4),role:'rushing RBs'},
    workload:{usageShift:true,materialShift:true,absences:starterOut},
    replacement:{games:[{value:101,home:false,snaps:.79,opportunities:22}]}};
  assert.equal(run({...o,workload:{...o.workload,materialShift:false}},'Under').cut,null,'backup form used to pass');
  for(const side of ['Under','Over']){
    const leg=run(o,side,{...defaults,hit:0,sample:1});
    assert.equal(leg.cut,'Too few comparable workload games');
    assert.equal(leg.chance,null);
    assert.equal(leg.context.formSource,'limited-role');
    assert.equal(leg.form.season.hits,side==='Under'?0:1);
    assert.equal(leg.form.season.n,1);
  }
  const games=[66,75,78,82].map(value=>({value,home:false,snaps:.78}));
  const qualified=run({...o,replacement:{games}},'Under');
  assert.equal(qualified.cut,null);
  assert.equal(qualified.context.formSource,'comparable-role');
  assert.equal(qualified.form.season.hits,4);
  assert.equal(run({...o,replacement:{games}},'Under',{...defaults,sample:5}).cut,'Too few comparable workload games');
});

test('NFL tickets rank by estimated chance and mix sides with the existing game and TD caps',()=>{
  const prop=(player,game,side,chance,score,stat='Rushing')=>({player,game,side,chance,score,stat});
  const rows=[prop('a','1','Under',.90,1,'Anytime TD'),prop('b','2','Under',.89,2,'Anytime TD'),
    prop('c','2','Under',.80,2),prop('d','3','Under',.75,7),prop('e','3','Over',.67,1),prop('f','1','Over',.65,9)];
  const cfg={...defaults,legs:3};
  assert.deepEqual(buildNflTicket(rows,cfg).ticket.map(x=>x.player),['a','c','e']);
  assert.deepEqual(buildNflTicket(rows,{...cfg,side:'Under'}).ticket.map(x=>x.player),['a','c','d']);
  assert.deepEqual(buildNflTicket(rows,cfg,{locked:[legKey(rows[0])]}).ticket.map(x=>x.player),['a','c','e']);
});

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
  assert.ok(leg.flags.includes('Game-day inactives pending'));
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

test('same-game screening supports an Under against a strong defense and withholds stale or unavailable legs',()=>{
  const low=[30,32,45,39,40,35,42,46];
  const under=row({projection:43,
    form:{season:low,last8:low,last5:low.slice(-5),venue:low.slice(-4),home:low.slice(0,4),away:low.slice(-4)},
    reads:[42,40,43],defense:{...row().defense,rank:rank(3),value:.04},
    sgpComparisons:[{value:38},{value:36},{value:44}]});
  const fresh=evaluateSameGame([under],sgpDefaults,{now});
  assert.deepEqual(fresh.eligible.map(leg=>leg.side),['Under']);
  assert.equal(fresh.eligible[0].sgp.comparable.hits,3);
  assert.match(fresh.eligible[0].reasons.join(' · '),/3\/3 vs similar defenses/);
  const stale={...under,quote:{...under.quote,capturedAt:'2026-11-14T09:00:00Z'}};
  assert.equal(evaluateSameGame([stale],sgpDefaults,{now}).eligible.length,0);
  assert.equal(evaluateSameGame([{...under,out:true}],sgpDefaults,{now}).eligible.length,0);
  assert.equal(evaluateSameGame([under],{...sgpDefaults,side:'Over'},{now}).eligible.length,0);
});

test('comparable-defense support opens its own pool without changing the main parlay screen',()=>{
  const candidate=row({defense:{...row().defense,rank:rank(16)},
    sgpComparisons:[{value:76},{value:82},{value:70}]});
  const cfg={...sgpDefaults,side:'Over'};
  assert.equal(evaluate([candidate],cfg,{now}).eligible.length,0);
  assert.equal(evaluateSameGame([candidate],cfg,{now}).eligible.length,1);
  candidate.sgpComparisons=[{value:10},{value:32},{value:50}];
  assert.equal(evaluateSameGame([candidate],cfg,{now}).screened[0].cut,'Similar-defense results conflict');
});

test('similar-defense profiles never use the comparison game or a future game to characterize the opponent',()=>{
  const game=(id,d,a,h)=>({id,date:'2026-10-'+d,a,h});
  const schedule=[game('a1','01','CLE','NYG'),game('a2','02','CIN','NYG'),game('a3','03','MIN','NYG'),
    game('b1','04','SEA','DAL'),game('b2','05','CHI','DAL'),game('b3','06','BUF','DAL'),
    game('older','11','SF','NYG'),game('future','22','GB','NYG')];
  const events=Object.fromEntries(schedule.map(g=>[g.id,Array.from({length:20},()=>{
    const p=[g.a,'run',g.id==='older'||g.id==='future'?50:4];
    p[12]='back';
    return p;
  })]));
  const profiles=defenseProfiles(schedule,events,{});
  const input={date:'2026-10-21',opp:'DAL',stat:'Rushing',player:{team:'SF',pos:'RB',logs:[{game:'older',rushY:53}]}};
  assert.deepEqual(similarDefenseGames(profiles,input,'rushY'),[{opponent:'NYG',date:'2026-10-11',value:53,distance:0,profile:{kind:'rush',target:[4,1,0],past:[4,1,0]}}]);
  assert.equal(profiles.before('NYG','2026-10-03','rush'),null);
  assert.notDeepEqual(profiles.before('NYG','2026-10-23','rush'),profiles.before('DAL','2026-10-23','rush'));
});

test('same-game tickets keep their game, use distinct players and avoid opposed passing legs',()=>{
  const leg=(player,stat,side,score,game='SF_DAL')=>({date:'2026-11-15',game,team:'SF',player,stat,side,score,line:30});
  const qb=leg('QB','Passing','Over',9), receiver=leg('WR','Receiving','Under',8);
  const duplicate=leg('WR','Receptions','Under',7), rb=leg('RB','Rushing','Over',6);
  const te=leg('TE','Receiving','Over',5), other=leg('other','Passing','Over',9,'PIT_BAL');
  const cfg={...sgpDefaults,legs:3};
  const options=[qb,receiver,duplicate,rb,te,other];
  const {ticket}=buildSameGame(options,cfg);
  assert.equal(ticket.length,3);
  assert.deepEqual(new Set(ticket.map(l=>l.game)),new Set(['SF_DAL']));
  assert.equal(new Set(ticket.map(l=>l.player)).size,3);
  const locked=buildSameGame(options,cfg,{locked:[legKey(qb)]});
  assert.deepEqual(locked.ticket.map(l=>l.player),['QB','RB','TE']);
  assert.equal(buildSameGame(options,cfg,{locked:[legKey(qb),legKey(receiver)]}).invalidLock,true);
});
