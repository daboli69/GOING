import {badge,box,btn,cell,empty,esc,table,tools} from './ui.mjs';
import {implied,mean,pct,round,signed} from './math.mjs';
import {exactRecord,propValue,roleTrend} from './nba-role-data.mjs';

const odds=price=>price>0?'+'+price:String(price);
const timestamp=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',
  day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
export const formatQuoteTime=value=>Number.isFinite(Date.parse(value))?timestamp.format(new Date(value)):'Time unavailable';

export function legEvidenceButton(leg){
  return btn('Why this leg?','nbaPropEvidence',JSON.stringify([leg.player,leg.stat,leg.side,leg.line]),'outline');
}

export function exactQuoteComparison(prices,detail,{now=Date.now()}={}){
  const active=new Map();
  if(!['Over','Under'].includes(detail.side))return [];
  const side=detail.side.toLowerCase();
  const tip=Date.parse(detail.tip);
  if(!(now<tip))return [];
  for(const q of prices){
    const stamp=Date.parse(q.capturedAt), price=q[side];
    if(q.line!==detail.line||!q.provider||!Number.isInteger(Number(price))||Math.abs(Number(price))<100||
       !(stamp<=now&&stamp<tip&&now-stamp<=120*60000))continue;
    if(!active.has(q.provider)||stamp>Date.parse(active.get(q.provider).capturedAt))active.set(q.provider,{...q,price});
  }
  return [...active.values()].sort((a,b)=>implied(a.price)-implied(b.price));
}

export const propEvidenceTable=(groups,stat,line,side)=>table(['Sample','Record','Hit rate','Pushes','Average','Minutes'],
  groups.map(({label,sample})=>{
    const record=exactRecord(sample,stat,line,side);
    return [esc(label),record.hits+'/'+record.n,record.rate==null?'—':pct(record.rate,0),record.pushes,
      round(mean(sample.map(x=>propValue(x,stat)).filter(Number.isFinite))),round(mean(sample,x=>x[5]))];
  }),{cls:'compact',wrap:'box'});

const playerGameChart=(logs,stat,line,side)=>{
  const items=logs.slice(-20).filter(r=>Number.isFinite(propValue(r,stat)));
  if(!items.length)return empty('No eligible player games.');
  const scale=Math.max(1,line,...items.map(r=>propValue(r,stat)));
  const width=n=>100*n/scale+'%';
  return '<ol class="nba-evidence-chart" style="--line:'+width(line)+'">'+items.map(r=>{
    const value=propValue(r,stat), outcome=value===line?'Push':(side==='Over'?value>line:value<line)?'Hit':'Miss';
    const label=r[1].slice(5)+' '+r[3];
    return '<li><span>'+esc(label)+'</span><span class="nba-evidence-bar" style="--value:'+width(value)+'" aria-hidden="true"><i></i></span>'+
      '<strong>'+esc(value)+'</strong>'+badge(outcome,outcome==='Hit'?'g':outcome==='Miss'?'r':'')+'</li>';
  }).join('')+'</ol>';
};

