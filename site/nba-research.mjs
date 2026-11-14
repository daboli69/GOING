import {mean} from './math.mjs';
import {allowedRanks} from './parlay-core.mjs';

export const typeLetters = [...'ABCDEFGHIJKL'];
export const minimumTypeShots = 50;
export const shotMixLabels = ['Avg Dist','3PT','Catch & Shoot','Pull-up','Fade','Floater','Post / Hook','Drive','Cut','Lob / Putback','Fast Break'];
const shotCategories = ['Catch & Shoot','Pull-up','Fade','Floater','Hook','Drive','Cut','Lob / Putback'];

// Fixed representative profiles. Columns are feet, then percentages in shotMixLabels order.
// Fit a player's prior shots to these profiles without refitting the reference groups each day.
const profiles = [
  [21,76,63,20,2,3,0,7,3,2,16],
  [18,57,32,35,5,7,0,18,2,1,11],
  [17,54,43,23,5,7,1,14,4,3,13],
  [17,60,58,5,2,5,2,13,8,7,10],
  [15,42,23,30,4,20,1,20,2,1,10],
  [14,35,26,29,15,7,1,16,4,3,11],
  [14,48,41,13,4,5,1,23,7,6,18],
  [11,33,34,4,5,6,7,13,13,17,8],
  [11,30,22,18,5,11,1,35,4,4,15],
  [7,11,17,4,8,9,17,13,17,15,7],
  [7,12,13,4,5,19,5,25,15,15,12],
  [5,6,9,1,2,9,8,13,29,29,9],
];
const featureScales = [5,20,18,13,6,7,6,10,9,10,9];

export const eligibleShot = shot => (shot[6] === 2 || shot[6] === 3) && Number.isFinite(shot[5]) && shot[5] < 40;

export function shotMix(shots) {
  const mix = Array(shotMixLabels.length).fill(0);
  let transitionTagged = 0;
  for (const shot of shots) {
    mix[0] += shot[5];
    mix[1] += Number(shot[6] === 3);
    const category = ['Lob','Putback'].includes(shot[8]) ? 'Lob / Putback' : shot[8];
    const index = shotCategories.indexOf(category);
    if (index >= 0) mix[index + 2]++;
    if (shot[11] === 0 || shot[11] === 1) {
      transitionTagged++;
      mix[10] += shot[11];
    }
  }
  return mix.map((value,index) => index === 10
    ? (transitionTagged ? 100 * value / transitionTagged : null)
    : (shots.length ? value / shots.length * (index ? 100 : 1) : null));
}

export function playerProfile(shots) {
  const mix = shotMix(shots);
  if (shots.length < minimumTypeShots) return {letter:null, lean:null, mix};
  const distances = profiles.map((profile,index) => ({
    letter:typeLetters[index],
    distance:Math.sqrt(profile.reduce((sum,value,i) => sum + (mix[i] == null ? 0 : ((mix[i] - value) / featureScales[i]) ** 2),0)),
  })).sort((a,b) => a.distance - b.distance);
  const [best,next] = distances;
  return {letter:best.letter, lean:next.distance <= best.distance * 1.15 ? next.letter : null, mix};
}

export const assistLabels = ['Kick-out 3s','Catch & Drive','Cuts & Lobs','Off-dribble 3s','Short & Mid'];
const assistKind = ([,,,kind,points]) => {
  if (points === 3) return ['Pull-up','Fade','Drive'].includes(kind) ? 3 : 0;
  if (kind === 'Drive') return 1;
  if (kind === 'Cut' || kind === 'Lob') return 2;
  return 4;
};
const emptyMix = () => Array(assistLabels.length).fill(0);
const key = (...parts) => JSON.stringify(parts);
const increment = (map,id) => map.set(id,(map.get(id) || 0) + 1);

