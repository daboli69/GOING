import {american,pct,round} from './math.mjs';
import {current as S,badge,box,btn,empty,esc,et,grid,keep,local,metric,slate,table,toast,tools} from './ui.mjs';
import {href} from './config.mjs';
import {buildTicket,defaults,evaluate,legKey,markets,ticketMath,weights} from './nba-parlay-engine.mjs';

const settingsKey='nba-parlay-settings', ticketsKey='nba-parlay-tickets';
const weightNames={form:'Hit rates',matchup:'Matchup',line:'Line vs average',context:'Game context',mix:'Stat variety'};
const bounds={legs:[2,10],hit:[0,100],sample:[1,30],spread:[0,14.5],total:[0,300],minOdds:[1.01,101],maxOdds:[1.01,101]};
const outcomes=['Pending','Hit','Miss','Push','Void'];
export const savedParlayTickets=()=>{const value=local(ticketsKey,[]);return Array.isArray(value)?value:[];};
const saved=savedParlayTickets;
const numbers=(value,[min,max],fallback)=>{
  if(value===''||!Number.isFinite(Number(value)))return fallback;
  return Math.min(max,Math.max(min,Number(value)));
};
function config(){
  const value=local(settingsKey,{});
  return {...defaults,...value,weights:{...weights,...value.weights}};
}
function draft(){
  if(S.f.parlay?.day!==S.day)S.f.parlay={day:S.day,locked:[],ticket:[],message:''};
  return S.f.parlay;
}
function preserveDetails(target){
  const panel=target.closest('details');
  S.f.parlayWeights=!!document.querySelector('details[data-parlay-weights]')?.open;
  if(panel?.dataset.parlayTicket)S.f.parlayHistory=panel.dataset.parlayTicket;
}
const takenLegs=(except)=>new Set(saved().filter(ticket=>ticket.id!==except)
  .flatMap(ticket=>ticket.legs.filter(leg=>leg.result!=='Void').map(legKey)));
const inspect=(rows,cfg)=>evaluate(rows,cfg,{taken:takenLegs()});
const toggle=(values,value)=>values.includes(value)?values.filter(x=>x!==value):[...values,value];
const field=(label,key,type,attrs,value)=>`<label class="field">${label} <input type="${type}" data-parlay="${key}" ${attrs} ${value}></label>`;
const check=(label,key,on)=>field(label,key,'checkbox','',on?'checked':'');
const number=(label,key,value,min,max,step=1)=>field(label,key,'number',`min="${min}" max="${max}" step="${step}"`,`value="${esc(value)}"`);
const select=(label,key,value,options)=>`<label class="field">${esc(label)} <select data-parlay="${key}">${options.map(([v,t])=>
  `<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const oddsText=price=>Number(price)>0?'+'+Number(price):String(price);
const timeLabel=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'
}).format(new Date(value)):'Unknown';
const gameName=g=>g.a+' @ '+g.h;
const tagList=items=>items.map(item=>badge(esc(item))).join(' ');

function exclusions(data,cfg){
  const playerLabel=id=>data.roster.find(p=>p.id===id)?.name||id;
  const gameLabel=id=>{const g=data.games.find(x=>String(x.id)===id);return g?gameName(g):id;};
  return tools(
    select('Exclude game','game','',[['','Choose a game'],...data.games.filter(g=>!cfg.games.includes(String(g.id))).map(g=>[String(g.id),gameName(g)])])+
    select('Exclude player','player','',[['','Choose a player'],...[...data.roster].filter(p=>!cfg.players.includes(p.id))
      .sort((a,b)=>a.name.localeCompare(b.name)).map(p=>[p.id,p.name+' · '+p.team])])+
    check('Exclude legs on my tickets','skipTickets',cfg.skipTickets)
  )+tools(cfg.games.map(id=>btn(esc(gameLabel(id))+' ×','parlayIncludeGame',id,'outline')).join('')+
    cfg.players.map(id=>btn(esc(playerLabel(id))+' ×','parlayIncludePlayer',id,'outline')).join(''));
}

