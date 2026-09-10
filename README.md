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
- [x] **Stage 2** — App shell & routing
- [x] **Stage 3** — League dashboard
- [x] **Stage 4** — Team page
- [ ] **Stage 5** — Game replay engine (5A chart ✓, 5B canvas ✓, 5C transport ✓, 5D context ✓)
- [ ] **Stage 6** — Polish & cross-cutting
- [ ] **Stage 7** — Engineering credibility layer

## Routing and data access

Three routes — `/`, `/team/:id`, `/game/:id` — rendered inside one shared layout, with pages lazily
loaded so a league visitor never downloads the replay code.

All data access goes through [src/lib/data.ts](src/lib/data.ts). Components never call `fetch`,
never build a URL, and never see an untyped value. The cache stores the in-flight _promise_ rather
than the resolved value, so two components asking for the same file share one request; rejected
entries are evicted so failures can be retried.

`useAsync(key, load)` returns a discriminated union, so a component cannot read `data` without
first proving the request succeeded. Loading is derived from a stale key rather than stored, which
is also what prevents a slow request for one team from overwriting a fast one for the next.

### `vercel.json`

The file cannot carry comments — Vercel validates it with `additionalProperties: false`, so even a
`"comment"` key fails the build. The reasoning therefore lives here:

- **`"source": "/((?!data/).*)"`** — the SPA history fallback deliberately excludes `/data`.
  Without the exclusion a missing JSON file returns `index.html` with a 200, and the fetch layer
  reports a parse error instead of "not found". `vite preview` behaves exactly that way, which is
  why `src/lib/data.ts` _also_ rejects non-JSON content types; the two environments differ, so both
  guards are needed.
- **`stale-while-revalidate`, not `immutable`** — game files are not content-hashed and do change
  whenever the ETL is re-run, so `immutable` would strand visitors on stale data. Game files get a
  day of freshness and a week of stale-serving; the small index files get an hour.

### League dashboard

The view (sort, direction, conference, division) lives in the query string, so a filtered dashboard
is shareable and survives a refresh. Unrecognised or contradictory values fall back to defaults
rather than rendering an empty grid.

