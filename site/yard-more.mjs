// GOING YARD views that run the Going Yard model's own browser math (site/yard-engine.mjs, generated from
// hr-board). The numbers come straight from those functions; this module only lays them out in the GOING design.
import {current as S,esc,box,grid,card,metric,team,table,cell,tools,btn,toggles,select,info,empty,badge,dateLabel,et,round,pct} from './ui.mjs';
import {signed} from './math.mjs';
import * as E from './yard-engine.mjs';
import {board,headshot,heatCell,formBadge,tierBadge,hitter,pitcherCell,pageHead,noSlate} from './yard.mjs';

const minutesAgo=m=>m==null?'':m<90?Math.round(m)+' min ago':m<36*60?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';
const am=v=>{const n=parseFloat(v);return Number.isFinite(n)?(n>0?'+'+Math.round(n):String(Math.round(n))):'—';};
const chanceCell=p=>p==null?cell('—','none'):cell(pct(p,1),p>=.6?'good heat':p>=.35?'mid heat':'');
const evCell=ev=>ev==null?'—':cell(signed(ev*100,1)+'%',ev>0?'good heat':'bad heat');
const byId=()=>new Map((board().players||[]).map(p=>[p.id,p]));
// A pick row's player cell: a hitter gets his headshot and card, a pitcher or a team gets plain text.
function who(l,ids=byId()){
  const p=l.id!=null?ids.get(l.id):null;
  if(p)return hitter({...p,lineup_spot:l.spot??p.lineup_spot});
  return cell(`<strong>${esc(l.name)}</strong><br><small class="muted">${esc(l.team||'')}${l.opp||l.opp_team?' vs '+esc(l.opp||l.opp_team):''}</small>`);
}
const legsTable=(legs,{price=true,extra}={})=>{const ids=byId();return table(['Pick','Selection','Chance',...(price?['Price','Edge']:[]),...(extra?[extra[0]]:[])],legs.map(l=>({act:l.id!=null?'player':'',v:l.id,cls:l.id!=null?'clickable':'',
  cells:[who(l,ids),cell(esc(l.label||'Home run'),'plain'),chanceCell(l.prob),...(price?[cell(am(l.price??l.book_odds)+(l.hasOdds===false?' <small class="muted">fair</small>':''),'plain'),evCell(l.ev??l.edge??null)]:[]),...(extra?[extra[1](l)]:[])]})),{cls:'compact',empty:'Nothing qualifies tonight.'});};
const ownBadge=t=>t?badge(t,t==='Leverage'||t==='Sweet Spot'?'g':''):'';

/* ---------- Daily Card ---------- */
export function dailyCard(){
  const b=board();if(!b.players?.length)return pageHead('Daily Card')+noSlate();
  const g=b.cross_game_parlays_pow?.genius,longball=g?.legs?.[0];
  const mixed=E._dcPickDistinct(E.dailyMixedPool(),6),alt=E.altLinePool().slice(0,5);
  const step=(title,sub,body)=>box(title,`<p class="subtle">${sub}</p>`+body);
  return pageHead('Daily Card','hr-board’s four-bet routine on one screen, assembled from its own views: the Genius Pairing (POW) ticket, the run-line and first-five model with non-home-run props, and the Alt Line Finder. Nothing here is a new model.')+
    step('1 · The Longball','The single highest-confidence home run pick after the anti-chalk nudge, so it is not just tonight’s most obvious name.',longball?legsTable([{...longball,label:'Home run',price:longball.book_odds}],{extra:['Crowd',l=>cell(ownBadge(l.ownership_tier),'plain')]}):empty('No Genius Pairing leg cleared the bar tonight.'))+
    step('2 · 3-leg cross-game HR parlay',esc(g?.subtitle||'Genius Pairing'),g&&!g.incomplete?legsTable((g.legs||[]).map(l=>({...l,label:'Home run',price:l.book_odds})),{extra:['Crowd',l=>cell(ownBadge(l.ownership_tier),'plain')]})+
      `<p class="subtle">Combined chance <strong>${pct(g.combined_prob,1)}</strong> · model fair ${am(g.fair_odds)}${g.ev_pct!=null?` · ${signed(g.ev_pct,0)}% against the book`:''}</p>`:empty(g?.note||'Not enough qualifying legs across distinct games tonight.'))+
    step('3 · Game and prop parlay (3–6 legs)','Moneyline, run line, first-five moneyline and non-home-run props, ranked by the same anti-chalk key, one per game. Take the top three for a tighter ticket.',legsTable(mixed))+
    step('4 · 5-leg round robin (optional)','Real alt lines at plus money, most confident first. The full list is in Alt Line Finder.',legsTable(alt));
}

/* ---------- Top Picks ---------- */
export function topPicks(){
  const b=board();if(!b.players?.length)return pageHead('Top Picks')+noSlate();
  const f=S.f.pickType||'all',list=E.unifiedPicks(f).slice(0,S.f.more?200:60),ids=byId();
  const dots=c=>{const n=c>=.66?3:c>=.4?2:1;return `<span title="How much other evidence backs it">${'●'.repeat(n)}${'○'.repeat(3-n)}</span>`;};
  return pageHead('Top Picks','Every prop (home runs, hits, H+R+RBI and strikeouts) in one list, most likely to cash first. The chance is the model’s calibrated probability; the dots show how much of the rest of the evidence (backtested lift, matchup grade, zone, park, heat, arm) supports it. Ranked by likelihood, not price.')+
    tools([['all','All'],['Hit','Hits'],['HR','Home runs'],['HRR','H+R+RBI'],['Ks','Strikeouts']].map(([k,l])=>btn(l,'set','pickType:'+k,f===k?'on':'')).join(''))+
    table(['#','Pick','Market','Chance','Support','Why'],list.map((x,i)=>({act:x.id?'player':'',v:x.id,cls:x.id?'clickable':'',cells:[i+1,who(x,ids),cell(badge(x.label,x.typeKey==='HR'?'g':''),'plain'),chanceCell(x.prob),cell(dots(x.conv),'plain'),
      cell(esc((x.bits||[]).slice(0,3).join(' · ')||'thin support')+(x.isArm&&x.est!=null?` · ${round(x.est,1)} expected Ks`:'')+(x.bestLift>=1.1?` · <span class="pos-text">${esc(x.bestLabel)} ${signed((x.bestLift-1)*100,0)}% tracked</span>`:''),'plain')]})),{sort:'yard-picks',wrap:'box'})+
    tools(btn(S.f.more?'Show top 60':'Show top 200','flip','more'));
}

