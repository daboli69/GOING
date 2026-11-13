// Regenerates site/yard-engine.mjs from hr-board's page so GOING YARD runs the Going Yard model's own math.
// It parses hr-board's main script, starts from the functions GOING YARD calls (ROOTS), follows every top-level
// function and variable they use, and writes them out verbatim with a small module wrapper.
//
//   npm run yard-engine                      # reads https://raw.githubusercontent.com/daboli69/hr-board/main/docs/index.html
//   npm run yard-engine -- path/to/index.html
// Needs the dev dependencies (npm install). Run it again whenever hr-board changes these functions.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOTS=[
  // Daily Card, Parlay Builder, Alt Line Finder, Price research, Top Picks
  'dailyMixedPool','_dcPickDistinct','altLinePool','sgpPool','genParlay','allPropEV','americanFair','fmtAm','unifiedPicks','getMinEdge','setMinEdge',
  // Edge Finder
  'trackerRates','betRates','hitterScore','evPerDollar','impliedProb','breakevenAmerican','fetchedOddsFor','oddsGet','oddsManual','oddsSet','oddsMatchSlate','oddsAgeMin','oddsStale','oddsIsAuto',
  // Ladder Challenge
  'ladderPick','ladderState','ladderSave','_ladDay','_ladDaysLeft','_decToAm','americanToDecimal',
  // Parlay Scanner
  'scanStep1_games','scanStep2_arms','scanStep3_contact','scanStep4_power',
  // Signal Convergence
  'CV_PROPS','cvBlock','cvMeasured','cvPasses','convergeVal','cvLiftNote','ksProjection','calibratedHRprob','smoothPropProb',
  // Team vs Pitch Mix
  'pmStarters','pmArsenal','pmDefaultSel','pmAgg','_ptName','_pmScale',
  // HR Patterns
  'hrpDays','hrpAggregate','wilson','hrpWeights','hrpPlayerSignals','hrpLogTallies',
  // Split Overlaps
  'splitVisible','splitColumns','splitValue','splitFormat','splitLabels','splitState',
  // My Bets and CLV (the bet journal lives in this browser under hr-board's keys)
  'BET_TYPES','loadBets','saveBets','clvOf','betStats','BKLABEL','flagScratches'
];
const WIRED=['BOARD','ODDS','HISTORY','BACKTEST'];
const root=fileURLToPath(new URL('../',import.meta.url));
const from=process.argv[2]||'https://raw.githubusercontent.com/daboli69/hr-board/main/docs/index.html';
const html=/^https?:/.test(from)?await fetch(from).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status+' '+from);return r.text();}):await readFile(from,'utf8');
const src=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].sort((a,b)=>b[1].length-a[1].length)[0][1];
const ast=acorn.parse(src,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true});

const decls=new Map();
for(const node of ast.body){
  if(node.type==='FunctionDeclaration')decls.set(node.id.name,{node,kind:'function'});
  else if(node.type==='VariableDeclaration')for(const d of node.declarations){if(d.id.type==='Identifier')decls.set(d.id.name,{node,decl:d,kind:node.kind});}
  else if(node.type==='ClassDeclaration')decls.set(node.id.name,{node,kind:'class'});
}
const refs=node=>{
  const out=new Set();
  walk.fullAncestor(node,(n,_s,anc)=>{
    if(n.type!=='Identifier')return;
    const parent=anc[anc.length-2];
    if(parent?.type==='MemberExpression'&&parent.property===n&&!parent.computed)return;
    if(parent?.type==='Property'&&parent.key===n&&!parent.computed&&!parent.shorthand)return;
    out.add(n.name);
  });
  return out;
};
// Anything that draws hr-board's own page is never followed: GOING YARD draws its own pages.
const touchesDom=name=>{const d=decls.get(name);return /\bdocument\.|innerHTML|getElementById/.test(src.slice(d.node.start,d.node.end));};
const keep=new Set(),queue=[...ROOTS,...WIRED],dangling=new Map();
while(queue.length){
  const name=queue.shift();
  if(keep.has(name)||!decls.has(name))continue;
  keep.add(name);
  const d=decls.get(name);
  for(const r of refs(d.decl||d.node)){
    if(!decls.has(r)||keep.has(r))continue;
    if(touchesDom(r)&&!ROOTS.includes(r)){if(!dangling.has(name))dangling.set(name,new Set());dangling.get(name).add(r);continue;}
    queue.push(r);
  }
}
const missing=ROOTS.filter(r=>!decls.has(r));
if(missing.length)console.warn('Not found in hr-board (left out):',missing.join(', '));
for(const [k,v] of dangling)console.warn(`  ${k} refers to page code it does not get: ${[...v].join(', ')}`);
const nodes=[...new Set([...keep].map(k=>decls.get(k).node))].sort((a,b)=>a.start-b.start);
const state=[...keep].filter(k=>['let','var'].includes(decls.get(k).kind)&&!WIRED.includes(k));
const own=WIRED.filter(w=>!keep.has(w));
// The Guide & FAQ entries: each q(icon, title, body) call inside renderFaq, kept as written.
const lit=n=>n?.type==='Literal'?String(n.value):n?.type==='TemplateLiteral'&&!n.expressions.length?n.quasis.map(q=>q.value.cooked).join(''):null;
const guide=[];
if(decls.has('renderFaq'))walk.simple(decls.get('renderFaq').node,{CallExpression(c){
  if(c.callee.type==='Identifier'&&c.callee.name==='q'){const t=lit(c.arguments[1]),b=lit(c.arguments[2]);if(t&&b)guide.push([t,b.replace(/\s+/g,' ').trim()]);}
}});
const out=`// GENERATED by scripts/build-yard-engine.mjs from hr-board's docs/index.html. Do not edit; regenerate.
// The Going Yard model's own in-browser math, copied verbatim so GOING YARD shows exactly what hr-board shows.
/* eslint-disable */
${own.length?`let ${own.map(w=>w+'=null').join(', ')};`:''}
${nodes.map(n=>src.slice(n.start,n.end)).join('\n')}
export function setYardData(d){ if('board' in d)BOARD=d.board; if('odds' in d)ODDS=d.odds; if('history' in d)HISTORY=d.history; if('backtest' in d)BACKTEST=d.backtest; }
export function setYardState(k,v){ switch(k){ ${state.map(x=>`case ${JSON.stringify(x)}: ${x}=v; break;`).join(' ')} } }
export function getYardState(k){ switch(k){ ${state.map(x=>`case ${JSON.stringify(x)}: return ${x};`).join(' ')} } }
export { ${ROOTS.filter(r=>decls.has(r)).join(', ')} };
// Guide & FAQ from hr-board, [title, body HTML].
export const GUIDE=${JSON.stringify(guide)};
`;
await writeFile(root+'site/yard-engine.mjs',out);
console.log(`site/yard-engine.mjs: ${keep.size} declarations from hr-board, ${(out.length/1024).toFixed(0)} KB. State: ${state.join(', ')}`);
