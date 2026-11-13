export const lineupUrl='https://www.nhl.com/news/nhl-lineup-projections-2026-27-season';
const names={Ducks:'ANA',Bruins:'BOS',Sabres:'BUF',Hurricanes:'CAR','Blue Jackets':'CBJ',Flames:'CGY',Blackhawks:'CHI',Avalanche:'COL',Stars:'DAL','Red Wings':'DET',Oilers:'EDM',Panthers:'FLA',Kings:'LAK',Wild:'MIN',Canadiens:'MTL',Devils:'NJD',Predators:'NSH',Islanders:'NYI',Rangers:'NYR',Senators:'OTT',Flyers:'PHI',Penguins:'PIT',Kraken:'SEA',Sharks:'SJS',Blues:'STL',Lightning:'TBL','Maple Leafs':'TOR',Mammoth:'UTA',Canucks:'VAN','Golden Knights':'VGK',Jets:'WPG',Capitals:'WSH'};
const teamNames=Object.entries(names).map(([name,code])=>[name.toLowerCase(),code]);
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export function lineupReport(html){
  let article;
  for(const m of html.matchAll(/<script[^>]+application\/ld[^>]*>(.*?)<\/script>/gs)){
    try{const x=JSON.parse(m[1]);if(x.articleBody){article=x;break;}}catch{}
  }
  const text=article?.articleBody||'';
  const date=(article?.dateModified||article?.datePublished||'').slice(0,10);
  if(!text||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const day=weekdays[new Date(date+'T12:00:00Z').getUTCDay()];
  const parts=text.split(/(?:^|\n)#{1,3}\s*\*{0,2}(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/i);
  const dayIndex=parts.findIndex((x,i)=>i%2===1&&x.toLowerCase()===day);
  const content=dayIndex>0?parts[dayIndex+1]:text;
  const headers=[...content.matchAll(/\*\*([^*\n]+?)\s+(?:projected lineup|lineup)\*\*/gi)];
  const result={};
  for(let i=0;i<headers.length;i++){
    const m=headers[i],name=m[1].trim().toLowerCase();
    const team=teamNames.find(([suffix])=>name.endsWith(suffix))?.[1];
    if(!team)continue;
    const tail=content.slice(m.index+m[0].length,headers[i+1]?.index);
    const lines=tail.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const cutoff=lines.findIndex(s=>/scratched:|injured:|status report|^##/i.test(s));
    const playable=lines.slice(0,cutoff<0?10:cutoff).map(x=>x.replace(/[*\u00a0]/g,' ').trim()).filter(Boolean);
    const combos=playable.filter(x=>/\s(?:--|–|—)\s/.test(x)).map(x=>x.split(/\s+(?:--|–|—)\s+/).map(y=>y.trim()));
    const goalies=playable.filter(x=>!/[#;:]/.test(x)&&!/\s(?:--|–|—)\s/.test(x)&&x.split(/\s+/).length>=2&&x.split(/\s+/).length<=4);
    if(combos.length)result[team]={forwards:combos.filter(x=>x.length>=3),defense:combos.filter(x=>x.length===2),goalies};
  }
  return {date,lineups:result};
}

export function parseLineups(html,date){
  const report=lineupReport(html);
  return report?.date===date?report.lineups:{};
}