export function assistArchive(data, players, games, type) {
  const byPasser = new Map(), byShooterGame = new Map(), byDefenseGame = new Map();
  const league = emptyMix();
  for (const [passer,events] of Object.entries(data.assists || {})) {
    for (const event of events) {
      const [game,shooter,offense,,points] = event;
      if (!Object.hasOwn(games,game) || shooter === passer || !shooter || ![2,3].includes(points)) continue;
      const shotGame = games[game];
      const opponent = shotGame.offenses.get(offense);
      if (!opponent) continue;
      const kind = assistKind(event);
      const eventsForPasser = byPasser.get(passer) || [];
      eventsForPasser.push({game,shooter,offense,kind});
      byPasser.set(passer,eventsForPasser);
      increment(byShooterGame,key(shooter,game));
      const counts = byDefenseGame.get(key(opponent,game)) || emptyMix();
      counts[kind]++;
      byDefenseGame.set(key(opponent,game),counts);
      league[kind]++;
    }
  }

  const typeGames = new Map(), shotKinds = new Map();
  for (const player of players) {
    const letter = type(player.id);
    if (!letter) continue;
    const logs = player.logs.filter(log => Object.hasOwn(games,log[0]) && games[log[0]].offenses.has(log[2]));
    if (logs.length < 4) continue;
    const makes = logs.map(log => byShooterGame.get(key(player.id,log[0])) || 0);
    const seasonMakes = makes.reduce((sum,n) => sum+n,0);
    for (const [i,log] of logs.entries()) {
      const [game,,,opponent] = log;
      const id = key(letter,opponent);
      const group = typeGames.get(id) || new Map();
      const deltas = group.get(game) || [];
      deltas.push(makes[i] - (seasonMakes - makes[i]) / (logs.length - 1));
      group.set(game,deltas);
      typeGames.set(id,group);
    }
  }

  const byType = new Map();
  for (const [id,group] of typeGames) {
    const values = [...group.values()].map(xs => mean(xs));
    byType.set(id,{delta:mean(values),n:values.length,above:values.filter(x => x > 0).length});
  }
  const defenseTeams = Object.keys(data.teams || {});
  for (const letter of typeLetters) {
    const ranks = allowedRanks(defenseTeams.map(team => {
      const result = byType.get(key(letter,team));
      return [team,result?.n >= 3 ? result.delta : null];
    }));
    for (const [team,rank] of ranks) byType.get(key(letter,team)).rank = rank;
  }

  const defenseSamples = new Map();
  for (const game of Object.values(games)) {
    for (const defense of game.offenses.values()) {
      const counts = byDefenseGame.get(key(defense,game.id)) || emptyMix();
      const samples = defenseSamples.get(defense) || [];
      samples.push(counts);
      defenseSamples.set(defense,samples);
    }
  }
  for (let i=0;i<assistLabels.length;i++) {
    const averages = [...defenseSamples].map(([team,counts]) => [team,counts.length >= 3 ? mean(counts,x => x[i]) : null]);
    const ranks = allowedRanks(averages);
    for (const [team,avg] of averages) shotKinds.set(key(team,i),{avg,rank:ranks.get(team)});
  }
  return {byPasser,byType,shotKinds,league};
}

const normalizedRank = rank => rank?.total >= 6 ? (rank.rank + rank.end - 2) / (rank.total - 1) - 1 : null;
const directionOf = (value,threshold) => value == null || Math.abs(value) < threshold ? 0 : Math.sign(value);

export function assistMatchup(archive, player, teammates, opponent, unavailable, newAbsences, type) {
  const roster = new Set(teammates.map(p => p.id));
  const events = (archive.byPasser.get(player.id) || []).filter(e => e.offense === player.team);
  const mix = emptyMix(), counts = new Map();
  for (const {shooter,kind} of events) {
    mix[kind]++;
    if (!counts.has(shooter)) counts.set(shooter,emptyMix());
    counts.get(shooter)[kind]++;
  }
  const recipients = teammates.map(p => {
    const countsByKind = counts.get(p.id) || emptyMix();
    const letter = type(p.id);
    return {player:p,letter,mix:countsByKind,n:countsByKind.reduce((a,b) => a+b,0),
      defense:archive.byType.get(key(letter,opponent)),out:unavailable.has(p.id)};
  }).sort((a,b) => b.n - a.n || a.player.name.localeCompare(b.player.name));
  const eligible = recipients.filter(r => r.n && !r.out && r.defense?.n >= 5 && r.defense.rank?.total >= 6);
  const covered = eligible.reduce((sum,r) => sum + r.n,0);
  const rosterAssists = events.filter(e => roster.has(e.shooter)).length;
  const targetDelta = events.length >= 20 && covered >= events.length / 2
    ? eligible.reduce((sum,r) => sum + r.n * r.defense.delta * r.defense.n/(r.defense.n+5),0) / covered : null;
  const kinds = mix.map((n,i) => ({n,...archive.shotKinds.get(key(opponent,i))}));
  const mixCovered = kinds.filter(x => normalizedRank(x.rank) != null).reduce((sum,x) => sum+x.n,0);
  const mixEdge = events.length >= 20 && mixCovered >= events.length * .8
    ? kinds.reduce((sum,x) => sum + x.n * (normalizedRank(x.rank) ?? 0),0) / mixCovered : null;
  const logs = player.logs.filter(log => log[2] === player.team);
  const lineup = teammates.filter(p => p.id !== player.id).map(p => {
    const teammateGames = new Set(p.logs.filter(log => log[2] === player.team).map(log => log[0]));
    const withPlayer = logs.filter(log => teammateGames.has(log[0]));
    const withoutPlayer = logs.filter(log => !teammateGames.has(log[0]));
    return {player:p,withN:withPlayer.length,withoutN:withoutPlayer.length,withAvg:mean(withPlayer,x=>x[8]),
      withoutAvg:mean(withoutPlayer,x=>x[8]),recentOut:newAbsences.has(p.id)};
  });
  const recent = lineup.filter(x => x.recentOut && x.withN >= 3 && x.withoutN >= 3);
  const lineupDelta = mean(recent,x=>x.withoutAvg-x.withAvg);
  const signals = [directionOf(targetDelta,.25),directionOf(mixEdge,.2),directionOf(lineupDelta,.75)];
  const read = signals.includes(1) && signals.includes(-1) ? 'Mixed' : signals.includes(1) ? 'Over' : signals.includes(-1) ? 'Under' : 'No Read';
  return {recipients,kinds,events:events.length,former:events.length-rosterAssists,targetDelta,mixEdge,covered,lineup,lineupDelta,signals,read};
}
