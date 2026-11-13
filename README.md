# GOING

One site for the ensemble models and the sports dashboards.

| Section | Sport | What is in it |
| --- | --- | --- |
| GOING UP | Basketball (NBA) | Ensemble forecasts, matchup tools, prop research, shot charts, King of the Court |
| GOING LONG | Football (NFL) | Ensemble forecasts, game previews, TD data, opening drives, props, King of the Endzone |
| GOING GOAL | Hockey (NHL) | Game previews, line matchups, props, crease, icebreaker and hat-trick promos |
| GOING CBB | Men’s college basketball | Slate standouts, matchup keys, team stats and player leaderboards |
| GOING CWB | Women’s college basketball | Slate standouts, matchup keys, team stats and player leaderboards |
| GOING FBS | College football (FBS) | Game previews, team stats, EPA and success rates, moneyline, spread and game totals |
| GOING YARD | Baseball (MLB) | The Going Yard home run model: HR Board, Top Plays, Top Picks, Daily Card, Signal Convergence, Game Scan, pitchers and bullpens, Team vs Pitch Mix, Split Overlaps, target teams, weather and parks, hits and H+R+RBI, King of the Bases, strikeouts, game totals, Edge Finder, Price Research, Alt Line Finder, parlays and jackpots, Parlay Builder, Parlay Scanner, Ladder Challenge, Model Record, HR Calendar, HR Patterns, My Bets, CLV, Guide |

Each section uses its own accent color and the same dashboard typography, boards and charts.

## How the data stays current

**GOING UP Suggested Parlays.** The builder uses the existing NBA archives, ESPN game lines and injury reports, and captured Kalshi player quotes. It can return a shorter ticket or no ticket when the available data and filters leave too few eligible legs. Combined odds multiply the individual quotes. The adjusted chance uses season win counts plus five wins and five losses per leg before multiplying, with no same-game correlation adjustment. Generated tickets, filter settings, and manually logged results are stored in this browser.

**Parlay Leg Tracker.** Each Pages refresh archives the priced NBA legs the builder can match, including available alternate thresholds and both quoted sides. It records every applicable screening rule, the default ticket's selection, and the first and latest pregame observations for each line and side. Final ESPN box scores grade hits, misses, pushes and confirmed DNPs. Missing final results stay pending. Compare rules by hit rate, hypothetical flat-stake ROI, and the subset where only one rule failed. Results start with the first successful capture. Empty quote feeds cannot be backfilled from box scores.

Two sources feed the site, and neither commits data to `main`.

**Public data (GitHub Actions, `.github/workflows/deploy.yml`).** The workflow runs every hour. It saves slates, injuries, Kalshi public player prices, NHL projected lineups and line-matchup stats (`scripts/live.mjs`, about a minute), then builds and deploys the site to GitHub Pages. Every morning at 7am Eastern and again at 17:07 UTC it also rebuilds the season archives from nflverse, hoopR and the NHL feed (`scripts/refresh.mjs`). Downloads and archives sit in the Actions cache, so each rebuild fetches only what changed. A push to `main` also deploys.

**Model forecasts (your PC).** The NFL and NBA labs run locally and use private inputs, so they cannot run on GitHub. `publishers/publish_models.bat` runs each lab's own Python, exports the saved forecasts read-only, and commits them to the `model-feeds` branch. It then starts a deploy. When the forecasts haven't changed, it pushes nothing. The site keeps showing the last published forecasts while the PC is off, along with how old they are.

```bat
publishers\publish_models.bat
```

Lab locations default to `Documents\ChatGPT\GOING\research\nfl-ensemble-lab` and `...\NBA ensemble`. Set `GOING_NFL_LAB` or `GOING_NBA_LAB` to override them.

## GOING YARD

