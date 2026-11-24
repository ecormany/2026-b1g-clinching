# Plan: live results ("as it stands")

## Where things stand today
The app doesn't follow results. It's a static page: game winners only change when someone clicks one (or opens a `#p=` link), and the lines in `data.js` were typed in by hand. Nothing loads after the page opens except D3 and fonts.

## Goal
1. **As it stands** (the default once any game kicks off): final results are locked in, live games show score, clock and who has the ball, and the page answers two questions: *who's in if every game ended right now?* and *what are the chances now?*
2. **Before kickoff**: one click goes back to the full slate (all 1,024 combinations, pregame lines), which is the app as it is today.
3. Your own picks still work in both views, for "what if" on top of the real results.
4. If the feed fails, the page still works and looks the same as today.

## Data source
**Main source: ESPN's public scoreboard JSON.** It needs no key, sends `Access-Control-Allow-Origin: *` with a 10-second cache, and `scripts/tiebreak.py` already uses it. I checked it today (Nov. 24), and it returns all nine week-13 games:

```
https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=5&week=13&dates=2026&seasontype=2&limit=100
```

| Need | Field (`events[].competitions[0]`) |
|---|---|
| State | `status.type.state`: `pre` / `in` / `post`, plus `status.type.completed` |
| Score | `competitors[].score`, `competitors[].homeAway` |
| Clock | `status.displayClock`, `status.period`, `status.type.shortDetail` ("Q3 4:12", "Halftime", "Final/OT") |
| Ball / field position | `situation.possession`, `situation.downDistanceText` (only during the game) |
| Live win chance | `situation.lastPlay.probability.homeWinPercentage` (to check on Friday). Backup: last entry of `winprobability[]` from `summary?event={id}` |
| Pregame chance | `odds[0].details` / `spread` (DraftKings), or `summary?event={id}` → `predictor.gameProjection` (ESPN FPI) |

The ESPN event IDs are fixed, so pin them in `data.js` instead of matching team names:

| Game | ESPN id | Abbreviations that differ from ours |
|---|---|---|
| NEB-IOWA | 401858536 | |
| MINN-WIS | 401858544 | |
| MICH-OSU | 401858540 | |
| ILL-NW | 401858537 | `NU` → NW |
| USC-UCLA | 401858543 | |
| PSU-MD | 401858539 | |
| MSU-RUT | 401858542 | `RUTG` → RUT |
| PUR-IND | 401858538 | `IU` → IND |
| WASH-ORE | 401858541 | |

**Fallback:** the open NCAA scoreboard proxy (`ncaa-api.henrygd.me/scoreboard/football/fbs/2026/13/all-conf`), which wraps ncaa.com's data. It has scores and clock but no win chances. Use it only if ESPN fails twice in a row. CollegeFootballData is better data, but it needs an API key, so the browser can't call it without a server. Skip it.

**Hosting choice:** call ESPN straight from the browser. CORS is open, so no server is needed. A small Vercel function (`/api/scoreboard`, `s-maxage=15`) is worth adding only if ESPN starts blocking browser requests. Visitors would share one cached request, and it would hide ESPN's field names behind our own format. Optional; not needed before Friday.

## Design

### New module `live.js`
- `fetchSlate()` gets the scoreboard and returns one entry per game ID:
  `{ id, state: "pre"|"in"|"post", winner?, away:{code,score}, home:{code,score}, clock, period, detail, possession, pHome }`.
  Abbreviations are converted through the table above, and `winner` is set only when `completed` is true.
- **Polling:** every 60 s while any game is `in`, or within 10 min of kickoff. Every 5 min otherwise. Stop once all nine are `post`. Pause while the tab is hidden (`visibilitychange`) and fetch right away when it comes back. After an error, wait twice as long before retrying, up to 2 min.
- Keep a `lastUpdated` time. If the data is older than 2 min while games are live, show "Scores may be out of date".

### State: three layers, kept apart
```
results  = finals from the feed       // { "NEB-IOWA": "IOWA", ... }  never edited by the user
live     = in-progress snapshot       // score, clock, pHome per game
picks    = the user's clicks          // as today
view     = "live" | "pre"             // hash param v=
```
- **Before kickoff view:** the tree uses `picks` only and the odds use pregame spreads. This is exactly today's app.
- **As it stands view:** the tree uses `{ ...picks, ...results }`, so a final can't be overridden. If a game goes final the other way from a user's pick, the final wins in this view, the pick stays in the before-kickoff view, and a small note says "Your pick for X was overridden by the final".
- **Clear all picks** clears `picks` only. Finals stay.

