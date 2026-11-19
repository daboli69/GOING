import {current as S,box,btn,cell,dateLabel,dialog,empty,esc,grid,keep,local,person,select,slate,table,team,toast,tools} from './ui.mjs';
import {american,pct,round,signed} from './math.mjs';
import {impliedChance} from './nfl-td.mjs';
import {nflTeams} from './config.mjs';
import {findJackpotTickets,jackpotCandidates,jackpotKey,jackpotLegKey,jackpotLegs,jackpotPrice,jackpotReplacements,
  jackpotTicketKey,makeJackpotTicket,tdDefenseMetrics,tdDefenseProfile} from './nfl-td-jackpot.mjs';

const odds=value=>value>0?'+'+value:String(value);
const priceText=quote=>quote?odds(Number(quote.over)):'—';
let profileMemo;
function defense(){
  if(profileMemo?.data!==S.data||profileMemo.week!==S.week||profileMemo.year!==S.year){
    profileMemo={data:S.data,week:S.week,year:S.year,value:tdDefenseProfile(S.data.schedule||[],S.data.events,S.data.players,S.year,S.week)};
  }
  return profileMemo.value;
}
function reasons(row,profile){
  const rush=row.counts.in5>=2||row.rushShare>=row.recShare;
  const pass=row.role!=='QB'&&(row.counts.ez>=2||row.recShare>=row.rushShare);
  const usage=[];
  if(rush&&row.counts.in5)usage.push(row.counts.in5+' carries from the 5 or closer');
  if(pass&&row.counts.ez)usage.push(row.counts.ez+' end-zone targets');
  if(!usage.length&&row.counts.t10)usage.push(row.counts.t10+' targets from the 10 or closer');
  const relevant=[...(rush?['goalLine','rush']:[]),...(pass?[row.role,'redZonePass','pass']:[])];
  const defense=profile.teams.get(row.opp);
  const spots=relevant.filter(key=>defense?.metrics[key]?.rank!=null&&defense.metrics[key].adjusted>profile.league[key])
    .sort((a,b)=>defense.metrics[a].rank-defense.metrics[b].rank);
  const key=spots[0];
  const matchup=key?row.opp+' allows '+round(defense.metrics[key].rate,2)+' '+tdDefenseMetrics[key].toLowerCase()+'/game, No. '+defense.metrics[key].rank+' of '+profile.ranked+' most allowed':
    defense?.games>=3?'No above-average TD allowance for the player’s primary scoring routes':'Limited defensive sample';
  const context=[row.goalLine?'Goal-line lead':null,row.rzShare!=null?pct(row.rzShare)+' red-zone share':null,
    row.snaps!=null?pct(row.snaps)+' recent offensive snaps':null,
    row.scoring?.fromLines?round(row.scoring.implied,1)+' implied team points':null,
    row.scoring?.badWeather?'Wind or rain shifts the TD Board toward rushing':null];
  const recent=row.recentTD?.games?row.recentTD.hits+'/'+row.recentTD.games+' recent tracked games with a TD':null;
  const missing=row.availability?.missing?.map(x=>x.name)||[];
  if(missing.length)context.push('Teammates out with shared usage: '+missing.join(', '));
  const defenseOut=row.availability?.defenseOut||[];
  if(defenseOut.length)context.push(row.opp+' out: '+defenseOut.map(x=>x.name+' ('+x.pos+')').join(', '));
  if(row.status)context.push(row.status);
  else if(!row.availability?.hasReport)context.push('Team injury report unavailable');
  if(row.availability?.inactivesPosted)context.push('Game-day inactives checked');
  return [...usage,matchup,recent,row.td+' TDs in '+row.games+' tracked games',...context].filter(Boolean);
}

const limit=4, blockKey='td-jackpot-blocks';
const sourceNames={fanatics:'Fanatics price tickets',reference:'Kalshi reference tickets'};
const timeLabel=value=>Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'
}).format(new Date(value)):null;