/* ---------- Signal Convergence ---------- */
export function converge(){
  const b=board();if(!b.players?.length)return pageHead('Signal Convergence')+noSlate();
  const prop=S.f.cvProp||'hr';
  E.setYardState('cvProp',prop);E.setYardState('cvHeat',S.f.cvHeat!=='off');E.setYardState('cvMode',S.f.cvMode||'best');E.setYardState('cvMinRel',+(S.f.cvMinRel??3));E.setYardState('cvConfirmed',!!S.f.cvConfirmed);
  const tabs=tools(Object.entries(E.CV_PROPS).map(([k,v])=>btn(esc(v.label),'set','cvProp:'+k,prop===k?'on':'')).join('')+
    btn('With heat','set','cvHeat:on',S.f.cvHeat!=='off'?'on':'')+btn('Without heat','set','cvHeat:off',S.f.cvHeat==='off'?'on':'')+
    btn('Most evidence','set','cvMode:best',(S.f.cvMode||'best')==='best'?'on':'')+btn('Overlooked','set','cvMode:overlooked',S.f.cvMode==='overlooked'?'on':''));
  const chip=(s,meas)=>`<span class="badge ${meas?'g':''}" title="${esc((s.detail||[]).join(' · '))}">${esc(s.lab)}${s.n>1?' ×'+s.n:''}${s.lift?' +'+s.lift+'%':''}</span>`;
  let rows;
  if(prop==='ml'){
    rows=[];for(const g of b.game_projections||[])for(const side of ['home','away']){const c=g[side+'_converge'];if(!c)continue;
      const meas=S.f.cvHeat==='off'?(c.measured||[]).filter(s=>s.k!=='runmodel'):(c.measured||[]),prov=c.provisional||[];if(!meas.length&&!prov.length)continue;
      rows.push({name:g[side],team:g[side],opp:g[side==='home'?'away':'home'],meas,prov,head:g[side+'_wp']!=null?pct(g[side+'_wp']):'—',score:meas.length*1000+meas.reduce((a,s)=>a+(s.lift||0),0)+prov.length*.6});}
    rows.sort((a,b)=>b.score-a.score);
  }else{
    const isK=prop==='ks';
    rows=(isK?b.pitcher_props||[]:b.players||[]).filter(x=>{const c=E.cvBlock(x);return c&&(E.cvMeasured(x).length+(c.provisional||[]).length)>0;}).filter(x=>isK||E.cvPasses(x))
      .sort((x,y)=>E.convergeVal(y)-E.convergeVal(x)).slice(0,40).map(x=>{
        const c=E.cvBlock(x),heat=isK?x.k_heat:prop==='hr'?x.heat:prop==='hit'?x.hit_heat:x.hrr_heat;
        let head='—';try{const pr=isK?null:prop==='hr'?E.calibratedHRprob(x.heat):E.smoothPropProb(prop==='hit'?'hit1':'hrr',heat);head=isK?`${round(E.ksProjection(x),1)} Ks`:pr!=null?pct(pr):'—';}catch{}
        return {x,isK,meas:E.cvMeasured(x),prov:c.provisional||[],heat,head};
      });
  }
  const ids=byId();
  const body=table(['#','Pick','Measured','Signals','Heat','Model'],rows.map((r,i)=>({act:r.x&&!r.isK?'player':'',v:r.x?.id,cls:r.x&&!r.isK?'clickable':'',cells:[i+1,
    r.x?(r.isK?pitcherCell(r.x):who(r.x,ids)):cell(team(r.team,true)+` <small class="muted">vs ${esc(r.opp)}</small>`),cell(`<strong>${r.meas.length}</strong> <small class="muted">+${r.prov.length}</small>`),
    cell(r.meas.map(s=>chip(s,true)).join(' ')+' '+r.prov.map(s=>chip(s,false)).join(' '),'plain'),r.heat==null?'—':heatCell(Math.round(r.heat)),esc(r.head)]})),{wrap:'box',empty:'Convergence is not in this board yet. It fills in on the next hr-board run.'});
  return pageHead('Signal Convergence','Ranked by how many independent reads point at the same pick, weighted by the lift each signal showed in hr-board’s backtest for this prop. The bold number counts measured (backtested) signals; the small +n is provisional context. “Without heat” asks whether the rest of the evidence agrees on its own. “Overlooked” pushes down names the heat model already loves.')+tabs+
    (prop!=='ml'&&prop!=='ks'?tools(`<span class="subtle">Sample</span>`+[[0,'All'],[1,'60+ BBE'],[2,'120+ BBE'],[3,'250+ BBE']].map(([v,l])=>btn(l,'set','cvMinRel:'+v,+(S.f.cvMinRel??3)===v?'on':'')).join('')+btn('Confirmed lineups','flip','cvConfirmed',S.f.cvConfirmed?'on':'')):'')+
    `<p class="subtle">${E.cvLiftNote(prop==='ml'?'hr':prop).replace(/<(?!\/?b>)[^>]*>/g,'')}</p>`+body;
}

