// GOING YARD: the Going Yard MLB home run model (github.com/daboli69/hr-board), shown in the GOING dashboard design.
// All numbers come from hr-board's published board; this module only presents them.
import {current as S,esc,box,grid,card,metric,logo,team,teamBanner,teamName,table,cell,tools,btn,toggles,select,search,info,empty,slate,dialog,badge,person,et,dateLabel,round,pct} from './ui.mjs';
import {signed} from './math.mjs';
import * as More from './yard-more.mjs';
import * as Bets from './yard-bets.mjs';
import {setMinEdgeValue} from './yard-store.mjs';

const board=()=>S.data||{};
const headshot=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`;
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const ago=iso=>{if(!iso)return 'unknown';const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<2?'just now':m<90?m+' min ago':m<36*60?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';};
// hr-board's own thresholds (etl/compute.py ANCHORS): [poor, good, elite].
const ANCHORS={pull_air_pct:[28,40,55],avg_ev:[86,88.5,91.5],barrel_pct:[6,11,17],ideal_aa_pct:[45,58,70],iso:[.14,.2,.29],slg:[.38,.45,.56]};
const SIGNALS=[['pull_air_pct','Pull-air%',1],['avg_ev','EV',1],['barrel_pct','Brl%',1],['ideal_aa_pct','IAA%',1],['iso','ISO',3],['slg','SLG',3]];
const fmt=(k,v)=>v==null?'—':k==='iso'||k==='slg'?Number(v).toFixed(3).replace(/^0/,''):round(v,1);
const shade=(k,v)=>{if(v==null)return 'none';const [p,g]=ANCHORS[k];return v>=g?'good heat':v>=p?'mid heat':'bad heat';};
const sig=(p,k,w='recent')=>p.metrics?.[k]?.[w]??(w==='recent'?p[k]:null);
const sigCell=(p,k,w)=>{const v=sig(p,k,w);return cell(fmt(k,v),shade(k,v),`${w}: poor ${ANCHORS[k][0]}, good ${ANCHORS[k][1]}, elite ${ANCHORS[k][2]}`);};
const heatCell=h=>h==null?cell('—','none'):cell(h,h>=70?'good heat':h>=55?'mid heat':h>=40?'':'none');
// Arm form from the hitter's side: a hittable arm is good news.
const TARGET=['SHELLABLE','STEADY-BAD','HITTABLE','SLIPPING'],AVOID=['DEALING','BOUNCING-BACK','BAD-IMPROVING'];
const formBadge=f=>{const l=typeof f==='string'?f:f?.label;return l?badge(l,TARGET.includes(l)?'g':AVOID.includes(l)?'r':''):'';};
const handBadge=h=>h?`<span class="badge hand-${esc(h)}" title="${h==='R'?'Bats right':h==='L'?'Bats left':'Switch hitter'}">${esc(h)}</span>`:'';
const tierBadge=t=>t?badge(t,['LOADED','STRONG'].includes(t)?'g':t==='THIN'?'':''):'';
const hitter=(p,detail=true)=>person({id:p.id,name:p.name,team:p.team,img:headshot(p.id),pos:[p.bats&&'Bats '+p.bats,p.lineup_spot&&'#'+p.lineup_spot].filter(Boolean).join(' · ')},detail);
const pitcherCell=(a,detail=true)=>a?.name?person({id:'arm:'+a.id,name:a.name,team:a.team,img:a.id?headshot(a.id):null,pos:a.throws?(a.throws==='L'?'LHP':'RHP'):''},detail):'—';
const gameOf=id=>board().games?.find(g=>String(g.game_pk)===String(id));
const inGame=p=>S.f.allGames||!S.game||String(p.game_pk)===S.game.id;
const pageHead=(title,help,extra='')=>{
  const b=board(),fb=b.fallback;
  return `<h1>${title}${help?info(help):''}</h1><p class="subtle">Board built ${ago(b.generated_at)}${b.recent_window?` · recent window: last ${b.recent_window.days} game days (${esc(b.recent_window.start)} to ${esc(b.recent_window.end)})`:''}${extra}</p>`+
    (fb?`<div class="callout">No MLB games on the live board right now, so this shows the last slate hr-board published (${esc(dateLabel(b.slate_date))}). It switches back to the live board automatically when games return.</div>`:'');
};
const noSlate=()=>box('',empty('hr-board has not published a slate yet. The board fills in once lineups and probable pitchers post.'));

/* ---------- HR Board ---------- */
function filteredHitters(){
  const f=S.f,q=(f.search||'').toLowerCase(),floor=+String(f.floor).replace(/\D/g,'')||0;
  return (board().players||[]).filter(p=>inGame(p)&&(p.heat??0)>=floor&&(f.bats==='All'||p.bats===f.bats)&&
    (f.lineup!=='Confirmed only'||p.lineup_status==='confirmed')&&(!f.hideThin||(p.reliability?.score??3)>=2)&&(!q||`${p.name} ${p.team}`.toLowerCase().includes(q)))
    .sort((a,b)=>(b.heat??-1)-(a.heat??-1));
}
function boardPage(){
  const b=board();if(!b.players?.length)return pageHead('HR Board')+noSlate();
  const list=filteredHitters(),shown=S.f.more?list:list.slice(0,100);
  const rows=shown.map((p,i)=>({act:'player',v:p.id,cls:'clickable',cells:[i+1,hitter(p),cell(`${p.opp_pitcher?.name?esc(p.opp_pitcher.name):'TBD'} ${formBadge(p.opp_pitcher?.form)}`),heatCell(p.heat),cell(tierBadge(p.tier)),
    ...SIGNALS.map(([k])=>sigCell(p,k)),cell(p.park_hr_factor==null?'—':signed((p.park_hr_factor-1)*100,0)+'%',p.park_hr_factor==null?'none':p.park_hr_factor>=1.05?'good':p.park_hr_factor<=.95?'bad':''),
    p.hr_recent?.L15??'—',cell(p.trend?.dir==='up'?'▲':p.trend?.dir==='down'?'▼':'–',p.trend?.dir==='up'?'good':p.trend?.dir==='down'?'bad':'')]}));
  return pageHead('HR Board','Every hitter in today’s lineups, ranked by Heat: a 0–100 blend of six power signals over the last two weeks (barrel%, pulled fly balls and liners, ISO, exit velocity, ideal attack angle and SLG), nudged by how hittable the opposing starter has been. Cells are shaded against hr-board’s own thresholds: green clears “good”, yellow sits between “poor” and “good”, red is below “poor”. Park factor is shown for context and does not change Heat.',` · ${b.players.length} hitters`)+
    slate({note:S.f.allGames?'Tap a game to filter':'Showing one game · tap it again for all'})+
    tools(toggles(['All','40+','55+','70+'],'floor')+select('Bats','bats',['All','R','L','S'])+select('Lineups','lineup',['All lineups','Confirmed only'])+search('Search hitters or teams')+
      `<label class="field"><input type="checkbox" data-field="hideThin" ${S.f.hideThin?'checked':''}> Hide thin samples</label>`)+
    table(['#','Hitter','Opposing starter','Heat','Tier',...SIGNALS.map(([,l])=>l),'Park HR','HR L15','Trend'],rows,{sort:'yard-board',wrap:'box',cls:'wide',empty:'No hitters match these filters.'})+
    (list.length>100?tools(btn(S.f.more?'Show top 100':'Show all '+list.length,'flip','more')):'');
}

/* ---------- Top Plays ---------- */
function topPage(){
  const b=board();if(!b.players?.length)return pageHead('Top Plays')+noSlate();
  const byId=new Map(b.players.map(p=>[p.id,p]));
  const plays=table(['Hitter','Opposing arm','Heat','Tier','Matchup','Bomb','Why'],(b.top_plays||[]).map(t=>({act:'player',v:t.id,cls:'clickable',cells:[hitter({...byId.get(t.id),...t,lineup_spot:t.spot}),
    cell(`${esc(t.arm||'TBD')} ${formBadge(t.arm_form)}<br><small class="muted">HR vuln ${esc(t.arm_score??'—')}</small>`),heatCell(t.heat),cell(tierBadge(t.tier)),cell(badge(t.grade||'—',['ELITE','STRONG'].includes(t.grade)?'g':t.grade==='WEAK'?'r':'')+(t.aligned!=null?`<br><small class="muted">${t.aligned} factors aligned</small>`:'')),
    t.bomb==null?'—':cell(round(t.bomb,0),t.bomb>=65?'good heat':t.bomb>=40?'mid heat':''),cell(esc(t.why||''),'plain')]})),{wrap:'box',empty:'No top plays on this slate.'});
  const stacks=(b.vulnerable_arm_matchups?.rows||[]).slice(0,8).map(r=>card(`${esc(r.pitcher_name)} ${formBadge(r.form)}`,
    `<p class="subtle">${team(r.team)} vs ${team(r.opp)} · ${et({iso:r.time})} ET · vulnerability ${round(r.vuln,0)}</p>${(r.flags||[]).length?`<div class="chips">${r.flags.map(f=>badge(f)).join('')}</div>`:''}`+
    table(['Hitter','Spot','Chance'],(r.batters||[]).slice(0,5).map(x=>({act:'player',v:x.id,cls:'clickable',cells:[hitter({...byId.get(x.id),...x},false),x.spot??'—',pct(x.prob,1)]})),{cls:'compact'})));
  return pageHead('Top Plays','The strongest hitters not facing a DEALING arm, each with a matchup grade, how many factors line up, and a one-line reason. Vulnerable arms lists the starters most likely to give up a home run and the hitters lined up against them.')+
    ((b.briefing||[]).length?`<div class="callout">${b.briefing.map(esc).join('<br>')}</div>`:'')+box('Top plays',plays)+(stacks.length?box('Vulnerable arms and the bats facing them',grid(2,stacks)):'');
}

/* ---------- Game Scan ---------- */
function gamesPage(){
  const b=board();if(!b.games?.length)return pageHead('Game Scan')+noSlate();
  const seen=new Set(),games=b.games.filter(g=>!seen.has(g.game_pk)&&seen.add(g.game_pk)&&(S.f.allGames||!S.game||String(g.game_pk)===S.game.id));
  const body=games.map(g=>{
    const wx=b.wx?.find(w=>w.game_pk===g.game_pk),pr=b.park_ranks?.find(r=>r.home===g.home&&r.away===g.away),proj=b.game_projections?.find(x=>x.game_pk===g.game_pk);
    const side=t=>{
      const arm=b.arms?.find(a=>a.opp===t&&a.time===g.time)||b.arms?.find(a=>a.opp===t&&[g.home,g.away].includes(a.team));
      const pen=b.bullpen_rankings?.find(x=>x.team===(t===g.home?g.away:g.home));
      const bats=(b.players||[]).filter(p=>p.team===t&&p.game_pk===g.game_pk).sort((x,y)=>(y.heat??0)-(x.heat??0)).slice(0,4);
      return `<div>${teamBanner(t,proj?(t===g.home?round(proj.markov?.home_mean,1):round(proj.markov?.away_mean,1))+' proj. runs':'')}`+
        `<p class="subtle">Facing ${arm?`<strong>${esc(arm.name)}</strong> (${arm.throws==='L'?'LHP':'RHP'}) ${formBadge(arm.form)} HR vulnerability ${esc(arm.hr_score)}`:'starter not posted'}${pen?` · their pen ${formBadge(pen.form)} ${esc(pen.hr_score)}`:''}</p>`+
        table(['Hitter','Heat','Brl%','ISO'],bats.map(p=>({act:'player',v:p.id,cls:'clickable',cells:[hitter(p,false),heatCell(p.heat),sigCell(p,'barrel_pct'),sigCell(p,'iso')]})),{cls:'compact',empty:'Lineup not posted yet.'})+'</div>';
    };
    const weather=wx?[wx.roof==='closed'||wx.status==='indoor'?'Roof closed':null,wx.temp_f!=null?wx.temp_f+'°F':null,wx.wind_mph!=null?`wind ${wx.wind_mph} mph ${windArrow(wx.wind_rel_deg)}`:null,wx.precip_prob?`${wx.precip_prob}% rain`:null].filter(Boolean).join(' · '):'';
    return box(`${logo(g.away)} ${esc(g.away)} @ ${esc(g.home)} ${logo(g.home)}`,`<p class="subtle">${et({iso:g.time})} ET · ${esc(g.park||'')}${weather?' · '+weather:''}${pr?` · park HR ${signed(pr.hr_pct,0)}%`:''}${proj?.markov?` · projected total ${round(proj.markov.total_mean,1)} · ${esc(g.home)} win ${pct(proj.markov.home_wp)}`:''}</p>`+grid(2,[side(g.away),side(g.home)]));
  }).join('');
  return pageHead('Game Scan','Each game on the slate: both starters with their home run form, the bullpens behind them, weather and park, the run projection, and the four hottest bats on each side.')+slate({note:S.f.allGames?'Tap a game to show only that game':'Tap it again for every game'})+body;
}
const windArrow=deg=>deg==null?'':`<span aria-hidden="true" style="display:inline-block;transform:rotate(${Number(deg)}deg)">↑</span>`;

/* ---------- Pitchers & Bullpens ---------- */
function armsPage(){
  const b=board();if(!b.arms?.length&&!b.bullpen_rankings?.length)return pageHead('Pitchers & Bullpens')+noSlate();
  const v=S.f.view;
  const starters=table(['Pitcher','Matchup','Form','HR vulnerability','Recent','Season','FB%','GB%','Usual length','Red flags'],(b.arms||[]).slice().sort((x,y)=>(y.hr_score??0)-(x.hr_score??0)).map(a=>[pitcherCell(a),
    cell(`${team(a.team)} <span class="muted">vs</span> ${team(a.opp)}<br><small class="muted">${et({iso:a.time})} ET</small>`),cell(formBadge(a.form)),cell(a.hr_score??'—',a.hr_score>=50?'good heat':a.hr_score>=35?'mid heat':'bad heat'),
    a.recent_score??'—',a.season_score??'—',round(a.fb_pct,1),round(a.gb_pct,1),a.start_len!=null?round(a.start_len,1)+' IP':'—',cell((a.flags||[]).map(f=>badge(f)).join(' ')||'—','plain')]),{sort:'yard-arms',wrap:'box',cls:'wide'});
  const pens=table(['Bullpen','Form','HR vulnerability','Pen ERA','HR/9','Season HR','Workload','Available','Why'],(b.bullpen_rankings||[]).map(p=>[cell(team(p.team,true)),cell(formBadge(p.form)),
    cell(p.hr_score??'—',p.hr_score>=50?'good heat':p.hr_score>=35?'mid heat':'bad heat'),round(p.bp_era,2),round(p.hr9,2),p.season_hr??'—',cell(esc(p.label||'—'),p.label&&p.label!=='NORMAL'?'good':''),
    p.n_available!=null?`${p.n_available} of ${p.n_available+(p.n_unavailable||0)}`:'—',cell(esc((p.reasons||[]).join(' · ')),'plain')]),{sort:'yard-pens',wrap:'box'});
  const ks=new Map((b.pitcher_props||[]).map(p=>[p.id,p]));
  const edges=table(['Pitcher','Matchup','Vulnerability','Tier','3rd time through','ERA','xFIP','Stuff+','Hitters he fits worst'],(b.pitcher_edges||[]).slice().sort((x,y)=>(y.vuln?.score??0)-(x.vuln?.score??0)).map(e=>[pitcherCell(e),
    cell(`${team(e.team)} <span class="muted">vs</span> ${team(e.opp_team)}`),cell(round(e.vuln?.score,0),(e.vuln?.score??0)>=60?'good heat':(e.vuln?.score??0)>=40?'mid heat':''),cell(badge(e.vuln?.tier||'—',/elite|high/.test(e.vuln?.tier||'')?'g':'')),
    e.tto?.delta!=null?cell(signed(e.tto.delta*1000,0)+' SLG pts',e.tto.delta>=.15?'good':''):'—',round(e.season?.era??ks.get(e.id)?.season?.era,2),round(e.fg?.xfip,2),round(e.fg?.stuff_plus,0),
    cell((e.batters||[]).slice(0,3).map(x=>esc(x.name)).join(', ')||'—','plain')]),{sort:'yard-edges',wrap:'box',cls:'wide'});
  return pageHead('Pitchers & Bullpens','How likely each arm is to give up a home run. HR vulnerability blends recent and season contact allowed; form compares the two (SHELLABLE and STEADY-BAD are targets, DEALING is one to avoid). Green means good news for hitters.')+
    tools(toggles(['Starting pitchers','Bullpens','Pitch-level edges'],'view'))+(v==='Bullpens'?box('Bullpens',pens):v==='Pitch-level edges'?box('Pitch-level edges',edges,'Vulnerability from zone, platoon, park and times-through-the-order splits, with the lineup bats that fit his arsenal worst.'):box('Starting pitchers',starters));
}

/* ---------- Target Teams ---------- */
function targetsPage(){
  const b=board();if(!b.team_targets?.length)return pageHead('Target Teams')+noSlate();
  const parts=['starter','bullpen','staff','park','weather'];
  return pageHead('Target Teams','Which offenses are best placed to homer today: the opposing starter and bullpen, the staff overall, the park and the weather, each scored 0–100 and weighted into one number.')+
    table(['Offense','Facing','Score','Tier',...parts.map(k=>k[0].toUpperCase()+k.slice(1)),'Drivers'],b.team_targets.map(t=>[cell(team(t.bat_team,true)),cell(`${team(t.def_team)}<br><small class="muted">${esc(t.sp_name||'TBD')} (${t.sp_throws==='L'?'LHP':'RHP'})</small>`),
      cell(round(t.score,1),t.score>=65?'good heat':t.score>=45?'mid heat':''),cell(badge(t.tier||'—',t.tier==='PRIME'?'g':'')),...parts.map(k=>{const v=t.components?.[k];return v==null?cell('—','none'):cell(`${round(v,0)}<div class="linebar"><i style="width:${Math.max(0,Math.min(100,v))}%"></i></div>`,'plain');}),
      cell((t.drivers||[]).map(esc).join('<br>'),'plain')]),{sort:'yard-targets',wrap:'box',cls:'wide'});
}

/* ---------- Weather & Parks ---------- */
function weatherPage(){
  const b=board();if(!b.wx?.length&&!b.park_ranks?.length)return pageHead('Weather & Parks')+noSlate();
  const wx=table(['Game','Park','First pitch','Temp','Wind','Rain','Roof','Conditions'],(b.wx||[]).map(w=>[cell(`${team(w.away)} <span class="muted">@</span> ${team(w.home)}`),esc(w.park),et({iso:w.time})+' ET',
    w.temp_f==null?'—':cell(w.temp_f+'°F',w.temp_f>=80?'good':w.temp_f<=55?'bad':''),w.wind_mph==null?'—':cell(`${w.wind_mph} mph ${windArrow(w.wind_rel_deg)}`,'plain'),w.precip_prob==null?'—':cell(w.precip_prob+'%',w.precip_prob>=40?'bad':''),esc(w.roof||'Open'),esc(w.status||'—')]),{sort:'yard-wx',wrap:'box'});
  const parks=table(['Park','Game','HR effect','Runs effect','Source'],(b.park_ranks||[]).map(r=>[esc(r.park),cell(`${team(r.away)} <span class="muted">@</span> ${team(r.home)}`),cell(signed(r.hr_pct,0)+'%',r.hr_pct>=10?'good heat':r.hr_pct<=-10?'bad heat':'mid heat'),cell(signed(r.runs_pct,0)+'%',r.runs_pct>=10?'good':r.runs_pct<=-10?'bad':''),esc(r.src||'—')]),{sort:'yard-parks',cls:'compact'});
  return pageHead('Weather & Parks','Today’s forecast at every park and how much each park and its conditions boost or suppress home runs and runs. The arrow shows the wind direction relative to the field as hr-board reports it.')+grid(2,[box('Forecast',wx),box('Best and worst parks today',parks)]);
}

/* ---------- Props ---------- */
const priceOf=(bucket,name)=>{const o=S.yardOdds?.props?.[bucket]?.[norm(name)];return o?(o.over_american??o.best??'—')+(o.line!=null?` (${o.line})`:''):'—';};
function hitsPage(){
  const b=board();if(!b.players?.length)return pageHead('Hits & H+R+RBI')+noSlate();
  const hrr=S.f.view==='H+R+RBI',list=(b.players||[]).filter(inGame).filter(p=>hrr?p.hrr_proj:p.hit_gated).sort((x,y)=>hrr?(y.hrr_proj.p_over15??0)-(x.hrr_proj.p_over15??0):(y.hit_gated.p_hit??0)-(x.hit_gated.p_hit??0)).slice(0,S.f.more?400:80);
  const rows=hrr?list.map(p=>({act:'player',v:p.id,cls:'clickable',cells:[hitter(p),cell(`${esc(p.opp_pitcher?.name||'TBD')} ${formBadge(p.opp_pitcher?.form)}`),cell(pct(p.hrr_proj.p_over15,1),p.hrr_proj.p_over15>=.5?'good heat':p.hrr_proj.p_over15>=.38?'mid heat':''),round(p.hrr_proj.hrr,2),round(p.hrr_proj.exp_hits,2),round(p.hrr_proj.exp_runs,2),round(p.hrr_proj.exp_rbi,2),round(p.hrr_proj.xpa,1),round(p.hrr_heat,0),esc(priceOf('hrr',p.name))]})):
    list.map(p=>({act:'player',v:p.id,cls:'clickable',cells:[hitter(p),cell(`${esc(p.opp_pitcher?.name||'TBD')} ${formBadge(p.opp_pitcher?.form)}`),cell(pct(p.hit_gated.p_hit,1),p.hit_gated.p_hit>=.65?'good heat':p.hit_gated.p_hit>=.55?'mid heat':''),round(p.hit_gated.xpa,1),fmt('iso',p.hit_gated.xba_eff),pct(p.hit_gated.whiff,1),round(p.hit_heat,0),esc(priceOf('hits',p.name))]}));
  return pageHead('Hits & H+R+RBI','Hit chance comes from hr-board’s pitch-shape model: expected plate appearances times expected batting average on contact against this starter’s pitch mix. H+R+RBI adds expected runs and RBI from lineup spot and team context; the chance shown is for 2 or more (over 1.5).')+
    slate({note:S.f.allGames?'Tap a game to filter':'Tap it again for every game'})+tools(toggles(['Hits','H+R+RBI'],'view'))+
    table(hrr?['Hitter','Opposing starter','2+ H+R+RBI','Expected H+R+RBI','Hits','Runs','RBI','Exp. PA','HRR heat','Price']:['Hitter','Opposing starter','1+ hit','Exp. PA','Exp. avg','Whiff','Hit heat','Price'],rows,{sort:'yard-hits-'+(hrr?'hrr':'h'),wrap:'box'})+
    tools(btn(S.f.more?'Show fewer':'Show more','flip','more'));
}
function tbPage(){
  const b=board(),tb=b.total_bases_board;if(!tb?.board?.length)return pageHead('Total Bases')+noSlate();
  const byId=new Map((b.players||[]).map(p=>[p.id,p]));
  const games=tb.board.filter(g=>S.f.allGames||!S.game||String(g.game_pk)===S.game.id).map(g=>box(`${logo(g.away)} ${esc(g.away)} @ ${esc(g.home)} ${logo(g.home)} <span class="subtle">${et({iso:g.time})} ET</span>`,
    table(['Hitter','Spot','Jackpot EV','Crowd zone','Expected TB','SLG season','SLG recent','Matchup','Book 2+ TB','Drivers'],(g.leaders||[]).slice().sort((a,b)=>(b.jackpot_ev??b.exp_tb)-(a.jackpot_ev??a.exp_tb)).map(x=>({act:'player',v:x.id,cls:'clickable',cells:[hitter({...byId.get(x.id),...x,lineup_spot:x.spot}),x.spot??'—',
      cell(round(x.jackpot_ev??x.exp_tb,2),'good heat'),cell(x.crowd_zone?badge(x.crowd_zone,x.crowd_zone==='Sweet Spot'?'g':''):'—','plain'),cell(round(x.exp_tb,2),x.exp_tb>=1.6?'good heat':x.exp_tb>=1.2?'mid heat':''),fmt('slg',x.slg_season),fmt('slg',x.slg_recent),
      cell(signed((x.matchup_mult-1)*100,0)+'%',x.matchup_mult>=1.05?'good':x.matchup_mult<=.95?'bad':''),x.tb_market_price!=null?(x.tb_market_price>0?'+':'')+x.tb_market_price:'—',cell((x.drivers||[]).slice(0,3).map(esc).join('<br>'),'plain')]})),{cls:'compact'})));
  return pageHead('King of the Bases','For the DraftKings King of the Bases promo (most total bases in one game, usually the last game of the night). Expected total bases is projected at-bats by lineup spot times blended SLG, adjusted for the pitcher and this batter’s fit against him. Jackpot EV weights that by the crowd: the chalk favourite and the lottery ticket are both over-picked, so the Sweet Spot in between is boosted. Neither number is a win chance.')+
    slate({note:'Tap a game to filter'})+games.join('')+`<details class="details"><summary>How hr-board builds this</summary><ul class="subtle notes-list">${(tb.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></details>`;
}
function ksPage(){
  const b=board(),list=(b.pitcher_props||[]).filter(p=>S.f.allGames||!S.game||String(p.game_pk)===S.game.id);
  if(!list.length)return pageHead('Pitcher Strikeouts')+noSlate();
  const over=(p,line)=>{const d=p.kengine?.dist;if(!d||line==null)return null;return Object.entries(d).reduce((s,[k,v])=>s+(+k>line?v:0),0);};
  return pageHead('Pitcher Strikeouts','K-heat blends strikeout rate, swinging-strike rate and how often tonight’s lineup strikes out. Expected Ks come from hr-board’s strikeout engine (batters faced times called-plus-swinging-strike rate); the chance column is the engine’s own distribution above its suggested line.')+
    slate({note:'Tap a game to filter'})+table(['Pitcher','Matchup','K-heat','Expected Ks','Suggested line','Chance over','K%','SwStr%','Opp lineup K%','Form','Price'],list.slice().sort((x,y)=>(y.k_heat??0)-(x.k_heat??0)).map(p=>{const o=over(p,p.est_line_over);return [pitcherCell(p),
      cell(`${team(p.team)} <span class="muted">vs</span> ${team(p.opp_team)}<br><small class="muted">${et({iso:p.time})} ET</small>`),cell(round(p.k_heat,0),p.k_heat>=70?'good heat':p.k_heat>=55?'mid heat':''),round(p.kengine?.exp_k??p.est_ks,1),p.est_line_over??'—',
      o==null?'—':cell(pct(o,1),o>=.55?'good heat':o>=.45?'mid heat':'bad heat'),round(p.k_pct,1),round(p.swstr_pct,1),round(p.opp_lineup_k_pct,1),cell(formBadge(p.form)),esc(priceOf('pk',p.name))];}),{sort:'yard-ks',wrap:'box',cls:'wide'});
}
function totalsPage(){
  const b=board(),list=(b.game_projections||[]).filter(g=>S.f.allGames||!S.game||String(g.game_pk)===S.game.id);
  if(!list.length)return pageHead('Game Totals')+noSlate();
  return pageHead('Game Totals','Runs projected by hr-board’s inning-by-inning simulation, using both lineups, starters, bullpens and their workload, defense, park and weather. The factors show which inputs pushed the total up or down.')+slate({note:'Tap a game to filter'})+
    table(['Game','Starters','Away runs','Home runs','Total','Home win','Lineups','What moved it'],list.map(g=>{const m=g.markov||{};return [cell(`${team(g.away)} <span class="muted">@</span> ${team(g.home)}<br><small class="muted">${et({iso:g.time})} ET · ${esc(g.park||'')}</small>`),
      cell(`${esc(g.away_sp||'TBD')}<br>${esc(g.home_sp||'TBD')}`,'plain'),round(m.away_mean,2),round(m.home_mean,2),cell(round(m.total_mean,1),m.total_mean>=9.5?'good heat':m.total_mean<=7.5?'bad heat':'mid heat'),pct(m.home_wp,1),
      cell(g.lineups_confirmed?badge('Confirmed','g'):badge('Projected'),'plain'),cell((g.why||[]).map(w=>badge(`${w.label} ${signed(w.pts,1)}`,w.pts>0?'g':w.pts<0?'r':'')).join(' '),'plain')];}),{sort:'yard-totals',wrap:'box',cls:'wide'});
}

/* ---------- Parlays & Jackpots ---------- */
function parlaysPage(){
  const b=board();if(!b.players?.length)return pageHead('Parlays & Jackpots')+noSlate();
  const byId=new Map((b.players||[]).map(p=>[p.id,p])),v=S.f.view;
  const legs=list=>table(['Hitter','Matchup','Chance','Book','Edge','Why'],(list||[]).map(l=>({act:'player',v:l.id,cls:'clickable',cells:[hitter({...byId.get(l.id),...l,lineup_spot:l.spot}),cell(`${team(l.team)} <span class="muted">vs</span> ${team(l.opp_team)}`),l.prob==null?'—':cell(pct(l.prob,1),l.prob>=.2?'good heat':'mid heat'),
    l.book_odds!=null?(l.book_odds>0?'+':'')+l.book_odds:'—',l.edge==null?'—':cell(signed(l.edge*100,1)+' pts',l.edge>0?'good':'bad'),cell((l.drivers||[]).map(esc).join('<br>'),'plain')]})),{cls:'compact'});
  const sets=obj=>Object.entries(obj||{}).filter(([,x])=>x&&Array.isArray(x.legs)).map(([,x])=>box(esc(x.label||'Parlay'),(x.subtitle?`<p class="subtle">${esc(x.subtitle)}</p>`:'')+legs(x.legs)));
  let body='';
  // hr-board publishes some sets in both parlay lists; show each name once.
  const named=new Map();for(const src of [b.cross_game_parlays,b.cross_game_parlays_pow])for(const [,x] of Object.entries(src||{}))if(x&&Array.isArray(x.legs)&&!named.has(x.label))named.set(x.label,x);
  if(v==='Cross-game parlays')body=sets(Object.fromEntries(named)).join('')||box('',empty('No parlays built for this slate.'));
  else if(v==='Grand slam')body=box('Grand slam board',table(['Game','Game slam chance','Best bat','Chance','Fair odds','Others'],(b.grand_slam_board||[]).map(g=>{const t=g.batters?.[0];return [cell(`${team(g.away)} <span class="muted">@</span> ${team(g.home)}`),cell(pct(g.game_slam_prob,1),g.game_slam_prob>=.12?'good heat':'mid heat'),
    t?hitter({...byId.get(t.id),...t,lineup_spot:t.spot}):'—',t?pct(t.p_slam,2):'—',t?'+'+t.fair_odds:'—',cell((g.batters||[]).slice(1,4).map(x=>esc(x.name)).join(', '),'plain')];}),{sort:'yard-gs',wrap:'box'}),'Chance of at least one grand slam in each game, and the bat most likely to hit it. Fair odds are the model’s price with no bookmaker margin.');
  else if(v==='Long ball')body=box('Longest home run picks',table(['Hitter','Matchup','Score','Ceiling','Max EV','EV50','HR chance','Why'],(b.long_ball_jackpot?.picks||[]).map(x=>({act:'player',v:x.id,cls:'clickable',cells:[hitter({...byId.get(x.id),...x,lineup_spot:x.spot}),cell(`${team(x.team)} <span class="muted">vs</span> ${team(x.opp_team)}`),cell(round(x.score,1),'good heat'),x.ceiling_ft?x.ceiling_ft+' ft':'—',round(x.max_ev,1),round(x.ev50,1),pct(x.log5_hr_prob,1),cell((x.drivers||[]).map(esc).join('<br>')+(x.pick_label?`<br>${badge(x.pick_label,'g')}`:''),'plain')]})),{wrap:'box'}),'For longest-home-run contests: raw power ceiling, today’s carry from weather and park, and the arm’s vulnerability.')+
    `<details class="details"><summary>Notes from hr-board</summary><ul class="subtle notes-list">${(b.long_ball_jackpot?.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></details>`;
  const picks=(b.parlay_picks||[]).map(p=>card(esc((p.kind||'Pick')[0].toUpperCase()+(p.kind||'pick').slice(1)),`<div class="chips">${(p.legs||[]).map(l=>badge(`${l.name} · ${l.team} · Heat ${l.heat}`,'g')).join('')}</div>`));
  return pageHead('Parlays & Jackpots','Combinations hr-board builds from the board: cross-game home run parlays, grand slam chances and longest-home-run picks. Chances are model estimates; book edges compare them with the prices hr-board captured and are not proven edges.')+
    tools(toggles(['Cross-game parlays','Grand slam','Long ball'],'view'))+(picks.length&&v==='Cross-game parlays'?box('Today’s parlay picks',grid(3,picks)):'')+body;
}

/* ---------- Model Record ---------- */
function recordPage(){
  const r=S.yardResults||{},s=r.season,bt=r.backtest;
  if(!s?.days)return pageHead('Model Record')+box('',empty('No graded days yet. hr-board grades each slate the morning after.'));
  const rate=x=>x?.n?x.hr/x.n:null,base=bt?.base_pct!=null?bt.base_pct/100:null;
  const tierRows=['70+','55-69','40-54','<40'].map(k=>{const x=s.by_tier[k],b2=bt?.by_tier?.[k],v=rate(x);return [esc('Heat '+k),x?.n??0,x?.hr??0,cell(v==null?'—':pct(v,1),v==null||base==null?'':v>base*1.25?'good heat':v<base*.85?'bad heat':'mid heat'),v==null||base==null?'—':round(v/base,2)+'×',b2?pct(b2.hr/b2.n,1):'—',b2?.n??'—'];});
  const models=['heat','iso','barrel','base'],label={heat:'Heat (model)',iso:'ISO only',barrel:'Barrel% only',base:'Whole slate'};
  const h2h=['5','10','25'].map(n=>[`Top ${n} each day`,...models.map(m=>{const x=s.ranks?.[m]?.[n];const v=rate(x);return cell(v==null?'—':pct(v,1)+`<br><small class="muted">${x.hr} of ${x.n}</small>`,m==='heat'&&v!=null&&models.slice(1).every(o=>(rate(s.ranks?.[o]?.[n])??0)<=v)?'good heat':'');})]);
  const forms=Object.entries(s.by_form).sort((a,b)=>b[1].n-a[1].n).map(([k,x])=>[cell(formBadge(k)),x.n,x.hr,cell(pct(rate(x),1),base&&rate(x)>base*1.15?'good':base&&rate(x)<base*.85?'bad':'')]);
  const hits=Object.entries(s.hit1||{}).map(([k,x])=>[esc('Heat '+k),x.n,x.hit,pct(x.n?x.hit/x.n:null,1)]);
  const daily=table(['Date','Home runs','Hitters who homered','Off starters','Off bullpens','Avg distance','Avg EV','Heat top 10','Who went deep'],s.daily.slice(0,S.f.more?400:30).map(d=>[esc(d.date),d.total_hr??'—',d.hitters_homered??'—',d.sp_hr??'—',d.bp_hr??'—',d.avg_hr_dist?d.avg_hr_dist+' ft':'—',round(d.avg_hr_ev,1),
    d.top10?`${d.top10.hr} of ${d.top10.n}`:'—',cell((d.hr_log||[]).map(h=>esc(h.name)+(h.hr>1?' ×'+h.hr:'')).join(', '),'plain')]),{wrap:'box'});
  const v=S.f.view;
  return pageHead('Model Record','Graded every morning by hr-board against real box scores. The question that matters: do higher Heat tiers homer more often, and does sorting by Heat beat sorting by ISO or barrel% alone?',` · ${s.days} graded days · ${s.total_hr} home runs`)+
    grid(4,[metric('Graded days',s.days),metric('Home runs',s.total_hr),metric('Off starters',s.total_hr?pct(s.sp_hr/s.total_hr):'—',s.sp_hr+' HR'),metric('Off bullpens',s.total_hr?pct(s.bp_hr/s.total_hr):'—',s.bp_hr+' HR')])+
    tools(toggles(['Heat tiers','Daily log'],'view'))+
    (v==='Daily log'?box('Daily log',daily+tools(btn(S.f.more?'Show fewer':'Show the full season','flip','more'))):
      grid(2,[box('Home run rate by Heat tier',table(['Tier','Hitters','HR','HR rate','vs slate','Backtest rate','Backtest n'],tierRows,{cls:'compact'}),`Season results. Slate base rate ${base==null?'unknown':pct(base,1)} (backtest). The backtest replays the core model over ${bt?.days??'—'} days.`),
        box('Heat against simpler rankings',table(['Picks','Heat','ISO only','Barrel% only','Whole slate'],h2h,{cls:'compact'}),'Home run rate of each day’s top picks under four rankings. Heat is highlighted when it beats all three.'),
        box('By opposing arm form',table(['Form','Hitters','HR','HR rate'],forms,{cls:'compact'})),
        hits.length?box('1+ hit rate by Heat tier',table(['Tier','Hitters','With a hit','Rate'],hits,{cls:'compact'})):'']));
}

/* ---------- player detail ---------- */
const idRow=(id,banner)=>`<div class="yard-id"><img src="${headshot(id)}" alt="" width="64" height="64" decoding="async">${banner}</div>`;
export function yardPlayer(id){
  if(String(id).startsWith('arm:'))return armDetail(String(id).slice(4));
  const p=(board().players||[]).find(x=>String(x.id)===String(id));if(!p)return;
  const g=gameOf(p.game_pk),op=p.opp_pitcher||{},pen=p.opp_bullpen||{};
  const sigRows=SIGNALS.map(([k,l])=>[esc(l),sigCell(p,k,'recent'),sigCell(p,k,'season'),sigCell(p,k,'career'),cell(ANCHORS[k].map(x=>fmt(k,x)).join(' / '),'plain')]);
  const win=['L5','L15','L30'].filter(w=>p.windows?.[w]).map(w=>{const x=p.windows[w];return [w,fmt('barrel_pct',x.barrel_pct),fmt('avg_ev',x.avg_ev),fmt('pull_air_pct',x.pull_air_pct),fmt('iso',x.iso),fmt('slg',x.slg),x.hr??'—'];});
  const flags=list=>(list||[]).length?`<div class="chips">${list.map(f=>badge(f)).join('')}</div>`:'';
  const body=idRow(p.id,teamBanner(p.team,`${p.bats?'Bats '+p.bats:''}${p.lineup_spot?' · #'+p.lineup_spot:''} · ${p.lineup_status||'lineup not posted'}`))+
    `<p class="subtle">${g?`${esc(g.away)} @ ${esc(g.home)} · ${et({iso:g.time})} ET · ${esc(g.park||p.park||'')}`:esc(p.park||'')}${p.why?' · '+esc(p.why):''}</p>`+
    grid(4,[metric('Heat',p.heat??'—',p.tier||'',p.heat>=70?'good':p.heat>=55?'mid':''),metric('Matchup grade',esc(p.matchup_grade?.grade||'—'),p.matchup_grade?.aligned!=null?p.matchup_grade.aligned+' factors aligned':''),
      metric('HR last 5 / 15 / 30',[p.hr_recent?.L5,p.hr_recent?.L15,p.hr_recent?.L30].map(x=>x??'–').join(' / ')),metric('Park HR',p.park_hr_factor==null?'—':signed((p.park_hr_factor-1)*100,0)+'%',p.park_hr?.temp_f!=null?`${p.park_hr.temp_f}°F · wind ${p.park_hr.wind_mph} mph`:'')])+
    ((p.badges||[]).length?`<div class="chips" style="margin:10px 0">${p.badges.map(x=>badge(x.t||x.k,'g')).join('')}</div>`:'')+
    `<h3 class="section-label">Power signals</h3>`+table(['Signal','Last 2 weeks','Season','Career','Poor / good / elite'],sigRows,{cls:'compact'})+
    (win.length?`<h3 class="section-label">Recent windows</h3>`+table(['Window','Brl%','EV','Pull-air%','ISO','SLG','HR'],win,{cls:'compact'}):'')+
    `<h3 class="section-label">Opposing starter</h3>`+grid(2,[card(`${esc(op.name||'Not posted')} ${formBadge(op.form)}`,
      `<p class="subtle">${op.throws?(op.throws==='L'?'LHP':'RHP')+' · ':''}HR vulnerability ${op.hr_score??'—'} (recent ${op.recent_score??'—'}, season ${op.season_score??'—'})${op.vs_hand_score!=null?` · vs ${esc(op.vs_hand)}HB ${op.vs_hand_score}`:''}</p>${flags(op.flags)}`+
      (op.fg?`<p class="tiny">xFIP ${round(op.fg.xfip,2)} · SIERA ${round(op.fg.siera,2)} · Stuff+ ${round(op.fg.stuff_plus,0)} · K-BB ${round(op.fg.k_bb_pct,1)}%</p>`:'')),
      card(`Their bullpen ${formBadge(pen.form)}`,`<p class="subtle">HR vulnerability ${pen.score??'—'}${pen.vs_hand!=null?` · vs ${esc(pen.hand)}HB ${pen.vs_hand}`:''}${p.opp_pen_live?.label?` · workload ${esc(p.opp_pen_live.label)}`:''}</p>${flags(pen.flags)}`)])+
    `<h3 class="section-label">Matchup detail</h3>`+grid(2,[
      card('Pitch mix',p.pitch_matchup?`<p class="subtle">Best against ${esc(p.pitch_matchup.best?.label||'—')} (${round(p.pitch_matchup.best?.barrel,1)}% barrels), which he sees ${round(p.pitch_matchup.best?.usage,1)}% of the time. Weighted barrel% against this arsenal: ${round(p.pitch_matchup.weighted_barrel,1)}.</p>`:'<p class="subtle">No pitch-mix data.</p>'),
      card('Contact luck',p.luck?.season?`<p class="subtle">Season xwOBA on contact ${fmt('iso',p.luck.season.xwobacon)} vs actual ${fmt('iso',p.luck.season.wobacon)}${p.luck.season.luck_gap!=null?` · ${p.luck.season.luck_gap>0?'under-rewarded, due':'running hot'} (${signed(p.luck.season.luck_gap*1000,0)} pts)`:''}.</p>`:'<p class="subtle">No contact-luck data.</p>'),
      card('Bat tracking',p.bat_tracking?`<p class="subtle">${round(p.bat_tracking.avg_bat_speed,1)} mph bat speed · ${round(p.bat_tracking.fast_swing_rate,1)}% fast swings · ${p.max_ev?`max EV ${round(p.max_ev.recent,1)} recent, ${round(p.max_ev.season,1)} season`:''}</p>`:'<p class="subtle">No bat tracking data.</p>'),
      card('History vs this staff',p.bvp?`<p class="subtle">vs ${esc(p.bvp.sp?.name||'starter')}: ${p.bvp.sp_career?.pa??p.bvp.sp?.pa??0} PA, ${p.bvp.sp_career?.hr??p.bvp.sp?.hr??0} HR${(p.bvp.bp||[]).length?` · vs pen: ${p.bvp.bp.slice(0,4).map(x=>`${esc(x.name)} ${x.hr}/${x.pa}`).join(', ')}`:''}. Tiny samples, shown for context only.</p>`:'<p class="subtle">No history.</p>')])+
    ((p.matchup_grade?.notes||[]).length?`<p class="tiny">${p.matchup_grade.notes.map(esc).join(' · ')}</p>`:'');
  dialog(p.name,body,true);
}
function armDetail(id){
  const b=board(),a=(b.arms||[]).find(x=>String(x.id)===id)||(b.pitcher_props||[]).find(x=>String(x.id)===id)||(b.pitcher_edges||[]).find(x=>String(x.id)===id);if(!a)return;
  const k=(b.pitcher_props||[]).find(x=>String(x.id)===id),e=(b.pitcher_edges||[]).find(x=>String(x.id)===id),opp=a.opp||a.opp_team;
  const facing=(b.players||[]).filter(p=>String(p.opp_pitcher?.id)===id).sort((x,y)=>(y.heat??0)-(x.heat??0));
  dialog(a.name,idRow(a.id,teamBanner(a.team,(a.throws==='L'?'LHP':'RHP')+(opp?' vs '+opp:'')))+
    grid(4,[metric('HR vulnerability',a.hr_score??'—','',a.hr_score>=50?'good':''),metric('Form',formBadge(a.form)||'—'),metric('K-heat',k?round(k.k_heat,0):'—',k?.kengine?`${round(k.kengine.exp_k,1)} expected Ks`:''),metric('Vulnerability tier',esc(e?.vuln?.tier||'—'),e?.vuln?round(e.vuln.score,0)+' / 100':'')])+
    ((a.flags||[]).length?`<div class="chips" style="margin:10px 0">${a.flags.map(f=>badge(f)).join('')}</div>`:'')+
    `<h3 class="section-label">Hitters facing him</h3>`+table(['Hitter','Heat','Brl%','Pull-air%','ISO'],facing.map(p=>({act:'player',v:p.id,cls:'clickable',cells:[hitter(p,false),heatCell(p.heat),sigCell(p,'barrel_pct'),sigCell(p,'pull_air_pct'),sigCell(p,'iso')]})),{cls:'compact',empty:'Lineup not posted yet.'}),true);
}

export function yardPage(){
  return ({'yard-board':boardPage,'yard-top':topPage,'yard-games':gamesPage,'yard-arms':armsPage,'yard-targets':targetsPage,'yard-weather':weatherPage,
    'yard-hits':hitsPage,'yard-tb':tbPage,'yard-ks':ksPage,'yard-totals':totalsPage,'yard-parlays':parlaysPage,'yard-record':recordPage,
    'yard-picks':More.topPicks,'yard-daily':More.dailyCard,'yard-converge':More.converge,'yard-pitchmix':More.pitchMix,'yard-splits':More.splits,
    'yard-edge':More.edgeFinder,'yard-price':More.priceResearch,'yard-alt':More.altLines,'yard-sgp':More.parlayBuilder,'yard-scanner':More.parlayScanner,
    'yard-ladder':More.ladder,'yard-calendar':More.calendar,'yard-patterns':More.patterns,'yard-guide':More.guide,'yard-bets':Bets.myBets,'yard-clv':Bets.clvPage})[S.route.id]();
}
// Views whose numbers come from hr-board's own math need the full board, history and backtest.
export const ENGINE_VIEWS=new Set(['yard-picks','yard-daily','yard-converge','yard-pitchmix','yard-splits','yard-edge','yard-price','yard-alt','yard-sgp','yard-scanner','yard-ladder','yard-calendar','yard-patterns','yard-bets','yard-clv']);
// Returns true when handled (the caller re-renders); a string is a message for the toast.
export function yardAction(act,v){
  const bet=Bets.betAction(act,v);if(bet)return bet;
  if(act==='pmPitch'){const i=v.lastIndexOf(':'),key=v.slice(0,i),pt=v.slice(i+1),sel=S.f.pmSel[key]||[];S.f.pmSel[key]=sel.includes(pt)?sel.filter(x=>x!==pt):[...sel,pt];return true;}
  if(act==='sgpType'){const t=S.f.sgpTypes||[];S.f.sgpTypes=t.includes(v)?t.filter(x=>x!==v):[...t,v];return true;}
  if(act==='ladder'){return More.ladderAction(v)||true;}
  if(act==='calMonth'){S.f.calMonth=v;S.f.calDay=null;return true;}
  return false;
}
export const yardInput=t=>Bets.betField(t);
export function yardField(k,v){
  if(k==='minEdge'){setMinEdgeValue(v);return true;}
  if(k==='pmPitcher'){S.f.pmPitcher=v;return true;}
  return false;
}
// My Plays grading is not wired for MLB: hr-board grades its own record, and the pick tracker grades from box scores.
export function yardResult(){return null;}
export const yardTeamName=t=>teamName(t,'mlb');
// Shared with yard-more.mjs (the views that run hr-board's own math).
export {board,headshot,norm,ago,fmt,sigCell,heatCell,formBadge,tierBadge,hitter,pitcherCell,inGame,pageHead,noSlate};
