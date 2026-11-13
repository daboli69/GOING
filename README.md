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

**GOING UP First Basket Board.** The 1st Basket page ranks every projected starter on the slate with one formula: P(first basket) = P(his team scores first) × P(he scores | his team scores first) (`site/first-basket.mjs`).
- **Team side:** each team's tip rate is shrunk toward 50% (6 wins and 6 losses added) and combined head to head. Possessions then alternate from the tip, each team scoring on a possession at its opening-possession rate against what the opponent allows (both shrunk with 20 possessions of league average). The two teams sum to 100%.
- **Player side:** his share of the team's attempts in its first 8 possessions (field goals and free-throw trips), blended with his first-shot share and shrunk toward usage, times a league-average early make rate. That rate moves only for a real shot-type edge (threes, rim, midrange; his makes and the defense's allowed rate, both shrunk and capped at ±15%), plus free throws. The bench keeps at least 3%.
- **Check:** each game's ten starters should total about 95–100%, and the Model Check flags games outside 90–100%.
- **Price:** type sportsbook prices (Kalshi's First Basket prices fill in if Kalshi lists them). A full board is normalized to remove the vig; a partial one is divided by an assumed hold. A play needs both a minimum edge and a minimum model-to-price ratio.
- **Conviction and reasons:** every starter gets written reasons, each counted for (▲) or against (▼):
  - team first-score
  - early-attempt share and team rank
  - first shots
  - shot-type edge
  - free throws
  - regression
  - sample size
  - injury status
  - slate rank
  - the price check

  The sum is his conviction. Suggested Plays lists everyone whose signals line up (Strong at +5, Lean at +3 with a priced edge or +4 before a price), several per game when the data supports it, each as a separate single. A Why button opens the full reasoning for any row.
- **Regression Watch:** each starter's team-first scores are compared with what his share of early attempts predicts. Well below, with lots of first shots, means positive regression is due; well above means negative regression (a fade candidate). A flag needs a gap of at least 1.5 scores and one standard deviation.
- **Round robin:** the top priced suggestions by edge, several per game allowed. Combinations holding two players from the same game are skipped and counted, since only one can score first.
- **Starters:** projected from each team's last game and the live injury report. Scratch anyone ruled out when lineups post and the board re-runs.
- **Log:** each hourly run saves the board before tip and grades it from the archive's first scorer (`scripts/track-nba-first-basket.mjs`). A backtest replays each past night with only earlier data. Both feed the Calibration Log, which stays rough until 100+ game-nights.

The opening possessions come from the play-by-play (`scripts/normalize.py` keeps each game's first 16 as team, points, shooters, free-throw shooter and scorer, and tags early shots with their possession number).

**GOING LONG Suggested Parlays.** The NBA generator's approach, adapted to football in ten steps (`site/nfl-parlay-engine.mjs`). It covers receiving, rushing and passing yards, receptions, rush and pass attempts, completions, anytime TD and first TD.

1. **Rules.** Leg count, stat types, sides, one leg per game and exclusions, as in GOING UP.
2. **Game screen.** Spread, total and game script (spread blended with the ensemble model's margin). Passing-game Overs are cut outdoors in 15+ mph wind or rain, and a toggle turns that cut off. Domes are noted.
3. **Role edge.** Each player has a role: slot or outside WR, TE, receiving or rushing RB, or QB. The role is matched against what the defense allows per target, carry or dropback to that role, measured in EPA and yards and adjusted for the offenses it has faced. Slot is estimated from middle-of-field targets and depth. Alignment, man versus zone coverage and shadow assignments aren't public, so the engine uses each defense's starting cornerbacks (PFR coverage stats) instead.
4. **Weak defense.** The defense must rank in the weak third against the role, or the strong third for an Under.
5. **Projection.** The line is compared to the last-5 average blended with a usage projection, such as recent targets times yards per target.
6. **Hit rates.** Last-8 hit rate at the exact line, the home or away split and reads. A leg is dropped when its hit rate conflicts with the role edge.
7. **Volume props.** Receptions and attempts use what the defense allows per game to the role. A snap share under 50% over the last three games removes yardage and volume Overs.
8. **Context.**
   - starting QB, offensive line and opposing cornerbacks out
   - teammate-out splits
   - pace and pass rate over expected
   - red-zone share
   - rush yards over expected (Next Gen Stats)
   - rest
   - weather
9. **Build.** One leg per game with a mix of stats. An optional toggle allows correlated same-game stacks, such as a QB Over with his receiver's Over. Opposite sides on the same passing game get a negative-correlation warning.
10. **Price.** Hit rates shrink harder toward 50% than in GOING UP (8 wins and 8 losses added). Touchdown props shrink toward their price instead, and touchdown legs are capped at one by default. Kicking and longest-play props aren't offered.

Questionable players are flagged to re-check after inactives, which post about 90 minutes before kickoff. The page reads ESPN's live injury report when it opens. Every leg shows its quote time and can be locked.

Data for the engine comes from the nflverse play-by-play (with expected pass rate and win probability), snap counts, PFR coverage stats and Next Gen Stats, all stored in `nfl-extra-<season>.json`. Kickoff forecasts come from Open-Meteo (`scripts/weather.mjs`, written each hour to `live/weather-nfl.json`).

**NFL Leg Tracker.** Each hourly run screens every priced NFL prop with the engine, keeps its last pregame quote, and records whether it was selected, eligible or rejected, and why (`scripts/track-nfl-parlays.mjs`). Legs are graded from the nflverse play-by-play, usually the morning after the game. Snap counts mark players who didn't play as void. The page (`long/parlay-tracker.html`) reports:
- results by decision
- each rule's passed, failed and "only this rule failed" records
- breakdowns by role, defense third, projection gap, game script, weather, snap share and injuries
- calibration

The NBA and NFL pages share `parlay-ui.mjs` and `parlay-tracker-ui.mjs`.

**Parlay Leg Tracker.** Each Pages refresh archives the priced NBA legs the builder can match, including available alternate thresholds and both quoted sides. It records every applicable screening rule, the default ticket's selection, and the first and latest pregame observations for each line and side. Final ESPN box scores grade hits, misses, pushes and confirmed DNPs. Missing final results stay pending. Compare rules by hit rate, hypothetical flat-stake ROI, and the subset where only one rule failed. Results start with the first successful capture. Empty quote feeds cannot be backfilled from box scores.

Two sources feed the site, and neither commits data to `main`.

**Public data (GitHub Actions, `.github/workflows/deploy.yml`).** The workflow runs every hour. It saves slates, injuries, Kalshi public player prices, NHL projected lineups and line-matchup stats (`scripts/live.mjs`, about a minute), then builds and deploys the site to GitHub Pages. The first run after 7am Eastern each morning, and the first after 17:00 UTC, also rebuilds the season archives from nflverse, hoopR and the NHL feed (`scripts/refresh.mjs`). Downloads and archives sit in the Actions cache, so each rebuild fetches only what changed. A push to `main` also deploys.

**Model forecasts (your PC).** The NFL and NBA labs run locally and use private inputs, so they cannot run on GitHub. `publishers/publish_models.bat` runs each lab's own Python, exports the saved forecasts read-only, and commits them to the `model-feeds` branch. It then starts a deploy. When the forecasts haven't changed, it pushes nothing. The site keeps showing the last published forecasts while the PC is off, along with how old they are.

```bat
publishers\publish_models.bat
```

**Hourly backstop (your PC).** GitHub's hourly schedule can start late or skip runs. `publishers/refresh_site.py` starts a refresh when no run has started in the last 40 minutes, so it never doubles up. Run this once to make it an hourly Windows scheduled task (at :20, while the PC is on and you are signed in):

```bat
publishers\install_refresh_task.bat
```

It uses the same `gh` login as the model publisher, and `publishers\last_refresh.log` shows what the last run did. To keep the site refreshing while the PC is off, use a free scheduler such as cron-job.org instead. Create a fine-grained GitHub token for this repository with "Actions: read and write" access. Then have the scheduler send `POST https://api.github.com/repos/daboli69/GOING/actions/workflows/deploy.yml/dispatches` every hour, with the headers `Authorization: Bearer <token>` and `Accept: application/vnd.github+json` and the body `{"ref":"main","inputs":{"mode":"live"}}`.

**Feed health.** After each refresh, `scripts/health.mjs` checks how old every feed is: live snapshots, season archives, the college feeds and both trackers. When one is stale, the workflow opens a GitHub issue named "GOING feed health" (GitHub emails you), comments when the list of stale feeds changes, and closes the issue once everything is fresh again. The site keeps showing the last good data in the meantime. Tests run before every deploy, so a push that breaks them never reaches the site.

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

## In the browser

- **Live scores.** While a page is open and visible, games that are under way or about to start get their score and status from ESPN's public scoreboard once a minute (`site/live-scores.mjs`). This covers the NBA, NHL, NFL and college slates. The hourly snapshot fills in everything else.
- **Offline.** `site/sw.js` saves each page, its code and its data as you open them. Offline, those pages still open with the data last seen on that device. The build stamps the worker with the code version, so a deploy replaces the saved code.
- **Loading.** Each section's code loads only when one of its pages opens, and every page preloads its own section. Team logos and NFL and NBA player photos are requested at the size shown. The fonts are self-hosted (`site/fonts`, SIL Open Font License).
- **Backups.** My Plays has Back up and Restore. A backup file holds everything GOING saved in that browser. Restoring adds the file's plays to the ones already there and fills in settings only where the browser has none.

## Layout

- `site/`: the static app. `app.mjs` routes, `home.mjs` is the landing page, `models.mjs` shows the ensemble forecasts, and `nfl.mjs`, `nba.mjs` and `nhl.mjs` are the dashboards. `live-scores.mjs` updates games in progress, and `sw.js` is the offline worker.
- `scripts/`: data refresh, hourly snapshot, feed health check, build and local server.
- `publishers/`: model export and push to `model-feeds`, and the hourly refresh backstop.

Research only. Forecasts and prices are not betting advice, and the public price quotes are not sportsbook consensus.