/* ---------- Team vs Pitch Mix ---------- */
export function pitchMix(){
  const b=board();if(!b.arsenals||!Object.keys(b.arsenals).length)return pageHead('Team vs Pitch Mix')+noSlate();
  const starters=E.pmStarters();if(!starters.length)return pageHead('Team vs Pitch Mix')+box('',empty('No starters posted yet.'));
  const arm=starters.find(a=>String(a.id)===String(S.f.pmPitcher))||starters[0],throws=arm.throws||'R';
  S.f.pmPitcher=arm.id;
  const facing=(b.players||[]).filter(p=>p.opp_pitcher?.id===arm.id),sideOf=p=>{const x=p.bats||'R';return x==='S'?(throws==='R'?'L':'R'):x;};
  S.f.pmSel??={};
  const shadeOf=(kind,v)=>{if(v==null)return 'none';const t=E._pmScale(kind,v),bad=kind==='kpct'||kind==='swstr';return t>=.66?(bad?'bad heat':'good heat'):t>=.33?'mid heat':(bad?'good':'');};
  const f=(v,d,s='')=>v==null?'—':v.toFixed(d)+s;
  const section=hand=>{
    const ars=E.pmArsenal(arm.id,hand);if(!ars.length)return '';
    const key=arm.id+hand,sel=S.f.pmSel[key]??=[...E.pmDefaultSel(arm.id,hand)];
    const chips=ars.map(([pt,share])=>btn(`${esc(E._ptName(pt))} ${share}%`,'pmPitch',key+':'+pt,sel.includes(pt)?'on':'')).join('');
    const rows=facing.filter(p=>sideOf(p)===hand).map(p=>({p,a:E.pmAgg(p.vs_pitch,sel)})).sort((x,y)=>(y.a?.brl??-1)-(x.a?.brl??-1));
    const line=a=>[cell(f(a.k_pct,1,'%'),shadeOf('kpct',a.k_pct)),cell(f(a.swstr,1,'%'),shadeOf('swstr',a.swstr)),a.bbe,cell(f(a.ev,1),shadeOf('ev',a.ev)),cell(f(a.brl,1,'%'),shadeOf('brl',a.brl)),cell(f(a.pbrl,1,'%'),shadeOf('pbrl',a.pbrl)),cell(f(a.pair,1,'%'),shadeOf('pair',a.pair)),cell(f(a.hh,1,'%'),shadeOf('hh',a.hh))];
    const pooled=new Array(12).fill(0);let any=false;
    for(const {p} of rows)for(const pt of sel){const v=p.vs_pitch?.[pt];if(v?.length>=12){any=true;for(let i=0;i<12;i++)pooled[i]+=v[i]||0;}}
    const [pp,wh,pa,k,bbe,nev,evs,brl,pbrl,air,pair,hh]=pooled,g=(n,d)=>d?100*n/d:null;
    const avg=any?{cells:[cell(`<strong>${hand}HB average</strong>`),...line({k_pct:g(k,pa),swstr:g(wh,pp),bbe,ev:nev?evs/nev:null,brl:g(brl,bbe),pbrl:g(pbrl,bbe),pair:g(pair,air),hh:g(hh,nev)})]}:null;
    return box(`vs ${hand==='R'?'right':'left'}-handed hitters`,tools(chips)+(sel.length?table(['Hitter','K%','SwStr%','BBE','Avg EV','Barrel%','Pulled barrel%','Pulled air%','Hard-hit%'],
      [...rows.map(({p,a})=>a?{act:'player',v:p.id,cls:'clickable',cells:[hitter(p),...line(a)]}:{cls:'dim',cells:[hitter(p),cell('No sample against these pitches','plain'),'','','','','','','']}),...(avg?[avg]:[])],{wrap:'box',empty:'Lineup not posted yet.'}):empty('Pick at least one pitch.')));
  };
  return pageHead('Team vs Pitch Mix','How tonight’s lineup handles the pitches this starter actually throws, split by batter hand. Rates pool the raw counts across every pitch you select, so a big sample is never outweighed by a tiny one. Green is damage by the hitter; red on K% and SwStr% means the pitch beats him.')+
    tools(select('Starter','pmPitcher',starters.map(a=>[a.id,`${a.name} (${a.throws||'?'}HP) · ${a.team} vs ${a.opp_team}`])))+section('R')+section('L');
}

/* ---------- Split Overlaps ---------- */
export function splits(){
  const b=board(),so=b.split_overlaps;
  if(!so||so.status!=='FRESH'||so.slate_date!==b.slate_date)return pageHead('Split Overlaps','Post-All-Star venue splits: where a hitter’s home or road numbers line up with the opposing starter’s matching venue split.')+box('',empty(so?.note||so?.reason||'Split data appears after the next daily refresh.'));
  const fam=S.f.splitFam||'HR_OVERLAP',section=S.f.splitSection||'matchups',pa=+(S.f.splitPa??so.default_thresholds?.pa??50),bf=+(S.f.splitBf??so.default_thresholds?.bf??30);
  S.f.splitPa=pa;S.f.splitBf=bf;
  let rows=E.splitVisible(so.boards[fam]||[],{pa,bf},'overlap_strength',-1);
  if(section!=='matchups'){const seen=new Set();rows=rows.filter(r=>{const k=section==='pitchers'?r.game_pk+':'+r.pitcher_id:r.game_pk+':'+r.id;return !seen.has(k)&&seen.add(k);});}
  const m=so.metrics?.[fam]||{},cols=[...(m.batter||[]).map(k=>['batter_stats.'+k,'Batter '+(E.splitLabels[k]||k)]),...(m.pitcher||[]).map(k=>['pitcher_stats.'+k,'Pitcher '+(E.splitLabels[k]||k)])];
  const ids=byId();
  return pageHead('Split Overlaps','Where a hitter’s venue split (home or road, since the All-Star break) overlaps with the opposing starter’s matching split. Overlap strength is a research score; sample confidence measures how deep the samples are, separately from strength.',` · window ${esc(so.window_start)} to ${esc(so.slate_date)}`)+
    tools([['HR_OVERLAP','Home runs'],['HIT_OVERLAP','Hits'],['HRR_OVERLAP','H+R+RBI']].map(([k,l])=>btn(l,'set','splitFam:'+k,fam===k?'on':'')).join('')+
      [['matchups','Matchups'],['batters','Batters'],['pitchers','Pitchers']].map(([k,l])=>btn(l,'set','splitSection:'+k,section===k?'on':'')).join('')+
      select('Batter PA ≥','splitPa',[25,50,75,100].map(v=>[v,v]))+select('Pitcher BF ≥','splitBf',[15,30,50,75].map(v=>[v,v])))+
    table(['#',section==='pitchers'?'Pitcher':'Hitter','Split','Strength','Sample confidence','Spot',...cols.map(c=>c[1])],rows.map((r,i)=>({act:section==='pitchers'?'':'player',v:r.id,cls:section==='pitchers'?'':'clickable',cells:[i+1,
      section==='pitchers'?cell(`<strong>${esc(r.pitcher_name)}</strong><br><small class="muted">facing ${esc(r.name)}</small>`):who({...r,team:r.game?.split(' ')[0]},ids),
      cell(esc(r.split_label)+`<br><small class="muted">vs ${esc(r.pitcher_name)}</small>`,'plain'),cell(round(r.overlap_strength,1),r.overlap_strength>=60?'good heat':r.overlap_strength>=40?'mid heat':''),
      cell(round(r.sample_confidence,0),r.sample_confidence>=70?'good':r.sample_confidence<40?'bad':''),r.lineup_spot??'—',...cols.map(([k])=>esc(E.splitFormat(k.split('.').pop(),E.splitValue(r,k))))]})),{sort:'yard-splits',wrap:'box',cls:'wide',empty:'No matchups clear these sample minimums.'});
}

