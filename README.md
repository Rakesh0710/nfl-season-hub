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
| Data source   | nflverse (`nfl_data_py`)              | Free, open, CC BY 4.0, 1999–2025            |
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
- [ ] **Stage 1** — Data layer (ETL)
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

## Attribution

Data from [nflverse](https://github.com/nflverse), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
