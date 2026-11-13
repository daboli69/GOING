# GOING

One site for the ensemble models and the sports dashboards. [GOING Playbook](https://goingplaybook.com/)

| Section | Sport | What is in it |
| --- | --- | --- |
| GOING UP | Basketball (NBA) | Ensemble forecasts, matchup tools, prop research, shot charts, King of the Court |
| GOING LONG | Football (NFL) | Ensemble forecasts, game previews, TD data, opening drives, props, King of the Endzone |
| GOING GOAL | Hockey (NHL) | Game previews, line matchups, props, crease, icebreaker and hat-trick promos |
| GOING YARD | Baseball (MLB) | The Going Yard home run model: HR Board, Top Plays, Top Picks, Daily Card, Signal Convergence, Game Scan, pitchers and bullpens, Team vs Pitch Mix, Split Overlaps, target teams, weather and parks, hits and H+R+RBI, King of the Bases, strikeouts, game totals, Edge Finder, Price Research, Alt Line Finder, parlays and jackpots, Parlay Builder, Parlay Scanner, Ladder Challenge, Model Record, HR Calendar, HR Patterns, My Bets, CLV, Guide |

Each section uses its own accent color: orange for basketball, green for football, blue for hockey and red for baseball. Everything else (type, boards, heat cells, charts) is the sports dash design.

## How the data stays current

GitHub Actions publishes the static snapshots. The optional Cloudflare Worker serves fresh data from public feeds and the model branch.

**Public data (GitHub Actions, `.github/workflows/deploy.yml`).** At :07 each hour the workflow saves slates, injuries, Kalshi prices, NHL projected lineups and line-matchup stats, then deploys GitHub Pages. At :22, :37 and :52 it refreshes prices and line-matchup stats on the last complete snapshot and deploys Pages. Twice a day (09:07 and 17:07 UTC) it also rebuilds the season archives. A push to `main` also deploys. GitHub's scheduled runs and Pages caching can add delay to snapshot updates.

**Model forecasts (your PC).** The NFL and NBA labs run locally with their private inputs. `publishers/publish_models.bat` exports the saved forecasts and pushes the three JSON feeds to `model-feeds` only when forecast content changes. Timestamp-only changes are ignored. The publisher starts a Pages deploy if production `LIVE_API` is empty. The site keeps showing the last published forecasts while the PC is off.

```bat
publishers\publish_models.bat
```

Lab locations default to `Documents\ChatGPT\GOING\research\nfl-ensemble-lab` and `...\NBA ensemble`. Set `GOING_NFL_LAB` or `GOING_NBA_LAB` to override them.

## Live Worker

`going-live` runs on Workers Free with no cron or KV. It serves ESPN scores (30 s), NBA and NHL slates and GitHub model feeds (60 s), and injuries and NHL projected lineups (600 s). NFL injuries come from the compact hourly Pages snapshot because the raw ESPN payload exceeds the CPU budget. Kalshi player prices and NHL line-matchup stats stay on Pages.

The Cache API keeps a last good copy per Cloudflare location and route key. Requests get `X-Going-Cache: STALE` if a refresh fails and a previous copy is available. Cache entries can be evicted, and independent Cloudflare locations can each fetch their own copy. `/health` reports the latest observed status, cache result, and timestamps for each route family in the current location. A null entry means there is no observation in that location.

The browser gives the Worker three seconds, then silently uses the existing Pages snapshots on failure or when `LIVE_API` is empty. Visible tabs check game data used by the view each minute around game time. The landing page uses slate counts and the model summary. Model cache entries become eligible for refresh at minute boundaries. Model views and the landing page poll just after every second boundary so a successful publish normally reaches an open tab within about two minutes.

**Free plan.** Cloudflare still lists 100,000 requests per day, 10 ms of CPU per invocation, and 50 subrequests per invocation. The busiest landing page polls at most four live endpoints per minute plus one model request every two minutes. At 100 ten-minute visits per day, five initial calls plus 40 live calls and five model calls per visit give an upper estimate of **5,000 requests/day**, excluding other Workers on the same account and direct API traffic. Cache hits still count. [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) · [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)

### Deploy from GitHub

1. Sign in to your existing Cloudflare account or create a free account. In **Workers & Pages**, keep the Workers plan on **Free** and set up your `workers.dev` subdomain. Copy the account ID from **Account home → ⋯ → Copy account ID**. [Account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/) · [workers.dev setup](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
2. In Cloudflare, go to **My Profile → API Tokens → Create Token → Create Custom Token**. Grant **Account → Workers Scripts → Edit** for that specific account. This covers scripts, deployments, secrets and the existing `workers.dev` subdomain. The workflow passes the account ID explicitly and uses no zone routes or storage permissions. [Cloudflare API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) · [Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/)
3. In GitHub, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Choose resource owner `daboli69`, **Only select repositories → GOING**, and **Repository permissions → Contents → Read-only**. GitHub includes Metadata read access. [Fine-grained tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
4. In **GOING → Settings → Secrets and variables → Actions → New repository secret**, add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `MODEL_FEEDS_TOKEN`. The last secret is the fine-grained GitHub token and becomes `GITHUB_TOKEN` in the Worker. GitHub reserves names starting with `GITHUB_`. [GitHub secret naming](https://docs.github.com/en/actions/reference/security/secrets#naming-your-secrets)
5. Merge the Worker PR, or run **Actions → Deploy going-live Worker → Run workflow** from `main` after the workflow is present there. Copy the HTTPS URL from the run summary. Check `/health` and `/models/summary`, then set `LIVE_API` in `site/config.mjs` to that URL and push the config change to `main` for Pages to deploy.

### Local preview and verification

In `worker/`, run `npx wrangler dev`. For model testing in your local runtime, set `GITHUB_TOKEN` in the shell and set `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` before starting Wrangler. From the repo root run `npm start`, and for local preview only set `LIVE_API` to `http://localhost:8787`. Run `npm test` for the route and cache tests.

Local Wrangler profiling exercised cold and warm requests for every enabled route with live upstream payloads. All returned HTTP 200 and the warm data requests hit the cache. The largest sampled JavaScript estimate was about 1.7 ms. Check production invocation CPU as well, since local sampling and Cloudflare's CPU accounting differ. Parsing and scanning only the first page of each NFL Kalshi series took about 24–36 ms locally, before pagination or quote processing.

- [ ] Open the deployed Worker at `/health` and confirm HTTP 200 and `ok: true`. Request a few data routes first and confirm their status and timestamps appear.
- [ ] Open GOING, GOING LONG, GOING UP, GOING GOAL and GOING YARD with the Worker URL set. Repeat locally with `LIVE_API=''`, then with the Worker stopped.
- [ ] During a live NFL, NBA or NHL game, keep its page visible and confirm the score changes without reloading. Keep a game selected or a search focused while it updates. Hide the tab and confirm polling pauses.
- [ ] When a forecast has changed, run the publisher on the PC. Confirm it pushed to `model-feeds`, `/models/nfl` or `/models/nba` picks up its `generated_at` within about a minute, and the open site updates on its next eligible poll. If the publisher reports no changes, repeat this check after the lab generates a changed forecast.
- [ ] In **Workers & Pages → going-live → Observability → Logs**, check cold and warm requests for each route and compare the invocation CPU time with 10 ms. `npx wrangler tail` can also show invocation failures. [Cloudflare CPU timing](https://developers.cloudflare.com/changelog/post/2025-04-09-workers-timing/)

### Change the Windows publish interval

Open **Task Scheduler → Task Scheduler Library → GOING model publish → Properties → Triggers**. Select the existing trigger and click **Edit**. Under **Advanced settings**, enable **Repeat task every** and type **10 minutes** in the interval box. Keep the existing duration, start time, and task action. Save both dialogs and confirm the next run time. [Windows task repetition](https://learn.microsoft.com/en-us/windows/win32/taskschd/repeating-a-task)

## GOING YARD

GOING YARD shows the Going Yard model from [hr-board](https://github.com/daboli69/hr-board). hr-board keeps its own ETL and schedule (Statcast, MLB StatsAPI, FanGraphs) and publishes `board.json`, `history.json`, `backtest.json` and `odds.json` to its GitHub Pages site. Every hourly GOING run copies those files with `scripts/yard.mjs`, drops the raw per-pitch tables the pages don't use (6 MB down to about 2 MB), and pre-computes the season record. Nothing in the model changes.

Several views (Top Picks, Daily Card, Signal Convergence, Team vs Pitch Mix, Split Overlaps, Edge Finder, Price Research, Alt Line Finder, Parlay Builder, Parlay Scanner, Ladder Challenge, HR Calendar, HR Patterns) run hr-board's own in-browser math. `site/yard-engine.mjs` is generated from hr-board's page by `npm run yard-engine`, which parses that page and copies the functions those views call, and everything they depend on, word for word. It leaves out anything that draws hr-board's own page. Rerun it after changing that math in hr-board. These views load the full board, history and backtest.

Prices you type into the Edge Finder, the Ladder Challenge, the Price Research minimum and the My Bets journal are saved in your browser for goingplaybook.com. My Bets grades each player from the MLB box score once his game is final and never overwrites a mark you set yourself. Backups use hr-board's file format, so either page can restore them. To bring over journal entries saved under daboli69.github.io, export a backup from hr-board and import it on GOING Playbook.

When the live board has no games (offseason or an off day), the section shows the last slate hr-board published and says so. It switches back on its own once games return. Player photos and team logos come from MLB's image service.

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