/* ---------- Edge Finder ---------- */
export function edgeFinder(){
  const b=board();if(!b.players?.length)return pageHead('Edge Finder')+noSlate();
  const prices=E.oddsGet(),R=E.trackerRates(),BR=E.betRates(),RELIABLE=60;
  const cands=b.players.filter(p=>p.lineup_status!=='out'&&p.heat!=null&&(p.heat>=40||prices[p.id])).map(p=>{
    let ms=null;try{ms=E.hitterScore(p,R,BR);}catch{}
    const prob=ms?.prob??null,price=prices[p.id]||null,ev=prob!=null&&price?E.evPerDollar(prob,price):null,imp=price?E.impliedProb(price):null;
    // hr-board's confidence score: thin data, heat outside the calibrated band and long prices all count against a play.
    let conf=null,flags=[];
    if(ev!=null){conf=100;const present=p.score_breakdown?.present??6;
      if(present<4){conf-=45;flags.push('thin data');}else if(present<6){conf-=18;flags.push('some signals missing');}
      if(p.heat<40){conf-=30;flags.push('low heat');}else if(p.heat>=83){conf-=12;flags.push('top band, small sample');}
      if(imp!=null){if(imp<.07){conf-=40;flags.push('deep longshot');}else if(imp<.1){conf-=22;flags.push('longshot');}else if(imp<.14)conf-=8;}
      if(E.fetchedOddsFor(p.id)?.fallback){conf-=15;flags.push('FanDuel reference price');}conf=Math.max(0,conf);}
    return {p,prob,price,ev,imp,conf,flags};
  }).filter(x=>x.prob!=null);
  const priced=cands.filter(x=>x.ev!=null).sort((a,b)=>{const t=x=>x.ev>0?(x.conf>=RELIABLE?0:1):2;return t(a)-t(b)||b.ev-a.ev;});
  const unpriced=cands.filter(x=>x.ev==null).sort((a,b)=>b.prob-a.prob).slice(0,40);
  const reliable=priced.filter(x=>x.ev>0&&x.conf>=RELIABLE);
  const input=x=>`<input type="text" inputmode="numeric" class="price-in" aria-label="Your price for ${esc(x.p.name)}" placeholder="+450" value="${esc(x.price??'')}" data-yard-price="${x.p.id}">`;
  const row=x=>({cls:x.ev>0&&x.conf>=RELIABLE?'':x.ev!=null&&x.ev<=0?'dim':'',cells:[hitter(x.p),heatCell(x.p.heat),chanceCell(x.prob),esc(E.breakevenAmerican(x.prob)),cell(input(x),'plain'),x.imp==null?'—':pct(x.imp,1),evCell(x.ev),
    x.conf==null?'—':cell(round(x.conf,0)+(x.flags.length?`<br><small class="muted">${esc(x.flags.join(' · '))}</small>`:''),x.conf>=RELIABLE?'good':'mid')]});
  const cols=['Hitter','Heat','Model HR chance','Break-even price','Your price','Book implied','Expected return','Confidence'];
  return pageHead('Edge Finder','The model says a hitter is, say, 17% to homer. That is a bet only if the book prices him longer than fair value (here about +488). Enter the price you see, or use the price hr-board captured, and this compares every hitter for you. Plays are ranked reliable first: a modest edge on a trustworthy read beats a huge edge on thin data or a deep longshot.',
    ` · prices ${E.oddsMatchSlate()?`captured ${minutesAgo(E.oddsAgeMin())}`:'not captured for this slate; enter your own'}`)+
    (priced.length?`<div class="callout">${reliable.length} reliable plays with a positive expected return out of ${priced.length} priced.${reliable[0]?` Top: ${esc(reliable[0].p.name)} at ${esc(am(reliable[0].price))}, model ${pct(reliable[0].prob)} against the book’s ${pct(reliable[0].imp)}.`:' Most home run props are priced at or below fair value; not betting is a decision.'}</div>`:'')+
    (priced.length?box('Priced',table(cols,priced.map(row),{wrap:'box'})):'')+box('Model’s favourites without a price',table(cols,unpriced.map(row),{wrap:'box'}),'Type a price into any row and it moves up into Priced. Your prices are saved in this browser for today’s slate and shared with hr-board’s own page.')+
    `<p class="tiny">${E.oddsStale()?'Captured prices look stale; check your book. ':''}Prices you type override captured ones. Research only.</p>`;
}

