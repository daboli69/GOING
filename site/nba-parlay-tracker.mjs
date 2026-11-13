// GOING UP Parlay Leg Tracker: the shared tracker page (parlay-tracker-ui.mjs) with the NBA breakdowns.
import {esc,table} from './ui.mjs';
import {markets} from './nba-parlay-engine.mjs';
import {savedParlayTickets} from './nba-parlays.mjs';
import {createTracker,bucket,notes,round,signed,pct,impliedProb} from './parlay-tracker-ui.mjs';

const breakdowns={
    'Stat & side':l=>l.stat+' · '+l.side,
    'Player':l=>l.name,
    'Team':l=>l.team,
    'Opponent':l=>l.opp,
    'Position':l=>l.context?.position||'Unknown',
    'Player type':l=>l.context?.type||'Unknown',
    'Defense rank':l=>{
      const r=l.context?.typeRank||l.context?.posRank;
      return bucket(r?.rank/r?.total,[[.34,'Top third (allows least)'],[.67,'Middle third'],[Infinity,'Bottom third (allows most)']]);
    },
    'Spread':l=>l.context?.spread!=null&&l.context.spread<=6.5?'Up to 6.5':
      bucket(l.context?.spread,[[14.5,'Over 6.5 to under 14.5'],[Infinity,'14.5+']]),
    'Game total':l=>bucket(l.context?.total,[[220,'Below 220'],[230,'220 to under 230'],[Infinity,'230+']]),
    'Season hit rate':l=>bucket(l.form?.season?.rate,[[.5,'Below 50%'],[.6,'50–59%'],[.7,'60–69%'],[Infinity,'70%+']]),
    'L10 hit rate':l=>bucket(l.form?.last10?.rate,[[.5,'Below 50%'],[.6,'50–59%'],[.7,'60–69%'],[Infinity,'70%+']]),
    'Venue hit rate':l=>bucket(l.form?.venue?.rate,[[.5,'Below 50%'],[.6,'50–59%'],[.7,'60–69%'],[Infinity,'70%+']]),
    'Line vs average':l=>l.avg==null?'Unknown':bucket((l.avg-l.line)*(l.side==='Over'?1:-1),
      [[0,'Against the side'],[1,'0 to under 1 in favor'],[Infinity,'1+ in favor']]),
    'Type sample':l=>l.context?.typeEdge?bucket(l.context.typeEdge.n,[[5,'Under 5 games'],[10,'5–9 games'],[Infinity,'10+ games']]):'Not applied',
    'Estimated pace':l=>bucket(l.context?.pace,[[98,'Under 98'],[102,'98 to under 102'],[Infinity,'102+']]),
    'Odds':l=>bucket(impliedProb(l.odds),[[.4,'Under 40% implied'],[.6,'40–59% implied'],[Infinity,'60%+ implied']]),
    'Injury context':l=>l.checks?.Availability?'Player out':l.flags.includes('Player injury report unavailable')?'Report unavailable':
      l.context?.absences?.length?'Teammate out':'No rotation absence flagged',
    'Quote age':l=>l.flags.includes('Stale quote')?'Stale':l.flags.includes('Quote time unknown')?'Unknown':'Within 90 minutes'
};
const nba=createTracker({prefix:'parlay-legs',title:'Parlay Leg Tracker',suggested:'up/suggested-parlays.html',markets,prior:5,breakdowns,
  recent:{key:'last10',label:'L10'},savedTickets:savedParlayTickets,alternates:true,startLabel:'Tip',
  forms:[['L5','last5'],['L10','last10'],['Season','season'],['Home','home'],['Away','away'],['Venue','venue']],
  empty:'Results will appear once the tracker captures priced props before tipoff.',
  coverage:index=>(index.filters?`Default ticket: ${index.filters.legs} legs, one per game, ${index.filters.hit}% minimum hit rate, ${index.filters.sample}-game type sample, ${index.filters.spread} max spread. `:'')+
    'Alternate lines are tracked for comparison. Each line and side counts once at its last observed pregame quote.',
  detail:l=>{
    const c=l.context||{}, d=c.typeEdge;
    return `<p>${notes(['Season avg '+round(l.avg),'L10 avg '+round(l.recentAvg),'Spread '+round(c.spread),'Total '+round(c.total),
      'Pace '+round(c.pace),'3PA rate '+pct(c.threeRate),'Position '+(c.position||'—'),'Type '+(c.type||'—'),
      c.typeRank?'Defense vs type '+c.typeRank.rank+'/'+c.typeRank.total:'',
      c.posRank?'Defense vs position '+c.posRank.rank+'/'+c.posRank.total:'',
      d?.n?'Type edge '+signed(d.delta)+' ('+d.beat+'/'+d.n+')':'','Reads '+(c.readsFor??'—')+' for / '+(c.readsAgainst??'—')+' against'])}</p>`;
  }});
export const parlayTrackerLoad=()=>nba.load();
export const parlayTrackerPage=()=>nba.page();
export const parlayTrackerAction=(act,value)=>nba.action(act,value);