function controls(data,cfg){
  return tools(number('Legs','legs',cfg.legs,2,10)+select('Sides','side',cfg.side,['Both','Over','Under'].map(side=>[side,side]))+
      check('One leg per game','perGame',cfg.perGame))+
    tools(markets.map(stat=>btn(esc(stat),'parlayStat',stat,cfg.stats.includes(stat)?'on':'')).join(''))+
    tools(number('Min. hit rate %','hit',cfg.hit,0,100)+number('Min. type sample','sample',cfg.sample,1,30)+
      number('Max. spread','spread',cfg.spread,0,14.5,.5)+number('Min. total','total',cfg.total,0,300,.5))+
    tools(number('Min. decimal odds','minOdds',cfg.minOdds,1.01,101,.01)+number('Max. decimal odds','maxOdds',cfg.maxOdds,1.01,101,.01))+
    exclusions(data,cfg)+
    `<details data-parlay-weights ${S.f.parlayWeights?'open':''}><summary>Scoring weights</summary>${tools(Object.entries(weightNames).map(([key,label])=>
      number(label,'weight-'+key,cfg.weights[key],0,10,.5)).join(''))}</details>`+
    tools(btn('Generate','parlayGenerate','','primary')+btn('Regenerate','parlayRegenerate')+
      btn('Reset filters','parlayReset','', 'outline'));
}

function ticketTable(ticket,locked){
  return table(['Player','Game','Leg','Quote','L10','Season','Reasons','Flags',''],ticket.map(leg=>{
    const key=legKey(leg), pinned=locked.includes(key);
    return [esc(leg.name+' · '+leg.team),esc(leg.team+' vs '+leg.opp+' · '+et({iso:leg.tip})+' ET'),esc(leg.side+' '+leg.line+' '+leg.stat),
      esc(oddsText(leg.price)+' · '+leg.provider)+`<small class="muted"><br>Last updated ${esc(timeLabel(leg.capturedAt))}</small>`,
      pct(leg.form.last10.rate),pct(leg.form.season.rate),tagList(leg.reasons),tagList(leg.flags),
      btn(pinned?'Unlock':'Lock','parlayLock',key,pinned?'on':'outline')+(pinned?'':btn('Swap','parlaySwap',key,'outline'))];
  }),{wrap:'box'});
}

function mathSummary(ticket){
  const m=ticketMath(ticket);
  return grid(4,[metric('Combined line odds',esc(american(m.quoted)), 'Gross return $'+round(10*m.decimal,2)+' per $10'),
    metric('Adjusted chance estimate',pct(m.adjusted,2),'Season rates shrunk toward 50%'),
    metric('Raw hit-rate product',pct(m.naive,2),'Season rates multiplied'),
    metric('Quote-implied chance',pct(m.quoted,2),'Individual quotes multiplied')])+
    `<p class="subtle">Historical hit rates can differ from future results. The estimates assume independent legs, and the theoretical return excludes fees.${m.sameGame?' Same-game correlation makes the estimates less reliable.':''}</p>`;
}

function resultSummary(legs){
  const results=legs.map(l=>l.result);
  if(results.includes('Miss'))return 'Miss';
  if(results.includes('Pending'))return 'Pending';
  return results.includes('Hit')?'Hit':'Void';
}

function filterLabel(filters){
  return [filters.side,filters.stats.join(', '),filters.hit+'% min. hit rate',filters.sample+'-game type sample',
    filters.spread+' max spread',filters.total+' min. total',filters.minOdds+'–'+filters.maxOdds+' decimal odds',
    filters.perGame?'one per game':'same-game allowed',filters.skipTickets?'overlap excluded':'overlap allowed',
    filters.games.length+' game / '+filters.players.length+' player exclusions',
    ...Object.entries(weightNames).map(([key,name])=>name+' weight '+filters.weights[key])].join(' · ');
}