/* ---------- Price research ---------- */
export function priceResearch(){
  const b=board();if(!b.players?.length)return pageHead('Price Research')+noSlate();
  S.f.minEdge=E.getMinEdge();
  const min=E.getMinEdge()/100,rows=E.allPropEV().filter(e=>Number.isFinite(e.prob)&&Number.isFinite(e.ev)&&e.ev>=min).sort((a,b)=>Number(!!a.fallback)-Number(!!b.fallback)||b.ev-a.ev);
  return pageHead('Price Research','Prices above the model’s break-even estimate. Estimated return is what you might gain or lose per dollar over many identical bets if the model were accurate. These probabilities have not been validated on predictions saved before games, so no bet size is suggested.',` · ${rows.length} candidates`)+
    tools(select('Minimum estimated return','minEdge',[2,3,4,5,7,10].map(v=>[v,v+'%'])))+
    table(['Selection','Market','Side','Listed price','Model chance','Break-even price','Estimated return','Notes'],rows.map(e=>[cell(`<strong>${esc(e.name)}</strong><br><small class="muted">${esc(e.team||'')}${e.opp?' vs '+esc(e.opp):''}</small>`),esc(e.propLabel),esc(e.side||''),esc(am(e.price)),chanceCell(e.prob),esc(E.americanFair(e.prob)),evCell(e.ev),
      cell([e.ev>.25&&'Large model and price disagreement: review it',e.fallback&&'Reference price not verified'].filter(Boolean).map(esc).join('<br>')||'—','plain')]),{sort:'yard-price',wrap:'box',empty:hrPricesNote(b)});
}
const hrPricesNote=b=>E.oddsMatchSlate()?'No priced candidates meet this filter.':'hr-board has no prices captured for this slate.';

/* ---------- Alt Line Finder ---------- */
export function altLines(){
  const b=board();if(!b.players?.length)return pageHead('Alt Line Finder')+noSlate();
  const pool=E.altLinePool(),ids=byId();
  const t=list=>table(['Pick','Line','Price','Book','Model chance','Edge'],list.map(l=>({act:l.id!=null?'player':'',v:l.id,cls:l.id!=null?'clickable':'',cells:[who(l,ids),cell(esc(l.label)+(l.badgeNote?`<br><small class="muted">${esc(l.badgeNote)}</small>`:''),'plain'),esc(am(l.price)),esc(l.book||'—'),chanceCell(l.prob),l.edge==null?'—':cell(signed(l.edge*100,1)+' pts',l.edge>0?'good':'bad')]})),{wrap:'box',empty:hrPricesNote(b)==='No priced candidates meet this filter.'?'No plus-money lines here tonight.':'No alt-line prices captured for this slate.'});
  return pageHead('Alt Line Finder','Every alt line the books posted tonight at plus money, priced by the model at that exact line, most confident first. Ranked by chance rather than edge, since a round robin needs each leg to clear.')+
    grid(2,[box('Pitcher strikeouts',t(pool.filter(l=>l.tk==='Ks').slice(0,12))),box('2+ hits',t(pool.filter(l=>l.tk==='Hit2').slice(0,12)),'Backtest base rate is 19.6% league-wide; these hitters clear it by a real margin.')]);
}

/* ---------- Parlay Builder ---------- */
export function parlayBuilder(){
  const b=board();if(!b.players?.length)return pageHead('Parlay Builder')+noSlate();
  const types=S.f.sgpTypes??=['HR','Hit','HRR','Ks'],legsN=+(S.f.sgpLegs||3),mode=S.f.sgpMode||'likelihood',same=!!S.f.sgpSame;
  E.setYardState('sgpTypes',new Set(types));E.setYardState('sgpLegs',legsN);E.setYardState('sgpMode',mode);E.setYardState('sgpSameGame',same);
  const legs=E.genParlay(E.sgpPool()),prob=same||!legs.length?null:legs.reduce((p,l)=>p*l.prob,1);
  return pageHead('Parlay Builder','Builds a parlay from the model’s selections: choose the markets, the number of legs and the goal. Different games by default, one selection per player. Combined chance assumes the games are independent, which is an approximation; same-game legs can move together, so no combined chance is given for those.')+
    tools([['HR','Home runs'],['Hit','Hits'],['HRR','H+R+RBI'],['Ks','Strikeouts']].map(([k,l])=>btn(l,'sgpType',k,types.includes(k)?'on':'')).join(''))+
    tools(`<span class="subtle">Legs</span>`+[2,3,4,5,6].map(n=>btn(n,'set','sgpLegs:'+n,legsN===n?'on':'')).join('')+`<span class="subtle">Goal</span>`+[['likelihood','Most likely'],['ev','Best value'],['balanced','Balanced'],['longshot','Longshot']].map(([k,l])=>btn(l,'set','sgpMode:'+k,mode===k?'on':'')).join('')+btn(same?'Same game only':'Any games','flip','sgpSame',same?'on':''))+
    (legs.length?box(`${legs.length}-leg ${same?'same-game parlay':'parlay'}`,legsTable(legs)+grid(3,[metric('Combined chance',prob==null?'Not estimated':pct(prob,1)),metric('Model fair price',prob==null?'—':esc(E.americanFair(prob))),metric('Ticket price','Check your book')])):
      box('',empty(mode==='ev'?'Best value needs priced legs with a positive edge in the chosen markets. Try more markets or another goal.':'No parlay fits these settings.')));
}

