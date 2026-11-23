import {favorable} from './parlay-core.mjs';
import {badge,box,dateLabel,empty,esc,grid,round,select,teamBanner,teamName,tools} from './ui.mjs';
import {defenseGroups,defenseTargets,topDefenseTargets} from './nfl-defense-targets.mjs';

let memo;
const options=[['top','Top targets'],['all','All angles'],...defenseGroups.map(g=>[g.key,g.label])];

function angle(row,leading){
  const {rank,stat,unit}=row;
  const value=v=>v==null?'—':round(v,stat==='efficiency'?2:1)+' '+unit;
  const raw=stat==='efficiency'?'Season':'Season / game';
  const recent='Last '+row.recentGames+(stat==='efficiency'?'':' / game');
  const high=favorable(rank,true), low=favorable(rank,false);
  const rankText=rank?'#'+rank.rank+(rank.end===rank.rank?'':'–'+rank.end)+' of '+rank.total:'Unranked';
  const group=leading?`<span class="subtle">${esc(row.label)}</span>`:'';
  return `<li class="nfl-defense-angle">
    <div class="nfl-angle-name">${group}<strong>${esc(row.title)}</strong></div>
    ${badge(rankText,high?'r':low?'g':'')}
    <dl class="nfl-angle-stats">
      <div><dt>${raw}</dt><dd>${esc(value(row.season))}</dd></div>
      <div><dt>${recent}</dt><dd>${esc(value(row.recent))}</dd></div>
      <div><dt>League</dt><dd>${esc(value(row.league))}</dd></div>
    </dl>
  </li>`;
}

function matchupSide(data,defense,offense,view){
  const info=data.teams.get(defense);
  const byMetric=angles=>angles.map(row=>angle(row,false)).join('');
  let details;
  if(!info)details=empty('No completed games in the play-by-play archive for this defense.');
  else if(view==='top'){
    const top=topDefenseTargets(info.angles);
    details=top.length?`<ol class="nfl-angle-list">${top.map(row=>angle(row,true)).join('')}</ol>`:
      empty('No high-allowance angles with enough league coverage. Choose a position to see the recorded splits.');
  }else{
    details=defenseGroups.filter(g=>view==='all'||g.key===view).map(g=>`<section class="nfl-angle-group">
      <h4>${esc(g.label)}</h4><ul class="nfl-angle-list">${byMetric(info.angles.filter(row=>row.group===g.key))}</ul></section>`).join('');
  }
  const count=info?` · ${info.games} ${info.games===1?'game':'games'} in archive`:'';
  return `<article class="nfl-defense-side">
    ${teamBanner(defense,'Defense')}
    <p class="subtle">${esc(teamName(offense))} offense${count}</p>
    ${details}
  </article>`;
}

export function defenseTargetsPanel(archive,game,view='top'){
  const key=game.id.slice(0,4)+'|'+game.date;
  if(!memo||memo.archive!==archive||memo.key!==key)memo={archive,key,data:defenseTargets(archive,game)};
  const {data}=memo;
  const last=data.latest?'Play-by-play through '+dateLabel(data.latest,true)+'. ':'';
  return box('Defense Targets',tools(select('Position or angle','nflDefenseGroup',options))+
    `<p class="subtle">${esc(last)}Rank 1 allows the least. Last 3 shows recent form against the season and league averages.</p>`+
    grid(2,[matchupSide(data,game.h,game.a,view),matchupSide(data,game.a,game.h,view)],'nfl-defense-targets')+
    '<details class="details nfl-angle-method"><summary>How these angles are ranked</summary><p class="subtle">Season averages use completed games in the play-by-play archive dated before this matchup. A defense needs four games to earn a rank. Per-opportunity averages also need enough attempts or targets. The league average uses ranked defenses.</p><p class="subtle">Slot and outside WR labels are estimated from where receivers were targeted and how far those throws traveled. WRs with insufficient role data still count in All WRs. QB rushing includes scrambles and designed runs. Sacks, kneels and spikes are excluded.</p></details>',
    'These are defensive allowances by role. Check workload and the line for any individual player.', 'nfl-defense-panel');
}
