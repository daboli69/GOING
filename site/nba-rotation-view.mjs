import {box,card,dialog,empty,esc,grid,table,teamBanner} from './ui.mjs';
import {round,signed} from './math.mjs';
import {nbaRotation,officialStarters,rotationSummary,summaryUrl} from './nba-rotation-data.mjs';

const requested=new Map();
function summary(id){
  if(!/^\d+$/.test(id))return Promise.resolve(null);
  if(!requested.has(id))requested.set(id,fetch(summaryUrl+id,{signal:AbortSignal.timeout(6500)})
    .then(r=>r.ok?r.json():null).catch(()=>null).then(value=>{
      if(!value?.header?.competitions?.[0]?.status?.type?.completed)requested.delete(id);
      return value;
    }));
  return requested.get(id);
}

async function replaceLoading(title,fetchBody){
  dialog(title,'<p class="subtle" data-nba-research-loading>Checking ESPN play-by-play and box scores…</p>',true);
  const panel=document.querySelector('[data-nba-research-loading]'), parent=panel?.closest('dialog');
  try{
    const content=await fetchBody();
    if(panel?.isConnected&&parent?.open)dialog(title,content,true);
  }catch{
    if(panel?.isConnected&&parent?.open)dialog(title,empty('This lookup could not finish. Try again in a moment.'),true);
  }
}

export function verifyStarters(game,names){
  const title='Official Starters · '+game.a+' @ '+game.h;
  void replaceLoading(title,async()=>{
    const data=await summary(String(game.id));
    return grid(2,[game.a,game.h].map(code=>{
      const starters=officialStarters(data,game.id,code);
      return card(teamBanner(code),starters?'<ul>'+starters.map(id=>'<li>'+esc(names[id]?.[0]||'Player '+id)+'</li>').join('')+'</ul>':
        empty('Official starters have not been verified in the ESPN game box score.'));
    }));
  });
}

const delta=value=>value==null?'—':signed(value);
const clock=value=>Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0');
export function showRotations(code,days,names){
  const title=code+' · Rotations & On/Off';
  void replaceLoading(title,async()=>{
    const recent=days.slice(-5).reverse();
    const games=(await Promise.all(recent.map(async row=>({...nbaRotation(await summary(String(row[0])),row[0],code),date:row[1],opp:row[2]}))))
      .filter(row=>row.stints?.length);
    if(!games.length)return empty('No recent game passed the rotation and box score checks.');
    const {lineups,onOff}=rotationSummary(games);
    const name=id=>names[id]?.[0]||'Player '+id;
    const chart=onOff.filter(row=>row.typical).slice(0,15).map(row=>{
      const perc=m=>Math.round(100*m/60/games.length);
      const cells=row.typical.map((m,i)=>'<span title="Minute '+(i+1)+' · '+perc(m)+'% on court" style="--presence:'+perc(m)+'%"></span>').join('');
      return '<div class="nba-rotation-chart-row"><strong>'+esc(name(row.id))+'</strong><div class="nba-rotation-strip" aria-label="'+
        esc('Average court time by minute for '+name(row.id))+'">'+cells+'</div></div>';
    }).join('');
    return '<p class="subtle">'+games.length+' of '+recent.length+' recent games passed reconciliation. Rates are observed point differential per 48 minutes.</p>'+
      box('Typical Rotation','<div class="nba-rotation-chart">'+chart+'</div>','Darker cells indicate more time on the floor in that minute of regulation.')+
      box('Five-player Lineups',table(['Players','Games','Minutes','Points for','Points allowed','+/−'],lineups.slice(0,20).map(row=>[
        esc(row.ids.map(name).join(' · ')),row.games.size,round(row.seconds/60),row.for,row.against,signed(row.for-row.against,0)]),{cls:'compact',wrap:'box'}))+
      box('On / Off',table(['Player','On minutes','On ± / 48','Off ± / 48','Difference'],onOff.map(row=>[
        esc(name(row.id)),round(row.seconds/60),delta(row.on),delta(row.off),delta(row.on==null||row.off==null?null:row.on-row.off)]),{cls:'compact',wrap:'box'}),
      'The off group includes all verified minutes the player was off the floor, including games he missed.')+
      games.map(game=>'<details class="nba-rotation-game"><summary>'+esc(game.date+' vs '+game.opp)+'</summary>'+
        table(['Period','Clock','Lineup','+/−'],game.stints.map(row=>[row.period,esc(clock(row.from)+'–'+clock(row.to)),
          esc(row.ids.map(name).join(' · ')),signed(row.own-row.allowed,0)]),{cls:'compact',wrap:'box'})+'</details>').join('');
  });
}