function history(){
  const tickets=saved();
  if(!tickets.length)return empty('Generated tickets are saved here in this browser.');
  const results=new Map();
  const rows=tickets.map(t=>{
    const filters=t.filters;
    const result=resultSummary(t.legs), label=filterLabel(filters);
    const key=JSON.stringify(filters);
    if(!results.has(key))results.set(key,{label,requested:filters.legs,Hit:0,Miss:0});
    if(result==='Hit'||result==='Miss')results.get(key)[result]++;
    const body=table(['Leg','Quote','Result'],t.legs.map((leg,i)=>[esc(leg.name+' · '+leg.side+' '+leg.line+' '+leg.stat),
      esc(oddsText(leg.price)+' · '+leg.provider),select('Result for '+leg.name,'result:'+t.id+':'+i,leg.result,outcomes.map(x=>[x,x]))]),{wrap:'box'});
    const counts=outcomes.map(result=>[result,t.legs.filter(leg=>leg.result===result).length]).filter(([,n])=>n);
    return `<details data-parlay-ticket="${esc(t.id)}" ${S.f.parlayHistory===t.id?'open':''}><summary>${esc(t.date)} · ${t.legs.length}/${filters.legs} legs · ${result} · ${esc(timeLabel(t.createdAt))}</summary>
      <p class="subtle">${esc(label)} · ${esc(counts.map(([result,n])=>n+' '+result.toLowerCase()).join(', '))}</p>${body}</details>`;
  });
  const graded=[...results.values()].filter(x=>x.Hit+x.Miss>0);
  return (graded.length?table(['Saved filters','Requested legs','Hit','Miss'],graded.map(x=>[esc(x.label),x.requested,x.Hit,x.Miss]),{wrap:'box'}):'')+rows.join('');
}

const hints={'Maximum spread':'Raise maximum spread toward 14.5.', 'Minimum total':'Lower the minimum game total.',
  'Type sample':'Try a smaller type-edge sample.', 'Season or L10 hit rate':'Try a lower minimum hit rate.',
  'Odds range':'Widen the odds range.', 'Existing tickets':'Allow legs already on your tickets.',
  'Excluded matchup':'Restore an excluded game.', 'Excluded player':'Restore an excluded player.'};
function shortage(data,cfg,report,count){
  if(count>=cfg.legs)return '';
  if(!data.rows.length)return empty('No priced NBA props were published for this slate. Try again after the next price refresh.');
  if(!cfg.stats.length)return empty('Select at least one stat type.');
  const ranked=[...report.cuts].sort((a,b)=>b[1]-a[1]);
  const limited=cfg.perGame&&new Set(report.eligible.map(leg=>leg.game)).size<cfg.legs&&report.eligible.length>=cfg.legs;
  const suggestion=limited?'Lower the leg count or allow same-game legs.':
    hints[ranked.find(([reason])=>hints[reason])?.[0]]||'Try a smaller ticket, more stat types, or a slate with more qualifying games.';
  return `<p>${count} of ${cfg.legs} legs available for this ticket. ${esc(suggestion)}</p>`+
    (ranked.length?`<p class="subtle">Most common cuts: ${esc(ranked.slice(0,4).map(([reason,n])=>reason+' ('+n+')').join(' · '))}</p>`:'');
}

export function parlayPage(data){
  const cfg=config(), state=draft(), report=inspect(data.rows,cfg);
  const preview=buildTicket(report.eligible,cfg).ticket;
  const current=new Map(report.eligible.map(leg=>[legKey(leg),leg]));
  const overlaps=takenLegs(state.savedId);
  const ticket=state.ticket.map(leg=>{
    const flags=[...new Set([...leg.flags,...(current.get(legKey(leg))?.flags||[])])];
    if(overlaps.has(legKey(leg))&&!flags.includes('On an existing ticket'))flags.push('On an existing ticket');
    if(Date.now()-Date.parse(leg.capturedAt)>90*60000&&!flags.includes('Stale quote'))flags.push('Stale quote');
    return {...leg,flags};
  });
  return `<h1>Suggested Parlays</h1><p><a class="pill" href="${href('up/parlay-tracker.html')}">Parlay Leg Tracker</a></p>`+slate({navOnly:true,date:true})+
    box('Filters',controls(data,cfg))+
    box('Suggested ticket',(state.message?`<p class="subtle" role="status">${esc(state.message)}</p>`:'')+
      shortage(data,cfg,report,ticket.length||preview.length)+
      (ticket.length?ticketTable(ticket,state.locked)+(ticket.length>=2?mathSummary(ticket):''):empty('Generate a ticket from the eligible legs.')))+
    box('Ticket history',history());
}

