// GOING LONG TD Board: anytime and first touchdown, from opportunity. nfl.mjs builds the data (tdBoardData); this file
// draws the board, the picks with their reasons, the ticket, regression, the model check and calibration.
import {current as S,esc,box,grid,card,table,cell,tools,btn,select,empty,badge,person,dialog,et,round,pct} from './ui.mjs';
import {heat,mean,signed} from './math.mjs';
import {fairAnytime,fairField,impliedChance,americanFrom} from './nfl-td.mjs';
import {badWeather} from './nfl-parlay-engine.mjs';

const num=(v,d)=>{const x=Number(v);return v===''||v==null||!Number.isFinite(x)?d:x;};
const yes=k=>S.f[k]==='Yes';
const priceKey=(market,id)=>market+'|'+id;
const tdPricesNow=()=>{try{return JSON.parse(localStorage.getItem('suite:td-prices:'+S.year+'-'+S.week))||{};}catch{return {};}};
const updated=iso=>iso&&Number.isFinite(Date.parse(iso))?new Date(iso).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit'}):'—';

// Every candidate in both markets, with its price check, reason tags and written reasons.
export function tdAnalysis(data){
  const f=S.f, hold=num(f.tdHold,20)/100, prices=tdPricesNow(), list=[];
  for(const x of data.games){
    // First TD is one market per game: the whole field of prices is normalized (Kalshi lists most players), and a
    // partial board of typed prices is divided by the hold.
    const firstPrices={};
    for(const r of x.rows){const v=prices[priceKey('First TD',r.id)]??r.quotes.first?.over;if(v!=null&&v!=='')firstPrices[r.id]=v;}
    const firstFair=fairField(firstPrices,hold);
    for(const r of x.rows)for(const market of ['Anytime TD','First TD']){
      const any=market==='Anytime TD', model=any?r.anytime:r.first, q=any?r.quotes.any:r.quotes.first;
      const manual=prices[priceKey(market,r.id)], price=manual??q?.over??'';
      // A sportsbook price you type has its hold removed. A Kalshi ask is an exchange price with no bookmaker margin:
      // two-sided quotes are normalized, a one-sided ask is used as it stands.
      const fair=price===''?null:any?(manual!=null?fairAnytime(manual,null,hold):q.under!=null?fairAnytime(q.over,q.under,0):impliedChance(q.over)):firstFair[r.id]??null;
      const edge=fair==null?null:model-fair, source=manual!=null?'book':q?'kalshi':null;
      const tagList=tags(r,x,market);
      if(source==='kalshi'&&q.under==null)tagList.push('Kalshi ask (one-sided)');
      if(edge!=null&&Math.abs(edge)>.12)tagList.push('Big gap: confirm role');
      list.push({r,x,market,model,price,fair,edge,source,quoteTime:manual!=null?null:q?.capturedAt||null,manual:manual!=null,tags:tagList,reasons:reasons(r,x,market,model,fair,price,source)});
    }
  }
  return list;
}
function tags(r,x,market){
  const t=[];
  if(r.goalLine)t.push('Goal-line back');
  if(r.role==='QB'&&r.rushShare>=.12)t.push('QB rushing role');
  if(r.counts.ez>=3)t.push(r.counts.ez+' end-zone targets');
  if(r.rzShare!=null&&r.rzShare>=.25)t.push('RZ share '+pct(r.rzShare,0));
  if(r.m>=1.1)t.push(r.opp+' soft vs '+r.role+'s');
  if(r.m<=.9)t.push(r.opp+' tough vs '+r.role+'s');
  if(r.regression.kind==='due')t.push('Due: '+signed(r.regression.expected-r.regression.actual)+' TDs');
  if(r.regression.kind==='hot')t.push('Running hot: '+signed(r.regression.actual-r.regression.expected));
  const side=x.side[r.team];
  if(side.implied>=26)t.push('Team total '+round(side.implied,1));
  if(r.status)t.push(r.status);
  if(x.weather?.roof==='dome')t.push('Dome');else if(x.bad)t.push('Wind/rain');
  if(market==='First TD'&&(r.team===x.g.a?x.receiveA:1-x.receiveA)>=.55)t.push('Likely receives first');
  return t;
}
function reasons(r,x,market,model,fair,price,source){
  const side=x.side[r.team], out=[], add=(w,text)=>out.push({w,text});
  const c=r.counts;
  add(r.lambda>=.45?1:r.lambda<.2?-1:0,`Expected TDs ${round(r.lambda,2)} tonight: ${r.team} is implied for ${round(side.implied,1)} points${side.fromLines?'':' (season scoring; no line yet)'}, about ${round(side.teamTd,2)} TDs, ${pct(side.rs,0)} of them on the ground; he holds ${pct(r.rushShare,0)} of the team's expected rushing TDs and ${pct(r.recShare,0)} of its receiving TDs.`);
  add(c.in5>=4||c.ez>=4||c.t10>=5?1:0,`Opportunity this season (${r.games} games): ${c.in5} carries inside the 5, ${c.in10} inside the 10, ${c.t10} targets inside the 10 (${c.ez} into the end zone), ${c.t20} inside the 20.${r.rzShare!=null?' Red-zone share '+pct(r.rzShare,0)+'.':''}`);
  if(r.goalLine)add(1,`Goal-line back: most carries inside the 5 on ${r.team}.`);
  if(r.role==='QB'&&r.rushShare>=.12)add(1,`QB rushing role: ${pct(r.rushShare,0)} of the team's expected rushing TDs (sneaks and scrambles).`);
  if(r.snaps!=null)add(r.snaps>=.7?0:r.snaps<.45?-1:0,`Snaps ${pct(r.snaps,0)} over the last three games.`);
  if(r.m>=1.1||r.m<=.9)add(r.m>=1.1?1:-1,`${r.opp} allows ${r.m>=1.1?'more':'fewer'} TD opportunity to ${r.role}s than the offenses it faced usually create (×${round(r.m,2)} after adjusting for schedule).`);
  const g=r.regression;
  if(g.kind==='due')add(1,`Due for a TD: ${g.actual} TDs on ${round(g.expected,1)} expected from his opportunities. The chances are there; the touchdowns usually follow.`);
  else if(g.kind==='hot')add(-1,`Scoring above his opportunity: ${g.actual} TDs on ${round(g.expected,1)} expected. The model already shrinks him to his chances; a price built on his TD count may be too short.`);
  else add(0,`TDs track opportunity: ${g.actual} TDs on ${round(g.expected,1)} expected.`);
  if(r.status)add(-1,`${r.status} on the injury report: re-check after inactives post, about 90 minutes before kickoff.`);
  if(x.weather?.roof==='dome')add(0,'Dome.');
  else if(x.bad)add(r.rushShare>r.recShare?0:-1,`Weather: ${[x.weather?.wind!=null?x.weather.wind+' mph wind':'',x.weather?.rain?x.weather.rain+' in rain':''].filter(Boolean).join(', ')} moves scoring toward the run.`);
  if(market==='First TD'){
    const recv=r.team===x.g.a?x.receiveA:1-x.receiveA;
    add(r.teamFirst>=.5?1:0,`${r.team} scores the first TD ${pct(r.teamFirst/(1-x.dst),0)} of the time: receives the opening kickoff ${pct(recv,0)} (${x.receiveSource}), and its drives end in a TD ${pct(r.team===x.g.a?x.pA:x.pH,0)} against this defense (opening drive ${pct(r.team===x.g.a?x.a1:x.h1,0)}). He would be the scorer ${pct(r.given,0)} of the time, including ${pct(r.openShare,0)} of the team's opening-drive touches.`);
  }
  if(fair!=null)add(model-fair>=0?1:-1,`${source==='kalshi'?'Kalshi ask':'Your price'} ${price}: ${pct(fair,1)} ${source==='kalshi'?'(exchange price, no bookmaker margin)':'with the hold removed'} against the model's ${pct(model,1)}, edge ${(model-fair>=0?'+':'')+pct(model-fair,1)}.`);
  if(fair!=null&&Math.abs(model-fair)>.12)add(-1,`Big gap between model and market. That usually means a role change the model has not seen yet (depth chart, a returning starter, a new injury). Confirm his role before betting.`);
  return out;
}
const reasonList=list=>`<ul class="fb-reasons">${list.map(x=>`<li class="${x.w>0?'good':x.w<0?'bad':''}">${x.w>0?'▲':x.w<0?'▼':'•'} ${esc(x.text)}</li>`).join('')}</ul>`;

