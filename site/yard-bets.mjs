// GOING YARD bet journal: My Bets and CLV. Bets are stored in this browser under hr-board's own key (gy_bets) in
// hr-board's format so either site can import a journal backup. Stats and CLV use
// hr-board's functions (site/yard-engine.mjs); this module adds the layout and box-score grading.
import {current as S,esc,box,grid,metric,table,cell,tools,btn,select,search,empty,badge,dateKey,toast} from './ui.mjs';
import {signed} from './math.mjs';
import {mlbTeams,href} from './config.mjs';
import * as E from './yard-engine.mjs';
import {board,heatCell,pageHead} from './yard.mjs';

let draft={type:E.BET_TYPES[0],stake:'',odds:'',close:'',legs:[]};
const pp=v=>(v>=0?'+':'')+v.toFixed(1)+' pts';
const sorted=()=>E.loadBets().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id-a.id);
const tabs=()=>tools([['Edge Finder','yard/edge-finder.html','yard-edge'],['My Bets','yard/bets.html','yard-bets'],['CLV','yard/clv.html','yard-clv']]
  .map(([t,p,id])=>`<a class="pill ${S.route.id===id?'on':''}" href="${href(p)}" ${S.route.id===id?'aria-current="page"':''}>${t}</a>`).join(''));

/* ---------- housekeeping each time the journal opens ---------- */
// Scratches and closing prices from today's board, then grading from MLB box scores once games are final.
let gradedOnce=false;
function refreshFromBoard(){
  const b=board();if(!b.players?.length||b.fallback)return;
  E.flagScratches();
  const bets=E.loadBets();let changed=false;
  for(const bet of bets){
    if((bet.slate||bet.date)!==b.slate_date||bet.closeManual||bet.legs?.length!==1)continue;
    const leg=bet.legs[0],p=b.players.find(x=>String(x.id)===String(leg.id)),e=leg.id!=null?E.fetchedOddsFor(leg.id):null;
    if(!p||!e||e.best==null||Date.parse(p.time)<=Date.now())continue;
    const close=(e.best>=0?'+':'')+e.best;
    if(bet.close!==close){bet.close=close;bet.closeAuto=true;changed=true;}
  }
  if(changed)E.saveBets(bets);
}
async function gradeFromBoxScores(){
  const bets=E.loadBets(),today=dateKey(),need=new Map();
  for(const b of bets)for(const lg of b.legs||[]){
    const day=b.slate||b.date;if(lg.hit!=='pending'||lg.id==null||!lg.team||!day||day>today)continue;
    (need.get(day)||need.set(day,new Set()).get(day)).add(lg.team);
  }
  if(!need.size)return 0;
  const stats=new Map();   // date|playerId -> batting line
  for(const [day,teams] of need){
    const sched=await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}`).then(r=>r.ok?r.json():null).catch(()=>null);
    const ids=new Set([...teams].map(t=>mlbTeams[t]?.[1]).filter(Boolean));
    for(const g of sched?.dates?.[0]?.games||[]){
      if(g.status?.abstractGameState!=='Final'||!(ids.has(g.teams.away.team.id)||ids.has(g.teams.home.team.id)))continue;
      const box=await fetch(`https://statsapi.mlb.com/api/v1/game/${g.gamePk}/boxscore`).then(r=>r.ok?r.json():null).catch(()=>null);
      for(const side of ['away','home'])for(const [k,v] of Object.entries(box?.teams?.[side]?.players||{})){
        const bat=v.stats?.batting;if(!bat||!(bat.plateAppearances>0))continue;
        const key=day+'|'+k.slice(2),prev=stats.get(key);
        stats.set(key,{hr:(prev?.hr||0)+(bat.homeRuns||0)});   // doubleheaders add up
      }
    }
  }
  let changed=0;
  for(const b of bets)for(const lg of b.legs||[]){
    if(lg.hit!=='pending'||lg.id==null)continue;
    const s=stats.get((b.slate||b.date)+'|'+lg.id);if(!s)continue;
    lg.hit=s.hr>0?'hit':'miss';lg.auto=true;changed++;
  }
  if(changed)E.saveBets(bets);
  return changed;
}

