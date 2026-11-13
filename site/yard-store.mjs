// Save GOING YARD settings in this browser using hr-board's storage format.
export function setMinEdgeValue(v){try{localStorage.setItem('gy_minedge',String(v));}catch{}}
export function setManualPrice(boardDate,id,value,current){
  const prices={...current};const clean=String(value||'').trim();
  if(clean)prices[id]=/^[+-]/.test(clean)?clean:(Number(clean)>=100?'+'+clean:clean);else delete prices[id];
  try{localStorage.setItem('gy_odds',JSON.stringify({date:boardDate,prices}));}catch{}
}