function inputs(data){
  const entered=Object.fromEntries(Object.entries(S.f).filter(([key])=>key.startsWith('jackpotPrice:')).map(([key,value])=>[key.slice(13),value]));
  const rows=jackpotCandidates(data.rows,S.odds||[],entered,Date.now());
  const saved=S.f.jackpotBlocks??local(blockKey,[]);
  const blocks=new Map((Array.isArray(saved)?saved:[]).filter(x=>Array.isArray(x)&&typeof x[0]==='string'&&typeof x[1]==='string'));
  return {rows,blocks,prefs:{blocked:new Set(blocks.keys()),minimum:Number(S.f.jackpotMinChance)/100||0,questionable:S.f.jackpotQuestionable==='Yes'}};
}
function state(){
  const period=S.year+'-'+S.week;
  if(S.f.jackpotState?.period!==period)S.f.jackpotState={period,drafts:{},messages:{}};
  return S.f.jackpotState;
}
const cardKey=ticket=>jackpotTicketKey(ticket.legs);
function remember(source,tickets){
  state().drafts[source]=tickets.map(ticket=>ticket.legs.map(jackpotLegKey));
}
function currentTickets(source,eligible){
  const byKey=new Map(eligible.map(leg=>[jackpotLegKey(leg),leg])), prior=state().drafts[source]||[];
  const kept=prior.map(keys=>makeJackpotTicket(keys.map(key=>byKey.get(key)))).filter(Boolean);
  const skip=new Set(kept.map(cardKey));
  const tickets=[...kept,...findJackpotTickets(eligible,{limit:limit-kept.length,skip})];
  if(kept.length<prior.length)state().messages[source]='Rechecked the draft against the current pool. Unavailable legs and tickets below +2000 were removed.';
  remember(source,tickets);
  return tickets;
}
const nextAction=(label,act,values,cls='outline')=>btn(label,act,JSON.stringify(values),cls);
function saveBlocks(blocks){
  const entries=[...blocks];
  S.f.jackpotBlocks=entries;
  try{keep(blockKey,entries);}catch{toast('Player blocks apply for this visit. Browser storage is unavailable.');}
}
function priceEdge(row,price){
  return signed((row.anytime-impliedChance(price))*100,1)+' pts vs quoted break-even';
}
export function tdJackpotAction(act,value,data){
  if(!['tdJackpotBlock','tdJackpotUnblock','tdJackpotClear','tdJackpotRegenerate','tdJackpotSwap','tdJackpotChoose'].includes(act))return false;
  const {rows,blocks,prefs}=inputs(data);
  if(act==='tdJackpotBlock'){
    const row=rows.find(row=>String(row.id)===value);
    if(row){blocks.set(value,row.p.name);saveBlocks(blocks);}
    return true;
  }
  if(act==='tdJackpotUnblock'||act==='tdJackpotClear'){
    if(act==='tdJackpotClear')blocks.clear();else blocks.delete(value);
    saveBlocks(blocks);
    return true;
  }

  const [source,key,oldLeg,newLeg]=JSON.parse(value);
  if(!Object.hasOwn(sourceNames,source))return false;
  const eligible=jackpotLegs(rows,source,prefs), current=currentTickets(source,eligible);
  if(act==='tdJackpotRegenerate'){
    const alternatives=findJackpotTickets(eligible,{skip:new Set(current.map(cardKey))});
    if(alternatives.length)remember(source,[...alternatives,...current].slice(0,limit));
    state().messages[source]=alternatives.length?alternatives.length+' different '+(alternatives.length===1?'ticket':'tickets')+' generated.':
      'No different tickets meet the current prices, player rules and +2000 minimum.';
    return true;
  }

  const ticket=current.find(t=>cardKey(t)===key);
  if(!ticket){
    dialog('Ticket updated',empty('This ticket changed or stopped qualifying. Open Swap on a current ticket.'));
    return true;
  }
  const profile=defense();
  const options=jackpotReplacements(ticket,oldLeg,eligible);
  const choice=options.find(x=>jackpotLegKey(x.leg)===newLeg);
  if(act==='tdJackpotChoose'&&choice){
    const swapped=cardKey(choice.ticket);
    remember(source,current.filter(t=>cardKey(t)!==swapped).map(t=>t===ticket?choice.ticket:t));
    state().messages[source]='Swapped in '+choice.leg.row.p.name+'. The other two legs stayed in place.';
    document.querySelector('#dialog')?.close();
    return true;
  }
  const previous=ticket.legs.find(l=>jackpotLegKey(l)===oldLeg);
  if(!previous)return false;
  const note=act==='tdJackpotChoose'?'<p role="status">That replacement is no longer available. The list has been updated.</p>':'';
  dialog('Swap '+previous.row.p.name,note+'<p class="subtle">The other two legs stay in place. Replacements keep the estimated ticket at +2000 or higher.</p>'+
    table(['Player','Price','Ticket odds','TD chance','Matchup',''],options.map(({leg,ticket:next})=>{
      const row=leg.row;
      return [esc(row.p.name+' · '+row.team),odds(leg.price),american(1/next.decimal),pct(row.anytime,1),esc(reasons(row,profile).slice(0,4).join(' · ')),
        nextAction('Use '+esc(row.p.name),'tdJackpotChoose',[source,key,oldLeg,jackpotLegKey(leg)])];
    }),{wrap:'box',empty:'No new replacement meets the current prices, player rules and +2000 minimum.'}),true);
  return true;
}