/* ---------- Parlay Scanner ---------- */
export function parlayScanner(){
  const b=board();if(!b.players?.length)return pageHead('Parlay Scanner')+noSlate();
  const s1=E.scanStep1_games(),s2=E.scanStep2_arms(),s3=E.scanStep3_contact(),s4=E.scanStep4_power(),ids=byId();
  const ticket=(t,title)=>t?box(title,`<p class="subtle">${esc(t.subtitle||'')}</p>`+legsTable((t.legs||[]).map(l=>({...l,label:'Home run',price:l.book_odds})),{extra:['Crowd',l=>cell(ownBadge(l.ownership_tier),'plain')]})+
    (t.combined_prob!=null?`<p class="subtle">Combined chance <strong>${pct(t.combined_prob,1)}</strong>${t.fair_odds!=null?' · model fair '+am(t.fair_odds):''}${t.p_at_least_one_pair_hits!=null?` · at least one pair hits ${pct(t.p_at_least_one_pair_hits)}`:''}</p>`:'')):'';
  const pow=b.cross_game_parlays_pow||{},open=b.cross_game_parlays_genius_open||{},cg=b.cross_game_parlays||{};
  return pageHead('Parlay Scanner','hr-board’s four-step daily workflow run against tonight’s board, then its parlay tickets. Every number is a live field from the board, so it never disagrees with the other pages for the same player.')+
    grid(2,[box('1 · Game totals',table(['Game','Line','Chance over'],s1.map(g=>[cell(`${team(g.away)} <span class="muted">@</span> ${team(g.home)}<br><small class="muted">${esc(g.park||'')}${g.hasRealLine?'':' · no line posted, 7.5 used'}</small>`),'O'+g.line,chanceCell(g.pOver75)]),{cls:'compact',empty:'No graded totals yet.'}),'Highest chance of clearing the game total.'),
      box('2 · First five or run-line favourite',table(['Team','Starter','F5 win'],s2.map(x=>[cell(`${team(x.team)} <small class="muted">vs ${esc(x.opp_team)}</small>`),cell(`${esc(x.sp_name)}${x.pitching_plus!=null?`<br><small class="muted">Pitching+ ${round(x.pitching_plus,0)}</small>`:''}`,'plain'),chanceCell(x.f5_wp)]),{cls:'compact',empty:'No side clears the bar tonight.'}),'Teams favoured through five innings behind a starter who is hard to hit.'),
      box('3 · Contact and H+R+RBI targets',table(['Hitter','Why','Best'],s3.map(p=>({act:'player',v:p.id,cls:'clickable',cells:[who(p,ids),cell([p.vuln>=55&&`arm vuln ${round(p.vuln,0)}`,p.tgt_tier&&p.tgt_tier!=='AVOID'&&`target ${p.tgt_tier}`,p.penWeak&&'weak pen'].filter(Boolean).map(esc).join(' · ')||'—','plain'),cell(pct(p.best)+`<br><small class="muted">${p.hitP===p.best?'1+ hit':'2+ H+R+RBI'}</small>`,p.best>=.6?'good heat':'mid heat')]})),{cls:'compact',empty:'No hitter qualifies yet.'})),
      box('4 · Power to H+R+RBI floor',table(['Hitter','Profile','2+ H+R+RBI'],s4.map(p=>({act:'player',v:p.id,cls:'clickable',cells:[who(p,ids),cell(`${p.bbe} BBE · ${p.fams} families · ${p.nm} near misses${p.relaxed?' · relaxed tier':''}`,'plain'),chanceCell(p.hrrP)]})),{cls:'compact',empty:'Nobody clears even the relaxed gate tonight.'}))])+
    ticket(pow.genius,'Genius Pairing (POW)')+ticket(open.genius,'Genius Pairing (open pool)')+ticket(pow.genius5,'Genius 5 round robin')+
    (pow.genius_top10?.length?box('Genius top 10',legsTable(pow.genius_top10.map(l=>({...l,label:'Home run',price:l.book_odds}))),'The pool the tickets draw from, with no one-per-game rule since these are straight bets.'):'')+
    ticket(cg.anchor,'Cross-game optimizer · '+(cg.anchor?.label||''))+ticket(cg.overlooked,'Cross-game optimizer · '+(cg.overlooked?.label||''));
}

/* ---------- Ladder Challenge ---------- */
export function ladder(){
  const st=E.ladderState();
  if(!st){const wk=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
    return pageHead('Ladder Challenge','Roll a small stake into a target by a deadline: one bet a day, winnings rolled over. Each day the tool finds the safest leg or combination (highest model probability) that pays the multiplier you need. A miss resets the ladder to your starting stake.')+
      box('Start a ladder',`<div class="filters"><label class="field">Starting amount $<input id="ladStart" type="number" inputmode="decimal" value="5" min="1" step="1"></label><label class="field">Target $<input id="ladTarget" type="number" inputmode="decimal" value="1000" min="2" step="1"></label><label class="field">Reach it by <input id="ladDeadline" type="date" value="${wk}"></label></div>`+
        tools(btn('Start the ladder','ladder','start','primary'))+'<p class="subtle">Even with the safest legs each day, the chance of finishing a fast ladder is small. Only use money you are fine losing.</p>');}
  const b=board(),won=st.current>=st.target,days=E._ladDaysLeft(st.deadline),req=Math.pow(Math.max(1,st.target/st.current),1/days),mode=st.legMode||'auto';
  const pick=won||st.busted||!b.players?.length?null:E.ladderPick(req,mode);
  const prog=Math.min(100,100*Math.log(st.current/st.start)/Math.log(st.target/st.start||1));
  const userDec=pick?pick.legs.reduce((a,l,i)=>a*(E.americanToDecimal(S.f['ladOdd'+i]??l.price)||l.dec),1):null;
  S.f.ladPick=pick;
  const head=grid(4,[metric('Bankroll','$'+st.current.toFixed(2),'started at $'+st.start),metric('Target','$'+Math.round(st.target),`${Math.max(0,Math.round(prog))}% of the way`),metric('Day',st.day,`${days} day${days===1?'':'s'} left`),metric('Today must pay',am(E._decToAm(req)),req.toFixed(2)+'×')]);
  let body;
  if(st.busted)body=box('Ladder broke',`<p>A leg missed, so the stake resets to $${st.start}. Ladders are meant to break; only climb with money you can lose.</p>`+tools(btn('Reset and climb again','ladder','restart','primary')));
  else if(won)body=box('Target reached',`<p>You turned $${st.start} into $${st.current.toFixed(2)}.</p>`+tools(btn('Run it again','ladder','restart','primary')));
  else if(!pick)body=box('No safe path tonight',`<p>Reaching your target needs about ${am(E._decToAm(req))} today and tonight’s board cannot back that safely. Push the deadline out or lower the target.</p>`+tools(btn('Log today as a miss','ladder','miss')));
  else body=box(`Safest ${pick.legs.length>1?pick.legs.length+'-leg parlay':'single'} · ${pct(pick.prob)} to hit`,tools(`<span class="subtle">Legs</span>`+['auto','1','2','3'].map(m=>btn(m==='auto'?'Safest':m,'ladder','legs:'+m,mode===m?'on':'')).join(''))+
    table(['Leg','Selection','Model chance','Your odds'],pick.legs.map((l,i)=>[cell(`<strong>${esc(l.name)}</strong><br><small class="muted">${esc(l.team||'')}</small>`),esc(l.label),chanceCell(l.prob),cell(`<input type="number" inputmode="numeric" class="price-in" data-field="ladOdd${i}" aria-label="Odds for ${esc(l.name)}" value="${esc(Math.round(parseFloat(S.f['ladOdd'+i]??l.price)))}">`,'plain')]),{cls:'compact'})+
    grid(3,[metric('Your combined',am(E._decToAm(userDec)),userDec.toFixed(2)+'×',userDec>=req?'good':'bad'),metric('Rolls to','$'+(st.current*userDec).toFixed(2)),metric('Chance to finish from here',(Math.pow(pick.prob,days)*100<1?'<1':Math.round(Math.pow(pick.prob,days)*100))+'%')])+
    tools(btn('Hit · roll it over','ladder','hit','primary')+btn('Miss','ladder','miss'))+'<p class="subtle">Odds start at the model’s fair price. Change each leg to what your book posts and the payout updates.</p>');
  const hist=(st.history||[]).slice().reverse().slice(0,10);
  return pageHead('Ladder Challenge')+head+body+(hist.length?box('Ladder log',table(['Date','Result','Legs','Odds'],hist.map(h=>[esc(h.date),cell(h.result==='hit'?'Hit':'Miss',h.result==='hit'?'good heat':'bad heat'),esc(h.legs.map(l=>l.name).join(' + ')),h.comboDec?h.comboDec.toFixed(2)+'×':'—']),{cls:'compact'})):'')+
    tools(btn('End this ladder','ladder','clear'));
}
export function ladderAction(v){
  const st=E.ladderState(),pick=S.f.ladPick;
  if(v==='start'){const s=parseFloat(document.getElementById('ladStart')?.value),t=parseFloat(document.getElementById('ladTarget')?.value),dl=document.getElementById('ladDeadline')?.value;
    if(!(s>0)||!(t>s)||!dl)return 'Enter a starting amount, a larger target and a deadline.';
    E.ladderSave({start:s,target:t,deadline:dl,current:s,day:1,startedAt:E._ladDay(),busted:false,legMode:'auto',history:[]});return null;}
  if(!st)return null;
  const legsOf=()=>pick.legs.map((l,i)=>({name:l.name,label:l.label,prob:l.prob,price:S.f['ladOdd'+i]??l.price}));
  const dec=()=>pick.legs.reduce((a,l,i)=>a*(E.americanToDecimal(S.f['ladOdd'+i]??l.price)||l.dec),1);
  if(v==='hit'&&pick){const d=dec();st.history.push({date:E._ladDay(),legs:legsOf(),comboDec:d,comboProb:pick.prob,result:'hit'});st.current=Math.round(st.current*d*100)/100;st.day+=1;}
  else if(v==='miss'){if(pick)st.history.push({date:E._ladDay(),legs:legsOf(),comboDec:dec(),comboProb:pick.prob,result:'miss'});st.busted=true;}
  else if(v==='restart'){Object.assign(st,{current:st.start,day:1,busted:false,history:[],startedAt:E._ladDay()});}
  else if(v==='clear'){try{localStorage.removeItem('gy_ladder');}catch{}return null;}
  else if(v.startsWith('legs:'))st.legMode=v.slice(5);
  for(const k of Object.keys(S.f))if(k.startsWith('ladOdd'))delete S.f[k];
  E.ladderSave(st);return null;
}