/* ---------- My Bets ---------- */
export function myBets(){
  refreshFromBoard();
  if(!gradedOnce){gradedOnce=true;gradeFromBoxScores().then(n=>{if(n){toast(`Graded ${n} leg${n===1?'':'s'} from MLB box scores`);if(S.route.id==='yard-bets')document.dispatchEvent(new CustomEvent('going:render'));}});}
  const bets=sorted(),b=board(),q=(S.f.search||'').trim().toLowerCase();
  const sugg=q&&b.players?.length?b.players.filter(p=>p.name.toLowerCase().includes(q)).slice(0,6):[];
  const form=box('Log a bet',
    tools(select('Bet type','betType',E.BET_TYPES.map(t=>[t,t]))+(draft.legs.length?draft.legs.map((l,i)=>btn(`${esc(l.name)}${l.heat!=null?' · '+l.heat:''} ✕`,'betLeg','remove:'+i,'on')).join(''):'<span class="subtle">Add the players in this bet</span>'))+
    tools(search('Search today’s hitters to add')+sugg.map(p=>btn(`${esc(p.name)} <small>${esc(p.team)} · Heat ${p.heat??'–'}</small>`,'betLeg','add:'+p.id)).join('')+(q?btn('Add “'+esc(S.f.search)+'” as text','betLeg','free'):''))+
    `<div class="filters"><label class="field">Stake $<input type="number" inputmode="decimal" data-field="betStake" value="${esc(draft.stake)}" aria-label="Stake"></label>`+
    `<label class="field">Odds <input data-field="betOdds" placeholder="+450" value="${esc(draft.odds)}" aria-label="Odds"></label>`+
    `<label class="field">Closing odds (optional) <input data-field="betClose" placeholder="+400" value="${esc(draft.close)}" aria-label="Closing odds"></label></div>`+
    tools(btn('Log bet','betSave','','primary')));
  return pageHead('My Bets','Your bet journal. Log bets to track your own record, profit and closing line value, and to see which badges and Heat tiers actually homer for you. It is stored only in this browser, shared with hr-board’s page on this site, so back it up now and then.')+tabs()+
    tools(btn('Download backup','betExport','')+`<label class="pill" style="cursor:pointer">Restore from backup<input type="file" accept=".json,application/json" data-bet-import hidden></label>`+'<span class="subtle">Same backup format as hr-board</span>')+
    form+stats(bets)+list(bets);
}
function stats(bets){
  if(!bets.length)return '';
  const st=E.betStats(bets),roi=st.staked>0?st.net/st.staked:null;
  const money=grid(4,[metric('Record',`${st.w}-${st.l}`),metric('Net',(st.net>=0?'+':'−')+'$'+Math.abs(st.net).toFixed(0),'',st.net>=0?'good':'bad'),metric('ROI',roi==null?'—':signed(roi*100,0)+'%','',roi==null?'':roi>=0?'good':'bad'),metric('Staked','$'+st.staked.toFixed(0))]);
  const clv=st.clvN?`<div class="callout">Average closing line value <strong>${pp(st.clvAvg)}</strong> across ${st.clvN} priced bet${st.clvN===1?'':'s'}; ${Math.round(st.clvBeatRate*100)}% beat the close. ${st.clvAvg>=0?'You are getting better prices than where lines close, the sign an edge is real.':'Your prices are closing shorter than you took them; over a real sample that means the market disagrees with your reads.'}</div>`:
    '<p class="subtle">Add a closing price to any bet to start tracking closing line value. It says more than win/loss over a short stretch.</p>';
  const rows=o=>Object.entries(o).sort((a,b)=>b[1].n-a[1].n);
  const badges=rows(st.byBadge),tiers=['70+','55–69','40–54','<40'].filter(t=>st.byTier[t]);
  return box('Your results',money+clv+grid(2,[
    badges.length?table(['Badge','HR rate','Legs'],badges.map(([k,o])=>[cell(badge(E.BKLABEL[k]||k,'g'),'plain'),cell(Math.round(o.h/o.n*100)+'%',o.h/o.n>=.2?'good heat':o.h/o.n>=.1?'mid heat':'bad heat'),`${o.h} of ${o.n}`]),{cls:'compact'}):'<p class="subtle">Mark each player “HR” or “no HR” and this fills in with which badges homer for you.</p>',
    tiers.length?table(['Heat tier','HR rate','Legs'],tiers.map(t=>{const o=st.byTier[t];return [esc(t),cell(Math.round(o.h/o.n*100)+'%',o.h/o.n>=.2?'good heat':o.h/o.n>=.1?'mid heat':'bad heat'),`${o.h} of ${o.n}`];}),{cls:'compact'}):''
  ]));
}
function list(bets){
  if(!bets.length)return box('',empty('No bets logged yet. Log one above to start tracking.'));
  return box(`Logged bets · ${bets.length}`,bets.map(b=>{
    const clv=b.odds&&b.close?E.clvOf(b.odds,b.close):null;
    const legs=table(['Player','Heat','Badges','Homered?'],(b.legs||[]).map((lg,i)=>({cls:lg.scratched?'dim':'',cells:[
      cell(`<strong>${esc(lg.name)}</strong>${lg.team?` <small class="muted">${esc(lg.team)}</small>`:''}${lg.scratched?' '+badge('Scratched','r'):''}`),lg.heat==null?'—':heatCell(lg.heat),
      cell((lg.badges||[]).map(k=>badge(E.BKLABEL[k]||k)).join(' ')||'—','plain'),
      cell(btn(lg.hit==='hit'?'HR ✓':lg.hit==='miss'?'No HR':'Mark it','betHit',b.id+':'+i,lg.hit==='hit'?'on':'')+(lg.auto?' <small class="muted">box score</small>':''),'plain')]})),{cls:'compact'});
    return `<div class="card bet-card"><div class="tools"><strong>${esc(b.type)}</strong><span class="subtle">${esc(b.date)}${b.stake?' · $'+esc(b.stake):''}${b.odds?' · '+esc(b.odds):''}${b.close?' · closed '+esc(b.close):''}</span>`+
      (clv!=null?badge(`${pp(clv)} CLV`,clv>=0?'g':'r'):'')+`<span class="right"></span>`+btn('Delete','betDelete',String(b.id))+`</div>`+legs+
      tools(['pending','win','loss'].map(r=>btn(r==='pending'?'Pending':r==='win'?'Won':'Lost','betResult',b.id+':'+r,b.result===r?'on':'')).join('')+
        (b.result==='win'?`<label class="field">Profit $<input type="number" inputmode="decimal" data-bet-payout="${b.id}" value="${esc(b.payout||'')}" aria-label="Profit"></label>`:'')+
        `<label class="field">Closing odds <input data-bet-close="${b.id}" placeholder="+400" value="${esc(b.close||'')}" aria-label="Closing odds"></label>`+
        (b.closeAuto?'<small class="muted">auto-filled from the last captured price before first pitch</small>':''))+'</div>';
  }).join(''));
}

