import {current as S,badge,box,btn,card,cell,empty,esc,grid,person,select,slate,table,team,teamBanner,toggles,tools,et} from './ui.mjs';
import {mean,pct,round,signed} from './math.mjs';
import {roleTrend,propValue} from './nba-role-data.mjs';

const roleName=role=>role==='out'?'Out':role==='new starter'?'New starter':role==='starter'?'Projected starter':'Bench / other';
const delta=value=>value==null?'—':signed(value);
const avg=(logs,field)=>round(mean(logs.map(field).filter(Number.isFinite)));

function workloadTable(rows,size,stat,tracking){
  const data=rows.map(row=>({...row,trend:roleTrend(row.logs,size)})).sort((a,b)=>
    Math.abs(b.trend.minutes??0)-Math.abs(a.trend.minutes??0)||b.p.min-a.p.min);
  const changes=data.map(({p,role,status,without,trend})=>{
    const {recent,prior}=trend;
    const volume=(a,b)=>round(a)+' / '+round(b);
    const reason=without?.without.length?without.without.length+' games · '+avg(without.without,r=>propValue(r,stat)): '—';
    const advanced=tracking(p), metric=k=>advanced?.[k]?round(advanced[k].value)+' · '+advanced[k].games+' GP':'—';
    return [person(p),team(p.team),cell(badge(roleName(role),role==='out'?'r':'')+
      (status&&role!=='out'?' <small>'+esc(status)+'</small>':'')),recent.n+' / '+prior.n,recent.starts+' / '+prior.starts,
      volume(recent.minutes,prior.minutes),cell(delta(trend.minutes),trend.minutes>2?'good heat':trend.minutes< -2?'bad heat':''),
      volume(recent.fga,prior.fga),delta(trend.attempts),volume(recent.three,prior.three),volume(recent.fta,prior.fta),
      pct(recent.fg)+' / '+pct(prior.fg),metric('potential'),metric('chances'),reason,btn('Role details','nbaRolePlayer',p.id,'outline')];
  });
  return table(['Player','Team','Pregame role','Games','Starts','MIN','Δ MIN','FGA','Δ FGA','3PA','FTA','FG%','Potential AST/G','REB chances/G','Without listed out · '+stat,''],changes,
    {cls:'compact',wrap:'box',sort:'nba-role-volume',empty:'No players match these filters.'});
}

function statusFilter(value,filter){
  if(filter==='All')return true;
  return filter==='Out'?/^(out|suspended|suspension)$/i.test(value||''):/questionable|doubtful|day.to.day|probable|^gtd$/i.test(value||'');
}

function injuriesAndLineups(cards,checked,filter,historical){
  const note=historical?'Select today or a future slate for the current injury report. Historical starters can be verified from the box score.':
    checked?'Injury report checked '+checked+'.':'Injury check time unavailable.';
  return '<p class="subtle">'+esc(note)+' <a href="https://www.nba.com/players/injury-report" target="_blank" rel="noopener">Official NBA injury reports</a></p>'+
    cards.map(({game,sides})=>box(team(game.a)+' @ '+team(game.h)+' · '+esc(et(game)),
      tools(btn(game.status==='FUT'?'Check official starters':'Verify official starters','nbaRoleVerify',game.id,'outline'))+
      grid(2,sides.map(({code,report,starters})=>{
        const projected=starters.map(({p,lastStarted})=>person(p).html+(!lastStarted?' '+badge('Projected change'):''));
        const rows=report.filter(row=>statusFilter(row.status,filter)).sort((a,b)=>
          Number(!statusFilter(a.status,'Out'))-Number(!statusFilter(b.status,'Out'))||a.name.localeCompare(b.name));
        const injuryRows=rows.map(row=>[row.player?person(row.player):esc(row.name),
          badge(esc(row.status||'Unknown'),statusFilter(row.status,'Out')?'r':''),esc(row.detail||'—'),
          row.beneficiaries?.length?esc(row.beneficiaries.map(b=>b.name+' '+signed(b.minutes)+' MIN ('+b.n+' games)').join(' · ')):'—']);
        return card(teamBanner(code),'<p><strong>Projected starters</strong></p><div class="nba-role-starters">'+
          (projected.join('')||empty('Recent starter data unavailable.'))+'</div>'+
          (injuryRows.length?table(['Player','Status','Report','Minutes up when out'],injuryRows,{cls:'compact',wrap:'box'}):
            empty('No matching injury entries. Check the report for availability.')));
      })))).join('');
}

export function roleBoard({players,cards,checked,historical,tracking,trackingThrough}){
  const f=S.f;
  const opts=[['all','All games'],...cards.map(({game})=>[String(game.id),game.a+' @ '+game.h])];
  const chosen=cards.find(({game})=>String(game.id)===f.nbaRoleGame);
  const games=chosen?[chosen]:cards;
  const teams=new Set(games.flatMap(({sides})=>sides.map(s=>s.code)));
  const view=f.nbaRoleView;
  const filter=tools(select('Game','nbaRoleGame',opts)+
    (view==='Workload'?select('Recent games','nbaRoleWindow',[3,5,10,15])+select('Absence stat','nbaRoleStat',['PRA','Points','Threes','Assists','Rebounds']):
      view==='Injuries & Lineups'?select('Injury status','nbaInjuryFilter',['All','Out','Game-time decisions']):''));
  const heading='<h1>Role Changes</h1>'+slate({navOnly:true,date:true})+
    tools(toggles(['Workload','Injuries & Lineups','Rotations & On/Off'],'nbaRoleView'))+filter;
  if(!games.length)return heading+empty('No games on the selected slate.');
  if(view==='Injuries & Lineups')return heading+injuriesAndLineups(games,checked,f.nbaInjuryFilter,historical);
  if(view==='Rotations & On/Off')return heading+box('Recent rotations',grid(2,[...teams].map(code=>
    card(teamBanner(code),btn('Open last 5 team games','nbaRoleRotations',code,'outline')))),
    'Official play-by-play is checked against the box score before a game is included.');
  return heading+box('Minutes & Volume',(trackingThrough&&players.some(r=>tracking(r.p))?'<p class="subtle">NBA optical tracking through '+esc(trackingThrough)+'.</p>':'')+
    workloadTable(players.filter(r=>teams.has(r.p.team)),Number(f.nbaRoleWindow)||5,f.nbaRoleStat||'PRA',tracking),
    'Numbers show recent games / earlier games in the player’s current team stint. Δ requires at least 3 recent and 5 earlier appearances. Absence averages use games when all listed teammates in the sample were out together.');
}
