import test from 'node:test';
import assert from 'node:assert/strict';
import {trackerGroups,trackerRows,trackerScope,trackerStats,uniqueTrackerPicks} from '../site/tracker-explore.mjs';
import {roi} from '../site/track-core.mjs';

const prop={sport:'nba',kind:'prop',side:'Under',market:'Rebounds',date:'2026-11-15',provider:'Draft Kings',odds:-100,
  tools:{board:{lean:true},research:{lean:true,prob:.6,rating:'Strong'}}};
const rows=trackerRows([
  {...prop,k:'a',result:'won'},
  {...prop,k:'b',date:'2026-11-16',result:'lost',tools:{board:{lean:false},research:{lean:true,prob:.55}}},
  {...prop,k:'c',odds:null,result:'won'},
  {...prop,k:'d',sport:'nhl',market:'Saves',side:'Over',result:'lost'},
  {...prop,k:'e',date:'2026-11-20'}
]);

test('tracker combines filters without counting a pick twice',()=>{
  const scoped=trackerScope(rows,{sport:'NBA',kind:'Prop picks',market:'Rebounds',side:'Under',provider:'DraftKings',lean:true},
    {from:'2026-11-15',to:'2026-11-16'});
  assert.equal(scoped.length,3);
  const unique=uniqueTrackerPicks(scoped);
  assert.equal(unique.length,2);
  assert.equal(unique[0].m.prob,.6);
  assert.equal(roi(trackerStats(unique)),0);
  assert.deepEqual(trackerGroups(scoped,['tool','market'],2,'ROI').map(g=>g.values),[['research','Rebounds']]);
});

test('tracker reports priced sample size and excludes unpriced wins from ROI',()=>{
  const nba=trackerScope(rows,{sport:'NBA',lean:true},{to:'2026-11-16'});
  const [group]=trackerGroups(nba,['sport','market'],0,'Decisions');
  assert.deepEqual(group.values,['NBA','Rebounds']);
  assert.equal(group.stats.won,2);
  assert.equal(group.stats.lost,1);
  assert.equal(group.stats.stake,2);
  assert.equal(roi(group.stats),0);
  assert.equal(trackerGroups(nba,['sport','market'],4,'Decisions').length,0);
});
