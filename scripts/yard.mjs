// GOING YARD data: reads what hr-board (github.com/daboli69/hr-board) publishes and prepares it for the site.
// hr-board keeps its own ETL and schedule; nothing here changes its model. Writes site/data/yard/.
//
//   YARD_SOURCE=https://daboli69.github.io/hr-board/   where hr-board's docs/ folder is served (default)
//   YARD_BOARD=path/to/board.json                        use a local board instead (testing)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const data=join(root,'site','data'), out=join(data,'yard'), lastFile=join(data,'yard-last.json');
const source=(process.env.YARD_SOURCE||'https://daboli69.github.io/hr-board/').replace(/\/?$/,'/');
const repo='daboli69/hr-board';
async function json(url){
  for(let i=0;i<3;i++){
    try{const r=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'Cache-Control':'no-cache'}});if(r.ok)return r.json();if(r.status===404)return null;}catch{}
    await new Promise(r=>setTimeout(r,1500*(i+1)));
  }
  return null;
}
const has=b=>Array.isArray(b?.players)&&b.players.length>0;
await mkdir(out,{recursive:true});

// 1. Today's board, or the last slate that had games (offseason, rest days).
let board=process.env.YARD_BOARD?JSON.parse(await readFile(process.env.YARD_BOARD,'utf8')):await json(source+'board.json');
let fallback=null;
if(has(board))await writeFile(lastFile,JSON.stringify(board));
else{
  const live=board;
  board=await readFile(lastFile,'utf8').then(JSON.parse).catch(()=>null);
  if(!has(board)){
    // No saved copy yet: walk hr-board's history for the most recent full board.
    const headers={'Accept':'application/vnd.github+json',...(process.env.GITHUB_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_TOKEN}:{})};
    const commits=await fetch(`https://api.github.com/repos/${repo}/commits?path=docs/board.json&per_page=40`,{headers}).then(r=>r.ok?r.json():[]).catch(()=>[]);
    for(const c of commits){
      const meta=await fetch(`https://api.github.com/repos/${repo}/contents/docs/board.json?ref=${c.sha}`,{headers}).then(r=>r.ok?r.json():null).catch(()=>null);
      if((meta?.size||0)<100000)continue;
      board=await json(`https://raw.githubusercontent.com/${repo}/${c.sha}/docs/board.json`);
      if(has(board)){await writeFile(lastFile,JSON.stringify(board));break;}
    }
  }
  fallback={live_generated_at:live?.generated_at||null,live_slate_date:live?.slate_date||null};
}

// 2. Slim the board for the browser: drop per-pitch tables and raw batted-ball logs the pages never show.
const pick=(o,keys)=>o?Object.fromEntries(keys.filter(k=>k in o).map(k=>[k,o[k]])):o;
const DROP=new Set(['bb_log','vs_pitch','pitch_table','features','windows','score_breakdown','drives','parks30','converge','mix_punish','vs_mix','elite']);
function slimPlayer(p){
  const x=Object.fromEntries(Object.entries(p).filter(([k])=>!DROP.has(k)));
  x.converge=p.converge?.hr?.measured||null;
  x.windows=p.windows?Object.fromEntries(Object.entries(p.windows).map(([k,w])=>[k,pick(w,['barrel_pct','hardhit_pct','avg_ev','max_ev','launch_angle','pull_air_pct','ideal_aa_pct','iso','slg','bbe','hr'])])):null;
  return x;
}
const lb=board?.long_ball_jackpot;
const slim=has(board)?{
  generated_at:board.generated_at,slate_date:board.slate_date,model_version:board.model_version,recent_window:board.recent_window,
  games:board.games||[],projected_games:board.projected_games||[],lineups_pending:board.lineups_pending||[],
  players:board.players.map(slimPlayer),top_plays:board.top_plays||[],briefing:board.briefing||[],parlay_picks:board.parlay_picks||[],
  arms:board.arms||[],bullpen_rankings:board.bullpen_rankings||[],team_targets:board.team_targets||[],wx:board.wx||[],park_ranks:board.park_ranks||[],
  pitcher_edges:(board.pitcher_edges||[]).map(e=>({...pick(e,['id','name','team','opp_team','game_pk','throws','season','vuln','tto','profile','fg','park_hr_factor','exploit_score','arsenal']),
    batters:(e.batters||[]).slice(0,9).map(b=>pick(b,['id','name','spot','bats','heat','matchup_score','zone_score','hot_zone']))})),
  pitcher_props:(board.pitcher_props||[]).map(p=>({...p,converge:p.converge?.measured||null,kengine:p.kengine&&{...p.kengine,dist:p.kengine.dist}})),
  game_projections:(board.game_projections||[]).map(g=>({...g,markov:g.markov&&{...g.markov,total_dist:undefined}})),
  total_bases_board:board.total_bases_board||null,grand_slam_board:board.grand_slam_board||[],grand_slam_jackpot:board.grand_slam_jackpot||null,
  long_ball_jackpot:lb?{picks:lb.picks||[],board:(lb.board||[]).map(g=>({...g,batters:(g.batters||[]).slice(0,5)})),notes:lb.notes||[],slate_context:lb.slate_context||null}:null,
  cross_game_parlays:board.cross_game_parlays||null,cross_game_parlays_pow:board.cross_game_parlays_pow?pick(board.cross_game_parlays_pow,['anchor','overlooked','genius','genius5','notes']):null,
  vulnerable_arm_matchups:board.vulnerable_arm_matchups||null,converge_lift:board.converge_lift||null,build_health:board.build_health||null,
  fallback
}:{generated_at:board?.generated_at||null,slate_date:board?.slate_date||null,games:[],players:[],fallback};
await writeFile(join(out,'board.json'),JSON.stringify(slim));

