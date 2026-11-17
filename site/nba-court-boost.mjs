const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const confidence=n=>n/(n+8);

export function courtMatchupBoost(base,{type,typeDeltas=[],position,own,opponent,league}){
  const signals=[];
  if(typeDeltas.length>=5&&typeDeltas.filter(value=>value>0).length>typeDeltas.length/2){
    const delta=average(typeDeltas);
    if(delta>0)signals.push({
      value:.25*delta*confidence(typeDeltas.length),
      reason:`Type ${type} scoring +${delta.toFixed(1)} vs own averages (${typeDeltas.length} games)`
    });
  }
  if(opponent?.games>=5&&league?.pra>0){
    // The baseline already factors in PRA allowed. Reward an individual stat only for the remaining edge.
    const praRatio=Math.max(1,opponent.pra/league.pra);
    for(const stat of ['rebounds','assists']){
      const edge=league[stat]>0?opponent[stat]/league[stat]-praRatio:0;
      if(edge>0&&own[stat]>0)signals.push({
        value:.25*own[stat]*edge*confidence(opponent.games),
        reason:`${stat==='rebounds'?'Rebounds':'Assists'} vs ${position} +${(100*edge).toFixed(0)}% beyond PRA allowance (${opponent.games} games)`
      });
    }
  }
  const boost=Math.min(1,.03*base,signals.reduce((sum,signal)=>sum+signal.value,0));
  return boost>=.05?{boost,reasons:signals.map(signal=>signal.reason)}:{boost:0,reasons:[]};
}