/* ---------- HR Calendar ---------- */
export function calendar(){
  const days=(S.yardHistory?.days||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  if(!days.length)return pageHead('HR Calendar')+box('',empty('No graded days yet. The calendar fills in each morning after games go final.'));
  const byDate=Object.fromEntries(days.map(d=>[d.date,d])),months=[...new Set(days.map(d=>d.date.slice(0,7)))];
  const month=months.includes(S.f.calMonth)?S.f.calMonth:months.at(-1),mi=months.indexOf(month),[Y,M]=month.split('-').map(Number);
  const mDays=days.filter(d=>d.date.startsWith(month)),tot=mDays.reduce((s,d)=>s+(d.total_hr||0),0);
  const hi=mDays.reduce((m,d)=>!m||d.total_hr>m.total_hr?d:m,null),lo=mDays.reduce((m,d)=>!m||d.total_hr<m.total_hr?d:m,null);
  const avg=mDays.length?tot/mDays.length:0,shadeHR=n=>n==null?'none':n>=avg*1.2?'good heat':n<=avg*.8?'bad heat':'mid heat';
  const first=new Date(Y,M-1,1).getDay(),dim=new Date(Y,M,0).getDate();
  let cells='';for(let i=0;i<first;i++)cells+='<span class="cal-cell blank"></span>';
  for(let d=1;d<=dim;d++){const ds=`${Y}-${String(M).padStart(2,'0')}-${String(d).padStart(2,'0')}`,r=byDate[ds];
    cells+=r?`<button type="button" class="cal-cell ${shadeHR(r.total_hr)}${S.f.calDay===ds?' selection':''}" ${'data-act="set" data-v="calDay:'+ds+'"'} aria-label="${esc(dateLabel(ds))}: ${r.total_hr} home runs"><small>${d}</small><strong>${r.total_hr}</strong></button>`:`<span class="cal-cell empty-day"><small>${d}</small></span>`;}
  const sel=byDate[S.f.calDay]&&S.f.calDay.startsWith(month)?byDate[S.f.calDay]:hi;
  const log=(sel?.hr_log||[]).slice().sort((a,b)=>(b.hr||0)-(a.hr||0)||(b.heat||0)-(a.heat||0)||(b.dist||0)-(a.dist||0));
  const tiers=sel&&!sel.backfilled?['70+','55-69','40-54','<40'].map(t=>`${t}: ${sel.by_tier?.[t]?.hr||0} of ${sel.by_tier?.[t]?.n||0}`).join(' · '):'Before live tracking began: home run facts from Statcast, no model overlay.';
  return pageHead('HR Calendar','Home runs per day across the season, graded each morning. Pick a day for who went deep, their Heat and board rank before first pitch, and whether the signals found them.')+
    tools(btn('‹','calMonth',months[Math.max(0,mi-1)],'sq')+`<span class="period-label">${new Date(Y,M-1,1).toLocaleString('en-US',{month:'long',year:'numeric'})}</span>`+btn('›','calMonth',months[Math.min(months.length-1,mi+1)],'sq')+
      `<span class="subtle">${tot} HR · ${avg.toFixed(1)} a day${hi?` · high ${hi.total_hr}`:''}${lo?` · low ${lo.total_hr}`:''}</span>`)+
    grid(2,[box('',`<div class="cal-grid">${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>`<span class="cal-dow">${d}</span>`).join('')}${cells}</div>`),
      box(sel?`${dateLabel(sel.date)} · ${sel.total_hr} home runs`:'Pick a day',sel?`<p class="subtle">${sel.hitters_homered||log.length} hitters · ${sel.sp_hr||0} off starters, ${sel.bp_hr||0} off bullpens${sel.avg_hr_dist?` · average ${sel.avg_hr_dist} ft / ${sel.avg_hr_ev} mph`:''}</p><p class="tiny">By Heat band: ${esc(tiers)}</p>`+
        table(['Hitter','Heat','Rank before','Distance','Badges'],log.map(x=>[cell(`<strong>${esc(x.name)}</strong>${x.hr>1?' ×'+x.hr:''}`),x.heat==null?'—':heatCell(x.heat),[x.heat_rank!=null&&'Heat #'+x.heat_rank,x.cv_rank!=null&&'Conv #'+x.cv_rank].filter(Boolean).join(' · ')||'—',x.dist?x.dist+' ft':'—',cell((x.badges||[]).map(k=>badge(k)).join(' ')||'—','plain')]),{cls:'compact',empty:'No home runs logged.'}):'')]);
}

/* ---------- HR Patterns ---------- */
export function patterns(){
  if(!S.yardHistory?.days?.length)return pageHead('HR Patterns')+box('',empty('No graded days yet.'));
  const win=S.f.hrpWin||'season',mode=S.f.hrpMode||'signals';
  E.setYardState('hrpWin',win);E.setYardState('hrpDamp',S.f.hrpDamp||'balanced');
  const days=E.hrpDays(),{rows,base,tot,hrs}=E.hrpAggregate(days),MIN=win==='7d'?40:win==='month'?90:150;
  for(const r of rows){r.rate=r.n?r.hr/r.n:0;r.lift=base?r.rate/base:0;const [lo,hi]=E.wilson(r.hr,r.n);r.moe=100*(hi-lo)/2;r.thin=r.n<MIN;r.solid=!r.thin&&(lo>base||hi<base);}
  const ranked=rows.filter(r=>r.n>=Math.max(20,MIN/3)).sort((a,b)=>a.thin!==b.thin?(a.thin?1:-1):b.rate-a.rate);
  const note=win==='7d'?'Seven days is too short to rank signals: week-to-week movement is explained by sampling. Read it as what happened this week. Use Season to decide anything.':win==='month'?'Thirty days shows large effects and not much else. Solid rows have an interval that clears the base rate.':'The full tracked history: the only window with enough games to separate a real edge from luck. Solid rows clear the base rate with 95% confidence.';
  let body;
  if(mode==='players'){
    const W=E.hrpWeights(rows,base),list=(board().players||[]).map(p=>{let score=0;const parts=[];for(const id of E.hrpPlayerSignals(p)){const w=W[id];if(!w)continue;const c=w.lift-1;if(Math.abs(c)<.005)continue;score+=c;parts.push({key:id.split(':').slice(1).join(':'),c});}parts.sort((a,b)=>b.c-a.c);return {p,score,parts};})
      .filter(x=>x.parts.length).sort((a,b)=>b.score-a.score).slice(0,40);
    body=tools(`<span class="subtle">Weighting</span>`+[['raw','Raw'],['balanced','Balanced'],['strict','Strict']].map(([k,l])=>btn(l,'set','hrpDamp:'+k,(S.f.hrpDamp||'balanced')===k?'on':'')).join(''))+
      table(['#','Hitter','Signals carried','Score'],list.map((x,i)=>({act:'player',v:x.p.id,cls:'clickable',cells:[i+1,hitter(x.p),cell(x.parts.slice(0,4).map(s=>badge(`${s.key} ${signed(s.c*100,0)}`,s.c>0?'g':'r')).join(' '),'plain'),cell(signed(x.score*100,0),x.score>=.3?'good heat':x.score>0?'mid heat':'bad heat')]})),{wrap:'box',empty:'No overlap between tonight’s board and graded signals yet.'});
  }else body=table(['Signal','Group','HR rate','±','Lift','Player-games'],ranked.map(r=>({cls:r.thin?'dim':'',cells:[cell(`<strong>${esc(r.key)}</strong>`),esc(r.label),cell(pct(r.rate,1),r.thin?'':r.solid&&r.rate>base?'good heat':r.solid&&r.rate<base?'bad heat':'mid heat'),'±'+r.moe.toFixed(1),r.lift.toFixed(2)+'×',r.n.toLocaleString()]})),{sort:'yard-hrp',wrap:'box',empty:'Not enough graded games in this window.'});
  return pageHead('HR Patterns','Built only from graded results: how often a player-game carrying each signal ended in a home run. ± is the 95% margin of error; rows whose ranges overlap are not meaningfully different. Lift is the rate divided by the base rate, so 1.00× told you nothing.',` · ${days.length} graded days · ${tot.toLocaleString()} player-games · ${hrs.toLocaleString()} HR · base rate ${pct(base,2)}`)+
    tools([['7d','7 days'],['month','30 days'],['season','Season']].map(([k,l])=>btn(l,'set','hrpWin:'+k,win===k?'on':'')).join('')+btn('Signals','set','hrpMode:signals',mode==='signals'?'on':'')+btn('Tonight’s players','set','hrpMode:players',mode==='players'?'on':''))+
    `<p class="subtle">${note}</p>`+body;
}

/* ---------- Guide ---------- */
export function guide(){
  return pageHead('Guide & FAQ','What every part of the Going Yard model means, from hr-board’s own guide.')+
    E.GUIDE.map(([t,b],i)=>`<details class="details" ${i===0?'open':''}><summary>${esc(t)}</summary><div class="subtle guide-body">${b}</div></details>`).join('');
}
// A price typed into the Edge Finder, saved the way hr-board saves it.
import {setManualPrice} from './yard-store.mjs';
export function setPrice(id,value){setManualPrice(board().slate_date,id,value,E.oddsManual());}