GOING YARD shows the Going Yard model from [hr-board](https://github.com/daboli69/hr-board). hr-board keeps its own ETL and schedule (Statcast, MLB StatsAPI, FanGraphs) and publishes `board.json`, `history.json`, `backtest.json` and `odds.json` to its GitHub Pages site. Every hourly GOING run copies those files with `scripts/yard.mjs`, drops the raw per-pitch tables the pages don't use (6 MB down to about 2 MB), and pre-computes the season record. Nothing in the model changes.

Several views (Top Picks, Daily Card, Signal Convergence, Team vs Pitch Mix, Split Overlaps, Edge Finder, Price Research, Alt Line Finder, Parlay Builder, Parlay Scanner, Ladder Challenge, HR Calendar, HR Patterns) run hr-board's own in-browser math. `site/yard-engine.mjs` is generated from hr-board's page by `npm run yard-engine`, which parses that page and copies the functions those views call, and everything they depend on, word for word. It leaves out anything that draws hr-board's own page. Rerun it after changing that math in hr-board. These views load the full board, history and backtest.

Prices you type into the Edge Finder, the Ladder Challenge, the Price Research minimum and the My Bets journal use the same browser storage keys as hr-board's page. My Bets grades each player from the MLB box score once his game is final and never overwrites a mark you set yourself. Backups use hr-board's file format, so either page can restore them. Both live on daboli69.github.io, so the two stay in step.

When the live board has no games (offseason or an off day), the section shows the last slate hr-board published and says so. It switches back on its own once games return. Player photos and team logos come from MLB's image service.

## College dashboards

The hourly Pages workflow refreshes the college sections with `npm run college`. [hoopR](https://github.com/sportsdataverse/hoopR-mbb-data) and [wehoop](https://github.com/sportsdataverse/wehoop-wbb-data) provide basketball team and player box scores. ESPN supplies schedules and scores, plus available FBS game lines. [cfbfastR](https://github.com/sportsdataverse/cfbfastR-cfb-data/blob/main/DATASETS.md) provides FBS pregame EPA, success rates and pace. All use publicly available data and require no credentials. The pages show when the schedule, prices or box scores were checked. Missing quotes and stats appear as dashes.

CBB and CWB provide basketball matchup and player research without betting markets. FBS markets cover full-game moneylines, spreads and totals. The college winner baseline starts with equal Elo ratings each season, updates with completed games, and applies a home-field or home-court adjustment to forecasts at non-neutral sites. Projected scores blend team points scored and opponent points allowed, with both averages pulled toward the league scoring average. Forecasts require three completed games per team. The winner percentages are uncalibrated, and the projected scores and winner ratings can disagree.

Filter Pick Tracker by CBB, CWB or FBS to follow results by tool and market. The FBS spread and total tools also break results out by the size of the projected difference from the line. The tracker freezes the last valid pregame capture, grades by final score, and calculates hypothetical flat-stake ROI only where it captured a price. Canceled games are voided. Missing results stay pending. The record starts at deployment, with no retrospective picks.

```bash
npm run college
node scripts/track.mjs
npm start
```

## Pick Tracker

The Tracker page (`tracker.html`) grades every pick the site makes. Each hourly run (`scripts/track.mjs`) renders the props pages, Best Plays and TD Data with the dashboard's own code. It records every priced line those pages show, plus every model pick (the combined forecast and each individual model). Picks are captured only while their game hasn't started, and the last capture before the start is the one that counts. A line pulled before the game is dropped.

After the game, the pick is graded with the same result functions My Plays uses. Units assume a 1-unit stake at the captured price. A pick with no result after four days (the player didn't play) is voided. Each pick also records whether the tool's own numbers favored that side (edge, projection or average against the line), so the page can show leans only. The page reports hit rate against the break-even rate of those prices, units, ROI, Brier score and calibration, and a head to head of the ensemble models. You can filter by sport, market, date range and tool.

The record is committed to the `tracker` branch, so it survives cache resets. GOING YARD picks (Heat 70+ and Top Plays to homer, hits, H+R+RBI and pitcher strikeouts) are graded from the official MLB box score. Promo tools (King of the Court and the others) rank players rather than pick lines, so they are not graded yet.

## Local preview

Node.js 22 or newer.

```bash
npm run live
```

```bash
npm install
```

```bash
npm start
```

`npm start` serves `site/` at http://localhost:4387 (set `PORT` to change it). `npm run refresh` rebuilds the season archives locally (Python 3 required). `npm run preview` builds `dist/` the way Pages does. `npm test` checks the parsers and model math.

## Layout

- `site/`: the static app. `app.mjs` routes, `home.mjs` is the landing page, `models.mjs` shows the ensemble forecasts, and `nfl.mjs`, `nba.mjs` and `nhl.mjs` are the dashboards.
- `scripts/`: data refresh, hourly snapshot, build and local server.
- `publishers/`: model export and push to `model-feeds`.

Research only. Forecasts and prices are not betting advice, and the public price quotes are not sportsbook consensus.
