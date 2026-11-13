// Site root, derived from where this module is served (works at / locally and /GOING/ on GitHub Pages).
export const BASE=new URL('./',import.meta.url).pathname;
export const sections={
  nba:{name:'GOING UP',word:'UP',sport:'Basketball',league:'NBA',home:'up/'},
  nfl:{name:'GOING LONG',word:'LONG',sport:'Football',league:'NFL',home:'long/'},
  nhl:{name:'GOING GOAL',word:'GOAL',sport:'Hockey',league:'NHL',home:'goal/'},
  mlb:{name:'GOING YARD',word:'YARD',sport:'Baseball',league:'MLB',home:null}
};
// [title, path relative to BASE, view id]. Titles double as view keys inside the sport modules, so keep them stable.
export const menus={
  nfl:{
    Models:[['Ensemble Forecasts','long/','nfl-models']],
    Previews:[['Game Previews','long/game-previews.html','nfl-preview'],['TD Data','long/td-data.html','td'],['Opening Drive Tool','long/opening-drives.html','drives']],
    Props:[['Best Plays','long/best-plays.html','nfl-best'],['Receiving','long/player-props.html#receiving','nfl-props'],['Rushing','long/player-props.html#rushing','nfl-props'],['Passing','long/player-props.html#passing','nfl-props']],
    Promos:[['King of the Endzone','long/promo-tools.html','endzone']]
  },
  nba:{
    Models:[['Ensemble Forecasts','up/','nba-models']],
    Matchups:[['Slate Standouts','up/standouts.html','standouts'],['League Stats Chart','up/league.html','league'],['Matchup Keys','up/matchup-keys.html','keys'],['Zone Matchup Targets','up/zones.html','zones'],['Player Types','up/types.html','types'],['Shot Charts','up/shot-charts.html','shotcharts']],
    Props:[['All Props','up/all-props.html','nba-props'],['Points','up/points.html','nba-props'],['Threes','up/threes.html','nba-props'],['Assists','up/assists.html','nba-props'],['Rebounds','up/rebounds.html','nba-props'],['Assist Spots','up/assist-spots.html','nba-props'],['1st Basket','up/first-basket.html','basket']],
    Promos:[['King of the Court','up/promo-tools.html','court']]
  },
  nhl:{
    Previews:[['Game Previews','goal/','nhl-preview'],['Line Matchups','goal/lines.html','nhl-lines']],
    Props:[['Best Plays','goal/best.html','nhl-props'],['Shots','goal/shots.html','nhl-props'],['Goals','goal/goals.html','nhl-props'],['Points','goal/points.html','nhl-props'],['Saves','goal/saves.html','nhl-props']],
    Promos:[['King of the Crease','goal/promo-tools.html','crease'],['Icebreaker','goal/promo-tools.html#icebreaker','ice'],['King of the Hat Trick','goal/promo-tools.html#hattrick','hat']]
  }
};
export const routes=[
  {group:'',title:'GOING',path:'',id:'home',sport:'going'},
  ...Object.entries(menus).flatMap(([sport,groups])=>Object.entries(groups).flatMap(([group,entries])=>entries.map(([title,path,id])=>({group,title,path,id,sport})))),
  {group:'',title:'My Plays',path:'plays.html',id:'myplays',sport:'going'}
];
export const href=p=>BASE+p;
export const nflTeams={
 ARI:['Arizona Cardinals','97233f'],ATL:['Atlanta Falcons','a71930'],BAL:['Baltimore Ravens','49378b'],BUF:['Buffalo Bills','2369bc'],CAR:['Carolina Panthers','0085ca'],CHI:['Chicago Bears','c83803'],CIN:['Cincinnati Bengals','fb4f14'],CLE:['Cleveland Browns','ff3c00'],DAL:['Dallas Cowboys','365283'],DEN:['Denver Broncos','fb4f14'],DET:['Detroit Lions','0076b6'],GB:['Green Bay Packers','348371'],HOU:['Houston Texans','a71930'],IND:['Indianapolis Colts','1460aa'],JAX:['Jacksonville Jaguars','006778'],KC:['Kansas City Chiefs','e31837'],LA:['Los Angeles Rams','2557e5','lar'],LAC:['Los Angeles Chargers','0080c6'],LV:['Las Vegas Raiders','68747e'],MIA:['Miami Dolphins','008e97'],MIN:['Minnesota Vikings','6d4ea4'],NE:['New England Patriots','264e84'],NO:['New Orleans Saints','d3bc8d'],NYG:['New York Giants','1745c7'],NYJ:['New York Jets','125740'],PHI:['Philadelphia Eagles','008765'],PIT:['Pittsburgh Steelers','ffb612'],SEA:['Seattle Seahawks','376294'],SF:['San Francisco 49ers','aa0000'],TB:['Tampa Bay Buccaneers','d50a0a'],TEN:['Tennessee Titans','4b92db'],WAS:['Washington Commanders','e9a624','wsh']
};
export const nhlColors={ANA:'f47a38',BOS:'ffb81c',BUF:'286ed7',CAR:'cc0022',CBJ:'294b87',CGY:'d2001c',CHI:'cf0a2c',COL:'862633',DAL:'00865d',DET:'ce1126',EDM:'ff4c00',FLA:'c8102e',LAK:'828a8f',MIN:'2a7859',MTL:'af1e2d',NJD:'ce1126',NSH:'ffb81c',NYI:'f47d30',NYR:'2465c6',OTT:'c8102e',PHI:'f74902',PIT:'fcb514',SEA:'75a8bd',SJS:'006d75',STL:'2060b5',TBL:'3155ad',TOR:'2c6eca',UTA:'6cace4',VAN:'2878a0',VGK:'b4975a',WPG:'517bab',WSH:'c8102e'};
export const nbaPropTabs=['All Props','Points','Threes','Rebounds','Assists','Assist Spots'].map(t=>routes.find(r=>r.sport==='nba'&&r.title===t));
export const footers={nfl:['nflverse-data','https://github.com/nflverse/nflverse-data','Schedules, regular-season play-by-play, and rosters.'],nba:['sportsdataverse / hoopR','https://github.com/sportsdataverse/sportsdataverse-data','ESPN box scores and play-by-play.'],nhl:['NHL public game feed','https://api-web.nhle.com/v1/score/now','Schedules, play-by-play, box scores, and standings.']};
