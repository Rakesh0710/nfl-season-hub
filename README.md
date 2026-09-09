# NFL Season Hub

A six-season NFL explorer where you drill from league standings down to any individual game
and watch its momentum replay in real time.

**League → Team → Game → Replay**

- **League dashboard** — all 32 teams, sortable by projected wins, last-season record, or division.
- **Team page** — roster, depth chart, draft class, projected win total, team stats, and that team's games.
- **Game replay** — an animated, scrubbable win-probability timeline with key plays marked, rendered
  on HTML Canvas at 60fps.

Data scope: **2020–2025** (six complete seasons).

## Architecture

No live server, no database. A Python ETL runs locally, emits small typed JSON files that are
committed to `public/data`, and the React app fetches them as static assets.

```
nflverse (raw play-by-play, rosters, draft, win totals)
        |
  [ Python ETL script — run once ]
        |
  trimmed, typed static JSON files
  (teams-index, team/<id>, games-index, game/<id>)
        |
    committed to /public/data
        |
  React + TypeScript app (fetches static JSON)
        |
    static deploy (Vercel)
```

## Tech stack

| Layer         | Choice                                | Why                                         |
| ------------- | ------------------------------------- | ------------------------------------------- |
| Data source   | nflverse (`nflreadpy`)                | Free, open, CC BY 4.0, 1999–2025            |
| ETL           | Python + pandas                       | Raw play-by-play → small, typed JSON        |
| Framework     | React + TypeScript + Vite             | Fast dev; TS as the data contract           |
| Routing       | React Router                          | Powers the League → Team → Game hierarchy   |
| Styling       | Tailwind CSS v4                       | Speed; easy theming with team colors        |
| Charts (v1)   | Recharts                              | Fast way to validate the win-prob data      |
| Replay engine | HTML Canvas + `requestAnimationFrame` | The 60fps flagship                          |
| UI animation  | Framer Motion                         | Page transitions, reveals, number count-ups |
| Linting       | oxlint + Prettier                     | Vite's current default linter               |
| Deploy        | Vercel (static)                       | No backend needed                           |

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run lint       # oxlint
npm run format     # prettier --write .
```

## Project structure

```
src/
  components/   reusable UI
  pages/        route-level screens
  lib/          typed data-access layer (fetch + cache)
  types/        TypeScript interfaces mirroring the JSON contract
public/data/    ETL output (static JSON, committed)
etl/            Python ETL (own virtualenv)
```

## Build progress

- [x] **Stage 0** — Foundations & setup
- [x] **Stage 1** — Data layer (ETL)
- [ ] **Stage 2** — App shell & routing
- [ ] **Stage 3** — League dashboard
- [ ] **Stage 4** — Team page
- [ ] **Stage 5** — Game replay engine
- [ ] **Stage 6** — Polish & cross-cutting
- [ ] **Stage 7** — Engineering credibility layer

## Decisions log

- **TypeScript `strict` from day one** rather than as a later pass — retrofitting strictness across
  an existing codebase costs more than writing under it from the start.
- **oxlint over ESLint** — it is what `create-vite` now scaffolds by default; same role, faster.
- **Tailwind v4 via the Vite plugin** — no `tailwind.config.js`; theme lives in CSS via `@theme`.
- **`nflreadpy` instead of `nfl_data_py`** — the latter is deprecated upstream and pins
  `pandas<2`/`numpy<2`, which have no Python 3.12 wheel, so it will not install on a current
  interpreter.
- **`projectedWins` is market-implied, not a Vegas over/under** — the nflverse win-totals dataset
  was discontinued after 2020. Each game's closing spread is converted to a win probability and
  summed across the regular season, which covers all six seasons instead of one.
- **Data is validated, not assumed** — `etl/validate.py` checks all 1,693 games against the
  TypeScript contract and caught four real defects (non-chronological `play_id`, timeout rows with
  stale scores, playoff games inflating per-game rates, and a 2025 depth-chart schema change).

## Data

Six seasons, 2020-2025: **1,693 games and 273,325 plays**, plus a 32-team layer for the current
season. 1,727 files, 76.5 MB, which packs to ~13 MB in git. A game file averages 46 KB raw but
**6.6 KB gzipped**, so a replay loads on demand without a backend.

`etl/validate.py` enforces the TypeScript contract on every generated file and is itself verified
by fault injection. See [etl/README.md](etl/README.md) for the key-play rule, the missing-data
decisions, and the dataset quirks worth knowing.

## Attribution

Data from [nflverse](https://github.com/nflverse), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