function tickets(rows,source,profile,prefs){
  const eligible=jackpotLegs(rows,source,prefs);
  const picks=currentTickets(source,eligible);
  const fanatics=source==='fanatics', label=sourceNames[source];
  const active=state().messages[source];
  const controls=tools(nextAction(fanatics?'Regenerate Fanatics tickets':'Regenerate Kalshi tickets','tdJackpotRegenerate',[source])+
    '<span class="subtle">'+eligible.length+' eligible priced players · '+new Set(eligible.map(leg=>leg.row.game.id)).size+' games</span>')+
    (active?'<p class="subtle" role="status">'+esc(active)+'</p>':'');
  if(!picks.length)return box(label,controls+empty(fanatics?'No ticket qualifies at these prices and filters. Enter Fanatics Anytime TD prices across at least three Sunday games.':
    'No three-game ticket reaches +2000 using current Kalshi reference prices and filters.'));
  return box(label,controls+grid(2,picks.map(ticket=>'<div class="card"><h3>'+american(1/ticket.decimal)+' estimated combined odds</h3>'+
    '<p class="subtle">'+pct(ticket.chance,1)+' model estimate for all three to score</p>'+
    '<ul class="jackpot-legs">'+ticket.legs.map(({row,price})=>'<li><strong>'+esc(row.p.name)+'</strong> '+odds(price)+' · '+esc(row.team+' vs '+row.opp)+
      '<br><small>'+esc(pct(row.anytime,1)+' TD chance · '+priceEdge(row,price)+' · '+reasons(row,profile).join(' · '))+'</small>'+
      tools(nextAction('Swap '+esc(row.p.name),'tdJackpotSwap',[source,cardKey(ticket),jackpotKey(row)])+
        btn('Block '+esc(row.p.name),'tdJackpotBlock',String(row.id),'outline'),'tight')+'</li>').join('')+'</ul></div>'))+
    '<p class="subtle">'+(fanatics?'Confirm the combined odds, eligible games and offer in the Fanatics betslip.':
      'Market comparison using Kalshi asks. Enter Fanatics prices to build tickets for the promo.')+
    ' The model estimate multiplies the three individual TD chances.</p>');
}