function saveTicket(ticket,cfg){
  const all=saved();
  const key=legs=>legs.map(leg=>legKey(leg)+'|'+leg.price).sort().join(';');
  const previous=all.find(old=>key(old.legs)===key(ticket)&&JSON.stringify(old.filters)===JSON.stringify(cfg));
  if(previous)return previous.id;
  const entry={id:crypto.randomUUID(),date:S.day,createdAt:new Date().toISOString(),filters:cfg,
    legs:ticket.map(leg=>({...leg,result:'Pending'}))};
  try{keep(ticketsKey,[entry,...all]);return entry.id;}
  catch{toast('Could not save this ticket in browser storage.');return false;}
}

export function parlayAction(act,value,data,target){
  const state=draft(), cfg=config();
  if(target)preserveDetails(target);
  if(act==='parlayField'){
    const [key,val]=JSON.parse(value);
    if(key.startsWith('result:')){
      const [,id,index]=key.split(':'), all=saved(), ticket=all.find(t=>t.id===id);
      if(ticket?.legs[index]&&outcomes.includes(val)){ticket.legs[index].result=val;keep(ticketsKey,all);S.f.parlayHistory=id;}
      return true;
    }
    if(key.startsWith('weight-')){const k=key.slice(7);if(Object.hasOwn(weights,k))cfg.weights[k]=numbers(val,[0,10],weights[k]);S.f.parlayWeights=true;}
    else if(Object.hasOwn(bounds,key)){
      cfg[key]=numbers(val,bounds[key],defaults[key]);
      if(key==='legs'||key==='sample')cfg[key]=Math.round(cfg[key]);
      if(target)target.value=cfg[key];
    }else if(['perGame','skipTickets'].includes(key))cfg[key]=val===true;
    else if(key==='side'&&['Both','Over','Under'].includes(val))cfg.side=val;
    else if(val&&key==='game')cfg.games=toggle(cfg.games,val);
    else if(val&&key==='player')cfg.players=toggle(cfg.players,val);
  }else if(act==='parlayStat')cfg.stats=toggle(cfg.stats,value);
  else if(act==='parlayIncludeGame')cfg.games=toggle(cfg.games,value);
  else if(act==='parlayIncludePlayer')cfg.players=toggle(cfg.players,value);
  else if(act==='parlayReset'){
    keep(settingsKey,defaults);state.ticket=[];state.locked=[];state.message='';return true;
  }else if(act==='parlayLock'){
    if(state.ticket.some(leg=>legKey(leg)===value))state.locked=toggle(state.locked,value);
    return true;
  }else if(['parlayGenerate','parlayRegenerate','parlaySwap'].includes(act)){
    if(cfg.minOdds>cfg.maxOdds){state.message='Minimum odds exceed maximum odds.';return true;}
    const taken=takenLegs();
    // A user can retain their current legs during a swap or lock. New legs still obey ticket exclusion.
    const current=state.ticket.map(legKey);
    for(const key of current)if(state.locked.includes(key)||act==='parlaySwap'&&key!==value)taken.delete(key);
    const {eligible}=evaluate(data.rows,cfg,{taken});
    const locked=act==='parlaySwap'?current.filter(key=>key!==value):state.locked;
    const avoid=new Set(act==='parlayRegenerate'?current:[]);
    const excluded=new Set(act==='parlaySwap'?[value]:[]);
    const {ticket,invalidLock}=buildTicket(eligible,cfg,{locked,avoid,excluded});
    if(invalidLock){state.message='A retained leg no longer qualifies. Unlock it or regenerate with different filters.';return true;}
    if(act==='parlaySwap'&&ticket.length<state.ticket.length){state.message='No eligible replacement matches this ticket.';return true;}
    if(act==='parlaySwap'){
      const replacement=ticket.find(leg=>!locked.includes(legKey(leg)));
      state.ticket=state.ticket.map(leg=>legKey(leg)===value?replacement:leg);
    }else state.ticket=ticket;
    state.message='';
    state.savedId=state.ticket.length>=2?saveTicket(state.ticket,cfg):null;
    if(state.savedId)state.message='Ticket saved in this browser.';
    return true;
  }else return false;
  keep(settingsKey,cfg);
  state.message='Filters changed. Generate to apply them to a new ticket.';
  return true;
}