// Filters from the controls.
function passes(a){
  const f=S.f, r=a.r, w=a.x.weather;
  if(f.tdMarket!=='Both'&&a.market!==(f.tdMarket||'Anytime TD'))return false;
  if(f.tdPos&&f.tdPos!=='All'&&r.role!==f.tdPos)return false;
  if(yes('tdNoQ')&&r.status)return false;
  if(f.tdWeather==='Dome only'&&w?.roof!=='dome')return false;
  if(f.tdWeather==='No wind or rain'&&badWeather(w))return false;
  if(a.x.g.spread!=null&&Math.abs(a.x.g.spread)>num(f.tdMaxSpread,30))return false;
  if(a.x.g.total!=null&&a.x.g.total<num(f.tdMinTotal,0))return false;
  if(num(f.tdMinRz,0)>0&&!((r.rzShare??0)*100>=num(f.tdMinRz,0)))return false;
  if(num(f.tdMinSnap,0)>0&&!((r.snaps??0)*100>=num(f.tdMinSnap,0)))return false;
  if(yes('tdDue')&&r.regression.kind!=='due')return false;
  const lo=num(f.tdMinOdds,null),hi=num(f.tdMaxOdds,null),p=impliedChance(a.price);
  if(p!=null&&lo!=null&&p>impliedChance(lo))return false;
  if(p!=null&&hi!=null&&p<impliedChance(hi))return false;
  return true;
}
const isPick=a=>a.edge!=null&&a.edge>=num(S.f.tdMinEdge,2)/100;
function ticket(picks){
  const legs=[],games=new Set(),teams=new Map();
  const qb=a=>a.r.role==='QB', catcher=a=>['WR','TE'].includes(a.r.role);
  for(const a of picks){
    if(legs.length>=num(S.f.tdLegs,3))break;
    if(legs.some(x=>x.r.id===a.r.id))continue;
    const mates=legs.filter(x=>x.x.g.id===a.x.g.id);
    // First TD legs in one game exclude each other; anytime legs may share a game only as a QB-receiver stack when allowed.
    if(mates.length&&(a.market==='First TD'||mates.some(x=>x.market==='First TD')))continue;
    if(mates.length&&yes('tdPerGame')&&!(yes('tdStack')&&mates.every(x=>x.r.team===a.r.team&&(qb(x)&&catcher(a)||catcher(x)&&qb(a)))))continue;
    legs.push(a);games.add(a.x.g.id);teams.set(a.r.team,(teams.get(a.r.team)||0)+1);
  }
  return legs;
}