/* ---------- CLV ---------- */
export function clvPage(){
  const rows=E.loadBets().filter(b=>b.odds&&b.close).sort((a,b)=>(a.id||0)-(b.id||0)).map(b=>{const clv=E.clvOf(b.odds,b.close);return clv==null?null:{...b,clv,imp:E.impliedProb(b.odds)};}).filter(Boolean);
  const head=pageHead('CLV','Closing line value: the probability your closing price implied minus the probability your entry price implied. Positive means you got a longer price than the market’s final number. It is measured at bet time, whether or not the bet won, and it is the most reliable sign of beating the market over a small sample.')+tabs();
  if(!rows.length)return head+box('Your CLV appears once you log closing lines',`<p>Log bets in My Bets and add the closing price, or let it fill in from the last price hr-board captured before first pitch. You can lose a bet you were right to make and win one you were wrong to make; beating the close again and again is skill.</p>`+tools(`<a class="pill primary" href="${href('yard/bets.html')}">Go to My Bets</a>`));
  const n=rows.length,avg=rows.reduce((a,r)=>a+r.clv,0)/n,beat=rows.filter(r=>r.clv>0).length;
  let run=0;const cum=rows.map((r,i)=>(run+=r.clv)/(i+1));
  const chart=()=>{if(cum.length<2)return '<p class="subtle">Log a few more bets to see the trend line.</p>';
    const W=380,H=150,p=20,lo=Math.min(0,...cum),hi=Math.max(0,...cum),rng=(hi-lo)||1,x=i=>p+i*(W-2*p)/(cum.length-1),y=v=>H-p-((v-lo)/rng)*(H-2*p);
    return `<svg role="img" aria-label="Cumulative average CLV over time, ending at ${cum.at(-1).toFixed(1)} points" class="chart-svg" viewBox="0 0 ${W} ${H}"><line x1="${p}" x2="${W-p}" y1="${y(0)}" y2="${y(0)}" stroke="var(--sub)" stroke-dasharray="4 4"/>
      <path d="${cum.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join('')}" fill="none" stroke="${cum.at(-1)>=0?'var(--green)':'var(--red)'}" stroke-width="2"/>
      <text x="${p}" y="${H-4}" fill="var(--sub)" font-size="10">first bet</text><text x="${W-p}" y="${H-4}" text-anchor="end" fill="var(--sub)" font-size="10">now</text></svg>`;};
  const ranges=[['Short (+250 or shorter)',r=>r.imp>.286],['Mid (+250 to +500)',r=>r.imp<=.286&&r.imp>.167],['Long (+500 to +900)',r=>r.imp<=.167&&r.imp>.1],['Longshot (beyond +900)',r=>r.imp<=.1]]
    .map(([l,f])=>{const rs=rows.filter(r=>r.imp!=null&&f(r));if(!rs.length)return null;const a=rs.reduce((s,r)=>s+r.clv,0)/rs.length;return [esc(l),cell(pp(a),a>=0?'good heat':'bad heat'),Math.round(100*rs.filter(r=>r.clv>0).length/rs.length)+'%',rs.length];}).filter(Boolean);
  const types=Object.entries(rows.reduce((o,r)=>((o[r.type||'Bet']??=[]).push(r.clv),o),{})).filter(([,a])=>a.length>=2).map(([t,a])=>{const m=a.reduce((s,c)=>s+c,0)/a.length;return [esc(t),cell(pp(m),m>=0?'good heat':'bad heat'),'—',a.length];});
  const verdict=n<10?`Only ${n} bet${n===1?'':'s'} so far, too early to read the trend. CLV needs a few dozen bets before it means much.`:avg>=0?`Across ${n} bets you beat the close by ${avg.toFixed(1)} points on average: the sign your edge is real, and it shows up here before it shows up in your record.`:`Across ${n} bets your prices closed ${Math.abs(avg).toFixed(1)} points shorter than you took them. Before sizing up, stick to the most reliable Edge Finder plays and see whether CLV turns positive.`;
  return head+grid(3,[metric('Average CLV',pp(avg),`${n} bets with a closing price`,avg>=0?'good':'bad'),metric('Beat the close',Math.round(100*beat/n)+'%',`${beat} of ${n}`),metric('Latest running average',pp(cum.at(-1)))])+
    `<div class="callout">${esc(verdict)}</div>`+grid(2,[box('Cumulative average CLV',chart(),'Should trend up and stay above zero.'),
      box('By price range',table(['Range','Average CLV','Beat the close','Bets'],ranges,{cls:'compact'})+(types.length?table(['Bet type','Average CLV','','Bets'],types,{cls:'compact'}):''),'Shows where your edge is: beating the close on mid-priced hitters but not longshots tells you which bets to keep making.')]);
}