Team colours are applied by measurement, not assumption. Six teams — New Orleans, Tennessee,
Cincinnati, Cleveland, Miami and Carolina — fail WCAG AA with white text on their primary colour
(New Orleans' gold manages 1.85:1), so [src/lib/colors.ts](src/lib/colors.ts) computes the
foreground per team. Near-black primaries fall back to the secondary colour for the accent stripe,
which would otherwise be invisible on a near-black page.

Framer Motion is loaded through `LazyMotion` with only the `domAnimation` feature set, which cut
the dashboard chunk from 42.2 KB to 29.0 KB gzipped. `strict` mode makes reaching for a heavier
`motion.*` component a runtime error rather than a silent regression.

### Team page

Sections are laid out in one scroll with an anchor nav rather than behind tabs, and Games comes
first — it is the route into the replay, which is the point of the application.

Optional player fields are genuinely absent in the data: 163 players have no age and 182 no
college. `PlayerChip` builds its detail line by filtering, so a missing value leaves no separator
and no placeholder behind, and the line degrades to just a name.

nflverse returns the whole season's roster, not the 53-man active list — a team carries 95-110
names including released, reserve and practice-squad players. The roster therefore defaults to
active, with the full list one click away.

Stat bars print their scale endpoints, because a team file carries only its own numbers and there
is no league distribution here to rank against. EPA per play spans zero, so it is drawn outwards
from a zero line rather than as a short bar.

### Game replay

The replay is drawn on a `<canvas>` by a `requestAnimationFrame` loop, and the division of labour
is the whole design:

- `lib/replayCanvas.ts` is pure drawing — a context, a size and a play cursor in, pixels out. It
  never reads the clock or React state, so a frame is fully determined by its cursor position. The
  scrubber in 5C needs exactly that property.
- `lib/useReplay.ts` owns the loop. The cursor, the previous frame's timestamp and the pending
  frame handle live in refs; none of them causes a render. The two things a person can see —
  whether it is running, and which play it is on — are published through `useSyncExternalStore`,
  which fires only when the value changes.
- `components/WinProbCanvas.tsx` is an ordinary React shell that never touches the canvas.

Measured in Chrome: **60 canvas frames per second against 8 React renders per second** — 0.13
renders per frame, one per play rather than one per frame. Exactly one animation-frame callback is
ever outstanding, verified under repeated play, pause, restart and game changes.

The x axis is play order, not elapsed time. Several plays legitimately share one timestamp (a
kickoff and the snap after it are both logged at 15:00), so a 174-play game has only 146 distinct
elapsed seconds and a time axis silently collides points.

A frame may advance the cursor by at most 100ms of game time. `requestAnimationFrame` stops firing
in a hidden tab, so the first frame back can carry minutes of wall time and would otherwise skip
the replay to the final whistle; capping the step means a backgrounded tab holds its place. Device
pixel ratio is honoured but capped at 2 — backing-store pixels grow with its square, and a third
multiple buys nothing visible on a two-pixel line.

### Transport

There is exactly one playback position: a fractional play index in a ref. The canvas, the scrubber
thumb, the track fill and the readout all render from that one value, so they cannot disagree —
sampled 30 times during playback, the readout and the scrubber never diverged. Nothing derives
position from a frame count either, so a dropped frame slows the replay rather than pushing it out
of step.

The scrubber is a native `<input type="range">`: role, drag, and value announcement come for free.
Two things are added on top. Its track is continuous so the thumb can follow the cursor smoothly,
which would otherwise leave the browser moving by a hundredth of the game per arrow press, so the
arrow keys are handled explicitly — one play each, ten for page keys, Home and End for the
whistles. And `aria-valuetext` carries the period, clock, score and probability, because a bare
play index tells a screen-reader user nothing about where they are.

Seeking never changes whether the replay is running: paused stays paused, playing carries on from
the new position. A pointer drag is the exception — playback is suspended while the thumb is held,
because otherwise the target moves out from under it, and resumes on release.

Deferring a write is allowed to leave the thumb a fraction of a pixel behind, but never a whole
play behind. The readout moves the instant the cursor crosses a boundary, and a deferral that
straddled one made the slider report a different play from the text beside it — invisible on
screen at under a pixel, but a real disagreement between two things that share a source. Sampled
on every frame in-page, 1,080 frames across all three speeds, the thumb never lags the readout.

Syncing the thumb every frame is the most expensive thing outside the canvas. Measured by neutering
each write in turn on one build: moving the thumb costs about 10ms of layout per second, and
refilling the track about 17ms of style recalculation. Skipping writes finer than a thousandth of
the track — under a pixel at any width this control gets — cut both by roughly a third, to 39
layouts and 37 style recalculations a second, with no visible change to the thumb.

### Game context and key plays

`isKeyPlay` is the whole definition of a key play — a score, a turnover, or a win-probability swing
of at least ten points, decided once in `etl/build_data.py`. The UI reads the flag and never
applies a rule of its own, so the beads drawn on the curve and the markers on the timeline can
never disagree about which plays matter. Checked against the source across four games: marker count
and marker position match `isKeyPlay` exactly, 84 of them.

A game carries fifteen key plays on average and up to forty-one, so the marker rail is a single tab
stop with the arrow keys walking it, rather than forty-one stops between the scrubber and the Play
button. It sits below the track rather than on it, because markers laid over the scrubber would eat
the drag area that is the scrubber's main job.

The context box is ordered by what a reader needs first: clock and score, then down, distance and
possession, then the description, and only then win probability and EPA in the smallest, quietest
type. Down and distance are dropped entirely when the play has none — 26,227 plays across the six
seasons are kickoffs and the like — rather than printed as a placeholder that would read as missing
data instead of inapplicable.

Hovering the canvas draws a hairline and a compact tooltip; clicking seeks there. The pointer's
offset comes from the event, so hovering never measures the DOM, and the hovered play reaches React
only when it changes to a different play. Measured while playing at 2x with the pointer sweeping the
plot at 60 moves a second: **59.9fps unthrottled, 59.5fps with the CPU throttled 6x**.

Recharts was the Stage 5A baseline and is no longer shipped. It survives as a development-only
reference at `/game/<id>?baseline=1` under `npm run dev`, behind an `import.meta.env.DEV` branch
that the production build eliminates along with the dependency: the game chunk went from
**105 kB gzipped to 3.8 kB**.

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
- **The canvas replay draws imperatively; React never re-renders per frame** — the animation loop
  is an external system on the browser's frame clock, so its visible state reaches React through
  `useSyncExternalStore` rather than being mirrored into `useState`.
- **Data is validated, not assumed** — `etl/validate.py` checks all 1,693 games against the
  TypeScript contract and caught four real defects (non-chronological `play_id`, timeout rows with
  stale scores, playoff games inflating per-game rates, and a 2025 depth-chart schema change).

## Data

Six seasons, 2020-2025: **1,693 games and 273,325 plays**, plus a 32-team layer for the current
season. 1,727 files, 76.9 MB, which packs to ~13 MB in git. A game file averages 46 KB raw but
**6.6 KB gzipped**, so a replay loads on demand without a backend.

`etl/validate.py` enforces the TypeScript contract on every generated file and is itself verified
by fault injection. See [etl/README.md](etl/README.md) for the key-play rule, the missing-data
decisions, and the dataset quirks worth knowing.

## Attribution

Data from [nflverse](https://github.com/nflverse), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
