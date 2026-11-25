import {current as S,box,empty,esc,grid,metric,slate,tools,btn,local,keep,toast} from './ui.mjs';
import {american,pct} from './math.mjs';
import {timeLabel} from './parlay-ui.mjs';
import {legEvidenceButton} from './nba-evidence-view.mjs';
import {findNbaJackpot,jackpotProps,nbaJackpotTicketKey} from './nba-jackpot-engine.mjs';

const oddsText=price=>Number(price)>0?'+'+Number(price):String(price);
const label=leg=>leg.name+' '+leg.side+' '+leg.line+' '+leg.stat;
const matchup=leg=>leg.team+' vs '+leg.opp;
const builderCount=legs=>legs.filter(leg=>leg.milestone!=null).length;
const legBlocksKey=()=>'nba-jackpot-legs:'+S.day;
const playerBlocksKey='nba-jackpot-players';
const blocks=key=>new Map(S.f[key]??local(key,[]));
function saveBlocks(key,entries){
  S.f[key]=[...entries];
  try{keep(key,S.f[key]);}catch{toast('Blocks apply for this visit. Browser storage is unavailable.');}
}
function draft(){
  if(S.f.nbaJackpotDraft?.date!==S.day)S.f.nbaJackpotDraft={date:S.day,skipped:new Set()};
  return S.f.nbaJackpotDraft;
}

export function nbaJackpotAction(act,value){
  if(act==='nbaJackpotNext'){
    for(const key of JSON.parse(value))draft().skipped.add(key);
    return true;
  }
  if(act==='nbaJackpotTop'){draft().skipped.clear();return true;}
  const player=act==='nbaJackpotBlockPlayer'||act==='nbaJackpotUnblockPlayer';
  const key=player?playerBlocksKey:legBlocksKey();
  const entries=blocks(key);
  if(act==='nbaJackpotBlockLeg'||act==='nbaJackpotBlockPlayer')entries.set(...JSON.parse(value));
  else if(act==='nbaJackpotUnblockLeg'||act==='nbaJackpotUnblockPlayer')entries.delete(value);
  else if(act==='nbaJackpotClear')entries.clear();
  else return false;
  saveBlocks(key,entries);
  if(act==='nbaJackpotClear')saveBlocks(playerBlocksKey,new Map());
  draft().skipped.clear();
  return true;
}

function blockControls(legs,players){
  if(!legs.size&&!players.size)return '';
  const entries=[...legs].map(([key,name])=>btn('Unblock '+esc(name),'nbaJackpotUnblockLeg',key,'outline'))
    .concat([...players].map(([key,name])=>btn('Unblock '+esc(name),'nbaJackpotUnblockPlayer',key,'outline')));
  return box('Blocks',tools(entries.join('')+btn('Clear all blocks','nbaJackpotClear','','outline'))+
    '<p class="subtle">Leg blocks apply to this slate. Player blocks apply to future slates in this browser.</p>');
}

function ticketCard(ticket){
  const shared=ticket.groups.filter(group=>group.n);
  const format=shared.length?(ticket.groups.length===1?'Same-game parlay':'Same-game plus'):'Cross-game parlay';
  const notes=shared.length?'<p class="subtle">'+esc(shared.map(group=>{
    const leg=ticket.legs.find(row=>row.game===group.game);
    return matchup(leg)+' · '+group.hits+'/'+group.n+' prior shared games hit all these lines';
  }).join(' · '))+'</p>':'';
  const builders=builderCount(ticket.legs);
  return grid(3,[metric('Projected odds',american(1/ticket.decimal),'DraftKings reference'),
    metric('Estimated hit chance',pct(ticket.chance,1),'All legs'),
    metric('Ticket',ticket.legs.length+' legs',format+(builders?' · '+builders+' builder':''))])+notes+
    '<ol class="parlay-pool">'+ticket.legs.map(leg=>'<li><div class="parlay-pool-row"><div><strong>'+esc(label(leg))+'</strong>'+
      '<div>'+esc(matchup(leg)+' · '+oddsText(leg.price)+' '+leg.provider+(leg.milestone!=null?' · Builder milestone':''))+'</div></div>'+
      '<strong>'+pct(leg.chance,1)+'</strong></div>'+
      '<p class="subtle">'+esc('Season '+leg.form.season.hits+'/'+leg.form.season.n+' · L10 '+
        leg.form.last10.hits+'/'+leg.form.last10.n+' · Quoted '+timeLabel(leg.capturedAt))+'</p>'+
      '<p><strong>Why this leg</strong> '+esc(leg.reasons.join(' · '))+'</p>'+
      (leg.flags.length?'<p class="subtle">'+esc(leg.flags.join(' · '))+'</p>':'')+
      tools(legEvidenceButton(leg)+btn('Block leg','nbaJackpotBlockLeg',JSON.stringify([leg.key,label(leg)]),'outline')+
        btn('Block player','nbaJackpotBlockPlayer',JSON.stringify([String(leg.player),leg.name]),'outline'))+'</li>').join('')+'</ol>';
}

export function nbaJackpotPage({rows,alternates,logs},now=Date.now()){
  const legs=blocks(legBlocksKey()),players=blocks(playerBlocksKey),state=draft();
  const props=jackpotProps(rows,alternates,logs,now).filter(leg=>!legs.has(leg.key)&&!players.has(String(leg.player)));
  let {tickets,limited}=findNbaJackpot(props,{logs,count:3,skip:state.skipped});
  const cycled=state.skipped.size&&!tickets.length&&!limited;
  if(cycled){state.skipped.clear();({tickets,limited}=findNbaJackpot(props,{logs,count:3}));}
  const scope=props.length+' eligible player props · '+builderCount(props)+' builder lines';
  const summary='<p class="subtle">'+esc(scope+(limited?' · Search limit reached. Showing the best results found.':''))+'</p>';
  const header='<h1>Fanatics NBA Jackpot</h1>'+slate({navOnly:true,date:true})+
    tools(btn('Check for updates','nbaParlayCheck',''))+
    '<p class="subtle">GOING compares player-prop parlays of different lengths for the highest estimated hit chance at +2000 or longer. '+
    'DraftKings prices are references. Fanatics sets the actual betslip price and offer eligibility.</p>';
  const explanation='<p class="subtle">Player legs use Suggested Parlays’ matchup, type, form and lineup checks, with a small adjustment when similar-minute games support it. '+
    'Same-game player combinations use prior shared games to estimate how often the lines hit together.</p>';
  const controls=tools((tickets.length?btn('Find more tickets','nbaJackpotNext',JSON.stringify(tickets.map(ticket=>nbaJackpotTicketKey(ticket.legs))),'outline'):'')+
    (state.skipped.size?btn('Back to top tickets','nbaJackpotTop','','outline'):''));
  const [best,...alternatives]=tickets;
  const otherTickets=alternatives.map(ticket=>'<details class="details"><summary>'+esc(ticket.legs.length+' legs · '+
    american(1/ticket.decimal)+' projected · '+pct(ticket.chance,1)+' estimated hit chance')+'</summary>'+ticketCard(ticket)+'</details>').join('');
  const notice=cycled?'<p role="status" class="subtle">No further tickets met +2000. Showing the top tickets again.</p>':'';
  return header+blockControls(legs,players)+box('Best estimated +2000 parlay',summary+controls+notice+(best?ticketCard(best):
    empty('No complete +2000 ticket was found with the current pregame props and blocks.'))+explanation)+
    (otherTickets?box('Alternative tickets',otherTickets):'');
}
