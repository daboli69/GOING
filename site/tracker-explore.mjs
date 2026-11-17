import {add,americanNumber,blank,rate,roi,toolLabel} from './track-core.mjs';

const missing='Unrecorded';
const category={model:'Model picks',prop:'Prop picks',game:'Game picks'};
const book=p=>{
  if(americanNumber(p.odds)==null)return 'Unpriced';
  return p.provider==='Draft Kings'?'DraftKings':p.provider||missing;
};
const side=p=>{
  if(!p.side)return missing;
  if(['Over','Under'].includes(p.side))return p.side;
  if(p.market==='Winner'&&p.sport==='ufc')return 'Fighter';
  if(p.side==='home'||p.side===p.h)return 'Home';
  if(p.side==='away'||p.side===p.a)return 'Away';
  return p.side||missing;
};
const priceBand=p=>{
  const n=americanNumber(p.odds);
  if(n==null)return 'Unpriced';
  if(n<=-200)return '−200 or shorter';
  if(n<0)return '−199 to −100';
  return n<200?'+100 to +199':'+200 and up';
};
const week=p=>{
  const date=new Date(p.date+'T00:00:00Z');
  if(!Number.isFinite(date.valueOf()))return missing;
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  return date.toISOString().slice(0,10);
};

export const trackerDimensions={
  sport:{label:'League',value:({p})=>p.sport.toUpperCase()},
  kind:{label:'Pick category',value:({p})=>category[p.kind]||missing},
  market:{label:'Market',value:({p})=>p.market||missing},
  side:{label:'Side',value:({p})=>side(p)},
  provider:{label:'Price source',value:({p})=>book(p)},
  priceBand:{label:'Odds range',value:({p})=>priceBand(p)},
  tool:{label:'Tool',value:({t})=>t,text:toolLabel},
  rating:{label:'Tool rating',value:({m})=>m.rating||missing},
  week:{label:'Week of',value:({p})=>week(p)}
};
export const filterDimensions=['sport','kind','market','side','provider','priceBand','tool','rating'];
export const trackerLabel=(dimension,value)=>trackerDimensions[dimension].text?.(value)??value;
export const trackerRows=picks=>picks.flatMap(p=>Object.entries(p.tools||{}).map(([t,m])=>({p,t,m})));

export function trackerScope(rows,filters,{from='',to=''}={}){
  const selected=filterDimensions.filter(key=>filters[key]);
  return rows.filter(r=>(!filters.lean||r.m.lean===true)&&r.p.date>=from&&(!to||r.p.date<=to)&&
    selected.every(key=>trackerDimensions[key].value(r)===filters[key]));
}

function remember(seen,row){
  const previous=seen.get(row.p.k);
  if(!previous||!Number.isFinite(previous.m.prob)&&Number.isFinite(row.m.prob))seen.set(row.p.k,row);
}
export function uniqueTrackerPicks(rows){
  const seen=new Map();
  for(const row of rows)remember(seen,row);
  return [...seen.values()];
}
export const trackerStats=rows=>rows.reduce((stats,{p,m})=>add(stats,p,m.prob),blank());

export function trackerGroups(rows,dimensions,min,order){
  const groups=new Map();
  for(const row of rows){
    const values=dimensions.map(key=>trackerDimensions[key].value(row));
    const id=JSON.stringify(values);
    if(!groups.has(id))groups.set(id,{values,picks:new Map()});
    remember(groups.get(id).picks,row);
  }
  const groupsWithStats=[...groups.values()].map(({values,picks})=>({values,stats:trackerStats([...picks.values()])}))
    .filter(({stats})=>stats.won+stats.lost>=min);
  const measure=order==='ROI'?roi:order==='Hit rate'?rate:s=>s.won+s.lost;
  return groupsWithStats.sort((a,b)=>(measure(b.stats)??-Infinity)-(measure(a.stats)??-Infinity)||
    (b.stats.won+b.stats.lost)-(a.stats.won+a.stats.lost)||a.values.join(' ').localeCompare(b.values.join(' ')));
}