/* ---------- actions ---------- */
export function betAction(act,v){
  if(act==='betLeg'){
    if(v==='free'){const t=(S.f.search||'').trim();if(t)draft.legs.push({name:t,team:'',heat:null,badges:[],hit:'pending'});S.f.search='';return true;}
    const [kind,arg]=[v.slice(0,v.indexOf(':')),v.slice(v.indexOf(':')+1)];
    if(kind==='remove'){draft.legs.splice(+arg,1);return true;}
    const p=(board().players||[]).find(x=>String(x.id)===arg);if(!p)return true;
    const leg={name:p.name,team:p.team,heat:p.heat,badges:(p.badges||[]).map(b=>b.k),hit:'pending',id:p.id},e=E.fetchedOddsFor(p.id);
    if(e?.best!=null){leg.fetchedEntry=(e.best>=0?'+':'')+e.best;leg.fetchedBook=e.best_book;if(!draft.odds)draft.odds=leg.fetchedEntry;}
    draft.legs.push(leg);S.f.search='';return true;
  }
  if(act==='betSave'){
    if(!draft.legs.length)return 'Add at least one player to the bet.';
    const bets=E.loadBets();
    bets.push({id:Date.now(),date:dateKey(),slate:board().fallback?null:board().slate_date||null,type:draft.type,stake:draft.stake,odds:draft.odds,close:draft.close||'',result:'pending',payout:'',legs:draft.legs});
    E.saveBets(bets);draft={type:draft.type,stake:'',odds:'',close:'',legs:[]};return 'Bet logged';
  }
  const bets=E.loadBets(),find=id=>bets.find(x=>String(x.id)===String(id));
  if(act==='betHit'){const [id,i]=v.split(':'),b=find(id),lg=b?.legs?.[+i];if(lg){lg.hit=lg.hit==='pending'?'hit':lg.hit==='hit'?'miss':'pending';lg.auto=false;E.saveBets(bets);}return true;}
  if(act==='betResult'){const [id,r]=v.split(':'),b=find(id);if(b){b.result=r;if(r!=='win')b.payout='';E.saveBets(bets);}return true;}
  if(act==='betDelete'){if(!confirm('Delete this bet?'))return true;E.saveBets(bets.filter(x=>String(x.id)!==v));return true;}
  if(act==='betExport'){
    const payload={v:1,exported:new Date().toISOString(),bets,list:JSON.parse(localStorage.getItem('gy_list')||'[]'),prefs:JSON.parse(localStorage.getItem('gy_prefs')||'{}')};
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,1)],{type:'application/json'}));
    a.download='going-yard-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return 'Backup downloaded';
  }
  return false;
}
// Inputs: the draft form keeps focus (no re-render); saved bets re-render so stats update.
export function betField(t){
  const k=t.dataset.field;
  if(k==='betType'){draft.type=t.value;return 'keep';}
  if(k==='betStake'){draft.stake=t.value;return 'keep';}
  if(k==='betOdds'){draft.odds=t.value;return 'keep';}
  if(k==='betClose'){draft.close=t.value;return 'keep';}
  const bets=E.loadBets();
  if(t.dataset.betPayout){const b=bets.find(x=>String(x.id)===t.dataset.betPayout);if(b){b.payout=t.value;E.saveBets(bets);}return true;}
  if(t.dataset.betClose){const b=bets.find(x=>String(x.id)===t.dataset.betClose);if(b){b.close=t.value;b.closeManual=true;b.closeAuto=false;E.saveBets(bets);}return true;}
  if(t.dataset.betImport!==undefined&&t.files?.[0]){
    t.files[0].text().then(txt=>{
      try{const d=JSON.parse(txt);if(!Array.isArray(d?.bets))throw new Error('not a Going Yard backup');
        const cur=E.loadBets();if(cur.length&&!confirm(`Replace ${cur.length} logged bet(s) with ${d.bets.length} from the backup?`))return;
        E.saveBets(d.bets);if(Array.isArray(d.list))localStorage.setItem('gy_list',JSON.stringify(d.list));
        toast(`Restored ${d.bets.length} bet(s)`);document.dispatchEvent(new CustomEvent('going:render'));
      }catch(e){toast('Restore failed: '+e.message);}
    });return 'keep';
  }
  return false;
}