### What "as it stands" shows
- **Headline:** "If every game ended now: **A vs. B**". This is the leaf you reach by treating every current leader as the winner. Tied games count as undecided, so the line may read "A vs. B or C". Once enough games are final to settle it, switch to the existing "Title game set" card.
- **Tree:** finals prune it the same way picks do today. In-progress games are not pruned. Instead, the "ended now" path is highlighted with the same ribbon style `drawRibbons` uses for a focused team, so the tree shows how close it is to changing. If the user has focused a team, that highlight comes first.
- **Team cards:** chances use live win chances. `weight()` takes a per-game chance array instead of the fixed `VAR_PROB`: 1 or 0 for finals, `pHome` for live games, pregame spread for games not yet started. (A ▲/▼ change-since-kickoff marker was tried and dropped on Nov. 24: it read as confusing.)
- **Game buttons** (`renderGames`): the score goes in each team's button, with a status line in place of the time and TV text ("Q3 4:12 · CBS", "Halftime", "FINAL"). The leader gets a tint. Finals use a locked style and can't be clicked in live view. Live games stay clickable for "what if".

### Switching views
Add a segmented control beside the title: **As it stands · Before kickoff**, in the same style as the existing "Order games by" toggle. Use hash `v=live` / `v=pre` so links keep their view. If there's no hash, open "As it stands" once any game has started, and "Before kickoff" before that (the two look the same then anyway, so the toggle stays hidden until the first kickoff).

### Keep the tree calm
Re-rendering every minute would re-run the 750 ms animations. So:
- Score, clock or win-chance changes update text and card percentages only (`renderGames` + `renderTeams(false)`).
- A tree animation runs only when the result set changes (a new final) or when the "ended now" leaf changes (a lead change in a game that matters there).

### SportSource tiebreaker
It isn't a game and isn't in any feed, so it stays a manual pick in both views. It only matters on one narrow branch, so show it as "unknown" unless picked. Add a note in `data.js` to update it by hand if the league publishes it.

## Code changes
| File | Change |
|---|---|
| `data.js` | Add `espn` id to each game, plus the abbreviation map |
| `engine.js` | `weight(outcome, probs)` takes a chance array, and add a `leaderOutcome(live)` helper |
| `live.js` (new) | Fetch, convert, poll, fallback |
| `app.js` | `results` / `view` state, hash `v=`, view toggle, live game buttons, headline, ribbon for the "ended now" path, calmer re-renders |
| `index.html` / `styles.css` | View toggle, score/status styles, stale-data notice, `connect-src` not needed (no CSP today) |
| `scripts/fixtures/` (new) | Saved scoreboard JSON: all `pre`, mixed `in`/`post`, all `post` |
| `scripts/check.mjs` | Run the converter on each fixture and check that the "ended now" matchup and pruning agree with `RESULT` |

## Testing before Friday
The first kickoff is **Fri 11/27, 12:00 PM ET** (Nebraska at Iowa).
1. Fixtures: today's real `pre` response, plus a hand-edited copy with a mix of `in` and `post` (scores, clock, `situation.lastPlay.probability`). Load one with `?mock=<name>` so it can be checked locally with `npm run dev`.
2. Check against a past week: point the converter at week 12 (`week=12`), which is all finals, and make sure every winner maps to the right code.
3. Friday at noon: watch the real `in` response for Nebraska–Iowa, confirm the win-chance field and abbreviations, and fix anything before Saturday's eight games.

## Addenda (Nov. 24)
- Poll once a minute while games are live; 20 s was more than needed.
- Test every UI state in this plan with mock data (`?mock=<fixture>`), take screenshots, and report them in chat.
- A one-off scheduled task checks the production site (https://2026-b1g-clinching.vercel.app) at 12:15 PM ET on Fri. Nov. 27, notes the result, and sends a push notification.

## Risks
- **The ESPN API is unofficial.** It has been stable for years, but it could change. Mitigation: fail soft (the page is today's app), the NCAA fallback, and an optional proxy.
- **Late corrections** (a final revised after review) are rare, but the feed is the source of truth, so the next poll fixes it.
- **Overtime and ties:** college football can't end tied, but a game can be tied while in progress. Count it as undecided in the "ended now" headline.
