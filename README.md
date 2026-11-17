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
| GOING FIGHTS | Mixed martial arts (UFC) | Fight cards, Tale of the Tape, fighter stats, moneylines and round totals |
| GOING YARD | Baseball (MLB) | The Going Yard home run model: HR Board, Top Plays, Top Picks, Daily Card, Signal Convergence, Game Scan, pitchers and bullpens, Team vs Pitch Mix, Split Overlaps, target teams, weather and parks, hits and H+R+RBI, King of the Bases, strikeouts, game totals, Edge Finder, Price Research, Alt Line Finder, parlays and jackpots, Parlay Builder, Parlay Scanner, Ladder Challenge, Model Record, HR Calendar, HR Patterns, My Bets, CLV, Guide |

Each section uses its own accent color and the same dashboard typography, boards and charts.

## How the data stays current

**Market Watch.** Available in GOING UP, LONG, GOAL, YARD, CBB, CWB and FBS. Compare sportsbook moneylines, spreads and totals from ESPN with winner prices from Kalshi, Polymarket and Polymarket US. The NBA and NFL pages also show their published ensemble forecasts where available. The college pages use GOING’s published matchup forecasts, and GOING YARD uses its game winner forecast when it matches the matchup and first pitch. GOING FIGHTS has its own bout-level Fight Lines and ensemble pages. Sportsbook win chances remove the vig. Exchange prices are listed by venue. The scheduled Pages workflow runs the pinned Sports Leader MCP server over local stdio in a read-only job. The browser reads the published JSON and shows when each source was captured. Delayed sportsbook snapshots stop contributing to the forecast comparison after 45 minutes. Started games drop off the board at kickoff. No keys, VPS, or AI subscription are needed.

