import {mean,total} from './math.mjs';
import {allowedRanks,favorable} from './parlay-core.mjs';

const skillPosition=p=>p==='FB'?'RB':p;

// The archive records target location and depth. Use the same WR role estimate as the parlay engine.
export function playerRole(p){
  const sum=k=>total(p.logs,x=>x[k]||0);
  if(p.pos==='QB')return 'QBs';
  if(p.pos==='TE')return 'TEs';
  if(p.pos==='RB'||p.pos==='FB')return sum('targets')/Math.max(1,sum('targets')+sum('rush'))>=.26?'receiving RBs':'rushing RBs';
  if(p.pos==='WR'){
    const t=sum('targets'),mid=t?sum('mid')/t:0,adot=t?sum('air')/t:null;
    return mid>=.27||mid>=.21&&adot!=null&&adot<9.6?'slot WRs (est.)':'outside WRs';
  }
  return null;
}

const passing=[['yards','Passing yards','yds'],['opps','Pass attempts','att'],['catches','Completions','cmp'],
  ['td','Passing TDs','TD'],['efficiency','Yards per attempt','yds/att']];
const rushing=[['yards','Rushing yards','yds'],['opps','Carries','car'],['td','Rushing TDs','TD'],
  ['explosive','Runs of 10+ yards','runs'],['efficiency','Yards per carry','yds/car']];
const catching=[['yards','Receiving yards','yds'],['catches','Receptions','rec'],['opps','Targets','tgt'],
  ['td','Receiving TDs','TD'],['explosive','Catches of 20+ yards','rec'],['efficiency','Yards per target','yds/tgt']];
export const defenseGroups=[
  {key:'qbPass',label:'QB passing',min:80,metrics:passing},
  {key:'qbRush',label:'QB rushing',min:15,metrics:rushing},
  {key:'rbRush',label:'RB rushing',min:60,metrics:rushing},
  {key:'rbCatch',label:'RB receiving',min:20,metrics:catching},
  {key:'slot',label:'Slot WRs',min:20,metrics:catching},
  {key:'outside',label:'Outside WRs',min:20,metrics:catching},
  {key:'wr',label:'All WRs',min:20,metrics:catching},
  {key:'te',label:'Tight ends',min:20,metrics:catching},
];

const bucket=()=>({opps:0,yards:0,catches:0,td:0,explosive:0});
const gameStats=()=>Object.fromEntries(defenseGroups.map(({key})=>[key,bucket()]));
const qualifying=(games,events,matchup)=>games.filter(g=>g.id.slice(0,4)===matchup.id.slice(0,4)&&
  g.date<matchup.date&&Number.isFinite(g.sa)&&Number.isFinite(g.sh)&&events[g.id]?.length)
  .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
const validPass=p=>p[1]==='pass'&&p[10]&&!p[28];
const receiverKey=p=>p[0]+'|'+p[11];
const add=(target,yards,complete,score,explosive)=>{
  target.opps++;
  target.yards+=yards;
  target.catches+=Number(complete);
  target.td+=Number(score);
  target.explosive+=Number(explosive);
};

