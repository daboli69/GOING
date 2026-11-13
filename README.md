# GOING

One site for the ensemble models and the sports dashboards.

| Section | Sport | What is in it |
| --- | --- | --- |
| GOING UP | Basketball (NBA) | Ensemble forecasts, matchup tools, prop research, shot charts, King of the Court |
| GOING LONG | Football (NFL) | Ensemble forecasts, game previews, TD data, opening drives, props, King of the Endzone |
| GOING GOAL | Hockey (NHL) | Game previews, line matchups, props, crease, icebreaker and hat-trick promos |
| GOING YARD | Baseball (MLB) | Not built yet |

Each section uses its own accent color: orange for basketball, green for football, blue for hockey and red for baseball. Everything else (type, boards, heat cells, charts) is the sports dash design.

## How the data stays current

Two sources feed the site, and neither commits data to `main`.

**Public data (GitHub Actions, `.github/workflows/deploy.yml`).** The workflow runs every hour. It saves slates, injuries, Kalshi public player prices, NHL projected lineups and line-matchup stats (`scripts/live.mjs`, about a minute), then builds and deploys the site to GitHub Pages. Twice a day (09:07 and 17:07 UTC) it also rebuilds the season archives from nflverse, hoopR and the NHL feed (`scripts/refresh.mjs`). Downloads and archives sit in the Actions cache, so each rebuild fetches only what changed. A push to `main` also deploys.

**Model forecasts (your PC).** The NFL and NBA labs run locally and use private inputs, so they cannot run on GitHub. `publishers/publish_models.bat` runs each lab's own Python, exports the saved forecasts read-only, and commits them to the `model-feeds` branch. It then starts a deploy. When the forecasts haven't changed, it pushes nothing. The site keeps showing the last published forecasts while the PC is off, along with how old they are.

```bat
publishers\publish_models.bat
```

Lab locations default to `Documents\ChatGPT\GOING\research\nfl-ensemble-lab` and `...\NBA ensemble`. Set `GOING_NFL_LAB` or `GOING_NBA_LAB` to override them.

## Pick Tracker

The Tracker page (`tracker.html`) grades every pick the site makes. Each hourly run (`scripts/track.mjs`) renders the props pages, Best Plays and TD Data with the dashboard's own code. It records every priced line those pages show, plus every model pick (the combined forecast and each individual model). Picks are captured only while their game hasn't started, and the last capture before the start is the one that counts. A line pulled before the game is dropped.

After the game, the pick is graded with the same result functions My Plays uses. Units assume a 1-unit stake at the captured price. A pick with no result after four days (the player didn't play) is voided. Each pick also records whether the tool's own numbers favored that side (edge, projection or average against the line), so the page can show leans only. The page reports hit rate against the break-even rate of those prices, units, ROI, Brier score and calibration, and a head to head of the ensemble models. You can filter by sport, market, date range and tool.

The record is committed to the `tracker` branch, so it survives cache resets. Promo tools (King of the Court and the others) rank players rather than pick lines, so they are not graded yet.

## Local preview

Node.js 22 or newer.

```bash
npm run live
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