// 3. Prices hr-board captured, and the season record.
const odds=await json(source+'odds.json');
await writeFile(join(out,'odds.json'),JSON.stringify(odds||{}));
const [history,backtest]=await Promise.all([json(source+'history.json'),json(source+'backtest.json')]);
const sum=(target,src)=>{for(const [k,v] of Object.entries(src||{})){const t=(target[k]??={n:0,hr:0});t.n+=v.n||0;t.hr+=v.hr||0;}return target;};
const season={days:0,total_hr:0,sp_hr:0,bp_hr:0,by_tier:{},by_form:{},by_park:{},by_trend:{},by_spot:{},ranks:{},hit1:{},daily:[]};
for(const d of history?.days||[]){
  season.days++;season.total_hr+=d.total_hr||0;season.sp_hr+=d.sp_hr||0;season.bp_hr+=d.bp_hr||0;
  for(const k of ['by_tier','by_form','by_park','by_trend','by_spot'])sum(season[k],d[k]);
  for(const [model,tops] of Object.entries(d.ranks||{}))sum(season.ranks[model]??={},tops);
  for(const [tier,v] of Object.entries(d.by_props?.hit1?.by_tier||{})){const t=(season.hit1[tier]??={n:0,hit:0});t.n+=v.n||0;t.hit+=v.hit||0;}
  season.daily.push({date:d.date,total_hr:d.total_hr,hitters_homered:d.hitters_homered,sp_hr:d.sp_hr,bp_hr:d.bp_hr,avg_hr_dist:d.avg_hr_dist,avg_hr_ev:d.avg_hr_ev,
    players:d.players,top10:d.ranks?.heat?.['10']||d.top_n?.['10']||null,hr_log:(d.hr_log||[]).slice(0,12).map(h=>pick(h,['name','hr','dist','ev']))});
}
season.daily.reverse();
await writeFile(join(out,'results.json'),JSON.stringify({updated:history?.updated||null,season,
  backtest:backtest?pick(backtest,['days','pool','hr','base_pct','by_month','by_tier','top_n','genius_rank_n','heat_calibration','heat_calibration_n']):null}));
// Small summary for the landing page.
const top=[...slim.players].sort((a,b)=>(b.heat??-1)-(a.heat??-1))[0];
const top10=season.ranks?.heat?.['10'];
await writeFile(join(out,'summary.json'),JSON.stringify({generated_at:slim.generated_at,slate_date:slim.slate_date,last_slate:!!fallback,
  games:new Set(slim.games.map(g=>g.game_pk)).size,hitters:slim.players.length,top:top?{name:top.name,team:top.team,heat:top.heat}:null,
  record:top10?.n?{hr:top10.hr,n:top10.n}:null}));
console.log(`GOING YARD: ${slim.players.length} hitters, ${slim.games.length} games${fallback?` (last published slate ${slim.slate_date}; live board is empty)`:''}, ${season.days} graded days.`);