export function defenseTargets({schedule=[],events={},players={}},matchup){
  const finals=qualifying(schedule,events,matchup), profiles=new Map(), receivers=new Map();
  // Learn estimated roles from the same pregame archive, scoped to each player's offense.
  for(const game of finals)for(const p of events[game.id]){
    if(!validPass(p)||players[p[11]]?.[1]!=='WR'||(p[0]!==game.a&&p[0]!==game.h))continue;
    const id=receiverKey(p);
    if(!receivers.has(id))receivers.set(id,{targets:0,mid:0,air:0,known:0});
    const entry=receivers.get(id);
    entry.targets++;
    entry.mid+=Number(p[18]==='middle');
    if(Number.isFinite(p[13])){entry.air+=p[13];entry.known++;}
  }
  const wrRoles=new Map();
  for(const [id,log] of receivers){
    if(log.targets<12||log.known<Math.ceil(.75*log.targets))continue;
    const role=playerRole({pos:'WR',logs:[{...log,air:log.air*log.targets/log.known}]});
    wrRoles.set(id,role==='slot WRs (est.)'?'slot':'outside');
  }

  let latest=null;
  for(const g of finals){
    const sides={[g.a]:gameStats(),[g.h]:gameStats()};
    let away=0, home=0;
    for(const p of events[g.id]){
      const defense=p[0]===g.a?sides[g.h]:p[0]===g.h?sides[g.a]:null;
      if(!defense||!Number.isFinite(p[2]))continue;
      const pass=validPass(p), run=p[1]==='run'&&p[12];
      if(!pass&&!run)continue;
      if(p[0]===g.a)away++;else home++;
      const offensiveScore=p[8]===p[0]&&!p[22];
      if(run){
        const pos=skillPosition(players[p[12]]?.[1]), group=pos==='QB'?'qbRush':pos==='RB'?'rbRush':null;
        if(group)add(defense[group],p[2],false,offensiveScore&&p[9]===p[12],p[2]>=10);
        continue;
      }
      const caught=Boolean(p[15]), yards=caught?p[2]:0, score=caught&&offensiveScore&&p[11]&&p[9]===p[11];
      if(players[p[10]]?.[1]==='QB')add(defense.qbPass,yards,caught,Boolean(score),false);
      if(!p[11])continue;
      const pos=skillPosition(players[p[11]]?.[1]), role=pos==='WR'?wrRoles.get(receiverKey(p)):null;
      const group=pos==='RB'?'rbCatch':pos==='WR'?'wr':pos==='TE'?'te':null;
      if(group)add(defense[group],yards,caught,Boolean(score),caught&&yards>=20);
      if(role)add(defense[role],yards,caught,Boolean(score),caught&&yards>=20);
    }
    if(!away||!home)continue;
    for(const [team,groups] of Object.entries(sides)){
      if(!profiles.has(team))profiles.set(team,[]);
      profiles.get(team).push(groups);
    }
    latest=g.date;
  }

  const rows=new Map([...profiles].map(([team,games])=>[team,{games:games.length,angles:[]}]));
  const value=(games,key,stat,min)=>{
    if(stat!=='efficiency')return mean(games,g=>g[key][stat]);
    const opportunities=total(games,g=>g[key].opps);
    return opportunities>=min?total(games,g=>g[key].yards)/opportunities:null;
  };
  for(const {key,label,min,metrics} of defenseGroups)for(const [stat,title,unit] of metrics){
    const candidates=[...profiles].map(([team,games])=>({team,games,season:value(games,key,stat,min)}));
    const ranked=candidates.filter(x=>x.games.length>=4&&Number.isFinite(x.season));
    const ranks=allowedRanks(ranked.map(x=>[x.team,x.season])), league=mean(ranked,x=>x.season);
    for(const {team,games,season} of candidates){
      const recent=games.slice(-3), rank=ranks.get(team);
      rows.get(team).angles.push({group:key,label,title,stat,unit,season,rank,league,
        recent:value(recent,key,stat,Math.ceil(min/3)),recentGames:recent.length,opportunities:total(games,g=>g[key].opps)});
    }
  }
  return {latest,teams:rows};
}

export function topDefenseTargets(angles){
  const rankShare=row=>(row.rank.rank-1)/(row.rank.total-1);
  const ordered=angles.filter(row=>row.rank?.total>=8&&row.season>row.league&&favorable(row.rank,true))
    .sort((a,b)=>rankShare(b)-rankShare(a)||
      (b.season-b.league)/Math.max(1,b.league)-(a.season-a.league)/Math.max(1,a.league));
  const seen=new Set();
  return ordered.filter(row=>{
    if(seen.has(row.group))return false;
    seen.add(row.group);
    return true;
  }).slice(0,5);
}
