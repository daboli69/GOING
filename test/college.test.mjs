import test from 'node:test';
import assert from 'node:assert/strict';
import {collegeScoreboard,collegeResultRow,fetchCollegeResults,csvObjects,basketballPlayers} from '../scripts/college-feeds.mjs';
import {collegeHistory,collegeForecast,collegePicks,collegeCaptureKey,collegeSettlement,collegeSeason} from '../site/college-core.mjs';
import {collegePage} from '../site/college.mjs';
import {current as S} from '../site/ui.mjs';
import {blank,add,roi} from '../site/track-core.mjs';

const away={id:'1',name:'Away U',code:'AU'},home={id:'2',name:'Home U',code:'HU'};
const espnTeam=(t,homeAway)=>({homeAway,team:{id:t.id,abbreviation:t.code,displayName:t.name},score:'0'});
const status=(name,state,completed=false)=>({type:{name,state,completed}});
const event={id:'100',date:'2026-11-14T02:00Z',competitions:[{
  neutralSite:true,competitors:[espnTeam(home,'home'),espnTeam(away,'away')],
  status:status('STATUS_SCHEDULED','pre'),odds:[{provider:{name:'Example'},
    pointSpread:{away:{close:{line:'+3.5',odds:'+105'}},home:{close:{line:'-3.5',odds:'-115'}}},
    moneyline:{home:{close:{odds:'-145'}},away:{open:{odds:'+130'}}},
    overUnder:55,total:{over:{close:{odds:'-110'}},under:{close:{odds:'-110'}}}}]
}]};

test('college scoreboard uses ESPN IDs, Eastern dates, and signed team quotes from scheduled FBS games',()=>{
  const [g]=collegeScoreboard({events:[event]},'fbs');
  assert.equal(g.date,'2026-11-13');
  assert.deepEqual(g.away,away);
  assert.equal(g.neutral,true);
  assert.equal(g.aScore,null);
  assert.deepEqual(g.market.spread.home,{line:-3.5,odds:-115});
  assert.equal(g.market.moneyline.away,null);
  assert.equal(collegeScoreboard({events:[event]},'cwb')[0].market,null);
  const done=structuredClone(event);
  done.competitions[0].status=status('STATUS_FINAL','post',true);
  const [f]=collegeScoreboard({events:[done]},'fbs');
  assert.equal(f.status,'final');
  assert.equal(f.market,null);
  const tbd=structuredClone(event);
  tbd.competitions[0].timeValid=false;
  assert.equal(collegeScoreboard({events:[tbd]},'fbs')[0].status,'other');
});

test('baselines withhold small samples and home adjustment is absent at a neutral site',()=>{
  const games=Array.from({length:3},(_,i)=>({id:String(i),start:`2026-11-0${i+1}T12:00:00Z`,away,home,aScore:71,hScore:82,
    aBox:{pace:70,fg3:10,fga3:25},hBox:{pace:70}}));
  assert.equal(collegeForecast({away,home},collegeHistory(games.slice(0,2))),null);
  const history=collegeHistory(games),neutral=collegeForecast({away,home,neutral:true},history);
  assert.equal(history.teams[away.id].threes,0.4);
  assert.equal(history.teams[home.id].threes,null);
  assert.ok(collegeForecast({away,home},history).pHome>neutral.pHome);
  assert.equal(collegeSeason('fbs','2027-01-07'),2026);
  assert.equal(collegeSeason('cwb','2026-11-13'),2027);
});

test('CBB winner forecasts surface the pick and distinguish short samples, even games, and closed pregame windows',t=>{
  const day='2026-11-24',now=Date.parse(day+'T16:00Z');
  t.mock.method(Date,'now',()=>now);
  const {route,data,f}=S;
  const a={...away,n:8,elo:1580,wins:7,losses:1,recentMargin:10};
  const h={...home,n:6,elo:1490,wins:3,losses:3,recentMargin:-2};
  const g={id:'clear',date:day,start:day+'T22:00Z',status:'scheduled',neutral:true,away,home,
    forecast:{pHome:.36,aN:8,hN:6,awayPts:78,homePts:72}};
  const games=[{...g,id:'short',forecast:{...g.forecast,pHome:.22,aN:3}},
    {...g,id:'even',forecast:{...g.forecast,pHome:.50}},
    {...g,id:'started',start:day+'T15:00Z'},
    g];
  try{
    Object.assign(S,{route:{sport:'cbb',id:'college-slate',title:'Winner Forecasts'},f:{collegeDay:day},
      data:{updated:new Date(now).toISOString(),coverage:{[day]:new Date(now).toISOString()},games,teams:[a,h]}});
    const page=collegePage();
    assert.match(page,/Projected winner[\s\S]*Away U[\s\S]*64\.0%/);
    assert.match(page,/Away U leads by 90 adjusted Elo points/);
    assert.match(page,/Even matchup/);
    assert.match(page,/Pregame window closed/);
    assert.ok(page.indexOf('64.0%')<page.indexOf('78.0%'),'clearer leans appear before a high-probability short sample');
    S.f.cbbForecastFilter='short';
    const short=collegePage();
    assert.match(short,/Short sample/);
    assert.match(short,/78\.0%/);
    assert.doesNotMatch(short,/64\.0%/);
    S.f.cbbForecastFilter='none';
    assert.doesNotMatch(collegePage(),/Forecast evidence/);
  }finally{Object.assign(S,{route,data,f});}
});

