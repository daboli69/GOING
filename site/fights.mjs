import {current as S,esc,get,dataURL,dateLabel,tools,select,search,table,box,empty,round,pct,badge} from './ui.mjs';
import {href} from './config.mjs';
import {fightMinBouts,fightPick} from './fights-core.mjs';
import {impliedProb} from './track-core.mjs';
import {parseFightCards,ufcScoreboard} from './fights-feeds.mjs';

export const fightsLoad=()=>get(dataURL('fights/board.json'),null);
export async function fightsRefresh(snapshot){
  if(!snapshot?.cards?.length)return false;
  const now=Date.now(),hour=3600000;
  const watched=snapshot.cards.filter(c=>['scheduled','live'].includes(c.status)&&
    Date.parse(c.start)<=now+600000&&Date.parse(c.start)>now-12*hour);
  if(!watched.length)return false;
  const response=await fetch(ufcScoreboard,{cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(!response.ok)return false;
  const live=parseFightCards(await response.json());
  let changed=false;
  for(const card of watched){
    const next=live.find(c=>c.id===card.id);
    if(!next||!['live','final','canceled'].includes(next.status))continue;
    if(card.status!==next.status){card.status=next.status;changed=true;}
    for(const bout of card.bouts){
      const update=next.bouts.find(b=>b.id===bout.id&&b.fighters.every(f=>bout.fighters.some(x=>x.id===f.id)));
      if(!update||!['live','final','canceled'].includes(update.status))continue;
      const {status,winner,round,clock}=update,payload={status,winner,round,clock};
      if(Object.entries(payload).some(([k,v])=>bout[k]!==v)){
        Object.assign(bout,payload);delete bout.forecast;changed=true;
      }
    }
  }
  return changed;
}
const stamp=iso=>new Date(iso).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const signed=v=>v==null?'—':(v>0?'+':'')+v;
const numeric=v=>v==null?'—':round(v,2);
const percent=v=>v==null?'—':pct(v);
const name=f=>esc(f.name);
const matchup=b=>b.fighters.map(name).join(' <span class="muted">vs</span> ');
const portrait=(f,p)=>p?.headshot?`<span class="person"><img class="head" width="34" height="34" src="${esc(p.headshot)}" alt="" loading="lazy" decoding="async"> ${name(f)}</span>`:name(f);
const cardStatus=c=>({scheduled:'Upcoming',live:'Live',final:'Final',canceled:'Canceled'})[c.status]||'TBD';
const boutResult=b=>{
  if(b.status==='scheduled')return 'Scheduled';
  if(b.status==='canceled')return 'Canceled';
  if(b.status==='live')return ['Live',b.round?'Round '+b.round:null,b.clock].filter(Boolean).join(' · ');
  if(b.status!=='final')return 'TBD';
  if(b.outcome==='draw')return 'Draw';
  if(b.outcome==='no-contest')return 'No contest';
  const winner=b.fighters.find(f=>f.id===b.winner);
  return [winner?winner.name+' wins':'Result pending',b.method,b.round?'R'+b.round:null,b.clock].filter(Boolean).join(' · ');
};
const tracker=`<a class="pill" href="${href('tracker.html')}?sport=UFC">View UFC tracker</a>`;

function tape(b,profiles){
  const [left,right]=b.fighters, sides=[left,right].map(f=>profiles[f.id]||{});
  const withRow=(label,key,fmt=v=>esc(v??'—'))=>[label,...sides.map(p=>fmt(p[key]))];
  const rows=[['MMA record',...b.fighters.map(f=>esc(f.record??'—'))],withRow('Height','height'),withRow('Reach','reach'),withRow('Stance','stance'),withRow('Country','country'),
    withRow('Significant strikes per minute','strikesPerMinute',numeric),withRow('Strike accuracy','strikeAccuracy',v=>v==null?'—':round(v,1)+'%'),
    withRow('Takedowns per 15 min','takedowns',numeric),withRow('Takedown accuracy','takedownAccuracy',v=>v==null?'—':round(v,1)+'%'),
    withRow('Submission attempts per 15 min','submissions',numeric),
    ['UFC record in archive',...sides.map(p=>p.rating==null?'—':`${p.wins}–${p.losses}–${p.draws}`)],
    withRow('UFC Elo','rating',v=>v==null?'—':round(v,0))];
  const recent=[left,right].map((f,i)=>box(name(f),table(['Date','Opponent','Result','Method'],(sides[i].recent||[])
    .map(r=>[esc(r.date),esc(r.opponent),r.result,esc(r.method??'—')]),{empty:'No recent results in the archive.',cls:'compact'})));
  return box('Tale of the Tape',table(['Stat',portrait(left,sides[0]),portrait(right,sides[1])],rows,{cls:'compact'}),
    'ESPN publishes the fighter profiles and career rates. The UFC record and form are based on completed UFC bouts in the GOING archive. Fighter profiles and form show the latest available data even when viewing a past card.')+
    '<h2 class="heading">Last five UFC bouts</h2><div class="grid two">'+recent.join('')+'</div>';
}

function cardPage(card,bouts,archive){
  const rows=bouts.map(b=>{
    const pick=fightPick(card,b);
    const p=pick?.tools['ufc-baseline']?.prob;
    const baseline=p!=null?`${esc(pick.player)} ${pct(p)}`:b.forecast?'Even':'—';
    return [matchup(b),esc(b.segment??'—'),esc(b.division??'—'),b.rounds??'—',esc(boutResult(b)),baseline];
  });
  const active=bouts.find(b=>b.id===S.f.fightBout)||bouts[0];
  return box('Card',table(['Bout','Card segment','Division','Scheduled rounds','Status / result','Winner baseline'],rows,
    {sort:'ufc-card',empty:'No bouts match this card and search.'}),
    `Elo uses UFC results from ${archive.historyStart} onward and needs at least ${fightMinBouts} graded bouts per fighter. The percentages are uncalibrated estimates for the two named fighters. The tracker records them before the event starts.`)+
    (active?tools(select('Compare bout','fightBout',bouts.map(b=>[b.id,b.fighters.map(f=>f.name).join(' vs ')])))+tape(active,archive.fighters):'');
}

function marketPage(card,bouts){
  const rows=bouts.filter(b=>b.status==='scheduled').map(b=>{
    const m=b.market,p=fightPick(card,b);
    return [matchup(b),...b.fighters.map(f=>{
      const price=m?.moneyline[f.id];
      return price!=null?`${signed(price)} <span class="muted">(${percent(impliedProb(price))})</span>`:'—';
    }),m?.total?.line??'—',signed(m?.total?.over),signed(m?.total?.under),
      p?`${esc(p.player)} ${pct(p.tools['ufc-baseline'].prob)}`:'—',m?`${esc(m.provider)} · ${esc(stamp(m.checked))}`:'—'];
  });
  return box('Fight Lines',table(['Bout','Fighter 1 ML (implied)','Fighter 2 ML (implied)','Rounds','Over','Under','Winner baseline','Source / checked'],
    rows,{sort:'ufc-lines',empty:'No scheduled bouts for this card.'}),
    'ESPN lists prices where the sportsbook supplies them. The tracker grades winner forecasts and uses the captured moneyline for hypothetical ROI. Round totals are shown for research.');
}

function directoryPage(snapshot){
  const q=(S.f.search||'').trim().toLowerCase();
  const active=new Set(snapshot.cards.filter(c=>c.status==='scheduled'||c.status==='live').flatMap(c=>c.bouts.flatMap(b=>b.fighters.map(f=>f.id))));
  const names=new Map([...snapshot.cards].sort((a,b)=>a.start.localeCompare(b.start)).flatMap(c=>c.bouts.flatMap(b=>b.fighters.map(f=>[f.id,f]))));
  const fighters=[...names].map(([id,f])=>({...snapshot.fighters[id],...f}));
  const rows=fighters.filter(f=>(S.f.fightRoster!=='Upcoming cards'||active.has(f.id))&&f.name.toLowerCase().includes(q))
    .sort((a,b)=>(b.rating??0)-(a.rating??0)||a.name.localeCompare(b.name))
    .map(f=>[portrait(f,f),esc(f.record??'—'),f.rating==null?'—':round(f.rating,0),f.rating==null?'—':`${f.wins}–${f.losses}–${f.draws}`,
      esc(f.stance??'—'),esc(f.reach??'—'),numeric(f.strikesPerMinute),numeric(f.takedowns)]);
  return tools(select('Fighters','fightRoster',['All listed fighters','Upcoming cards'])+search('Search fighters')+tracker)+
    box('Fighter Stats',table(['Fighter','MMA record','UFC Elo','UFC archive record','Stance','Reach','Sig. strikes/min','Takedowns/15 min'],
      rows,{sort:'ufc-fighters'}),'Fighters listed on the upcoming and recent cards. Click a column heading to sort.');
}

export function fightsPage(){
  const snapshot=S.data,id=S.route.id,head=`<h1>${esc(S.route.title)} <span class="muted">· UFC</span></h1>`;
  if(!snapshot?.cards?.length)return head+box('',empty('No UFC card snapshot is available yet.'));
  const meta=`<p class="tiny">ESPN snapshot checked ${esc(stamp(snapshot.updated))}</p>`;
  if(id==='ufc-fighters')return head+meta+directoryPage(snapshot);
  const cards=snapshot.cards,card=cards.find(c=>c.id===S.f.fightCard)||cards.find(c=>c.status==='live')||cards.find(c=>c.status==='scheduled')||cards[0];
  S.f.fightCard=card.id;
  const q=(S.f.search||'').trim().toLowerCase();
  const bouts=card.bouts.filter(b=>b.fighters.some(f=>f.name.toLowerCase().includes(q))||(b.division||'').toLowerCase().includes(q));
  const options=cards.map(c=>[c.id,`${dateLabel(c.date,true)} · ${c.name} · ${cardStatus(c)}`]);
  const controls=tools(select('Event','fightCard',options)+search('Search fighters or divisions')+tracker+
    `<a class="pill" href="https://www.espn.com/mma/fightcenter/_/id/${encodeURIComponent(card.id)}/league/ufc" target="_blank" rel="noopener">ESPN FightCenter</a>`);
  const eventDetails=`<p class="subtle">${badge(cardStatus(card),card.status==='live'?'g':'')} ${esc(stamp(card.start))}${card.venue?' · '+esc(card.venue):''}</p>`;
  return head+controls+eventDetails+meta+(id==='ufc-lines'?marketPage(card,bouts):cardPage(card,bouts,snapshot));
}
