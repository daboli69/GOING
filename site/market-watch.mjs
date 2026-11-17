import {current as S,esc,box,table,cell,empty,tools,select,team,versus,dateKey,dateLabel,et,pct,metric,grid} from './ui.mjs';
import {href} from './config.mjs';
import {readSnapshot} from './pro-refresh.mjs';
import {marketSnapshot,marketStale,upcomingMarkets,marketForecast} from './market-watch-data.mjs';

const venueNames={kalshi:'Kalshi · Ask',polymarket:'Polymarket · Listed price',polymarket_us:'Polymarket US · Midpoint'};
const when=iso=>Number.isFinite(Date.parse(iso))?`${dateLabel(dateKey(new Date(iso)),true)} · ${et({iso})} ET`:'—';
const stamp=iso=>`<time datetime="${esc(iso)}">${esc(when(iso))}</time>`;
const price=x=>Number.isFinite(x)?(x>0?'+':'')+x:'—';
const prob=x=>Number.isFinite(x)?pct(x,1):'—';
const cents=x=>Number.isFinite(x)?+(x*100).toFixed(2)+'¢':'—';

export async function readMarkets(sport){
  const data=await readSnapshot('market-watch/'+sport+'.json');
  return marketSnapshot(data)?data:null;
}
export const readMarketModels=sport=>readSnapshot('models/'+sport+'.json').then(data=>
  (sport==='nba'?data?.games&&typeof data.games==='object'&&!Array.isArray(data.games):Array.isArray(data?.games))?data:null);

export function marketPage(data,models){
  const sport=S.route.sport, forecastLink=href(sport==='nba'?'up/':'long/');
  const head=`<h1>Market Watch</h1><p class="subtle">Compare upcoming game lines and winner prices with the <a href="${forecastLink}">GOING ensemble forecast</a>.</p>`;
  if(!data)return head+box('',empty('Market snapshots are temporarily unavailable. Check back after the next refresh.'));
  const now=Date.now(), games=upcomingMarkets(data.games,now), stale=marketStale(data.checked,now);
  const updated=`<p class="subtle">Sportsbook snapshot ${stamp(data.checked)}${stale?' · Delayed':''}</p>`;
  if(!games.length)return head+updated+box('',empty(stale?'Waiting for an updated slate.':`No upcoming games through ${dateLabel(data.through,true)}.`));
  const game=games.find(g=>g.id===S.f.marketGame)||games[0];
  S.f.marketGame=game.id;
  const picker=select('Matchup','marketGame',games.map(g=>[g.id,g.a+' @ '+g.h+' · '+when(g.iso)]));
  const model=marketForecast(sport,models,game), market=game.noVig;
  const difference=model!=null&&market!=null&&!stale?Number(((model-market)*100).toFixed(1)):null;
  const gap=difference==null?'—':(difference>0?'+':'')+difference+' pp';
  const summary=grid(3,[
    metric('Ensemble · '+esc(game.h),prob(model),model!=null?'Published '+stamp(models.generated_at):'Forecast unavailable for this game'),
    metric('Sportsbook no-vig · '+esc(game.h),prob(market),game.count===1?'1 sportsbook':game.count>1?esc(game.count)+' sportsbooks':'Two-sided moneyline unavailable'),
    metric('Ensemble minus market',gap,difference!=null?esc(game.h)+' win chance':'Requires a forecast and fresh sportsbook odds')
  ]);
  const books=box('Sportsbooks',table(['Source',esc(game.a)+' ML',esc(game.h)+' ML','Home spread','Total'],
    game.books.map(b=>[esc(b.name),price(b.away),price(b.home),price(b.spread),esc(b.total??'—')]),
    {wrap:'box',empty:'ESPN has no sportsbook lines for this game.'}),
    'No-vig removes the margin from paired moneylines. The benchmark averages the no-vig probabilities when ESPN provides more than one book. A negative home spread means the home team is favored.');
  const exchanges=box('Prediction markets',table(['Source',esc(game.a),esc(game.h),'Captured'],
    game.exchanges.map(v=>[esc(venueNames[v.id]||v.id),cents(v.away),cents(v.home),
      v.status==='ok'?stamp(v.checked)+(v.retained||marketStale(v.checked,now)?' · Delayed':''):
      v.status==='missing'?'No quote available':'Source unavailable']),
    {wrap:'box',empty:'Exchange prices are unavailable for this game.'}),
    'Winner contract prices are shown in cents. An ask is the price offered to buyers, a midpoint is halfway between the bid and ask, and a listed price is indicative. Each is shown as published by its venue.');
  return head+tools(picker)+box('',`<h2>${versus(game)}</h2><p class="subtle">${esc(when(game.iso))} · Pregame</p>`+summary+updated)+books+exchanges+
    `<p class="tiny">Market data via <a href="https://github.com/WalrusQuant/sports-leader-mcp" target="_blank" rel="noopener">Sports Leader MCP</a>.</p>`;
}
