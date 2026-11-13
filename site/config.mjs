// Site root, derived from where this module is served (works at / locally and /GOING/ on GitHub Pages).
export const BASE=new URL('./',import.meta.url).pathname;
export const sections={
  nba:{name:'GOING UP',word:'UP',sport:'Basketball',league:'NBA',home:'up/'},
  nfl:{name:'GOING LONG',word:'LONG',sport:'Football',league:'NFL',home:'long/'},
  nhl:{name:'GOING GOAL',word:'GOAL',sport:'Hockey',league:'NHL',home:'goal/'},
  mlb:{name:'GOING YARD',word:'YARD',sport:'Baseball',league:'MLB',home:'yard/'},
  cbb:{name:'GOING CBB',word:'CBB',sport:'Men’s college basketball',league:'CBB',home:'cbb/'},
  cwb:{name:'GOING CWB',word:'CWB',sport:'Women’s college basketball',league:'CWB',home:'cwb/'},
  fbs:{name:'GOING FBS',word:'FBS',sport:'College football',league:'FBS',home:'fbs/'}
};
// [title, path relative to BASE, view id]. Titles double as view keys inside the sport modules, so keep them stable.
export const menus={
  cbb:{Matchups:[['Slate Standouts','cbb/','college-slate'],['Team Stats','cbb/team-stats.html','college-teams'],['Player Leaders','cbb/player-leaders.html','college-players']]},
  cwb:{Matchups:[['Slate Standouts','cwb/','college-slate'],['Team Stats','cwb/team-stats.html','college-teams'],['Player Leaders','cwb/player-leaders.html','college-players']]},
  fbs:{Previews:[['Game Previews','fbs/','college-slate'],['Team Stats','fbs/team-stats.html','college-teams'],['Game Lines','fbs/game-lines.html','college-lines']]},
  nfl:{
    Models:[['Ensemble Forecasts','long/','nfl-models']],
    Previews:[['Game Previews','long/game-previews.html','nfl-preview'],['TD Data','long/td-data.html','td'],['Opening Drive Tool','long/opening-drives.html','drives']],
    Props:[['Best Plays','long/best-plays.html','nfl-best'],['Receiving','long/player-props.html#receiving','nfl-props'],['Rushing','long/player-props.html#rushing','nfl-props'],['Passing','long/player-props.html#passing','nfl-props']],
    Parlays:[['Suggested Parlays','long/suggested-parlays.html','nfl-parlays'],['NFL Leg Tracker','long/parlay-tracker.html','nfl-parlay-tracker']],
    Promos:[['King of the Endzone','long/promo-tools.html','endzone']]
  },
  nba:{
    Models:[['Ensemble Forecasts','up/','nba-models']],
    Matchups:[['Slate Standouts','up/standouts.html','standouts'],['League Stats Chart','up/league.html','league'],['Matchup Keys','up/matchup-keys.html','keys'],['Zone Matchup Targets','up/zones.html','zones'],['Player Types','up/types.html','types'],['Shot Charts','up/shot-charts.html','shotcharts']],
    Props:[['All Props','up/all-props.html','nba-props'],['Points','up/points.html','nba-props'],['Threes','up/threes.html','nba-props'],['Assists','up/assists.html','nba-props'],['Rebounds','up/rebounds.html','nba-props'],['Assist Spots','up/assist-spots.html','nba-props'],['1st Basket','up/first-basket.html','basket']],
    Parlays:[['Suggested Parlays','up/suggested-parlays.html','nba-parlays'],['Parlay Leg Tracker','up/parlay-tracker.html','nba-parlay-tracker']],
    Promos:[['King of the Court','up/promo-tools.html','court']]
  },
  nhl:{
    Previews:[['Game Previews','goal/','nhl-preview'],['Line Matchups','goal/lines.html','nhl-lines']],
    Props:[['Best Plays','goal/best.html','nhl-props'],['Shots','goal/shots.html','nhl-props'],['Goals','goal/goals.html','nhl-props'],['Points','goal/points.html','nhl-props'],['Saves','goal/saves.html','nhl-props']],
    Promos:[['King of the Crease','goal/promo-tools.html','crease'],['Icebreaker','goal/promo-tools.html#icebreaker','ice'],['King of the Hat Trick','goal/promo-tools.html#hattrick','hat']]
  },
  mlb:{
    Models:[['HR Board','yard/','yard-board'],['Top Plays','yard/top-plays.html','yard-top'],['Top Picks','yard/top-picks.html','yard-picks'],['Daily Card','yard/daily-card.html','yard-daily'],['Signal Convergence','yard/convergence.html','yard-converge']],
    Matchups:[['Game Scan','yard/games.html','yard-games'],['Pitchers & Bullpens','yard/pitchers.html','yard-arms'],['Team vs Pitch Mix','yard/pitch-mix.html','yard-pitchmix'],['Split Overlaps','yard/splits.html','yard-splits'],['Target Teams','yard/targets.html','yard-targets'],['Weather & Parks','yard/weather.html','yard-weather']],
    Props:[['Hits & H+R+RBI','yard/hits.html','yard-hits'],['King of the Bases','yard/total-bases.html','yard-tb'],['Pitcher Strikeouts','yard/strikeouts.html','yard-ks'],['Game Totals','yard/game-totals.html','yard-totals'],['Edge Finder','yard/edge-finder.html','yard-edge'],['Price Research','yard/price-research.html','yard-price'],['Alt Line Finder','yard/alt-lines.html','yard-alt']],
    Parlays:[['Parlays & Jackpots','yard/parlays.html','yard-parlays'],['Parlay Builder','yard/parlay-builder.html','yard-sgp'],['Parlay Scanner','yard/parlay-scanner.html','yard-scanner'],['Ladder Challenge','yard/ladder.html','yard-ladder']],
    Results:[['Model Record','yard/record.html','yard-record'],['HR Calendar','yard/calendar.html','yard-calendar'],['HR Patterns','yard/patterns.html','yard-patterns'],['My Bets','yard/bets.html','yard-bets'],['CLV','yard/clv.html','yard-clv'],['Guide & FAQ','yard/guide.html','yard-guide']]
  }
};
// MLB: [name, MLB team id (logos), colour]. Codes match the hr-board feed.
export const mlbTeams={AZ:['Arizona Diamondbacks',109,'a71930'],ATL:['Atlanta Braves',144,'ce1141'],BAL:['Baltimore Orioles',110,'df4601'],BOS:['Boston Red Sox',111,'bd3039'],CHC:['Chicago Cubs',112,'0e3386'],CWS:['Chicago White Sox',145,'27251f'],CIN:['Cincinnati Reds',113,'c6011f'],CLE:['Cleveland Guardians',114,'0c2340'],COL:['Colorado Rockies',115,'33006f'],DET:['Detroit Tigers',116,'0c2340'],HOU:['Houston Astros',117,'eb6e1f'],KC:['Kansas City Royals',118,'004687'],LAA:['Los Angeles Angels',108,'ba0021'],LAD:['Los Angeles Dodgers',119,'005a9c'],MIA:['Miami Marlins',146,'00a3e0'],MIL:['Milwaukee Brewers',158,'12284b'],MIN:['Minnesota Twins',142,'002b5c'],NYM:['New York Mets',121,'ff5910'],NYY:['New York Yankees',147,'0c2340'],ATH:['Athletics',133,'003831'],OAK:['Athletics',133,'003831'],PHI:['Philadelphia Phillies',143,'e81828'],PIT:['Pittsburgh Pirates',134,'fdb827'],SD:['San Diego Padres',135,'2f241d'],SF:['San Francisco Giants',137,'fd5a1e'],SEA:['Seattle Mariners',136,'005c5c'],STL:['St. Louis Cardinals',138,'c41e3a'],TB:['Tampa Bay Rays',139,'092c5c'],TEX:['Texas Rangers',140,'003278'],TOR:['Toronto Blue Jays',141,'134a8e'],WSH:['Washington Nationals',120,'ab0003'],ARI:['Arizona Diamondbacks',109,'a71930']};
export const routes=[
  {group:'',title:'GOING',path:'',id:'home',sport:'going'},
  ...Object.entries(menus).flatMap(([sport,groups])=>Object.entries(groups).flatMap(([group,entries])=>entries.map(([title,path,id])=>({group,title,path,id,sport})))),
  {group:'',title:'My Plays',path:'plays.html',id:'myplays',sport:'going'},
  {group:'',title:'Pick Tracker',path:'tracker.html',id:'tracker',sport:'going'}
];
// Filters each view opens with. The tracker (scripts/track.mjs) renders views with these same settings.
export const viewDefaults={
  td:{view:'Season TDs'},'nfl-preview':{view:'Full Preview',scheme:'Raw Stats'},drives:{view:'Opening Drive',window:'Season'},'nfl-best':{view:'Receiving',rating:'All Ratings',gameFilter:'All games'},
  keys:{view:'Summary',window:'Season'},standouts:{cat:'All',window:'Season'},league:{window:'Season'},
  basket:{fbMinEdge:'2',fbRatio:'1.2',fbHold:'30',fbRR:'3',fbBy:'2',fbShow:'Top 30'},
  zones:{zoneMarket:'Threes',zoneView:'Best & Worst Spots',minimum:'0'},types:{view:'The 11 Types',typeFilter:'All'},
  'nba-props':{position:'All',pricing:'Every Player',allGames:true,gameFilter:'All games'},court:{trend:'Pregame Rank'},
  'nhl-props':{allGames:true,side:'Best side',skater:'All skaters',status:'All games',edge:'0',pricing:'All players',zoneMatch:'Everyone'},
  myplays:{when:'Everything',playType:'Every Type',grade:'All'},
  tracker:{sport:'All',kind:'All picks',window:'Season',lean:true},
  'nba-parlay-tracker':{legDecision:'All',legMarket:'All',legSide:'All',legResult:'All',legWindow:'Last 30 days',legSource:'All',legRule:'All'},
  'nfl-parlay-tracker':{legDecision:'All',legMarket:'All',legSide:'All',legResult:'All',legWindow:'All time',legSource:'All',legRule:'All'},
  'college-players':{collegeSample:'3'},
  'yard-board':{floor:'All',bats:'All',gameFilter:'All games',lineup:'All lineups',hideThin:false},
  'yard-hits':{view:'Hits'},'yard-arms':{view:'Starting pitchers'},'yard-parlays':{view:'Cross-game parlays'},'yard-record':{view:'Heat tiers'}
};
export function viewSetup(r,hash=''){
  const f={...viewDefaults[r.id]};
  if(r.id==='nfl-props')f.view=({'#rushing':'Rushing','#passing':'Passing'})[hash]||'Receiving';
  if(r.id==='nhl-props'&&r.title==='Saves')f.confirm='All goalies';
  if(r.id==='nhl-props'&&r.title==='Best Plays')f.edge='3';
  return f;
}
export const href=p=>BASE+p;
export const nflTeams={
 ARI:['Arizona Cardinals','97233f'],ATL:['Atlanta Falcons','a71930'],BAL:['Baltimore Ravens','49378b'],BUF:['Buffalo Bills','2369bc'],CAR:['Carolina Panthers','0085ca'],CHI:['Chicago Bears','c83803'],CIN:['Cincinnati Bengals','fb4f14'],CLE:['Cleveland Browns','ff3c00'],DAL:['Dallas Cowboys','365283'],DEN:['Denver Broncos','fb4f14'],DET:['Detroit Lions','0076b6'],GB:['Green Bay Packers','348371'],HOU:['Houston Texans','a71930'],IND:['Indianapolis Colts','1460aa'],JAX:['Jacksonville Jaguars','006778'],KC:['Kansas City Chiefs','e31837'],LA:['Los Angeles Rams','2557e5','lar'],LAC:['Los Angeles Chargers','0080c6'],LV:['Las Vegas Raiders','68747e'],MIA:['Miami Dolphins','008e97'],MIN:['Minnesota Vikings','6d4ea4'],NE:['New England Patriots','264e84'],NO:['New Orleans Saints','d3bc8d'],NYG:['New York Giants','1745c7'],NYJ:['New York Jets','125740'],PHI:['Philadelphia Eagles','008765'],PIT:['Pittsburgh Steelers','ffb612'],SEA:['Seattle Seahawks','376294'],SF:['San Francisco 49ers','aa0000'],TB:['Tampa Bay Buccaneers','d50a0a'],TEN:['Tennessee Titans','4b92db'],WAS:['Washington Commanders','e9a624','wsh']
};
export const nhlColors={ANA:'f47a38',BOS:'ffb81c',BUF:'286ed7',CAR:'cc0022',CBJ:'294b87',CGY:'d2001c',CHI:'cf0a2c',COL:'862633',DAL:'00865d',DET:'ce1126',EDM:'ff4c00',FLA:'c8102e',LAK:'828a8f',MIN:'2a7859',MTL:'af1e2d',NJD:'ce1126',NSH:'ffb81c',NYI:'f47d30',NYR:'2465c6',OTT:'c8102e',PHI:'f74902',PIT:'fcb514',SEA:'75a8bd',SJS:'006d75',STL:'2060b5',TBL:'3155ad',TOR:'2c6eca',UTA:'6cace4',VAN:'2878a0',VGK:'b4975a',WPG:'517bab',WSH:'c8102e'};
export const nbaPropTabs=['All Props','Points','Threes','Rebounds','Assists','Assist Spots'].map(t=>routes.find(r=>r.sport==='nba'&&r.title===t));
export const footers={mlb:['Going Yard (hr-board)','https://github.com/daboli69/hr-board','Statcast via Baseball Savant, MLB StatsAPI lineups and box scores, FanGraphs career rates.'],nfl:['nflverse-data','https://github.com/nflverse/nflverse-data','Schedules, regular-season play-by-play, and rosters.'],nba:['sportsdataverse / hoopR','https://github.com/sportsdataverse/sportsdataverse-data','ESPN box scores and play-by-play.'],nhl:['NHL public game feed','https://api-web.nhle.com/v1/score/now','Schedules, play-by-play, box scores, and standings.']};
footers.cbb=['hoopR','https://github.com/sportsdataverse/hoopR-mbb-data','Team and player box scores. Schedules and scores via ESPN.'];
footers.cwb=['wehoop','https://github.com/sportsdataverse/wehoop-wbb-data','Team and player box scores. Schedules and scores via ESPN.'];
footers.fbs=['cfbfastR','https://github.com/sportsdataverse/cfbfastR-cfb-data/blob/main/DATASETS.md','FBS matchup metrics. Scores and available game lines via ESPN.'];
