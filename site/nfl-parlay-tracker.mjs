// GOING LONG NFL Leg Tracker: the shared tracker page (parlay-tracker-ui.mjs) with NFL breakdowns, so each rule in the
// Suggested Parlays engine shows whether the legs it keeps beat the legs it removes.
import {markets,yardMarkets,tdMarkets,PRIOR,badWeather} from './nfl-parlay-engine.mjs';
import {savedNflTickets} from './nfl-parlays.mjs';
import {createTracker,bucket,notes,round,signed,pct,impliedProb} from './parlay-tracker-ui.mjs';

const thirds=r=>bucket(r?.rank/r?.total,[[.34,'Top third (allows least)'],[.67,'Middle third'],[Infinity,'Bottom third (allows most)']]);
const rates=[[.5,'Below 50%'],[.6,'50–59%'],[.7,'60–69%'],[Infinity,'70%+']];
const breakdowns={
  'Stat & side':l=>l.stat+' · '+l.side,
  'Role':l=>l.context?.role||'Unknown',
  'Defense vs role':l=>thirds(l.context?.defense?.rank),
  'Line vs projection':l=>l.projection==null?'No projection':bucket((l.projection-l.line)*(l.side==='Over'?1:-1)/Math.max(Math.abs(l.line),1),
    [[0,'Against the side'],[.1,'0–10% in favor'],[.25,'10–25% in favor'],[Infinity,'25%+ in favor']]),
  'Last 8 hit rate':l=>bucket(l.form?.last8?.rate,rates),
  'Season hit rate':l=>bucket(l.form?.season?.rate,rates),
  'Venue hit rate':l=>bucket(l.form?.venue?.rate,rates),
  'Shrunk chance vs price':l=>l.edge==null?'Unknown':bucket(l.edge,[[0,'Below the price'],[.05,'0–5 points above'],[.1,'5–10 points above'],[Infinity,'10+ points above']]),
  'Game script':l=>{const s=l.context?.script;return s==null?'Unknown':s>=7?'Favored by 7+':s>=3?'Favored by 3–6.5':s>-3?'Close (under 3)':s>-7?'Underdog by 3–6.5':'Underdog by 7+';},
  'Team total':l=>bucket(l.context?.teamTotal,[[20,'Under 20'],[24,'20 to under 24'],[27,'24 to under 27'],[Infinity,'27+']]),
  'Weather':l=>{const w=l.context?.weather;return !w?'No forecast':w.roof==='dome'?'Dome':badWeather(w)?'Wind 15+ mph or rain':(w.wind??0)>=10?'Wind 10–14 mph':'Calm';},
  'Snap share (L3)':l=>bucket(l.context?.snaps,[[.5,'Under 50%'],[.75,'50–74%'],[Infinity,'75%+']]),
  'Injury context':l=>l.checks?.Availability?'Player out':l.context?.status?l.context.status:l.context?.qbOut?'Starting QB out':
    l.context?.olOut?.length?'Starting OL out':l.context?.absences?.length?'Teammate out':l.context?.cbOut?.length?'Opposing CB out':'None flagged',
  'Rest':l=>bucket(l.context?.rest,[[6,'Short week'],[13,'Normal week'],[Infinity,'Off a bye']]),
  'Odds':l=>bucket(impliedProb(l.odds),[[.4,'Under 40% implied'],[.6,'40–59% implied'],[Infinity,'60%+ implied']]),
  'Player':l=>l.name,'Team':l=>l.team,'Opponent':l=>l.opp,
  'Quote age':l=>l.flags.includes('Stale quote')?'Stale':l.flags.includes('Quote time unknown')?'Unknown':'Within 90 minutes'
};
const legText=l=>tdMarkets.has(l.stat)?l.stat+': '+(l.side==='Over'?'Yes':'No'):l.side+' '+l.line+' '+l.stat+(yardMarkets.has(l.stat)?' yds':'');
const nfl=createTracker({prefix:'nfl-parlay-legs',title:'NFL Leg Tracker',suggested:'long/suggested-parlays.html',markets,prior:PRIOR,breakdowns,
  recent:{key:'last8',label:'L8'},legText,savedTickets:savedNflTickets,alternates:false,startLabel:'Kickoff',
  forms:[['L5','last5'],['L8','last8'],['Season','season'],['Home','home'],['Away','away'],['Venue','venue']],
  empty:'Results will appear once the tracker captures priced NFL props before kickoff.',
  coverage:index=>(index.filters?`Default ticket: ${index.filters.legs} legs, one per game, ${index.filters.hit}% minimum last-8 hit rate, ${index.filters.sample}+ games played, ${index.filters.spread} max spread, ${index.filters.tdMax} TD leg at most. `:'')+
    'Every market is screened, including First TD, so each rule has a record. Each line and side counts once at its last pregame quote. Results come from the nflverse play-by-play, usually the morning after the game; snap counts mark players who did not play as void.',
  detail:l=>{
    const c=l.context||{}, d=c.defense, w=c.weather;
    return `<p>${notes(['Role '+(c.role||'—'),d?'Defense '+d.rank.rank+'/'+d.rank.total+' vs role ('+d.label+')':'',
      'Projection '+round(l.projection),'L5 avg '+round(l.recentAvg),'Season avg '+round(l.avg),l.chance!=null?'Shrunk chance '+pct(l.chance):'',
      'Reads '+(l.readsFor??'—')+' for / '+(l.readsAgainst??'—')+' against'])}</p>
    <p>${notes(['Spread '+round(c.spread),c.script!=null?'Script '+signed(c.script):'','Total '+round(c.total),'Team total '+round(c.teamTotal),
      c.model?'Model win '+pct(c.model.p):'',c.proe!=null?'PROE '+signed(c.proe*100)+'%':'',c.pace!=null?'Pace '+round(c.pace)+' plays':'',
      w?(w.roof==='dome'?'Dome':[w.wind!=null?w.wind+' mph':'',w.temp!=null?w.temp+'°F':'',w.rain?w.rain+' in rain':''].filter(Boolean).join(', ')):'',
      c.rest!=null?c.rest+' days rest':''])}</p>
    <p>${notes([c.snaps!=null?'Snaps '+pct(c.snaps):'',c.share!=null?'Share '+pct(c.share)+(c.recentShare!=null?' (L3 '+pct(c.recentShare)+')':''):'',
      c.rzShare!=null?'Red-zone share '+pct(c.rzShare):'',c.ryoe!=null?'RYOE '+signed(c.ryoe):'',c.cbRoom!=null?'Opp corners '+round(c.cbRoom)+' yds/target':'',
      c.qbOut?'QB out: '+c.qbOut:'',c.olOut?.length?'OL out: '+c.olOut.join(', '):'',c.cbOut?.length?'Opp CB out: '+c.cbOut.join(', '):''])}</p>`;
  }});
export const parlayTrackerLoad=()=>nfl.load();
export const parlayTrackerPage=()=>nfl.page();
export const parlayTrackerAction=(act,value)=>nfl.action(act,value);
