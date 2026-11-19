import {current as S,box,btn,cell,dateLabel,empty,esc,grid,person,select,slate,table,team,tools} from './ui.mjs';
import {american,pct,round} from './math.mjs';
import {nflTeams} from './config.mjs';
import {jackpotCandidates,jackpotKey,jackpotPrice,jackpotTickets,tdDefenseMetrics,tdDefenseProfile} from './nfl-td-jackpot.mjs';

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
  return [...usage,row.td+' TDs in '+row.games+' tracked games',matchup];
}
function tickets(rows,source,profile){
  const picks=jackpotTickets(rows,source);
  const fanatics=source==='fanatics';
  const label=fanatics?'Fanatics price tickets':'Kalshi reference tickets';
  if(!picks.length)return box(label,empty(fanatics?'Enter Fanatics Anytime TD prices for players in at least three Sunday games. A ticket appears when the three prices multiply to +2000 or higher.':
    'No three-game ticket reaches +2000 using current Kalshi reference prices.'));
  return box(label,grid(2,picks.map(ticket=>'<div class="card"><h3>'+american(1/ticket.decimal)+' estimated combined odds</h3>'+
    '<p class="subtle">'+pct(ticket.chance,1)+' model estimate for all three to score</p>'+
    '<ul>'+ticket.legs.map(({row,price})=>'<li><strong>'+esc(row.p.name)+'</strong> '+odds(price)+' · '+esc(row.team+' vs '+row.opp)+
      '<br><small>'+esc(reasons(row,profile).join(' · '))+'</small></li>').join('')+'</ul></div>'))+
    '<p class="subtle">'+(fanatics?'Confirm the combined odds, eligible games and offer in the Fanatics betslip.':
      'Market comparison using Kalshi asks. Enter Fanatics prices to build tickets for the promo.')+
    ' The model estimate multiplies the three individual TD chances.</p>');
}

export function tdJackpotPage(data){
  const entered=Object.fromEntries(Object.entries(S.f).filter(([key])=>key.startsWith('jackpotPrice:')).map(([key,value])=>[key.slice(13),value]));
  const rows=jackpotCandidates(data.rows,S.odds||[],entered,Date.now()),profile=defense();
  const opponents=Object.keys(nflTeams).sort();
  const keys=Object.keys(tdDefenseMetrics),metric=tdDefenseMetrics[S.f.jackpotDefense]?S.f.jackpotDefense:'rush';
  const header='<h1>Fanatics TD Jackpot</h1>'+slate({navOnly:true})+tools(btn('Check for updates','nflParlayCheck',''))+
    '<p class="subtle">Three different anytime TD scorers from three Sunday games, with combined odds of +2000 or higher. Winning entries share the jackpot under the offer in your Fanatics app.</p>';
  const dates=[...new Set(rows.map(row=>row.game.date))];
  const visible=rows.filter(row=>(!S.f.jackpotOpp||row.opp===S.f.jackpotOpp)&&(!S.f.search||row.p.name.toLowerCase().includes(S.f.search.toLowerCase())));
  const candidates=rows.length?box('Sunday scorers · '+esc(dates.map(date=>dateLabel(date,true)).join(' / ')),
    tools(select('Opponent','jackpotOpp',[['','All defenses'],...opponents])+
      '<input type="search" data-field="search" aria-label="Find a scorer" placeholder="Find a scorer" value="'+esc(S.f.search||'')+'">')+
    table(['Player','Opponent','TD chance','Matchup and usage','Kalshi','Fanatics price'],visible.map(row=>{
      const key=jackpotKey(row),raw=entered[key]||'',invalid=raw&&jackpotPrice(raw)==null;
      const input='<input class="jackpot-price" type="text" inputmode="text" placeholder="'+esc(priceText(row.fanatics))+
        '" data-field="jackpotPrice:'+esc(key)+'" value="'+esc(raw)+'" aria-label="Fanatics price for '+esc(row.p.name)+'"'+(invalid?' aria-invalid="true"':'')+'>'+
        (invalid?'<small>Enter American odds, such as +180.</small>':'')+(row.status?'<small>'+esc(row.status)+' · held out of tickets</small>':'');
      return [person(row.p),team(row.opp),pct(row.anytime,1),esc(reasons(row,profile).join(' · ')),priceText(row.reference),cell(input,'jackpot-edit')];
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
  return header+(rows.length?tickets(rows,'fanatics',profile)+tickets(rows,'reference',profile):'')+candidates+defenses;
}
