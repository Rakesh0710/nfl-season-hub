# ETL — the data layer

Converts raw nflverse data into the small, typed static JSON the frontend reads.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build_data.py --clean    # writes ../public/data
.venv/bin/python validate.py              # enforces the TS contract
```

Run both from the repo root.

## Output

```
public/data/
  meta.json                     1 file    freshness, season completeness, which
                                          seasons have a team layer
  teams-index.json              1 file    league dashboard identity, current season
  standings.json                1 file    192 rows: record and expected wins,
                                          every team, every season
  games-index.json              1 file    every game, all six seasons
  team/<SEASON>/<ID>.json       192       one team in one season: record, roster,
                                          depth chart, draft, stats, games
  player/<PLAYER_ID>.json       2274      bio, career, every season week by week
  players-index.json            1 file    the search index
  game/<GAME_ID>.json           1695      the replay fuel
```

The **team layer covers every season complete enough to describe** — one directory per season,
one file per team, everything in it from that year. A season is described only once it is
finished or has passed `PROMOTE_MIN_PLAYED` (64 games); until then it has replays but no squad,
and `meta.teamSeasons` says so. `teams-index.json` still describes the current season alone, and
its `lastSeason` is the regular-season record of the year before it.

## The key-play rule

`isKeyPlay` is true when **any** of these hold — all thresholds are constants at the top of
`build_data.py`:

1. the home win probability moved at least `KEY_PLAY_WP_SWING` (0.10) from the previous play
2. the play scored a touchdown
3. the play was a turnover (interception or lost fumble)
4. the play was a made field goal

Rule 1 catches drama the box score misses, like a stop on 4th and goal. Rules 2–4 guarantee every
score and giveaway is marked even in a blowout where the needle no longer moves. This flags about
**9.5% of plays**, averaging 15 per game.

## What `clockSeconds` means

**Seconds remaining in `quarter`, counting down.** 900 at the start of a regulation quarter, 600 at
the start of overtime, 0 at its end. It is _not_ elapsed time and _not_ whole-game time.

For a whole-game timeline axis, derive elapsed seconds:

```
quarter <= 4 -> (quarter - 1) * 900 + (900 - clockSeconds)
quarter >= 5 -> 3600 + (quarter - 5) * 600 + (600 - clockSeconds)
```

Whole-game time is deliberately _not_ stored, to keep game files to the contract's fields only.

## Missing-data decisions

- Optional contract fields (`number?`, `age?`, `college?`, `status?`, `down?`, `distance?`, `epa?`)
  are **omitted entirely** when unknown.
- `distance` is emitted only alongside a `down`. Kickoffs and extra points carry `ydstogo = 0`
  upstream, which would otherwise produce a meaningless `distance: 0` with no down.
- `-0.0` is collapsed to `0.0`. `null` does not satisfy `number | undefined` under strict
  TypeScript, so an absent key is the only encoding that typechecks.
- Required string fields fall back to `""`, never `null` — a few draft picks have no listed
  position or college.
- Required stat fields fall back to `0` when a team has no qualifying plays.
- `NaN` and `Infinity` are converted to `None` on the way out, and `json.dumps(allow_nan=False)`
  makes any survivor a hard build error rather than invalid JSON.
- `homeWinProb` is clamped to 0..1.
- `age` is computed against September 1 of the season, and rejected outside 15–60.

## Dataset quirks worth knowing

Things that cost real time to discover:

- **`nflreadpy`, not `nfl_data_py`.** The blueprint names `nfl_data_py`, but it is deprecated
  upstream and pins `pandas<2`/`numpy<2`, neither of which has a Python 3.12 wheel — it cannot
  install on a current interpreter. `nflreadpy` is nflverse's supported successor. Every blueprint
  function has an equivalent (`import_pbp_data` → `load_pbp`, and so on).
- **Vegas win totals stop after 2020.** `nfldata/win_totals.csv` was discontinued, so
  `projectedWins` is _market-implied expected wins_: each game's closing spread converted to a win
  probability via the normal CDF (`MARGIN_SIGMA` 13.86) and summed over the regular season.
  Verified empirically that a positive `spread_line` means the home team is favored.
- **The depth-chart schema changed in 2025.** Through 2024 it is weekly snapshots
  (`club_code`/`depth_team`/`week`); from 2025 it is dated snapshots (`team`/`pos_abb`/`pos_rank`).
  Both are handled. For legacy seasons the **last regular-season week** is used — later weeks exist
  but cover only teams still in the playoffs, which left 30 of 32 teams chartless.
- **The draft dataset uses Pro-Football-Reference abbreviations** (`GNB`, `KAN`, `LVR`, `NWE`,
  `NOR`, `SFO`, `TAM`, `LAR`). Normalised through `ABBR_FIXES`, which also covers relocations.
  Before this, 8 teams per season had an empty draft class.
- **`play_id` is not chronological.** Penalty and replay-review rows can carry a later id than the
  snap they belong to, which made replay scores jump backwards. Plays are ordered by quarter then
  game clock instead.
- **Timeout rows carry stale scores** (often 0-0) and are logged as `no_play` — about 2,200 per
  season. They are dropped, and a running max over the score guards against any remaining lag.
- **`football_name` is the first name**, not the full name.
- **Records and per-game rates are regular season only**, so they stay comparable; postseason games
  still get replays. Including playoff plays had inflated KC's 2023 offense to 444 yds/game against
  an official 344.
- 2020 had 16-game regular seasons; BUF and CIN played 16 in 2022 (the cancelled game).
- **Postseason overtime is 15 minutes, regular-season overtime is 10.** Both appear in the data.
- `load_rosters` returns the **full season roster**, including players later cut (`status: "CUT"`),
  so a team carries 95-110 players rather than a 53-man active roster.
- **polars, not pandas.** `nflreadpy` returns polars frames natively, so every transform here is
  polars and pandas is not a dependency. Converting frames back to pandas would add cost and no
  benefit.

## Validation

`validate.py` covers the nine required checks and refuses to pass on extra or misspelled fields.
It also verifies that its own schemas still agree with `src/types/nfl.ts`, because those schemas
are a hand-written mirror: if the two drift, every other check silently validates the wrong shape.

The suite is verified by fault injection — **16 deliberate corruptions, 16 caught**: missing team,
duplicate team id, missing required field, null in an optional slot, malformed game id, duplicate
game id, out-of-range win probability, shuffled play order, dangling game reference, literal `NaN`,
wrong runtime type, unexpected field, `distance` without `down`, a `posteam` not in the game, an
overtime clock exceeding its game type, and a missing `gameType`.

Data from [nflverse](https://github.com/nflverse), CC BY 4.0.
