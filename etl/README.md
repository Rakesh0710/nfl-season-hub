# ETL

Turns raw nflverse data into the static JSON the app reads.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build_data.py --clean    # writes ../public/data
.venv/bin/python validate.py              # checks output against the TS contract
```

Run both from the repo root. `build_data.py` takes `--seasons` and `--out`.

## Notes on the data

Things that cost time to discover, kept here so they don't have to be rediscovered:

- **`nflreadpy`, not `nfl_data_py`.** The blueprint names `nfl_data_py`, but it is deprecated
  upstream and pins `pandas<2`/`numpy<2`, neither of which has a Python 3.12 wheel — it cannot
  install on a current interpreter. `nflreadpy` is nflverse's supported successor.
- **Vegas win totals stop after 2020.** `nfldata/win_totals.csv` was discontinued, so
  `projectedWins` is *market-implied expected wins*: each game's closing spread converted to a win
  probability via the normal CDF (sigma 13.86) and summed over the regular season.
- **The depth-chart schema changed in 2025.** Through 2024 it is weekly snapshots
  (`club_code`/`depth_team`/`week`); from 2025 it is dated snapshots (`team`/`pos_abb`/`pos_rank`).
  Both are handled. For legacy seasons the *last regular-season week* is used — later weeks exist
  but only cover teams still in the playoffs.
- **The draft dataset uses Pro-Football-Reference abbreviations** (`GNB`, `KAN`, `LVR`, `NWE`,
  `NOR`, `SFO`, `TAM`, `LAR`). Normalised via `ABBR_FIXES`.
- **`play_id` is not chronological.** Penalty and replay rows can carry a later id than the snap
  they belong to, so plays are ordered by quarter then game clock.
- **Timeout rows carry stale scores** (often 0-0) and are logged as `no_play`. They are dropped,
  and a running max over the score guards against any remaining lag.
- **`football_name` is the first name**, not the full name.
- Records and per-game stat rates are **regular season only**, so they stay comparable across
  teams; postseason games still get replays.
- 2020 has 16-game regular seasons; BUF and CIN played 16 in 2022 (the cancelled game).

Data from [nflverse](https://github.com/nflverse), CC BY 4.0.