To capture Market Watch locally, clone [Sports Leader MCP](https://github.com/WalrusQuant/sports-leader-mcp) at the commit in `deploy.yml`, run `npm ci --ignore-scripts` and `npm run build` there, then point `SPORTS_LEADER_MCP` at its checkout and run `node scripts/market-watch.mjs` from GOING. The captured files go in `site/data/market-watch/`.

**GOING UP Suggested Parlays.** The builder uses the existing NBA archives, ESPN game lines and injury reports, and captured DraftKings main player lines. Qualifying legs are ranked by estimated hit chance. DraftKings prices are shown for the exact threshold. It can return a shorter ticket or no ticket when the available data and filters leave too few eligible legs. Combined odds multiply the individual quotes. The adjusted chance uses season win counts plus five wins and five losses per leg before multiplying, with no same-game correlation adjustment. The page checks published prices and injuries about every three minutes while visible and reranks an existing draft as inputs move. Generated tickets and filter settings are stored in this browser. Saved legs grade automatically against the exact saved line using the final ESPN box score. Confirmed nonparticipants and canceled games are void. Missing final data stays pending.

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
- **Log:** each refresh run saves the board before tip and grades it from the archive's first scorer (`scripts/track-nba-first-basket.mjs`). A backtest replays each past night with only earlier data. Both feed the Calibration Log, which stays rough until 100+ game-nights.

The opening possessions come from the play-by-play (`scripts/normalize.py` keeps each game's first 16 as team, points, shooters, free-throw shooter and scorer, and tags early shots with their possession number).

**GOING LONG TD Board.** Under Props (`long/td-board.html`), for anytime and first touchdown. Expected TDs come from opportunity, not past TD counts (`site/nfl-td.mjs`).
- **Opportunity:** every carry and target counts at the league's TD rate for where it happened. This season a carry at the 1–2 scores 48% of the time, at the 3–5 29%, at the 6–10 11%. An end-zone target scores 42%, a target inside the 10 23%, a touch outside the 20 about 1%.
- **Team TDs:** (implied points − two field goals) ÷ 7, from the total and spread, split between rushing and receiving by the team's TD split (shrunk to league), the game script and weather. A player's share is half his red-zone opportunity share and half his share of the team's carries and targets, flattened slightly. The weights come from the backtest, where pure red-zone shares were overconfident at the top. Missing teammates drop out and the rest renormalize.
- **Matchup:** each defense's TD opportunity allowed to RBs, WRs, TEs and QBs, adjusted for the offenses it faced, and its red-zone TD rate allowed.
- **Probabilities:** anytime is P = 1 − e^(−expected TDs). First TD is P(team scores the first TD) × P(he scores it | team does). The team side comes from who receives the opening kickoff (each team's history, shrunk to 50%, or set per game), opening-drive and per-drive TD rates against the defense, and a share left for defense and special-teams TDs, which Kalshi counts. The player side weighs his expected TDs and his share of the team's opening-drive touches.
- **Prices:** typed sportsbook prices have the hold removed. Kalshi asks are exchange prices used as they stand (two-sided quotes normalized), and a first-TD field is normalized per game. Gaps over 12 points are flagged to confirm the player's role.
- **Toggles:** market, position, odds range, minimum edge, minimum red-zone and snap share, spread and total limits, weather (any, no wind or rain, dome only), excluding questionable players, due for a TD, whether D/ST TDs count, legs, one per game, and a QB-with-receiver stack.
- **Output:** picks come with written reasons, a TD Regression Watch (actual against expected TDs), a model check, and a calibration log. Each refresh run saves the board before kickoff and grades it from a reconciled ESPN final scoring summary or the archived play-by-play. A backtest replays earlier weeks (`scripts/track-nfl-td.mjs`).

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

Suggested Parlays checks ESPN injuries and the latest published prices while the tab is visible, about every three minutes on game day and every ten minutes otherwise. It also reads ESPN's game-specific inactive entries near kickoff. The suggested draft reranks when inputs or filters change and when you check manually. It removes legs that stop qualifying, including locked legs with unavailable players. The injury-adjusted projection table shows the available lines and screening decisions. For a workload change with enough verified prior games without the same teammates, the engine uses those games for hit rates, reads and snap share. The NFL Leg Tracker captures which sample the engine used.

The injury-adjusted projection assigns 75% of meaningful vacated volume to available players at the same position. It uses the last five team games and expected opportunities to estimate each replacement's share, then applies historical efficiency for yards or receptions. Supported raw-stat projections from RotoWire via Sleeper are an additional input, weighted at 25% normally and 65% in a detected replacement situation if the projection is newer than the relevant injury report. Missing or older external estimates leave the local workload estimate available. The page shows the historical baseline, adjusted estimate and source estimate side by side. Hit rates still describe observed results. The TD Board uses current availability with its touchdown opportunity model.

Data for the engine comes from the nflverse play-by-play (with expected pass rate and win probability), snap counts, PFR coverage stats and Next Gen Stats, all stored in `nfl-extra-<season>.json`. Kickoff forecasts come from Open-Meteo (`scripts/weather.mjs`, written on refresh to `live/weather-nfl.json`).

**GOING LONG Same-Game Parlays.** Choose a matchup under Same-Game Parlays or open it from Game Previews. The generator screens that game's priced Overs and Unders using the NFL parlay inputs, including role defense, recent and season form, injuries and usage, weather, game script and the ensemble forecast when available. Similar-defense records use yards allowed, run or pass volume, target share and explosive-run or deep-target rate, with each profile built from games played before the relevant matchup. A short sample is labeled and does not count as separate matchup evidence. The builder prefers full qualifying tickets, allows at most one leg per player, and blocks directly opposed QB and receiver legs. The page displays individual quotes, and saved SGP tickets and their results use separate browser storage from Suggested Parlays and the main NFL Leg Tracker.

**NFL Leg Tracker.** Each refresh run screens every priced NFL prop with the engine, keeps its last pregame quote, and records whether it was selected, eligible or rejected, and why (`scripts/track-nfl-parlays.mjs`). Yardage and volume markets can settle from ESPN’s final box score as soon as the next refresh. NFL touchdown legs use the finalized Kalshi contract when available, with nonbinary outcomes recorded as void in simulated performance. The play-by-play and snap counts cover cases without an exchange settlement. The page (`long/parlay-tracker.html`) reports:
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

**Hourly backstop (your PC).** GitHub checks for updates every 15 minutes and can delay or skip scheduled runs. A failed Pages deploy gets one retry. Previous live snapshots back up failed sources, with their original quote times. `publishers/refresh_site.py` starts a refresh if no run is active and none succeeded in the last 40 minutes. Run this once to make it an hourly Windows scheduled task (at :20, while the PC is on and you are signed in):

```bat
publishers\install_refresh_task.bat
```

It uses the same `gh` login as the model publisher, and `publishers\last_refresh.log` shows what the last run did. To keep the site refreshing while the PC is off, use a free scheduler such as cron-job.org instead. Create a fine-grained GitHub token for this repository with "Actions: read and write" access. Then have the scheduler send `POST https://api.github.com/repos/daboli69/GOING/actions/workflows/deploy.yml/dispatches` every hour, with the headers `Authorization: Bearer <token>` and `Accept: application/vnd.github+json` and the body `{"ref":"main","inputs":{"mode":"live"}}`.

**Delivery recovery.** The Check published GOING workflow reads the public snapshot on its own schedule and after deployments. If the live snapshot is unavailable or at least 35 minutes old, it opens one delivery issue and requests a live refresh. Recovery waits for active deployments and has a 45-minute cooldown. The issue closes when the public snapshot recovers. This check uses GitHub Actions, so an external timer is still needed to cover a complete Actions scheduling failure.

Each deployment verifies the built routes and versioned assets, required tracker data, and published timestamps before uploading to Pages. It also restores the last public ensemble feeds if fetching the model branch fails.

**Feed health.** After each refresh, `scripts/health.mjs` checks how old every feed is: live snapshots, season archives, the college feeds and both trackers. It also reports a grading backlog when confirmed final games remain ungraded. When a problem is found, the workflow opens a GitHub issue named "GOING feed health" (GitHub emails you), comments when the list of stale feeds changes, and closes the issue once everything is fresh again. The site keeps showing the last good data in the meantime. The home page reports when the live snapshot is over 30 minutes old or a refresh reported missing feeds. Tests run before every deploy, so a push that breaks them never reaches the site.

Lab locations default to `Documents\ChatGPT\GOING\research\nfl-ensemble-lab` and `...\NBA ensemble`. Set `GOING_NFL_LAB` or `GOING_NBA_LAB` to override them.

## GOING YARD

GOING YARD shows the Going Yard model from [hr-board](https://github.com/daboli69/hr-board). hr-board keeps its own ETL and schedule (Statcast, MLB StatsAPI, FanGraphs) and publishes `board.json`, `history.json`, `backtest.json` and `odds.json` to its GitHub Pages site. Every GOING refresh copies those files with `scripts/yard.mjs`, drops the raw per-pitch tables the pages don't use (6 MB down to about 2 MB), and pre-computes the season record. Nothing in the model changes.

Several views (Top Picks, Daily Card, Signal Convergence, Team vs Pitch Mix, Split Overlaps, Edge Finder, Price Research, Alt Line Finder, Parlay Builder, Parlay Scanner, Ladder Challenge, HR Calendar, HR Patterns) run hr-board's own in-browser math. `site/yard-engine.mjs` is generated from hr-board's page by `npm run yard-engine`, which parses that page and copies the functions those views call, and everything they depend on, word for word. It leaves out anything that draws hr-board's own page. Rerun it after changing that math in hr-board. These views load the full board, history and backtest.

Prices you type into the Edge Finder, the Ladder Challenge, the Price Research minimum and the My Bets journal use the same browser storage keys as hr-board's page. My Bets grades each player from the MLB box score once his game is final and never overwrites a mark you set yourself. Backups use hr-board's file format, so either page can restore them. Both live on daboli69.github.io, so the two stay in step.

When the live board has no games (offseason or an off day), the section shows the last slate hr-board published and says so. It switches back on its own once games return. Player photos and team logos come from MLB's image service.

## College dashboards

The Pages refresh workflow refreshes the college sections with `npm run college`. [hoopR](https://github.com/sportsdataverse/hoopR-mbb-data) and [wehoop](https://github.com/sportsdataverse/wehoop-wbb-data) provide basketball team and player box scores. ESPN supplies schedules and scores, plus available FBS game lines. [cfbfastR](https://github.com/sportsdataverse/cfbfastR-cfb-data/blob/main/DATASETS.md) provides FBS pregame EPA, success rates and pace. All use publicly available data and require no credentials. The pages show when the schedule, prices or box scores were checked. Missing quotes and stats appear as dashes.

CBB and CWB provide basketball matchup and player research without betting markets. FBS markets cover full-game moneylines, spreads and totals. The college winner baseline starts with equal Elo ratings each season, updates with completed games, and applies a home-field or home-court adjustment to forecasts at non-neutral sites. Projected scores blend team points scored and opponent points allowed, with both averages pulled toward the league scoring average. Forecasts require three completed games per team. The winner percentages are uncalibrated, and the projected scores and winner ratings can disagree.

Filter Pick Tracker by CBB, CWB or FBS to follow results by tool and market. The FBS spread and total tools also break results out by the size of the projected difference from the line. The tracker freezes the last valid pregame capture, grades by final score, and calculates hypothetical flat-stake ROI only where it captured a price. Canceled games are voided. Missing results stay pending. The record starts at deployment, with no retrospective picks.

```bash
npm run college
node scripts/track.mjs
npm start
```

## GOING FIGHTS

The Pages refresh workflow publishes [ESPN UFC](https://www.espn.com/mma/) cards, results, fighter profiles and available moneylines and round totals. The fight card lists outcomes for recent events and shows scheduled bouts for upcoming cards. Tale of the Tape compares fighter attributes, career stats and the last five bouts in the archive. The feed excludes Contender Series and Road to UFC cards.

Ensemble Forecasts combines four regularized logistic models. Rating and form use Elo, recent results relative to opponent strength, experience, layoffs, and prior meetings. The striking model compares strike volume, accuracy, absorption and knockdowns. The grappling model compares takedowns against opponent defense, control and submission attempts. The similar-opponent model measures prior results against fighters with similar striking pace, takedown volume, clinch and ground striking share, and submission attempts. Small samples are shrunk and unpublished components carry no weight.

Historical bout statistics come from the pinned [UFC Stats archive compiled by UFC DataLab](https://github.com/komaksym/UFC-DataLab/tree/8524e139a08384cff001c222db3b173e2a7a3776), with newer completed bouts filled from [ESPN FightCenter](https://www.espn.com/mma/). Each forecast uses stats and results from cards that finished earlier. Book prices are displayed separately. Fighters need three graded UFC bouts each, and the raw Elo baseline remains available when style stats are thin. The backtest refits each test year on earlier years and scores Elo on the same bouts.

Pick Tracker captures the ensemble and Elo forecasts before the card starts, grades them by ESPN results, and counts hypothetical ROI where it captured a matching moneyline. Draws push, no contests and canceled bouts are void, and missing outcomes stay pending. Live ensemble tracking starts at deployment. Round totals are displayed for research.

For a local preview, run `npm run fights`, `node scripts/track.mjs`, and `npm start`.

## Pick Tracker

The Tracker page (`tracker.html`) grades every pick the site makes. Each refresh run (`scripts/track.mjs`) renders the props pages, Best Plays and TD Data with the dashboard's own code. It records every priced line those pages show, plus every model pick (the combined forecast and each individual model). Picks are captured only while their game hasn't started, and the last capture before the start is the one that counts. A line pulled before the game is dropped once the feed reports a complete refresh. NHL prop grades can use official final box scores, with verified nonparticipants marked void.

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

- **Live scores.** While a page is open and visible, games that are under way or about to start get their score and status from ESPN's public scoreboard once a minute (`site/live-scores.mjs`). This covers the NBA, NHL, NFL and college slates. The published snapshot fills in everything else.
- **Offline.** `site/sw.js` saves each page, its code and its data as you open them. Offline, those pages still open with the data last seen on that device. The build stamps the worker with the code version, so a deploy replaces the saved code.
- **Loading.** Each section's code loads only when one of its pages opens, and every page preloads its own section. Team logos and NFL and NBA player photos are requested at the size shown. The fonts are self-hosted (`site/fonts`, SIL Open Font License).
- **Backups.** My Plays has Back up and Restore. A backup file holds everything GOING saved in that browser. Restoring adds the file's plays to the ones already there and fills in settings only where the browser has none.

## Layout

- `site/`: the static app. `app.mjs` routes, `home.mjs` is the landing page, `models.mjs` shows the ensemble forecasts, and `nfl.mjs`, `nba.mjs` and `nhl.mjs` are the dashboards. `live-scores.mjs` updates games in progress, and `sw.js` is the offline worker.
- `scripts/`: data refresh, live snapshot, feed health check, build and local server.
- `publishers/`: model export and push to `model-feeds`, and the hourly refresh backstop.

Research only. Forecasts and prices are not betting advice, and the public price quotes are not sportsbook consensus.
