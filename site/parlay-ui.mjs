// The Suggested Parlays page shared by GOING UP (nba-parlays.mjs) and GOING LONG (nfl-parlays.mjs): filters, the
// suggested ticket with lock and swap, ticket math and the saved ticket history. Each sport passes its engine and the
// filters that apply to it.
import {american,pct,round} from './math.mjs';
import {current as S,badge,box,btn,empty,esc,et,grid,keep,local,metric,table,toast,tools} from './ui.mjs';
import {buildTicket,legKey,ticketMath} from './parlay-core.mjs';

const outcomes=['Pending','Hit','Miss','Push','Void'];
const oddsText=price=>Number(price)>0?'+'+Number(price):String(price);
// The odds filter is stored as decimal odds (the engine and saved settings use them) but shown and typed as American odds.
// Between -100 and +100 there are no American prices, so typed values in that gap mean even money (+100).
export const toAmerican=d=>d>=2?Math.round((d-1)*100):Math.round(-100/(d-1));
export const fromAmerican=a=>Math.abs(a)<100?2:a>0?1+a/100:1+100/-a;
const americanText=d=>oddsText(toAmerican(d));
export function parlayPool({eligible},ticket,{chance,legText,tag,form,note,actions,title='Full List',intro='',emptyText='No priced legs pass the current filters.'}){
  if(!eligible.length)return box(title,intro+empty(emptyText));
  const onTicket=new Set(ticket.map(legKey));
  const ranked=eligible.map(leg=>({leg,chance:chance(leg)}))
    .sort((a,b)=>b.chance-a.chance||b.leg.form.season.n-a.leg.form.season.n||b.leg.score-a.leg.score);
  const rows=ranked.map(({leg,chance})=>`<li><div class="parlay-pool-row"><div><strong>${esc(leg.name)}</strong> ${esc(leg.team+' vs '+leg.opp)}
    <div>${esc(legText(leg)+' · '+oddsText(leg.price)+' '+leg.provider)} ${badge(esc(tag(leg)))} ${onTicket.has(legKey(leg))?badge('On ticket','g'):''}</div></div>
    <strong>${pct(chance,1)}</strong></div>
    <p class="subtle">${esc(form(leg))}</p>
    <p><strong>Why it qualifies</strong> ${esc(leg.reasons.join(' · '))}</p>
    ${leg.flags.length?`<p class="subtle"><strong>Watch</strong> ${esc(leg.flags.join(' · '))}</p>`:''}
    ${actions?.(leg)||''}</li>`);
  return box(title,intro+`<p class="subtle">${ranked.length} eligible ${ranked.length===1?'leg':'legs'}, ranked by estimated hit chance. ${esc(note)}</p>
    <ol class="parlay-pool">${rows.join('')}</ol>`);
}

export function parlayPoolSummary({eligible,screened},cfg,kickoff){
  const games=new Set(eligible.map(leg=>leg.game)).size;
  const sides=cfg.side==='Both'?['Over','Under']:[cfg.side];
  const quotes=sides.map(side=>{
    const fresh=screened.filter(leg=>leg.side===side&&!leg.checks.Quote&&!leg.checks['Quote freshness']&&!leg.checks[kickoff]).length;
    const qualified=eligible.filter(leg=>leg.side===side);
    const matchups=new Set(qualified.map(leg=>leg.game)).size;
    const matchupText=cfg.side==='Both'&&matchups?` across ${matchups} ${matchups===1?'game':'games'}`:'';
    return fresh?`${qualified.length} of ${fresh} ${side} quotes qualify${matchupText}`:`No fresh ${side} quotes`;
  });
  return [...quotes,`${games} qualifying ${games===1?'game':'games'}`].join(' · ')+
    (cfg.perGame&&!cfg.stacks&&games>0&&games<cfg.legs?`. One leg per game limits this ticket to at most ${games}.`:'');
}

