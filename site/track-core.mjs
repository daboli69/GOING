// Pick tracker rules shared by scripts/track.mjs (capture and grading) and site/tracker.mjs (the page).
// A pick is one side of one line (or one model's winner) for one game, recorded before the game starts.

export const TOOLS={
  'nba-model':'GOING UP · Ensemble (combined)',
  'nba-props':'GOING UP · All Props',
  'nfl-model':'GOING LONG · Ensemble (champion)',
  'nfl-best':'GOING LONG · Best Plays',
  'nfl-props':'GOING LONG · Player Props',
  'nfl-td':'GOING LONG · TD Data',
  'nhl-best':'GOING GOAL · Best Plays',
  'nhl-shots':'GOING GOAL · Shots',
  'nhl-goals':'GOING GOAL · Goals',
  'nhl-points':'GOING GOAL · Points',
  'nhl-saves':'GOING GOAL · Saves'
};
// Individual ensemble members are tracked as "<sport>-model:<name>".
export const toolLabel=t=>TOOLS[t]||(t.includes('-model:')?(t.startsWith('nba')?'GOING UP':'GOING LONG')+' · Model: '+t.split(':')[1]:t);
export const isModelTool=t=>/-model(:|$)/.test(t);

export function americanNumber(o){
  if(o==null||o==='')return null;
  if(/^even$/i.test(String(o)))return 100;
  const n=Number(String(o).replace(/[^\d.+-]/g,''));
  return Number.isFinite(n)&&Math.abs(n)>=100?n:null;
}
export const impliedProb=o=>{const a=americanNumber(o);return a==null?null:a>0?100/(a+100):-a/(-a+100);};
// Profit in units for a 1-unit stake at the captured price.
export function units(result,o){
  const a=americanNumber(o);
  if(result==='push'||result==='void')return 0;
  if(a==null||!result)return null;
  return result==='won'?(a>0?a/100:100/-a):-1;
}
export function outcome(value,line,side){
  if(value==null||line==null)return null;
  if(value===line)return 'push';
  return (side==='Under'?value<line:value>line)?'won':'lost';
}
// Does the tool's own number favour this side? Probability edge first, then projection or average against the line.
export function leanOf({edge,prob,odds,proj,avg,line,side}){
  if(edge!=null)return edge>0;
  if(prob!=null&&impliedProb(odds)!=null)return prob>impliedProb(odds);
  const x=proj??avg;
  if(x==null||line==null)return null;
  return side==='Under'?x<line:x>line;
}

/* ---------- aggregation (page) ---------- */
export function blank(){return {n:0,won:0,lost:0,push:0,pending:0,void:0,units:0,priced:0,stake:0,be:0,beN:0,brier:0,brierN:0,ll:0};}
export function add(s,p,prob){
  if(!p.result){s.pending++;return s;}
  if(p.result==='void'){s.void++;return s;}
  s.n++;s[p.result]++;
  const u=units(p.result,p.odds);
  if(u!=null){s.units+=u;s.priced++;if(p.result!=='push')s.stake++;}
  const b=impliedProb(p.odds);if(b!=null&&p.result!=='push'){s.be+=b;s.beN++;}
  if(prob!=null&&p.result!=='push'){const y=p.result==='won'?1:0;s.brier+=(prob-y)**2;s.brierN++;s.ll+=-Math.log(Math.min(1-1e-6,Math.max(1e-6,y?prob:1-prob)));}
  return s;
}
export const rate=s=>s.won+s.lost?s.won/(s.won+s.lost):null;
export const roi=s=>s.stake?s.units/s.stake:null;
export const breakeven=s=>s.beN?s.be/s.beN:null;
export const brier=s=>s.brierN?s.brier/s.brierN:null;
export const logLoss=s=>s.brierN?s.ll/s.brierN:null;
