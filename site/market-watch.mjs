import {current as S,esc,box,table,empty,tools,select,team,espnLogo,dateKey,dateLabel,et,pct,metric,grid} from './ui.mjs';
import {href,sections} from './config.mjs';
import {isCollege} from './college-core.mjs';
import {readSnapshot} from './pro-refresh.mjs';
import {marketSnapshot,marketStale,upcomingMarkets,marketForecast} from './market-watch-data.mjs';

const venueNames={kalshi:'Kalshi · Ask',polymarket:'Polymarket · Listed price',polymarket_us:'Polymarket US · Midpoint'};
const when=iso=>Number.isFinite(Date.parse(iso))?`${dateLabel(dateKey(new Date(iso)),true)} · ${et({iso})} ET`:'—';
const stamp=iso=>`<time datetime="${esc(iso)}">${esc(when(iso))}</time>`;
const price=x=>Number.isFinite(x)?(x>0?'+':'')+x:'—';
const prob=x=>Number.isFinite(x)?pct(x,1):'—';
const cents=x=>Number.isFinite(x)?+(x*100).toFixed(2)+'¢':'—';
const collegeTeam=(id,name)=>`<span class="team-inline">${/^\d+$/.test(id)?`<img class="team-mark" src="${espnLogo('ncaa/500/'+id+'.png')}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`:''} ${esc(name)}</span>`;

export async function readMarkets(sport){
  const data=await readSnapshot('market-watch/'+sport+'.json');
  return marketSnapshot(data)?data:null;
}
export async function readMarketModels(sport){
  if(isCollege(sport)){
    const data=await readSnapshot('college/'+sport+'.json');
    return Array.isArray(data?.games)?data:null;
  }
  if(sport==='mlb'){
    const data=await readSnapshot('yard/board.json');
    return Array.isArray(data?.game_projections)?data:null;
  }
  if(sport==='nba'||sport==='nfl'){
    const data=await readSnapshot('models/'+sport+'.json');
    return (sport==='nba'?data?.games&&typeof data.games==='object'&&!Array.isArray(data.games):Array.isArray(data?.games))?data:null;
  }
  return null;
}

function marketSummary(sport,game,models,stale){
  const market=game.noVig;
  const note=game.count===1?'1 sportsbook':game.count>1?esc(game.count)+' sportsbooks':'Two-sided moneyline unavailable';
  const home=metric('Sportsbook no-vig · '+esc(game.h),prob(market),note);
  if(sport==='nhl')return grid(2,[metric('Sportsbook no-vig · '+esc(game.a),prob(market==null?null:1-market),note),home]);
  const model=marketForecast(sport,models,game);
  const difference=model!=null&&market!=null&&!stale?Number(((model-market)*100).toFixed(1)):null;
  const gap=difference==null?'—':(difference>0?'+':'')+difference+' pp';
  const modelName=isCollege(sport)?'GOING projection':sport==='mlb'?'GOING YARD game model':'Ensemble';
  const published=isCollege(sport)?models?.updated:models?.generated_at;
  return grid(3,[
    metric(modelName+' · '+esc(game.h),prob(model),model!=null?'Published '+stamp(published):'Forecast unavailable for this game'),
    home,
    metric('Forecast minus market',gap,difference!=null?esc(game.h)+' win chance':'Requires a forecast and fresh sportsbook odds')
  ]);
}

export function marketPage(data,models){
  const sport=S.route.sport,college=isCollege(sport);
  const forecastName=college?'GOING matchup forecasts':sport==='mlb'?'GOING YARD game projections':'GOING ensemble forecast';
  const path=sport==='mlb'?'yard/game-totals.html':sections[sport].home;
  const subtitle=sport==='nhl'?'Compare NHL moneylines, puck lines, totals, and winner prices.':
    `Compare upcoming game lines and winner prices with the <a href="${href(path)}">${forecastName}</a>.`;
  const head=`<h1>Market Watch</h1><p class="subtle">${subtitle}</p>`;
  if(!data)return head+box('',empty('Market snapshots are temporarily unavailable. Check back after the next refresh.'));
  const now=Date.now(), upcoming=upcomingMarkets(data.games,now), stale=marketStale(data.checked,now);
  const updated=`<p class="subtle">Sportsbook snapshot ${stamp(data.checked)}${stale?' · Delayed':''}</p>`;
  if(!upcoming.length)return head+updated+box('',empty(stale?'Waiting for an updated slate.':`No upcoming games through ${dateLabel(data.through,true)}.`));
  const day=g=>g.date||dateKey(new Date(g.iso));
  const dates=[...new Set(upcoming.map(day))];
  const date=S.f.marketDate===''||dates.includes(S.f.marketDate)?S.f.marketDate:dates[0];
  S.f.marketDate=date;
  const games=date?upcoming.filter(g=>day(g)===date):upcoming;
  const game=games.find(g=>g.id===S.f.marketGame)||games.find(g=>g.books.length||g.exchanges.some(x=>x.status==='ok'))||games[0];
  S.f.marketGame=game.id;
  const picker=tools(select('Date','marketDate',[['','All upcoming'],...dates.map(d=>[d,dateLabel(d,true)])])+
    select('Matchup','marketGame',games.map(g=>[g.id,g.a+' vs '+g.h+' · '+when(g.iso)])));
  const matchup=(side)=>college?collegeTeam(game[side+'Id'],game[side+'Name']||game[side]):team(game[side]);
  const spread=sport==='nhl'?'Home puck line':sport==='mlb'?'Home run line':'Home spread';
  const books=box('Sportsbooks',table(['Source',esc(game.a)+' ML',esc(game.h)+' ML',spread,'Total'],
    game.books.map(b=>[esc(b.name),price(b.away),price(b.home),price(b.spread),esc(b.total??'—')]),
    {wrap:'box',empty:'ESPN has no sportsbook lines for this game.'}),
    'No-vig removes the margin from paired moneylines. The benchmark averages the no-vig probabilities when ESPN provides more than one book. A negative spread means the home side is favored.');
  const exchanges=box('Prediction markets',table(['Source',esc(game.a),esc(game.h),'Captured'],
    game.exchanges.map(v=>[esc(venueNames[v.id]||v.id),cents(v.away),cents(v.home),
      v.status==='ok'?stamp(v.checked)+(v.retained||marketStale(v.checked,now)?' · Delayed':''):
      v.status==='missing'?'No quote available':'Source unavailable']),
    {wrap:'box',empty:game.exchangeNote||'Exchange prices are unavailable for this game.'}),
    'Winner contract prices are shown in cents. An ask is the price offered to buyers, a midpoint is halfway between the bid and ask, and a listed price is indicative. Each is shown as published by its venue.');
  return head+picker+box('',`<h2>${matchup('a')} <span class="muted">vs</span> ${matchup('h')}</h2><p class="subtle">${esc(when(game.iso))} · Pregame</p>`+
    marketSummary(sport,game,models,stale)+updated)+books+exchanges+
    `<p class="tiny">Market data via <a href="https://github.com/WalrusQuant/sports-leader-mcp" target="_blank" rel="noopener">Sports Leader MCP</a>.</p>`;
}
