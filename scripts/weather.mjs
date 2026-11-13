// Kickoff-hour forecasts for NFL games from Open-Meteo (free, no key). Domes skip the request; retractable roofs are
// forecast and marked, since teams decide on the day. Used by GOING LONG Suggested Parlays.
const stadiums={
  ARI:[33.5276,-112.2626,'retractable'],ATL:[33.7554,-84.4008,'retractable'],BAL:[39.278,-76.6227],BUF:[42.7738,-78.787],
  CAR:[35.2258,-80.8528],CHI:[41.8623,-87.6167],CIN:[39.0955,-84.5161],CLE:[41.5061,-81.6995],DAL:[32.7473,-97.0945,'retractable'],
  DEN:[39.7439,-105.0201],DET:[42.34,-83.0456,'dome'],GB:[44.5013,-88.0622],HOU:[29.6847,-95.4107,'retractable'],
  IND:[39.7601,-86.1639,'retractable'],JAX:[30.3239,-81.6373],KC:[39.0489,-94.4839],LV:[36.0909,-115.1833,'dome'],
  LAC:[33.9535,-118.3392,'dome'],LA:[33.9535,-118.3392,'dome'],MIA:[25.958,-80.2389],MIN:[44.9737,-93.2575,'dome'],
  NE:[42.0909,-71.2643],NO:[29.9511,-90.0812,'dome'],NYG:[40.8135,-74.0745],NYJ:[40.8135,-74.0745],PHI:[39.9008,-75.1675],
  PIT:[40.4468,-80.0158],SF:[37.403,-121.97],SEA:[47.5952,-122.3316],TB:[27.9759,-82.5033],TEN:[36.1665,-86.7713],
  WAS:[38.9077,-76.8645]
};
// Neutral and international sites, matched on the schedule's stadium name.
const venues=[[/allianz|bayern/i,[48.2188,11.6247]],[/tottenham/i,[51.6043,-0.0664]],[/wembley/i,[51.556,-0.2796]],
  [/azteca|banorte/i,[19.3029,-99.1505]],[/bernab/i,[40.4531,-3.6883,'retractable']],[/croke/i,[53.3607,-6.2511]],
  [/melbourne|mcg/i,[-37.82,144.9834]],[/corinthians|neo qu[ií]mica/i,[-23.5453,-46.4742]],[/maracan/i,[-22.9122,-43.2302]],
  [/olympiastadion|berlin/i,[52.5147,13.2395]],[/deutsche bank|frankfurt/i,[50.0686,8.6455]]];
export function siteFor(g){
  const venue=venues.find(([re])=>re.test(g.venue||''));
  const [lat,lon,roof]=venue?.[1]||stadiums[g.h]||[];
  if(lat==null)return null;
  // At a neutral site the schedule's roof can be the home team's usual stadium, so the venue's own roof wins.
  const listed=venue?'':String(g.roof||'').toLowerCase();
  return {lat,lon,roof:listed==='dome'||listed==='closed'?'dome':roof||listed||'outdoors'};
}
// Eastern date and clock to the UTC hour Open-Meteo reports.
export function kickoffHour(date,time){
  if(!date||!/^\d{1,2}:\d{2}$/.test(time||''))return null;
  const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number),guess=Date.UTC(y,m-1,d,hh,mm);
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
    .formatToParts(new Date(guess)).map(x=>[x.type,x.value]));
  const at=new Date(guess-(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute)-guess));
  at.setUTCMinutes(0,0,0);
  return at.toISOString().slice(0,13)+':00';
}
export async function nflWeather(games){
  const checked=new Date().toISOString(), out={};
  await Promise.all(games.map(async g=>{
    const site=siteFor(g), hour=kickoffHour(g.date,g.time);
    if(!site||!hour)return;
    if(site.roof==='dome'){out[g.id]={roof:'dome',checked};return;}
    const u=new URL('https://api.open-meteo.com/v1/forecast');
    for(const [k,v] of Object.entries({latitude:site.lat,longitude:site.lon,hourly:'temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m',
      temperature_unit:'fahrenheit',wind_speed_unit:'mph',precipitation_unit:'inch',timezone:'UTC',start_date:hour.slice(0,10),end_date:hour.slice(0,10)}))u.searchParams.set(k,v);
    const j=await fetch(u,{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).catch(()=>null);
    const i=j?.hourly?.time?.indexOf(hour);
    if(i==null||i<0)return;
    // Rain over the three hours from kickoff, so a shower mid-game counts.
    const rain=(j.hourly.precipitation||[]).slice(i,i+3).reduce((a,b)=>a+(b||0),0);
    out[g.id]={roof:site.roof,temp:Math.round(j.hourly.temperature_2m[i]),wind:Math.round(j.hourly.wind_speed_10m[i]),
      gust:Math.round(j.hourly.wind_gusts_10m[i]),rain:Math.round(rain*100)/100,rainChance:j.hourly.precipitation_probability?.[i]??null,checked};
  }));
  return out;
}