export const timeLabel=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'
}).format(new Date(value)):'Unknown';
const gameName=g=>g.a+' @ '+g.h;
const tagList=items=>items.map(item=>badge(esc(item))).join(' ');
const toggle=(values,value)=>values.includes(value)?values.filter(x=>x!==value):[...values,value];
const field=(label,key,type,attrs,value)=>`<label class="field">${label} <input type="${type}" data-parlay="${key}" ${attrs} ${value}></label>`;
const check=(label,key,on)=>field(label,key,'checkbox','',on?'checked':'');
const number=(label,key,value,min,max,step=1)=>field(label,key,'number',`min="${min}" max="${max}" step="${step}"`,`value="${esc(value)}"`);
const select=(label,key,value,options)=>`<label class="field">${esc(label)} <select data-parlay="${key}">${options.map(([v,t])=>
  `<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const numbers=(value,[min,max],fallback)=>{
  if((typeof value!=='number'&&typeof value!=='string')||String(value).trim()===''||!Number.isFinite(Number(value)))return fallback;
  return Math.min(max,Math.max(min,Number(value)));
};
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const isTicket=value=>isRecord(value)&&typeof value.id==='string'&&Array.isArray(value.legs);
const isSavedLeg=leg=>isRecord(leg)&&typeof leg.name==='string'&&typeof leg.stat==='string'&&
  ['Over','Under'].includes(leg.side)&&Number.isFinite(leg.line);
const savedResult=leg=>outcomes.includes(leg.result)?leg.result:'Pending';
const baseHints={'Odds range':'Widen the odds range.','Existing tickets':'Allow legs already on your tickets.',
  'Excluded matchup':'Restore an excluded game.','Excluded player':'Restore an excluded player.'};