export function evidenceBody({player,detail,groups,role,quotes,matchup,assists,rolePanel}){
  const {stat,line,side,opponent}=detail;
  const season=groups.find(row=>row.label==='Season').sample;
  const other=side==='Over'?'Under':'Over';
  const toggled=btn('View '+other,'nbaPropEvidence',JSON.stringify([player.id,stat,other,line]),'outline');
  const trend=roleTrend(role.logs,5), shift=trend.comparable?
    'Last five vs earlier with '+player.team+' · '+signed(trend.minutes??0)+' MIN and '+signed(trend.attempts??0)+' FGA per game.':'';
  const prices=quotes.length?table(['Source','Odds','Implied','Checked'],quotes.map(q=>[
    esc(q.provider+(q.provider==='Kalshi'?' exchange':'')),esc(odds(q.price)),pct(implied(q.price),1),esc(formatQuoteTime(q.capturedAt))]),
    {cls:'compact',wrap:'box'}):empty('No recent verified prices match this line and side.');
  return tools(badge(esc(side+' '+line+' '+stat+' vs '+opponent))+toggled)+
    box('Game-by-Game Results',playerGameChart(season,stat,line,side),'The thin vertical mark is the selected line. Games are ordered oldest to newest.')+
    box('Exact-Line Records',propEvidenceTable(groups,stat,line,side),
      'Pushes are shown separately. Recent, venue and opponent samples can overlap.')+
    box('Role Changes',(shift?'<p>'+esc(shift)+'</p>':'')+rolePanel)+
    (matchup||'')+(assists||'')+(stat==='PRA'?'<p class="subtle">Custom research line. PRA uses same-game points, rebounds and assists. Live sportsbook PRA quotes are unavailable in this feed.</p>':
      box('Same-Line Prices',prices,'Prices match the player, game, side and line. Exchange prices exclude fees.'));
}


export function discrepancyTable(rows,compareQuotes){
  const differences=rows.flatMap(row=>{
    const quotes=compareQuotes?.(row)||[];
    return ['Over','Under'].flatMap(side=>{
      const prices=exactQuoteComparison([row.quote,...quotes],{line:row.quote.line,tip:row.game.iso,side});
      if(prices.length<2)return [];
      const [best,other]=prices;
      const gap=implied(other.price)-implied(best.price);
      return [{row,side,best,other,gap}];
    });
  }).sort((a,b)=>b.gap-a.gap);
  return table(['Player','Main line','Better price','Other source','Implied gap'],differences.map(({row,side,best,other,gap})=>{
    const price=q=>esc(odds(q.price)+' '+q.provider+(q.provider==='Kalshi'?' exchange':''))+
      '<br><small>'+esc(formatQuoteTime(q.capturedAt))+'</small>';
    return [esc(row.player.name+' · '+row.player.team),esc(side+' '+row.quote.line+' '+row.stat),
      cell(price(best)),cell(price(other)),pct(gap,1)];
  }),{cls:'compact',wrap:'box',empty:'No buildable comparisons with two fresh quotes at the same main line.'});
}

export function milestoneGrid(rows,quotes){
  const selected=new Map();
  const key=(player,stat)=>player+'|'+stat;
  for(const row of rows)selected.set(key(row.player.id,row.stat),row);
  const targets={Points:[10,15,20,25,30],Threes:[1,2,3,4,5],Assists:[2,4,6,8,10],Rebounds:[4,6,8,10,12]};
  const eligible=[...selected.values()].filter(row=>targets[row.stat]);
  const asOf=Date.now();
  const quoteMap=new Map();
  for(const source of quotes){
    const k=key(source.player.id,source.stat)+'|'+source.quote.line;
    const list=quoteMap.get(k)||[];
    list.push(source.quote);quoteMap.set(k,list);
  }
  const stat=eligible[0]?.stat, levels=targets[stat];
  if(!levels)return empty('No current main lines in this market.');
  const data=eligible.filter(row=>row.stat===stat).sort((a,b)=>(b.avg??0)-(a.avg??0));
  return table(['Player','Main line',...levels.map(x=>x+'+')],data.map(row=>[
    esc(row.player.name+' · '+row.player.team),esc(row.quote.line),
    ...levels.map(value=>{
      const r=row.player.logs?exactRecord(row.player.logs,stat,value-.5,'Over'):null;
      const match=exactQuoteComparison(quoteMap.get(key(row.player.id,stat)+'|'+(value-.5))||[],
        {side:'Over',line:value-.5,tip:row.game.iso},{now:asOf});
      const price=match[0];
      return cell((r?esc(r.hits+'/'+r.n):'—')+(price?'<br><small>'+esc(odds(price.price)+' '+price.provider)+'</small>':''));
    })]),{cls:'compact',wrap:'box',sort:'nba-milestones'});
}
