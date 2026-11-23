import {readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ESPN,sportPath,scoreboard} from '../site/feeds.mjs';
import {dateKey,dateAdd} from '../site/ui.mjs';
import {readDraftKingsMainLines,readDraftKingsMilestones} from '../site/nba-main-lines.mjs';

const out=process.argv[2];
if(!out)throw new Error('A worktree for the public NBA price feed is required.');
const today=dateKey(), days=[today,dateAdd(today,1)];
const slates=await Promise.all(days.map(async date=>{
  try{
    const r=await fetch(ESPN+'/'+sportPath.nba+'/scoreboard?dates='+date.replaceAll('-',''),{signal:AbortSignal.timeout(8000)});
    const payload=r.ok?await r.json():null;
    if(Array.isArray(payload?.events))return {date,games:scoreboard(payload,'nba').map(game=>({...game,date}))};
  }catch{}
  console.warn('NBA slate unavailable for '+date);
  return null;
}));
if(slates.every(slate=>!slate))throw new Error('Could not confirm either NBA slate.');
const games=slates.flatMap(slate=>slate?.games||[]).filter(g=>['FUT','PRE'].includes(g.status)&&Date.parse(g.iso)>Date.now());
const [{quotes,failed},{quotes:alternates,failed:alternateFailed}]=await Promise.all([
  readDraftKingsMainLines(games),readDraftKingsMilestones(games)
]);
if(failed.length===4)throw new Error('All DraftKings main-line requests failed.');
const checkedAt=new Date().toISOString();
for(const slate of slates.filter(Boolean)){
  const onDay=quotes.filter(q=>q.date===slate.date);
  const onDayAlternates=alternates.filter(q=>q.date===slate.date);
  await writeFile(join(out,'nba-main-lines-'+slate.date+'.json'),JSON.stringify({date:slate.date,checkedAt,
    quotes:onDay,failed,alternates:onDayAlternates,alternateFailed}));
  console.log(slate.date+' · '+onDay.length+' DraftKings main lines · '+onDayAlternates.length+' alternate milestones');
  if(failed.length)console.warn('Main-line markets unavailable: '+failed.map(x=>x.market).join(', '));
  if(alternateFailed.length)console.warn('Milestone markets unavailable: '+alternateFailed.map(x=>x.market).join(', '));
}
for(const file of await readdir(out)){
  const date=file.match(/^nba-main-lines-(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
  if(date&&date<today)await rm(join(out,file));
}