export function tdJackpotPage(data){
  const {rows,blocks,prefs}=inputs(data);
  const profile=defense();
  const opponents=Object.keys(nflTeams).sort();
  const keys=Object.keys(tdDefenseMetrics),metric=tdDefenseMetrics[S.f.jackpotDefense]?S.f.jackpotDefense:'rush';
  const header='<h1>Fanatics TD Jackpot</h1>'+slate({navOnly:true})+tools(btn('Check for updates','nflParlayCheck',''))+
    '<p class="subtle">Three different anytime TD scorers from three Sunday games, with combined odds of +2000 or higher. Winning entries share the jackpot under the offer in your Fanatics app.</p>';
  const asOf=timeLabel(S.nflAvailability?.reportAt);
  const options=box('Ticket filters',tools(select('Minimum TD chance','jackpotMinChance',
    [['0','Any'],['15','15%'],['20','20%'],['25','25%'],['30','30%']])+select('Allow questionable players','jackpotQuestionable',['No','Yes']))+
    '<p class="subtle">'+esc(asOf?'Injury report updated '+asOf+'.':'Injury report timestamp unavailable.')+
    ' Players listed out, inactive or doubtful are held out of tickets.</p>'+
    (blocks.size?'<h3>Blocked players</h3>'+tools([...blocks].map(([id,name])=>btn('Unblock '+esc(name),'tdJackpotUnblock',id,'outline')).join('')+
      btn('Clear blocks','tdJackpotClear','','outline')):'<p class="subtle">Block a player on a ticket or on the scorer board. Blocks are saved in this browser.</p>'));
  const dates=[...new Set(rows.map(row=>row.game.date))];
  const visible=rows.filter(row=>(!S.f.jackpotOpp||row.opp===S.f.jackpotOpp)&&(!S.f.search||row.p.name.toLowerCase().includes(S.f.search.toLowerCase())));
  const candidates=rows.length?box('Sunday scorers · '+esc(dates.map(date=>dateLabel(date,true)).join(' / ')),
    tools(select('Opponent','jackpotOpp',[['','All defenses'],...opponents])+
      '<input type="search" data-field="search" aria-label="Find a scorer" placeholder="Find a scorer" value="'+esc(S.f.search||'')+'">')+
    table(['Player','Opponent','TD chance','Matchup and usage','Kalshi','Fanatics price','Ticket pool'],visible.map(row=>{
      const key=jackpotKey(row),raw=S.f['jackpotPrice:'+key]||'',invalid=raw&&jackpotPrice(raw)==null;
      const blocked=blocks.has(String(row.id));
      const input='<input class="jackpot-price" type="text" inputmode="text" placeholder="'+esc(priceText(row.fanatics))+
        '" data-field="jackpotPrice:'+esc(key)+'" value="'+esc(raw)+'" aria-label="Fanatics price for '+esc(row.p.name)+'"'+(invalid?' aria-invalid="true"':'')+'>'+
        (invalid?'<small>Enter American odds, such as +180.</small>':'')+(row.status?'<small>'+esc(row.status)+'</small>':'');
      return [person(row.p),team(row.opp),pct(row.anytime,1),esc(reasons(row,profile).join(' · ')),priceText(row.reference),cell(input,'jackpot-edit'),btn((blocked?'Unblock ':'Block ')+esc(row.p.name),blocked?'tdJackpotUnblock':'tdJackpotBlock',String(row.id),'outline')];
    }),{wrap:'box',empty:'No scorers match this filter.'})+
    '<p class="subtle">Enter Fanatics Anytime TD odds from your betslip. Prices stay on this page until you leave. Questionable and doubtful players remain visible for research.</p>'):
    box('Sunday scorers',empty('No pregame Sunday scorers are available for this week. Change weeks to view another slate.'));
  const defenses=box('Defensive weaknesses',
    tools(select('Sort by','jackpotDefense',keys.map(key=>[key,tdDefenseMetrics[key]])))+
    table(['Defense','Games',...keys.map(key=>tdDefenseMetrics[key]+' / game')],opponents.sort((a,b)=>
      (profile.teams.get(a)?.metrics[metric].rank??Infinity)-(profile.teams.get(b)?.metrics[metric].rank??Infinity)||a.localeCompare(b))
      .map(code=>{
        const teamStats=profile.teams.get(code);
        return [team(code),teamStats?.games??'—',...keys.map(key=>{
          const m=teamStats?.metrics[key];
          return m?cell(round(m.rate,2),m.rank!=null&&m.rank<=8&&m.adjusted>profile.league[key]?'bad heat':''):'—';
        })];
      }),{wrap:'box'})+
    '<p class="subtle">Prior completed games with play-by-play this season. Ranks start after three games and pull small samples toward the league average. Red-zone receiving TDs use the snap location.</p>');
  return header+options+(rows.length?tickets(rows,'fanatics',profile,prefs)+tickets(rows,'reference',profile,prefs):'')+candidates+defenses;
}