test('college tracking uses final scores and only books hypothetical units at actual quotes',()=>{
  const [g]=collegeScoreboard({events:[event]},'fbs');
  g.forecast={version:'college-v1',pHome:.6,homePts:32,awayPts:24};
  const [winner,spread,total]=collegePicks('fbs',g);
  assert.equal(spread.side,'home');
  assert.equal(spread.line,-3.5);
  assert.equal(spread.tools['fbs-spread'].rating,'3 to under 7 pts');
  assert.deepEqual(collegeSettlement(spread,{status:'final',aScore:24,hScore:27}),{result:'lost',value:3});
  assert.deepEqual(collegeSettlement(total,{status:'final',aScore:24,hScore:31}),{result:'push',value:55});
  assert.equal(collegeSettlement(winner,{status:'canceled'}).result,'void');
  assert.equal(collegeSettlement(winner,{status:'live',aScore:24,hScore:27}),null);
  const [cbb]=collegePicks('cbb',g);
  assert.equal(collegePicks('cbb',g).length,1);
  assert.equal(cbb.odds,null);
  const record=blank();
  add(record,{...cbb,result:'won'},.6);
  assert.equal(record.won,1);
  assert.equal(roi(record),null);
  assert.equal(collegePicks('fbs',{...g,market:null}).length,1);
});

test('player leaderboards aggregate finished appearances and keep missing stats empty',()=>{
  const rows=csvObjects('game_id,athlete_id,athlete_display_name,team_id,minutes,points,three_point_field_goals_made,three_point_field_goals_attempted\r\n'+
    '1,4,"Name, Jr.",2,20,10,1,2\r\n2,4,"Name, Jr.",2,22,20,3,6\r\n3,4,"Name, Jr.",2,25,50,8,8\r\n');
  const [p]=basketballPlayers([...rows,rows[0]],new Set(['1','2']));
  assert.equal(p.name,'Name, Jr.');
  assert.equal(p.n,2);
  assert.equal(p.points,15);
  assert.equal(p.threePct,0.5);
  assert.equal(p.assists,null);
});

test('college postponements void the original slot and a new schedule creates its own record',async()=>{
  const [g]=collegeScoreboard({events:[event]},'cwb');
  g.forecast={version:'college-v1',pHome:.6};
  const [pick]=collegePicks('cwb',g);
  const delayed=collegeResultRow({...g,start:'2026-11-14T03:00:00Z'});
  assert.equal(collegeSettlement(pick,delayed),null,'ordinary delays preserve the record');

  const later={...g,marketAt:'2026-11-20T13:00Z',start:'2026-11-20T16:00Z',date:'2026-11-20'};
  const [newPick]=collegePicks('cwb',later);
  const moved=collegeResultRow(later);
  const postponed=collegeResultRow({...g,status:'postponed'});
  assert.deepEqual(collegeSettlement(pick,postponed),{result:'void',value:'Postponed',rescheduled:true});
  assert.deepEqual(collegeSettlement(pick,moved),{result:'void',value:'Rescheduled',rescheduled:true});
  assert.equal(collegeCaptureKey(newPick,pick,{...moved,marketAt:later.marketAt}),pick.k+'|2026-11-20');
  assert.equal(collegeCaptureKey(pick,{...pick,rescheduled:true,graded:'2026-11-14T19:00Z'},
    {...postponed,marketAt:'2026-11-14T18:00Z'}),null,'old scheduled copies cannot revive a postponed pick');

  const query=async url=>{
    assert.match(url,/womens-college-basketball\/summary\?event=100$/);
    return Response.json({header:{competitions:[{id:'100',date:later.start,competitors:[espnTeam(home,'home'),espnTeam(away,'away')],
      status:status('STATUS_SCHEDULED','pre')}]}});};
  const results=await fetchCollegeResults([pick,pick],query);
  assert.equal(results.size,1);
  assert.equal(collegeSettlement(pick,results.get('cwb|100')).value,'Rescheduled');
  assert.equal((await fetchCollegeResults([{...pick,a:'99'}],query)).size,0,'a different matchup cannot settle this pick');
});
