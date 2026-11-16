import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {parseNflFinal,nflBoxGrade} from '../scripts/nfl-finals.mjs';
import {compactNflParlays} from '../scripts/nfl-parlay-archive.mjs';
import {publicQuotes} from '../scripts/market-data.mjs';
import {current as S} from '../site/ui.mjs';
import {nflParlayData,nflSameGameData} from '../site/nfl.mjs';
import {ticketMath} from '../site/parlay-core.mjs';

test('official NFL grading requires a matching final and uses explicit stats including zero',()=>{
  const game={espn:'123',a:'KC',h:'ATL'}, key='completions/passingAttempts';
  const header={id:'123',status:{type:{completed:true,name:'STATUS_FINAL'}},competitors:[
    {homeAway:'away',team:{abbreviation:'KC'},score:'24'},{homeAway:'home',team:{abbreviation:'ATL'},score:'17'}]};
  const athlete={id:'1',displayName:'Test Player Jr.'};
  const summary={header:{competitions:[header]},boxscore:{players:[{team:{abbreviation:'KC'},statistics:[
    {name:'passing',keys:[key,'passingYards'],athletes:[{athlete,stats:['11/15','120']}]},
    {name:'rushing',keys:['rushingYards','rushingAttempts'],athletes:[{athlete,stats:['0','2']}]}
  ]}]}};
  const parsed=parseNflFinal(summary,game),now=Date.UTC(2026,10,15,22);
  const leg={team:'KC',player:'Test Player',side:'Under',line:1.5};
  assert.deepEqual([parsed.a,parsed.h],[24,17]);
  assert.equal(nflBoxGrade(parsed,{...leg,market:'Rushing'},now).result,'won');
  assert.equal(nflBoxGrade(parsed,{...leg,market:'Pass Attempts'},now).value,15);
  assert.equal(nflBoxGrade(parsed,{...leg,market:'Anytime TD'},now),null);
  assert.equal(nflBoxGrade(parsed,{...leg,team:'ATL',market:'Rushing'},now),null);
  assert.equal(parseNflFinal(summary,{...game,espn:'456'}),null);
  header.status.type.completed=false;
  assert.equal(parseNflFinal(summary,game),null);
});

test('NFL market reads are scoped to exact games and distinguish an empty market from a failure',async()=>{
  const game={a:'KC',h:'ATL',date:'2026-11-15'};
  let failures=[],requests=[];
  const quotes=await publicQuotes('nfl',[game],{onFailure:x=>{failures=x;},read:async u=>{
    const event=u.searchParams.get('event_ticker');
    requests.push(event);
    if(event.startsWith('KXNFLRSHATT'))return new Response(null,{status:400});
    const markets=event.startsWith('KXNFLRSHYDS')?[{event_ticker:event,title:'Sample Back: rushing',status:'active',
      floor_strike:30.5,yes_ask_dollars:'0.5300',yes_ask_size_fp:'2.00'}]:[];
    return Response.json({markets,cursor:''});
  }});
  assert.equal(requests.length,9);
  assert.ok(requests.every(s=>s.endsWith('-26NOV15KCATL')));
  assert.deepEqual(failures,[{market:'Rush Attempts',game}]);
  assert.equal(quotes.length,1);
  assert.equal(quotes[0].market,'Rushing');
  assert.equal(quotes[0].line,30.5);
});

test('NFL combined estimates use the supplied leg estimate, including a touchdown’s price-based shrinkage',()=>{
  const leg={game:'g',price:300,form:{season:{hits:2,n:8}},chance:.25};
  assert.equal(ticketMath([leg],8,l=>l.chance).adjusted,.25);
  assert.ok(ticketMath([leg],8).adjusted>.4);
});

const data=new URL('../site/data/',import.meta.url);
const read=f=>JSON.parse(readFileSync(new URL(f,data),'utf8'));
test('the compact NFL archive produces the same parlay and similar-defense inputs as the full archive',
  {skip:!existsSync(new URL('nfl-2026.json',data))&&'no local snapshot'},()=>{
  const archive=read('nfl-2026.json'),schedule=read('nfl-schedule.json');
  const games=schedule.filter(g=>g.id.startsWith('2026_')&&g.week===10),game=games.find(g=>g.a==='KC');
  Object.assign(S,{route:{id:'nfl-sgp',sport:'nfl'},year:2026,week:10,games,game,
    nflAsOf:Date.parse('2026-11-15T17:00Z'),injuries:{},odds:[{player:'Emmett Johnson',market:'Rushing',line:40.5,over:100,
      a:game.a,h:game.h,date:game.date}]});
  S.data={...archive,schedule};
  const long=nflParlayData(), same=nflSameGameData();
  assert.ok(long.rows.length&&same.rows.length);
  S.data={...compactNflParlays(archive),schedule};
  assert.deepEqual(nflParlayData(),long);
  assert.deepEqual(nflSameGameData(),same);
});

test('NHL lineup updates just after UTC midnight still belong to the Eastern game day',async()=>{
  const {parseLineups}=await import('../scripts/lineups.mjs');
  const html='<script type="application/ld+json">'+JSON.stringify({
    articleBody:'## SUNDAY\n**Oilers projected lineup**\nFirst Skater -- Second Skater -- Third Skater\n',
    datePublished:'2026-11-15T22:30:00Z',dateModified:'2026-11-16T00:22:22Z'
  })+'</script>';
  assert.deepEqual(Object.keys(parseLineups(html,'2026-11-15')),['EDM']);
  assert.deepEqual(parseLineups(html,'2026-11-16'),{});
});