export function tdBoardPage(data){
  const f=S.f, all=tdAnalysis(data);
  const rows=all.filter(passes).sort((a,b)=>(b.edge??-1)-(a.edge??-1)||b.model-a.model);
  const shown=f.tdShow==='All'?rows:rows.slice(0,40);
  const head=`<h1>TD Board</h1><p class="subtle">Expected touchdowns from opportunity, not past TD counts: every carry and target counts at the league's TD rate for where it happened (inside the 5, inside the 10, end-zone targets, …), the player's share of his team's expected TDs is applied to the touchdowns the market implies for his team, and P(at least one) = 1 − e^(−expected TDs). First TD = P(team scores the first TD) × P(he scores it | team does). Week ${esc(S.week)}.</p>`;
  if(!data.rows.length)return head+box('',empty('No games this week yet.'));
  const controls=tools(select('Market','tdMarket',['Anytime TD','First TD','Both'])+select('Position','tdPos',['All','QB','RB','WR','TE'])+
      `<label class="field">Min. edge (pts) <input type="number" step=".5" data-field="tdMinEdge" value="${esc(f.tdMinEdge)}"></label>`+
      `<label class="field">Min. odds <input type="text" inputmode="numeric" placeholder="-200" data-field="tdMinOdds" value="${esc(f.tdMinOdds||'')}"></label>`+
      `<label class="field">Max. odds <input type="text" inputmode="numeric" placeholder="+2000" data-field="tdMaxOdds" value="${esc(f.tdMaxOdds||'')}"></label>`)+
    tools(`<label class="field">Min. RZ share % <input type="number" min="0" max="100" data-field="tdMinRz" value="${esc(f.tdMinRz)}"></label>`+
      `<label class="field">Min. snaps % <input type="number" min="0" max="100" data-field="tdMinSnap" value="${esc(f.tdMinSnap)}"></label>`+
      `<label class="field">Max. spread <input type="number" step=".5" data-field="tdMaxSpread" value="${esc(f.tdMaxSpread)}"></label>`+
      `<label class="field">Min. total <input type="number" step=".5" data-field="tdMinTotal" value="${esc(f.tdMinTotal)}"></label>`+
      select('Weather','tdWeather',['Any','No wind or rain','Dome only']))+
    tools(select('Exclude questionable','tdNoQ',['No','Yes'])+select('Due for a TD only','tdDue',['No','Yes'])+
      select('D/ST TDs count (first TD)','tdDst',['Yes','No'])+
      `<label class="field">Hold for one-sided prices % <input type="number" min="0" max="60" data-field="tdHold" value="${esc(f.tdHold)}"></label>`+select('Show','tdShow',['Top 40','All']));
  const board=table(['#','Player','Market','Game','Expected TDs','Model','Price','No-vig','Edge','Tags','Updated',''],shown.map((a,i)=>{
    const r=a.r;
    return [i+1,cell(person(r.p).html+(r.status?' '+badge(r.status,'r'):''),'player-cell'),esc(a.market),esc(r.team+' vs '+r.opp+' · '+et(a.x.g)),round(r.lambda,2),
      cell(pct(a.model,1),heat(a.model,a.market==='First TD'?.06:.3,a.market==='First TD'?.03:.12)),
      `<input class="fb-price" type="text" inputmode="numeric" placeholder="+250" aria-label="${esc(a.market)} price for ${esc(r.p.name)}" data-td-price="${esc(a.market+'|'+r.id)}" value="${esc(a.price)}">`,
      a.fair==null?'—':pct(a.fair,1),a.edge==null?'—':cell((a.edge>=0?'+':'')+pct(a.edge,1),heat(a.edge,0,.03)),
      esc(a.tags.join(' · ')||'—'),esc(a.manual?'Your price':updated(a.quoteTime)),btn('Why','tdWhy',a.market+'|'+r.id,'outline')+btn('Scratch','tdOut',r.id,'outline')];
  }),{wrap:'box',cls:'compact',empty:'No players pass these filters.'});
  const picks=rows.filter(isPick);
  const legs=ticket(picks);
  const pickCards=picks.length?grid(1,picks.slice(0,12).map(a=>card(`${esc(a.r.p.name)} · ${esc(a.r.team)} · ${esc(a.market)} <span class="subtle">model ${pct(a.model,1)} · no-vig ${pct(a.fair,1)} · edge ${pct(a.edge,1)} · expected TDs ${round(a.r.lambda,2)}</span>`,
    `<p class="subtle">${esc(a.tags.join(' · '))}</p>`+reasonList(a.reasons)))):empty('No player beats his vig-free price by the minimum edge. Kalshi prices fill in automatically; type a sportsbook price on any row to test it.');
  const legModel=legs.reduce((a,x)=>a*x.model,1), legPrice=legs.reduce((a,x)=>a*impliedChance(x.price),1);
  const stacked=legs.some((a,i)=>legs.some((b,j)=>j>i&&a.x.g.id===b.x.g.id));
  const ticketBox=box('Ticket',tools(`<label class="field">Legs <input type="number" min="1" max="8" data-field="tdLegs" value="${esc(f.tdLegs)}"></label>`+
      select('One leg per game','tdPerGame',['Yes','No'])+select('QB with his receiver (stack)','tdStack',['No','Yes']))+
    (legs.length?table(['Leg','Model','Price','Edge'],legs.map(a=>[esc(a.r.p.name+' · '+a.market+' · '+a.r.team+' vs '+a.r.opp),pct(a.model,1),esc(a.price),pct(a.edge,1)]),{wrap:'box',cls:'compact'})+
      `<p class="subtle">Model chance ${pct(legModel,2)} (${americanFrom(legModel)}) against ${americanFrom(legPrice)} combined. Legs are treated as independent${stacked?'; this ticket stacks a QB with his receiver, whose TDs go together, so the true chance is higher than shown':''}. First-TD legs never share a game, since only one player scores it.</p>`
      :empty('No legs clear the edge filters yet.')));
  const watch=all.filter(a=>a.market==='Anytime TD'&&a.r.regression.kind).sort((a,b)=>a.r.regression.diff-b.r.regression.diff);
  const regression=box('TD Regression Watch',`<p class="subtle">Actual TDs against expected TDs from opportunity. Many chances and few TDs: due. Scoring past his chances: shrink him (the model already does).</p>`+
    (watch.length?table(['Player','Game','Games','Expected TDs','Actual TDs','Difference','Read'],watch.map(a=>{const g=a.r.regression;return [cell(person(a.r.p).html,'player-cell'),esc(a.r.team+' vs '+a.r.opp),a.r.games,round(g.expected,1),g.actual,(g.diff>0?'+':'')+round(g.diff,1),g.kind==='due'?badge('Due for a TD','g'):badge('Running hot','r')];}),{wrap:'box',cls:'compact'}):empty('Nobody this week is far from his expected TDs yet.')));
  const check=box('Model Check',table(['Game','Team TDs (implied points)','Run share','Receives first','First TD','Weather','Opening kickoff'],data.games.map(x=>{
    const {g}=x, A=x.side[g.a], H=x.side[g.h];
    return [esc(g.a+' @ '+g.h+' · '+et(g)),esc(g.a+' '+round(A.teamTd,2)+' ('+round(A.implied,1)+') · '+g.h+' '+round(H.teamTd,2)+' ('+round(H.implied,1)+')'),
      esc(g.a+' '+pct(A.rs,0)+' · '+g.h+' '+pct(H.rs,0)),esc(g.a+' '+pct(x.receiveA,0)+' ('+x.receiveSource+')'),esc(g.a+' '+pct(x.firstA,0)+' · '+g.h+' '+pct(1-x.firstA,0)),
      esc(x.weather?.roof==='dome'?'Dome':x.weather?[x.weather.wind!=null?x.weather.wind+' mph':'',x.weather.temp!=null?x.weather.temp+'°F':'',x.weather.rain?x.weather.rain+' in rain':''].filter(Boolean).join(', '):'—'),
      `<select data-field="tdOpen:${esc(g.id)}" aria-label="Opening kickoff for ${esc(g.a+' @ '+g.h)}">${[['','Model'],[g.a,g.a+' receives'],[g.h,g.h+' receives']].map(([v,t])=>`<option value="${esc(v)}" ${(S.f['tdOpen:'+g.id]||'')===v?'selected':''}>${esc(t)}</option>`).join('')}</select>`];
  }),{wrap:'box',cls:'compact'})+`<p class="subtle">League rates this season: ${pct(data.league.rushShare,0)} of TDs on the ground, ${pct(data.league.drive,0)} of drives end in a TD (${pct(data.league.open,0)} of opening drives), ${pct(data.league.dst,1)} of first TDs come from a defense or special teams. ${S.f.tdDst!=='No'?'First-TD chances leave that share to defenses and special teams, as Kalshi settles on any player.':'Defense and special-teams TDs are ignored for first TD.'}</p>`);
  return head+box('Filters',controls)+box('TD Board',board+'<p class="subtle">Prices: Kalshi Anytime and First TD quotes fill in (with their capture time); type a sportsbook price to override. A two-sided Kalshi quote has its vig removed directly; a one-sided price is divided by the hold above; a first-TD field is normalized across the game. Scratch anyone ruled out at inactives and the board re-runs.</p>',
    'TD props carry heavy vig and first TD is mostly a lottery: a realistic first-TD pick is a single-digit chance. Keep stakes small; the calibration log below shows how the numbers hold up.')+
    box('Picks',`<p class="subtle">Every player beating his vig-free price by the minimum edge, best first, with the reasons. Several from one game can qualify.</p>`+pickCards)+ticketBox+regression+check+tdCalibration();
}
function tdCalibration(){
  const log=S.tdLog||{live:[],backtest:[]};
  const summary=(list,label)=>{
    const graded=list.filter(x=>x.graded), rows=graded.flatMap(x=>x.players.map(p=>({any:p[4],first:p[5],td:x.tds.includes(p[0])?1:0,firstHit:x.first===p[0]?1:0})));
    const bins=(k,hit,edges)=>edges.map(([a,b])=>{const r=rows.filter(x=>x[k]>=a&&x[k]<b);return [pct(a,0)+'–'+pct(b,0),r.length,r.length?pct(mean(r,x=>x[k]),1):'—',r.length?pct(mean(r,x=>x[hit]),1):'—'];});
    const brier=(k,hit)=>rows.length?round(mean(rows,x=>(x[k]-x[hit])**2),4):'—';
    return card(label,`<p class="subtle">${graded.length} games graded. Brier: anytime ${brier('any','td')}, first TD ${brier('first','firstHit')}.</p>`+
      table(['Anytime model','Players','Average','Scored'],bins('any','td',[[0,.1],[.1,.2],[.2,.3],[.3,.4],[.4,.55],[.55,1]]),{wrap:'box',cls:'compact'})+
      table(['First TD model','Players','Average','Scored first'],bins('first','firstHit',[[0,.02],[.02,.04],[.04,.07],[.07,.1],[.1,1]]),{wrap:'box',cls:'compact'}));
  };
  return box('Calibration Log','<p class="subtle">Each hourly run saves the board before kickoff and grades it from the play-by-play. The backtest replays every earlier week with only the data available before it (no lines are stored for past weeks, so it uses each team\'s season scoring for implied points).</p>'+
    grid(2,[summary(log.live||[],'Live: saved before kickoff'),summary(log.backtest||[],'Backtest: earlier weeks')]));
}
export function tdBoardAction(act,v,data){
  if(act==='tdWhy'){
    const [market,id]=[v.slice(0,v.indexOf('|')),v.slice(v.indexOf('|')+1)];
    const a=tdAnalysis(data).find(x=>x.market===market&&x.r.id===id);if(!a)return false;
    dialog(a.r.p.name+' · '+market,`<p class="subtle">${esc(a.r.team+' vs '+a.r.opp+' · '+et(a.x.g)+' ET')} · model ${pct(a.model,1)} · expected TDs ${round(a.r.lambda,2)}${a.fair!=null?' · no-vig '+pct(a.fair,1):''} · updated ${esc(a.manual?'your price':updated(a.quoteTime))}</p>`+reasonList(a.reasons));
    return false;
  }
  if(act==='tdOut'){
    const k='suite:td-out:'+S.year+'-'+S.week;let list=[];try{list=JSON.parse(localStorage.getItem(k))||[];}catch{}
    list=list.includes(v)?list.filter(x=>x!==v):[...list,v];try{localStorage.setItem(k,JSON.stringify(list));}catch{}
    return true;
  }
  return false;
}
