import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const trackers=[['index','picks'],['parlay-legs-index','parlay-legs'],['nfl-parlay-legs-index','nfl-parlay-legs']];
export const historyVersion=data=>createHash('sha256').update(data).digest('hex').slice(0,16);

export async function publishTrackerHistory(dir){
  const history=join(dir,'history');
  await mkdir(history,{recursive:true});
  for(const [name,prefix] of trackers){
    const path=join(dir,name+'.json');
    const raw=await readFile(path,'utf8').catch(err=>{if(err.code!=='ENOENT')throw err;return null;});
    if(!raw)continue;
    const index=JSON.parse(raw);
    if(!Array.isArray(index.months)||new Set(index.months).size!==index.months.length||
      index.months.some(month=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)))throw new Error('Invalid tracker months in '+path);
    index.versions=Object.fromEntries(await Promise.all(index.months.map(async month=>{
      const stem=prefix+'-'+month;
      const data=await readFile(join(dir,stem+'.json'));
      const version=historyVersion(data);
      await writeFile(join(history,stem+'-'+version+'.json'),data);
      return [month,version];
    })));
    await writeFile(path,JSON.stringify(index));
  }
}
