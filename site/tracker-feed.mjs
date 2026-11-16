import {dataURL,get} from './ui.mjs';

export function trackerFeed(prefix,indexName=prefix+'-index',read=get){
  let lastComplete;
  const parsed=new Map();
  return async function load(){
    const index=await read(dataURL('tracker/'+indexName+'.json'),null);
    const count=index?.count??index?.picks;
    const valid=Array.isArray(index?.months)&&Number.isInteger(count)&&count>=0&&Number.isFinite(Date.parse(index.updated))&&
      new Set(index.months).size===index.months.length&&index.months.every(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m));
    const groups=valid?await Promise.all(index.months.map(async month=>{
      const version=index.versions?.[month], stem=prefix+'-'+month;
      if(index.versions&&!/^[a-f0-9]{16}$/.test(version))return null;
      if(version&&parsed.get(month)?.version===version)return parsed.get(month).rows;
      const file=version?'history/'+stem+'-'+version:stem;
      const rows=await read(dataURL('tracker/'+file+'.json'),null);
      if(version&&Array.isArray(rows))parsed.set(month,{version,rows});
      return rows;
    })):[];
    const rows=groups.filter(Array.isArray).flat();
    if(valid&&groups.every(Array.isArray)&&rows.length===count){
      if(!lastComplete||Date.parse(index.updated)>=Date.parse(lastComplete.index.updated))lastComplete={index,rows};
      return {...lastComplete,notice:''};
    }
    if(lastComplete)return {...lastComplete,notice:'The latest tracker files could not be verified. Showing the last complete snapshot.'};
    return {index:valid?index:{},rows,notice:valid?
      `Loaded ${rows.length} of ${count} expected records. Statistics use the records available.`:
      'The tracker index could not load. Try again in a moment.'};
  };
}
