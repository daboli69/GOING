import {box,empty,esc,grid,metric,slate,tools,btn} from './ui.mjs';
import {american,pct} from './math.mjs';
import {timeLabel} from './parlay-ui.mjs';
import {legEvidenceButton} from './nba-evidence-view.mjs';
import {findNbaJackpot,jackpotProps} from './nba-jackpot-engine.mjs';

const oddsText=price=>Number(price)>0?'+'+Number(price):String(price);
const label=leg=>leg.name+' '+leg.side+' '+leg.line+' '+leg.stat;
const matchup=leg=>leg.team+' vs '+leg.opp;

function ticketCard(ticket){
  const shared=ticket.groups.filter(group=>group.n);
  const format=shared.length?(ticket.groups.length===1?'Same-game parlay':'Same-game plus'):'Cross-game parlay';
  const notes=shared.length?'<p class="subtle">'+esc(shared.map(group=>{
    const leg=ticket.legs.find(row=>row.game===group.game);
    return matchup(leg)+' · '+group.hits+'/'+group.n+' prior shared games hit all these lines';
  }).join(' · '))+'</p>':'';
  return grid(3,[metric('Projected odds',american(1/ticket.decimal),'DraftKings reference'),
    metric('Estimated hit chance',pct(ticket.chance,1),'All legs'),metric('Ticket',String(ticket.legs.length)+' legs',format)])+notes+
    '<ol class="parlay-pool">'+ticket.legs.map(leg=>'<li><div class="parlay-pool-row"><div><strong>'+esc(label(leg))+'</strong>'+
      '<div>'+esc(matchup(leg)+' · '+oddsText(leg.price)+' '+leg.provider+(leg.milestone?' milestone':''))+'</div></div>'+
      '<strong>'+pct(leg.chance,1)+'</strong></div>'+
      '<p class="subtle">'+esc('Season '+leg.form.season.hits+'/'+leg.form.season.n+' · L10 '+
        leg.form.last10.hits+'/'+leg.form.last10.n+' · Quoted '+timeLabel(leg.capturedAt))+'</p>'+
      '<p><strong>Why this leg</strong> '+esc(leg.reasons.join(' · '))+'</p>'+
      (leg.flags.length?'<p class="subtle">'+esc(leg.flags.join(' · '))+'</p>':'')+
      legEvidenceButton(leg)+'</li>').join('')+'</ol>';
}

export function nbaJackpotPage({rows,alternates,logs},now=Date.now()){
  const props=jackpotProps(rows,alternates,logs,now);
  const {ticket,limited}=findNbaJackpot(props,{logs});
  const scope=props.length+' screened player props';
  const summary='<p class="subtle">'+esc(scope+(limited?' · Search limit reached. Showing the best ticket found.':''))+'</p>';
  const header='<h1>Fanatics NBA Jackpot</h1>'+slate({navOnly:true,date:true})+
    tools(btn('Check for updates','nbaParlayCheck',''))+
    '<p class="subtle">GOING compares player-prop parlays of different lengths for the highest estimated hit chance at +2000 or longer. '+
    'DraftKings prices are references. Fanatics sets the actual betslip price and offer eligibility.</p>';
  const explanation='<p class="subtle">Player legs use Suggested Parlays’ matchup, type, form and lineup checks, with a small adjustment when similar-minute games support it. '+
    'Same-game player combinations use prior shared games to estimate how often the lines hit together.</p>';
  return header+box('Best estimated +2000 parlay',summary+(ticket?ticketCard(ticket):
    empty('No +2000 ticket was found with the current pregame prices and model evidence.'))+explanation);
}