/* opts:
   settingsKey, ticketsKey  browser storage keys (unchanged for GOING UP, so saved tickets and filters carry over)
   engine                   {defaults, weights, markets, evaluate}
   weightNames              scoring weight labels by key
   fields                   numeric filters: [{key,label,min,max,step,integer}]
   summary(filters)         words describing the sport-specific filters on a saved ticket
   period()                 the slate a draft ticket belongs to (a day, or an NFL week)
   periodLabel()            how a saved ticket names that slate
   nav()                    the slate navigation shown above the filters
   intro                    HTML under the page title (links)
   afterTicket(data,report,ticket,cfg,taken)  optional market screening details
   poolSummary(report,filters)  optional summary of the priced pool shown above the ticket
   rankByChance             show hit chance and label the scoring weights as tie breakers
   resolveSavedLeg(leg)     enrich saved legs with automatic results when the sport supports it
   singleGame               select the game in the slate, instead of per-game and matchup-exclusion controls
   build                    optional ticket builder
   ticketSummary(ticket)    optional replacement for independent-leg math
   recent                   {key,label}: the recent-form record shown on the ticket
   legText(leg)             how a leg reads, e.g. "Over 6.5 Assists"
   noRows                   message or message function when no priced props exist
   hints                    cut reason -> suggestion
   checks                   extra on/off filters: [{key,label}]
   rules(cfg)               ticket rules passed to buildTicket (same-game stacks, leg limits)
   warnings(ticket)         notes shown under a ticket (correlation)
   prior                    wins and losses added per leg for the adjusted chance (default 5)
   chanceNote               how the adjusted chance is described
*/
export function createParlays(opts){
  const {settingsKey,ticketsKey,engine,weightNames,singleGame,resolveSavedLeg,build=buildTicket}=opts;
  const {defaults,weights,markets,evaluate}=engine;
  const bounds={legs:[2,singleGame?6:10],minOdds:[1.01,101],maxOdds:[1.01,101],...Object.fromEntries(opts.fields.map(f=>[f.key,[f.min,f.max]]))};
  const integers=new Set(['legs',...opts.fields.filter(f=>f.integer).map(f=>f.key)]);
  const hints={...baseHints,...opts.hints};
  const readTickets=()=>{const value=local(ticketsKey,[]);return Array.isArray(value)?value:[];};
  const savedTickets=()=>readTickets().filter(isTicket).map(ticket=>({...ticket,legs:ticket.legs.filter(isSavedLeg).map(leg=>resolveSavedLeg?resolveSavedLeg(leg):leg)}))
    .filter(ticket=>ticket.legs.length);
  const booleans=[...(singleGame?[]:['perGame']),'skipTickets',...(opts.checks||[]).map(c=>c.key)];
  function readFilters(value){
    const source=isRecord(value)?value:{},cfg={...defaults};
    for(const [key,range] of Object.entries(bounds)){
      const numeric=numbers(source[key],range,defaults[key]);
      cfg[key]=integers.has(key)?Math.round(numeric):numeric;
    }
    for(const key of booleans)if(typeof source[key]==='boolean')cfg[key]=source[key];
    if(['Both','Over','Under'].includes(source.side))cfg.side=source.side;
    if(Array.isArray(source.stats))cfg.stats=source.stats.filter(stat=>markets.includes(stat));
    for(const key of ['games','players'])if(Array.isArray(source[key])){
      cfg[key]=source[key].filter(id=>typeof id==='string'||Number.isFinite(id)).map(String);
    }
    cfg.weights=Object.fromEntries(Object.entries(weights).map(([key,value])=>[key,numbers(source.weights?.[key],[0,10],value)]));
    return cfg;
  }
  const config=()=>readFilters(local(settingsKey,{}));
  const activeDraft=state=>opts.liveDraft&&(opts.prefill!==false||state.generated);
  const draft=()=>{
    const period=opts.period();
    if(S.f.parlay?.period!==period)S.f.parlay={period,locked:[],ticket:[],message:''};
    return S.f.parlay;
  };
  const preserveDetails=target=>{
    const panel=target.closest('details');
    S.f.parlayWeights=!!document.querySelector('details[data-parlay-weights]')?.open;
    if(panel?.dataset.parlayTicket)S.f.parlayHistory=panel.dataset.parlayTicket;
  };
  const takenLegs=except=>new Set(savedTickets().filter(ticket=>ticket.id!==except)
    .flatMap(ticket=>ticket.legs.filter(leg=>leg.result!=='Void').map(legKey)));
  const legText=opts.legText||(leg=>leg.side+' '+leg.line+' '+leg.stat);
  const ticketRules=cfg=>opts.rules?opts.rules(cfg):{};

  function exclusions(data,cfg){
    const playerLabel=id=>data.roster.find(p=>p.id===id)?.name||id;
    const gameLabel=id=>{const g=data.games.find(x=>String(x.id)===id);return g?gameName(g):id;};
    return tools(
      (singleGame?'':select('Exclude game','game','',[['','Choose a game'],...data.games.filter(g=>!cfg.games.includes(String(g.id))).map(g=>[String(g.id),gameName(g)])]))+
      select('Exclude player','player','',[['','Choose a player'],...[...data.roster].filter(p=>!cfg.players.includes(p.id))
        .sort((a,b)=>a.name.localeCompare(b.name)).map(p=>[p.id,p.name+' · '+p.team])])+
      check('Exclude legs on my tickets','skipTickets',cfg.skipTickets)
    )+tools(cfg.games.map(id=>btn(esc(gameLabel(id))+' ×','parlayIncludeGame',id,'outline')).join('')+
      cfg.players.map(id=>btn(esc(playerLabel(id))+' ×','parlayIncludePlayer',id,'outline')).join(''));
  }

  function controls(data,cfg){
    return tools(number('Legs','legs',cfg.legs,...bounds.legs)+select('Sides','side',cfg.side,['Both','Over','Under'].map(side=>[side,side]))+
        (singleGame?'':check('One leg per game','perGame',cfg.perGame)))+
      tools(markets.map(stat=>btn(esc(stat),'parlayStat',stat,cfg.stats.includes(stat)?'on':'')).join(''))+
      tools(opts.fields.map(f=>number(f.label,f.key,cfg[f.key],f.min,f.max,f.step??1)).join(''))+
      (opts.checks?.length?tools(opts.checks.map(c=>check(c.label,c.key,cfg[c.key])).join('')):'')+
      tools(number('Min. odds','minOdds',toAmerican(cfg.minOdds),-10000,10000,5)+number('Max. odds','maxOdds',toAmerican(cfg.maxOdds),-10000,10000,5)+
        '<span class="subtle">American odds, e.g. -200 to +150</span>')+
      exclusions(data,cfg)+
      `<details data-parlay-weights ${S.f.parlayWeights?'open':''}><summary>${opts.rankByChance?'Tie-break weights':'Scoring weights'}</summary>${tools(Object.entries(weightNames).map(([key,label])=>
        number(label,'weight-'+key,cfg.weights[key],0,10,.5)).join(''))}</details>`+
      tools(btn(singleGame?'Generate & save':'Generate','parlayGenerate','','primary')+btn('Regenerate','parlayRegenerate')+
        btn('Reset filters','parlayReset','', 'outline'));
  }

  function ticketTable(ticket,locked){
    const sampleLabel=ticket.some(leg=>leg.context?.formSource==='comparable-role')?'Sample hit rate':'Season';
    return table(['Player','Game','Leg','Quote',...(opts.rankByChance?['Est. hit chance']:[]),opts.recent.label,sampleLabel,'Reasons','Flags',''],ticket.map(leg=>{
      const key=legKey(leg), pinned=locked.includes(key);
      return [esc(leg.name+' · '+leg.team),esc(leg.team+' vs '+leg.opp+' · '+et({iso:leg.tip})+' ET'),esc(legText(leg)),
        esc(oddsText(leg.price)+' · '+leg.provider)+`<small class="muted"><br>Last updated ${esc(timeLabel(leg.capturedAt))}</small>`,
        ...(opts.rankByChance?[pct(opts.chance(leg),1)]:[]),pct(leg.form[opts.recent.key]?.rate),pct(leg.form.season.rate),tagList(leg.reasons),tagList(leg.flags),
        btn(pinned?'Unlock':'Lock','parlayLock',key,pinned?'on':'outline')+(pinned?'':btn('Swap','parlaySwap',key,'outline'))];
    }),{wrap:'box'});
  }

  function mathSummary(ticket){
    const m=ticketMath(ticket,opts.prior,opts.chance);
    const warnings=opts.warnings?opts.warnings(ticket):[];
    const formNote=ticket.some(leg=>leg.context?.formSource==='comparable-role')?'Applicable history for each leg':'Season rates multiplied';
    return grid(4,[metric('Combined line odds',esc(american(m.quoted)), 'Gross return $'+round(10*m.decimal,2)+' per $10'),
      metric('Adjusted chance estimate',pct(m.adjusted,2),opts.chanceNote||'Season rates shrunk toward 50%'),
      metric('Raw hit-rate product',pct(m.naive,2),formNote),
      metric('Quote-implied chance',pct(m.quoted,2),'Individual quotes multiplied')])+
      `<p class="subtle">Historical hit rates can differ from future results. The estimates assume independent legs, and the theoretical return excludes fees.${m.sameGame?' Same-game correlation makes the estimates less reliable.':''}</p>`+
      warnings.map(w=>`<p class="callout">${esc(w)}</p>`).join('');
  }

  function resultSummary(legs){
    const results=legs.map(savedResult);
    if(results.includes('Miss'))return 'Miss';
    if(results.includes('Pending'))return 'Pending';
    return results.includes('Hit')?'Hit':resolveSavedLeg&&results.includes('Push')?'Push':'Void';
  }

  function filterLabel(filters){
    return [filters.side,filters.stats.join(', '),...opts.summary(filters),'odds '+americanText(filters.minOdds)+' to '+americanText(filters.maxOdds),
      singleGame?'one matchup':filters.perGame?'one per game':'same-game allowed',filters.skipTickets?'overlap excluded':'overlap allowed',
      filters.games.length+' game / '+filters.players.length+' player exclusions',
      ...Object.entries(weightNames).map(([key,name])=>name+' weight '+filters.weights[key])].join(' · ');
  }

  function history(){
    const tickets=readTickets();
    if(!tickets.length)return empty('Generated tickets are saved here in this browser.');
    const results=new Map();
    let missing=0;
    const rows=tickets.flatMap(t=>{
      if(!isTicket(t)){missing++;return [];}
      const entries=t.legs.map((leg,index)=>({leg,index})).filter(({leg})=>isSavedLeg(leg))
        .map(({leg,index})=>({leg:resolveSavedLeg?resolveSavedLeg(leg):leg,index}));
      if(!entries.length){missing++;return [];}
      const legs=entries.map(({leg})=>leg);
      const filters=readFilters(t.filters),incomplete=legs.length!==t.legs.length;
      const result=incomplete?'Incomplete':resultSummary(legs),label=filterLabel(filters);
      const key=JSON.stringify(filters);
      if(!results.has(key))results.set(key,{label,requested:filters.legs,Hit:0,Miss:0});
      if(result==='Hit'||result==='Miss')results.get(key)[result]++;
      const cols=resolveSavedLeg?['Leg','Quote','Result','Actual','Source']:['Leg','Quote','Result'];
      const body=table(cols,entries.map(({leg,index})=>{
        const base=[esc(leg.name+' · '+legText(leg)),esc(oddsText(leg.price)+' · '+leg.provider)];
        const status=savedResult(leg);
        return resolveSavedLeg?[...base,badge(status,status==='Hit'?'g':status==='Miss'?'r':''),esc(leg.value??'—'),esc(leg.resultSource??'Awaiting final stats')]:
          [...base,select('Result for '+leg.name,'result:'+t.id+':'+index,status,outcomes.map(x=>[x,x]))];
      }),{wrap:'box'});
      const counts=outcomes.map(result=>[result,legs.filter(leg=>savedResult(leg)===result).length]).filter(([,n])=>n);
      return `<details data-parlay-ticket="${esc(t.id)}" ${S.f.parlayHistory===t.id?'open':''}><summary>${esc(t.date)} · ${legs.length}/${filters.legs} legs · ${result} · ${esc(timeLabel(t.createdAt))}</summary>
        <p class="subtle">${esc(label)} · ${esc(counts.map(([result,n])=>n+' '+result.toLowerCase()).join(', '))}</p>${body}</details>`;
    });
    const graded=[...results.values()].filter(x=>x.Hit+x.Miss>0);
    const note=resolveSavedLeg?'<p class="subtle">Legs grade automatically from final NBA box scores. Confirmed DNPs and canceled games are void.</p>':'';
    return note+(graded.length?table(['Saved filters','Requested legs','Hit','Miss'],graded.map(x=>[esc(x.label),x.requested,x.Hit,x.Miss]),{wrap:'box'}):'')+
      rows.join('')+(missing?empty(missing===1?'One saved ticket is unreadable.':missing+' saved tickets are unreadable.'):'');
  }

  function shortage(data,cfg,report,count){
    if(count>=cfg.legs)return '';
    if(!data.rows.length)return empty(typeof opts.noRows==='function'?opts.noRows():opts.noRows);
    if(!cfg.stats.length)return empty('Select at least one stat type.');
    if(!report.screened.length)return empty('No published prices match these sides and stat types.'+(cfg.side==='Under'?' Few Under prices are published; try Both or Over.':''));
    const ranked=[...report.cuts].sort((a,b)=>b[1]-a[1]);
    const limited=cfg.perGame&&new Set(report.eligible.map(leg=>leg.game)).size<cfg.legs&&report.eligible.length>=cfg.legs;
    const suggestion=limited?'Lower the leg count or allow same-game legs.':
      hints[ranked.find(([reason])=>hints[reason])?.[0]]||'Try a smaller ticket, more stat types, or a slate with more qualifying games.';
    return `<p>${count} of ${cfg.legs} legs available for this ticket. ${esc(suggestion)}</p>`+
      (ranked.length?`<p class="subtle">Most common cuts: ${esc(ranked.slice(0,4).map(([reason,n])=>reason+' ('+n+')').join(' · '))}</p>`:'');
  }

  function page(data){
    const cfg=config(), state=draft(), report=evaluate(data.rows,cfg,{taken:takenLegs(opts.liveDraft?state.savedId:undefined)});
    const preview=!activeDraft(state)||!state.initialized?build(report.eligible,cfg,{rules:ticketRules(cfg)}).ticket:[];
    if(opts.liveDraft&&!state.initialized){
      if(activeDraft(state))state.ticket=preview;
      state.initialized=true;
      state.evaluatedAt=new Date().toISOString();
    }
    const current=new Map(report.eligible.map(leg=>[legKey(leg),leg]));
    const overlaps=takenLegs(state.savedId);
    const ticket=state.ticket.map(leg=>{
      const flags=[...new Set([...leg.flags,...(current.get(legKey(leg))?.flags||[])])];
      if(overlaps.has(legKey(leg))&&!flags.includes('On an existing ticket'))flags.push('On an existing ticket');
      if(Date.now()-Date.parse(leg.capturedAt)>90*60000&&!flags.includes('Stale quote'))flags.push('Stale quote');
      return {...leg,flags};
    });
    const intro=typeof opts.intro==='function'?opts.intro(data):opts.intro;
    return `<h1>${esc(opts.title||'Suggested Parlays')}</h1>${intro||''}`+opts.nav()+
      box('Filters',controls(data,cfg))+
      box('Suggested ticket',(opts.liveDraft?`<p class="subtle">Last evaluated ${esc(timeLabel(state.evaluatedAt))} · ${esc(opts.poolSummary?.(report,cfg)??report.eligible.length+' eligible priced legs')}</p>`:'')+
        (state.message?`<p class="subtle" role="status">${esc(state.message)}</p>`:'')+
        shortage(data,cfg,report,activeDraft(state)?ticket.length:ticket.length||preview.length)+
        (ticket.length?ticketTable(ticket,state.locked)+(ticket.length>=2?(opts.ticketSummary||mathSummary)(ticket):''):empty(activeDraft(state)?'No suggested legs match the current filters.':'Generate a ticket from the eligible legs.')))+
      (opts.afterTicket?.(data,report,ticket,cfg,overlaps)||'')+box(singleGame?'SGP ticket history':'Ticket history',history());
  }

  function saveTicket(ticket,cfg){
    const all=readTickets();
    const key=legs=>legs.map(leg=>legKey(leg)+'|'+leg.price).sort().join(';');
    const previous=all.find(old=>isTicket(old)&&old.legs.every(isSavedLeg)&&key(old.legs)===key(ticket)&&JSON.stringify(readFilters(old.filters))===JSON.stringify(cfg));
    if(previous)return previous.id;
    const entry={id:crypto.randomUUID(),date:opts.periodLabel(),createdAt:new Date().toISOString(),filters:cfg,
      legs:ticket.map(leg=>({...leg,result:'Pending'}))};
    try{keep(ticketsKey,[entry,...all]);return entry.id;}
    catch{toast('Could not save this ticket in browser storage.');return false;}
  }

  function refreshDraft(data,cfg,state){
    const {eligible,screened}=evaluate(data.rows,cfg,{taken:takenLegs(state.savedId)});
    const qualified=new Set(eligible.map(legKey));
    let locked=state.locked.filter(key=>qualified.has(key));
    let next=build(eligible,cfg,{locked,rules:ticketRules(cfg)});
    if(next.invalidLock){locked=[];next=build(eligible,cfg,{rules:ticketRules(cfg)});}
    const previous=new Set(state.ticket.map(legKey)), selected=new Set(next.ticket.map(legKey));
    const added=next.ticket.filter(leg=>!previous.has(legKey(leg))).map(leg=>leg.name);
    const removed=state.ticket.filter(leg=>!selected.has(legKey(leg))).map(leg=>{
      const reviewed=screened.find(x=>legKey(x)===legKey(leg));
      return leg.name+' ('+(reviewed?.checks.Availability||reviewed?.checks.Kickoff||reviewed?.cut||
        (qualified.has(legKey(leg))?'reranked':'line or side unavailable'))+')';
    });
    S.f.parlayWeights=!!document.querySelector('details[data-parlay-weights]')?.open;
    S.f.parlayHistory=document.querySelector('details[data-parlay-ticket][open]')?.dataset.parlayTicket;
    state.ticket=next.ticket;
    state.locked=locked;
    state.initialized=true;
    state.evaluatedAt=new Date().toISOString();
    state.message=added.length||removed.length?[
      added.length?'Added '+[...new Set(added)].join(', ')+'.':'',
      removed.length?'Removed '+[...new Set(removed)].join(', ')+'.':''
    ].filter(Boolean).join(' '):'Rechecked. The suggested legs stayed the same.';
    return true;
  }

  function action(act,value,data,target){
    const state=draft(), cfg=config();
    if(target)preserveDetails(target);
    if(act==='parlayRefreshDraft'&&opts.liveDraft){
      if(activeDraft(state))return refreshDraft(data,cfg,state);
      state.evaluatedAt=new Date().toISOString();
      return true;
    }
    if(act==='parlayField'){
      const [key,val]=JSON.parse(value);
      if(key.startsWith('result:')){
        const [,id,index]=key.split(':'), all=readTickets(), ticket=all.find(t=>isTicket(t)&&t.id===id);
        if(!resolveSavedLeg&&isSavedLeg(ticket?.legs[index])&&outcomes.includes(val)){ticket.legs[index].result=val;keep(ticketsKey,all);S.f.parlayHistory=id;}
        return true;
      }
      if(key.startsWith('weight-')){const k=key.slice(7);if(Object.hasOwn(weights,k))cfg.weights[k]=numbers(val,[0,10],weights[k]);S.f.parlayWeights=true;}
      else if(key==='minOdds'||key==='maxOdds'){
        const typed=Number(val);
        cfg[key]=val===''||!Number.isFinite(typed)?defaults[key]:numbers(fromAmerican(typed),bounds[key],defaults[key]);
        if(target)target.value=toAmerican(cfg[key]);
      }else if(Object.hasOwn(bounds,key)){
        cfg[key]=numbers(val,bounds[key],defaults[key]);
        if(integers.has(key))cfg[key]=Math.round(cfg[key]);
        if(target)target.value=cfg[key];
      }else if(booleans.includes(key))cfg[key]=val===true;
      else if(key==='side'&&['Both','Over','Under'].includes(val))cfg.side=val;
      else if(val&&key==='game')cfg.games=toggle(cfg.games,val);
      else if(val&&key==='player')cfg.players=toggle(cfg.players,val);
    }else if(act==='parlayStat')cfg.stats=toggle(cfg.stats,value);
    else if(act==='parlayIncludeGame')cfg.games=toggle(cfg.games,value);
    else if(act==='parlayIncludePlayer')cfg.players=toggle(cfg.players,value);
    else if(act==='parlayReset'){
      keep(settingsKey,defaults);state.ticket=[];state.locked=[];state.message='';state.savedId=null;state.initialized=false;state.generated=false;return true;
    }else if(act==='parlayLock'){
      if(state.ticket.some(leg=>legKey(leg)===value))state.locked=toggle(state.locked,value);
      return true;
    }else if(['parlayGenerate','parlayRegenerate','parlaySwap'].includes(act)){
      if(cfg.minOdds>cfg.maxOdds){state.message='Minimum odds exceed maximum odds.';return true;}
      const taken=takenLegs(opts.liveDraft?state.savedId:undefined);
      // A user can retain their current legs during a swap or lock. New legs still obey ticket exclusion.
      const current=state.ticket.map(legKey);
      for(const key of current)if(state.locked.includes(key)||act==='parlaySwap'&&key!==value)taken.delete(key);
      const {eligible}=evaluate(data.rows,cfg,{taken});
      const locked=act==='parlaySwap'?current.filter(key=>key!==value):state.locked;
      const avoid=new Set(act==='parlayRegenerate'?current:[]);
      const excluded=new Set(act==='parlaySwap'?[value]:[]);
      const {ticket,invalidLock}=build(eligible,cfg,{locked,avoid,excluded,rules:ticketRules(cfg)});
      if(invalidLock){state.message='A retained leg no longer qualifies. Unlock it or regenerate with different filters.';return true;}
      if(act==='parlaySwap'&&ticket.length<state.ticket.length){state.message='No eligible replacement matches this ticket.';return true;}
      if(act==='parlaySwap'){
        const replacement=ticket.find(leg=>!locked.includes(legKey(leg)));
        state.ticket=state.ticket.map(leg=>legKey(leg)===value?replacement:leg);
      }else state.ticket=ticket;
      state.message='';
      if(opts.liveDraft){state.evaluatedAt=new Date().toISOString();state.generated=true;}
      state.savedId=state.ticket.length>=2?saveTicket(state.ticket,cfg):null;
      if(state.savedId)state.message='Ticket saved in this browser.';
      return true;
    }else return false;
    keep(settingsKey,cfg);
    if(activeDraft(state))return refreshDraft(data,cfg,state);
    state.message='Filters changed. Generate to apply them to a new ticket.';
    return true;
  }

  return {page,action,savedTickets};
}
